/**
 * workoutAgent.js (Split & Merge - prompts profesionales)
 *
 * Cada sub-prompt mantiene el contexto clínico completo (lesiones, estrés,
 * biomecánica) para que la prescripción sea profesional y diferenciada.
 *
 * Optimizado para llama3 8B en CPU mediante:
 *   - Split & Merge: divide la generación en llamadas pequeñas
 *   - num_ctx: 2048 (configurado en ollamaExecutor)
 *   - num_predict ajustado por tipo de sub-tarea
 *
 * Flujo:
 *   1. ESTRUCTURA: split, días, músculos foco, ajustes de volumen
 *   2. DÍA x N: ejercicios con justificación biomecánica
 *   3. MERGE local en JS (sin IA)
 */

const { submitTask } = require('./agentOrchestrator');

const sanitize = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/`/g, "'").replace(/\${/g, "${");
};

const generateWorkoutPlan = async (clientState, draftPlan = null) => {
  const {
    objetivo = 'hipertrofia',
    experiencia = 'intermedio',
    dias_disponibles = 4,
    equipamiento = 'gym',
    peso = 80,
    fatiga_percibida = 5,
    adherencia = 0.85,
    limitaciones = [],
    max_estimates = {},
    week_on_block = 1,
    lesiones_pasadas = '',
    dolor_frecuente = '',
    condicion_medica = '',
    estilo_vida = 'sedentario',
    horas_sueno = '7-8',
    nivel_estres = 'medio',
    tipo_entrenamiento_preferido = 'pesas',
    ejercicios_disgusto = '',
    edad = 30,
    altura_cm = 175,
    sexo = 'no especificado',
    tiempo_sesion = '60 min',
    porcentaje_grasa_inicial = null,
    medida_cintura = null,
    medida_cadera = null,
    observaciones_posturales = '',
    nivel_compromiso = 'medio',
    meta_especifica = '',
  } = clientState;

  // ── Contexto clínico GLOBAL ──
  const fichaClinica = [
    `PERFIL BASE: Edad: ${edad} años | Sexo: ${sanitize(sexo)} | Estatura: ${altura_cm} cm | Peso actual: ${peso} kg`,
    porcentaje_grasa_inicial ? `Grasa estimada: ${porcentaje_grasa_inicial}%` : null,
    medida_cintura || medida_cadera ? `Medidas (cintura/cadera): ${medida_cintura || '--'}cm / ${medida_cadera || '--'}cm` : null,
    `OBJETIVO PRINCIPAL: ${sanitize(objetivo)}`,
    meta_especifica ? `Objetivo personal/meta específica: ${sanitize(meta_especifica)}` : null,
    `Experiencia en entrenamiento: ${sanitize(experiencia)}`,
    `Días disponibles por semana: ${dias_disponibles} días`,
    `Tiempo disponible por sesión: ${sanitize(tiempo_sesion)}`,
    `Equipo disponible: ${sanitize(equipamiento)}`,
    `Estado actual (fatiga: ${fatiga_percibida}/10, adherencia previa: ${Math.round(adherencia * 100)}%, semana del bloque: ${week_on_block})`,
    `Hábitos: Nivel de actividad diaria: ${sanitize(estilo_vida)} | Horas de sueño: ${sanitize(horas_sueno)}h | Estrés: ${sanitize(nivel_estres)} | Compromiso: ${sanitize(nivel_compromiso)}`,
    observaciones_posturales ? `Postura/Observaciones: ${sanitize(observaciones_posturales)}` : null,
    Array.isArray(limitaciones) && limitaciones.length > 0 ? `Limitaciones/Tags: ${limitaciones.map(l => sanitize(l)).join(', ')}` : null,
    lesiones_pasadas ? `Lesiones previas y cirugías: ${sanitize(lesiones_pasadas)}` : null,
    dolor_frecuente ? `Dolores frecuentes reportados: ${sanitize(dolor_frecuente)}` : null,
    condicion_medica ? `CONDICIÓN MÉDICA ACTIVA: ${sanitize(condicion_medica)}` : null,
    `Preferencia de entrenamiento: ${sanitize(tipo_entrenamiento_preferido)}`,
    ejercicios_disgusto ? `Ejercicios a evitar absolutamente: ${sanitize(ejercicios_disgusto)}` : null,
    max_estimates && Object.keys(max_estimates).length > 0 ? `Fuerza (1RM): ${JSON.stringify(max_estimates)}` : null,
  ].filter(Boolean).join('. ');

  const reglasSeguridad = nivel_estres === 'alto' || parseFloat(horas_sueno) < 6
    ? 'REGLA: Estrés alto o sueño bajo detectado. Reduce RPE en 1 punto y volumen en 20%.'
    : '';

  // ══════════════════════════════════════════════════════════════════════
  // PASO 1: ESTRUCTURA (split, distribución muscular, notas clínicas)
  // ══════════════════════════════════════════════════════════════════════
  let structure = null;

  if (draftPlan && draftPlan.split_name && Array.isArray(draftPlan.dias)) {
    console.log(`[WorkoutAgent] 🔄 Reanudando generación de rutina desde un draft previo (Paso 1 Omitido)`);
    structure = { ...draftPlan };
  } else {
    console.log(`[WorkoutAgent] 🚀 Iniciando generación de rutina: Paso 1/2 - Estructura (Progreso: 0%)`);
    structure = await submitTask({
      taskType: 'workout_structure',
      systemPrompt: 'Eres un Kinesiólogo Clínico y Entrenador de Élite Deportivo. Tu deber es diseñar programas estrictamente basados en evidencia científica y en la evaluación exhaustiva del perfil médico, físico y biomecánico del cliente. BAJO NINGUNA CIRCUNSTANCIA debes alucinar o entregar información genérica. Todo debe ser diseñado considerando GLOBALMENTE las enfermedades, lesiones, postura, y nivel de estrés que se reportan.',
      userPrompt: `Diseña la estructura de un split de entrenamiento de ${dias_disponibles} días semanales.

