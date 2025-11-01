"use strict";
/**
 * Audit Service
 * Comprehensive audit trail and compliance logging
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
/**
 * AuditService - Audit Trail and Compliance Logging
 */
class AuditService {
    constructor(logger) {
        this.logger = logger || new logger_1.Logger();
        this.storagePath = path.join(process.cwd(), 'storage', 'audit');
        this.auditLogPath = path.join(this.storagePath, 'audit.log');
    }
    /**
     * Initialize audit storage
     */
    async initialize() {
        try {
            await fs.mkdir(this.storagePath, { recursive: true });
            // Initialize empty audit log if it doesn't exist
            try {
                await fs.access(this.auditLogPath);
            }
            catch {
                await fs.writeFile(this.auditLogPath, '');
            }
            this.logger.info('AuditService initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize AuditService', error);
            throw error;
        }
    }
    /**
     * Log an audit event
     */
    async logEvent(event) {
        try {
            const auditEvent = {
                eventId: (0, uuid_1.v4)(),
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
        }
        catch (error) {
            this.logger.error('Failed to log audit event', error, { event });
            throw error;
        }
    }
    /**
     * Log workflow state transition
     */
    async logStateTransition(workflowId, entityId, fromState, toState, triggeredBy, metadata) {
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
    async logAlertTriggered(alertId, entityId, alertType, severity, metadata) {
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
    async logAlertSent(alertId, entityId, channels, recipients, severity, metadata) {
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
    async logNotificationSent(messageId, channel, recipient, severity, success, errorMessage) {
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
    async logEscalation(entityId, workflowId, reason, escalatedTo, metadata) {
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
    async queryEvents(query) {
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
                filteredEvents = filteredEvents.filter((e) => new Date(e.timestamp) >= query.startDate);
            }
            if (query.endDate) {
                filteredEvents = filteredEvents.filter((e) => new Date(e.timestamp) <= query.endDate);
            }
            // Sort by timestamp (descending)
            filteredEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            // Apply limit
            if (query.limit) {
                filteredEvents = filteredEvents.slice(0, query.limit);
            }
            this.logger.debug(`Query returned ${filteredEvents.length} events`, { query });
            return filteredEvents;
        }
        catch (error) {
            this.logger.error('Failed to query audit events', error, { query });
            throw error;
        }
    }
    /**
     * Get recent events
     */
    async getRecentEvents(limit = 100) {
        return this.queryEvents({ limit });
    }
    /**
     * Get events by entity
     */
    async getEventsByEntity(entityId, limit) {
        return this.queryEvents({ entityId, limit });
    }
    /**
     * Get events by workflow
     */
    async getEventsByWorkflow(workflowId, limit) {
        return this.queryEvents({ workflowId, limit });
    }
    /**
     * Load all audit events
     */
    async loadAllEvents() {
        try {
            const data = await fs.readFile(this.auditLogPath, 'utf-8');
            const lines = data.split('\n').filter((line) => line.trim());
            const events = [];
            for (const line of lines) {
                try {
                    const event = JSON.parse(line);
                    events.push(event);
                }
                catch (parseError) {
                    this.logger.warn('Failed to parse audit log line', { line });
                }
            }
            return events;
        }
        catch (error) {
            this.logger.error('Failed to load audit events', error);
            return [];
        }
    }
    /**
     * Get audit statistics
     */
    async getStatistics(startDate, endDate) {
        try {
            const events = await this.queryEvents({ startDate, endDate });
            const stats = {
                totalEvents: events.length,
                eventsByType: {},
                eventsBySeverity: {},
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
        }
        catch (error) {
            this.logger.error('Failed to get audit statistics', error);
            throw error;
        }
    }
    /**
     * Start an audit trail for a complex operation
     */
    async startTrail(operationId, operationType, userId, metadata) {
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
    async addToTrail(operationId, stepName, stepResult, metadata) {
        return this.logEvent({
            eventType: 'system_action',
            entityId: operationId,
            severity: (stepResult === 'failure' ? 'high' : 'info'),
            action: `trail_step_${stepName}`,
            description: `Audit trail step: ${stepName}`,
            metadata: { operationId, stepName, ...metadata },
            result: stepResult,
        });
    }
    /**
     * Complete an audit trail
     */
    async completeTrail(operationId, operationType, finalResult, metadata) {
        return this.logEvent({
            eventType: 'system_action',
            entityId: operationId,
            severity: (finalResult === 'failure' ? 'high' : 'info'),
            action: `complete_${operationType}`,
            description: `Completed ${operationType} operation with result: ${finalResult}`,
            metadata: { operationId, operationType, finalResult, ...metadata },
            result: finalResult,
        });
    }
    /**
     * Generate a unique trace ID
     */
    generateTraceId() {
        return (0, uuid_1.v4)();
    }
}
exports.AuditService = AuditService;
exports.default = AuditService;
//# sourceMappingURL=audit.service.js.map