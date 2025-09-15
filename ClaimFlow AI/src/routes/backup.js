const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('../middleware/auth');
const { enforcePasswordPolicies } = require('../middleware/passwordPolicy');
const { auditMiddleware } = require('../middleware/audit');
const BackupService = require('../services/backupService');
const pool = require('../database/connection');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize backup service
const backupService = new BackupService();

// Rate limiting for backup operations
const backupRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 backup requests per windowMs
    message: {
        error: 'Too many backup requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Stricter rate limiting for restore operations
const restoreRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Limit each IP to 3 restore requests per hour
    message: {
        error: 'Too many restore requests from this IP, please try again later.',
        code: 'RESTORE_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply middleware to all routes
router.use(authenticateToken);
router.use(enforcePasswordPolicies);
router.use(auditMiddleware);

// =============================================
// BACKUP DASHBOARD AND STATUS
// =============================================

/**
 * GET /api/backup/dashboard
 * Get backup dashboard overview
 */
router.get('/dashboard', async (req, res) => {
    try {
        const client = await pool.connect();
        
        try {
            // Get backup dashboard data
            const dashboardQuery = `
                SELECT * FROM backup_dashboard
                ORDER BY type;
            `;
            const dashboardResult = await client.query(dashboardQuery);
            
            // Get recent backup activity
            const recentQuery = `
                SELECT * FROM recent_backup_activity
                LIMIT 10;
            `;
            const recentResult = await client.query(recentQuery);
            
            // Get backup statistics for last 30 days
            const statsQuery = `
                SELECT * FROM get_backup_statistics(30);
            `;
            const statsResult = await client.query(statsQuery);
            
            // Get system health indicators
            const healthQuery = `
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as failed_last_24h,
                    COUNT(*) FILTER (WHERE status = 'completed' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours') as successful_last_24h,
                    MAX(created_at) as last_backup_time,
                    COUNT(*) FILTER (WHERE retention_date < CURRENT_DATE) as expired_backups,
                    COUNT(*) FILTER (WHERE compliance_verified = false) as unverified_backups
                FROM backup_records
                WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days';
            `;
            const healthResult = await client.query(healthQuery);
            
            const dashboard = {
                overview: dashboardResult.rows,
                recentActivity: recentResult.rows,
                statistics: statsResult.rows,
                health: healthResult.rows[0] || {},
                lastUpdated: new Date().toISOString()
            };
            
            res.json({
                success: true,
                data: dashboard
            });
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        logger.error('Error fetching backup dashboard:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch backup dashboard',
            code: 'DASHBOARD_FETCH_ERROR'
        });
    }
});

/**
 * GET /api/backup/status
 * Get current backup service status
 */
router.get('/status', async (req, res) => {
    try {
        const status = await backupService.getServiceStatus();
        
        res.json({
            success: true,
            data: status
        });
        
    } catch (error) {
        logger.error('Error fetching backup service status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch backup service status',
            code: 'STATUS_FETCH_ERROR'
        });
    }
});

// =============================================
// BACKUP OPERATIONS
// =============================================

/**
 * GET /api/backup/records
 * Get backup records with filtering and pagination
 */
router.get('/records', async (req, res) => {
    try {
        const {
            type,
            status,
            page = 1,
            limit = 20,
            sortBy = 'created_at',
            sortOrder = 'DESC',
            startDate,
            endDate
        } = req.query;
        
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        const client = await pool.connect();
        
        try {
            let whereConditions = [];
            let queryParams = [];
            let paramIndex = 1;
            
            // Build WHERE conditions
            if (type) {
                whereConditions.push(`type = $${paramIndex}`);
                queryParams.push(type);
                paramIndex++;
            }
            
            if (status) {
                whereConditions.push(`status = $${paramIndex}`);
                queryParams.push(status);
                paramIndex++;
            }
            
            if (startDate) {
                whereConditions.push(`created_at >= $${paramIndex}`);
                queryParams.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                whereConditions.push(`created_at <= $${paramIndex}`);
                queryParams.push(endDate);
                paramIndex++;
            }
            
            const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
            
            // Validate sort parameters
            const allowedSortFields = ['created_at', 'name', 'type', 'status', 'size', 'duration_seconds'];
            const allowedSortOrders = ['ASC', 'DESC'];
            
            const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
            const validSortOrder = allowedSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
            
            // Get total count
            const countQuery = `
                SELECT COUNT(*) as total
                FROM backup_records
                ${whereClause};
            `;
            const countResult = await client.query(countQuery, queryParams);
            const totalRecords = parseInt(countResult.rows[0].total);
            
            // Get paginated records
            const recordsQuery = `
                SELECT 
                    id,
                    name,
                    type,
                    size,
                    status,
                    created_at,
                    completed_at,
                    duration_seconds,
                    retention_date,
                    compliance_verified,
                    error_message
                FROM backup_records
                ${whereClause}
                ORDER BY ${validSortBy} ${validSortOrder}
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1};
            `;
            
            queryParams.push(parseInt(limit), offset);
            const recordsResult = await client.query(recordsQuery, queryParams);
            
            const totalPages = Math.ceil(totalRecords / parseInt(limit));
            
            res.json({
                success: true,
                data: {
                    records: recordsResult.rows,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages,
                        totalRecords,
                        limit: parseInt(limit),
                        hasNextPage: parseInt(page) < totalPages,
                        hasPreviousPage: parseInt(page) > 1
                    }
                }
            });
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        logger.error('Error fetching backup records:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch backup records',
            code: 'RECORDS_FETCH_ERROR'
        });
    }
});

