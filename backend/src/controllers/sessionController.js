// backend/src/controllers/sessionController.js

import { pool } from '../config/db.js';
import { config } from '../config/env.js';
import jwt from 'jsonwebtoken';
import Logger from '../services/logger.js';

// ---------------------------------------------------------------------------
// Helper: Get user from JWT
// ---------------------------------------------------------------------------
export const getUserFromToken = async (token) => {
  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    const [rows] = await pool.execute(
      'SELECT id, username, email, role, email_verified, last_login FROM users WHERE id = ?',
      [decoded.id]
    );
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    return null;
  }
};

// ---------------------------------------------------------------------------
// 1. Get All Active Sessions for Current User
// ---------------------------------------------------------------------------
export const getMySessions = async (req, res) => {
  const userId = req.user.id;

  try {
    const [sessions] = await pool.execute(
      `SELECT 
         id,
         ip_address,
         user_agent,
         created_at,
         expires_at,
         refresh_token
       FROM sessions 
       WHERE user_id = ? AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [userId]
    );

    const currentToken = req.headers['authorization']?.split(' ')[1];
    const formatted = sessions.map(s => ({
      ...s,
      is_current: s.refresh_token === currentToken,
      refresh_token: undefined, // Never expose
    }));

    // Emit to user (real-time update)
    global.emitSessionEvent?.list(userId, formatted);

    res.json({ sessions: formatted });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

// ---------------------------------------------------------------------------
// 2. Revoke Specific Session
// ---------------------------------------------------------------------------
export const revokeSession = async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.id;

  try {
    // Find session (security: make sure it belongs to the user)
    const session = await Session.findOne({
      where: {
        id: sessionId,
        user_id: userId,
        revoked_at: null, // not already revoked
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found or already revoked' });
    }

    // Revoke it using the model method
    await Session.revoke(sessionId);

    // Log the event (your existing logEvent or new Log.createLog)
    await Logger.sessionRevoked(userId, sessionId, req.ip, req.headers['user-agent']);

    // Real-time: Notify all devices (user sees session disappear instantly)
    global.emitLogEvent?.({
      event_type: 'session_revoked',
      user_id: userId,
      session_id: sessionId,
      revoked_by: 'user',
      timestamp: new Date().toISOString(),
    });

    res.json({ message: 'Session revoked successfully' });
  } catch (err) {
    console.error('Revoke session error:', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
};

// ---------------------------------------------------------------------------
// 3. Revoke All Other Sessions (Keep Current)
// ---------------------------------------------------------------------------
export const revokeAllOtherSessions = async (req, res) => {
  const userId = req.user.id;
  const currentToken = req.headers['authorization']?.split(' ')[1];

  if (!currentToken) {
    return res.status(400).json({ error: 'No token provided' });
  }

  try {
    // Find the current session by refresh_token
    const currentSession = await Session.findOne({
      where: {
        user_id: userId,
        refresh_token: currentToken,
        revoked_at: null, // not already revoked
        expires_at: { [require('sequelize').Op.gt]: new Date() },
      },
    });

    if (!currentSession) {
      return res.status(400).json({ error: 'Current session not found or already expired' });
    }

    // Revoke all OTHER active sessions (using model method)
    await Session.revokeAllOther(userId, currentSession.id);

    // Log the action with rich context
    await Logger.log({
      userId,
      eventType: Logger.EVENT_TYPES.SESSIONS_REVOKED_ALL_OTHER,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Real-time event: instantly update all devices
    global.emitLogEvent?.({
      event_type: 'sessions_revoked_all_other',
      user_id: userId,
      current_session_id: currentSession.id,
      revoked_by: 'user',
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: 'All other sessions have been revoked',
      remainingSession: {
        id: currentSession.id,
        device: currentSession.device_info,
        location: currentSession.location,
        created_at: currentSession.created_at,
      },
    });
  } catch (err) {
    console.error('Revoke all other sessions error:', err);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
};
// ---------------------------------------------------------------------------
// 4. Admin: Get All Active Sessions
// ---------------------------------------------------------------------------
export const getAllActiveSessions = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  try {
    const [sessions] = await pool.execute(
      `SELECT 
         s.id, s.user_id, s.ip_address, s.user_agent, s.created_at, s.expires_at,
         u.username, u.email
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.expires_at > NOW()
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [[total]] = await pool.execute(
      'SELECT COUNT(*) as count FROM sessions WHERE expires_at > NOW()'
    );

    res.json({
      sessions,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit),
      },
    });
  } catch (err) {
    console.error('Get all sessions error:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

// ---------------------------------------------------------------------------
// 5. Admin: Revoke Any Session
// ---------------------------------------------------------------------------
export const adminRevokeSession = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { sessionId } = req.params;

  try {
    const [[session]] = await pool.execute(
      'SELECT user_id FROM sessions WHERE id = ?',
      [sessionId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const [result] = await pool.execute(
      'DELETE FROM sessions WHERE id = ?',
      [sessionId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await logEvent(req.user.id, 'admin_session_revoked', req.ip, req.headers['user-agent'], {
      target_session_id: sessionId,
      target_user_id: session.user_id,
    });

    global.emitSessionEvent?.adminRevoked(session.user_id, sessionId, req.user.id);

    res.json({ message: 'Session revoked by admin' });
  } catch (err) {
    console.error('Admin revoke session error:', err);
    res.status(500).json({ error: 'Failed to revoke session' });
  }
};

// ---------------------------------------------------------------------------
// Helper: Log Event + Global Emit
// ---------------------------------------------------------------------------
const logEvent = async (userId, eventType, ip, ua, details = {}) => {
  const [result] = await pool.execute(
    `INSERT INTO logs (user_id, event_type, ip_address, user_agent, details)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, eventType, ip, ua, JSON.stringify(details)]
  );

  if (global.emitLogEvent) {
    global.emitLogEvent({
      id: result.insertId,
      user_id: userId,
      event_type: eventType,
      ip_address: ip,
      user_agent: ua,
      details,
      timestamp: new Date().toISOString(),
    });
  }
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export default {
  getMySessions,
  revokeSession,
  revokeAllOtherSessions,
  getAllActiveSessions,
  adminRevokeSession,
};