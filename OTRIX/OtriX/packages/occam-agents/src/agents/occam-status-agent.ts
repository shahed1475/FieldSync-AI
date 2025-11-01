/**
 * OCCAM Status Agent
 * Intelligent monitoring agent for tracking workflow states,
 * generating summaries, and issuing proactive compliance alerts
 */

import { v4 as uuidv4 } from 'uuid';
import { format, differenceInDays, addDays, parseISO } from 'date-fns';
import { Logger } from '../utils/logger';
import { FactBoxService } from '../services/factbox.service';
import { AuditService } from '../services/audit.service';
import { SecureVault } from '../services/securevault.service';
import { NotificationService } from '../services/notification.service';
import {
  WorkflowState,
  WorkflowProgress,
  WorkflowStage,
  WorkflowStatus,
  StatusSummary,
  RenewalAlert,
  SeverityLevel,
  RiskLevel,
  NotificationChannel,
  NotificationMessage,
  UpcomingDeadline,
} from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

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
export class OCCAMStatusAgent {
  private logger: Logger;
  private factBoxService: FactBoxService;
  private auditService: AuditService;
  private secureVault: SecureVault;
  private notificationService: NotificationService;
  private config: Required<OCCAMStatusAgentConfig>;
  private storagePath: string;
  private workflowsPath: string;

  constructor(
    factBoxService: FactBoxService,
    auditService: AuditService,
    secureVault: SecureVault,
    notificationService: NotificationService,
    config?: OCCAMStatusAgentConfig,
    logger?: Logger
  ) {
    this.logger = logger || new Logger();
    this.factBoxService = factBoxService;
    this.auditService = auditService;
    this.secureVault = secureVault;
    this.notificationService = notificationService;

    this.config = {
      renewalWarningDays: config?.renewalWarningDays ?? 30,
      renewalCriticalDays: config?.renewalCriticalDays ?? 7,
      enableAutoAlerts: config?.enableAutoAlerts ?? true,
      notificationChannels: config?.notificationChannels ?? ['email', 'slack'],
      storagePath: config?.storagePath ?? path.join(process.cwd(), 'storage', 'workflows'),
    };

    this.storagePath = this.config.storagePath;
    this.workflowsPath = path.join(this.storagePath, 'workflows.json');
  }

  /**
   * Initialize the status agent
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });

      // Initialize empty workflows file if it doesn't exist
      try {
        await fs.access(this.workflowsPath);
      } catch {
        await fs.writeFile(this.workflowsPath, JSON.stringify([], null, 2));
      }

      this.logger.info('OCCAMStatusAgent initialized successfully', {
        renewalWarningDays: this.config.renewalWarningDays,
        renewalCriticalDays: this.config.renewalCriticalDays,
      });
    } catch (error) {
      this.logger.error('Failed to initialize OCCAMStatusAgent', error as Error);
      throw error;
    }
  }

  /**
   * Track workflow progress
   * Monitors each state transition and updates workflow state
   */
  async trackWorkflowProgress(workflowId: string): Promise<WorkflowProgress> {
    try {
      this.logger.info(`Tracking workflow progress: ${workflowId}`);

      // Validate workflow ID
      if (!this.isValidWorkflowId(workflowId)) {
        throw new Error(`Invalid workflow ID: ${workflowId}`);
      }

      // Load workflow state
      const workflowState = await this.getWorkflowState(workflowId);
      if (!workflowState) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Get entity information
      const entity = await this.factBoxService.getEntity(workflowState.entityId);
      if (!entity) {
        throw new Error(`Entity not found: ${workflowState.entityId}`);
      }

      // Calculate progress
      const percentComplete = this.calculateProgress(
        workflowState.currentStage,
        workflowState.status
      );

      // Detect delays
      const delays = this.detectDelays(workflowState);

      // Get pending actions
      const pendingActions = await this.getPendingActions(workflowId);

      // Estimate completion date
      const estimatedCompletionDate = this.estimateCompletionDate(
        workflowState,
        pendingActions.length
      );

      const progress: WorkflowProgress = {
        workflowId,
        entityId: workflowState.entityId,
        entityName: entity.entityName,
        currentStage: workflowState.currentStage,
        status: workflowState.status,
        percentComplete,
        startDate: workflowState.createdAt,
        estimatedCompletionDate,
        actualCompletionDate: workflowState.completedAt,
        delays,
        pendingActions,
      };

      // Log state tracking
      await this.auditService.logEvent({
        eventType: 'workflow_updated',
        workflowId,
        entityId: workflowState.entityId,
        severity: 'info',
        action: 'track_progress',
        description: `Tracked workflow progress: ${percentComplete}% complete`,
        metadata: { progress },
        result: 'success',
      });

      this.logger.info(`Workflow progress tracked: ${workflowId}`, {
        percentComplete,
        currentStage: workflowState.currentStage,
      });

      return progress;
    } catch (error) {
      this.logger.error(`Failed to track workflow progress: ${workflowId}`, error as Error);
      throw error;
    }
  }

