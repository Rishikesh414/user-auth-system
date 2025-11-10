// src/components/RealTimeLogFeed.jsx

import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/Authcontext';

const RealTimeLogFeed = ({ initialLogs = [] }) => {
  const { user } = useAuth();
  const [logs, setLogs] = useState(initialLogs);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user?.role === 'admin') return; // Only for admins

    // Initialize Socket.IO connection
    const socketInstance = io(process.env.VITE_API_URL || 'http://localhost:5000', {
      auth: { token: localStorage.getItem('accessToken') }
    });

    // Listen for new logs
    socketInstance.on('log', (newLog) => {
      setLogs(prev => [newLog, ...prev.slice(0, 50)]); // Keep last 50 logs
    });

    // Error handling
    socketInstance.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.close();
    };
  }, [user]);

  return (
    <div className="bg-white shadow rounded-lg mt-6 p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Real-Time Log Feed</h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {logs.length > 0 ? (
          logs.map((log) => (
            <div key={log.id || Date.now()} className="flex items-center p-3 bg-gray-50 rounded-md">
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  {log.event_type.toUpperCase()}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(log.timestamp).toLocaleTimeString()} | IP: {log.ip_address} | User: {log.user_id || 'N/A'}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {log.details?.message || JSON.stringify(log.details)}
                </div>
              </div>
              {log.event_type.includes('suspicious') && (
                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  Alert
                </span>
              )}
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500 text-center py-4">No logs yet. Waiting for activity...</p>
        )}
      </div>
      {socket && (
        <div className="mt-4 text-xs text-gray-500 text-center">
          Connected: {socket.connected ? 'Yes' : 'No'}
        </div>
      )}
    </div>
  );
};

export default RealTimeLogFeed;