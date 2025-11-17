// backend/src/middleware/rbac.js
import { pool } from '../config/db.js';

/**
 * RBAC Middleware Factory
 * 
 * Usage in routes:
 *   router.get('/admin/users', authMiddleware, rbac('admin'), userController.getAllUsers);
 *   router.post('/posts', authMiddleware, rbac(['admin', 'editor']), postController.create);
 * 
 * @param {string|string[]} allowedRoles - Role(s) allowed to access
 * @returns {Function} Express middleware
 */
export const rbac = (allowedRoles) => {
  // Normalize to array
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) {
  return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // 1. Fetch user role from DB (cached in req.user, but verify)
      const [rows] = await pool.execute(
        'SELECT role FROM users WHERE id = ?',
        [userId]
      );

      if (rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
      }

      const userRole = rows[0].role;

      // 2. Check if user has required role
      if (!roles.includes(userRole)) {
        return res.status(403).json({
          error: 'Access denied',
          required: roles,
          current: userRole,
        });
      }

      // 3. Optional: Log access (audit trail)
      await logAccess(req, userRole);

      next();
    } catch (err) {
      console.error('RBAC error:', err);
      res.status(500).json({ error: 'Access control error' });
    }
  };
};

// ---------------------------------------------------------------------------
// Optional: Permission-based RBAC (advanced)
// ---------------------------------------------------------------------------
/**
 * Permission-based RBAC
 * 
 * Define permissions in DB:
 *   permissions: { user: ['read', 'write'], post: ['create', 'delete'] }
 * 
 * @param {string} resource - e.g., 'user', 'post'
 * @param {string} action - e.g., 'read', 'create'
 */
export const rbacPermission = (resource, action) => {
  return async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    try {
      const [rows] = await pool.execute(
        `SELECT permissions FROM role_permissions rp
         JOIN users u ON u.role = rp.role_name
         WHERE u.id = ?`,
        [userId]
      );

      if (rows.length === 0) {
        return res.status(403).json({ error: 'No permissions defined' });
      }

      const permissions = JSON.parse(rows[0].permissions || '{}');
      const allowed = permissions[resource]?.includes(action);

      if (!allowed) {
        return res.status(403).json({
          error: 'Permission denied',
          required: `${resource}:${action}`,
        });
      }

      next();
    } catch (err) {
      console.error('RBAC permission error:', err);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

// ---------------------------------------------------------------------------
// Helper: Log Access
// ---------------------------------------------------------------------------
const logAccess = async (req, role) => {
  const details = {
    method: req.method,
    path: req.originalUrl,
    role,
    ip: req.ip,
  };

  await pool.execute(
    `INSERT INTO logs (user_id, event_type, ip_address, user_agent, details)
     VALUES (?, 'rbac_access', ?, ?, ?)`,
    [req.user.id, req.ip, req.headers['user-agent'], JSON.stringify(details)]
  );

  if (global.emitLogEvent) {
    global.emitLogEvent({
      user_id: req.user.id,
      event_type: 'rbac_access',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      details,
      timestamp: new Date().toISOString(),
    });
  }
};