EXIGENCIA CLÍNICA ABSOLUTA: 
Revisa TODOS los aspectos de la siguiente Ficha Clínica. Si omites condiciones como diabetes, hipertensión o dolores previos, puedes poner en riesgo la integridad del cliente. Esta rutina es única y exclusiva para ESTE cliente particular.

FICHA CLÍNICA COMPLETA DEL CLIENTE: 
${fichaClinica}

REGLAS ADICIONALES:
${reglasSeguridad}

Responde con este JSON (sin ejercicios, solo la estructura del bloque):
{
  "split_name": "nombre del split",
  "dias_totales": ${parseInt(dias_disponibles) || 4},
  "bloque_semanas": 4,
  "volumen_ajustado": false,
  "razon_ajuste": "razón detallada basada en el perfil",
  "dias": [{"dia":1,"nombre":"Nombre del día","musculos_foco":["músculo1","músculo2"]}],
  "notas_generales": "Obligatorio: Escribe una observación clínica extensa de por qué este split específico se adapta a SU EDAD, HORAS DE SUEÑO, CONDICIONES MÉDICAS, LESIONES y OBJETIVO."
}`,
      expectedFormat: 'json',
      fallbackFn: () => {
        throw new Error('Motor de IA no disponible para estructura de rutina. Reintenta en un momento.');
      },
    });

    console.log(`[WorkoutAgent] ✓ Estructura generada: ${structure.split_name} (${structure.dias?.length || 0} días) (Progreso: 20%)`);

    if (!structure.dias || !Array.isArray(structure.dias) || structure.dias.length === 0) {
      throw new Error('La IA devolvió una estructura sin días válidos.');
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PASO 2: EJERCICIOS POR DÍA (con justificación biomecánica)
  // ══════════════════════════════════════════════════════════════════════
  const diasCompletos = draftPlan && Array.isArray(draftPlan.dias)
    ? draftPlan.dias.filter(d => Array.isArray(d.ejercicios) && d.ejercicios.length > 0)
    : [];

  let is_partial = false;

  for (const dayInfo of structure.dias) {
    // Si este día ya fue completado previamente, lo saltamos
    if (diasCompletos.some(d => d.dia === dayInfo.dia)) {
      console.log(`[WorkoutAgent] ⏭️ Omitiendo Día ${dayInfo.dia} (Ya fue completado en un draft previo)`);
      continue;
    }

    const musculos = Array.isArray(dayInfo.musculos_foco)
      ? dayInfo.musculos_foco.join(', ')
      : dayInfo.musculos_foco || 'general';

    // Generar contexto de los días anteriores para mantener coherencia en la rutina completa
    let contextoDiasPrevios = '';
    if (diasCompletos.length > 0) {
      contextoDiasPrevios = `\nIMPORTANTE PARA COHERENCIA: Para evitar repeticiones innecesarias, ten en cuenta que el paciente YA TIENE los siguientes ejercicios prescritos en los días previos:\n`;
      diasCompletos.forEach(d => {
        const ejNombres = d.ejercicios.map(e => e.nombre).join(', ');
        contextoDiasPrevios += `- Día ${d.dia} (${d.nombre}): ${ejNombres}\n`;
      });
    }

    try {
      const dayResult = await submitTask({
        taskType: 'workout_day',
        systemPrompt: 'Eres un Kinesiólogo Clínico y Entrenador de Élite Deportivo. Prescribes ejercicios seguros con justificación biomecánica estricta. Analiza de manera global las enfermedades, lesiones, biometría y nivel de experiencia del cliente activo para ofrecer un programa que NO colapse su sistema nervioso ni empeore patologías. Sin alucinaciones.',
        userPrompt: `Prescribe de 4 a 6 ejercicios estrictamente seguros para: ${dayInfo.nombre} (${musculos}).

