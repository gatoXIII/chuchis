/**
 * agentsController.js (actualizado)
 * Agrega endpoint para generación de plan de suplementación.
 */

const { generateWorkoutPlan } = require('../agents/workoutAgent');
const { generateMealPlan } = require('../agents/nutritionAgent');
const { generateEngagementMessage } = require('../agents/engagementAgent');
const { generateSocialPost } = require('../agents/socialAgent');
const { generateSupplementPlan } = require('../agents/supplementAgent');

exports.generateWorkout = async (req, res) => {
  try {
    const plan = await generateWorkoutPlan(req.body);
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ error: 'Error generando rutina: ' + err.message });
  }
};

exports.generateNutrition = async (req, res) => {
  try {
    const meal_plan = await generateMealPlan(req.body);
    res.json({ success: true, meal_plan });
  } catch (err) {
    res.status(500).json({ error: 'Error generando plan nutricional: ' + err.message });
  }
};

exports.generateEngagement = async (req, res) => {
  try {
    const message = await generateEngagementMessage(req.body);
    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ error: 'Error generando mensaje de engagement: ' + err.message });
  }
};

exports.generateSocial = async (req, res) => {
  try {
    const post = await generateSocialPost(req.body);
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ error: 'Error generando post social: ' + err.message });
  }
};

/**
 * POST /api/agents/supplement
 * Genera un protocolo de suplementación personalizado.
 */
exports.generateSupplement = async (req, res) => {
  try {
    const supplement_plan = await generateSupplementPlan(req.body);
    res.json({ success: true, supplement_plan });
  } catch (err) {
    res.status(500).json({ error: 'Error generando plan de suplementación: ' + err.message });
  }
};