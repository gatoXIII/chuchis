/**
 * supplementAgent.js
 * Genera un protocolo de suplementación personalizado.
 * 
 * IMPORTANTE: La suplementación es de APOYO, no es el foco principal.
 * Solo recomienda suplementos con evidencia científica sólida (Tier 1-2).
 * 
 * Modelo: haiku (simple, formateado, protocolo estructurado)
 */

const { submitTask } = require('./agentOrchestrator');

const sanitize = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/`/g, "'").replace(/\${/g, "${");
};

const generateSupplementPlan = async (clientProfile) => {
    const {
        objetivo = 'hipertrofia',
        experiencia = 'intermedio',
        condicion_medica = '',
        restricciones_alimentarias = [],
        presupuesto = 'medio',      // bajo | medio | alto
        usa_suplementos_ahora = [], // lista de suplementos actuales
        edad = 25,
        nombre_cliente = 'el cliente',
        sexo = 'no especificado',
        altura_cm = 175,
        lesiones_pasadas = '',
        dolor_frecuente = '',
        estilo_vida = 'sedentario',
        horas_sueno = '7-8',
        nivel_estres = 'medio',
        tiempo_sesion = '60 min',
        dias_disponibles = 4,
        porcentaje_grasa_inicial = null,
        medida_cintura = null,
        medida_cadera = null,
        observaciones_posturales = '',
        nivel_compromiso = 'medio',
        meta_especifica = '',
    } = clientProfile;

    const condicionStr = condicion_medica
        ? `IMPORTANTE - Condición médica: ${condicion_medica}. Evitar suplementos contraindicados.`
        : 'Sin condiciones médicas conocidas.';

    const suplementosActuales = Array.isArray(usa_suplementos_ahora) && usa_suplementos_ahora.length > 0
        ? `Ya usa: ${usa_suplementos_ahora.join(', ')}.`
        : 'No usa suplementos actualmente.';

    const presupuestoMap = {
        bajo: 'Máximo 3 suplementos, prioriza los más costo-efectivos (creatina + proteína).',
        medio: 'Máximo 5 suplementos balanceando costo-beneficio.',
        alto: 'Hasta 7 suplementos, puede incluir opciones premium si hay evidencia.',
    };

    const systemPrompt = `Eres un Médico Deportivo Especialista en Farmacología y Nutricionista Clínico.
Tu filosofía: la suplementación es OPTIMIZACIÓN, no magia.
ADVERTENCIA CRÍTICA: Debes evaluar de forma GLOBAL todos los aspectos del paciente (edad, peso, condiciones médicas, lesiones). Si omites un detalle vital (ej. que es hipertenso, diabético o tiene daño renal) puedes recetar un suplemento que lo lleve a un colapso. Esta rutina es única y exclusivamente para EL CLIENTE ACTIVO. NO alucines y NO uses respuestas genéricas pregrabadas.
Solo recomiendas suplementos con evidencia científica SÓLIDA.
SIEMPRE indica que el médico debe revisar si hay condición médica.
REGLA ABSOLUTA: Responde ÚNICAMENTE con JSON válido.`;

    const userPrompt = `Diseña un protocolo de suplementación clínico y personalizado EXCLUSIVAMENTE para ${sanitize(nombre_cliente)}:

PERFIL CLÍNICO Y BIOMÉTRICO COMPLETO (EVALÚA CUIDADOSAMENTE):
- Edad: ${edad} años | Sexo: ${sanitize(sexo)} | Peso: ${peso}kg | Estatura: ${altura_cm}cm
${porcentaje_grasa_inicial ? `- Grasa estimada: ${porcentaje_grasa_inicial}%` : ''}
- Estilo de Vida: ${sanitize(estilo_vida)} | Sueño: ${sanitize(horas_sueno)}h | Estrés: ${sanitize(nivel_estres)}
- ${condicionStr}
- Lesiones Pasadas / Dolores: ${sanitize(lesiones_pasadas) || 'Ninguna'} / ${sanitize(dolor_frecuente) || 'Ninguno'}
- Restricciones alimentarias: ${restricciones_alimentarias.map(r => sanitize(r)).join(', ') || 'Ninguna'}
- ${suplementosActuales}
- Meta Principal: ${sanitize(objetivo)}
${meta_especifica ? `- Meta personal: ${sanitize(meta_especifica)}` : ''}
- Presupuesto: ${presupuestoMap[presupuesto] || presupuestoMap.medio}

