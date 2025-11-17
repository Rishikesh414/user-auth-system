// backend/src/routes/session.js
import express from 'express';
import sessionController from '../controllers/sessionController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// User routes
router.get('/my', sessionController.getMySessions);
router.delete('/revoke/:sessionId', sessionController.revokeSession);
router.delete('/revoke-all-other', sessionController.revokeAllOtherSessions);

// Admin routes (extra check in controller)
router.get('/all', sessionController.getAllActiveSessions);
router.delete('/admin/revoke/:sessionId', sessionController.adminRevokeSession);

export default router;