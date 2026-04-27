/**
 * nutritionAgent.js (refactorizado)
 * Solo construye el payload. El AgentOrchestrator gestiona la ejecución.
 */

const { submitTask } = require('./agentOrchestrator');

const sanitize = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/`/g, "'").replace(/\${/g, "${");
};

const generateMealPlan = async (nutritionProfile) => {
  const {
    kcal_target = 2200,
    protein_g = 140,
    fat_percentage = 0.25,
    carbs_g = 220,
    region = 'mexico',
    restricciones = [],
    objetivo = 'perdida_grasa',
    nombre_cliente = 'el cliente',
    alimentos_disponibles = [],
    edad = 30,
    sexo = 'no especificado',
    peso = 80,
    altura_cm = 175,
    condicion_medica = '',
    lesiones_pasadas = '',
    dolor_frecuente = '',
    estilo_vida = 'sedentario',
    horas_sueno = '7-8',
    nivel_estres = 'medio',
    experiencia = 'intermedio',
    tiempo_sesion = '60 min',
    dias_disponibles = 4,
    porcentaje_grasa_inicial = null,
    medida_cintura = null,
    medida_cadera = null,
    observaciones_posturales = '',
    nivel_compromiso = 'medio',
    meta_especifica = '',
  } = nutritionProfile;

  const restriccionesStr = Array.isArray(restricciones) && restricciones.length > 0
    ? `Restricciones/alergias: ${restricciones.join(', ')}.`
    : 'Sin restricciones alimenticias.';

  const disponiblesStr = Array.isArray(alimentos_disponibles) && alimentos_disponibles.length > 0
    ? `Preferencias del cliente: ${alimentos_disponibles.join(', ')}.`
    : '';

  const systemPrompt = `Eres un nutriólogo clínico especializado en nutrición deportiva y gastronomía latinoamericana.
Regla 80/20: 80% estructura científica validada, 20% adaptación cultural local.
REGLA ABSOLUTA: Responde ÚNICAMENTE con JSON válido sin texto adicional.`;

  const userPrompt = `Diseña un plan de alimentación semanal EXCLUSIVO y PERSONALIZADO para ${sanitize(nombre_cliente)}.

PERFIL CLÍNICO, BIOMÉTRICO Y HÁBITOS (REVISIÓN OBLIGATORIA):
- Edad: ${edad} años | Sexo: ${sanitize(sexo)} | Peso Actual: ${peso} kg | Altura: ${altura_cm} cm
${porcentaje_grasa_inicial ? `- Grasa estimada: ${porcentaje_grasa_inicial}%` : ''}
${medida_cintura || medida_cadera ? `- Medidas (cintura/cadera): ${medida_cintura || '--'}cm / ${medida_cadera || '--'}cm` : ''}
- Estilo de Vida (actividad diaria): ${sanitize(estilo_vida)} | Horas de sueño: ${sanitize(horas_sueno)}h | Nivel de estrés: ${sanitize(nivel_estres)}
- Condición Médica Activa: ${sanitize(condicion_medica) || 'Ninguna (Si hay diabetes, hipertensión u otra, ADAPTA el plan estrictamente a esto)'}
- Lesiones Pasadas / Dolores: ${sanitize(lesiones_pasadas) || 'Ninguna'} / ${sanitize(dolor_frecuente) || 'Ninguno'}
- Entrenamiento: ${dias_disponibles} días/sem, ${sanitize(tiempo_sesion)} por sesión. Experiencia: ${sanitize(experiencia)}.
- Objetivo Principal: ${sanitize(objetivo)}
${meta_especifica ? `- Meta personal: ${sanitize(meta_especifica)}` : ''}
- Compromiso del cliente: ${sanitize(nivel_compromiso)}

MACROS OBJETIVO (80% Científico):
- Calorías: ${kcal_target} kcal/día
- Proteína: ${protein_g}g/día
- Grasa: ${Math.round(kcal_target * fat_percentage / 9)}g/día (${Math.round(fat_percentage * 100)}%)
- Carbohidratos: ${carbs_g}g/día
- Objetivo: ${objetivo}

ADAPTACIÓN CULTURAL (20%):
- Región: ${region}
- ${restriccionesStr}
- ${disponiblesStr}

INSTRUCCIONES CLÍNICAS ESTRICTAS:
1. 7 días con desayuno, colación 1, almuerzo, colación 2, cena.
2. Cada comida con desglose de macros aproximado.
3. Ingredientes típicos de ${region} (México: tortilla, frijoles, chiles, aguacate).
4. Sugiere intercambios si no consigue algún ingrediente.
5. EXIGENCIA: Para lograr más rápido el objetivo deseado, es vital tener en cuenta estas restricciones alimentarias: ${restriccionesStr}. Bajo NINGUNA circunstancia incluyas alimentos restringidos.
6. En "nota_nutricionista", redacta un análisis médico y nutricional EXPLICANDO al cliente cómo esta distribución calórica y selección de alimentos ayuda específicamente a SU CONDICIÓN MÉDICA, EDAD, SEXO y OBJETIVOS. No uses frases prefabricadas.

Responde EXACTAMENTE con este JSON:
{
  "resumen_diario": { "kcal": number, "proteina_g": number, "carbs_g": number, "grasa_g": number },
  "estructura_comidas": {
    "desayuno":   { "kcal": number, "opciones": ["string"] },
    "colacion_1": { "kcal": number, "opciones": ["string"] },
    "almuerzo":   { "kcal": number, "opciones": ["string"] },
    "colacion_2": { "kcal": number, "opciones": ["string"] },
    "cena":       { "kcal": number, "opciones": ["string"] }
  },
  "plan_semanal": [
    {
      "dia": "string",
      "desayuno": "string",
      "colacion_1": "string",
      "almuerzo": "string",
      "colacion_2": "string",
      "cena": "string",
      "total_kcal_estimado": number
    }
  ],
  "intercambios_sugeridos": ["string"],
  "notas_culturales": "string",
  "nota_nutricionista": "string"
}`;

  return submitTask({
    taskType: 'nutrition',
    systemPrompt,
    userPrompt,
    expectedFormat: 'json',
    fallbackFn: () => generateFallbackMealPlan(kcal_target, protein_g, region),
  });
};

// ── Fallback determinístico ───────────────────────────────────────────────────
const generateFallbackMealPlan = (kcal, proteina, region) => ({
  resumen_diario: {
    kcal,
    proteina_g: proteina,
    carbs_g: Math.round((kcal * 0.45) / 4),
    grasa_g: Math.round((kcal * 0.25) / 9),
  },
  estructura_comidas: {
    desayuno: { kcal: Math.round(kcal * 0.25), opciones: ['Huevos revueltos + tortilla de maíz + frijoles + aguacate'] },
    colacion_1: { kcal: Math.round(kcal * 0.10), opciones: ['Fruta + puño de nueces'] },
    almuerzo: { kcal: Math.round(kcal * 0.35), opciones: ['Pechuga de pollo + arroz + frijoles + ensalada'] },
    colacion_2: { kcal: Math.round(kcal * 0.10), opciones: ['Yogur natural + fruta'] },
    cena: { kcal: Math.round(kcal * 0.20), opciones: ['Pescado al limón + verduras al vapor + tortilla'] },
  },
  plan_semanal: [],
  intercambios_sugeridos: ['Tortilla de maíz > tortilla de harina', 'Frijoles negros > bayos (mejor perfil proteico)'],
  notas_culturales: `Adaptado para región: ${region}`,
  nota_nutricionista: '[FALLBACK] Plan base. Ollama no disponible.',
});

module.exports = { generateMealPlan };