// src/components/Navbar.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/Authcontext';
import { Menu, X, User, LogOut, Shield, FileText } from 'lucide-react'; // Optional: remove if not using lucide

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="bg-white shadow-md border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">

          {/* Logo */}
          <div className="flex items-center">
            <Link
              to={user ? '/dashboard' : '/login'}
              className="flex items-center space-x-2 text-xl font-bold text-indigo-600 hover:text-indigo-700 transition"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                A
              </div>
              <span>AuthSystem</span>
            </Link>
          </div>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-1">
            {!user ? (
              <>
                <Link
                  to="/login"
                  className="text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 px-5 py-2 rounded-lg text-sm font-medium shadow-sm transition transform hover:-translate-y-0.5"
                >
                  Register
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/dashboard"
                  className="text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5"
                >
                  <User className="w-4 h-4" />
                  Dashboard
                </Link>

                {user.role === 'admin' && (
                  <>
                    <Link
                      to="/admin/dashboard"
                      className="text-gray-700 hover:text-purple-600 hover:bg-purple-50 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5"
                    >
                      <Shield className="w-4 h-4" />
                      Admin
                    </Link>
                    <Link
                      to="/admin/logs"
                      className="text-gray-700 hover:text-purple-600 hover:bg-purple-50 px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5"
                    >
                      <FileText className="w-4 h-4" />
                      Logs
                    </Link>
                  </>
                )}

                {/* User Info + Logout */}
                <div className="flex items-center space-x-3 pl-4 border-l border-gray-200">
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {user.username?.[0].toUpperCase() || user.email[0].toUpperCase()}
                    </div>
                    <span className="hidden lg:block font-medium">
                      {user.username || user.email.split('@')[0]}
                    </span>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 shadow-sm hover:shadow-md"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="hidden sm:inline">Logout</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 transition"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white">
          <div className="px-4 pt-3 pb-4 space-y-2">
            {!user ? (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg text-base font-medium transition"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 px-3 py-2 rounded-lg text-base font-medium transition text-center"
                >
                  Register
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg text-base font-medium transition"
                >
                  <User className="w-5 h-5" />
                  Dashboard
                </Link>

                {user.role === 'admin' && (
                  <>
                    <Link
                      to="/admin/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 text-gray-700 hover:text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg text-base font-medium transition"
                    >
                      <Shield className="w-5 h-5" />
                      Admin Panel
                    </Link>
                    <Link
                      to="/admin/logs"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 text-gray-700 hover:text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg text-base font-medium transition"
                    >
                      <FileText className="w-5 h-5" />
                      View Logs
                    </Link>
                  </>
                )}

                <div className="border-t border-gray-100 pt-3 mt-3">
                  <div className="flex items-center justify-between px-3 mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {user.username?.[0].toUpperCase() || user.email[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {user.username || user.email.split('@')[0]}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      handleLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-base font-medium transition flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;