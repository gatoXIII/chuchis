/**
 * routineController.js
 *
 * Mejoras vs versión anterior:
 * 1. SSE (Server-Sent Events) para progreso en tiempo real
 * 2. Checkpoint/resume para rutina Y nutrición Y suplementos
 * 3. Generación del plan completo: entreno + nutrición + suplementos en un solo endpoint
 * 4. Estado de progreso guardado en DB con porcentaje
 */

const Routine = require('../models/Routine');
const ClientProfile = require('../models/ClientProfile');
const RoutineAssignment = require('../models/RoutineAssignment');
const { getClientState } = require('../services/clientStateService');
const { generateWorkoutPlan } = require('../agents/workoutAgent');
const { generateMealPlan } = require('../agents/nutritionAgent');
const { generateSupplementPlan } = require('../agents/supplementAgent');
const { submitTask, progressEmitter } = require('../agents/agentOrchestrator');

// ── Helper: texto task ────────────────────────────────────────────────────────
const runTextTask = (taskType, systemPrompt, userPrompt) =>
  submitTask({
    taskType, systemPrompt, userPrompt,
    expectedFormat: 'text',
    fallbackFn: () => '[Sin respuesta del agente. Revisa el historial manualmente.]',
  });

// ── Helper: calcular porcentaje de completitud del plan ───────────────────────
const calcPlanProgress = (routine) => {
  const plan = routine.plan;
  if (!plan) return 0;

  let total = 3;   // workout + nutrition + supplement
  let done = 0;

  if (plan.split_name && plan.dias?.length > 0) {
    const diasEsperados = plan.dias_totales || plan.dias.length;
    const diasCompletos = plan.dias.filter(d => d.ejercicios?.length > 0).length;
    done += (diasCompletos / diasEsperados) * (plan.is_partial ? 0.8 : 1);
  }
  if (plan.nutrition_plan?.resumen_diario) done += 1;
  if (plan.supplement_plan?.suplementos_prioritarios) done += 1;

  return Math.round((done / total) * 100);
};

