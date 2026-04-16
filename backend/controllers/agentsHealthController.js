/**
 * agentsHealthController.js
 * Endpoint de diagnóstico: estado del OllamaExecutor + OrquestadorATasks
 * Ruta: GET /api/agents/health
 * Requiere rol trainer o superior.
 */

const { getStatus: getExecutorStatus } = require('../agents/ollamaExecutor');
const { getAllTasksSummary, TASK_CONFIGS } = require('../agents/agentOrchestrator');

exports.getAgentsHealth = async (req, res) => {
    try {
        const executor = getExecutorStatus();
        const tasks = getAllTasksSummary();

        // Verificar conectividad con Ollama
        let ollamaReachable = false;
        let ollamaModels = [];

        try {
            const ollamaUrl = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim();
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 5000);

            const tagsRes = await fetch(`${ollamaUrl}/api/tags`, { signal: ctrl.signal });
            clearTimeout(timer);

            if (tagsRes.ok) {
                const data = await tagsRes.json();
                ollamaReachable = true;
                ollamaModels = (data.models || []).map(m => m.name);
            }
        } catch (_) {
            ollamaReachable = false;
        }

        res.json({
            status: ollamaReachable ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            ollama: {
                reachable: ollamaReachable,
                url: (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim(),
                models_installed: ollamaModels,
                model_deep: executor.models.deep,
                model_fast: executor.models.fast,
            },
            executor: {
                running: executor.running,
                queued: executor.queued,
                max_concurrency: executor.max_concurrency,
                circuit_breaker: executor.circuit_breaker,
            },
            tasks: {
                ...tasks,
                task_types: Object.entries(TASK_CONFIGS).map(([type, cfg]) => ({
                    type,
                    label: cfg.label,
                    timeout_ms: cfg.timeoutMs,
                })),
            },
        });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
};