const cron = require('node-cron');
const { DataSource } = require('../../models');
const { 
    GoogleSheetsService, 
    QuickBooksService, 
    DatabaseConnectorService, 
    ShopifyService, 
    StripeService 
} = require('../integrations');

class SyncScheduler {
    constructor(websocketServer = null) {
        this.websocketServer = websocketServer;
        this.scheduledTasks = new Map();
        this.runningTasks = new Map();
        this.services = {
            'google-sheets': new GoogleSheetsService(),
            'quickbooks': new QuickBooksService(),
            'postgresql': new DatabaseConnectorService(),
            'mysql': new DatabaseConnectorService(),
            'shopify': new ShopifyService(),
            'stripe': new StripeService()
        };
        
        this.defaultSchedules = {
            'google-sheets': '*/15 * * * *', // Every 15 minutes
            'quickbooks': '0 */2 * * *',    // Every 2 hours
            'postgresql': '*/30 * * * *',   // Every 30 minutes
            'mysql': '*/30 * * * *',        // Every 30 minutes
            'shopify': '*/10 * * * *',      // Every 10 minutes
            'stripe': '*/5 * * * *'         // Every 5 minutes
        };

        this.retryConfig = {
            maxRetries: 3,
            retryDelay: 60000, // 1 minute
            backoffMultiplier: 2
        };

        console.log('SyncScheduler initialized');
    }

    async initialize() {
        try {
            // Load all active data sources and schedule them
            const dataSources = await DataSource.findAll({
                where: { status: 'active' }
            });

            console.log(`Found ${dataSources.length} active data sources to schedule`);

            for (const dataSource of dataSources) {
                await this.scheduleDataSource(dataSource);
            }

            // Schedule cleanup task
            this.scheduleCleanupTask();

            console.log('SyncScheduler initialization complete');
        } catch (error) {
            console.error('Error initializing SyncScheduler:', error);
        }
    }

    async scheduleDataSource(dataSource) {
        const { id, type, name, metadata } = dataSource;
        
        // Get schedule from metadata or use default
        const schedule = metadata?.syncSchedule || this.defaultSchedules[type] || '0 */1 * * *'; // Default: hourly
        
        if (!cron.validate(schedule)) {
            console.error(`Invalid cron schedule for data source ${id}: ${schedule}`);
            return false;
        }

        // Cancel existing task if any
        this.cancelScheduledTask(id);

        // Create new scheduled task
        const task = cron.schedule(schedule, async () => {
            await this.executeSyncTask(dataSource);
        }, {
            scheduled: false,
            timezone: metadata?.timezone || 'UTC'
        });

        this.scheduledTasks.set(id, {
            task,
            schedule,
            dataSource,
            createdAt: new Date(),
            lastRun: null,
            nextRun: this.getNextRunTime(schedule),
            runCount: 0,
            errorCount: 0
        });

        // Start the task
        task.start();

        console.log(`Scheduled sync for ${name} (${type}) with schedule: ${schedule}`);
        
        // Notify via WebSocket
        if (this.websocketServer) {
            this.websocketServer.broadcastSystemNotification(
                'schedule_created',
                `Sync scheduled for ${name}`,
                { dataSourceId: id, schedule }
            );
        }

        return true;
    }

