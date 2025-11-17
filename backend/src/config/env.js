// backend/src/config/env.js
import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file (fails silently if missing – you’ll get validation errors instead)
dotenv.config();

// ---------------------------------------------------------------------------
// Zod schema – defines every required variable + type + default fallback
// ---------------------------------------------------------------------------
const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DB_HOST: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASS: z.string().min(1),
  DB_NAME: z.string().min(1),
  DB_PORT: z.coerce.number().default(3306),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Email
  EMAIL_HOST: z.string().min(1),
  EMAIL_PORT: z.coerce.number().default(587),
  EMAIL_USER: z.string().email(),
  EMAIL_PASS: z.string().min(1),
  CLIENT_URL: z.string().url(),

  // WebAuthn
  WEBAUTHN_RP_ID: z.string().min(1),
  WEBAUTHN_RP_NAME: z.string().default('My Auth App'),
  WEBAUTHN_ORIGIN: z.string().url(),

  // Anomaly Detection (optional)
  ABUSEIPDB_KEY: z.string().optional(),
  ENABLE_ANOMALY_DETECTION: z.coerce.boolean().default(true),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000), // 15 min
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
});

let env;
try {
  env = envSchema.parse(process.env);
} catch (error) {
  console.error('Invalid or missing environment variables:');
  error.errors.forEach((e) => {
    console.error(`   ${e.path.join('.')}: ${e.message}`);
  });
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Export a frozen config object – safe to import anywhere
// ---------------------------------------------------------------------------
export const config = Object.freeze({
  server: {
    port: getInt('PORT', 5000),
    nodeEnv: getEnv('NODE_ENV', 'development'), // default to dev
  },

  db: {
    host: getEnv('DB_HOST'),
    port: getInt('DB_PORT', 3306),
    user: getEnv('DB_USER'),
    password: getEnv('DB_PASSWORD'),
    database: getEnv('DB_NAME'),
  },

  jwt: {
    accessSecret: getEnv('JWT_ACCESS_SECRET'),
    refreshSecret: getEnv('JWT_REFRESH_SECRET'),
    accessExpiry: getEnv('JWT_ACCESS_EXPIRY', '15m'),
    refreshExpiry: getEnv('JWT_REFRESH_EXPIRY', '7d'),
  },

  email: {
    host: getEnv('EMAIL_HOST'),
    port: getInt('EMAIL_PORT', 587),
    user: getEnv('EMAIL_USER'),
    pass: getEnv('EMAIL_PASS'),
    clientUrl: getEnv('CLIENT_URL'), // e.g., https://app.example.com
  },

  webauthn: {
    rpId: env.WEBAUTHN_RP_ID,
    rpName: env.WEBAUTHN_RP_NAME,
    origin: env.WEBAUTHN_ORIGIN,
  },

  anomaly: {
    abuseIpDbKey: env.ABUSEIPDB_KEY,
    enabled: env.ENABLE_ANOMALY_DETECTION,
    threshold: 60, // 0–100: require MFA if score >= this
  },

  rateLimit: {
    login: {
      windowMs: process.env.RATE_LIMIT_LOGIN_WINDOW_MS || 15 * 60 * 1000, // 15 min
      max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 5,
    },
    refresh: {
      windowMs: process.env.RATE_LIMIT_REFRESH_WINDOW_MS || 60 * 60 * 1000, // 1 hour
      max: parseInt(process.env.RATE_LIMIT_REFRESH_MAX) || 100,
    },
  },
});

export default config;