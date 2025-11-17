// backend/src/controllers/adminController.js
import { pool } from '../config/db.js';
import { format } from 'date-fns';
import PDFDocument from 'pdfkit';
import { Writable } from 'stream';
import { createObjectCsvStringifier } from 'csv-writer';
import Logger from '../services/logger.js';

// ---------------------------------------------------------------------------
// 1. Dashboard Metrics
// ---------------------------------------------------------------------------
export const getDashboardMetrics = async (req, res) => {
  try {
    const [[users]] = await pool.execute('SELECT COUNT(*) as count FROM users');
    const [[sessions]] = await pool.execute('SELECT COUNT(*) as count FROM sessions WHERE expires_at > NOW()');
    const [[logins]] = await pool.execute(`
      SELECT 
        COUNT(*) as loginCount,
        COUNT(CASE WHEN event_type = 'login_suspicious' THEN 1 END) as anomalyCount
      FROM logs 
      WHERE event_type IN ('login', 'login_suspicious') 
        AND timestamp >= NOW() - INTERVAL 7 DAY
    `);

    const metrics = {
      totalUsers: users.count,
      activeSessions: sessions.count,
      recentLogins: logins.loginCount || 0,
      anomalies: logins.anomalyCount || 0,
    };

    // Real-time emit
    global.emitLogEvent?.({
      user_id: req.user.id,
      event_type: 'admin_view_metrics',
      details: metrics,
      timestamp: new Date().toISOString(),
    });

    res.json(metrics);
  } catch (err) {
    console.error('Dashboard metrics error:', err);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
};

// ---------------------------------------------------------------------------
// 2. Login Trends (Last N days)
// ---------------------------------------------------------------------------
export const getLoginTrends = async (req, res) => {
  const days = Math.min(parseInt(req.query.days) || 30, 90); // Max 90 days
  try {
    const [rows] = await pool.execute(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(CASE WHEN event_type = 'login' THEN 1 END) as logins,
        COUNT(CASE WHEN event_type = 'login_suspicious' THEN 1 END) as anomalies,
        COUNT(CASE WHEN event_type = 'register' THEN 1 END) as registers
      FROM logs 
      WHERE timestamp >= NOW() - INTERVAL ? DAY
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `, [days]);

    const trends = rows.map(r => ({
      date: format(new Date(r.date), 'yyyy-MM-dd'),
      logins: r.logins || 0,
      anomalies: r.anomalies || 0,
      registers: r.registers || 0,
    }));

    global.emitLogEvent?.({
      user_id: req.user.id,
      event_type: 'admin_view_trends',
      details: { days },
      timestamp: new Date().toISOString(),
    });

    res.json(trends);
  } catch (err) {
    console.error('Login trends error:', err);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
};

// ---------------------------------------------------------------------------
// 3. View All Users (Paginated)
// ---------------------------------------------------------------------------
export const getUsers = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  try {
    const [users] = await pool.execute(`
      SELECT id, username, email, role, email_verified, created_at, last_login
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const [[total]] = await pool.execute('SELECT COUNT(*) as count FROM users');

    const response = {
      users,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit),
      },
    };

    global.emitLogEvent?.({
      user_id: req.user.id,
      event_type: 'admin_view_users',
      details: { page, limit },
      timestamp: new Date().toISOString(),
    });

    res.json(response);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// ---------------------------------------------------------------------------
// 4. Update User Role / Block
// ---------------------------------------------------------------------------
export const updateUser = async (req, res) => {
  const { userId } = req.params;
  const { role, isBlocked } = req.body;

  if (!role && isBlocked === undefined) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  if (role && !['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Use: user, admin' });
  }

  try {
    const updates = [];
    const values = [];

    if (role) { updates.push('role = ?'); values.push(role); }
    if (isBlocked !== undefined) { updates.push('is_blocked = ?'); values.push(isBlocked ? 1 : 0); }

    values.push(userId);

    await pool.execute(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    global.emitLogEvent?.({
      user_id: req.user.id,
      event_type: 'admin_update_user',
      details: { target_user_id: userId, role, isBlocked },
      timestamp: new Date().toISOString(),
    });

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// ---------------------------------------------------------------------------
// 5. View Logs (Paginated + Filters)
// ---------------------------------------------------------------------------
export const getLogs = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const filters = {};
  if (req.query.userId) filters.userId = req.query.userId;
  if (req.query.eventType) filters.eventType = req.query.eventType;
  if (req.query.ip) filters.ip = req.query.ip;
  if (req.query.startDate) filters.startDate = req.query.startDate;
  if (req.query.endDate) filters.endDate = req.query.endDate;

  try {
    let where = '1=1';
    const params = [];

    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'startDate') where += ' AND timestamp >= ?';
      else if (key === 'endDate') where += ' AND timestamp <= ?';
      else where += ` AND ${key} = ?`;
      params.push(value);
    });

    const [logs] = await pool.execute(`
      SELECT l.*, u.username 
      FROM logs l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE ${where}
      ORDER BY l.timestamp DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const [[total]] = await pool.execute(
      `SELECT COUNT(*) as count FROM logs WHERE ${where}`,
      params
    );

    const response = {
      logs,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit),
      },
    };

    global.emitLogEvent?.({
      user_id: req.user.id,
      event_type: 'admin_view_logs',
      details: { filters, page, limit },
      timestamp: new Date().toISOString(),
    });

    res.json(response);
  } catch (err) {
    console.error('Get logs error:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};

// ---------------------------------------------------------------------------
// 6. Block IP
// ---------------------------------------------------------------------------
export const blockIP = async (req, res) => {
  const { ip, reason = 'Manual block', days } = req.body;

  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return res.status(400).json({ error: 'Valid IP address required' });
  }

  const until = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  try {
    await pool.execute(
      `INSERT INTO blocked_ips (ip, reason, blocked_until) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), blocked_until = VALUES(blocked_until)`,
      [ip, reason, until]
    );

    const event = {
      user_id: req.user.id,
      event_type: 'ip_blocked',
      ip_address: ip,
      details: { reason, blocked_until: until?.toISOString() },
      timestamp: new Date().toISOString(),
    };

    global.emitLogEvent?.(event);

    res.json({ message: `IP ${ip} blocked` });
  } catch (err) {
    console.error('Block IP error:', err);
    res.status(500).json({ error: 'Failed to block IP' });
  }
};

// ---------------------------------------------------------------------------
// 7. Generate Report (PDF or CSV)
// ---------------------------------------------------------------------------
export const generateReport = async (req, res) => {
  const { format = 'pdf', type = 'daily', startDate, endDate } = req.query;

  if (!['pdf', 'csv'].includes(format)) {
    return res.status(400).json({ error: 'Format must be pdf or csv' });
  }

  let query = '';
  let params = [];

  try {
    if (type === 'daily') {
      query = `SELECT * FROM logs WHERE DATE(timestamp) = CURDATE() ORDER BY timestamp DESC`;
    } else if (type === 'weekly') {
      query = `SELECT * FROM logs WHERE timestamp >= NOW() - INTERVAL 7 DAY ORDER BY timestamp DESC`;
    } else if (startDate && endDate) {
      query = `SELECT * FROM logs WHERE timestamp BETWEEN ? AND ? ORDER BY timestamp DESC`;
      params = [startDate, endDate];
    } else {
      return res.status(400).json({ error: 'Invalid report parameters' });
    }

    const [rows] = await pool.execute(query, params);

    const filename = `report-${type}-${format(new Date(), 'yyyyMMdd')}`;

    if (format === 'csv') {
      const stringifier = createObjectCsvStringifier({
        header: [
          { id: 'id', title: 'ID' },
          { id: 'user_id', title: 'User ID' },
          { id: 'event_type', title: 'Event' },
          { id: 'ip_address', title: 'IP' },
          { id: 'timestamp', title: 'Time' },
        ],
      });

      const csv = stringifier.getHeaderString() + stringifier.stringifyRecords(rows);

      res
        .header('Content-Type', 'text/csv')
        .attachment(`${filename}.csv`)
        .send(csv);
    } else {
      const doc = new PDFDocument({ margin: 50 });
      res
        .header('Content-Type', 'application/pdf')
        .attachment(`${filename}.pdf`);

      const stream = new Writable({
        write(chunk, encoding, callback) {
          res.write(chunk, encoding);
          callback();
        },
        final(callback) {
          doc.end();
          callback();
        },
      });

      doc.pipe(stream);

      doc.fontSize(18).text(`Security Report - ${type.toUpperCase()}`, { align: 'center' });
      doc.moveDown();

      doc.fontSize(10);
      rows.forEach(log => {
        const line = `${format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')} | ${log.event_type} | User: ${log.user_id} | IP: ${log.ip_address}`;
        doc.text(line);
      });

      doc.end();
    }

    global.emitLogEvent?.({
      user_id: req.user.id,
      event_type: 'admin_generate_report',
      details: { format, type, startDate, endDate },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Generate report error:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

// ---------------------------------------------------------------------------
// Export Raw Functions (RBAC in routes)
// ---------------------------------------------------------------------------
export default {
  getDashboardMetrics,
  getLoginTrends,
  getUsers,
  updateUser,
  getLogs,
  blockIP,
  generateReport,
};