    async executeSyncTask(dataSource) {
        const { id, type, name } = dataSource;
        
        // Check if already running
        if (this.runningTasks.has(id)) {
            console.log(`Sync already running for ${name}, skipping...`);
            return;
        }

        const taskInfo = this.scheduledTasks.get(id);
        if (taskInfo) {
            taskInfo.lastRun = new Date();
            taskInfo.runCount++;
        }

        // Mark as running
        this.runningTasks.set(id, {
            startTime: new Date(),
            dataSource,
            retryCount: 0
        });

        console.log(`Starting scheduled sync for ${name} (${type})`);

        // Notify start via WebSocket
        if (this.websocketServer) {
            this.websocketServer.broadcastIntegrationStatus(id, 'syncing', {
                message: 'Scheduled sync started',
                startTime: new Date().toISOString()
            });
        }

        try {
            await this.performSync(dataSource);
            
            // Update success metrics
            if (taskInfo) {
                taskInfo.errorCount = 0; // Reset error count on success
            }

            console.log(`Scheduled sync completed successfully for ${name}`);
            
            // Notify completion via WebSocket
            if (this.websocketServer) {
                this.websocketServer.broadcastSyncComplete(id, {
                    success: true,
                    message: 'Scheduled sync completed successfully',
                    completedAt: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error(`Scheduled sync failed for ${name}:`, error);
            
            // Update error metrics
            if (taskInfo) {
                taskInfo.errorCount++;
            }

            // Attempt retry if configured
            const runningTask = this.runningTasks.get(id);
            if (runningTask && runningTask.retryCount < this.retryConfig.maxRetries) {
                await this.scheduleRetry(dataSource, error);
            } else {
                // Notify error via WebSocket
                if (this.websocketServer) {
                    this.websocketServer.broadcastSyncError(id, error);
                }
            }
        } finally {
            // Remove from running tasks
            this.runningTasks.delete(id);
        }
    }

    async performSync(dataSource) {
        const { id, type } = dataSource;
        const service = this.services[type];
        
        if (!service) {
            throw new Error(`No service available for type: ${type}`);
        }

        // Update data source status
        await DataSource.update(
            { status: 'syncing' },
            { where: { id } }
        );

        try {
            // Perform the actual sync
            const result = await service.syncData(id);
            
            // Update metadata with sync results
            const metadata = dataSource.metadata || {};
            metadata.lastSync = new Date().toISOString();
            metadata.lastSyncResult = result;
            metadata.syncCount = (metadata.syncCount || 0) + 1;

            await DataSource.update(
                { 
                    status: 'active',
                    metadata: metadata
                },
                { where: { id } }
            );

            return result;
        } catch (error) {
            // Update status to error
            await DataSource.update(
                { status: 'error' },
                { where: { id } }
            );
            throw error;
        }
    }

    async scheduleRetry(dataSource, originalError) {
        const { id, name } = dataSource;
        const runningTask = this.runningTasks.get(id);
        
        if (!runningTask) return;

        runningTask.retryCount++;
        const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, runningTask.retryCount - 1);

        console.log(`Scheduling retry ${runningTask.retryCount}/${this.retryConfig.maxRetries} for ${name} in ${delay}ms`);

        // Notify retry via WebSocket
        if (this.websocketServer) {
            this.websocketServer.broadcastIntegrationStatus(id, 'retrying', {
                message: `Retry ${runningTask.retryCount}/${this.retryConfig.maxRetries} scheduled`,
                retryIn: delay,
                originalError: originalError.message
            });
        }

        setTimeout(async () => {
            try {
                await this.performSync(dataSource);
                
                console.log(`Retry successful for ${name}`);
                
                // Notify success via WebSocket
                if (this.websocketServer) {
                    this.websocketServer.broadcastSyncComplete(id, {
                        success: true,
                        message: `Retry ${runningTask.retryCount} successful`,
                        completedAt: new Date().toISOString()
                    });
                }
            } catch (retryError) {
                console.error(`Retry ${runningTask.retryCount} failed for ${name}:`, retryError);
                
                if (runningTask.retryCount < this.retryConfig.maxRetries) {
                    await this.scheduleRetry(dataSource, retryError);
                } else {
                    console.error(`All retries exhausted for ${name}`);
                    
                    // Notify final failure via WebSocket
                    if (this.websocketServer) {
                        this.websocketServer.broadcastSyncError(id, {
                            message: 'All retries exhausted',
                            originalError: originalError.message,
                            finalError: retryError.message,
                            retryCount: runningTask.retryCount
                        });
                    }
                }
            }
        }, delay);
    }

    cancelScheduledTask(dataSourceId) {
        const taskInfo = this.scheduledTasks.get(dataSourceId);
        if (taskInfo) {
            taskInfo.task.stop();
            taskInfo.task.destroy();
            this.scheduledTasks.delete(dataSourceId);
            console.log(`Cancelled scheduled task for data source: ${dataSourceId}`);
            return true;
        }
        return false;
    }

    async updateSchedule(dataSourceId, newSchedule, timezone = 'UTC') {
        if (!cron.validate(newSchedule)) {
            throw new Error(`Invalid cron schedule: ${newSchedule}`);
        }

        const dataSource = await DataSource.findByPk(dataSourceId);
        if (!dataSource) {
            throw new Error(`Data source not found: ${dataSourceId}`);
        }

        // Update metadata
        const metadata = dataSource.metadata || {};
        metadata.syncSchedule = newSchedule;
        metadata.timezone = timezone;

        await DataSource.update(
            { metadata },
            { where: { id: dataSourceId } }
        );

        // Reschedule
        await this.scheduleDataSource(dataSource);

        console.log(`Updated schedule for ${dataSource.name}: ${newSchedule}`);
        
        // Notify via WebSocket
        if (this.websocketServer) {
            this.websocketServer.broadcastSystemNotification(
                'schedule_updated',
                `Sync schedule updated for ${dataSource.name}`,
                { dataSourceId, schedule: newSchedule, timezone }
            );
        }

        return true;
    }

    pauseSchedule(dataSourceId) {
        const taskInfo = this.scheduledTasks.get(dataSourceId);
        if (taskInfo) {
            taskInfo.task.stop();
            console.log(`Paused schedule for data source: ${dataSourceId}`);
            return true;
        }
        return false;
    }

    resumeSchedule(dataSourceId) {
        const taskInfo = this.scheduledTasks.get(dataSourceId);
        if (taskInfo) {
            taskInfo.task.start();
            console.log(`Resumed schedule for data source: ${dataSourceId}`);
            return true;
        }
        return false;
    }

    async triggerImmediateSync(dataSourceId) {
        const dataSource = await DataSource.findByPk(dataSourceId);
        if (!dataSource) {
            throw new Error(`Data source not found: ${dataSourceId}`);
        }

        console.log(`Triggering immediate sync for ${dataSource.name}`);
        await this.executeSyncTask(dataSource);
    }

    getScheduleStatus(dataSourceId) {
        const taskInfo = this.scheduledTasks.get(dataSourceId);
        const runningTask = this.runningTasks.get(dataSourceId);

        if (!taskInfo) {
            return { status: 'not_scheduled' };
        }

        return {
            status: runningTask ? 'running' : 'scheduled',
            schedule: taskInfo.schedule,
            lastRun: taskInfo.lastRun,
            nextRun: taskInfo.nextRun,
            runCount: taskInfo.runCount,
            errorCount: taskInfo.errorCount,
            isRunning: !!runningTask,
            runningTask: runningTask ? {
                startTime: runningTask.startTime,
                retryCount: runningTask.retryCount
            } : null
        };
    }

    getAllScheduleStatuses() {
        const statuses = {};
        
        this.scheduledTasks.forEach((taskInfo, dataSourceId) => {
            statuses[dataSourceId] = this.getScheduleStatus(dataSourceId);
        });

        return statuses;
    }

    scheduleCleanupTask() {
        // Run cleanup every hour
        cron.schedule('0 * * * *', () => {
            this.performCleanup();
        });
    }

    performCleanup() {
        console.log('Performing scheduler cleanup...');
        
        // Clean up completed running tasks (shouldn't happen, but safety measure)
        const now = new Date();
        this.runningTasks.forEach((task, dataSourceId) => {
            const runningTime = now - task.startTime;
            // If running for more than 2 hours, consider it stuck
            if (runningTime > 2 * 60 * 60 * 1000) {
                console.log(`Cleaning up stuck task for data source: ${dataSourceId}`);
                this.runningTasks.delete(dataSourceId);
            }
        });

        // Update next run times
        this.scheduledTasks.forEach((taskInfo) => {
            taskInfo.nextRun = this.getNextRunTime(taskInfo.schedule);
        });
    }

    getNextRunTime(schedule) {
        try {
            const task = cron.schedule(schedule, () => {}, { scheduled: false });
            // This is a simplified approach - in production, you'd use a proper cron parser
            return new Date(Date.now() + 60000); // Placeholder: 1 minute from now
        } catch (error) {
            return null;
        }
    }

    getStats() {
        return {
            totalScheduled: this.scheduledTasks.size,
            currentlyRunning: this.runningTasks.size,
            scheduledTasks: Array.from(this.scheduledTasks.entries()).map(([id, info]) => ({
                dataSourceId: id,
                schedule: info.schedule,
                lastRun: info.lastRun,
                nextRun: info.nextRun,
                runCount: info.runCount,
                errorCount: info.errorCount
            })),
            runningTasks: Array.from(this.runningTasks.entries()).map(([id, info]) => ({
                dataSourceId: id,
                startTime: info.startTime,
                retryCount: info.retryCount,
                dataSourceName: info.dataSource.name
            }))
        };
    }

    async shutdown() {
        console.log('Shutting down SyncScheduler...');
        
        // Stop all scheduled tasks
        this.scheduledTasks.forEach((taskInfo, dataSourceId) => {
            taskInfo.task.stop();
            taskInfo.task.destroy();
        });
        
        this.scheduledTasks.clear();
        this.runningTasks.clear();
        
        console.log('SyncScheduler shutdown complete');
    }
}

module.exports = SyncScheduler;