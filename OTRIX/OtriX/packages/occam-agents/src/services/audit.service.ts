/**
 * Audit Service
 * Comprehensive audit trail and compliance logging
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { SeverityLevel } from '../types';

export type AuditEventType =
  | 'workflow_created'
  | 'workflow_updated'
  | 'workflow_completed'
  | 'state_transition'
  | 'alert_triggered'
  | 'alert_sent'
  | 'notification_sent'
  | 'notification_failed'
  | 'renewal_reminder'
  | 'compliance_check'
  | 'policy_enforced'
  | 'escalation'
  | 'user_action'
  | 'system_action';

export interface AuditEvent {
  eventId: string;
  eventType: AuditEventType;
  timestamp: string;
  traceId: string;
  entityId?: string;
  workflowId?: string;
  userId?: string;
  severity: SeverityLevel;
  action: string;
  description: string;
  metadata: Record<string, any>;
  result: 'success' | 'failure' | 'pending';
  errorMessage?: string;
}

export interface AuditQuery {
  entityId?: string;
  workflowId?: string;
  eventType?: AuditEventType;
  severity?: SeverityLevel;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

/**
 * AuditService - Audit Trail and Compliance Logging
 */
export class AuditService {
  private logger: Logger;
  private storagePath: string;
  private auditLogPath: string;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger();
    this.storagePath = path.join(process.cwd(), 'storage', 'audit');
    this.auditLogPath = path.join(this.storagePath, 'audit.log');
  }

  /**
   * Initialize audit storage
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });

      // Initialize empty audit log if it doesn't exist
      try {
        await fs.access(this.auditLogPath);
      } catch {
        await fs.writeFile(this.auditLogPath, '');
      }

      this.logger.info('AuditService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize AuditService', error as Error);
      throw error;
    }
  }

  /**
   * Log an audit event
   */
  async logEvent(event: Omit<AuditEvent, 'eventId' | 'timestamp' | 'traceId'>): Promise<string> {
    try {
      const auditEvent: AuditEvent = {
        eventId: uuidv4(),
        timestamp: new Date().toISOString(),
        traceId: this.logger.getTraceId(),
        ...event,
      };

      // Append to audit log file
      const logLine = JSON.stringify(auditEvent) + '\n';
      await fs.appendFile(this.auditLogPath, logLine);

      // Also log to Winston
      this.logger.info(`Audit event logged: ${event.eventType}`, {
        eventId: auditEvent.eventId,
        action: event.action,
        result: event.result,
      });

      return auditEvent.eventId;
    } catch (error) {
      this.logger.error('Failed to log audit event', error as Error, { event });
      throw error;
    }
  }

  /**
   * Log workflow state transition
   */
  async logStateTransition(
    workflowId: string,
    entityId: string,
    fromState: string,
    toState: string,
    triggeredBy: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.logEvent({
      eventType: 'state_transition',
      entityId,
      workflowId,
      userId: triggeredBy,
      severity: 'info',
      action: `transition_${fromState}_to_${toState}`,
      description: `Workflow transitioned from ${fromState} to ${toState}`,
      metadata: metadata || {},
      result: 'success',
    });
  }

  /**
   * Log alert triggered
   */
  async logAlertTriggered(
    alertId: string,
    entityId: string,
    alertType: string,
    severity: SeverityLevel,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.logEvent({
      eventType: 'alert_triggered',
      entityId,
      severity,
      action: `alert_triggered_${alertType}`,
      description: `Alert triggered: ${alertType}`,
      metadata: { alertId, ...metadata },
      result: 'success',
    });
  }

  /**
   * Log alert sent
   */
  async logAlertSent(
    alertId: string,
    entityId: string,
    channels: string[],
    recipients: string[],
    severity: SeverityLevel,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.logEvent({
      eventType: 'alert_sent',
      entityId,
      severity,
      action: 'alert_sent',
      description: `Alert sent via ${channels.join(', ')} to ${recipients.length} recipients`,
      metadata: { alertId, channels, recipients, ...metadata },
      result: 'success',
    });
  }

  /**
   * Log notification sent
   */
  async logNotificationSent(
    messageId: string,
    channel: string,
    recipient: string,
    severity: SeverityLevel,
    success: boolean,
    errorMessage?: string
  ): Promise<string> {
    return this.logEvent({
      eventType: 'notification_sent',
      severity,
      action: `notification_sent_${channel}`,
      description: success
        ? `Notification sent via ${channel} to ${recipient}`
        : `Failed to send notification via ${channel} to ${recipient}`,
      metadata: { messageId, channel, recipient },
      result: success ? 'success' : 'failure',
      errorMessage,
    });
  }

  /**
   * Log escalation
   */
  async logEscalation(
    entityId: string,
    workflowId: string,
    reason: string,
    escalatedTo: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.logEvent({
      eventType: 'escalation',
      entityId,
      workflowId,
      severity: 'critical',
      action: 'escalation',
      description: `Escalated to ${escalatedTo}: ${reason}`,
      metadata: { escalatedTo, reason, ...metadata },
      result: 'success',
    });
  }

  /**
   * Query audit events
   */
  async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    try {
      const events = await this.loadAllEvents();

      let filteredEvents = events;

      // Apply filters
      if (query.entityId) {
        filteredEvents = filteredEvents.filter((e) => e.entityId === query.entityId);
      }

      if (query.workflowId) {
        filteredEvents = filteredEvents.filter((e) => e.workflowId === query.workflowId);
      }

      if (query.eventType) {
        filteredEvents = filteredEvents.filter((e) => e.eventType === query.eventType);
      }

      if (query.severity) {
        filteredEvents = filteredEvents.filter((e) => e.severity === query.severity);
      }

      if (query.startDate) {
        filteredEvents = filteredEvents.filter(
          (e) => new Date(e.timestamp) >= query.startDate!
        );
      }

      if (query.endDate) {
        filteredEvents = filteredEvents.filter(
          (e) => new Date(e.timestamp) <= query.endDate!
        );
      }

      // Sort by timestamp (descending)
      filteredEvents.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Apply limit
      if (query.limit) {
        filteredEvents = filteredEvents.slice(0, query.limit);
      }

      this.logger.debug(`Query returned ${filteredEvents.length} events`, { query });
      return filteredEvents;
    } catch (error) {
      this.logger.error('Failed to query audit events', error as Error, { query });
      throw error;
    }
  }

  /**
   * Get recent events
   */
  async getRecentEvents(limit: number = 100): Promise<AuditEvent[]> {
    return this.queryEvents({ limit });
  }

  /**
   * Get events by entity
   */
  async getEventsByEntity(entityId: string, limit?: number): Promise<AuditEvent[]> {
    return this.queryEvents({ entityId, limit });
  }

  /**
   * Get events by workflow
   */
  async getEventsByWorkflow(workflowId: string, limit?: number): Promise<AuditEvent[]> {
    return this.queryEvents({ workflowId, limit });
  }

  /**
   * Load all audit events
   */
  private async loadAllEvents(): Promise<AuditEvent[]> {
    try {
      const data = await fs.readFile(this.auditLogPath, 'utf-8');
      const lines = data.split('\n').filter((line) => line.trim());

      const events: AuditEvent[] = [];
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          events.push(event);
        } catch (parseError) {
          this.logger.warn('Failed to parse audit log line', { line });
        }
      }

      return events;
    } catch (error) {
      this.logger.error('Failed to load audit events', error as Error);
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const events = await this.queryEvents({ startDate, endDate });

      const stats = {
        totalEvents: events.length,
        eventsByType: {} as Record<string, number>,
        eventsBySeverity: {} as Record<string, number>,
        eventsByResult: {
          success: 0,
          failure: 0,
          pending: 0,
        },
      };

      for (const event of events) {
        // Count by type
        stats.eventsByType[event.eventType] =
          (stats.eventsByType[event.eventType] || 0) + 1;

        // Count by severity
        stats.eventsBySeverity[event.severity] =
          (stats.eventsBySeverity[event.severity] || 0) + 1;

        // Count by result
        stats.eventsByResult[event.result]++;
      }

      return stats;
    } catch (error) {
      this.logger.error('Failed to get audit statistics', error as Error);
      throw error;
    }
  }

  /**
   * Start an audit trail for a complex operation
   */
  async startTrail(
    operationId: string,
    operationType: string,
    userId: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.logEvent({
      eventType: 'system_action',
      entityId: operationId,
      userId,
      severity: 'info',
      action: `start_${operationType}`,
      description: `Started ${operationType} operation`,
      metadata: { operationId, operationType, ...metadata },
      result: 'pending',
    });
  }

  /**
   * Add a step to an ongoing audit trail
   */
  async addToTrail(
    operationId: string,
    stepName: string,
    stepResult: 'success' | 'failure' | 'pending',
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.logEvent({
      eventType: 'system_action',
      entityId: operationId,
      severity: (stepResult === 'failure' ? 'high' : 'info') as SeverityLevel,
      action: `trail_step_${stepName}`,
      description: `Audit trail step: ${stepName}`,
      metadata: { operationId, stepName, ...metadata },
      result: stepResult,
    });
  }

  /**
   * Complete an audit trail
   */
  async completeTrail(
    operationId: string,
    operationType: string,
    finalResult: 'success' | 'failure',
    metadata?: Record<string, any>
  ): Promise<string> {
    return this.logEvent({
      eventType: 'system_action',
      entityId: operationId,
      severity: (finalResult === 'failure' ? 'high' : 'info') as SeverityLevel,
      action: `complete_${operationType}`,
      description: `Completed ${operationType} operation with result: ${finalResult}`,
      metadata: { operationId, operationType, finalResult, ...metadata },
      result: finalResult,
    });
  }

  /**
   * Generate a unique trace ID
   */
  generateTraceId(): string {
    return uuidv4();
  }
}

export default AuditService;
