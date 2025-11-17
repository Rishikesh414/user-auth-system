// backend/src/models/Session.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';
import crypto from 'crypto';

const Session = sequelize.define(
  'Session',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    refresh_token: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    device_info: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Parsed: { browser, os, device }',
    },
    location: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '{ country, city, timezone }',
    },
    is_current: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Used for "this device" indicator',
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'sessions',
    timestamps: false,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['refresh_token'], unique: true },
      { fields: ['expires_at'] },
      { fields: ['revoked_at'] },
      { fields: ['is_current'] },
    ],
  }
);

// ---------------------------------------------------------------------------
// Associations
// ---------------------------------------------------------------------------
Session.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(Session, { foreignKey: 'user_id', as: 'sessions' });

// ---------------------------------------------------------------------------
// Class Methods
// ---------------------------------------------------------------------------
Session.createSession = async function ({
  userId,
  refreshToken,
  ip,
  userAgent,
  deviceInfo,
  location,
  expiresInDays = 7,
}) {
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const session = await this.create({
    user_id: userId,
    refresh_token: refreshToken,
    ip_address: ip,
    user_agent: userAgent,
    device_info: deviceInfo,
    location,
    expires_at: expiresAt,
  });

  // Real-time push to user’s session list
  global.emitLogEvent?.({
    event_type: 'session_created',
    user_id: userId,
    session_id: session.id,
    ip_address: ip,
    device_info: deviceInfo,
    timestamp: new Date().toISOString(),
  });

  return session;
};

Session.revoke = async function (sessionId) {
  await this.update(
    { is_current: false, revoked_at: new Date() },
    { where: { id: sessionId } }
  );
};

Session.revokeAllOther = async function (userId, currentSessionId) {
  await this.update(
    { is_current: false, revoked_at: new Date() },
    {
      where: {
        user_id: userId,
        id: { [require('sequelize').Op.ne]: currentSessionId },
      },
    }
  );
};

Session.cleanupExpired = async function () {
  const deleted = await this.destroy({
    where: {
      expires_at: { [require('sequelize').Op.lt]: new Date() },
    },
  });
  return deleted;
};

export default Session;