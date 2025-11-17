// backend/src/services/email.js
import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create transporter (SMTP or use SendGrid/Mailgun via SMTP)
const transporter = nodemailer.createTransporter({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.port === 465, // true for 465, false for other ports
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Verify connection on startup
transporter.verify((error) => {
  if (error) {
    console.error('Email SMTP connection failed:', error);
  } else {
    console.log('Email SMTP ready');
  }
});

/**
 * Load HTML template + replace variables
 */
const loadTemplate = async (name, data = {}) => {
  const templatePath = join(__dirname, '../templates/email', `${name}.html`);
  let html = await fs.readFile(templatePath, 'utf-8');

  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  return html;
};

/**
 * Send email with HTML template
 */
export const sendEmail = async ({ to, subject, template, data = {}, text }) => {
  try {
    let html = text;
    if (template) {
      html = await loadTemplate(template, {
        appName: 'YourApp',
        year: new Date().getFullYear(),
        clientUrl: config.email.clientUrl,
        ...data,
      });
    }

    const mailOptions = {
      from: `"YourApp" <${config.email.user}>`,
      to,
      subject,
      text: text || 'YourApp - Please open in HTML email client',
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent: ${info.messageId} → ${to}`);

    // Optional: Log email send
    global.emitLogEvent?.({
      event_type: 'email_sent',
      to,
      subject,
      template,
      timestamp: new Date().toISOString(),
    });

    return info;
  } catch (err) {
    console.error('Email send failed:', err);
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Predefined Email Functions
// ---------------------------------------------------------------------------

export const sendVerificationEmail = async (user) => {
  const token = user.email_verification_token;
  const link = `${config.email.clientUrl}/verify-email?token=${token}`;

  await sendEmail({
    to: user.email,
    subject: 'Verify Your Email Address',
    template: 'verify-email',
    data: {
      username: user.username,
      verifyLink: link,
    },
  });
};

export const sendPasswordResetEmail = async (user, token) => {
  const link = `${config.email.clientUrl}/reset-password?token=${token}`;

  await sendEmail({
    to: user.email,
    subject: 'Reset Your Password',
    template: 'reset-password',
    data: {
      username: user.username,
      resetLink: link,
    },
  });
};

export const sendMFAAlertEmail = async (user, ip, location) => {
  await sendEmail({
    to: user.email,
    subject: 'New Login from Unrecognized Device',
    template: 'mfa-alert',
    data: {
      username: user.username,
      ip_address: ip,
      country: location.country || 'Unknown',
      city: location.city || 'Unknown',
      time: new Date().toLocaleString('en-IN'),
    },
  });
};

export const sendAccountBlockedEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: 'Your Account Has Been Blocked',
    template: 'account-blocked',
    data: { username: user.username },
  });
};

export default {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendMFAAlertEmail,
  sendAccountBlockedEmail,
};