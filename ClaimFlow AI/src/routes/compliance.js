/**
 * Compliance Management Routes
 * HIPAA-compliant compliance monitoring and reporting endpoints
 */

const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { enforcePasswordPolicies } = require('../middleware/passwordPolicy');
const ComplianceService = require('../services/complianceService');
const { supabase } = require('../database/connection');
const { auditLogger, logHelpers } = require('../utils/logger');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const complianceService = new ComplianceService();

// Rate limiting for compliance endpoints
const complianceRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many compliance requests from this IP',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply middleware to all routes
router.use(complianceRateLimit);
router.use(authenticateToken);
router.use(enforcePasswordPolicies);
router.use(auditMiddleware);

/**
 * GET /api/compliance/dashboard
 * Get compliance dashboard overview
 */
router.get('/dashboard', requireRole(['admin', 'compliance_officer']), async (req, res) => {
  try {
    const practiceId = req.user.practice_id;
    
    // Get compliance dashboard data
    const { data: dashboardData, error } = await supabase
      .from('compliance_dashboard')
      .select('*')
      .eq('practice_id', practiceId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // Not found is OK
      throw error;
    }
    
    // Get recent alerts
    const { data: recentAlerts } = await supabase
      .from('compliance_alerts')
      .select('*')
      .eq('practice_id', practiceId)
      .eq('resolved', false)
      .order('timestamp', { ascending: false })
      .limit(10);
    
    // Get compliance trends (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: complianceMetrics } = await supabase
      .from('compliance_metrics')
      .select('*')
      .eq('practice_id', practiceId)
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .order('timestamp', { ascending: true });
    
    // Get practice compliance status
    const complianceStatus = await complianceService.getPracticeComplianceStatus(practiceId);
    
    const response = {
      dashboard: dashboardData || {
        practice_id: practiceId,
        current_score: 100,
        open_alerts: 0,
        open_violations: 0,
        daily_audit_events: 0,
        daily_phi_access: 0
      },
      recent_alerts: recentAlerts || [],
      compliance_metrics: complianceMetrics || [],
      compliance_status: complianceStatus,
      last_updated: new Date().toISOString()
    };
    
    auditLogger.info('Compliance dashboard accessed', {
      user_id: req.user.id,
      practice_id: practiceId,
      complianceFlags: ['COMPLIANCE_DASHBOARD_ACCESS']
    });
    
    res.json({
      success: true,
      data: response
    });
    
  } catch (error) {
    auditLogger.error('Failed to get compliance dashboard', {
      error: error.message,
      user_id: req.user.id,
      practice_id: req.user.practice_id
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance dashboard',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/compliance/alerts
 * Get compliance alerts with filtering and pagination
 */
router.get('/alerts', requireRole(['admin', 'compliance_officer']), async (req, res) => {
  try {
    const practiceId = req.user.practice_id;
    const {
      page = 1,
      limit = 20,
      severity,
      resolved,
      start_date,
      end_date
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = supabase
      .from('compliance_alerts')
      .select('*', { count: 'exact' })
      .eq('practice_id', practiceId)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);
    
    // Apply filters
    if (severity) {
      query = query.eq('severity', severity);
    }
    
    if (resolved !== undefined) {
      query = query.eq('resolved', resolved === 'true');
    }
    
    if (start_date) {
      query = query.gte('timestamp', start_date);
    }
    
    if (end_date) {
      query = query.lte('timestamp', end_date);
    }
    
    const { data: alerts, error, count } = await query;
    
    if (error) {
      throw error;
    }
    
    auditLogger.info('Compliance alerts accessed', {
      user_id: req.user.id,
      practice_id: practiceId,
      filters: { severity, resolved, start_date, end_date },
      results_count: alerts?.length || 0,
      complianceFlags: ['COMPLIANCE_ALERTS_ACCESS']
    });
    
    res.json({
      success: true,
      data: {
        alerts: alerts || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });
    
  } catch (error) {
    auditLogger.error('Failed to get compliance alerts', {
      error: error.message,
      user_id: req.user.id,
      practice_id: req.user.practice_id
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance alerts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUT /api/compliance/alerts/:alertId/resolve
 * Resolve a compliance alert
 */
router.put('/alerts/:alertId/resolve', requireRole(['admin', 'compliance_officer']), async (req, res) => {
  try {
    const { alertId } = req.params;
    const { resolution_notes } = req.body;
    const practiceId = req.user.practice_id;
    
    // Validate alert exists and belongs to practice
    const { data: alert, error: fetchError } = await supabase
      .from('compliance_alerts')
      .select('*')
      .eq('id', alertId)
      .eq('practice_id', practiceId)
      .single();
    
    if (fetchError || !alert) {
      return res.status(404).json({
        success: false,
        message: 'Compliance alert not found'
      });
    }
    
    if (alert.resolved) {
      return res.status(400).json({
        success: false,
        message: 'Alert is already resolved'
      });
    }
    
    // Resolve the alert
    const { data: updatedAlert, error: updateError } = await supabase
      .from('compliance_alerts')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: req.user.id,
        resolution_notes: resolution_notes || 'Resolved by administrator'
      })
      .eq('id', alertId)
      .select()
      .single();
    
    if (updateError) {
      throw updateError;
    }
    
    auditLogger.info('Compliance alert resolved', {
      user_id: req.user.id,
      practice_id: practiceId,
      alert_id: alertId,
      alert_title: alert.title,
      alert_severity: alert.severity,
      resolution_notes,
      complianceFlags: ['COMPLIANCE_ALERT_RESOLVED']
    });
    
    res.json({
      success: true,
      message: 'Compliance alert resolved successfully',
      data: updatedAlert
    });
    
  } catch (error) {
    auditLogger.error('Failed to resolve compliance alert', {
      error: error.message,
      user_id: req.user.id,
      practice_id: req.user.practice_id,
      alert_id: req.params.alertId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to resolve compliance alert',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/compliance/reports
 * Get compliance reports with filtering
 */
router.get('/reports', requireRole(['admin', 'compliance_officer']), async (req, res) => {
  try {
    const practiceId = req.user.practice_id;
    const {
      type,
      start_date,
      end_date,
      limit = 10
    } = req.query;
    
    let query = supabase
      .from('compliance_reports')
      .select('*')
      .eq('practice_id', practiceId)
      .order('generated_at', { ascending: false })
      .limit(parseInt(limit));
    
    // Apply filters
    if (type) {
      query = query.eq('type', type);
    }
    
    if (start_date) {
      query = query.gte('period_start', start_date);
    }
    
    if (end_date) {
      query = query.lte('period_end', end_date);
    }
    
    const { data: reports, error } = await query;
    
    if (error) {
      throw error;
    }
    
    auditLogger.info('Compliance reports accessed', {
      user_id: req.user.id,
      practice_id: practiceId,
      filters: { type, start_date, end_date },
      results_count: reports?.length || 0,
      complianceFlags: ['COMPLIANCE_REPORTS_ACCESS']
    });
    
    res.json({
      success: true,
      data: reports || []
    });
    
  } catch (error) {
    auditLogger.error('Failed to get compliance reports', {
      error: error.message,
      user_id: req.user.id,
      practice_id: req.user.practice_id
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance reports',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/compliance/reports/:reportId
 * Get detailed compliance report
 */
router.get('/reports/:reportId', requireRole(['admin', 'compliance_officer']), async (req, res) => {
  try {
    const { reportId } = req.params;
    const practiceId = req.user.practice_id;
    
    const { data: report, error } = await supabase
      .from('compliance_reports')
      .select('*')
      .eq('id', reportId)
      .eq('practice_id', practiceId)
      .single();
    
    if (error || !report) {
      return res.status(404).json({
        success: false,
        message: 'Compliance report not found'
      });
    }
    
    auditLogger.info('Compliance report accessed', {
      user_id: req.user.id,
      practice_id: practiceId,
      report_id: reportId,
      report_type: report.type,
      complianceFlags: ['COMPLIANCE_REPORT_ACCESS']
    });
    
    res.json({
      success: true,
      data: report
    });
    
  } catch (error) {
    auditLogger.error('Failed to get compliance report', {
      error: error.message,
      user_id: req.user.id,
      practice_id: req.user.practice_id,
      report_id: req.params.reportId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/compliance/reports/generate
 * Generate a new compliance report
 */
router.post('/reports/generate', requireRole(['admin', 'compliance_officer']), async (req, res) => {
  try {
    const practiceId = req.user.practice_id;
    const {
      type = 'custom',
      start_date,
      end_date
    } = req.body;
    
    // Validate date range
    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }
    
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    
    if (startDate >= endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before end date'
      });
    }
    
    // Generate the report
    const report = await complianceService.generateComplianceReport(startDate, endDate, type);
    
    // Add practice_id to report
    report.practice_id = practiceId;
    
    // Store the report
    await complianceService.storeComplianceReport(report);
    
    auditLogger.info('Compliance report generated', {
      user_id: req.user.id,
      practice_id: practiceId,
      report_id: report.id,
      report_type: type,
      period_start: start_date,
      period_end: end_date,
      compliance_score: report.compliance_score,
      complianceFlags: ['COMPLIANCE_REPORT_GENERATED']
    });
    
    res.json({
      success: true,
      message: 'Compliance report generated successfully',
      data: report
    });
    
  } catch (error) {
    auditLogger.error('Failed to generate compliance report', {
      error: error.message,
      user_id: req.user.id,
      practice_id: req.user.practice_id,
      request_body: req.body
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate compliance report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/compliance/violations
 * Get compliance violations with filtering
 */
router.get('/violations', requireRole(['admin', 'compliance_officer']), async (req, res) => {
  try {
    const practiceId = req.user.practice_id;
    const {
      page = 1,
      limit = 20,
      severity,
      violation_type,
      resolved,
      start_date,
      end_date
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = supabase
      .from('compliance_violations')
      .select(`
        *,
        user:providers(id, email, first_name, last_name),
        resolved_by_user:providers!resolved_by(id, email, first_name, last_name)
      `, { count: 'exact' })
      .eq('practice_id', practiceId)
      .order('detected_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    // Apply filters
    if (severity) {
      query = query.eq('severity', severity);
    }
    
    if (violation_type) {
      query = query.eq('violation_type', violation_type);
    }
    
    if (resolved !== undefined) {
      query = query.eq('resolved', resolved === 'true');
    }
    
    if (start_date) {
      query = query.gte('detected_at', start_date);
    }
    
    if (end_date) {
      query = query.lte('detected_at', end_date);
    }
    
    const { data: violations, error, count } = await query;
    
    if (error) {
      throw error;
    }
    
    auditLogger.info('Compliance violations accessed', {
      user_id: req.user.id,
      practice_id: practiceId,
      filters: { severity, violation_type, resolved, start_date, end_date },
      results_count: violations?.length || 0,
      complianceFlags: ['COMPLIANCE_VIOLATIONS_ACCESS']
    });
    
    res.json({
      success: true,
      data: {
        violations: violations || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          pages: Math.ceil((count || 0) / limit)
        }
      }
    });
    
  } catch (error) {
    auditLogger.error('Failed to get compliance violations', {
      error: error.message,
      user_id: req.user.id,
      practice_id: req.user.practice_id
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance violations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUT /api/compliance/violations/:violationId/resolve
 * Resolve a compliance violation
 */
router.put('/violations/:violationId/resolve', requireRole(['admin', 'compliance_officer']), async (req, res) => {
  try {
    const { violationId } = req.params;
    const { resolution_action } = req.body;
    const practiceId = req.user.practice_id;
    
    if (!resolution_action) {
      return res.status(400).json({
        success: false,
        message: 'Resolution action is required'
      });
    }
    
    // Validate violation exists and belongs to practice
    const { data: violation, error: fetchError } = await supabase
      .from('compliance_violations')
      .select('*')
      .eq('id', violationId)
      .eq('practice_id', practiceId)
      .single();
    
    if (fetchError || !violation) {
      return res.status(404).json({
        success: false,
        message: 'Compliance violation not found'
      });
    }
    
    if (violation.resolved) {
      return res.status(400).json({
        success: false,
        message: 'Violation is already resolved'
      });
    }
    
    // Resolve the violation
    const { data: updatedViolation, error: updateError } = await supabase
      .from('compliance_violations')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: req.user.id,
        resolution_action
      })
      .eq('id', violationId)
      .select()
      .single();
    
    if (updateError) {
      throw updateError;
    }
    
    auditLogger.info('Compliance violation resolved', {
      user_id: req.user.id,
      practice_id: practiceId,
      violation_id: violationId,
      violation_type: violation.violation_type,
      violation_severity: violation.severity,
      resolution_action,
      complianceFlags: ['COMPLIANCE_VIOLATION_RESOLVED']
    });
    
    res.json({
      success: true,
      message: 'Compliance violation resolved successfully',
      data: updatedViolation
    });
    
  } catch (error) {
    auditLogger.error('Failed to resolve compliance violation', {
      error: error.message,
      user_id: req.user.id,
      practice_id: req.user.practice_id,
      violation_id: req.params.violationId
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to resolve compliance violation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/compliance/metrics
 * Get compliance metrics for charts and analytics
 */
router.get('/metrics', requireRole(['admin', 'compliance_officer']), async (req, res) => {
  try {
    const practiceId = req.user.practice_id;
    const {
      metric_name,
      start_date,
      end_date,
      granularity = 'daily' // daily, weekly, monthly
    } = req.query;
    
    let query = supabase
      .from('compliance_metrics')
      .select('*')
      .eq('practice_id', practiceId)
      .order('timestamp', { ascending: true });
    
    // Apply filters
    if (metric_name) {
      query = query.eq('metric_name', metric_name);
    }
    
    if (start_date) {
      query = query.gte('timestamp', start_date);
    }
    
    if (end_date) {
      query = query.lte('timestamp', end_date);
    }
    
    const { data: metrics, error } = await query;
    
    if (error) {
      throw error;
    }
    
    // Group metrics by granularity if needed
    let processedMetrics = metrics || [];
    
    if (granularity !== 'raw' && processedMetrics.length > 0) {
      processedMetrics = this.groupMetricsByGranularity(processedMetrics, granularity);
    }
    
    auditLogger.info('Compliance metrics accessed', {
      user_id: req.user.id,
      practice_id: practiceId,
      filters: { metric_name, start_date, end_date, granularity },
      results_count: processedMetrics.length,
      complianceFlags: ['COMPLIANCE_METRICS_ACCESS']
    });
    
    res.json({
      success: true,
      data: processedMetrics
    });
    
  } catch (error) {
    auditLogger.error('Failed to get compliance metrics', {
      error: error.message,
      user_id: req.user.id,
      practice_id: req.user.practice_id
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance metrics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Helper function to group metrics by granularity
 */
function groupMetricsByGranularity(metrics, granularity) {
  const grouped = {};
  
  metrics.forEach(metric => {
    const date = new Date(metric.timestamp);
    let key;
    
    switch (granularity) {
      case 'daily':
        key = date.toISOString().split('T')[0];
        break;
      case 'weekly':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'monthly':
        key = date.toISOString().substring(0, 7);
        break;
      default:
        key = metric.timestamp;
    }
    
    if (!grouped[key]) {
      grouped[key] = {
        timestamp: key,
        metrics: []
      };
    }
    
    grouped[key].metrics.push(metric);
  });
  
  return Object.values(grouped);
}

module.exports = router;