// backend/src/models/BlockedIP.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js'; // your sequelize instance

const BlockedIP = sequelize.define(
  'BlockedIP',
  {
    // Primary key
    ip: {
      type: DataTypes.STRING(45),
      primaryKey: true,
      allowNull: false,
      validate: {
        isIP: true, // Validates IPv4 or IPv6
      },
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: 'Manual block by admin',
    },
    blocked_until: {
      type: DataTypes.DATE,
      allowNull: true, // NULL = permanent block
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      comment: 'Admin who blocked the IP',
    },
  },
  {
    tableName: 'blocked_ips',
    timestamps: false, // We manage created_at manually
    indexes: [
      {
        fields: ['blocked_until'],
      },
      {
        fields: ['created_at'],
      },
    ],
  }
);

// ---------------------------------------------------------------------------
// Class Methods
// ---------------------------------------------------------------------------
BlockedIP.isBlocked = async function (ip) {
  const cleanIp = ip.replace(/^::ffff:/, '');
  const record = await this.findOne({ where: { ip: cleanIp } });
  if (!record) return false;

  if (!record.blocked_until) return true; // Permanent
  return new Date(record.blocked_until) > new Date();
};

BlockedIP.block = async function ({ ip, reason = 'Security violation', days, adminId }) {
  const until = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  return await this.upsert({
    ip,
    reason,
    blocked_until: until,
    created_by: adminId || null,
  });
};

BlockedIP.unblock = async function (ip) {
  return await this.destroy({ where: { ip } });
};

export default BlockedIP;