// backend/src/sockets/adminEvents.js
import Logger from '../services/logger.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import BlockedIP from '../models/BlockedIP.js';
import { Op } from 'sequelize';

/**
 * Admin Real-Time Events Hub
 * All live events flow through here → pushed to admin dashboard
 */
const setupAdminEvents = (io) => {
  const adminRoom = 'admin-room';

  // Join admin room (only authenticated admins)
  io.on('connection', (socket) => {
    if (socket.user?.role === 'admin') {
      socket.join(adminRoom);
      console.log(`Admin ${socket.user.username} connected to real-time dashboard`);

      socket.on('disconnect', () => {
        console.log(`Admin ${socket.user.username} disconnected`);
      });
    }
  });

  // Global emitter — used by Logger, middleware, controllers
  global.emitLogEvent = (event) => {
    io.to(adminRoom).emit('admin:log-realtime', {
      ...event,
      timestamp: new Date().toISOString(),
    });
  };

  // Optional: Enhanced session events
  global.emitSessionEvent = {
    created: (userId, session) => {
      io.to(adminRoom).emit('admin:session-created', {
        user_id: userId,
        session_id: session.id,
        device: session.device_info,
        location: session.location,
        ip: session.ip_address,
        timestamp: session.created_at,
      });
    },
    revoked: (userId, sessionId) => {
      io.to(adminRoom).emit('admin:session-revoked', { user_id: userId, session_id: sessionId });
    },
    revokedAllOther: (userId) => {
      io.to(adminRoom).emit('admin:sessions-revoked-all-other', { user_id: userId });
    },
  };

  // Live Stats Broadcast (every 10 seconds)
  setInterval(async () => {
    try {
      const [onlineUsers, todayLogins, blockedIPs, suspiciousToday] = await Promise.all([
        io.engine.clientsCount,
        Log.count({
          where: {
            event_type: 'login',
            timestamp: { [Op.gte]: new Date().setHours(0, 0, 0, 0) },
          },
        }),
        BlockedIP.count(),
        Log.count({
          where: {
            event_type: 'login_suspicious',
            timestamp: { [Op.gte]: new Date().setHours(0, 0, 0, 0) },
          },
        }),
      ]);

      io.to(adminRoom).emit('admin:live-stats', {
        online_admins: io.sockets.adapter.rooms.get(adminRoom)?.size || 0,
        online_users: onlineUsers,
        today_logins: todayLogins,
        blocked_ips: blockedIPs,
        suspicious_logins_today: suspiciousToday,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Live stats error:', err);
    }
  }, 10000);

  // Push active sessions count
  setInterval(async () => {
    const activeSessions = await Session.count({
      where: {
        revoked_at: null,
        expires_at: { [Op.gt]: new Date() },
      },
    });
    io.to(adminRoom).emit('admin:active-sessions', { count: activeSessions });
  }, 30000);

  console.log('Admin real-time events system initialized');
};

export default setupAdminEvents;