// backend/src/services/mfa.js
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import User from '../models/User.js';
import Logger from './logger.js';
import { sendMFAAlertEmail } from './email.js';
import geoip from 'geoip-lite';

/**
 * MFA Service – TOTP + Backup Codes
 */
class MFAService {
  // 1. Generate TOTP secret + QR code for setup
  static async generateTOTPSecret(user) {
    const secret = speakeasy.generateSecret({
      name: `YourApp (${user.email})`,
      length: 32,
    });

    // Save temp secret (not enabled yet)
    await User.update(
      {
        mfa_secret: secret.base32,
        mfa_enabled: false, // still pending verification
      },
      { where: { id: user.id } }
    );

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCodeUrl,
      otpauthUrl: secret.otpauth_url,
    };
  }

  // 2. Verify TOTP token during setup
  static async verifyTOTPSetup(userId, token) {
    const user = await User.findByPk(userId);
    if (!user || !user.mfa_secret) throw new Error('No MFA secret found');

    const verified = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token,
      window: 2, // allow ±60 seconds drift
    });

    if (verified) {
      // Enable MFA permanently
      await User.update(
        { mfa_enabled: true },
        { where: { id: userId } }
      );

      await Logger.log({
        userId,
        eventType: Logger.EVENT_TYPES.MFA_SETUP,
        details: { method: 'totp' },
      });
    }

    return verified;
  }

  // 3. Verify TOTP during login
  static async verifyTOTPLogin(userId, token) {
    const user = await User.findByPk(userId);
    if (!user?.mfa_enabled || !user.mfa_secret) return false;

    const verified = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token,
      window: 6, // allow up to 3 minutes drift
    });

    if (verified) {
      await Logger.log({
        userId,
        eventType: Logger.EVENT_TYPES.MFA_VERIFY_SUCCESS,
        ip: null,
        userAgent: null,
      });
    } else {
      await Logger.log({
        userId,
        eventType: Logger.EVENT_TYPES.MFA_VERIFY_FAILED,
        ip: null,
        userAgent: null,
        details: { token_provided: token },
      });
    }

    return verified;
  }

  // 4. Send MFA alert on new device login
  static async sendNewDeviceAlert(user, ip, userAgent) {
    const geo = geoip.lookup(ip.replace(/^::ffff:/, '')) || {};
    const location = {
      country: geo.country || 'Unknown',
      city: geo.city || 'Unknown',
    };

    await sendMFAAlertEmail(user, ip, location);

    await Logger.loginSuspicious(user.id, ip, userAgent, {
      trigger: 'mfa_required_new_device',
      location,
    });
  }

  // 5. Disable MFA (admin or user with password)
  static async disableMFA(userId) {
    await User.update(
      {
        mfa_secret: null,
        mfa_enabled: false,
      },
      { where: { id: userId } }
    );

    await Logger.log({
      userId,
      eventType: 'mfa_disabled',
      details: { method: 'user_request' },
    });
  }
}

export default MFAService;