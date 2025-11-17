// backend/src/middleware/BlockedIP.js
import BlockedIP from '../models/BlockedIP.js';
import { Op } from 'sequelize';

const BlockedIPMiddleware = async (req, res, next) => {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').replace(/^::ffff:/, '');

  if (process.env.NODE_ENV !== 'production' && ip === '127.0.0.1') return next();

  const blocked = await BlockedIP.findOne({
    where: {
      ip,
      [Op.or]: [
        { blocked_until: null },
        { blocked_until: { [Op.gt]: new Date() } }
      ]
    }
  });

  if (blocked) {
    global.emitLogEvent?.({ event_type: 'ip_blocked_access_attempt', ip_address: ip });
    return res.status(403).json({ error: 'IP blocked', reason: blocked.reason || 'Security' });
  }

  next();
};

export default BlockedIPMiddleware;