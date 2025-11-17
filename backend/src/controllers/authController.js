// backend/src/controllers/authController.js

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../config/db.js';
import { config } from '../config/env.js';
import { sendVerificationEmail } from '../services/emailService.js';
import { detectAnomaly } from '../middleware/anomalyMiddleware.js';
import rateLimit from 'express-rate-limit';
import Logger from '../services/logger.js';

// ---------------------------------------------------------------------------
// Rate Limiter for Login (5 attempts per 15 min)
// ---------------------------------------------------------------------------
export const loginLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { error: 'Too many login attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// 1. Register
// ---------------------------------------------------------------------------
export const register = async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // 1. Input validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { email: email.toLowerCase() },
          { username },
        ],
      },
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    // 3. Generate verification token + expiry
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // 4. Create user via Sequelize model (auto-hashes password)
    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password_hash: password, // ← beforeCreate hook will hash it
      email_verification_token: verifyToken,
      email_verification_expires: verifyTokenExpires,
      role: 'user',
    });

    // 5. Send verification email (using your service)
    await sendVerificationEmail(user);

    // 6. Log registration with rich data
    await Log.createLog?.({
      userId: user.id,
      eventType: Log.EVENT_TYPES?.REGISTER || 'register',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        device: req.headers['user-agent'],
        country: 'IN',
      },
    });

    // 7. Success response
    res.status(201).json({
      message: 'Registration successful! Please check your email to verify your account.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again later.' });
  }
};

// ---------------------------------------------------------------------------
// 2. Verify Email
// ---------------------------------------------------------------------------
export const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Invalid verification link' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE verify_token = ? AND email_verified = 0',
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    await pool.execute(
      'UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?',
      [rows[0].id]
    );

    // Log verification
    await logEvent(rows[0].id, 'email_verified', req.ip, req.headers['user-agent']);

    // Redirect to login with success
    res.redirect(`${config.email.clientUrl}/login?verified=true`);
  } catch (err) {
    console.error('Verify email error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};

// ---------------------------------------------------------------------------
// 3. Login
// ---------------------------------------------------------------------------
export const login = async (req, res) => {
  const { email, password, mfaToken } = req.body;

  try {
    // Find user
    const [rows] = await pool.execute(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];

    // Check if blocked
    if (user.is_blocked) {
      return res.status(403).json({ error: 'Account is blocked' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await Logger.loginFailed(user.id, req.ip, req.headers['user-agent'], 'wrong_password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check email verification
    if (!user.email_verified) {
      return res.status(403).json({ error: 'Please verify your email first' });
    }

    // Anomaly detection
    const anomaly = await detectAnomaly(req, user);
    if (anomaly.requiresMFA) {
      if (!mfaToken) {
        return res.status(206).json({ requiresMFA: true, 
          sessionId: anomaly.sessionId , 
          message: 'Additional verification required',
          reasons: anomaly.reasons, });
      }
      // Verify MFA token here (TOTP/WebAuthn)
      const mfaValid = await verifyMFA(user.id, mfaToken);
      if (!mfaValid) {
        await logEvent(user.id, 'mfa_failed', req.ip, req.headers['user-agent']);
        return res.status(401).json({ error: 'Invalid MFA code' });
      }
    }

    // Generate tokens
    const tokens = generateTokens(user);

    // Save refresh token in DB
        // Create session using Sequelize model (real-time + rich data)
    await Session.createSession({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      deviceInfo: parseUserAgent(req.headers['user-agent']),   // optional but recommended
      location: await getGeoLocation(req.ip),                // optional but awesome
      expiresInDays: 7,
    });

    // Update last login
    await pool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

    // Log successful login
    await Logger.login(user.id, req.ip, req.headers['user-agent']);
    
    res.json({
      message: 'Login successful',
      user: { id: user.id, username: user.username, email: user.email, role: user.role },
      ...tokens,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

// ---------------------------------------------------------------------------
// 4. Refresh Token
// ---------------------------------------------------------------------------
export const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    const [rows] = await pool.execute(
      'SELECT * FROM sessions WHERE refresh_token = ? AND expires_at > NOW()',
      [refreshToken]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const [users] = await pool.execute('SELECT * FROM users WHERE id = ?', [decoded.id]);
    if (users.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const newTokens = generateTokens(users[0]);

    // Update refresh token
    await pool.execute(
      'UPDATE sessions SET refresh_token = ?, expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY) WHERE user_id = ?',
      [newTokens.refreshToken, decoded.id]
    );

    res.json(newTokens);
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// ---------------------------------------------------------------------------
// 5. Logout
// ---------------------------------------------------------------------------
export const logout = async (req, res) => {
  const { refreshToken } = req.body;

  try {
    if (refreshToken) {
      await pool.execute('DELETE FROM sessions WHERE refresh_token = ?', [refreshToken]);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// ---------------------------------------------------------------------------
// 6. Forgot Password
// ---------------------------------------------------------------------------
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.json({ message: 'If email exists, reset link sent' }); // Don't reveal
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await pool.execute(
      'UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?',
      [resetToken, expires, rows[0].id]
    );

    const resetUrl = `${config.email.clientUrl}/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail(email, resetUrl);

    res.json({ message: 'If email exists, reset link sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send reset link' });
  }
};

// ---------------------------------------------------------------------------
// 7. Reset Password
// ---------------------------------------------------------------------------
export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  try {
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE reset_token = ? AND reset_expires > NOW()',
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.execute(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?',
      [hash, rows[0].id]
    );

    await logEvent(rows[0].id, 'password_reset', req.ip, req.headers['user-agent']);

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
};

// ---------------------------------------------------------------------------
// 8. Get MFA Status (Protected Route)
// ---------------------------------------------------------------------------
export const getMFAStatus = async (req, res) => {
  const userId = req.user.id; // From authMiddleware

  try {
    const [rows] = await pool.execute(
      `SELECT 
         mfa_secret IS NOT NULL AS totp_enabled,
         webauthn_cred IS NOT NULL AS webauthn_enabled
       FROM users 
       WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { totp_enabled, webauthn_enabled } = rows[0];
    const enabled = totp_enabled || webauthn_enabled;

    // Optional: Log MFA status check
    await logEvent(userId, 'mfa_status_check', req.ip, req.headers['user-agent'], {
      totp: !!totp_enabled,
      webauthn: !!webauthn_enabled,
    });

    res.json({ enabled });
  } catch (err) {
    console.error('Get MFA status error:', err);
    res.status(500).json({ error: 'Failed to fetch MFA status' });
  }
};

// ---------------------------------------------------------------------------
// Helper: Generate JWT Tokens
// ---------------------------------------------------------------------------
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiry }
  );

  const refreshToken = jwt.sign(
    { id: user.id },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiry }
  );

  return { accessToken, refreshToken };
};

// ---------------------------------------------------------------------------
// Helper: Log Event (with real-time emit)
// ---------------------------------------------------------------------------
const logEvent = async (userId, eventType, ip, ua, details = {}) => {
  const [result] = await pool.execute(
    `INSERT INTO logs (user_id, event_type, ip_address, user_agent, details)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, eventType, ip, ua, JSON.stringify(details)]
  );

  // Emit to admins in real-time
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
// Placeholder: MFA Verification (TOTP or WebAuthn)
// ---------------------------------------------------------------------------
const verifyMFA = async (userId, token) => {
  // Implement TOTP with speakeasy or WebAuthn with @simplewebauthn
  // Return true/false
  return true; // Placeholder
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export default {
  register,
  verifyEmail,
  login: [loginLimiter, login],
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
};