// backend/src/routes/auth.js
import express from 'express';
import authController from '../controllers/authController.js';
import sessionController from '../controllers/sessionController.js';
import userController from '../controllers/userController.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { detectAnomaly } from '../middleware/anomalyMiddleware.js'; // Fixed
import { rbac } from '../middleware/rbac.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// 1. PUBLIC: Authentication (Rate-limited)
// ---------------------------------------------------------------------------
router.post('/register', rateLimiter.login, authController.register);
router.get('/verify-email', authController.verifyEmail);
router.post('/login', rateLimiter.login, authController.login); // ← anomaly + MFA inside
router.post('/refresh', rateLimiter.refresh, authController.refreshToken);
router.post('/logout', authController.logout); // Public (can be called with token)
router.post('/forgot-password', rateLimiter.login, authController.forgotPassword);
router.post('/reset-password', rateLimiter.login, authController.resetPassword);

// ---------------------------------------------------------------------------
// 2. PROTECTED: User Profile, Sessions, MFA
// ---------------------------------------------------------------------------
router.use(authMiddleware); // ← All below require login

// MFA
router.get('/mfa/status', authController.getMFAStatus);
router.post('/mfa/enable', authController.enableMFA);
router.post('/mfa/verify', authController.verifyMFA);
router.post('/mfa/disable', authController.disableMFA);

// Profile
router.get('/profile', userController.getProfile);
router.patch('/profile', userController.updateProfile);
router.post('/change-password', userController.changePassword);
router.delete('/delete', userController.deleteAccount);

// Sessions
router.get('/session/my', sessionController.getMySessions);
router.delete('/session/revoke/:sessionId', sessionController.revokeSession);
router.delete('/session/revoke-all-other', sessionController.revokeAllOtherSessions);

// ---------------------------------------------------------------------------
// 3. ADMIN: User & Session Management (RBAC)
// ---------------------------------------------------------------------------
router.use(rbac('admin')); // ← Replaces adminMiddleware

// Users
router.get('/users', userController.getAllUsers);
router.patch('/users/role/:userId', userController.adminUpdateUserRole);

// Sessions (system-wide)
router.get('/sessions', sessionController.getAllActiveSessions);
router.delete('/sessions/:sessionId', sessionController.adminRevokeSession);

export default router;