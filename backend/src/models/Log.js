// backend/src/models/Log.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const Log = sequelize.define(
  'Log',
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      comment: 'User who triggered the event (null for system events)',
    },
    event_type: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: 'login, logout, login_suspicious, register, mfa_failed, ip_blocked, admin_action, etc.',
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Extra context: { country, device, anomalyScore, etc. }',
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'logs',
    timestamps: false,
    indexes: [
      { fields: ['event_type'] },
      { fields: ['user_id'] },
      { fields: ['ip_address'] },
      { fields: ['timestamp'] },
      { fields: ['timestamp', 'event_type'] }, // For trends queries
    ],
  }
);

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------
Log.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(Log, { foreignKey: 'user_id', as: 'logs' });

// ---------------------------------------------------------------------------
// Class Methods (Convenient helpers)
// ---------------------------------------------------------------------------
Log.createLog = async function ({
  userId,
  eventType,
  ip,
  userAgent,
  details = {},
}) {
  const log = await this.create({
    user_id: userId || null,
    event_type: eventType,
    ip_address: ip || null,
    user_agent: userAgent || null,
    details: Object.keys(details).length > 0 ? details : null,
  });

  // Real-time push to admin dashboard
  global.emitLogEvent?.({
    id: log.id,
    user_id: userId,
    username: userId ? 'loading...' : null, // will be filled on frontend
    event_type: eventType,
    ip_address: ip,
    details,
    timestamp: log.timestamp.toISOString(),
  });

  return log;
};

// Common event types (for reference)
Log.EVENT_TYPES = {
  LOGIN: 'login',
  LOGIN_SUSPICIOUS: 'login_suspicious',
  LOGIN_FAILED: 'login_failed',
  REGISTER: 'register',
  LOGOUT: 'logout',
  MFA_SETUP: 'mfa_setup',
  MFA_VERIFY_SUCCESS: 'mfa_verify_success',
  MFA_VERIFY_FAILED: 'mfa_verify_failed',
  PASSWORD_CHANGE: 'password_change',
  PROFILE_UPDATE: 'profile_update',
  SESSION_REVOKED: 'session_revoked',
  IP_BLOCKED: 'ip_blocked',
  ADMIN_ACTION: 'admin_action',
  ADMIN_VIEW_METRICS: 'admin_view_metrics',
};

export default Log;