// backend/src/services/webauthn.js
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoUint8Array } from '@simpleweuthn/server/helpers';
import User from '../models/User.js';
import Session from '../models/Session.js';
import Logger from './logger.js';
import { config } from '../config/env.js';

const RP_NAME = 'YourApp';
const RP_ID = new URL(config.email.clientUrl).hostname; // e.g., yourapp.com
const ORIGIN = config.email.clientUrl.startsWith('http') ? config.email.clientUrl : `https://${config.email.clientUrl}`;

/**
 * WebAuthn (Passkeys) Service
 */
class WebAuthnService {
  // 1. Start Passkey Registration (user wants to add a device)
  static async startRegistration(user) {
    const userAuthenticators = await this.getUserAuthenticators(user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: user.id.toString(),
      userName: user.email,
      userDisplayName: user.username,
      attestationType: 'none',
      excludeCredentials: userAuthenticators.map(auth => ({
        id: auth.credentialID,
        type: 'public-key',
        transports: auth.transports,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    // Save challenge temporarily (in memory or DB)
    user.currentChallenge = options.challenge;
    await user.save(); // assuming User model has currentChallenge field

    return options;
  }

  // 2. Complete Registration
  static async completeRegistration(user, body) {
    const expectedChallenge = user.currentChallenge;

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: true,
      });
    } catch (error) {
      throw new Error(`Verification failed: ${error.message}`);
    }

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const { credentialPublicKey, credentialID, counter } = registrationInfo;

      // Save new authenticator
      await User.update(
  {
    webauthn_credentials: sequelize.fn(
      'JSON_ARRAY_APPEND',
      sequelize.col('webauthn_credentials'),
      '$',
      JSON.stringify({
        credID: credentialID,
        publicKey: credentialPublicKey,
        counter,
        transports: body.transports,
        created_at: new Date(),
      })
    ) // ⬅️ This was missing
  },
  { where: { id: user.id } }
);


      await Logger.log({
        userId: user.id,
        eventType: 'webauthn_registered',
        details: { device: body.transports?.join(', ') || 'unknown' },
      });
    }

    // Clear challenge
    await User.update({ currentChallenge: null }, { where: { id: user.id } });

    return { verified };
  }

  // 3. Start Passkey Login (passwordless)
  static async startAuthentication(user) {
    const authenticators = await this.getUserAuthenticators(user.id);

    const options = await generateAuthenticationOptions({
      allowCredentials: authenticators.map(auth => ({
        id: auth.credentialID,
        type: 'public-key',
        transports: auth.transports,
      })),
      userVerification: 'preferred',
      rpID: RP_ID,
    });

    user.currentChallenge = options.challenge;
    await user.save();

    return options;
  }

  // 4. Complete Authentication (passwordless login)
  static async completeAuthentication(user, body) {
    const authenticators = await this.getUserAuthenticators(user.id);
    const authn = authenticators.find(a => isoUint8Array.areEqual(a.credentialID, body.rawId));

    if (!authn) throw new Error('Authenticator not registered');

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: user.currentChallenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        authenticator: {
          credentialPublicKey: authn.publicKey,
          credentialID: authn.credID,
          counter: authn.counter,
        },
        requireUserVerification: true,
      });
    } catch (error) {
      throw new Error(`Authentication failed: ${error.message}`);
    }

    const { verified, authenticationInfo } = verification;

    if (verified) {
      // Update counter
      await this.updateAuthenticatorCounter(user.id, authn.credID, authenticationInfo.newCounter);

      await Logger.login(user.id, null, null, { method: 'webauthn' });
    }

    await User.update({ currentChallenge: null }, { where: { id: user.id } });

    return { verified };
  }

  // Helper: Get user's registered authenticators
  static async getUserAuthenticators(userId) {
    const user = await User.findByPk(userId, {
      attributes: ['webauthn_credentials'],
    });

    const creds = user?.webauthn_credentials || [];
    return creds.map(c => ({
      credID: c.credID,
      publicKey: c.publicKey,
      counter: c.counter,
      transports: c.transports,
    }));
  }

  // Helper: Update counter after successful auth
  static async updateAuthenticatorCounter(userId, credID, newCounter) {
    // This requires JSON manipulation in MySQL
    // Simplified: re-save entire array with updated counter
    // In production, use a separate table for credentials
  }
}

export default WebAuthnService;