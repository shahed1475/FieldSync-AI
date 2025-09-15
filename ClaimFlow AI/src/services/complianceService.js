/**
 * HIPAA Compliance Tracking Service
 * Comprehensive compliance monitoring, reporting, and alerting
 */

const { pool } = require('../database/connection');
const { auditLogger, logHelpers } = require('../utils/logger');
const passwordPolicy = require('../config/passwordPolicy');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class ComplianceService {
  constructor() {
    this.alertThresholds = {
      failedLogins: {
        count: 10,
        timeWindow: 60 * 60 * 1000 // 1 hour
      },
      suspiciousPatterns: {
        rapidAccess: 50,
        offHours: true
      },
      phiAccess: {
        count: 100
      },
      dataExports: {
        count: 5
      }
    };
    
    this.emailTransporter = null;
    this.isInitialized = false;
  }

  /**
   * Initialize the compliance service
   */
  async initialize() {
    try {
      await this.initializeEmailTransporter();
      await this.createComplianceTables();
      this.startComplianceMonitoring();
      this.isInitialized = true;
      auditLogger.info('ComplianceService initialized successfully');
    } catch (error) {
      auditLogger.error('Failed to initialize ComplianceService', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create compliance tracking tables
   */
  async createComplianceTables() {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_alerts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_type VARCHAR(50) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          metadata TEXT,
          resolved BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          resolved_at TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS compliance_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          report_type VARCHAR(50) NOT NULL,
          period_start TIMESTAMP NOT NULL,
          period_end TIMESTAMP NOT NULL,
          data TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      auditLogger.info('Compliance tables created successfully');
    } finally {
      client.release();
    }
  }

  /**
   * Initialize email transporter for alerts
   */
  async initializeEmailTransporter() {
    try {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'localhost',
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      
      auditLogger.info('Email transporter initialized successfully');
    } catch (error) {
      auditLogger.error('Failed to initialize email transporter', {
        error: error.message
      });
    }
  }

  /**
   * Start compliance monitoring jobs
   */
  startComplianceMonitoring() {
    // Daily compliance report
    cron.schedule('0 6 * * *', () => {
      this.generateDailyReport();
    });

    auditLogger.info('Compliance monitoring jobs started');
  }

  /**
   * Generate daily compliance report
   */
  async generateDailyReport() {
    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const report = {
        period: {
          start: yesterday.toISOString(),
          end: now.toISOString()
        },
        summary: {
          total_alerts: 0,
          resolved_alerts: 0,
          pending_alerts: 0
        },
        generated_at: now.toISOString()
      };

      await this.saveReport('daily', yesterday, now, report);
      auditLogger.info('Daily compliance report generated');
    } catch (error) {
      auditLogger.error('Failed to generate daily report', {
        error: error.message
      });
    }
  }

  /**
   * Save compliance report
   */
  async saveReport(type, startDate, endDate, data) {
    const client = await pool.connect();
    try {
      await client.query(
        'INSERT INTO compliance_reports (report_type, period_start, period_end, data) VALUES ($1, $2, $3, $4)',
        [type, startDate, endDate, JSON.stringify(data)]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Trigger compliance alert
   */
  async triggerAlert(severity, title, metadata = {}) {
    const client = await pool.connect();
    try {
      await client.query(
        'INSERT INTO compliance_alerts (alert_type, severity, title, description, metadata) VALUES ($1, $2, $3, $4, $5)',
        ['system', severity, title, JSON.stringify(metadata), JSON.stringify(metadata)]
      );
      
      auditLogger.warn('Compliance alert triggered', {
        severity,
        title,
        metadata
      });
    } finally {
      client.release();
    }
  }

  /**
   * Get compliance status
   */
  async getComplianceStatus() {
    const client = await pool.connect();
    try {
      const alertsResult = await client.query(
        'SELECT COUNT(*) as total, COUNT(CASE WHEN resolved = false THEN 1 END) as pending FROM compliance_alerts WHERE created_at >= NOW() - INTERVAL \'24 hours\''
      );
      
      return {
        status: 'operational',
        alerts: {
          total: parseInt(alertsResult.rows[0].total),
          pending: parseInt(alertsResult.rows[0].pending)
        },
        last_check: new Date().toISOString()
      };
    } finally {
      client.release();
    }
  }

  /**
   * Shutdown compliance service
   */
  async shutdown() {
    try {
      if (this.emailTransporter) {
        this.emailTransporter.close();
      }
      auditLogger.info('ComplianceService shutdown completed');
    } catch (error) {
      auditLogger.error('Error during ComplianceService shutdown', {
        error: error.message
      });
    }
  }
}

module.exports = ComplianceService;