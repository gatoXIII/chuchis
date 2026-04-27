/**
 * agentOrchestrator.js
 * Gestor del ciclo de vida de tareas de agentes.
 *
 * Ciclo de vida:
 *   PENDING → RUNNING → COMPLETED | FAILED | TIMEOUT
 *
 * Nuevo: soporte para SSE (Server-Sent Events) via EventEmitter
 * para enviar progreso en tiempo real al frontend.
 */

const { enqueue } = require('./anthropicExecutor');
const { EventEmitter } = require('events');

// EventEmitter global para broadcast de progreso
const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(50);

// ── Tipos de tarea con timeouts ───────────────────────────────────────────────
const TASK_CONFIGS = {
    workout: { timeoutMs: 6 * 60 * 1000, label: 'Plan de entrenamiento' },
    workout_structure: { timeoutMs: 2 * 60 * 1000, label: 'Estructura de rutina' },
    workout_day: { timeoutMs: 3 * 60 * 1000, label: 'Día de rutina' },
    nutrition: { timeoutMs: 6 * 60 * 1000, label: 'Plan nutricional' },
    supplement: { timeoutMs: 60 * 1000, label: 'Plan de suplementación' },
    engagement: { timeoutMs: 60 * 1000, label: 'Mensaje de engagement' },
    social: { timeoutMs: 90 * 1000, label: 'Post para redes' },
    debate: { timeoutMs: 90 * 1000, label: 'Debate de rutina' },
    evaluation: { timeoutMs: 60 * 1000, label: 'Evaluación de borrador' },
};

// ── Registro de tareas activas ────────────────────────────────────────────────
const _taskRegistry = new Map();
const TASK_TTL_MS = 10 * 60 * 1000; // 10 min

const cleanupTask = (taskId) => {
    setTimeout(() => _taskRegistry.delete(taskId), TASK_TTL_MS);
};

let _seq = 0;
const generateTaskId = () => `task_${Date.now()}_${(++_seq).toString().padStart(4, '0')}`;

// ── Emitir evento de progreso ─────────────────────────────────────────────────
const emitProgress = (jobId, data) => {
    if (!jobId) return;
    progressEmitter.emit(`progress:${jobId}`, data);
};

// ── submitTask ────────────────────────────────────────────────────────────────
/**
 * @param {Object} payload
 * @param {string} payload.taskType
 * @param {string} payload.systemPrompt
 * @param {string} payload.userPrompt
 * @param {string} payload.expectedFormat  'json' | 'text'
 * @param {Function} payload.fallbackFn
 * @param {Function} [payload.parseResult]
 * @param {string} [payload.jobId]         ID del job padre (para SSE progress)
 * @param {string} [payload.progressLabel] Etiqueta para el evento de progreso
 */
const submitTask = async (payload) => {
    const {
        taskType, systemPrompt, userPrompt, expectedFormat,
        fallbackFn, parseResult, jobId, progressLabel,
    } = payload;

    const config = TASK_CONFIGS[taskType];
    if (!config) throw new Error(`[Orchestrator] Tipo de tarea desconocido: "${taskType}"`);

    const taskId = generateTaskId();
    const startedAt = Date.now();

    const record = { taskId, taskType, status: 'PENDING', startedAt, updatedAt: startedAt, result: null, error: null };
    _taskRegistry.set(taskId, record);

    const transition = (status, data = {}) => {
        Object.assign(record, { status, updatedAt: Date.now(), ...data });
        console.log(`[Orchestrator] ${statusEmoji(status)} [${taskId}] ${config.label} → ${status}`);
    };

    try {
        transition('RUNNING');

        const rawContent = await enqueue({
            taskType, systemPrompt, userPrompt, expectedFormat,
            timeoutMs: config.timeoutMs,
        });

        let parsed;
        if (parseResult) {
            parsed = parseResult(rawContent);
        } else if (expectedFormat === 'json') {
            parsed = extractAndParseJSON(rawContent, taskId);
        } else {
            parsed = rawContent;
        }

        transition('COMPLETED', { result: parsed });
        cleanupTask(taskId);

        // Emitir progreso si hay jobId
        if (jobId && progressLabel) {
            emitProgress(jobId, { step: progressLabel, status: 'completed', taskId });
        }

        return parsed;

    } catch (err) {
        const isTimeout = err.message?.includes('TIMEOUT') || err.message?.includes('Circuit OPEN');
        transition(isTimeout ? 'TIMEOUT' : 'FAILED', { error: err.message });
        cleanupTask(taskId);

        if (jobId && progressLabel) {
            emitProgress(jobId, { step: progressLabel, status: 'failed', error: err.message, taskId });
        }

        console.warn(`[Orchestrator] 🔁 [${taskId}] Ejecutando fallback para ${config.label}`);

        if (typeof fallbackFn !== 'function') {
            throw new Error(`[Orchestrator] Sin fallback para ${taskType}: ${err.message}`);
        }

        return fallbackFn();
    }
};

// ── JSON extractor robusto ────────────────────────────────────────────────────
const extractAndParseJSON = (raw, taskId) => {
    try { return JSON.parse(raw); } catch (_) { }

    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
        try { return JSON.parse(match[0]); } catch (_) { }
    }

    const cleaned = raw.replace(/```json|```/g, '').trim();
    try { return JSON.parse(cleaned); } catch (_) { }

    throw new Error(`[Orchestrator] No se pudo extraer JSON válido (taskId: ${taskId}). Raw: ${raw.substring(0, 100)}...`);
};

const statusEmoji = (s) => ({ PENDING: '⏳', RUNNING: '🔄', COMPLETED: '✅', FAILED: '❌', TIMEOUT: '⏱️' }[s] || '•');

const getTaskStatus = (taskId) => _taskRegistry.get(taskId) || null;
const getAllTasksSummary = () => {
    const tasks = [..._taskRegistry.values()];
    return {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'PENDING').length,
        running: tasks.filter(t => t.status === 'RUNNING').length,
        completed: tasks.filter(t => t.status === 'COMPLETED').length,
        failed: tasks.filter(t => t.status === 'FAILED').length,
        timeout: tasks.filter(t => t.status === 'TIMEOUT').length,
    };
};

module.exports = {
    submitTask,
    getTaskStatus,
    getAllTasksSummary,
    TASK_CONFIGS,
    progressEmitter,
};