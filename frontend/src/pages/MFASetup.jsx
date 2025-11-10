// src/pages/MFASetup.jsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Authcontext';
import api from '../services/api';
import QRCodeDisplay from '../components/QRCodeDisplay'; // Assuming this component exists for QR rendering

const MFASetup = () => {
  const [mfaType, setMfaType] = useState('totp'); // Default to TOTP; can be 'webauthn'
  const [setupData, setSetupData] = useState(null); // { secret, qrCode } for TOTP or { options } for WebAuthn
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleTypeChange = (type) => {
    setMfaType(type);
    setSetupData(null);
    setError('');
    setVerified(false);
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/mfa/setup', { type: mfaType });
      setSetupData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initialize MFA setup.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const token = formData.get('token');

    if (!token) {
      setError('Verification code is required.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // For TOTP verification
      if (mfaType === 'totp') {
        await api.post('/auth/mfa/verify', {
          token,
          secret: setupData.secret,
          userId: user.id,
          isSetup: true
        });
      } else if (mfaType === 'webauthn') {
        // WebAuthn verification happens in browser; assume credential is captured here
        // For simplicity, simulate or integrate with native API
        const credential = await navigator.credentials.create({ publicKey: setupData.options });
        await api.post('/auth/mfa/verify', {
          type: 'webauthn',
          response: credential,
          userId: user.id,
          isSetup: true
        });
      }

      setVerified(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">MFA Enabled!</h2>
          <p className="text-gray-600">Your multi-factor authentication is now active.</p>
          <div className="text-green-600">Redirecting to dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Set Up Multi-Factor Authentication
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Choose a method to secure your account.
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex space-x-4">
            <button
              onClick={() => handleTypeChange('totp')}
              className={`flex-1 py-2 px-4 border rounded-md ${mfaType === 'totp' ? 'bg-blue-600 text-white' : 'bg-white border-gray-300'}`}
            >
              Authenticator App (TOTP)
            </button>
            <button
              onClick={() => handleTypeChange('webauthn')}
              className={`flex-1 py-2 px-4 border rounded-md ${mfaType === 'webauthn' ? 'bg-blue-600 text-white' : 'bg-white border-gray-300'}`}
            >
              Biometric (WebAuthn)
            </button>
          </div>

          {!setupData ? (
            <button
              onClick={handleSetup}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Initializing...' : `Set Up ${mfaType.toUpperCase()}`}
            </button>
          ) : (
            <>
              {mfaType === 'totp' && setupData.qrCode && (
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-4">Scan this QR code with your authenticator app.</p>
                  <QRCodeDisplay dataUrl={setupData.qrCode} />
                  <p className="text-xs text-gray-500 mt-2">Secret (backup): {setupData.secret}</p>
                </div>
              )}

              {mfaType === 'webauthn' && (
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-4">Follow the browser prompt to register your biometric.</p>
                  {/* WebAuthn options can be passed to a custom hook or directly to navigator.credentials.create */}
                  <button
                    onClick={async () => {
                      try {
                        const credential = await navigator.credentials.create({ publicKey: setupData.options });
                        await api.post('/auth/mfa/verify', { type: 'webauthn', response: credential, userId: user.id, isSetup: true });
                        setVerified(true);
                      } catch (err) {
                        setError('WebAuthn setup failed.');
                      }
                    }}
                    className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700"
                  >
                    Register Biometric
                  </button>
                </div>
              )}

              <form onSubmit={handleVerify} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="token" className="block text-sm font-medium text-gray-700">
                    Verification Code
                  </label>
                  <input
                    id="token"
                    name="token"
                    type="text"
                    required
                    maxLength={mfaType === 'totp' ? '6' : undefined}
                    className="mt-1 appearance-none rounded-md block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder={mfaType === 'totp' ? 'Enter 6-digit code' : 'Biometric verified'}
                  />
                </div>

                {error && (
                  <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify & Enable'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="text-center">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-blue-600 hover:text-blue-500"
          >
            Skip for Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default MFASetup;