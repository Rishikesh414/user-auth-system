import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/Authcontext";
import api from "../services/api";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaType, setMfaType] = useState("");

  const navigate = useNavigate();
  const { login } = useAuth();

  // handle input changes
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError("");
  };

  // simple validation
  const validateForm = () => {
    if (!formData.email || !formData.password)
      return "Email and password are required.";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) return "Invalid email format.";
    return null;
  };

  // login submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");
    setMfaRequired(false);

    try {
      const response = await api.post("/auth/login", formData);

      if (response.data.mfaRequired) {
        setMfaRequired(true);
        setMfaType(response.data.mfaType);
        setError("Security check required. Please verify your identity.");
        return;
      }

      await login(response.data);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // MFA verification
  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mfaType === "webauthn") {
        const optionsRes = await api.post("/auth/mfa/setup", { type: "webauthn" });
        const options = optionsRes.data.options;

        if ("credentials" in navigator) {
          const credential = await navigator.credentials.get({ publicKey: options });
          const verifyRes = await api.post("/auth/mfa/verify", {
            type: "webauthn",
            response: credential,
            userId: formData.email,
          });
          await login(verifyRes.data);
          navigate("/dashboard");
        } else {
          setError("WebAuthn is not supported in this browser.");
        }
      } else {
        const token = e.target.token.value;
        const verifyRes = await api.post("/auth/mfa/verify", {
          token,
          userId: formData.email,
          type: "totp",
        });
        await login(verifyRes.data);
        navigate("/dashboard");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  // MFA Verification Page
  if (mfaRequired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-blue-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 7v5l3 3" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Two-Factor Verification</h2>
            <p className="mt-2 text-sm text-gray-600">
              {mfaType === "totp"
                ? "Enter the 6-digit code from your authenticator app."
                : "Use your security key or biometric verification."}
            </p>
          </div>

          <form onSubmit={handleMfaSubmit} className="space-y-5">
            {mfaType === "totp" && (
              <input
                type="text"
                name="token"
                required
                maxLength="6"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full text-center text-2xl font-mono tracking-widest px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="000000"
                autoFocus
              />
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      opacity="0.3"
                    />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Verifying...
                </>
              ) : (
                "Verify Identity"
              )}
            </button>
          </form>

          <button
            onClick={() => setMfaRequired(false)}
            className="w-full text-center text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  // Normal Login Page
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-7">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900">Welcome Back</h2>
          <p className="mt-2 text-sm text-gray-600">
            {/* Or{" "}
            <Link
              to="/register"
              className="font-semibold text-blue-600 hover:text-blue-700 underline"
            >
              create a new account
            </Link> */}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder-gray-400"
              placeholder="you@example.com"
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
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition placeholder-gray-400"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                    opacity="0.3"
                  />
                  <path fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Signing In...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="text-center">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Forgot your password?
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
