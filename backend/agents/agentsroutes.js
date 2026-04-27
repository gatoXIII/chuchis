/**
 * agentsRoutes.js (actualizado)
 * Incluye:
 * - SSE endpoint para progreso en tiempo real
 * - Endpoint de plan completo (workout + nutrición + suplementos)
 */

const express = require('express');
const router = express.Router();
const agentsController = require('../controllers/agentsController');
const agentsHealthController = require('../controllers/agentsHealthController');
const { authenticate, isTrainer } = require('../middleware/authMiddleware');
const routineController = require('../controllers/routineController');

// ── Health check ──────────────────────────────────────────────────────────────
router.get('/health', authenticate, isTrainer, agentsHealthController.getAgentsHealth);

// ── SSE: progreso en tiempo real (NO requiere auth para simplificar) ──────────
// El jobId es único y de corta vida, seguridad suficiente
router.get('/routine/progress/:jobId', routineController.streamProgress);

// ── Plan completo (workout + nutrición + suplementos) ─────────────────────────
router.post('/routine/full-plan/:clientId', authenticate, isTrainer, routineController.createFullPlan);

// ── Agentes individuales ──────────────────────────────────────────────────────
router.post('/workout', authenticate, isTrainer, agentsController.generateWorkout);
router.post('/nutrition', authenticate, isTrainer, agentsController.generateNutrition);
router.post('/engagement', authenticate, isTrainer, agentsController.generateEngagement);
router.post('/social', authenticate, isTrainer, agentsController.generateSocial);
router.post('/supplement', authenticate, isTrainer, agentsController.generateSupplement);

// ── Rutinas especializadas ────────────────────────────────────────────────────
router.post('/routine/new-client', authenticate, isTrainer, routineController.createRoutineNewClient);
router.post('/routine/existing/:id', authenticate, isTrainer, routineController.createRoutineExisting);
router.post('/routine/anonymous', authenticate, isTrainer, routineController.createRoutineAnonymous);
router.post('/routine/coach-draft', authenticate, isTrainer, routineController.createRoutineCoachDraft);
router.post('/routine/:id/debate', authenticate, isTrainer, routineController.debateRoutine);
router.post('/routine/:id/approve', authenticate, isTrainer, routineController.approveRoutine);

module.exports = router;