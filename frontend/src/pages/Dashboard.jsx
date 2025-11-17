// src/pages/Dashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';   // Fixed import
import api from '../services/api';
import { io } from 'socket.io-client';
import { formatDistanceToNow } from 'date-fns';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const Dashboard = () => {
  const { user, accessToken, logout } = useAuth();
  const navigate = useNavigate();

  // State
  const [sessions, setSessions] = useState([]);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // ────── Helper: Parse User Agent → Device Info
  const parseDevice = (ua) => {
    if (!ua) return { browser: 'Unknown', os: 'Unknown', isMobile: false };

    const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
    let browser = 'Unknown';
    let os = 'Unknown';

    if (/Chrome/i.test(ua)) browser = 'Chrome';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
    else if (/Edge/i.test(ua)) browser = 'Edge';

    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Mac/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';

    return { browser, os, isMobile };
  };

  // ────── Fetch Dashboard Data
  const fetchData = useCallback(async () => {
    try {
      const [sessionRes, mfaRes] = await Promise.all([
        api.get('/session/my'),
        api.get('/auth/mfa/status')
      ]);

      const fetchedSessions = sessionRes.data.sessions || [];
      setSessions(fetchedSessions);

      // Identify current session
      const currentToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const current = fetchedSessions.find(s => s.refresh_token === currentToken);
      if (current) setCurrentSessionId(current.id);

      setMfaEnabled(mfaRes.data.enabled);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [user, fetchData]);

  // ────── Real-time Session Updates
  useEffect(() => {
    if (!accessToken) return;

    const socket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('session:request-list'); // Force sync on connect
    });

    socket.on('disconnect', () => setSocketConnected(false));

    // Full session list
    socket.on('session:list', ({ sessions: newSessions }) => {
      setSessions(newSessions);
      const currentToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
      const current = newSessions.find(s => s.refresh_token === currentToken);
      if (current) setCurrentSessionId(current.id);
    });

    // Single session revoked
    socket.on('session:revoked', ({ sessionId }) => {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (sessionId === currentSessionId) {
        // Current session revoked → force logout
        logout();
        navigate('/login');
      }
    });

    // All other sessions revoked
    socket.on('session:revoked_all_other', () => {
      setSessions(prev => prev.filter(s => s.id === currentSessionId));
    });

    return () => socket.close();
  }, [accessToken, currentSessionId, logout, navigate]);

  // ────── Revoke Session
  const handleRevokeSession = async (sessionId) => {
    if (sessionId === currentSessionId) {
      if (!window.confirm('This is your current session. Revoking it will log you out. Continue?')) {
        return;
      }
    }

    try {
      await api.delete(`/session/revoke/${sessionId}`);
      // Real-time update handled by socket
    } catch (err) {
      setError('Failed to revoke session.');
    }
  };

  // ────── UI
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl">Loading Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {user.username || user.email}!
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Here's an overview of your account and recent activity.{' '}
              <span className={socketConnected ? 'text-green-600' : 'text-gray-500'}>
                {socketConnected ? 'Live' : 'Offline'}
              </span>
            </p>
          </div>
          <button
            onClick={logout}
            className="text-sm text-red-600 hover:text-red-800 font-medium"
          >
            Logout
          </button>
        </div>

        {/* ────── Profile Cards ────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">

          {/* Account Details */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-4">Account Details</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-900">Email</dt>
                <dd className="text-sm text-gray-500 truncate max-w-[150px]">{user.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-900">Role</dt>
                <dd className="text-sm text-gray-500 capitalize">{user.role}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-900">MFA</dt>
                <dd className={`text-sm font-medium ${mfaEnabled ? 'text-green-600' : 'text-red-600'}`}>
                  {mfaEnabled ? 'Enabled' : 'Disabled'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Active Sessions */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-4">Active Sessions</h3>
            <p className="text-2xl font-bold text-gray-900">{sessions.length}</p>
            {sessions.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm text-gray-600">
                {sessions.slice(0, 3).map(s => {
                  const device = parseDevice(s.user_agent);
                  const isCurrent = s.id === currentSessionId;
                  return (
                    <li key={s.id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs">{device.isMobile ? 'Phone' : 'Laptop'}</span>
                        <span className="truncate max-w-[100px]">{device.browser} on {device.os}</span>
                        {isCurrent && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">This device</span>}
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Security Actions */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-500 mb-4">Security Actions</h3>
            <div className="space-y-3">
              {!mfaEnabled && (
                <button
                  onClick={() => navigate('/mfa-setup')}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 transition"
                >
                  Enable MFA
                </button>
              )}
              <button
                onClick={() => navigate('/user/profile')}
                className="w-full bg-gray-200 text-gray-900 py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-300 transition"
                >
                Update Profile
              </button>
            </div>
          </div>
        </div>

        {/* ────── Recent Activity ────── */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-5">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
            {sessions.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {sessions.map(session => {
                  const device = parseDevice(session.user_agent);
                  const isCurrent = session.id === currentSessionId;
                  return (
                    <li key={session.id} className="py-4 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold
                            ${device.isMobile ? 'bg-indigo-500' : 'bg-teal-500'}`}>
                            {device.isMobile ? 'Phone' : 'Laptop'}
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            Login from {session.ip_address}
                            {isCurrent && <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Current</span>}
                          </p>
                          <p className="text-sm text-gray-500">
                            {device.browser} on {device.os} • {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      {!isCurrent && (
                        <button
                          onClick={() => handleRevokeSession(session.id)}
                          className="text-red-600 hover:text-red-900 text-sm font-medium"
                        >
                          Revoke
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No active sessions.</p>
            )}
          </div>
        </div>

        {/* ────── Error ────── */}
        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;