/**
 * POST /api/backup/create
 * Create a new backup
 */
router.post('/create', backupRateLimit, async (req, res) => {
    try {
        const { type = 'manual', name } = req.body;
        
        // Validate backup type
        const validTypes = ['daily', 'weekly', 'monthly', 'yearly', 'manual'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid backup type',
                code: 'INVALID_BACKUP_TYPE',
                validTypes
            });
        }
        
        // Check if user has permission for manual backups
        if (type === 'manual' && !['admin', 'system_admin', 'backup_operator'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions for manual backup',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        
        // Create backup
        const backupResult = await backupService.performBackup({
            type,
            name: name || `${type}_backup_${new Date().toISOString().split('T')[0]}`,
            initiatedBy: req.user.id
        });
        
        res.status(201).json({
            success: true,
            message: 'Backup initiated successfully',
            data: {
                backupId: backupResult.id,
                name: backupResult.name,
                type: backupResult.type,
                status: backupResult.status,
                estimatedDuration: backupResult.estimatedDuration
            }
        });
        
    } catch (error) {
        logger.error('Error creating backup:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create backup',
            code: 'BACKUP_CREATION_ERROR',
            details: error.message
        });
    }
});

/**
 * GET /api/backup/:id
 * Get specific backup details
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const client = await pool.connect();
        
        try {
            const backupQuery = `
                SELECT 
                    br.*,
                    bek.algorithm,
                    bek.key_size,
                    bek.created_at as key_created_at
                FROM backup_records br
                LEFT JOIN backup_encryption_keys bek ON br.encryption_key_id = bek.id
                WHERE br.id = $1;
            `;
            const backupResult = await client.query(backupQuery, [id]);
            
            if (backupResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Backup not found',
                    code: 'BACKUP_NOT_FOUND'
                });
            }
            
            // Get verification logs for this backup
            const verificationQuery = `
                SELECT *
                FROM backup_verification_logs
                WHERE backup_id = $1
                ORDER BY started_at DESC;
            `;
            const verificationResult = await client.query(verificationQuery, [id]);
            
            // Get restore logs for this backup
            const restoreQuery = `
                SELECT *
                FROM backup_restore_logs
                WHERE backup_id = $1
                ORDER BY started_at DESC;
            `;
            const restoreResult = await client.query(restoreQuery, [id]);
            
            const backup = backupResult.rows[0];
            
            // Remove sensitive information
            delete backup.s3_location;
            delete backup.encryption_key_id;
            
            res.json({
                success: true,
                data: {
                    backup,
                    verifications: verificationResult.rows,
                    restores: restoreResult.rows
                }
            });
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        logger.error('Error fetching backup details:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch backup details',
            code: 'BACKUP_DETAILS_ERROR'
        });
    }
});

// =============================================
// RESTORE OPERATIONS
// =============================================

/**
 * POST /api/backup/:id/restore
 * Initiate backup restore
 */
router.post('/:id/restore', restoreRateLimit, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            restoreType = 'full',
            targetDatabase,
            restorePoint,
            reason,
            businessJustification
        } = req.body;
        
        // Validate required fields
        if (!reason) {
            return res.status(400).json({
                success: false,
                error: 'Reason is required for restore operation',
                code: 'MISSING_REASON'
            });
        }
        
        // Check permissions for restore operations
        if (!['admin', 'system_admin'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions for restore operation',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        
        // Validate restore type
        const validRestoreTypes = ['full', 'partial', 'point_in_time', 'disaster_recovery'];
        if (!validRestoreTypes.includes(restoreType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid restore type',
                code: 'INVALID_RESTORE_TYPE',
                validTypes: validRestoreTypes
            });
        }
        
        // Initiate restore
        const restoreResult = await backupService.performRestore({
            backupId: id,
            restoreType,
            targetDatabase,
            restorePoint,
            reason,
            businessJustification,
            initiatedBy: req.user.id
        });
        
        res.status(201).json({
            success: true,
            message: 'Restore operation initiated successfully',
            data: {
                restoreId: restoreResult.id,
                backupId: id,
                restoreType,
                status: restoreResult.status,
                estimatedDuration: restoreResult.estimatedDuration
            }
        });
        
    } catch (error) {
        logger.error('Error initiating restore:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to initiate restore operation',
            code: 'RESTORE_INITIATION_ERROR',
            details: error.message
        });
    }
});

