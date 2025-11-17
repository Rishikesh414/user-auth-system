// backend/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { config } from '../config/env.js';
import { getUserFromToken } from '../controllers/sessionController.js';

// ---------------------------------------------------------------------------
// Main Auth Middleware
// ---------------------------------------------------------------------------
export const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    // 1. Verify JWT
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    req.token = token; // for logging

    // 2. Check if session is revoked
    const [sessionRows] = await pool.execute(
      'SELECT id FROM sessions WHERE refresh_token = ? AND expires_at > NOW()',
      [token]
    );

    if (sessionRows.length === 0) {
      return res.status(401).json({ error: 'Session expired or revoked' });
    }

    // 3. Get full user
    const user = await getUserFromToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', err);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// ---------------------------------------------------------------------------
// Optional: Admin-Only Middleware
// ---------------------------------------------------------------------------
export const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ---------------------------------------------------------------------------
// Optional: Auto-Refresh on Expiry (for long-lived sessions)
// ---------------------------------------------------------------------------
export const autoRefreshMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret, { ignoreExpiration: true });
    const now = Math.floor(Date.now() / 1000);

    // If token expires in < 5 min, refresh
    if (decoded.exp - now < 300) {
      const [session] = await pool.execute(
        'SELECT refresh_token FROM sessions WHERE refresh_token = ? AND expires_at > NOW()',
        [token]
      );

      if (session.length > 0) {
        const newToken = jwt.sign(
          { id: decoded.id },
          config.jwt.accessSecret,
          { expiresIn: config.jwt.accessExpiry }
        );

        res.setHeader('X-New-Access-Token', newToken);
      }
    }
  } catch (err) {
    // Ignore errors, just proceed
  }

  next();
};