// ─────────────────────────────────────────────────────────────────────────────
// SSE endpoint: GET /api/agents/routine/progress/:jobId
// Emite eventos mientras el job está corriendo
// ─────────────────────────────────────────────────────────────────────────────
exports.streamProgress = (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: 'connected', jobId });

  const handler = (data) => send({ type: 'progress', ...data });
  progressEmitter.on(`progress:${jobId}`, handler);

  req.on('close', () => {
    progressEmitter.off(`progress:${jobId}`, handler);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Plan completo: entreno + nutrición + suplementos
// POST /api/agents/routine/full-plan/:clientId
// ─────────────────────────────────────────────────────────────────────────────
exports.createFullPlan = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { draft_plan, routine_id, presupuesto_suplementos = 'medio', generate_nutrition = true, generate_supplements = true } = req.body;

    const jobId = `job_${Date.now()}`;

    // Responder inmediatamente con jobId para que el frontend conecte SSE
    res.json({ success: true, jobId, message: 'Generación iniciada. Conéctate a /progress/:jobId para el progreso en tiempo real.' });

    // Correr la generación en background
    setImmediate(async () => {
      try {
        // 1. Obtener estado del cliente
        const state = await getClientState(clientId);
        if (!state) {
          progressEmitter.emit(`progress:${jobId}`, { type: 'error', message: 'Cliente no encontrado' });
          return;
        }

        progressEmitter.emit(`progress:${jobId}`, {
          type: 'progress', step: 'Inicio', percent: 5,
          message: `Analizando expediente de ${state.profile_info?.nombre || 'cliente'}...`
        });

        const mergedState = { ...state.profile_info, ...state.current_state };

        // 2. Buscar o crear la Routine en DB (checkpoint)
        let routine;
        if (routine_id) {
          routine = await Routine.findById(routine_id);
        }
        if (!routine) {
          routine = new Routine({
            tipo: 'ia_pura', estado: 'propuesta',
            trainer_id: req.user?.id || 'system',
            client_id: clientId,
            tenant_id: req.user?.gym_id || 'default',
            perfil_snapshot: mergedState,
            plan: { progress_percent: 5 },
          });
          await routine.save();
        }

        progressEmitter.emit(`progress:${jobId}`, {
          type: 'progress', step: 'Entrenamiento', percent: 10,
          message: 'Diseñando estructura del bloque de entrenamiento...', routine_id: routine._id
        });

        // 3. WORKOUT (con checkpoint/resume)
        let workoutPlan;
        try {
          workoutPlan = await generateWorkoutPlan(mergedState, draft_plan);

          routine.plan = {
            ...routine.plan,
            ...workoutPlan,
            progress_percent: 40,
          };
          await routine.save();

          progressEmitter.emit(`progress:${jobId}`, {
            type: 'progress', step: 'Entrenamiento', percent: 40,
            message: `✓ ${workoutPlan.split_name} generado (${workoutPlan.dias?.length || 0} días)`,
            is_partial: workoutPlan.is_partial,
          });

          if (workoutPlan.is_partial) {
            progressEmitter.emit(`progress:${jobId}`, {
              type: 'partial', step: 'Entrenamiento', percent: 40,
              message: 'Rutina parcial guardada. Puedes continuar desde aquí.',
              routine_id: routine._id
            });
          }
        } catch (err) {
          progressEmitter.emit(`progress:${jobId}`, {
            type: 'warning', step: 'Entrenamiento', percent: 30,
            message: `Usando fallback para entrenamiento: ${err.message}`
          });
        }

        // 4. NUTRITION (con checkpoint)
        if (generate_nutrition) {
          progressEmitter.emit(`progress:${jobId}`, {
            type: 'progress', step: 'Nutrición', percent: 50,
            message: 'Calculando macros y plan alimentario...'
          });

          const nutritionProfile = {
            ...mergedState,
            kcal_target: mergedState.tdee_adjusted || 2200,
            protein_g: Math.round((mergedState.tdee_adjusted || 2200) * 0.30 / 4),
            fat_percentage: 0.25,
            carbs_g: Math.round((mergedState.tdee_adjusted || 2200) * 0.45 / 4),
            region: mergedState.region_cultural || 'mexico',
            nombre_cliente: state.profile_info?.nombre || 'el cliente',
            alimentos_disponibles: mergedState.alimentos_preferidos || [],
          };

          try {
            const nutritionPlan = await generateMealPlan(nutritionProfile);
            routine.plan = { ...routine.plan, nutrition_plan: nutritionPlan, progress_percent: 70 };
            await routine.save();

            progressEmitter.emit(`progress:${jobId}`, {
              type: 'progress', step: 'Nutrición', percent: 70,
              message: `✓ Plan nutricional generado (${nutritionPlan.resumen_diario?.kcal || '?'} kcal/día)`
            });
          } catch (err) {
            progressEmitter.emit(`progress:${jobId}`, {
              type: 'warning', step: 'Nutrición', percent: 65,
              message: `Plan nutricional con fallback: ${err.message}`
            });
          }
        } else {
          routine.plan = { ...routine.plan, progress_percent: 70 };
          await routine.save();
        }

        // 5. SUPLEMENTACIÓN (con checkpoint)
        if (generate_supplements) {
          progressEmitter.emit(`progress:${jobId}`, {
            type: 'progress', step: 'Suplementación', percent: 75,
            message: 'Diseñando protocolo de suplementación basado en evidencia...'
          });

          const supplementProfile = {
            ...mergedState,
            presupuesto: presupuesto_suplementos,
            nombre_cliente: state.profile_info?.nombre || 'el cliente',
          };

          try {
            const supplementPlan = await generateSupplementPlan(supplementProfile);
            routine.plan = { ...routine.plan, supplement_plan: supplementPlan, progress_percent: 95 };
            await routine.save();

            progressEmitter.emit(`progress:${jobId}`, {
              type: 'progress', step: 'Suplementación', percent: 95,
              message: `✓ Protocolo de suplementación: ${supplementPlan.suplementos_prioritarios?.length || 0} suplementos prioritarios`
            });
          } catch (err) {
            progressEmitter.emit(`progress:${jobId}`, {
              type: 'warning', step: 'Suplementación', percent: 90,
              message: `Suplementación con fallback: ${err.message}`
            });
          }
        }

        // 6. Completar
        routine.plan = { ...routine.plan, progress_percent: 100 };
        routine.estado = 'propuesta';
        await routine.save();

        progressEmitter.emit(`progress:${jobId}`, {
          type: 'completed', step: 'Finalizado', percent: 100,
          message: '¡Plan completo generado exitosamente!',
          routine_id: routine._id,
          routine,
        });

      } catch (err) {
        console.error('[createFullPlan] Error en background:', err);
        progressEmitter.emit(`progress:${jobId}`, {
          type: 'error', message: err.message
        });
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Rutina solo para cliente nuevo
// ─────────────────────────────────────────────────────────────────────────────
exports.createRoutineNewClient = async (req, res) => {
  try {
    const { profile_info, client_id, draft_plan, routine_id } = req.body;
    const plan = await generateWorkoutPlan(
      { ...profile_info, fatiga_percibida: 5, adherencia: 1.0 },
      draft_plan
    );

    let routine;
    if (routine_id) {
      routine = await Routine.findById(routine_id);
      if (!routine) return res.status(404).json({ error: 'Rutina no encontrada' });
      routine.plan = plan;
    } else {
      routine = new Routine({
        tipo: 'cliente_nuevo', trainer_id: req.user.id, client_id: client_id || null,
        tenant_id: req.user.gym_id, perfil_snapshot: profile_info, plan, estado: 'propuesta',
      });
    }
    await routine.save();
    res.json({ routine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
exports.createRoutineExisting = async (req, res) => {
  try {
    const { id } = req.params;
    const { draft_plan, routine_id, ...otherBodyProps } = req.body;
    const state = await getClientState(id);
    if (!state) return res.status(404).json({ error: 'Estado del cliente no encontrado' });

    const mergedState = { ...state.profile_info, ...state.current_state, ...otherBodyProps };
    const plan = await generateWorkoutPlan(mergedState, draft_plan);

    let routine;
    if (routine_id) {
      routine = await Routine.findById(routine_id);
      if (!routine) return res.status(404).json({ error: 'Rutina no encontrada' });
      routine.plan = plan;
    } else {
      routine = new Routine({
        tipo: 'ia_pura', trainer_id: req.user.id, client_id: id,
        tenant_id: req.user.gym_id, perfil_snapshot: mergedState, plan, estado: 'propuesta',
      });
    }
    await routine.save();
    res.json({ routine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
exports.createRoutineAnonymous = async (req, res) => {
  try {
    const { dias_disponibles, equipamiento, objetivo, experiencia, draft_plan, routine_id } = req.body;
    const plan = await generateWorkoutPlan(
      { dias_disponibles, equipamiento, objetivo, experiencia, fatiga_percibida: 5, adherencia: 1.0 },
      draft_plan
    );

    let routine;
    if (routine_id) {
      routine = await Routine.findById(routine_id);
      if (!routine) return res.status(404).json({ error: 'Rutina no encontrada' });
      routine.plan = plan;
    } else {
      routine = new Routine({
        tipo: 'sin_cliente', trainer_id: req.user.id,
        tenant_id: req.user.gym_id, perfil_snapshot: req.body, plan, estado: 'propuesta',
      });
    }
    await routine.save();
    res.json({ routine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
exports.createRoutineCoachDraft = async (req, res) => {
  try {
    const { draftText, client_id } = req.body;
    let perfil = {};
    if (client_id) {
      const state = await getClientState(client_id);
      perfil = state ? { ...state.profile_info, ...state.current_state } : {};
    }

    const evaluation = await runTextTask(
      'evaluation',
      'Eres asistente de evaluación biomecánica. Evalúa el borrador de rutina brevemente: volumen, frecuencia, intensidad. Responde en texto claro.',
      `Perfil: ${JSON.stringify(perfil)}\n\nBorrador:\n${draftText}`
    );

    const routine = new Routine({
      tipo: 'propuesta_coach', trainer_id: req.user.id, client_id: client_id || null,
      tenant_id: req.user.gym_id, perfil_snapshot: perfil, estado: 'en_debate',
      debate_log: [
        { autor: 'coach', mensaje: draftText },
        { autor: 'agente', mensaje: evaluation },
      ],
    });
    await routine.save();
    res.json({ routine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
exports.debateRoutine = async (req, res) => {
  try {
    const { id } = req.params;
    const { mensaje } = req.body;
    const routine = await Routine.findById(id);
    if (!routine) return res.status(404).json({ error: 'Rutina no encontrada' });

    routine.debate_log.push({ autor: 'coach', mensaje });
    routine.estado = 'en_debate';

    const history = routine.debate_log.map(m => `${m.autor.toUpperCase()}: ${m.mensaje}`).join('\n');
    const reply = await runTextTask(
      'debate',
      'Eres experto debatiendo con un coach sobre una rutina. Lee el historial y responde al último mensaje del coach con criterio biomecánico.',
      `Historial:\n${history}\n\nResponde al COACH:`
    );

    routine.debate_log.push({ autor: 'agente', mensaje: reply });
    await routine.save();
    res.json({ routine });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
exports.approveRoutine = async (req, res) => {
  try {
    const { id } = req.params;
    const { notas, active_week } = req.body;
    const routine = await Routine.findById(id);
    if (!routine) return res.status(404).json({ error: 'Rutina no encontrada' });

    if (routine.client_id) {
      await Routine.updateMany(
        { client_id: routine.client_id, estado: 'activa' },
        { $set: { estado: 'reemplazada' } }
      );
      const count = await Routine.countDocuments({ client_id: routine.client_id });
      routine.version = count + 1;

      if (active_week) {
        await new RoutineAssignment({
          client_id: routine.client_id, routine_id: routine._id, week_assigned: active_week,
        }).save();
      }
    }

    routine.estado = 'activa';
    if (notas) routine.notas_aprobacion = notas;
    if (active_week) routine.semana_activacion = active_week;
    await routine.save();

    res.json({ routine, message: 'Rutina activada exitosamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};