/**
 * GET /api/backup/restore/:restoreId/status
 * Get restore operation status
 */
router.get('/restore/:restoreId/status', async (req, res) => {
    try {
        const { restoreId } = req.params;
        
        const client = await pool.connect();
        
        try {
            const restoreQuery = `
                SELECT 
                    brl.*,
                    br.name as backup_name,
                    br.type as backup_type
                FROM backup_restore_logs brl
                JOIN backup_records br ON brl.backup_id = br.id
                WHERE brl.id = $1;
            `;
            const restoreResult = await client.query(restoreQuery, [restoreId]);
            
            if (restoreResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Restore operation not found',
                    code: 'RESTORE_NOT_FOUND'
                });
            }
            
            const restore = restoreResult.rows[0];
            
            res.json({
                success: true,
                data: restore
            });
            
        } finally {
            client.release();
        }
        
    } catch (error) {
        logger.error('Error fetching restore status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch restore status',
            code: 'RESTORE_STATUS_ERROR'
        });
    }
});

// =============================================
// VERIFICATION OPERATIONS
// =============================================

/**
 * POST /api/backup/:id/verify
 * Verify backup integrity
 */
router.post('/:id/verify', async (req, res) => {
    try {
        const { id } = req.params;
        const { verificationType = 'integrity' } = req.body;
        
        // Validate verification type
        const validTypes = ['integrity', 'restore_test', 'encryption', 'compliance'];
        if (!validTypes.includes(verificationType)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid verification type',
                code: 'INVALID_VERIFICATION_TYPE',
                validTypes
            });
        }
        
        // Perform verification
        const verificationResult = await backupService.verifyBackup(id, verificationType);
        
        res.json({
            success: true,
            message: 'Backup verification completed',
            data: verificationResult
        });
        
    } catch (error) {
        logger.error('Error verifying backup:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify backup',
            code: 'BACKUP_VERIFICATION_ERROR',
            details: error.message
        });
    }
});

// =============================================
// CONFIGURATION AND MANAGEMENT
// =============================================

/**
 * GET /api/backup/config
 * Get backup configuration
 */
router.get('/config', async (req, res) => {
    try {
        // Only admin users can view configuration
        if (!['admin', 'system_admin'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions to view backup configuration',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        
        const config = await backupService.getConfiguration();
        
        res.json({
            success: true,
            data: config
        });
        
    } catch (error) {
        logger.error('Error fetching backup configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch backup configuration',
            code: 'CONFIG_FETCH_ERROR'
        });
    }
});

/**
 * PUT /api/backup/config
 * Update backup configuration
 */
router.put('/config', async (req, res) => {
    try {
        // Only system admin can update configuration
        if (req.user.role !== 'system_admin') {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions to update backup configuration',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        
        const updatedConfig = await backupService.updateConfiguration(req.body);
        
        res.json({
            success: true,
            message: 'Backup configuration updated successfully',
            data: updatedConfig
        });
        
    } catch (error) {
        logger.error('Error updating backup configuration:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update backup configuration',
            code: 'CONFIG_UPDATE_ERROR',
            details: error.message
        });
    }
});

/**
 * POST /api/backup/cleanup
 * Cleanup expired backups
 */
router.post('/cleanup', async (req, res) => {
    try {
        // Only admin users can trigger cleanup
        if (!['admin', 'system_admin'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions to trigger backup cleanup',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        
        const cleanupResult = await backupService.cleanupExpiredBackups();
        
        res.json({
            success: true,
            message: 'Backup cleanup completed successfully',
            data: {
                cleanedUpCount: cleanupResult.count,
                freedSpace: cleanupResult.freedSpace,
                details: cleanupResult.details
            }
        });
        
    } catch (error) {
        logger.error('Error during backup cleanup:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cleanup expired backups',
            code: 'CLEANUP_ERROR',
            details: error.message
        });
    }
});

// =============================================
// ERROR HANDLING
// =============================================

// Handle 404 for backup routes
router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Backup endpoint not found',
        code: 'ENDPOINT_NOT_FOUND',
        path: req.originalUrl
    });
});

// Error handling middleware
router.use((error, req, res, next) => {
    logger.error('Backup route error:', error);
    
    res.status(500).json({
        success: false,
        error: 'Internal server error in backup operations',
        code: 'INTERNAL_SERVER_ERROR',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
});

module.exports = router;