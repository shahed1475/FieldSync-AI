/**
 * OCCAM Status Agent
 * Intelligent monitoring agent for tracking workflow states,
 * generating summaries, and issuing proactive compliance alerts
 */
import { Logger } from '../utils/logger';
import { FactBoxService } from '../services/factbox.service';
import { AuditService } from '../services/audit.service';
import { SecureVault } from '../services/securevault.service';
import { NotificationService } from '../services/notification.service';
import { WorkflowProgress, StatusSummary, RenewalAlert, NotificationChannel } from '../types';
export interface OCCAMStatusAgentConfig {
    renewalWarningDays?: number;
    renewalCriticalDays?: number;
    enableAutoAlerts?: boolean;
    notificationChannels?: NotificationChannel[];
    storagePath?: string;
}
/**
 * OCCAMStatusAgent - Workflow Monitoring and Status Tracking
 */
export declare class OCCAMStatusAgent {
    private logger;
    private factBoxService;
    private auditService;
    private secureVault;
    private notificationService;
    private config;
    private storagePath;
    private workflowsPath;
    constructor(factBoxService: FactBoxService, auditService: AuditService, secureVault: SecureVault, notificationService: NotificationService, config?: OCCAMStatusAgentConfig, logger?: Logger);
    /**
     * Initialize the status agent
     */
    initialize(): Promise<void>;
    /**
     * Track workflow progress
     * Monitors each state transition and updates workflow state
     */
    trackWorkflowProgress(workflowId: string): Promise<WorkflowProgress>;
    /**
     * Generate status summary for an entity
     * Returns comprehensive JSON summary of current progress, delays, and pending actions
     */
    generateStatusSummary(entityId: string): Promise<StatusSummary>;
    /**
     * Send renewal alerts
     * Issues timely notifications for upcoming renewals or expiring licenses
     */
    sendRenewalAlerts(): Promise<RenewalAlert[]>;
    /**
     * Create and send a renewal alert
     */
    private createRenewalAlert;
    /**
     * Send alert notifications across enabled channels
     */
    private sendAlertNotifications;
    /**
     * Format alert message for notification
     */
    private formatAlertMessage;
    /**
     * Get recipient for a specific channel
     */
    private getChannelRecipient;
    /**
     * Get workflow state
     */
    private getWorkflowState;
    /**
     * Get workflows by entity
     */
    private getWorkflowsByEntity;
    /**
     * Load workflows from storage
     */
    private loadWorkflows;
    /**
     * Validate workflow ID format
     */
    private isValidWorkflowId;
    /**
     * Validate entity ID format
     */
    private isValidEntityId;
    /**
     * Calculate workflow progress percentage
     */
    private calculateProgress;
    /**
     * Detect delays in workflow
     */
    private detectDelays;
    /**
     * Get pending actions for workflow
     */
    private getPendingActions;
    /**
     * Estimate workflow completion date
     */
    private estimateCompletionDate;
    /**
     * Calculate risk level for entity
     */
    private calculateRiskLevel;
    /**
     * Get upcoming deadlines for entity
     */
    private getUpcomingDeadlines;
}
export default OCCAMStatusAgent;
//# sourceMappingURL=occam-status-agent.d.ts.map