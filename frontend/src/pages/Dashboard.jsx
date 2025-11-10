// src/pages/Dashboard.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Authcontext';
import api from '../services/api';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch user sessions (trusted devices)
        const sessionRes = await api.get('/user/sessions');
        setSessions(sessionRes.data || []);

        // Check MFA status
        const mfaRes = await api.get('/auth/mfa/status');
        setMfaEnabled(mfaRes.data.enabled);
      } catch (err) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleRevokeSession = async (sessionId) => {
    try {
      await api.delete(`/user/sessions/${sessionId}`);
      setSessions(sessions.filter(s => s.id !== sessionId));
    } catch (err) {
      setError('Failed to revoke session.');
    }
  };

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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome back, {user.username || user.email}!</h1>
          <p className="mt-2 text-sm text-gray-600">Here's an overview of your account and recent activity.</p>
        </div>

        {/* Profile Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Account Details</h3>
              <dl className="mt-5 space-y-2">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-900">Email</dt>
                  <dd className="text-sm text-gray-500">{user.email}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-900">Role</dt>
                  <dd className="text-sm text-gray-500 capitalize">{user.role}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-900">MFA Status</dt>
                  <dd className="text-sm {mfaEnabled ? 'text-green-600' : 'text-red-600'}">
                    {mfaEnabled ? 'Enabled' : 'Disabled'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Active Sessions</h3>
              <p className="mt-1 text-sm text-gray-900">{sessions.length}</p>
              {sessions.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-gray-500">
                  {sessions.slice(0, 3).map(session => (
                    <li key={session.id} className="flex justify-between">
                      <span>{session.device_info?.slice(0, 20)}...</span>
                      <span>{new Date(session.expires_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <h3 className="text-sm font-medium text-gray-500">Security Actions</h3>
              <div className="mt-4 space-y-2">
                {!mfaEnabled && (
                  <button
                    onClick={() => navigate('/mfa-setup')}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700"
                  >
                    Enable MFA
                  </button>
                )}
                <button
                  onClick={() => navigate('/user/profile')}
                  className="w-full bg-gray-200 text-gray-900 py-2 px-4 rounded-md text-sm font-medium hover:bg-gray-300"
                >
                  Update Profile
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Recent Activity</h3>
            {sessions.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {sessions.slice(0, 5).map(session => (
                  <li key={session.id} className="py-4 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Login from {session.ip_address}</p>
                      <p className="text-sm text-gray-500">{new Date(session.created_at).toLocaleString()}</p>
                    </div>
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      className="text-red-600 hover:text-red-900 text-sm font-medium"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No recent activity.</p>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;