EXIGENCIA CLÍNICA ABSOLUTA: 
Considera la totalidad de la Ficha Clínica. Las explicaciones que des al cliente deben hacer mención de SU EDAD, SU CONDICIÓN MÉDICA, y SUS DOLORES o POSTURA para que el usuario entienda por qué se programó ese ejercicio específicamente. No uses frases prefabricadas.

FICHA CLÍNICA COMPLETA DEL CLIENTE: 
${fichaClinica}
${reglasSeguridad}
${contextoDiasPrevios}

Reglas biomecánicas:
- Si hay lesión/dolor: sustituye por ejercicio que no estrese esa zona.
- Prioriza seguridad sobre carga.
- Incluye explicación técnica de POR QUÉ eliges cada ejercicio para este paciente.

JSON:
{"ejercicios":[{"nombre":"string","series":3,"repeticiones":"8-10","peso_sugerido_kg":null,"rpe_objetivo":7,"nota":"indicación técnica","explicacion_tecnica":"razón biomecánica para este paciente","explicacion_cliente":"explicación motivadora para el cliente"}]}`,
        expectedFormat: 'json',
        fallbackFn: () => {
          throw new Error(`Motor de IA no disponible para Día ${dayInfo.dia}.`);
        },
      });

      const ejercicios = dayResult.ejercicios || dayResult || [];

      diasCompletos.push({
        dia: dayInfo.dia,
        nombre: dayInfo.nombre,
        musculos_foco: dayInfo.musculos_foco,
        ejercicios: Array.isArray(ejercicios) ? ejercicios : [],
      });

      // Calcular progreso: empieza en 20% y el 80% restante se divide por los días
      const remainingProgress = 80;
      const progressPerDay = remainingProgress / structure.dias.length;
      const currentProgress = Math.round(20 + (progressPerDay * diasCompletos.length));

      console.log(`[WorkoutAgent] ✓ Día ${dayInfo.dia} completado: ${dayInfo.nombre} → ${Array.isArray(ejercicios) ? ejercicios.length : 0} ejercicios (Progreso: ${currentProgress}%)`);
    } catch (err) {
      console.error(`[WorkoutAgent] ⚠️ Error crítico generando el Día ${dayInfo.dia}: ${err.message}. Entregando resultado parcial.`);
      is_partial = true;
      break; // Abortamos los días restantes y devolvemos el draft
    }
  }

  if (is_partial) {
    console.log(`[WorkoutAgent] ⏸️ Generación de rutina pausada (Progreso Parcial). Entregando borrador.`);
  } else {
    console.log(`[WorkoutAgent] 🎉 Generación de rutina finalizada exitosamente (Progreso: 100%)`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // PASO 3: MERGE LOCAL (sin IA, solo ensamblaje en JS)
  // ══════════════════════════════════════════════════════════════════════
  return {
    split_name: structure.split_name,
    dias_totales: structure.dias_totales || dias_disponibles,
    bloque_semanas: structure.bloque_semanas || 4,
    volumen_ajustado: structure.volumen_ajustado || false,
    razon_ajuste: structure.razon_ajuste || null,
    dias: diasCompletos,
    notas_generales: structure.notas_generales || '',
    is_partial: is_partial,
  };
};

module.exports = { generateWorkoutPlan };