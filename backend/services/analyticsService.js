// backend/services/analyticsService.js
const EventEmitter = require('events');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

/**
 * Advanced Analytics Service
 * Tracks user activity, bandwidth, payments, and generates reports
 */
class AnalyticsService extends EventEmitter {
  constructor(db, config = {}) {
    super();
    this.db = db;
    this.logger = config.logger || console;
    this.retentionDays = config.retentionDays || 365;
  }

  /**
   * ==================== EVENT TRACKING ====================
   */

  /**
   * Track user login
   */
  async trackLogin(userId, username, ipAddress, userAgent) {
    try {
      await this.db.query(
        `INSERT INTO analytics_events (event_type, user_id, username, ip_address, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        ['login', userId, username, ipAddress, userAgent]
      );

      this.emit('event:login', { userId, username, ipAddress });
    } catch (error) {
      this.logger.error('Error tracking login:', error);
    }
  }

  /**
   * Track user logout
   */
  async trackLogout(userId, username, sessionDuration) {
    try {
      await this.db.query(
        `INSERT INTO analytics_events (event_type, user_id, username, data, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        ['logout', userId, username, JSON.stringify({ sessionDuration })]
      );

      this.emit('event:logout', { userId, username, sessionDuration });
    } catch (error) {
      this.logger.error('Error tracking logout:', error);
    }
  }

  /**
   * Track bandwidth usage
   */
  async trackBandwidthUsage(userId, username, bytesUsed, uploadBytes, downloadBytes) {
    try {
      const date = new Date().toISOString().split('T')[0];

      await this.db.query(
        `INSERT INTO bandwidth_usage (username, date, bytes_download, bytes_upload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username, date) 
         DO UPDATE SET 
           bytes_download = bandwidth_usage.bytes_download + $3,
           bytes_upload = bandwidth_usage.bytes_upload + $4`,
        [username, date, downloadBytes || 0, uploadBytes || 0]
      );

      this.emit('event:bandwidth', {
        userId,
        username,
        bytesUsed,
        uploadBytes,
        downloadBytes,
      });
    } catch (error) {
      this.logger.error('Error tracking bandwidth:', error);
    }
  }

  /**
   * Track payment
   */
  async trackPayment(userId, amount, currency, status, paymentMethod) {
    try {
      await this.db.query(
        `INSERT INTO analytics_events (event_type, user_id, data, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [
          'payment',
          userId,
          JSON.stringify({ amount, currency, status, paymentMethod }),
        ]
      );

      this.emit('event:payment', {
        userId,
        amount,
        currency,
        status,
        paymentMethod,
      });
    } catch (error) {
      this.logger.error('Error tracking payment:', error);
    }
  }

  /**
   * Track voucher redemption
   */
  async trackVoucherRedemption(userId, voucherId, voucherCode) {
    try {
      await this.db.query(
        `INSERT INTO analytics_events (event_type, user_id, data, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [
          'voucher_redeemed',
          userId,
          JSON.stringify({ voucherId, voucherCode }),
        ]
      );

      this.emit('event:voucher_redeemed', { userId, voucherId, voucherCode });
    } catch (error) {
      this.logger.error('Error tracking voucher:', error);
    }
  }

  /**
   * ==================== DASHBOARD ANALYTICS ====================
   */

  /**
   * Get dashboard overview
   */
  async getDashboardOverview() {
    try {
      const result = await this.db.query(
        `SELECT
          COUNT(DISTINCT hu.id) as total_users,
          COUNT(DISTINCT CASE WHEN hu.status = 'active' THEN hu.id END) as active_users,
          COUNT(DISTINCT CASE WHEN hu.last_login > NOW() - INTERVAL '1 day' THEN hu.id END) as users_today,
          COUNT(DISTINCT CASE WHEN hu.last_login > NOW() - INTERVAL '7 days' THEN hu.id END) as users_week,
          COALESCE(SUM(bu.total_bytes), 0) as total_bandwidth_used,
          COALESCE(AVG(hu.bandwidth_limit), 0) as avg_bandwidth_limit
         FROM hotspot_users hu
         LEFT JOIN bandwidth_usage bu ON hu.username = bu.username
         WHERE hu.created_at > NOW() - INTERVAL '30 days'`
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error getting dashboard overview:', error);
      return null;
    }
  }

  /**
   * Get real-time user activity
   */
  async getRealTimeActivity(limit = 20) {
    try {
      const result = await this.db.query(
        `SELECT 
          id,
          event_type,
          username,
          ip_address,
          created_at
         FROM analytics_events
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting real-time activity:', error);
      return [];
    }
  }

  /**
   * Get active users right now
   */
  async getActiveUsersNow() {
    try {
      const result = await this.db.query(
        `SELECT 
          COUNT(*) as active_count,
          COUNT(DISTINCT username) as unique_users,
          SUM(CASE WHEN ip_address IS NOT NULL THEN 1 ELSE 0 END) as connected
         FROM (
          SELECT DISTINCT username, ip_address
          FROM analytics_events
          WHERE event_type IN ('login', 'bandwidth')
          AND created_at > NOW() - INTERVAL '10 minutes'
         ) active`
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error getting active users:', error);
      return null;
    }
  }

  /**
   * ==================== BANDWIDTH ANALYTICS ====================
   */

  /**
   * Get bandwidth usage by user
   */
  async getBandwidthByUser(limit = 10) {
    try {
      const result = await this.db.query(
        `SELECT 
          username,
          SUM(total_bytes) as total_bytes,
          SUM(bytes_download) as total_download,
          SUM(bytes_upload) as total_upload,
          COUNT(*) as days_used,
          MAX(date) as last_used
         FROM bandwidth_usage
         WHERE date >= NOW()::date - INTERVAL '30 days'
         GROUP BY username
         ORDER BY total_bytes DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map((row) => ({
        ...row,
        total_bytes_gb: (row.total_bytes / (1024 ** 3)).toFixed(2),
        total_download_gb: (row.total_download / (1024 ** 3)).toFixed(2),
        total_upload_gb: (row.total_upload / (1024 ** 3)).toFixed(2),
      }));
    } catch (error) {
      this.logger.error('Error getting bandwidth by user:', error);
      return [];
    }
  }

  /**
   * Get daily bandwidth trend
   */
  async getDailyBandwidthTrend(days = 30) {
    try {
      const result = await this.db.query(
        `SELECT 
          date,
          SUM(total_bytes) as daily_bytes,
          COUNT(DISTINCT username) as users_today,
          AVG(total_bytes) as avg_user_usage
         FROM bandwidth_usage
         WHERE date >= NOW()::date - INTERVAL '${days} days'
         GROUP BY date
         ORDER BY date DESC`,
        []
      );

      return result.rows.map((row) => ({
        ...row,
        daily_gb: (row.daily_bytes / (1024 ** 3)).toFixed(2),
        avg_user_gb: (row.avg_user_usage / (1024 ** 3)).toFixed(2),
      }));
    } catch (error) {
      this.logger.error('Error getting daily bandwidth trend:', error);
      return [];
    }
  }

  /**
   * Get hourly bandwidth (last 24 hours)
   */
  async getHourlyBandwidth() {
    try {
      const result = await this.db.query(
        `SELECT 
          DATE_TRUNC('hour', created_at)::date as hour,
          COUNT(*) as event_count,
          SUM(CAST(data->>'bytes' AS BIGINT)) as bytes_used
         FROM analytics_events
         WHERE event_type = 'bandwidth'
         AND created_at > NOW() - INTERVAL '24 hours'
         GROUP BY DATE_TRUNC('hour', created_at)
         ORDER BY hour DESC`
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting hourly bandwidth:', error);
      return [];
    }
  }

  /**
   * ==================== USER ANALYTICS ====================
   */

  /**
   * Get user growth over time
   */
  async getUserGrowthTrend(days = 30) {
    try {
      const result = await this.db.query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as new_users,
          (SELECT COUNT(*) FROM hotspot_users hu2 
           WHERE hu2.created_at <= DATE(hu1.created_at)::timestamp + INTERVAL '1 day'
          ) as cumulative_users
         FROM hotspot_users hu1
         WHERE created_at >= NOW()::date - INTERVAL '${days} days'
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        []
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting user growth:', error);
      return [];
    }
  }

  /**
   * Get user demographics
   */
  async getUserDemographics() {
    try {
      const result = await this.db.query(
        `SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
          COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_users,
          COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked_users,
          AVG(EXTRACT(EPOCH FROM (expiry_date - NOW()))/86400) as avg_days_remaining,
          COUNT(CASE WHEN last_login > NOW() - INTERVAL '1 day' THEN 1 END) as daily_active,
          COUNT(CASE WHEN last_login > NOW() - INTERVAL '7 days' THEN 1 END) as weekly_active,
          COUNT(CASE WHEN last_login > NOW() - INTERVAL '30 days' THEN 1 END) as monthly_active
         FROM hotspot_users`
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error getting user demographics:', error);
      return null;
    }
  }

  /**
   * Get user session statistics
   */
  async getUserSessionStats() {
    try {
      const result = await this.db.query(
        `SELECT 
          AVG(EXTRACT(EPOCH FROM (logout_time - login_time))) as avg_session_duration,
          MAX(EXTRACT(EPOCH FROM (logout_time - login_time))) as max_session_duration,
          MIN(EXTRACT(EPOCH FROM (logout_time - login_time))) as min_session_duration,
          COUNT(*) as total_sessions,
          COUNT(DISTINCT username) as unique_users
         FROM session_logs
         WHERE logout_time IS NOT NULL`
      );

      return result.rows[0];
    } catch (error) {
      this.logger.error('Error getting session stats:', error);
      return null;
    }
  }

  /**
   * ==================== PAYMENT ANALYTICS ====================
   */

  /**
   * Get payment summary
   */
  async getPaymentSummary(days = 30) {
    try {
      const result = await this.db.query(
        `SELECT 
          COUNT(*) as total_transactions,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'refunded' THEN 1 END) as refunded,
          SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_revenue,
          AVG(CASE WHEN status = 'completed' THEN amount ELSE NULL END) as avg_transaction,
          currency
         FROM payments
         WHERE created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY currency`
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting payment summary:', error);
      return [];
    }
  }

  /**
   * Get revenue by date
   */
  async getRevenueByDate(days = 30) {
    try {
      const result = await this.db.query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as daily_revenue,
          COUNT(DISTINCT user_id) as unique_customers
         FROM payments
         WHERE created_at >= NOW()::date - INTERVAL '${days} days'
         AND status = 'completed'
         GROUP BY DATE(created_at)
         ORDER BY date DESC`
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting revenue by date:', error);
      return [];
    }
  }

  /**
   * Get payment method breakdown
   */
  async getPaymentMethodBreakdown() {
    try {
      const result = await this.db.query(
        `SELECT 
          payment_method,
          COUNT(*) as transaction_count,
          SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_amount,
          AVG(CASE WHEN status = 'completed' THEN amount ELSE NULL END) as avg_amount
         FROM payments
         WHERE status = 'completed'
         GROUP BY payment_method`
      );

      return result.rows;
    } catch (error) {
      this.logger.error('Error getting payment method breakdown:', error);
      return [];
    }
  }

  /**
   * ==================== REPORT GENERATION ====================
   */

  /**
   * Generate comprehensive report (JSON)
   */
  async generateReport(reportType = 'comprehensive', dateRange = { start: null, end: null }) {
    try {
      const dashboard = await this.getDashboardOverview();
      const bandwidth = await this.getBandwidthByUser();
      const userGrowth = await this.getUserGrowthTrend();
      const payments = await this.getPaymentSummary();
      const userDemographics = await this.getUserDemographics();

      const report = {
        generatedAt: new Date().toISOString(),
        reportType,
        dateRange,
        summary: {
          overview: dashboard,
          users: userDemographics,
          payments,
        },
        details: {
          topUsers: bandwidth,
          userGrowth,
          paymentMethods: await this.getPaymentMethodBreakdown(),
        },
      };

      return report;
    } catch (error) {
      this.logger.error('Error generating report:', error);
      throw error;
    }
  }

  /**
   * Generate PDF report
   */
  async generatePDFReport(reportData) {
    try {
      return new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const chunks = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Title
        doc.fontSize(24).font('Helvetica-Bold').text('Hotspot Analytics Report', {
          align: 'center',
        });
        doc.moveDown();

        // Generated date
        doc.fontSize(10).text(`Generated: ${reportData.generatedAt}`, {
          align: 'right',
        });
        doc.moveDown();

        // Summary section
        doc.fontSize(14).font('Helvetica-Bold').text('Summary', {
          underline: true,
        });
        doc.fontSize(10).font('Helvetica');

        if (reportData.summary?.overview) {
          const overview = reportData.summary.overview;
          doc.text(`Total Users: ${overview.total_users}`);
          doc.text(`Active Users: ${overview.active_users}`);
          doc.text(`Total Bandwidth: ${(overview.total_bandwidth_used / (1024 ** 3)).toFixed(2)} GB`);
        }

        doc.moveDown();

        // Top users section
        if (reportData.details?.topUsers) {
          doc.fontSize(14).font('Helvetica-Bold').text('Top Users by Bandwidth', {
            underline: true,
          });
          doc.fontSize(9).font('Helvetica');

          doc.table = reportData.details.topUsers.slice(0, 10).map((user) => ({
            username: user.username,
            usage: `${user.total_bytes_gb} GB`,
          }));

          reportData.details.topUsers.slice(0, 10).forEach((user) => {
            doc.text(`${user.username}: ${user.total_bytes_gb} GB`, { indent: 20 });
          });
        }

        doc.end();
      });
    } catch (error) {
      this.logger.error('Error generating PDF:', error);
      throw error;
    }
  }

  /**
   * Generate Excel report
   */
  async generateExcelReport(reportData) {
    try {
      const workbook = new ExcelJS.Workbook();

      // Summary sheet
      const summarySheet = workbook.addWorksheet('Summary');
      if (reportData.summary?.overview) {
        const overview = reportData.summary.overview;
        summarySheet.addRow(['Total Users', overview.total_users]);
        summarySheet.addRow(['Active Users', overview.active_users]);
        summarySheet.addRow(['Total Bandwidth (GB)', (overview.total_bandwidth_used / (1024 ** 3)).toFixed(2)]);
      }

      // Top users sheet
      const usersSheet = workbook.addWorksheet('Top Users');
      if (reportData.details?.topUsers) {
        usersSheet.columns = [
          { header: 'Username', key: 'username', width: 20 },
          { header: 'Usage (GB)', key: 'total_bytes_gb', width: 15 },
          { header: 'Download (GB)', key: 'total_download_gb', width: 15 },
          { header: 'Upload (GB)', key: 'total_upload_gb', width: 15 },
        ];

        reportData.details.topUsers.forEach((user) => {
          usersSheet.addRow(user);
        });
      }

      // Payments sheet
      const paymentsSheet = workbook.addWorksheet('Payments');
      if (reportData.summary?.payments) {
        paymentsSheet.columns = [
          { header: 'Period', key: 'date', width: 15 },
          { header: 'Total Revenue', key: 'revenue', width: 15 },
        ];
      }

      return await workbook.xlsx.writeBuffer();
    } catch (error) {
      this.logger.error('Error generating Excel:', error);
      throw error;
    }
  }

  /**
   * ==================== DATA CLEANUP ====================
   */

  /**
   * Archive old data
   */
  async archiveOldData() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      await this.db.query(
        'DELETE FROM analytics_events WHERE created_at < $1',
        [cutoffDate]
      );

      await this.db.query(
        'DELETE FROM bandwidth_usage WHERE date < $1::date',
        [cutoffDate]
      );

      this.logger.info('Archived old analytics data');
    } catch (error) {
      this.logger.error('Error archiving data:', error);
    }
  }
}

module.exports = AnalyticsService;