INSTRUCCIONES:
1. Solo suplementos con evidencia científica SÓLIDA.
2. Indica EXACTAMENTE en qué momento del día/rutina es recomendable tomarlo.
3. Dosis basada en evidencia.
4. Incluye "por_que_es_recomendable" (justificación adaptada al paciente).
5. Incluye "peligros_o_efectos" (riesgos, daño renal, interacciones).
6. Incluye "por_que_no_deberias" (escenarios o razones para evitarlo).
7. Incluye "por_que_si_debes" (el beneficio exacto para SU objetivo).
8. Estima costo mensual en MXN.

Responde EXACTAMENTE con este JSON:
{
  "resumen_ejecutivo": "string (Obligatorio: Escribe un resumen de 3-4 líneas justificando este stack BASADO EN LA CONDICIÓN MÉDICA, EDAD, SEXO, ESTRÉS y METAS de este cliente específico)",
  "disclaimer": "string (siempre incluir nota de consultar médico considerando sus patologías)",
  "suplementos_prioritarios": [
    {
      "nombre": "string",
      "dosis": "string (ej: 5g/día)",
      "momento_de_toma": "string (ej: post-entreno con comida)",
      "duracion": "string",
      "por_que_es_recomendable": "string",
      "peligros_o_efectos": "string (daños hepáticos, renales, insomnio, etc)",
      "por_que_no_deberias": "string (situaciones donde NO conviene tomarlo)",
      "por_que_si_debes": "string (razón definitiva para este paciente)",
      "costo_mensual_mxn_aprox": number,
      "evidencia": "Tier 1 | Tier 2"
    }
  ],
  "suplementos_opcionales": [
    {
      "nombre": "string",
      "dosis": "string",
      "momento_de_toma": "string",
      "por_que_es_recomendable": "string",
      "peligros_o_efectos": "string",
      "por_que_no_deberias": "string",
      "por_que_si_debes": "string",
      "costo_mensual_mxn_aprox": number,
      "evidencia": "Tier 2 | Tier 3"
    }
  ],
  "suplementos_a_evitar": ["string"],
  "stack_diario_resumen": {
    "manana": ["string"],
    "pre_entreno": ["string"],
    "post_entreno": ["string"],
    "noche": ["string"]
  },
  "costo_total_mensual_mxn": number,
  "notas_especiales": "string"
}`;

    return submitTask({
        taskType: 'supplement',
        systemPrompt,
        userPrompt,
        expectedFormat: 'json',
        fallbackFn: () => generateFallbackSupplementPlan(objetivo, presupuesto),
    });
};

// ── Fallback determinístico ───────────────────────────────────────────────────
const generateFallbackSupplementPlan = (objetivo, presupuesto) => ({
    resumen_ejecutivo: `Stack básico para ${objetivo}. Evidencia sólida, costo-efectivo.`,
    disclaimer: '[FALLBACK] Este plan fue generado sin IA. Consulta con un médico o nutricionista antes de iniciar cualquier suplementación.',
    suplementos_prioritarios: [
        {
            nombre: 'Creatina Monohidrato',
            dosis: '5g/día',
            momento: 'Post-entreno o en cualquier momento con comida',
            duracion: 'Uso continuo (sin necesidad de ciclos)',
            razon_cientifica: 'Aumenta los depósitos de fosfocreatina muscular, mejorando el rendimiento en esfuerzos de alta intensidad. El suplemento más estudiado en deportes.',
            costo_mensual_mxn_aprox: 280,
            evidencia: 'Tier 1',
        },
        {
            nombre: 'Proteína Whey',
            dosis: '25-30g por batido (según déficit proteico del día)',
            momento: 'Post-entreno o entre comidas para alcanzar meta proteica',
            duracion: 'Uso continuo según necesidad',
            razon_cientifica: 'Complemento proteico de alto valor biológico. Solo necesario si no alcanzas la meta proteica con alimentos.',
            costo_mensual_mxn_aprox: 600,
            evidencia: 'Tier 1',
        },
    ],
    suplementos_opcionales: [
        {
            nombre: 'Omega-3 (EPA+DHA)',
            dosis: '2-3g/día de EPA+DHA combinado',
            momento: 'Con comida que contenga grasa',
            razon_cientifica: 'Reduce marcadores de inflamación y puede mejorar la recuperación muscular.',
            costo_mensual_mxn_aprox: 350,
            evidencia: 'Tier 2',
        },
    ],
    suplementos_a_evitar: ['Quemadores de grasa con estimulantes', 'HGH precursores', 'SARMs', 'Productos con claims no regulados'],
    stack_diario_resumen: {
        manana: ['Omega-3 (con desayuno)'],
        pre_entreno: [],
        post_entreno: ['Creatina 5g', 'Whey 25-30g si aplica'],
        noche: [],
    },
    costo_total_mensual_mxn: 1230,
    notas_especiales: 'Plan fallback. Consulta con profesional de salud.',
});

module.exports = { generateSupplementPlan };