// src/pages/MFAVerify.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/Authcontext';
import api from '../services/api';

const MFAVerify = () => {
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({
    email: searchParams.get('email') || '', // From login redirect
    token: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaType, setMfaType] = useState('totp'); // Default; can be passed via query or context
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    // Optionally set mfaType from query param if passed from login
    const type = searchParams.get('type');
    if (type) {
      setMfaType(type);
    }
  }, [searchParams]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError('');
  };

  const validateForm = () => {
    if (!formData.token) {
      return 'Verification code is required.';
    }
    if (mfaType === 'totp' && formData.token.length !== 6) {
      return 'Enter a valid 6-digit code.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      let response;
      if (mfaType === 'webauthn') {
        // Fetch auth options
        const optionsRes = await api.post('/auth/mfa/setup', { type: 'webauthn' });
        const options = optionsRes.data.options;

        // Browser WebAuthn assertion
        if ('credentials' in navigator) {
          const credential = await navigator.credentials.get({ publicKey: options });
          response = await api.post('/auth/mfa/verify', {
            type: 'webauthn',
            response: credential,
            userId: formData.email // Backend resolves email to ID
          });
        } else {
          throw new Error('WebAuthn not supported.');
        }
      } else {
        // TOTP
        response = await api.post('/auth/mfa/verify', {
          token: formData.token,
          userId: formData.email,
          type: 'totp'
        });
      }

      // Success: login and redirect
      await login(response.data);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchType = () => {
    setMfaType(mfaType === 'totp' ? 'webauthn' : 'totp');
    setFormData({ ...formData, token: '' });
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Verify Your Identity
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {mfaType === 'totp' 
              ? 'Enter the 6-digit code from your authenticator app.' 
              : 'Use your device biometric to verify.'
            }
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {mfaType === 'totp' && (
            <div>
              <label htmlFor="token" className="sr-only">
                Verification Code
              </label>
              <input
                id="token"
                name="token"
                type="text"
                required
                maxLength="6"
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Enter 6-digit code"
                value={formData.token}
                onChange={handleChange}
                disabled={loading}
                autoFocus
              />
            </div>
          )}

          {mfaType === 'webauthn' && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-600 mb-4">Click below to authenticate with biometrics.</p>
              <button
                type="button"
                onClick={handleSubmit} // Triggers WebAuthn in submit
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md text-sm font-medium"
              >
                {loading ? 'Verifying...' : 'Use Biometric'}
              </button>
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || (mfaType === 'webauthn' && !('credentials' in navigator))}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </div>

          <div className="text-center space-y-2">
            <button
              type="button"
              onClick={handleSwitchType}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Use {mfaType === 'totp' ? 'Biometric' : 'Authenticator App'} instead
            </button>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Back to Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MFAVerify;