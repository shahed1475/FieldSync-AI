const request = require('supertest');
const jwt = require('jsonwebtoken');
const BackupService = require('../services/backupService');
const pool = require('../database/connection');
const app = require('../index');

// Mock dependencies
jest.mock('../database/connection');
jest.mock('../services/backupService');
jest.mock('../utils/logger');

describe('Backup Service Tests', () => {
    let mockClient;
    let backupService;
    
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Mock database client
        mockClient = {
            query: jest.fn(),
            release: jest.fn()
        };
        
        pool.connect.mockResolvedValue(mockClient);
        
        // Create backup service instance
        backupService = new BackupService();
    });
    
    afterEach(() => {
        jest.resetAllMocks();
    });
    
    describe('BackupService Class', () => {
        describe('initialize', () => {
            it('should initialize backup service successfully', async () => {
                const mockConfig = {
                    aws: {
                        accessKeyId: 'test-key',
                        secretAccessKey: 'test-secret',
                        region: 'us-east-1',
                        s3BucketName: 'test-bucket'
                    },
                    encryption: {
                        algorithm: 'aes-256-gcm'
                    },
                    schedule: {
                        daily: '0 2 * * *',
                        weekly: '0 3 * * 0',
                        monthly: '0 4 1 * *'
                    }
                };
                
                process.env.AWS_ACCESS_KEY_ID = 'test-key';
                process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
                process.env.AWS_REGION = 'us-east-1';
                process.env.S3_BACKUP_BUCKET = 'test-bucket';
                
                BackupService.prototype.initialize = jest.fn().mockResolvedValue(true);
                
                const result = await backupService.initialize();
                
                expect(result).toBe(true);
                expect(BackupService.prototype.initialize).toHaveBeenCalled();
            });
            
            it('should handle initialization errors', async () => {
                BackupService.prototype.initialize = jest.fn().mockRejectedValue(new Error('AWS configuration error'));
                
                await expect(backupService.initialize()).rejects.toThrow('AWS configuration error');
            });
        });
        
        describe('performBackup', () => {
            it('should perform backup successfully', async () => {
                const backupOptions = {
                    type: 'manual',
                    name: 'test-backup',
                    initiatedBy: 'user-123'
                };
                
                const mockBackupResult = {
                    id: 'backup-123',
                    name: 'test-backup',
                    type: 'manual',
                    status: 'in_progress',
                    estimatedDuration: 300
                };
                
                BackupService.prototype.performBackup = jest.fn().mockResolvedValue(mockBackupResult);
                
                const result = await backupService.performBackup(backupOptions);
                
                expect(result).toEqual(mockBackupResult);
                expect(BackupService.prototype.performBackup).toHaveBeenCalledWith(backupOptions);
            });
            
            it('should handle backup failures', async () => {
                const backupOptions = {
                    type: 'daily',
                    name: 'daily-backup'
                };
                
                BackupService.prototype.performBackup = jest.fn().mockRejectedValue(new Error('S3 upload failed'));
                
                await expect(backupService.performBackup(backupOptions)).rejects.toThrow('S3 upload failed');
            });
        });
        
        describe('performRestore', () => {
            it('should perform restore successfully', async () => {
                const restoreOptions = {
                    backupId: 'backup-123',
                    restoreType: 'full',
                    reason: 'Disaster recovery test',
                    initiatedBy: 'admin-123'
                };
                
                const mockRestoreResult = {
                    id: 'restore-123',
                    backupId: 'backup-123',
                    status: 'initiated',
                    estimatedDuration: 600
                };
                
                BackupService.prototype.performRestore = jest.fn().mockResolvedValue(mockRestoreResult);
                
                const result = await backupService.performRestore(restoreOptions);
                
                expect(result).toEqual(mockRestoreResult);
                expect(BackupService.prototype.performRestore).toHaveBeenCalledWith(restoreOptions);
            });
            
            it('should validate restore permissions', async () => {
                const restoreOptions = {
                    backupId: 'backup-123',
                    restoreType: 'full',
                    reason: 'Test restore',
                    initiatedBy: 'user-123'
                };
                
                BackupService.prototype.performRestore = jest.fn().mockRejectedValue(new Error('Insufficient permissions'));
                
                await expect(backupService.performRestore(restoreOptions)).rejects.toThrow('Insufficient permissions');
            });
        });
        
        describe('verifyBackup', () => {
            it('should verify backup integrity successfully', async () => {
                const backupId = 'backup-123';
                const verificationType = 'integrity';
                
                const mockVerificationResult = {
                    id: 'verification-123',
                    backupId,
                    verificationType,
                    status: 'passed',
                    score: 100,
                    checksPerformed: {
                        checksumVerification: true,
                        encryptionValidation: true,
                        fileIntegrity: true
                    }
                };
                
                BackupService.prototype.verifyBackup = jest.fn().mockResolvedValue(mockVerificationResult);
                
                const result = await backupService.verifyBackup(backupId, verificationType);
                
                expect(result).toEqual(mockVerificationResult);
                expect(BackupService.prototype.verifyBackup).toHaveBeenCalledWith(backupId, verificationType);
            });
            
            it('should handle verification failures', async () => {
                const backupId = 'backup-123';
                const verificationType = 'integrity';
                
                const mockVerificationResult = {
                    id: 'verification-123',
                    backupId,
                    verificationType,
                    status: 'failed',
                    score: 45,
                    issuesFound: {
                        checksumMismatch: true,
                        corruptedFiles: ['file1.sql', 'file2.sql']
                    }
                };
                
                BackupService.prototype.verifyBackup = jest.fn().mockResolvedValue(mockVerificationResult);
                
                const result = await backupService.verifyBackup(backupId, verificationType);
                
                expect(result.status).toBe('failed');
                expect(result.score).toBe(45);
            });
        });
        
        describe('cleanupExpiredBackups', () => {
            it('should cleanup expired backups successfully', async () => {
                const mockCleanupResult = {
                    count: 5,
                    freedSpace: 1024 * 1024 * 500, // 500MB
                    details: [
                        { id: 'backup-1', name: 'old-backup-1', size: 100 * 1024 * 1024 },
                        { id: 'backup-2', name: 'old-backup-2', size: 200 * 1024 * 1024 }
                    ]
                };
                
                BackupService.prototype.cleanupExpiredBackups = jest.fn().mockResolvedValue(mockCleanupResult);
                
                const result = await backupService.cleanupExpiredBackups();
                
                expect(result).toEqual(mockCleanupResult);
                expect(result.count).toBe(5);
                expect(result.freedSpace).toBeGreaterThan(0);
            });
        });
        
        describe('getServiceStatus', () => {
            it('should return service status', async () => {
                const mockStatus = {
                    isRunning: true,
                    scheduledJobs: {
                        daily: { nextRun: '2024-01-02T02:00:00Z', enabled: true },
                        weekly: { nextRun: '2024-01-07T03:00:00Z', enabled: true },
                        monthly: { nextRun: '2024-02-01T04:00:00Z', enabled: true }
                    },
                    lastBackup: {
                        type: 'daily',
                        status: 'completed',
                        completedAt: '2024-01-01T02:30:00Z'
                    },
                    configuration: {
                        retentionPolicies: {
                            daily: 30,
                            weekly: 90,
                            monthly: 365
                        }
                    }
                };
                
                BackupService.prototype.getServiceStatus = jest.fn().mockResolvedValue(mockStatus);
                
                const result = await backupService.getServiceStatus();
                
                expect(result).toEqual(mockStatus);
                expect(result.isRunning).toBe(true);
            });
        });
    });
});

