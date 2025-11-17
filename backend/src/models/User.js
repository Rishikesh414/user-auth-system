// backend/src/models/User.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import bcrypt from 'bcrypt';

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM('user', 'admin', 'moderator'),
      defaultValue: 'user',
      allowNull: false,
    },
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    email_verification_token: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    email_verification_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    is_blocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    mfa_secret: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Base32 secret for TOTP',
    },
    mfa_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      onUpdate: DataTypes.NOW,
    },
    webauthn_credentials: {
      type: DataTypes.JSON,
      defaultValue: [],
      comment: 'Array of { credID, publicKey, counter, transports }',
    },
    currentChallenge: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: 'users',
    timestamps: false,
    indexes: [
      { fields: ['email'] },
      { fields: ['username'] },
      { fields: ['role'] },
      { fields: ['is_blocked'] },
      { fields: ['last_login'] },
    ],
  }
);

// ---------------------------------------------------------------------------
// Hooks: Hash password before save
// ---------------------------------------------------------------------------
User.beforeCreate(async (user) => {
  if (user.password_hash) {
    user.password_hash = await bcrypt.hash(user.password_hash, 12);
  }
});

User.beforeUpdate(async (user) => {
  if (user.changed('password_hash') && user.password_hash) {
    user.password_hash = await bcrypt.hash(user.password_hash, 12);
  }
});

// ---------------------------------------------------------------------------
// Instance Methods
// ---------------------------------------------------------------------------
User.prototype.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password_hash);
};

User.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password_hash;
  delete values.mfa_secret;
  delete values.email_verification_token;
  return values;
};

export default User;