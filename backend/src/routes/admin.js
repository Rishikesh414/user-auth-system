// backend/src/routes/admin.js
import express from 'express';
import adminController from '../controllers/adminController.js';
import { authMiddleware } from '../middleware/auth.js';
import { rbac } from '../middleware/rbac.js';
import { rateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// 1. GLOBAL: Auth + RBAC (Admin Only)
// ---------------------------------------------------------------------------
router.use(authMiddleware);        // Validate JWT
router.use(rbac('admin'));         // Enforce admin role

// Optional: Rate limit sensitive admin actions
const adminRateLimiter = rateLimiter.login; // Reuse strict limiter (5/min)

// ---------------------------------------------------------------------------
// 2. DASHBOARD & ANALYTICS
// ---------------------------------------------------------------------------
router.get('/dashboard/metrics', adminController.getDashboardMetrics);
router.get('/analytics/login-trends', adminController.getLoginTrends);

// ---------------------------------------------------------------------------
// 3. USER MANAGEMENT
// ---------------------------------------------------------------------------
router.get('/users', adminController.getUsers);
router.patch('/users/:userId', adminRateLimiter, adminController.updateUser);

// ---------------------------------------------------------------------------
// 4. AUDIT LOGS
// ---------------------------------------------------------------------------
router.get('/logs', adminController.getLogs);

// ---------------------------------------------------------------------------
// 5. SECURITY ACTIONS
// ---------------------------------------------------------------------------
router.post('/block-ip', adminRateLimiter, adminController.blockIP);

// ---------------------------------------------------------------------------
// 6. REPORTING
// ---------------------------------------------------------------------------
router.get('/reports/generate', adminController.generateReport);

export default router;