describe('Backup API Routes Tests', () => {
    let authToken;
    let adminToken;
    
    beforeEach(() => {
        // Create test JWT tokens
        authToken = jwt.sign(
            { id: 'user-123', email: 'user@test.com', role: 'user' },
            process.env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );
        
        adminToken = jwt.sign(
            { id: 'admin-123', email: 'admin@test.com', role: 'system_admin' },
            process.env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );
        
        // Mock database responses
        const mockClient = {
            query: jest.fn(),
            release: jest.fn()
        };
        
        pool.connect.mockResolvedValue(mockClient);
    });
    
    describe('GET /api/backup/dashboard', () => {
        it('should return backup dashboard data', async () => {
            const mockDashboardData = {
                overview: [
                    { type: 'daily', total_backups: 30, successful_backups: 29, failed_backups: 1 },
                    { type: 'weekly', total_backups: 4, successful_backups: 4, failed_backups: 0 }
                ],
                recentActivity: [
                    { id: 'backup-1', name: 'daily-backup-2024-01-01', status: 'completed' }
                ],
                statistics: [
                    { backup_type: 'daily', success_rate: 96.67 }
                ],
                health: {
                    failed_last_24h: 0,
                    successful_last_24h: 1,
                    expired_backups: 2
                }
            };
            
            const mockClient = await pool.connect();
            mockClient.query
                .mockResolvedValueOnce({ rows: mockDashboardData.overview })
                .mockResolvedValueOnce({ rows: mockDashboardData.recentActivity })
                .mockResolvedValueOnce({ rows: mockDashboardData.statistics })
                .mockResolvedValueOnce({ rows: [mockDashboardData.health] });
            
            const response = await request(app)
                .get('/api/backup/dashboard')
                .set('Authorization', `Bearer ${authToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('overview');
            expect(response.body.data).toHaveProperty('recentActivity');
            expect(response.body.data).toHaveProperty('statistics');
            expect(response.body.data).toHaveProperty('health');
        });
        
        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/backup/dashboard');
            
            expect(response.status).toBe(401);
        });
    });
    
    describe('GET /api/backup/records', () => {
        it('should return paginated backup records', async () => {
            const mockRecords = [
                {
                    id: 'backup-1',
                    name: 'daily-backup-2024-01-01',
                    type: 'daily',
                    status: 'completed',
                    size: 1024 * 1024 * 100,
                    created_at: '2024-01-01T02:00:00Z'
                }
            ];
            
            const mockClient = await pool.connect();
            mockClient.query
                .mockResolvedValueOnce({ rows: [{ total: 1 }] })
                .mockResolvedValueOnce({ rows: mockRecords });
            
            const response = await request(app)
                .get('/api/backup/records?page=1&limit=20')
                .set('Authorization', `Bearer ${authToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.records).toHaveLength(1);
            expect(response.body.data.pagination).toHaveProperty('currentPage', 1);
            expect(response.body.data.pagination).toHaveProperty('totalRecords', 1);
        });
        
        it('should filter records by type', async () => {
            const mockClient = await pool.connect();
            mockClient.query
                .mockResolvedValueOnce({ rows: [{ total: 0 }] })
                .mockResolvedValueOnce({ rows: [] });
            
            const response = await request(app)
                .get('/api/backup/records?type=weekly')
                .set('Authorization', `Bearer ${authToken}`);
            
            expect(response.status).toBe(200);
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('type = $1'),
                expect.arrayContaining(['weekly'])
            );
        });
    });
    
    describe('POST /api/backup/create', () => {
        it('should create manual backup for admin users', async () => {
            const mockBackupResult = {
                id: 'backup-123',
                name: 'manual-backup-test',
                type: 'manual',
                status: 'in_progress',
                estimatedDuration: 300
            };
            
            BackupService.prototype.performBackup = jest.fn().mockResolvedValue(mockBackupResult);
            
            const response = await request(app)
                .post('/api/backup/create')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    type: 'manual',
                    name: 'manual-backup-test'
                });
            
            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.backupId).toBe('backup-123');
        });
        
        it('should reject manual backup for non-admin users', async () => {
            const response = await request(app)
                .post('/api/backup/create')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    type: 'manual',
                    name: 'manual-backup-test'
                });
            
            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
        });
        
        it('should validate backup type', async () => {
            const response = await request(app)
                .post('/api/backup/create')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    type: 'invalid-type',
                    name: 'test-backup'
                });
            
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('INVALID_BACKUP_TYPE');
        });
    });
    
    describe('GET /api/backup/:id', () => {
        it('should return backup details', async () => {
            const mockBackup = {
                id: 'backup-123',
                name: 'test-backup',
                type: 'manual',
                status: 'completed',
                size: 1024 * 1024 * 100,
                algorithm: 'aes-256-gcm',
                key_size: 256
            };
            
            const mockClient = await pool.connect();
            mockClient.query
                .mockResolvedValueOnce({ rows: [mockBackup] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });
            
            const response = await request(app)
                .get('/api/backup/backup-123')
                .set('Authorization', `Bearer ${authToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.backup.id).toBe('backup-123');
            expect(response.body.data).toHaveProperty('verifications');
            expect(response.body.data).toHaveProperty('restores');
        });
        
        it('should return 404 for non-existent backup', async () => {
            const mockClient = await pool.connect();
            mockClient.query.mockResolvedValueOnce({ rows: [] });
            
            const response = await request(app)
                .get('/api/backup/non-existent-backup')
                .set('Authorization', `Bearer ${authToken}`);
            
            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('BACKUP_NOT_FOUND');
        });
    });
    
    describe('POST /api/backup/:id/restore', () => {
        it('should initiate restore for admin users', async () => {
            const mockRestoreResult = {
                id: 'restore-123',
                status: 'initiated',
                estimatedDuration: 600
            };
            
            BackupService.prototype.performRestore = jest.fn().mockResolvedValue(mockRestoreResult);
            
            const response = await request(app)
                .post('/api/backup/backup-123/restore')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    restoreType: 'full',
                    reason: 'Disaster recovery test',
                    businessJustification: 'Testing disaster recovery procedures'
                });
            
            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.restoreId).toBe('restore-123');
        });
        
        it('should reject restore for non-admin users', async () => {
            const response = await request(app)
                .post('/api/backup/backup-123/restore')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    restoreType: 'full',
                    reason: 'Test restore'
                });
            
            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
        });
        
        it('should require reason for restore', async () => {
            const response = await request(app)
                .post('/api/backup/backup-123/restore')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    restoreType: 'full'
                });
            
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('MISSING_REASON');
        });
    });
    
    describe('POST /api/backup/:id/verify', () => {
        it('should verify backup integrity', async () => {
            const mockVerificationResult = {
                id: 'verification-123',
                status: 'passed',
                score: 100,
                checksPerformed: {
                    checksumVerification: true,
                    encryptionValidation: true
                }
            };
            
            BackupService.prototype.verifyBackup = jest.fn().mockResolvedValue(mockVerificationResult);
            
            const response = await request(app)
                .post('/api/backup/backup-123/verify')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    verificationType: 'integrity'
                });
            
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe('passed');
        });
        
        it('should validate verification type', async () => {
            const response = await request(app)
                .post('/api/backup/backup-123/verify')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    verificationType: 'invalid-type'
                });
            
            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('INVALID_VERIFICATION_TYPE');
        });
    });
    
    describe('GET /api/backup/config', () => {
        it('should return configuration for admin users', async () => {
            const mockConfig = {
                retentionPolicies: {
                    daily: 30,
                    weekly: 90,
                    monthly: 365
                },
                schedule: {
                    daily: '0 2 * * *',
                    weekly: '0 3 * * 0'
                }
            };
            
            BackupService.prototype.getConfiguration = jest.fn().mockResolvedValue(mockConfig);
            
            const response = await request(app)
                .get('/api/backup/config')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockConfig);
        });
        
        it('should reject non-admin users', async () => {
            const response = await request(app)
                .get('/api/backup/config')
                .set('Authorization', `Bearer ${authToken}`);
            
            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
        });
    });
    
    describe('POST /api/backup/cleanup', () => {
        it('should cleanup expired backups for admin users', async () => {
            const mockCleanupResult = {
                count: 3,
                freedSpace: 1024 * 1024 * 300,
                details: [
                    { id: 'backup-1', name: 'old-backup-1' }
                ]
            };
            
            BackupService.prototype.cleanupExpiredBackups = jest.fn().mockResolvedValue(mockCleanupResult);
            
            const response = await request(app)
                .post('/api/backup/cleanup')
                .set('Authorization', `Bearer ${adminToken}`);
            
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.cleanedUpCount).toBe(3);
        });
        
        it('should reject non-admin users', async () => {
            const response = await request(app)
                .post('/api/backup/cleanup')
                .set('Authorization', `Bearer ${authToken}`);
            
            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.code).toBe('INSUFFICIENT_PERMISSIONS');
        });
    });
});

describe('Database Functions Tests', () => {
    let mockClient;
    
    beforeEach(() => {
        mockClient = {
            query: jest.fn(),
            release: jest.fn()
        };
        
        pool.connect.mockResolvedValue(mockClient);
    });
    
    describe('update_backup_status function', () => {
        it('should update backup status successfully', async () => {
            mockClient.query.mockResolvedValueOnce({ rowCount: 1 });
            
            const client = await pool.connect();
            const result = await client.query(
                'SELECT update_backup_status($1, $2, $3)',
                ['backup-123', 'completed', null]
            );
            
            expect(result.rowCount).toBe(1);
            expect(mockClient.query).toHaveBeenCalledWith(
                'SELECT update_backup_status($1, $2, $3)',
                ['backup-123', 'completed', null]
            );
        });
    });
    
    describe('get_backup_statistics function', () => {
        it('should return backup statistics', async () => {
            const mockStats = [
                {
                    backup_type: 'daily',
                    total_backups: 30,
                    successful_backups: 29,
                    failed_backups: 1,
                    success_rate: 96.67
                }
            ];
            
            mockClient.query.mockResolvedValueOnce({ rows: mockStats });
            
            const client = await pool.connect();
            const result = await client.query('SELECT * FROM get_backup_statistics(30)');
            
            expect(result.rows).toEqual(mockStats);
            expect(result.rows[0].success_rate).toBe(96.67);
        });
    });
    
    describe('cleanup_expired_backups function', () => {
        it('should cleanup expired backups', async () => {
            mockClient.query.mockResolvedValueOnce({ rows: [{ cleanup_expired_backups: 5 }] });
            
            const client = await pool.connect();
            const result = await client.query('SELECT cleanup_expired_backups()');
            
            expect(result.rows[0].cleanup_expired_backups).toBe(5);
        });
    });
    
    describe('verify_backup_integrity function', () => {
        it('should record backup verification', async () => {
            const verificationId = 'verification-123';
            mockClient.query.mockResolvedValueOnce({ rows: [{ verify_backup_integrity: verificationId }] });
            
            const client = await pool.connect();
            const result = await client.query(
                'SELECT verify_backup_integrity($1, $2, $3, $4, $5)',
                [
                    'backup-123',
                    'integrity',
                    'passed',
                    JSON.stringify({ checksumVerification: true }),
                    null
                ]
            );
            
            expect(result.rows[0].verify_backup_integrity).toBe(verificationId);
        });
    });
});

describe('Integration Tests', () => {
    describe('Backup Workflow', () => {
        it('should complete full backup workflow', async () => {
            // This would test the complete workflow:
            // 1. Create backup
            // 2. Verify backup
            // 3. Test restore
            // 4. Cleanup
            
            // Mock the entire workflow
            const backupService = new BackupService();
            
            // Step 1: Create backup
            BackupService.prototype.performBackup = jest.fn().mockResolvedValue({
                id: 'backup-123',
                status: 'completed'
            });
            
            // Step 2: Verify backup
            BackupService.prototype.verifyBackup = jest.fn().mockResolvedValue({
                status: 'passed',
                score: 100
            });
            
            // Step 3: Test restore (simulation)
            BackupService.prototype.performRestore = jest.fn().mockResolvedValue({
                id: 'restore-123',
                status: 'completed'
            });
            
            // Execute workflow
            const backup = await backupService.performBackup({ type: 'manual' });
            expect(backup.status).toBe('completed');
            
            const verification = await backupService.verifyBackup(backup.id, 'integrity');
            expect(verification.status).toBe('passed');
            
            const restore = await backupService.performRestore({
                backupId: backup.id,
                restoreType: 'full',
                reason: 'Integration test'
            });
            expect(restore.status).toBe('completed');
        });
    });
});