// backend/src/models/index.js
import User from './ User.js';
import Session from './Session.js';
import BlockedIP from './BlockedIP.js';
import Log from './Log.js';

// Associations
BlockedIP.belongsTo(User, { foreignKey: 'created_by', as: 'admin' });
User.hasMany(BlockedIP, { foreignKey: 'created_by', as: 'blockedIPs' });
User.hasMany(Session, { foreignKey: 'user_id', as: 'sessions' });
User.hasMany(Log, { foreignKey: 'user_id', as: 'logs' });

export { User, Session, BlockedIP, Log };