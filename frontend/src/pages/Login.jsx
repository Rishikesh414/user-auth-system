// src/pages/Login.jsx

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/Authcontext';
import api from '../services/api';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaType, setMfaType] = useState(''); // 'totp' or 'webauthn'
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    if (error) setError('');
  };

  const validateForm = () => {
    if (!formData.email || !formData.password) {
      return 'Email and password are required.';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      return 'Invalid email format.';
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
    setMfaRequired(false);

    try {
      const response = await api.post('/auth/login', formData);

      if (response.data.mfaRequired) {
        // Handle anomaly-triggered MFA
        setMfaRequired(true);
        setMfaType(response.data.mfaType);
        setError('Security check required. Please verify with your authenticator.');
        return;
      }

      // Successful login
      await login(response.data);
      navigate('/dashboard');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Login failed. Please try again.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Handle MFA verification (for TOTP or WebAuthn)
  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // For TOTP: assume token input
      // For WebAuthn: browser handles, but here we can trigger
      if (mfaType === 'webauthn') {
        // WebAuthn flow: Get options, create/get credential, verify
        const optionsRes = await api.post('/auth/mfa/setup', { type: 'webauthn' });
        const options = optionsRes.data.options;
        
        // Use WebAuthn API (requires publicCredential or privateCredential polyfill if needed)
        if ('credentials' in navigator) {
          let credential;
          if (optionsRes.data.mfaType === 'setup') { // During setup
            credential = await navigator.credentials.create({ publicKey: options });
          } else {
            credential = await navigator.credentials.get({ publicKey: options });
          }
          const verifyRes = await api.post('/auth/mfa/verify', {
            type: 'webauthn',
            response: credential,
            userId: formData.email // Or from context
          });
          await login(verifyRes.data);
          navigate('/dashboard');
        } else {
          setError('WebAuthn not supported in this browser.');
        }
      } else {
        // TOTP flow: Assume input field for token
        const token = e.target.token.value;
        const verifyRes = await api.post('/auth/mfa/verify', {
          token,
          userId: formData.email, // Resolve to user ID via backend
          type: 'totp'
        });
        await login(verifyRes.data);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'MFA verification failed.');
    } finally {
      setLoading(false);
    }
  };

  if (mfaRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Verify Identity
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {mfaType === 'totp' ? 'Enter your authenticator code.' : 'Use your biometric to verify.'}
            </p>
          </div>
          <form className="mt-8 space-y-6" onSubmit={handleMfaSubmit}>
            {mfaType === 'totp' && (
              <div>
                <input
                  type="text"
                  name="token"
                  required
                  maxLength="6"
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Enter 6-digit code"
                />
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
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            <div className="text-center">
              <button
                onClick={() => setMfaRequired(false)}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Back to Login
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
              create a new account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </div>

          <div className="text-sm">
            <Link to="/forgot-password" className="font-medium text-blue-600 hover:text-blue-500">
              Forgot your password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;