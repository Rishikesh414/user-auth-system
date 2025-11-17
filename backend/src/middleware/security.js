// backend/src/middleware/security.js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import hpp from 'hpp';
import { createHash } from 'crypto';
import { pool } from '../config/db.js';
import { config } from '../config/env.js';

// ---------------------------------------------------------------------------
// 1. CORS Configuration
// ---------------------------------------------------------------------------
export const corsMiddleware = cors({
  origin: config.email.clientUrl, // e.g., http://localhost:5173
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

// ---------------------------------------------------------------------------
// 2. Helmet Security Headers
// ---------------------------------------------------------------------------
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", config.email.clientUrl],
      fontSrc: ["'self'", 'https:'],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  hidePoweredBy: true,
  noSniff: true,
  xssFilter: true,
});

// ---------------------------------------------------------------------------
// 3. Parameter Pollution Protection
// ---------------------------------------------------------------------------
export const hppMiddleware = hpp();

// ---------------------------------------------------------------------------
// 4. Global Rate Limiter (Fallback)
// ---------------------------------------------------------------------------
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per IP
  message: { error: 'Too many requests from this IP. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip,
});

// ---------------------------------------------------------------------------
// 5. IP Blocking Middleware
// ---------------------------------------------------------------------------
export const ipBlockMiddleware = async (req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;

  try {
    const [rows] = await pool.execute(
      `SELECT blocked_until FROM blocked_ips WHERE ip = ?`,
      [ip]
    );

    if (rows.length > 0) {
      const blockedUntil = rows[0].blocked_until;
      if (!blockedUntil || new Date(blockedUntil) > new Date()) {
        return res.status(403).json({
          error: 'IP blocked',
          blockedUntil: blockedUntil ? blockedUntil.toISOString() : null,
        });
      } else {
        // Auto-unblock expired
        await pool.execute(`DELETE FROM blocked_ips WHERE ip = ?`, [ip]);
      }
    }

    next();
  } catch (err) {
    console.error('IP block check error:', err);
    next(); // Fail open
  }
};

// ---------------------------------------------------------------------------
// 6. Request ID & Logging
// ---------------------------------------------------------------------------
export const requestLogger = (req, res, next) => {
  const requestId = createHash('md5')
    .update(`${Date.now()}${Math.random()}`)
    .digest('hex')
    .slice(0, 8);

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ` +
      `${res.statusCode} ${duration}ms - ${req.ip} - ID: ${requestId}`
    );
  });

  next();
};

// ---------------------------------------------------------------------------
// 7. Input Sanitization (Basic)
// ---------------------------------------------------------------------------
export const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = obj[key]
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .trim();
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };

  sanitize(req.body);
  sanitize(req.query);
  sanitize(req.params);

  next();
};

// ---------------------------------------------------------------------------
// 8. Export All as Object
// ---------------------------------------------------------------------------
export const security = {
  cors: corsMiddleware,
  helmet: helmetMiddleware,
  hpp: hppMiddleware,
  rateLimit: globalRateLimiter,
  ipBlock: ipBlockMiddleware,
  logger: requestLogger,
  sanitize: sanitizeInput,
};