// backend/src/middleware/rateLimit.js
import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

// ---------------------------------------------------------------------------
// Helper: Create Rate Limiter
// ---------------------------------------------------------------------------
const createLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,   // Return rate limit info in headers
    legacyHeaders: false,    // Disable X-RateLimit-* headers
    skip: (req) => {
      // Optional: Skip for localhost in dev
      return process.env.NODE_ENV === 'development' && req.ip === '::1';
    },
    keyGenerator: (req) => {
      // Use X-Forwarded-For if behind proxy
      return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
    },
  });
};

// ---------------------------------------------------------------------------
// 1. Login Rate Limiter (Strict)
// ---------------------------------------------------------------------------
export const loginLimiter = createLimiter(
  config.rateLimit.login.windowMs,      // e.g., 15 * 60 * 1000
  config.rateLimit.login.max,          // e.g., 5
  'Too many login attempts. Try again later.'
);

// ---------------------------------------------------------------------------
// 2. Refresh Token Rate Limiter (Lenient)
// ---------------------------------------------------------------------------
export const refreshLimiter = createLimiter(
  config.rateLimit.refresh.windowMs,   // e.g., 60 * 60 * 1000
  config.rateLimit.refresh.max,        // e.g., 100
  'Too many refresh attempts. Please slow down.'
);

// ---------------------------------------------------------------------------
// Export as object (matches your usage in auth.js)
// ---------------------------------------------------------------------------
export const rateLimiter = {
  login: loginLimiter,
  refresh: refreshLimiter,
};