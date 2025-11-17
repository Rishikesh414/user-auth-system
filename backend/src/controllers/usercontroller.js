// backend/src/controllers/userController.js

import { pool } from '../config/db.js';
import bcrypt from 'bcrypt';
import { getUserFromToken } from './sessionController.js';
import { config } from '../config/env.js';

// ---------------------------------------------------------------------------
// 1. Get Current User Profile
// ---------------------------------------------------------------------------
export const getProfile = async (req, res) => {
  const userId = req.user.id;

  try {
    const [rows] = await pool.execute(
      `SELECT 
         id, username, email, role, email_verified, 
         created_at, last_login, mfa_secret IS NOT NULL as mfa_enabled
       FROM users 
       WHERE id = ?`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// ---------------------------------------------------------------------------
// 2. Update Profile (Username, Email)
// ---------------------------------------------------------------------------
export const updateProfile = async (req, res) => {
  const userId = req.user.id;
  const { username, email } = req.body;

  if (!username && !email) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  try {
    // Check uniqueness
    const [existing] = await pool.execute(
      'SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?',
      [username || '', email || '', userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Username or email already taken' });
    }

    const updates = [];
    const values = [];

    if (username) { updates.push('username = ?'); values.push(username); }
    if (email) { updates.push('email = ?'); values.push(email); }

    values.push(userId);

    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    await logEvent(userId, 'profile_updated', req.ip, req.headers['user-agent'], { username, email });

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

// ---------------------------------------------------------------------------
// 3. Change Password
// ---------------------------------------------------------------------------
export const changePassword = async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both passwords are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      await logEvent(userId, 'password_change_failed', req.ip, req.headers['user-agent'], { reason: 'wrong_current' });
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 12);

    await pool.execute(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hash, userId]
    );

    await logEvent(userId, 'password_changed', req.ip, req.headers['user-agent']);

    // Optional: Revoke all sessions except current
    // await revokeAllOtherSessionsLogic(userId, req.headers['authorization']);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to cchange password' });
  }
};

// ---------------------------------------------------------------------------
// 4. Delete Account (Soft or Hard)
// ---------------------------------------------------------------------------
export const deleteAccount = async (req, res) => {
  const userId = req.user.id;
  const { confirm } = req.body;

  if (confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Type DELETE to confirm' });
  }

  try {
    // Option 1: Soft delete
    // await pool.execute('UPDATE users SET is_deleted = 1, deleted_at = NOW() WHERE id = ?', [userId]);

    // Option 2: Hard delete (cascades to sessions)
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    await logEvent(userId, 'account_deleted', req.ip, req.headers['user-agent']);

    // Emit to user (if connected)
    global.emitSessionEvent?.revokedAllOther(userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
};

// ---------------------------------------------------------------------------
// 5. Admin: Get All Users
// ---------------------------------------------------------------------------
export const getAllUsers = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const offset = (page - 1) * limit;

  try {
    const [users] = await pool.execute(
      `SELECT id, username, email, role, email_verified, created_at, last_login
       FROM users 
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [[total]] = await pool.execute('SELECT COUNT(*) as count FROM users');

    res.json({
      users,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit),
      },
    });
  } catch (err) {
    console.error('Get all users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// ---------------------------------------------------------------------------
// 6. Admin: Update User Role
// ---------------------------------------------------------------------------
export const adminUpdateUserRole = async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { userId } = req.params;
  const { role } = req.body;

  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const [result] = await pool.execute(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await logEvent(req.user.id, 'admin_user_role_updated', req.ip, req.headers['user-agent'], {
      target_user_id: userId,
      new_role: role,
    });

    res.json({ message: 'User role updated' });
  } catch (err) {
    console.error('Admin update role error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
};

// ---------------------------------------------------------------------------
// Helper: Log Event
// ---------------------------------------------------------------------------
const logEvent = async (userId, eventType, ip, ua, details = {}) => {
  const [result] = await pool.execute(
    `INSERT INTO logs (user_id, event_type, ip_address, user_agent, details)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, eventType, ip, ua, JSON.stringify(details)]
  );

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
// Export
// ---------------------------------------------------------------------------
export default {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
  getAllUsers,
  adminUpdateUserRole,
};