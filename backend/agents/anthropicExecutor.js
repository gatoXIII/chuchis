/**
 * anthropicExecutor.js
 * Único punto de contacto con la API de Anthropic.
 *
 * Modelos:
 *   • claude-sonnet-4-6         → workout_structure, nutrition (razonamiento complejo)
 *   • claude-haiku-4-5-20251001 → workout_day, engagement, social, debate, evaluation, supplement
 *
 * Costo estimado por rutina completa: ~$0.004 USD
 */

const Anthropic = require('@anthropic-ai/sdk');

// ── Configuración dinámica ────────────────────────────────────────────────────
const getApiKey = () => process.env.ANTHROPIC_API_KEY || '';
const getMaxConcurrency = () => parseInt(process.env.ANTHROPIC_MAX_CONCURRENCY || '3', 10);
const getMaxRetries = () => parseInt(process.env.ANTHROPIC_MAX_RETRIES || '3', 10);
const getCbThreshold = () => parseInt(process.env.ANTHROPIC_CB_THRESHOLD || '5', 10);
const getCbRecoveryMs = () => parseInt(process.env.ANTHROPIC_CB_RECOVERY_MS || '30000', 10);

// Modelos correctos según requerimiento del usuario
const getModelSonnet = () => (process.env.ANTHROPIC_MODEL_SONNET || 'claude-sonnet-4-6').trim();
const getModelHaiku = () => (process.env.ANTHROPIC_MODEL_HAIKU || 'claude-haiku-4-5-20251001').trim();

/**
 * Routing de modelo por tipo de tarea.
 * sonnet → razonamiento clínico complejo (una sola llamada por rutina)
 * haiku  → generación formateada repetitiva (4-6 llamadas por rutina, 5-10x más barato)
 */
const TASK_MODEL_ROUTING = {
    workout: 'sonnet',  // legacy completo
    workout_structure: 'sonnet',  // decisión clínica del split ← UNA SOLA llamada cara
    workout_day: 'haiku',   // ejercicios por día ← barato y repetitivo
    nutrition: 'sonnet',  // cálculos metabólicos con adaptación cultural
    supplement: 'haiku',   // protocolo de suplementación ← simple y formateado
    engagement: 'haiku',
    social: 'haiku',
    debate: 'haiku',
    evaluation: 'haiku',
};

/**
 * Límite de tokens de salida por tipo de tarea.
 */
const MAX_TOKENS_MAP = {
    workout: 4096,
    workout_structure: 4096,  // Incrementado para evitar truncamiento en observaciones extensas
    workout_day: 4096,  // ejercicios de un día en JSON (incrementado para evitar cortes)
    nutrition: 4096,  // plan semanal completo
    supplement: 2048,  // protocolo de suplementos
    engagement: 512,
    social: 512,
    debate: 1024,
    evaluation: 1024,
};

// ── Estado interno ────────────────────────────────────────────────────────────
let _running = 0;
const _queue = [];
let _cbFailures = 0;
let _cbOpenUntil = 0;

// Auditoría de tokens (costo en sesión)
const _tokenUsage = { input: 0, output: 0, calls: 0, estimatedCostUSD: 0 };

