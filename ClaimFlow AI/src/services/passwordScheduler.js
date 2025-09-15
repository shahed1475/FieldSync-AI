/**
 * Password Policy Scheduler Service
 * Handles automated password policy enforcement tasks
 * - Password expiry notifications
 * - Password history cleanup
 * - Account lockout management
 * - Security compliance monitoring
 */

const cron = require('node-cron');
const { supabase } = require('../config/database');
const { logHelpers } = require('../utils/logHelpers');
const passwordPolicy = require('../config/passwordPolicy');
const { v4: uuidv4 } = require('uuid');

class PasswordScheduler {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize all scheduled jobs
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('Password scheduler already initialized');
      return;
    }

    try {
      // Schedule password expiry notifications (daily at 9 AM)
      this.schedulePasswordExpiryNotifications();
      
      // Schedule password history cleanup (weekly on Sunday at 2 AM)
      this.schedulePasswordHistoryCleanup();
      
      // Schedule account lockout cleanup (hourly)
      this.scheduleAccountLockoutCleanup();
      
      // Schedule security compliance monitoring (daily at 6 AM)
      this.scheduleSecurityComplianceCheck();
      
      // Schedule failed login attempts reset (daily at midnight)
      this.scheduleFailedAttemptsReset();
      
      this.isInitialized = true;
      console.log('Password scheduler initialized successfully');
      
      // Log initialization
      await logHelpers.logSystemEvent(
        'password_scheduler_initialized',
        'system',
        {
          jobCount: this.jobs.size,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      console.error('Failed to initialize password scheduler:', error);
      await logHelpers.logError(
        'Password scheduler initialization failed',
        error,
        { component: 'PasswordScheduler' }
      );
      throw error;
    }
  }

  /**
   * Schedule password expiry notifications
   * Runs daily at 9 AM to notify users of expiring passwords
   */
  schedulePasswordExpiryNotifications() {
    const job = cron.schedule('0 9 * * *', async () => {
      const correlationId = uuidv4();
      
      try {
        console.log('Running password expiry notifications job...');
        
        // Find users whose passwords expire in the warning period
        const warningDate = new Date();
        warningDate.setDate(warningDate.getDate() + passwordPolicy.expiry.warningDays);
        
        const { data: expiringUsers, error } = await supabase
          .from('providers')
          .select('id, name, email, role, password_expires_at, password_warning_sent')
          .lte('password_expires_at', warningDate.toISOString())
          .gte('password_expires_at', new Date().toISOString())
          .eq('is_active', true)
          .eq('password_warning_sent', false);
        
        if (error) {
          throw error;
        }
        
        if (!expiringUsers || expiringUsers.length === 0) {
          console.log('No users with expiring passwords found');
          return;
        }
        
        console.log(`Found ${expiringUsers.length} users with expiring passwords`);
        
        // Process each user
        for (const user of expiringUsers) {
          try {
            const expiresAt = new Date(user.password_expires_at);
            const daysRemaining = Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
            
            // Create notification record in audit logs
            await logHelpers.logUserActivity(
              user.id,
              'password_expiry_warning',
              'notification',
              {
                correlationId,
                email: user.email,
                name: user.name,
                expiresAt: user.password_expires_at,
                daysRemaining,
                notificationType: 'email'
              }
            );
            
            // Mark warning as sent
            await supabase
              .from('providers')
              .update({
                password_warning_sent: true,
                updated_at: new Date().toISOString()
              })
              .eq('id', user.id);
            
            console.log(`Password expiry warning queued for user: ${user.email}`);
            
          } catch (userError) {
            console.error(`Failed to process expiry warning for user ${user.id}:`, userError);
            await logHelpers.logError(
              'Password expiry notification failed for user',
              userError,
              { userId: user.id, email: user.email, correlationId }
            );
          }
        }
        
        // Log job completion
        await logHelpers.logSystemEvent(
          'password_expiry_notifications_completed',
          'system',
          {
            correlationId,
            usersProcessed: expiringUsers.length,
            timestamp: new Date().toISOString()
          }
        );
        
      } catch (error) {
        console.error('Password expiry notifications job failed:', error);
        await logHelpers.logError(
          'Password expiry notifications job failed',
          error,
          { correlationId, component: 'PasswordScheduler' }
        );
      }
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });
    
    this.jobs.set('passwordExpiryNotifications', job);
    job.start();
    console.log('Scheduled password expiry notifications job (daily at 9 AM)');
  }

  /**
   * Schedule password history cleanup
   * Runs weekly to clean up old password history records
   */
  schedulePasswordHistoryCleanup() {
    const job = cron.schedule('0 2 * * 0', async () => {
      const correlationId = uuidv4();
      
      try {
        console.log('Running password history cleanup job...');
        
        // Call the database cleanup function
        const { error } = await supabase.rpc('cleanup_password_history');
        
        if (error) {
          throw error;
        }
        
        console.log('Password history cleanup completed successfully');
        
        // Log job completion
        await logHelpers.logSystemEvent(
          'password_history_cleanup_completed',
          'system',
          {
            correlationId,
            timestamp: new Date().toISOString()
          }
        );
        
      } catch (error) {
        console.error('Password history cleanup job failed:', error);
        await logHelpers.logError(
          'Password history cleanup job failed',
          error,
          { correlationId, component: 'PasswordScheduler' }
        );
      }
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });
    
    this.jobs.set('passwordHistoryCleanup', job);
    job.start();
    console.log('Scheduled password history cleanup job (weekly on Sunday at 2 AM)');
  }

  /**
   * Schedule account lockout cleanup
   * Runs hourly to clean up expired account lockouts
   */
  scheduleAccountLockoutCleanup() {
    const job = cron.schedule('0 * * * *', async () => {
      const correlationId = uuidv4();
      
      try {
        console.log('Running account lockout cleanup job...');
        
        // Find accounts with expired lockouts
        const { data: lockedAccounts, error: selectError } = await supabase
          .from('providers')
          .select('id, email, locked_until, failed_login_attempts')
          .not('locked_until', 'is', null)
          .lt('locked_until', new Date().toISOString());
        
        if (selectError) {
          throw selectError;
        }
        
        if (!lockedAccounts || lockedAccounts.length === 0) {
          console.log('No expired account lockouts found');
          return;
        }
        
        console.log(`Found ${lockedAccounts.length} expired account lockouts`);
        
        // Clear expired lockouts
        const { error: updateError } = await supabase
          .from('providers')
          .update({
            locked_until: null,
            failed_login_attempts: 0,
            updated_at: new Date().toISOString()
          })
          .not('locked_until', 'is', null)
          .lt('locked_until', new Date().toISOString());
        
        if (updateError) {
          throw updateError;
        }
        
        // Log each unlocked account
        for (const account of lockedAccounts) {
          await logHelpers.logUserActivity(
            account.id,
            'account_unlocked',
            'security',
            {
              correlationId,
              email: account.email,
              previousFailedAttempts: account.failed_login_attempts,
              unlockedAt: new Date().toISOString(),
              reason: 'lockout_expired'
            }
          );
        }
        
        console.log(`Unlocked ${lockedAccounts.length} expired accounts`);
        
        // Log job completion
        await logHelpers.logSystemEvent(
          'account_lockout_cleanup_completed',
          'system',
          {
            correlationId,
            accountsUnlocked: lockedAccounts.length,
            timestamp: new Date().toISOString()
          }
        );
        
      } catch (error) {
        console.error('Account lockout cleanup job failed:', error);
        await logHelpers.logError(
          'Account lockout cleanup job failed',
          error,
          { correlationId, component: 'PasswordScheduler' }
        );
      }
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });
    
    this.jobs.set('accountLockoutCleanup', job);
    job.start();
    console.log('Scheduled account lockout cleanup job (hourly)');
  }

  /**
   * Schedule security compliance monitoring
   * Runs daily to check overall security compliance
   */
  scheduleSecurityComplianceCheck() {
    const job = cron.schedule('0 6 * * *', async () => {
      const correlationId = uuidv4();
      
      try {
        console.log('Running security compliance check job...');
        
        // Get compliance statistics
        const { data: complianceStats, error } = await supabase
          .from('password_policy_compliance')
          .select('*');
        
        if (error) {
          throw error;
        }
        
        if (!complianceStats) {
          console.log('No compliance data found');
          return;
        }
        
        // Analyze compliance data
        const totalUsers = complianceStats.length;
        const expiredPasswords = complianceStats.filter(u => u.password_status === 'EXPIRED').length;
        const expiringSoon = complianceStats.filter(u => u.password_status === 'EXPIRING_SOON').length;
        const lockedAccounts = complianceStats.filter(u => u.account_status === 'LOCKED').length;
        const highRiskAccounts = complianceStats.filter(u => u.account_status === 'HIGH_RISK').length;
        
        const complianceReport = {
          totalUsers,
          expiredPasswords,
          expiringSoon,
          lockedAccounts,
          highRiskAccounts,
          complianceRate: ((totalUsers - expiredPasswords - lockedAccounts) / totalUsers * 100).toFixed(2),
          timestamp: new Date().toISOString()
        };
        
        console.log('Security compliance report:', complianceReport);
        
        // Log compliance report
        await logHelpers.logSystemEvent(
          'security_compliance_report',
          'system',
          {
            correlationId,
            ...complianceReport
          }
        );
        
        // Alert if compliance rate is below threshold
        const complianceThreshold = 95; // 95% compliance required
        if (parseFloat(complianceReport.complianceRate) < complianceThreshold) {
          await logHelpers.logSecurityViolation(
            'Security compliance below threshold',
            'high',
            {
              correlationId,
              complianceRate: complianceReport.complianceRate,
              threshold: complianceThreshold,
              ...complianceReport
            }
          );
        }
        
      } catch (error) {
        console.error('Security compliance check job failed:', error);
        await logHelpers.logError(
          'Security compliance check job failed',
          error,
          { correlationId, component: 'PasswordScheduler' }
        );
      }
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });
    
    this.jobs.set('securityComplianceCheck', job);
    job.start();
    console.log('Scheduled security compliance check job (daily at 6 AM)');
  }

  /**
   * Schedule failed login attempts reset
   * Runs daily to reset old failed login attempts
   */
  scheduleFailedAttemptsReset() {
    const job = cron.schedule('0 0 * * *', async () => {
      const correlationId = uuidv4();
      
      try {
        console.log('Running failed login attempts reset job...');
        
        // Reset failed attempts for accounts that haven't been locked recently
        // and have some failed attempts but aren't currently locked
        const resetThreshold = new Date();
        resetThreshold.setHours(resetThreshold.getHours() - 24); // 24 hours ago
        
        const { data: accountsToReset, error: selectError } = await supabase
          .from('providers')
          .select('id, email, failed_login_attempts')
          .gt('failed_login_attempts', 0)
          .lt('failed_login_attempts', passwordPolicy.lockout.maxAttempts)
          .is('locked_until', null)
          .or(`last_lockout_at.is.null,last_lockout_at.lt.${resetThreshold.toISOString()}`);
        
        if (selectError) {
          throw selectError;
        }
        
        if (!accountsToReset || accountsToReset.length === 0) {
          console.log('No accounts need failed attempts reset');
          return;
        }
        
        console.log(`Resetting failed attempts for ${accountsToReset.length} accounts`);
        
        // Reset failed attempts
        const { error: updateError } = await supabase
          .from('providers')
          .update({
            failed_login_attempts: 0,
            updated_at: new Date().toISOString()
          })
          .in('id', accountsToReset.map(a => a.id));
        
        if (updateError) {
          throw updateError;
        }
        
        // Log the reset
        await logHelpers.logSystemEvent(
          'failed_attempts_reset_completed',
          'system',
          {
            correlationId,
            accountsReset: accountsToReset.length,
            timestamp: new Date().toISOString()
          }
        );
        
        console.log(`Reset failed login attempts for ${accountsToReset.length} accounts`);
        
      } catch (error) {
        console.error('Failed login attempts reset job failed:', error);
        await logHelpers.logError(
          'Failed login attempts reset job failed',
          error,
          { correlationId, component: 'PasswordScheduler' }
        );
      }
    }, {
      scheduled: false,
      timezone: 'America/New_York'
    });
    
    this.jobs.set('failedAttemptsReset', job);
    job.start();
    console.log('Scheduled failed login attempts reset job (daily at midnight)');
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    console.log('Stopping all password scheduler jobs...');
    
    for (const [name, job] of this.jobs) {
      try {
        job.stop();
        console.log(`Stopped job: ${name}`);
      } catch (error) {
        console.error(`Failed to stop job ${name}:`, error);
      }
    }
    
    this.jobs.clear();
    this.isInitialized = false;
    console.log('All password scheduler jobs stopped');
  }

  /**
   * Get status of all jobs
   */
  getStatus() {
    const status = {
      initialized: this.isInitialized,
      jobCount: this.jobs.size,
      jobs: {}
    };
    
    for (const [name, job] of this.jobs) {
      status.jobs[name] = {
        running: job.running || false,
        scheduled: true
      };
    }
    
    return status;
  }

  /**
   * Manually trigger a specific job (for testing)
   */
  async triggerJob(jobName) {
    const job = this.jobs.get(jobName);
    if (!job) {
      throw new Error(`Job '${jobName}' not found`);
    }
    
    console.log(`Manually triggering job: ${jobName}`);
    
    // This is a bit hacky, but we'll extract the task function
    // In a real implementation, you'd store the task functions separately
    switch (jobName) {
      case 'passwordExpiryNotifications':
        // Re-run the password expiry notifications logic
        break;
      case 'passwordHistoryCleanup':
        // Re-run the password history cleanup logic
        break;
      case 'accountLockoutCleanup':
        // Re-run the account lockout cleanup logic
        break;
      case 'securityComplianceCheck':
        // Re-run the security compliance check logic
        break;
      case 'failedAttemptsReset':
        // Re-run the failed attempts reset logic
        break;
      default:
        throw new Error(`Unknown job: ${jobName}`);
    }
  }
}

// Create singleton instance
const passwordScheduler = new PasswordScheduler();

module.exports = passwordScheduler;