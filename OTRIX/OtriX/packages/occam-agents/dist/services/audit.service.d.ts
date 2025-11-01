/**
 * Audit Service
 * Comprehensive audit trail and compliance logging
 */
import { Logger } from '../utils/logger';
import { SeverityLevel } from '../types';
export type AuditEventType = 'workflow_created' | 'workflow_updated' | 'workflow_completed' | 'state_transition' | 'alert_triggered' | 'alert_sent' | 'notification_sent' | 'notification_failed' | 'renewal_reminder' | 'compliance_check' | 'policy_enforced' | 'escalation' | 'user_action' | 'system_action';
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
export declare class AuditService {
    private logger;
    private storagePath;
    private auditLogPath;
    constructor(logger?: Logger);
    /**
     * Initialize audit storage
     */
    initialize(): Promise<void>;
    /**
     * Log an audit event
     */
    logEvent(event: Omit<AuditEvent, 'eventId' | 'timestamp' | 'traceId'>): Promise<string>;
    /**
     * Log workflow state transition
     */
    logStateTransition(workflowId: string, entityId: string, fromState: string, toState: string, triggeredBy: string, metadata?: Record<string, any>): Promise<string>;
    /**
     * Log alert triggered
     */
    logAlertTriggered(alertId: string, entityId: string, alertType: string, severity: SeverityLevel, metadata?: Record<string, any>): Promise<string>;
    /**
     * Log alert sent
     */
    logAlertSent(alertId: string, entityId: string, channels: string[], recipients: string[], severity: SeverityLevel, metadata?: Record<string, any>): Promise<string>;
    /**
     * Log notification sent
     */
    logNotificationSent(messageId: string, channel: string, recipient: string, severity: SeverityLevel, success: boolean, errorMessage?: string): Promise<string>;
    /**
     * Log escalation
     */
    logEscalation(entityId: string, workflowId: string, reason: string, escalatedTo: string, metadata?: Record<string, any>): Promise<string>;
    /**
     * Query audit events
     */
    queryEvents(query: AuditQuery): Promise<AuditEvent[]>;
    /**
     * Get recent events
     */
    getRecentEvents(limit?: number): Promise<AuditEvent[]>;
    /**
     * Get events by entity
     */
    getEventsByEntity(entityId: string, limit?: number): Promise<AuditEvent[]>;
    /**
     * Get events by workflow
     */
    getEventsByWorkflow(workflowId: string, limit?: number): Promise<AuditEvent[]>;
    /**
     * Load all audit events
     */
    private loadAllEvents;
    /**
     * Get audit statistics
     */
    getStatistics(startDate?: Date, endDate?: Date): Promise<any>;
    /**
     * Start an audit trail for a complex operation
     */
    startTrail(operationId: string, operationType: string, userId: string, metadata?: Record<string, any>): Promise<string>;
    /**
     * Add a step to an ongoing audit trail
     */
    addToTrail(operationId: string, stepName: string, stepResult: 'success' | 'failure' | 'pending', metadata?: Record<string, any>): Promise<string>;
    /**
     * Complete an audit trail
     */
    completeTrail(operationId: string, operationType: string, finalResult: 'success' | 'failure', metadata?: Record<string, any>): Promise<string>;
    /**
     * Generate a unique trace ID
     */
    generateTraceId(): string;
}
export default AuditService;
//# sourceMappingURL=audit.service.d.ts.map