// Precios aproximados por millón de tokens (abril 2025)
const PRICING = {
    sonnet: { input: 3.0, output: 15.0 }, // $/M tokens
    haiku: { input: 0.25, output: 1.25 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const isCircuitOpen = () => {
    if (_cbFailures >= getCbThreshold() && Date.now() < _cbOpenUntil) return true;
    if (_cbOpenUntil > 0 && Date.now() >= _cbOpenUntil) { _cbFailures = 0; _cbOpenUntil = 0; }
    return false;
};

const recordSuccess = () => { _cbFailures = 0; };
const recordFailure = () => {
    _cbFailures++;
    if (_cbFailures >= getCbThreshold()) {
        _cbOpenUntil = Date.now() + getCbRecoveryMs();
        console.error(`[AnthropicExecutor] ⛔ Circuit OPEN. Bloqueado por ${getCbRecoveryMs() / 1000}s`);
    }
};

// ── Dispatch ──────────────────────────────────────────────────────────────────
const dispatch = () => {
    while (_queue.length > 0 && _running < getMaxConcurrency()) {
        const { task, resolve, reject } = _queue.shift();
        _running++;
        executeWithRetry(task)
            .then(resolve)
            .catch(reject)
            .finally(() => { _running--; dispatch(); });
    }
};

// ── Llamada real a Anthropic ──────────────────────────────────────────────────
const callAnthropic = async (task) => {
    const { systemPrompt, userPrompt, expectedFormat, timeoutMs, modelTier, taskType } = task;

    const model = modelTier === 'sonnet' ? getModelSonnet() : getModelHaiku();
    const maxTokens = MAX_TOKENS_MAP[taskType] || 1024;
    const client = new Anthropic({ apiKey: getApiKey() });

    console.log(`[AnthropicExecutor] → ${taskType} | modelo: ${model} | max_tokens: ${maxTokens}`);

    const systemContent = expectedFormat === 'json'
        ? `${systemPrompt || ''}\n\nIMPORTANTE: Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin bloques markdown.`.trim()
        : (systemPrompt || '');

    const requestPromise = client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature: 0.1,
        system: systemContent,
        messages: [{ role: 'user', content: userPrompt }],
    });

    const timeoutPromise = new Promise((_, rej) =>
        setTimeout(() => rej(new Error(`TIMEOUT (>${timeoutMs}ms) en tarea ${taskType}`)), timeoutMs)
    );

    const response = await Promise.race([requestPromise, timeoutPromise]);

    const content = response.content?.[0]?.text;
    if (!content) throw new Error('Anthropic retornó contenido vacío');

    // Auditoría de costos
    const inTok = response.usage?.input_tokens || 0;
    const outTok = response.usage?.output_tokens || 0;
    const tier = modelTier === 'sonnet' ? 'sonnet' : 'haiku';
    const cost = (inTok * PRICING[tier].input + outTok * PRICING[tier].output) / 1_000_000;

    _tokenUsage.input += inTok;
    _tokenUsage.output += outTok;
    _tokenUsage.calls += 1;
    _tokenUsage.estimatedCostUSD += cost;

    console.log(`[AnthropicExecutor] ✓ ${taskType} | ${inTok}↑ ${outTok}↓ | ~$${cost.toFixed(6)} | sesión: ~$${_tokenUsage.estimatedCostUSD.toFixed(4)}`);

    return content;
};

// ── Reintentos con backoff exponencial ────────────────────────────────────────
const executeWithRetry = async (task, attempt = 1) => {
    try {
        const result = await callAnthropic(task);
        recordSuccess();
        return result;
    } catch (err) {
        const maxRetries = getMaxRetries();
        console.warn(`[AnthropicExecutor] ⚠️ ${task.taskType} intento ${attempt}/${maxRetries}: ${err.message}`);

        if (attempt >= maxRetries) {
            recordFailure();
            throw err;
        }

        const backoff = Math.min(Math.pow(2, attempt) * 2000, 30000);
        console.log(`[AnthropicExecutor] ⏳ Reintentando en ${backoff / 1000}s...`);
        await sleep(backoff);
        return executeWithRetry(task, attempt + 1);
    }
};

// ── API pública ───────────────────────────────────────────────────────────────
const enqueue = (task) => {
    if (!getApiKey()) {
        return Promise.reject(new Error('[AnthropicExecutor] ANTHROPIC_API_KEY no configurada en .env'));
    }
    if (isCircuitOpen()) {
        return Promise.reject(new Error(
            `[AnthropicExecutor] Circuit OPEN. Reintenta en ${Math.ceil((_cbOpenUntil - Date.now()) / 1000)}s`
        ));
    }
    if (!task.modelTier) {
        task.modelTier = TASK_MODEL_ROUTING[task.taskType] || 'haiku';
    }

    return new Promise((resolve, reject) => {
        _queue.push({ task, resolve, reject });
        dispatch();
    });
};

const getStatus = () => ({
    provider: 'anthropic',
    running: _running,
    queued: _queue.length,
    max_concurrency: getMaxConcurrency(),
    models: { sonnet: getModelSonnet(), haiku: getModelHaiku() },
    circuit_breaker: {
        failures: _cbFailures,
        threshold: getCbThreshold(),
        open: isCircuitOpen(),
        open_until: _cbOpenUntil > Date.now() ? new Date(_cbOpenUntil).toISOString() : null,
    },
    token_usage_session: _tokenUsage,
});

const _resetForTesting = () => {
    _running = 0;
    _queue.length = 0;
    _cbFailures = 0;
    _cbOpenUntil = 0;
    Object.assign(_tokenUsage, { input: 0, output: 0, calls: 0, estimatedCostUSD: 0 });
};

module.exports = { enqueue, getStatus, _resetForTesting };