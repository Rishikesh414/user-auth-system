// src/context/AuthContext.jsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { jwtDecode } from 'jwt-decode'; // Changed to named import

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken'));
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken'));

  // Decode token to get user info (id, role, etc.)
  const getUserFromToken = (token) => {
    if (!token) return null;
    try {
      const decoded = jwtDecode(token); // Now using named import
      return { id: decoded.id, role: decoded.role || 'user', email: decoded.email, username: decoded.username };
    } catch (err) {
      console.error('Invalid token:', err);
      return null;
    }
  };

  // Initial load: Check stored tokens
  useEffect(() => {
    const initAuth = async () => {
      if (accessToken) {
        const userData = getUserFromToken(accessToken);
        if (userData) {
          setUser(userData);
        } else {
          // Token invalid, try refresh
          await refreshAccessToken();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  // Login: Store tokens and set user
  const login = async (tokens) => {
    const { accessToken: newAccess, refreshToken: newRefresh } = tokens;
    localStorage.setItem('accessToken', newAccess);
    localStorage.setItem('refreshToken', newRefresh);
    setAccessToken(newAccess);
    setRefreshToken(newRefresh);
    const userData = getUserFromToken(newAccess);
    setUser(userData);
  };

  // Logout: Clear storage and state
  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    // Optional: Call backend logout endpoint
    api.post('/auth/logout').catch(console.error);
  };

  // Refresh access token using refresh token
  const refreshAccessToken = async () => {
    try {
      const response = await api.post('/auth/refresh', { refreshToken });
      const { accessToken: newAccess } = response.data;
      localStorage.setItem('accessToken', newAccess);
      setAccessToken(newAccess);
      const userData = getUserFromToken(newAccess);
      setUser(userData);
      return true;
    } catch (err) {
      // Refresh failed, logout
      logout();
      return false;
    }
  };

  // Remove the interceptor useEffect since it's now in api.js

  const value = {
    user,
    login,
    logout,
    loading,
    accessToken,
    refreshToken,
    refreshAccessToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;