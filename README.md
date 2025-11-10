User Authentication System

A secure, production-ready user authentication system with multi-factor authentication (MFA), anomaly detection, real-time admin dashboard, and reporting. Built with React + Vite (frontend) and Node.js + Express (backend), using MySQL for storage.


Features

User Registration & Login: Password hashing (bcrypt), JWT tokens with refresh.
Email Verification: Magic links via Nodemailer.
MFA Support: TOTP (Google Authenticator QR codes) + WebAuthn (biometric/fingerprint).
Anomaly Detection: GeoIP, device fingerprinting, AbuseIPDB integration for suspicious logins.
Admin Panel: Real-time logs (Socket.IO), RBAC (Role-Based Access Control), IP blocking, CSV/PDF reports.
Security: Rate limiting, Helmet, CORS, input validation.
Dashboard: User sessions management, activity logs.
Responsive UI: Tailwind CSS for modern, mobile-friendly design.
