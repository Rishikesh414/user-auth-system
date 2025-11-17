// backend/src/server.js
import express from 'express';
import http from 'http';
import { initSocket } from './config/socket.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import sessionRoutes from './routes/session.js';
import { config } from './config/env.js';
import { security } from './middleware/security.js';
import BlockedIPMiddleware from './middleware/BlockedIP.js';

const app = express();
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// 1. SECURITY MIDDLEWARE (Helmet, Rate Limit, IP Block, Logging, etc.)
// ---------------------------------------------------------------------------
app.use(security.logger);        // Request ID + logging
app.use(security.cors);          // CORS (from config)
app.use(security.helmet);        // Security headers
app.use(security.rateLimit);     // Global rate limit
app.use(security.ipBlock);       // Block bad IPs
app.use(security.hpp);           // Prevent parameter pollution
app.use(security.sanitize);      // Basic XSS sanitization
app.use(BlockedIPMiddleware);

// ---------------------------------------------------------------------------
// 2. BODY PARSERS
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------------------------------------------------------------------------
// 3. SOCKET.IO INITIALIZATION
// ---------------------------------------------------------------------------
const io = initSocket(server);

// Make io available in controllers
app.set('socketio', io);

// Global emit helper for real-time logs (used in controllers)
global.emitLogEvent = (event) => {
  if (!io) return;
  io.to('admin-room').emit('admin:log-realtime', event);
};

// Optional: Emit session events
global.emitSessionEvent = app.get('socketio')?.emitSessionEvent || {};

// ---------------------------------------------------------------------------
// 4. ROUTES
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/session', sessionRoutes);

// ---------------------------------------------------------------------------
// 5. HEALTH CHECK
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    time: new Date().toISOString(),
    uptime: process.uptime(),
    env: config.server.nodeEnv,
  });
});

// ---------------------------------------------------------------------------
// 6. 404 HANDLER
// ---------------------------------------------------------------------------
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
});

// ---------------------------------------------------------------------------
// 7. GLOBAL ERROR HANDLER
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error(`[${req.requestId || 'unknown'}] Unhandled Error:`, err);

  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  res.status(status).json({
    error: message,
    requestId: req.requestId,
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// 8. START SERVER
// ---------------------------------------------------------------------------
const PORT = config.server.port || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${config.server.nodeEnv}`);
  console.log(`Socket.IO ready on /socket.io`);
  console.log(`CORS enabled for: ${config.email.clientUrl}`);
  console.log(`Health check: GET /health`);
});

// ---------------------------------------------------------------------------
// 9. GRACEFUL SHUTDOWN
// ---------------------------------------------------------------------------
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  server.close(() => {
    console.log('HTTP server closed.');
    if (io) {
      io.close(() => console.log('Socket.IO closed.'));
    }
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    console.error('Forcing shutdown...');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGQUIT', () => shutdown('SIGQUIT'));