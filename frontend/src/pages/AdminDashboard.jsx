// src/pages/AdminDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/Authcontext';          // <-- Fixed import
import api from '../services/api';
import { io } from 'socket.io-client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar
} from 'recharts';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

const AdminDashboard = () => {
  const { user, accessToken } = useAuth();

  // ────── State ──────
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    activeSessions: 0,
    recentLogins: 0,
    anomalies: 0,
  });
  const [chartData, setChartData] = useState([]);   // login-trends + registers
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [socket, setSocket] = useState(null);

  // ────── Helpers ──────
  const updateChart = useCallback((newLog) => {
    setChartData(prev => {
      const today = new Date().toISOString().split('T')[0];
      const dayEntry = prev.find(d => d.date === today) || { date: today, logins: 0, anomalies: 0, registers: 0 };

      if (newLog.event_type === 'login') dayEntry.logins++;
      if (newLog.event_type === 'login_suspicious') dayEntry.anomalies++;
      if (newLog.event_type === 'register') dayEntry.registers++;

      // keep only last 30 days
      const updated = prev.filter(d => d.date !== today).concat(dayEntry);
      return updated.slice(-30);
    });
  }, []);

  const updateMetrics = useCallback((newLog) => {
    setMetrics(prev => ({
      ...prev,
      recentLogins: newLog.event_type === 'login' ? prev.recentLogins + 1 : prev.recentLogins,
      anomalies: newLog.event_type === 'login_suspicious' ? prev.anomalies + 1 : prev.anomalies,
    }));
  }, []);

  // ────── Initial Data Load ──────
  useEffect(() => {
    if (!user || user.role !== 'admin') return;   // guarded by router

    const fetchMetrics = async () => {
      try {
        const [usersRes, sessionsRes, logsRes, chartRes] = await Promise.all([
          api.get('/admin/users/count'),
          api.get('/admin/sessions/count'),
          api.get('/admin/logs/recent?limit=7'),
          api.get('/admin/analytics/login-trends?days=30')
        ]);

        setMetrics({
          totalUsers: usersRes.data.count,
          activeSessions: sessionsRes.data.count,
          recentLogins: logsRes.data.loginCount ?? 0,
          anomalies: logsRes.data.anomalyCount ?? 0,
        });
        setChartData(chartRes.data ?? []);
      } catch (err) {
        setError('Failed to load dashboard metrics.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [user]);

  // ────── Socket.IO Real-time ──────
  useEffect(() => {
    if (!accessToken) return;

    const newSocket = io(SOCKET_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setSocketConnected(true);
    });
    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setSocketConnected(false);
    });
    newSocket.on('connect_error', (err) => {
      console.error('Socket error:', err.message);
      setSocketConnected(false);
    });

    // ---- Admin-room events (your backend emits `admin:log-realtime`) ----
    newSocket.on('admin:log-realtime', (log) => {
      updateMetrics(log);
      updateChart(log);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [accessToken, updateMetrics, updateChart]);

  // ────── UI ──────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-xl">Loading Admin Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Header + connection status */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="mt-2 text-sm text-gray-600">
              Overview of system metrics and activity.{' '}
              <span className={socketConnected ? 'text-green-600' : 'text-red-600'}>
                {socketConnected ? 'Live' : 'Disconnected'}
              </span>
            </p>
          </div>
        </div>

        {/* ────── Metrics Cards ────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Users */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-1.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Users</dt>
                    <dd className="text-lg font-medium text-gray-900">{metrics.totalUsers}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Active Sessions */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656-.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Active Sessions</dt>
                    <dd className="text-lg font-medium text-gray-900">{metrics.activeSessions}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Logins */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Recent Logins</dt>
                    <dd className="text-lg font-medium text-gray-900">{metrics.recentLogins}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Anomalies */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Anomalies Detected</dt>
                    <dd className="text-lg font-medium text-gray-900">{metrics.anomalies}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ────── Charts ────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Login Trends */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Login Trends (Last 30 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="logins" stroke="#8884d8" name="Logins" />
                <Line type="monotone" dataKey="anomalies" stroke="#ff7300" name="Anomalies" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Event Distribution */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Event Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="logins" fill="#8884d8" name="Logins" />
                <Bar dataKey="registers" fill="#82ca9d" name="Registers" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ────── Quick Actions ────── */}
        <div className="bg-white shadow rounded-lg p-6 mb-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => window.location.href = '/admin/logs'}
              className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition"
            >
              View Logs
            </button>
            <button
              onClick={() => window.location.href = '/admin/reports'}
              className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition"
            >
              Generate Report
            </button>
            <button
              onClick={() => window.location.href = '/admin/users'}
              className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition"
            >
              Manage Users
            </button>
          </div>
        </div>

        {/* ────── Error ────── */}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;