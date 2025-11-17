// backend/src/middleware/anomalyMiddleware.js
import { pool } from '../config/db.js';
import { config } from '../config/env.js';
import geoip from 'geoip-lite';
import uaParser from 'ua-parser-js';

// ---------------------------------------------------------------------------
// 1. Main Anomaly Detector (called in login)
// ---------------------------------------------------------------------------
export const detectAnomaly = async (req, user) => {
  const ip = req.ip || req.connection.remoteAddress;
  const ua = req.headers['user-agent'] || '';
  const now = new Date();

  const geo = geoip.lookup(ip) || {};
  const parsedUA = uaParser(ua);

  const device = {
    os: parsedUA.os.name || 'Unknown',
    browser: parsedUA.browser.name || 'Unknown',
    device: parsedUA.device.type || 'desktop',
  };

  const location = {
    country: geo.country || 'Unknown',
    city: geo.city || 'Unknown',
    timezone: geo.timezone || 'Unknown',
  };

  try {
    // --- Step 1: Get user's session history ---
    const [history] = await pool.execute(
      `SELECT ip_address, user_agent, created_at 
       FROM sessions 
       WHERE user_id = ? AND expires_at > NOW()
       ORDER BY created_at DESC 
       LIMIT 10`,
      [user.id]
    );

    // --- Step 2: Compare current login with history ---
    const isNewIP = !history.some(s => s.ip_address === ip);
    const isNewDevice = !history.some(s => {
      const hUA = uaParser(s.user_agent);
      return hUA.browser.name === parsedUA.browser.name && hUA.os.name === parsedUA.os.name;
    });

    const lastLogin = history[0]?.created_at ? new Date(history[0].created_at) : null;
    const hoursSinceLast = lastLogin ? (now - lastLogin) / (1000 * 60 * 60) : Infinity;

    // --- Step 3: Anomaly Scoring ---
    let score = 0;
    const triggers = [];

    if (isNewIP) { score += 40; triggers.push('new_ip'); }
    if (isNewDevice) { score += 30; triggers.push('new_device'); }
    if (hoursSinceLast > 24 * 7) { score += 20; triggers.push('inactive_7d'); } // 7+ days
    if (location.country !== 'IN' && user.role !== 'admin') { score += 25; triggers.push('unusual_country'); }

    // --- Step 4: Require MFA if score >= threshold ---
    const requiresMFA = score >= config.anomaly.threshold; // e.g., 60

    // --- Step 5: Log anomaly (even if not requiring MFA) ---
    if (score > 0) {
      await logAnomaly(user.id, ip, ua, {
        score,
        triggers,
        requiresMFA,
        geo: location,
        device,
      });
    }

    // --- Step 6: Generate session ID for MFA flow ---
    let sessionId = null;
    if (requiresMFA) {
      const [result] = await pool.execute(
        `INSERT INTO mfa_sessions (user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
        [user.id, ip, ua]
      );
      sessionId = result.insertId;
    }

    return {
      requiresMFA,
      sessionId,
      anomalyScore: score,
      triggers,
    };
  } catch (err) {
    console.error('Anomaly detection error:', err);
    return { requiresMFA: false };
  }
};

// ---------------------------------------------------------------------------
// 2. Log Anomaly Event
// ---------------------------------------------------------------------------
const logAnomaly = async (userId, ip, ua, details) => {
  await pool.execute(
    `INSERT INTO logs (user_id, event_type, ip_address, user_agent, details)
     VALUES (?, 'login_anomaly', ?, ?, ?)`,
    [userId, ip, ua, JSON.stringify(details)]
  );

  if (global.emitLogEvent) {
    global.emitLogEvent({
      user_id: userId,
      event_type: 'login_anomaly',
      ip_address: ip,
      user_agent: ua,
      details,
      timestamp: new Date().toISOString(),
    });
  }
};

// ---------------------------------------------------------------------------
// 3. Optional: Verify MFA Session (for login flow)
// ---------------------------------------------------------------------------
export const verifyMFASession = async (sessionId, userId) => {
  const [rows] = await pool.execute(
    `SELECT id FROM mfa_sessions 
     WHERE id = ? AND user_id = ? AND expires_at > NOW()`,
    [sessionId, userId]
  );
  return rows.length > 0;
};

// Clean up expired MFA sessions (run via cron or background job)
export const cleanupMFASessions = async () => {
  await pool.execute(`DELETE FROM mfa_sessions WHERE expires_at < NOW()`);
};