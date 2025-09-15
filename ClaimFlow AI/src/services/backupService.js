/**
 * Automated Backup and Disaster Recovery Service
 * HIPAA-compliant backup management with encryption and retention policies
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { S3Client } = require('@aws-sdk/client-s3');
const cron = require('node-cron');
const { supabase } = require('../database/connection');
const { auditLogger } = require('../utils/logger');
const { sendEmail } = require('../utils/email');

class BackupService {
  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    
    this.backupConfig = {
      bucket: process.env.BACKUP_BUCKET || 'claimflow-backups',
      kmsKeyId: process.env.BACKUP_KMS_KEY_ID,
      retentionDays: {
        daily: 30,
        weekly: 90,
        monthly: 365,
        yearly: 2555 // 7 years for HIPAA compliance
      },
      encryptionAlgorithm: 'aes-256-gcm',
      compressionLevel: 9
    };
    
    this.scheduledJobs = new Map();
    this.backupInProgress = false;
    this.lastBackupStatus = null;
  }
  
  /**
   * Initialize backup service and start scheduled jobs
   */
  async initialize() {
    try {
      await this.validateConfiguration();
      await this.setupScheduledBackups();
      await this.cleanupOldBackups();
      
      auditLogger.info('Backup service initialized successfully', {
        complianceFlags: ['BACKUP_SERVICE_INIT'],
        metadata: {
          schedules: Array.from(this.scheduledJobs.keys()),
          retention_policy: this.backupConfig.retentionDays
        }
      });
      
      return true;
    } catch (error) {
      auditLogger.error('Failed to initialize backup service', {
        error: error.message,
        complianceFlags: ['BACKUP_SERVICE_ERROR']
      });
      throw error;
    }
  }
  
  /**
   * Validate backup configuration and AWS connectivity
   */
  async validateConfiguration() {
    // Check required environment variables
    const requiredVars = [
      'DATABASE_URL',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'BACKUP_BUCKET'
    ];
    
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
      }
    }
    
    // Test S3 connectivity
    try {
      await this.s3.headBucket({ Bucket: this.backupConfig.bucket }).promise();
    } catch (error) {
      if (error.code === 'NotFound') {
        // Create bucket if it doesn't exist
        await this.s3.createBucket({
          Bucket: this.backupConfig.bucket,
          CreateBucketConfiguration: {
            LocationConstraint: process.env.AWS_REGION || 'us-east-1'
          }
        }).promise();
        
        // Enable versioning
        await this.s3.putBucketVersioning({
          Bucket: this.backupConfig.bucket,
          VersioningConfiguration: {
            Status: 'Enabled'
          }
        }).promise();
        
        // Set lifecycle policy
        await this.s3.putBucketLifecycleConfiguration({
          Bucket: this.backupConfig.bucket,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: 'BackupRetentionPolicy',
                Status: 'Enabled',
                Filter: { Prefix: 'backups/' },
                Transitions: [
                  {
                    Days: 30,
                    StorageClass: 'STANDARD_IA'
                  },
                  {
                    Days: 90,
                    StorageClass: 'GLACIER'
                  },
                  {
                    Days: 365,
                    StorageClass: 'DEEP_ARCHIVE'
                  }
                ],
                Expiration: {
                  Days: this.backupConfig.retentionDays.yearly
                }
              }
            ]
          }
        }).promise();
      } else {
        throw error;
      }
    }
    
    // Test database connectivity
    const { error } = await supabase.from('practices').select('count').limit(1);
    if (error) {
      throw new Error(`Database connectivity test failed: ${error.message}`);
    }
  }
  
  /**
   * Setup scheduled backup jobs
   */
  async setupScheduledBackups() {
    // Daily backup at 2 AM
    const dailyJob = cron.schedule('0 2 * * *', async () => {
      await this.performBackup('daily');
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });
    
    // Weekly backup on Sunday at 3 AM
    const weeklyJob = cron.schedule('0 3 * * 0', async () => {
      await this.performBackup('weekly');
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });
    
    // Monthly backup on 1st at 4 AM
    const monthlyJob = cron.schedule('0 4 1 * *', async () => {
      await this.performBackup('monthly');
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });
    
    // Yearly backup on January 1st at 5 AM
    const yearlyJob = cron.schedule('0 5 1 1 *', async () => {
      await this.performBackup('yearly');
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });
    
    this.scheduledJobs.set('daily', dailyJob);
    this.scheduledJobs.set('weekly', weeklyJob);
    this.scheduledJobs.set('monthly', monthlyJob);
    this.scheduledJobs.set('yearly', yearlyJob);
    
    // Start all jobs
    this.scheduledJobs.forEach(job => job.start());
  }
  
  /**
   * Perform database backup
   */
  async performBackup(type = 'manual') {
    if (this.backupInProgress) {
      throw new Error('Backup already in progress');
    }
    
    this.backupInProgress = true;
    const backupId = crypto.randomUUID();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${type}-backup-${timestamp}`;
    
    try {
      auditLogger.info('Starting database backup', {
        complianceFlags: ['BACKUP_START'],
        metadata: {
          backup_id: backupId,
          backup_name: backupName,
          backup_type: type
        }
      });
      
      // Create database dump
      const dumpResult = await this.createDatabaseDump(backupName);
      
      // Encrypt backup
      const encryptionResult = await this.encryptBackup(dumpResult.filePath, backupName);
      
      // Upload to S3
      const uploadResult = await this.uploadToS3(encryptionResult.encryptedPath, backupName, type);
      
      // Store backup metadata
      const backupRecord = await this.storeBackupMetadata({
        id: backupId,
        name: backupName,
        type,
        size: uploadResult.size,
        s3_location: uploadResult.location,
        encryption_key_id: encryptionResult.keyId,
        checksum: encryptionResult.checksum,
        created_at: new Date().toISOString()
      });
      
      // Cleanup local files
      await this.cleanupLocalFiles([dumpResult.filePath, encryptionResult.encryptedPath]);
      
      // Verify backup integrity
      await this.verifyBackupIntegrity(uploadResult.location, encryptionResult.checksum);
      
      this.lastBackupStatus = {
        success: true,
        backup_id: backupId,
        timestamp: new Date().toISOString(),
        type,
        size: uploadResult.size
      };
      
      auditLogger.info('Database backup completed successfully', {
        complianceFlags: ['BACKUP_SUCCESS'],
        metadata: {
          backup_id: backupId,
          backup_name: backupName,
          backup_type: type,
          size_bytes: uploadResult.size,
          duration_ms: Date.now() - new Date(backupRecord.created_at).getTime()
        }
      });
      
      // Send success notification for critical backups
      if (['weekly', 'monthly', 'yearly'].includes(type)) {
        await this.sendBackupNotification('success', backupRecord);
      }
      
      return backupRecord;
      
    } catch (error) {
      this.lastBackupStatus = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        type
      };
      
      auditLogger.error('Database backup failed', {
        complianceFlags: ['BACKUP_FAILURE'],
        metadata: {
          backup_id: backupId,
          backup_name: backupName,
          backup_type: type,
          error: error.message
        }
      });
      
      // Send failure notification
      await this.sendBackupNotification('failure', { name: backupName, type, error: error.message });
      
      throw error;
    } finally {
      this.backupInProgress = false;
    }
  }
  
  /**
   * Create database dump using pg_dump
   */
  async createDatabaseDump(backupName) {
    const tempDir = path.join(process.cwd(), 'temp', 'backups');
    await fs.mkdir(tempDir, { recursive: true });
    
    const dumpPath = path.join(tempDir, `${backupName}.sql`);
    const databaseUrl = process.env.DATABASE_URL;
    
    return new Promise((resolve, reject) => {
      const pgDump = spawn('pg_dump', [
        databaseUrl,
        '--no-password',
        '--clean',
        '--create',
        '--verbose',
        '--file', dumpPath
      ]);
      
      let stderr = '';
      
      pgDump.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      pgDump.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`pg_dump failed with code ${code}: ${stderr}`));
          return;
        }
        
        try {
          const stats = await fs.stat(dumpPath);
          resolve({
            filePath: dumpPath,
            size: stats.size
          });
        } catch (error) {
          reject(error);
        }
      });
      
      pgDump.on('error', (error) => {
        reject(new Error(`pg_dump process error: ${error.message}`));
      });
    });
  }
  
  /**
   * Encrypt backup file
   */
  async encryptBackup(filePath, backupName) {
    const encryptedPath = `${filePath}.enc`;
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const keyId = crypto.randomUUID();
    
    // Read file and encrypt
    const fileData = await fs.readFile(filePath);
    const cipher = crypto.createCipher(this.backupConfig.encryptionAlgorithm, key, iv);
    
    let encrypted = cipher.update(fileData);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    // Calculate checksum
    const checksum = crypto.createHash('sha256').update(encrypted).digest('hex');
    
    // Write encrypted file
    await fs.writeFile(encryptedPath, encrypted);
    
    // Store encryption key securely (in production, use AWS KMS or similar)
    await this.storeEncryptionKey(keyId, {
      key: key.toString('hex'),
      iv: iv.toString('hex'),
      algorithm: this.backupConfig.encryptionAlgorithm,
      backup_name: backupName
    });
    
    return {
      encryptedPath,
      keyId,
      checksum
    };
  }
  
  /**
   * Upload encrypted backup to S3
   */
  async uploadToS3(filePath, backupName, type) {
    const fileData = await fs.readFile(filePath);
    const key = `backups/${type}/${backupName}.sql.enc`;
    
    const uploadParams = {
      Bucket: this.backupConfig.bucket,
      Key: key,
      Body: fileData,
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: this.backupConfig.kmsKeyId,
      Metadata: {
        'backup-type': type,
        'backup-name': backupName,
        'created-at': new Date().toISOString(),
        'retention-period': this.backupConfig.retentionDays[type].toString(),
        'compliance': 'hipaa'
      },
      StorageClass: type === 'daily' ? 'STANDARD' : 'STANDARD_IA'
    };
    
    const result = await this.s3.upload(uploadParams).promise();
    
    return {
      location: result.Location,
      size: fileData.length,
      etag: result.ETag
    };
  }
  
  /**
   * Store backup metadata in database
   */
  async storeBackupMetadata(metadata) {
    const { data, error } = await supabase
      .from('backup_records')
      .insert(metadata)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to store backup metadata: ${error.message}`);
    }
    
    return data;
  }
  
  /**
   * Store encryption key securely
   */
  async storeEncryptionKey(keyId, keyData) {
    const { error } = await supabase
      .from('backup_encryption_keys')
      .insert({
        id: keyId,
        key_data: keyData,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      throw new Error(`Failed to store encryption key: ${error.message}`);
    }
  }
  
  /**
   * Verify backup integrity
   */
  async verifyBackupIntegrity(s3Location, expectedChecksum) {
    try {
      // Get object from S3
      const s3Key = s3Location.split('/').slice(3).join('/');
      const object = await this.s3.getObject({
        Bucket: this.backupConfig.bucket,
        Key: s3Key
      }).promise();
      
      // Calculate checksum
      const actualChecksum = crypto.createHash('sha256').update(object.Body).digest('hex');
      
      if (actualChecksum !== expectedChecksum) {
        throw new Error('Backup integrity check failed: checksum mismatch');
      }
      
      return true;
    } catch (error) {
      auditLogger.error('Backup integrity verification failed', {
        complianceFlags: ['BACKUP_INTEGRITY_FAILURE'],
        metadata: {
          s3_location: s3Location,
          expected_checksum: expectedChecksum,
          error: error.message
        }
      });
      throw error;
    }
  }
  
  /**
   * Cleanup local temporary files
   */
  async cleanupLocalFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Log but don't throw - cleanup is best effort
        auditLogger.warn('Failed to cleanup local backup file', {
          metadata: { file_path: filePath, error: error.message }
        });
      }
    }
  }
  
  /**
   * Cleanup old backups based on retention policy
   */
  async cleanupOldBackups() {
    try {
      for (const [type, retentionDays] of Object.entries(this.backupConfig.retentionDays)) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        // Get old backups from database
        const { data: oldBackups, error } = await supabase
          .from('backup_records')
          .select('*')
          .eq('type', type)
          .lt('created_at', cutoffDate.toISOString());
        
        if (error) {
          throw new Error(`Failed to query old backups: ${error.message}`);
        }
        
        // Delete from S3 and database
        for (const backup of oldBackups) {
          try {
            // Delete from S3
            const s3Key = backup.s3_location.split('/').slice(3).join('/');
            await this.s3.deleteObject({
              Bucket: this.backupConfig.bucket,
              Key: s3Key
            }).promise();
            
            // Delete encryption key
            await supabase
              .from('backup_encryption_keys')
              .delete()
              .eq('id', backup.encryption_key_id);
            
            // Delete backup record
            await supabase
              .from('backup_records')
              .delete()
              .eq('id', backup.id);
            
            auditLogger.info('Old backup cleaned up', {
              complianceFlags: ['BACKUP_CLEANUP'],
              metadata: {
                backup_id: backup.id,
                backup_name: backup.name,
                backup_type: type,
                age_days: Math.floor((Date.now() - new Date(backup.created_at).getTime()) / (1000 * 60 * 60 * 24))
              }
            });
          } catch (error) {
            auditLogger.error('Failed to cleanup old backup', {
              complianceFlags: ['BACKUP_CLEANUP_ERROR'],
              metadata: {
                backup_id: backup.id,
                error: error.message
              }
            });
          }
        }
      }
    } catch (error) {
      auditLogger.error('Backup cleanup process failed', {
        complianceFlags: ['BACKUP_CLEANUP_ERROR'],
        metadata: { error: error.message }
      });
    }
  }
  
  /**
   * Send backup notification email
   */
  async sendBackupNotification(status, backupInfo) {
    try {
      const adminEmails = process.env.BACKUP_NOTIFICATION_EMAILS?.split(',') || [];
      if (adminEmails.length === 0) return;
      
      const subject = status === 'success' 
        ? `✅ Backup Completed: ${backupInfo.name}`
        : `❌ Backup Failed: ${backupInfo.name}`;
      
      const html = this.generateBackupNotificationEmail(status, backupInfo);
      
      for (const email of adminEmails) {
        await sendEmail({
          to: email.trim(),
          subject,
          html
        });
      }
    } catch (error) {
      auditLogger.error('Failed to send backup notification', {
        metadata: { error: error.message }
      });
    }
  }
  
  /**
   * Generate backup notification email HTML
   */
  generateBackupNotificationEmail(status, backupInfo) {
    const isSuccess = status === 'success';
    const color = isSuccess ? '#28a745' : '#dc3545';
    const icon = isSuccess ? '✅' : '❌';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Backup Notification</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: ${color}; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 24px;">${icon} Backup ${isSuccess ? 'Completed' : 'Failed'}</h1>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: ${color};">Backup Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Backup Name:</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${backupInfo.name}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Type:</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${backupInfo.type}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Timestamp:</td>
                <td style="padding: 8px; border-bottom: 1px solid #ddd;">${new Date().toISOString()}</td>
              </tr>
              ${isSuccess ? `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Size:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">${this.formatBytes(backupInfo.size || 0)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Location:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd;">AWS S3</td>
                </tr>
              ` : `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Error:</td>
                  <td style="padding: 8px; border-bottom: 1px solid #ddd; color: #dc3545;">${backupInfo.error}</td>
                </tr>
              `}
            </table>
          </div>
          
          ${isSuccess ? `
            <div style="background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px;">
              <strong>✅ Success:</strong> The backup has been completed successfully and stored securely in AWS S3 with encryption.
            </div>
          ` : `
            <div style="background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; padding: 15px; border-radius: 5px;">
              <strong>❌ Failure:</strong> The backup process failed. Please check the system logs and take appropriate action.
            </div>
          `}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
            <p>This is an automated notification from ClaimFlow AI Backup Service.</p>
            <p>For support, please contact your system administrator.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Get backup status and statistics
   */
  async getBackupStatus() {
    try {
      const { data: recentBackups, error } = await supabase
        .from('backup_records')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) {
        throw new Error(`Failed to get backup status: ${error.message}`);
      }
      
      const { data: backupStats } = await supabase
        .from('backup_records')
        .select('type, size')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      
      const stats = {
        total_backups: backupStats?.length || 0,
        total_size: backupStats?.reduce((sum, backup) => sum + (backup.size || 0), 0) || 0,
        by_type: {}
      };
      
      if (backupStats) {
        for (const backup of backupStats) {
          if (!stats.by_type[backup.type]) {
            stats.by_type[backup.type] = { count: 0, size: 0 };
          }
          stats.by_type[backup.type].count++;
          stats.by_type[backup.type].size += backup.size || 0;
        }
      }
      
      return {
        last_backup_status: this.lastBackupStatus,
        backup_in_progress: this.backupInProgress,
        recent_backups: recentBackups,
        statistics: stats,
        scheduled_jobs: Array.from(this.scheduledJobs.keys()),
        retention_policy: this.backupConfig.retentionDays
      };
    } catch (error) {
      auditLogger.error('Failed to get backup status', {
        metadata: { error: error.message }
      });
      throw error;
    }
  }
  
  /**
   * Perform disaster recovery restore
   */
  async performRestore(backupId, targetDatabase = null) {
    try {
      auditLogger.warn('Disaster recovery restore initiated', {
        complianceFlags: ['DISASTER_RECOVERY_START'],
        metadata: {
          backup_id: backupId,
          target_database: targetDatabase,
          initiated_by: 'system'
        }
      });
      
      // Get backup metadata
      const { data: backup, error } = await supabase
        .from('backup_records')
        .select('*')
        .eq('id', backupId)
        .single();
      
      if (error || !backup) {
        throw new Error(`Backup not found: ${backupId}`);
      }
      
      // Download backup from S3
      const s3Key = backup.s3_location.split('/').slice(3).join('/');
      const backupData = await this.s3.getObject({
        Bucket: this.backupConfig.bucket,
        Key: s3Key
      }).promise();
      
      // Get encryption key
      const { data: keyData } = await supabase
        .from('backup_encryption_keys')
        .select('key_data')
        .eq('id', backup.encryption_key_id)
        .single();
      
      if (!keyData) {
        throw new Error('Encryption key not found for backup');
      }
      
      // Decrypt backup
      const decryptedData = await this.decryptBackup(backupData.Body, keyData.key_data);
      
      // Write to temporary file
      const tempDir = path.join(process.cwd(), 'temp', 'restore');
      await fs.mkdir(tempDir, { recursive: true });
      const restoreFile = path.join(tempDir, `restore-${Date.now()}.sql`);
      await fs.writeFile(restoreFile, decryptedData);
      
      // Perform restore using psql
      const databaseUrl = targetDatabase || process.env.DATABASE_URL;
      await this.executeRestore(restoreFile, databaseUrl);
      
      // Cleanup
      await fs.unlink(restoreFile);
      
      auditLogger.info('Disaster recovery restore completed', {
        complianceFlags: ['DISASTER_RECOVERY_SUCCESS'],
        metadata: {
          backup_id: backupId,
          backup_name: backup.name,
          restore_timestamp: new Date().toISOString()
        }
      });
      
      return {
        success: true,
        backup_id: backupId,
        backup_name: backup.name,
        restored_at: new Date().toISOString()
      };
      
    } catch (error) {
      auditLogger.error('Disaster recovery restore failed', {
        complianceFlags: ['DISASTER_RECOVERY_FAILURE'],
        metadata: {
          backup_id: backupId,
          error: error.message
        }
      });
      throw error;
    }
  }
  
  /**
   * Decrypt backup data
   */
  async decryptBackup(encryptedData, keyData) {
    const key = Buffer.from(keyData.key, 'hex');
    const iv = Buffer.from(keyData.iv, 'hex');
    
    const decipher = crypto.createDecipher(keyData.algorithm, key, iv);
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  }
  
  /**
   * Execute database restore
   */
  async executeRestore(restoreFile, databaseUrl) {
    return new Promise((resolve, reject) => {
      const psql = spawn('psql', [
        databaseUrl,
        '--file', restoreFile,
        '--verbose'
      ]);
      
      let stderr = '';
      
      psql.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      psql.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Database restore failed with code ${code}: ${stderr}`));
          return;
        }
        resolve();
      });
      
      psql.on('error', (error) => {
        reject(new Error(`psql process error: ${error.message}`));
      });
    });
  }
  
  /**
   * Stop all scheduled jobs
   */
  async shutdown() {
    try {
      this.scheduledJobs.forEach((job, name) => {
        job.stop();
        auditLogger.info(`Stopped backup job: ${name}`);
      });
      
      this.scheduledJobs.clear();
      
      auditLogger.info('Backup service shutdown completed', {
        complianceFlags: ['BACKUP_SERVICE_SHUTDOWN']
      });
    } catch (error) {
      auditLogger.error('Error during backup service shutdown', {
        error: error.message
      });
    }
  }
}

module.exports = BackupService;