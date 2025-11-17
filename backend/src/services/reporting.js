// backend/src/services/reporting.js
import PDFDocument from 'pdfkit';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import Log from '../models/Log.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import BlockedIP from '../models/BlockedIP.js';
import { Op } from 'sequelize';

class ReportingService {
  // 1. Generate PDF Report (stream to response)
  static generatePDFReport(res, title, data, dateRange) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Security-Report-${format(new Date(), 'yyyy-MM-dd')}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('YourApp Security Report', { align: 'center' });
    doc.fontSize(14).text(title, { align: 'center' });
    doc.fontSize(10).text(`Generated: ${format(new Date(), 'PPPp')}`, { align: 'center' });
    doc.text(`Period: ${format(dateRange.start, 'PPP')} – ${format(dateRange.end, 'PPP')}`);
    doc.moveDown(2);

    // Summary Stats
    doc.fontSize(12).text('Summary', { underline: true });
    doc.fontSize(10).text(`Total Events: ${data.logs.length}`);
    doc.text(`Unique Users: ${new Set(data.logs.map(l => l.user_id)).size}`);
    doc.text(`Suspicious Logins: ${data.logs.filter(l => l.event_type === 'login_suspicious').length}`);
    doc.moveDown();

    // Top IPs
    const ipCount = {};
    data.logs.forEach(l => {
      if (l.ip_address) ipCount[l.ip_address] = (ipCount[l.ip_address] || 0) + 1;
    });
    const topIPs = Object.entries(ipCount).sort((a, b) => b[1] - a[1]).slice(0, 10);

    doc.fontSize(12).text('Top 10 IPs', { underline: true });
    topIPs.forEach(([ip, count]) => {
      doc.fontSize(10).text(`${ip} → ${count} events`);
    });
    doc.moveDown();

    // Recent Logs Table
    doc.fontSize(12).text('Recent Events', { underline: true });
    const tableTop = doc.y;
    const rowHeight = 20;
    let y = tableTop;

    const headers = ['Time', 'User', 'Event', 'IP', 'Details'];
    headers.forEach((h, i) => doc.text(h, 50 + i * 100, y, { width: 100 }));
    y += rowHeight;

    data.logs.slice(0, 50).forEach(log => {
      doc.fontSize(8);
      doc.text(format(new Date(log.timestamp), 'PPp'), 50, y, { width: 100 });
      doc.text(log.user?.username || '—', 150, y, { width: 100 });
      doc.text(log.event_type, 250, y, { width: 120 });
      doc.text(log.ip_address || '—', 370, y, { width: 100 });
      const details = log.details ? JSON.stringify(log.details).slice(0, 40) + '...' : '';
      doc.text(details, 470, y, { width: 100 });
      y += rowHeight;
      if (y > 750) {
        doc.addPage();
        y = 50;
      }
    });

    doc.end();
  }

  // 2. Generate CSV Report
  static generateCSVReport(res, logs) {
    const headers = ['Timestamp', 'User ID', 'Username', 'Event', 'IP', 'Details'];
    let csv = headers.join(',') + '\n';

    logs.forEach(log => {
      const row = [
        format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        log.user_id || '',
        log.user?.username || '',
        log.event_type,
        log.ip_address || '',
        JSON.stringify(log.details || {}).replace(/"/g, '""'),
      ];
      csv += row.map(v => `"${v}"`).join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="report-${format(new Date(), 'yyyy-MM-dd')}.csv"`);
    res.send(csv);
  }

  // 3. Get Report Data (last 7 days by default)
  static async getReportData(days = 7) {
    const start = startOfDay(subDays(new Date(), days));
    const end = endOfDay(new Date());

    const [logs, sessions, blockedIPs] = await Promise.all([
      Log.findAll({
        where: {
          timestamp: { [Op.between]: [start, end] },
        },
        include: [{ model: User, attributes: ['username'] }],
        order: [['timestamp', 'DESC']],
        limit: 1000,
      }),
      Session.count({ where: { created_at: { [Op.between]: [start, end] } } }),
      BlockedIP.findAll(),
    ]);

    return {
      logs,
      sessions,
      blockedIPs,
      dateRange: { start, end },
      stats: {
        totalLogins: logs.filter(l => l.event_type === 'login').length,
        suspicious: logs.filter(l => l.event_type === 'login_suspicious').length,
        failed: logs.filter(l => l.event_type === 'login_failed').length,
        newUsers: logs.filter(l => l.event_type === 'register').length,
      },
    };
  }

  // 4. Login Trends (for charts)
  static async getLoginTrends(days = 30) {
    const start = subDays(new Date(), days);
    const logs = await Log.findAll({
      where: {
        event_type: { [Op.in]: ['login', 'login_suspicious', 'register'] },
        timestamp: { [Op.gte]: start },
      },
      attributes: ['event_type', 'timestamp'],
    });

    const trends = {};
    logs.forEach(log => {
      const date = format(new Date(log.timestamp), 'yyyy-MM-dd');
      trends[date] = trends[date] || { date, login: 0, suspicious: 0, register: 0 };
      trends[date][log.event_type === 'login' ? 'login' : log.event_type === 'login_suspicious' ? 'suspicious' : 'register']++;
    });

    return Object.values(trends).sort((a, b) => a.date.localeCompare(b.date));
  }
}

export default ReportingService;