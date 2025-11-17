// backend/src/services/logger.js
import Log from '../models/Log.js';

/**
 * Centralized logger service
 * Replaces all manual logEvent() calls
 * Automatically emits real-time events to admin dashboard
 */
class LoggerService {
  static EVENT_TYPES = {
    LOGIN: 'login',
    LOGIN_FAILED: 'login_failed',
    LOGIN_SUSPICIOUS: 'login_suspicious',
    REGISTER: 'register',
    LOGOUT: 'logout',
    MFA_SETUP: 'mfa_setup',
    MFA_VERIFY_SUCCESS: 'mfa_verify_success',
    MFA_VERIFY_FAILED: 'mfa_verify_failed',
    PASSWORD_CHANGE: 'password_change',
    PROFILE_UPDATE: 'profile_update',
    SESSION_CREATED: 'session_created',
    SESSION_REVOKED: 'session_revoked',
    SESSIONS_REVOKED_ALL_OTHER: 'sessions_revoked_all_other',
    IP_BLOCKED: 'ip_blocked',
    ADMIN_ACTION: 'admin_action',
    EMAIL_SENT: 'email_sent',
    ANOMALY_CHECK: 'login_anomaly_check',
  };

  /**
   * Log any event with optional rich details
   */
  static async log({
    userId = null,
    eventType,
    ip = null,
    userAgent = null,
    details = {},
    timestamp = new Date(),
  }) {
    try {
      // Save to DB via Sequelize Log model
      const logEntry = await Log.createLog?.({
        userId,
        eventType,
        ip,
        userAgent,
        details: Object.keys(details).length > 0 ? details : null,
        timestamp,
      });

      // Real-time broadcast to admin dashboard
      const payload = {
        id: logEntry?.id || Date.now(),
        user_id: userId,
        username: userId ? 'loading...' : null, // frontend will resolve
        event_type: eventType,
        ip_address: ip,
        user_agent: userAgent,
        details,
        timestamp: timestamp.toISOString(),
      };

      global.emitLogEvent?.(payload);

      return logEntry;
    } catch (err) {
      console.error('LoggerService failed to log:', err);
      // Never crash the app if logging fails
    }
  }

  // Convenience methods
  static async login(userId, ip, userAgent, extra = {}) {
    return this.log({ userId, eventType: this.EVENT_TYPES.LOGIN, ip, userAgent, details: extra });
  }

  static async loginFailed(userId, ip, userAgent, reason = 'invalid_credentials') {
    return this.log({
      userId,
      eventType: this.EVENT_TYPES.LOGIN_FAILED,
      ip,
      userAgent,
      details: { reason },
    });
  }

  static async loginSuspicious(userId, ip, userAgent, anomalyData) {
    return this.log({
      userId,
      eventType: this.EVENT_TYPES.LOGIN_SUSPICIOUS,
      ip,
      userAgent,
      details: anomalyData,
    });
  }

  static async register(userId, ip, userAgent) {
    return this.log({ userId, eventType: this.EVENT_TYPES.REGISTER, ip, userAgent });
  }

  static async sessionRevoked(userId, sessionId, ip, userAgent) {
    return this.log({
      userId,
      eventType: this.EVENT_TYPES.SESSION_REVOKED,
      ip,
      userAgent,
      details: { session_id: sessionId },
    });
  }

  static async adminAction(adminId, action, targetUserId = null, details = {}) {
    return this.log({
      userId: adminId,
      eventType: this.EVENT_TYPES.ADMIN_ACTION,
      details: { action, target_user_id: targetUserId, ...details },
    });
  }
}

export default LoggerService;