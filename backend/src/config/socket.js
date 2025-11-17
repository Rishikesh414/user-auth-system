// backend/src/config/socket.js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './env.js';
import User from '../models/User.js';
import Session from '../models/Session.js';
import Log from '../models/Log.js';
import Logger from '../services/logger.js';

let io;

/**
 * Initialize Socket.IO with full real-time support
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: config.email.clientUrl,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ================================
  // Socket Authentication Middleware
  // ================================
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token ||
                  socket.handshake.headers['authorization']?.split(' ')[1];

    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, config.jwt.accessSecret);
      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'username', 'email', 'role'],
      });

      if (!user) throw new Error('User not found');

      socket.user = user;
      next();
    } catch (err) {
      console.error('Socket auth failed:', err.message);
      next(new Error('Invalid or expired token'));
    }
  });

  // ================================
  // Connection Handling
  // ================================
  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`Socket connected: ${socket.id} → User: ${user.username} (${user.role})`);

    // Join private user room
    socket.join(`user:${user.id}`);

    // Join admin room if admin
    if (user.role === 'admin') {
      socket.join('admin-room');
      console.log(`Admin ${user.username} joined real-time dashboard`);
    }

    // ================================
    // Send Active Sessions on Connect
    // ================================
    try {
      const sessions = await Session.findAll({
        where: {
          user_id: user.id,
          revoked_at: null,
          expires_at: { [require('sequelize').Op.gt]: new Date() },
        },
        order: [['created_at', 'DESC']],
        attributes: ['id', 'ip_address', 'user_agent', 'device_info', 'location', 'created_at', 'is_current'],
      });

      socket.emit('session:list', {
        sessions: sessions.map(s => ({
          ...s.toJSON(),
          refresh_token: undefined,
        })),
      });
    } catch (err) {
      console.error('Failed to send session list:', err);
    }

    // ================================
    // Admin: Request Logs (Paginated)
    // ================================
    socket.on('admin:request-logs', async ({ page = 1, limit = 50, filters = {} }) => {
      if (user.role !== 'admin') return;

      const offset = (page - 1) * limit;

      try {
        const { count, rows } = await Log.findAndCountAll({
          where: filters,
          include: [{ model: User, attributes: ['username', 'email'] }],
          order: [['timestamp', 'DESC']],
          limit,
          offset,
        });

        socket.emit('admin:logs-update', {
          logs: rows,
          page,
          total: count,
          hasMore: rows.length === limit,
        });
      } catch (err) {
        socket.emit('error', { message: 'Failed to fetch logs' });
      }
    });

    // ================================
    // Disconnect
    // ================================
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  // ================================
  // Global Real-Time Emitters
  // ================================

  // Admin Log Feed (used by Logger.service)
  global.emitLogEvent = (event) => {
    io?.to('admin-room').emit('admin:log-realtime', {
      ...event,
      timestamp: new Date().toISOString(),
    });
  };

  // Session Events (used by session controllers)
  global.emitSessionEvent = {
    list: (userId) => {
      Session.findAll({
        where: { user_id: userId, revoked_at: null, expires_at: { [require('sequelize').Op.gt]: new Date() } },
        order: [['created_at', 'DESC']],
      }).then(sessions => {
        const safe = sessions.map(s => s.toJSON());
        io?.to(`user:${userId}`).emit('session:list', { sessions: safe });
      });
    },

    created: (userId, session) => {
      io?.to(`user:${userId}`).emit('session:created', session.toJSON());
      io?.to('admin-room').emit('admin:session-created', {
        user_id: userId,
        session: session.toJSON(),
      });
    },

    revoked: (userId, sessionId) => {
      io?.to(`user:${userId}`).emit('session:revoked', { sessionId });
      io?.to('admin-room').emit('admin:session-revoked', { userId, sessionId });
    },

    revokedAllOther: (userId) => {
      io?.to(`user:${userId}`).emit('session:revoked_all_other');
      io?.to('admin-room').emit('admin:sessions-revoked-all-other', { userId });
    },

    adminRevoked: (targetUserId, sessionId, adminId) => {
      io?.to(`user:${targetUserId}`).emit('session:revoked', { sessionId });
      io?.to('admin-room').emit('admin:session-admin-revoked', {
        sessionId,
        targetUserId,
        revokedBy: adminId,
        timestamp: new Date().toISOString(),
      });
    },
  };

  console.log('Socket.IO initialized with real-time admin & user sync');
  return io;
};

// Export io instance for rare direct use
export { io };