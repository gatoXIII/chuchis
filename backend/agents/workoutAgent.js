/**
 * workoutAgent.js (refactorizado)
 *
 * Responsabilidad ÚNICA: construir el payload estructurado para el agente.
 * NO llama a Ollama. Entrega el payload al AgentOrchestrator.
 *
 * Flujo:
 *   1. Recibe clientState
 *   2. Construye systemPrompt + userPrompt
 *   3. Define fallbackFn determinístico
 *   4. Llama a submitTask() del orquestador
 *   5. Retorna el plan parseado (o fallback si Ollama falla)
 */

const { submitTask } = require('./agentOrchestrator');

const generateWorkoutPlan = async (clientState) => {
  const {
    objetivo = 'hipertrofia',
    experiencia = 'intermedio',
    dias_disponibles = 4,
    equipamiento = 'gimnasio',
    peso = 80,
    fatiga_percibida = 5,
    adherencia = 0.85,
    limitaciones = [],
    max_estimates = {},
    week_on_block = 1,
  } = clientState;

  const limitacionesStr = limitaciones.length > 0
    ? `Limitaciones físicas: ${limitaciones.join(', ')}.`
    : 'Sin lesiones ni limitaciones.';

  const estimadosStr = Object.keys(max_estimates).length > 0
    ? `Estimados de 1RM actuales: ${JSON.stringify(max_estimates)}.`
    : '';

  const systemPrompt = `Eres un entrenador personal experto en kinesiología con +15 años de experiencia.
Creas rutinas biomecánicamente correctas y adaptadas al estado fisiológico actual del cliente.
REGLA ABSOLUTA: Responde ÚNICAMENTE con JSON válido sin markdown, sin texto extra, sin explicaciones.`;

  const userPrompt = `Genera una rutina de entrenamiento semanal:

PERFIL:
- Objetivo: ${objetivo}
- Experiencia: ${experiencia}
- Días disponibles: ${dias_disponibles}
- Equipamiento: ${equipamiento}
- Peso: ${peso}kg
- Fatiga percibida (1-10): ${fatiga_percibida}
- Adherencia reciente: ${Math.round(adherencia * 100)}%
- Semana en bloque: ${week_on_block}
- ${limitacionesStr}
- ${estimadosStr}

REGLAS DE ADAPTACIÓN:
- Si fatiga > 7: reduce volumen total 20%, prioriza compuestos básicos
- Si adherencia < 0.70: simplifica split y reduce días en 1
- Split por días: 2=FullBody, 3=PPL, 4=Upper/Lower, 5-6=PPL, 7=PPL+Cardio

Responde EXACTAMENTE con este JSON:
{
  "split_name": "string",
  "dias_totales": number,
  "volumen_ajustado": boolean,
  "razon_ajuste": "string o null",
  "dias": [
    {
      "dia": number,
      "nombre": "string",
      "musculos_foco": ["string"],
      "ejercicios": [
        {
          "nombre": "string",
          "series": number,
          "repeticiones": "string",
          "peso_sugerido_kg": number_o_null,
          "rpe_objetivo": number,
          "nota": "string"
        }
      ]
    }
  ],
  "notas_generales": "string"
}`;

  return submitTask({
    taskType: 'workout',
    systemPrompt,
    userPrompt,
    expectedFormat: 'json',
    fallbackFn: () => generateFallbackWorkout(dias_disponibles, objetivo, fatiga_percibida),
  });
};

// ── Fallback determinístico ───────────────────────────────────────────────────
const generateFallbackWorkout = (dias, objetivo, fatiga) => {
  const splits = { 2: 'Full Body', 3: 'PPL', 4: 'Upper/Lower', 5: 'PPL', 6: 'PPL Doble' };
  const reducido = fatiga >= 7;
  return {
    split_name: splits[Math.min(dias, 6)] || 'Upper/Lower',
    dias_totales: dias,
    volumen_ajustado: reducido,
    razon_ajuste: reducido ? 'Fatiga alta. Volumen reducido 20%.' : null,
    dias: [{
      dia: 1,
      nombre: 'Sesión Base',
      musculos_foco: ['Full Body'],
      ejercicios: [
        { nombre: 'Sentadilla', series: reducido ? 3 : 4, repeticiones: '8-10', peso_sugerido_kg: null, rpe_objetivo: 7, nota: 'Espalda recta, rodillas hacia afuera' },
        { nombre: 'Press de Banca', series: reducido ? 3 : 4, repeticiones: '8-10', peso_sugerido_kg: null, rpe_objetivo: 7, nota: 'Agarre a anchura de hombros' },
        { nombre: 'Remo con Barra', series: 3, repeticiones: '10-12', peso_sugerido_kg: null, rpe_objetivo: 7, nota: 'Retracción escapular al subir' },
      ],
    }],
    notas_generales: `[FALLBACK] Plan base. Ollama no disponible. Objetivo: ${objetivo}.`,
  };
};

module.exports = { generateWorkoutPlan };