// backend/src/services/anomaly.js
import Log from '../models/Log.js';
import Session from '../models/Session.js';
import geoip from 'geoip-lite';
import uaParser from 'ua-parser-js';
import { Op } from 'sequelize';

/**
 * Detect login anomalies and decide if MFA is required
 * Returns: { requiresMFA: boolean, score: number, reasons: string[], sessionId?: string }
 */
export const detectAnomaly = async (req, user) => {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').replace(/^::ffff:/, '');
  const ua = req.headers['user-agent'] || '';
  const now = new Date();

  const geo = geoip.lookup(ip) || {};
  const location = {
    country: geo.country || 'Unknown',
    city: geo.city || 'Unknown',
    timezone: geo.timezone || 'Unknown',
  };

  const device = uaParser(ua);
  const fingerprint = `${device.browser.name}-${device.os.name}-${device.device.type || 'desktop'}`;

  let score = 0;
  const reasons = [];

  // 1. New IP never used before → +40
  const pastIp = await Session.findOne({
    where: { user_id: user.id, ip_address: ip },
    attributes: ['id'],
  });
  if (!pastIp) {
    score += 40;
    reasons.push('new_ip');
  }

  // 2. New device fingerprint → +35
  const pastDevice = await Session.findOne({
    where: {
      user_id: user.id,
      device_info: { [Op.like]: `%${fingerprint}%` },
    },
  });
  if (!pastDevice) {
    score += 35;
    reasons.push('new_device');
  }

  // 3. Unusual country (not IN) → +50
  if (location.country && location.country !== 'IN') {
    score += 50;
    reasons.push('unusual_country');
  }

  // 4. Too many failed logins in last 15 min → +30
  const recentFails = await Log.count({
    where: {
      user_id: user.id,
      event_type: 'login_failed',
      timestamp: { [Op.gt]: new Date(now - 15 * 60 * 1000) },
    },
  });
  if (recentFails >= 3) {
    score += 30;
    reasons.push('recent_failed_attempts');
  }

  // 5. Impossible travel (same user logged in from far locations in short time)
  const lastSession = await Session.findOne({
    where: { user_id: user.id, created_at: { [Op.lt]: now } },
    order: [['created_at', 'DESC']],
    limit: 1,
  });

  if (lastSession && lastSession.location?.country && location.country !== lastSession.location.country) {
    const timeDiff = (now - new Date(lastSession.created_at)) / (1000 * 60 * 60); // hours
    if (timeDiff < 2) {
      score += 70;
      reasons.push('impossible_travel');
    }
  }

  // 6. Tor / Proxy / VPN detection (basic)
  if (req.headers['x-tor'] || req.headers['via'] || geo.org?.includes('TOR')) {
    score += 60;
    reasons.push('proxy_or_tor');
  }

  const requiresMFA = score >= 60; // threshold

  // Always log anomaly check
  await Log.createLog({
    userId: user.id,
    eventType: requiresMFA ? 'login_suspicious' : 'login_anomaly_check',
    ip,
    userAgent: ua,
    details: {
      anomalyScore: score,
      reasons,
      location,
      device: {
        browser: device.browser.name,
        os: device.os.name,
        type: device.device.type || 'desktop',
      },
      requiresMFA,
    },
  });

  return {
    requiresMFA,
    score,
    reasons,
    location,
    device: device.browser.name,
  };
};

export default { detectAnomaly };