  /**
   * Generate status summary for an entity
   * Returns comprehensive JSON summary of current progress, delays, and pending actions
   */
  async generateStatusSummary(entityId: string): Promise<StatusSummary> {
    try {
      this.logger.info(`Generating status summary for entity: ${entityId}`);

      // Validate entity ID
      if (!this.isValidEntityId(entityId)) {
        throw new Error(`Invalid entity ID: ${entityId}`);
      }

      // Get entity information
      const entity = await this.factBoxService.getEntity(entityId);
      if (!entity) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      // Get all workflows for entity
      const workflows = await this.getWorkflowsByEntity(entityId);

      // Get active workflow (most recent)
      const activeWorkflow = workflows.find((w) => w.status === 'in_progress') || workflows[0];

      if (!activeWorkflow) {
        throw new Error(`No workflows found for entity: ${entityId}`);
      }

      // Calculate risk level
      const riskLevel = this.calculateRiskLevel(activeWorkflow, workflows);

      // Get pending actions for all workflows
      const allPendingActions = [];
      for (const workflow of workflows) {
        const actions = await this.getPendingActions(workflow.workflowId);
        allPendingActions.push(...actions);
      }

      // Find next action due
      const nextActionDue = allPendingActions
        .filter((a) => a.dueDate)
        .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())[0]
        ?.dueDate;

      // Get upcoming deadlines
      const upcomingDeadlines = await this.getUpcomingDeadlines(entityId);

      // Count overdue actions
      const now = new Date();
      const overdueActions = allPendingActions.filter(
        (a) => a.dueDate && new Date(a.dueDate) < now
      ).length;

      const summary: StatusSummary = {
        entity_id: entityId,
        entity_name: entity.entityName,
        workflow_stage: activeWorkflow.currentStage,
        workflow_status: activeWorkflow.status,
        next_action_due: nextActionDue ? format(new Date(nextActionDue), 'yyyy-MM-dd') : undefined,
        risk_level: riskLevel,
        alerts_sent: [], // Will be populated when alerts are sent
        last_updated: new Date().toISOString(),
        details: {
          total_workflows: workflows.length,
          active_workflows: workflows.filter((w) => w.status === 'in_progress').length,
          completed_workflows: workflows.filter((w) => w.status === 'completed').length,
          failed_workflows: workflows.filter((w) => w.status === 'failed').length,
          pending_renewals: upcomingDeadlines.filter((d) => d.deadline_type === 'renewal').length,
          overdue_actions: overdueActions,
          upcoming_deadlines: upcomingDeadlines,
        },
      };

      // Log summary generation
      await this.auditService.logEvent({
        eventType: 'compliance_check',
        entityId,
        severity: 'info',
        action: 'generate_summary',
        description: `Generated status summary for entity: ${entity.entityName}`,
        metadata: { summary },
        result: 'success',
      });

      this.logger.info(`Status summary generated for entity: ${entityId}`, {
        riskLevel,
        activeWorkflows: summary.details.active_workflows,
      });

      return summary;
    } catch (error) {
      this.logger.error(`Failed to generate status summary: ${entityId}`, error as Error);
      throw error;
    }
  }

  /**
   * Send renewal alerts
   * Issues timely notifications for upcoming renewals or expiring licenses
   */
  async sendRenewalAlerts(): Promise<RenewalAlert[]> {
    try {
      this.logger.info('Sending renewal alerts');

      const alerts: RenewalAlert[] = [];

      // Get all expiring licenses
      const warningLicenses = await this.factBoxService.getExpiringLicenses(
        this.config.renewalWarningDays
      );

      const criticalLicenses = await this.factBoxService.getExpiringLicenses(
        this.config.renewalCriticalDays
      );

      // Process warning alerts (30 days)
      for (const license of warningLicenses) {
        const daysUntilExpiry = differenceInDays(new Date(license.expiryDate), new Date());

        // Skip if already in critical range
        if (daysUntilExpiry <= this.config.renewalCriticalDays) {
          continue;
        }

        const alert = await this.createRenewalAlert(
          license,
          'renewal_reminder',
          'warning',
          daysUntilExpiry
        );

        if (alert) {
          alerts.push(alert);
        }
      }

      // Process critical alerts (7 days)
      for (const license of criticalLicenses) {
        const daysUntilExpiry = differenceInDays(new Date(license.expiryDate), new Date());

        const alert = await this.createRenewalAlert(
          license,
          'expiry_critical',
          'critical',
          daysUntilExpiry
        );

        if (alert) {
          alerts.push(alert);
        }
      }

      this.logger.info(`Sent ${alerts.length} renewal alerts`, {
        warningAlerts: alerts.filter((a) => a.severity === 'warning').length,
        criticalAlerts: alerts.filter((a) => a.severity === 'critical').length,
      });

      return alerts;
    } catch (error) {
      this.logger.error('Failed to send renewal alerts', error as Error);
      throw error;
    }
  }

  /**
   * Create and send a renewal alert
   */
  private async createRenewalAlert(
    license: any,
    alertType: 'renewal_reminder' | 'expiry_warning' | 'expiry_critical',
    severity: SeverityLevel,
    daysUntilExpiry: number
  ): Promise<RenewalAlert | null> {
    try {
      const entity = await this.factBoxService.getEntity(license.entityId);
      if (!entity) {
        return null;
      }

      const alertId = uuidv4();
      const alert: RenewalAlert = {
        alertId,
        entityId: license.entityId,
        entityName: entity.entityName,
        licenseId: license.licenseId,
        licenseName: license.licenseName,
        expiryDate: license.expiryDate,
        daysUntilExpiry,
        severity,
        alertType,
        createdAt: new Date().toISOString(),
        sentTo: [],
      };

      // Log alert triggered
      await this.auditService.logAlertTriggered(alertId, license.entityId, alertType, severity, {
        license: license.licenseName,
        daysUntilExpiry,
      });

      // Send notifications if auto-alerts enabled
      if (this.config.enableAutoAlerts) {
        const sentChannels = await this.sendAlertNotifications(alert);
        alert.sentTo = sentChannels;
      }

      return alert;
    } catch (error) {
      this.logger.error('Failed to create renewal alert', error as Error, {
        licenseId: license.licenseId,
      });
      return null;
    }
  }

  /**
   * Send alert notifications across enabled channels
   */
  private async sendAlertNotifications(alert: RenewalAlert): Promise<string[]> {
    const sentChannels: string[] = [];

    const subject = `${alert.severity.toUpperCase()}: License Renewal Required - ${alert.licenseName}`;
    const body = this.formatAlertMessage(alert);

    for (const channel of this.config.notificationChannels) {
      if (!this.notificationService.isChannelEnabled(channel)) {
        continue;
      }

      try {
        const message: Omit<NotificationMessage, 'messageId' | 'createdAt' | 'channel'> = {
          severity: alert.severity,
          recipient: await this.getChannelRecipient(channel, alert.entityId),
          subject,
          body,
          metadata: { alertId: alert.alertId, alertType: alert.alertType },
        };

        await this.notificationService.sendNotification(channel, message);
        sentChannels.push(channel);
      } catch (error) {
        this.logger.error(`Failed to send alert via ${channel}`, error as Error);
      }
    }

    // Log alert sent
    if (sentChannels.length > 0) {
      await this.auditService.logAlertSent(
        alert.alertId,
        alert.entityId,
        sentChannels,
        [await this.getChannelRecipient(sentChannels[0] as NotificationChannel, alert.entityId)],
        alert.severity
      );
    }

    return sentChannels;
  }

  /**
   * Format alert message for notification
   */
  private formatAlertMessage(alert: RenewalAlert): string {
    return `
<h2>License Renewal Alert</h2>
<p><strong>Entity:</strong> ${alert.entityName}</p>
<p><strong>License:</strong> ${alert.licenseName}</p>
<p><strong>Expiry Date:</strong> ${format(parseISO(alert.expiryDate), 'MMMM dd, yyyy')}</p>
<p><strong>Days Until Expiry:</strong> ${alert.daysUntilExpiry}</p>
<p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
<p><strong>Action Required:</strong> Please initiate renewal process immediately.</p>
<hr>
<p><em>This is an automated alert from OCCAM Compliance Engine.</em></p>
    `.trim();
  }

  /**
   * Get recipient for a specific channel
   */
  private async getChannelRecipient(
    channel: NotificationChannel,
    _entityId: string
  ): Promise<string> {
    // This would typically look up entity-specific contact information
    // For now, use environment variables
    switch (channel) {
      case 'email':
        return process.env.EMAIL_FROM || 'noreply@example.com';
      case 'slack':
        return process.env.SLACK_CHANNEL_ID || '#compliance-alerts';
      case 'teams':
        return (await this.secureVault.getCredential('teams_webhook_url')) || '';
      case 'sms':
        return process.env.TWILIO_PHONE_NUMBER || '';
      case 'whatsapp':
        return process.env.TWILIO_WHATSAPP_NUMBER || '';
      default:
        return '';
    }
  }

  /**
   * Get workflow state
   */
  private async getWorkflowState(workflowId: string): Promise<WorkflowState | null> {
    const workflows = await this.loadWorkflows();
    return workflows.find((w) => w.workflowId === workflowId) || null;
  }

  /**
   * Get workflows by entity
   */
  private async getWorkflowsByEntity(entityId: string): Promise<WorkflowState[]> {
    const workflows = await this.loadWorkflows();
    return workflows.filter((w) => w.entityId === entityId);
  }

  /**
   * Load workflows from storage
   */
  private async loadWorkflows(): Promise<WorkflowState[]> {
    try {
      const data = await fs.readFile(this.workflowsPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Validate workflow ID format
   */
  private isValidWorkflowId(workflowId: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(workflowId) && workflowId.length > 0;
  }

  /**
   * Validate entity ID format
   */
  private isValidEntityId(entityId: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(entityId) && entityId.length > 0;
  }

  /**
   * Calculate workflow progress percentage
   */
  private calculateProgress(stage: WorkflowStage, status: WorkflowStatus): number {
    const stageWeights: Record<WorkflowStage, number> = {
      apply: 10,
      verify: 25,
      pay: 40,
      submit: 60,
      confirm: 80,
      archive: 90,
      renew: 15,
      pending: 5,
      failed: 0,
      completed: 100,
    };

    if (status === 'completed') return 100;
    if (status === 'failed') return 0;

    return stageWeights[stage] || 0;
  }

  /**
   * Detect delays in workflow
   */
  private detectDelays(_workflowState: WorkflowState): any[] {
    // Simplified delay detection
    // In production, this would analyze transition times and compare against SLAs
    return [];
  }

  /**
   * Get pending actions for workflow
   */
  private async getPendingActions(_workflowId: string): Promise<any[]> {
    // This would query pending actions from database
    // For now, return empty array
    return [];
  }

  /**
   * Estimate workflow completion date
   */
  private estimateCompletionDate(
    workflowState: WorkflowState,
    pendingActionsCount: number
  ): Date | undefined {
    if (workflowState.status === 'completed') {
      return workflowState.completedAt;
    }

    // Simple estimation: 3 days per pending action
    const estimatedDays = pendingActionsCount * 3;
    return addDays(new Date(), estimatedDays);
  }

  /**
   * Calculate risk level for entity
   */
  private calculateRiskLevel(activeWorkflow: WorkflowState, allWorkflows: WorkflowState[]): RiskLevel {
    const failedCount = allWorkflows.filter((w) => w.status === 'failed').length;
    const totalCount = allWorkflows.length;

    if (failedCount / totalCount > 0.3) return 'critical';
    if (failedCount / totalCount > 0.1) return 'high';
    if (activeWorkflow.status === 'pending_approval') return 'medium';

    return 'low';
  }

  /**
   * Get upcoming deadlines for entity
   */
  private async getUpcomingDeadlines(entityId: string): Promise<UpcomingDeadline[]> {
    const licenses = await this.factBoxService.getLicensesByEntity(entityId);
    const deadlines: UpcomingDeadline[] = [];

    for (const license of licenses) {
      const daysRemaining = differenceInDays(new Date(license.expiryDate), new Date());

      if (daysRemaining > 0 && daysRemaining <= this.config.renewalWarningDays) {
        deadlines.push({
          workflow_id: `renewal-${license.licenseId}`,
          entity_name: entityId,
          deadline_type: 'renewal',
          deadline_date: license.expiryDate,
          days_remaining: daysRemaining,
          severity: daysRemaining <= this.config.renewalCriticalDays ? 'critical' : 'warning',
        });
      }
    }

    return deadlines;
  }
}

export default OCCAMStatusAgent;
