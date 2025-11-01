"use strict";
/**
 * AuditService
 * Manages audit logging for all compliance operations
 * Every validation, rule check, and filing is logged with trace IDs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const uuid_1 = require("uuid");
class AuditService {
    constructor() {
        this.auditLog = [];
    }
    /**
     * Generates a unique trace ID for operations
     */
    generateTraceId() {
        return (0, uuid_1.v4)();
    }
    /**
     * Logs an audit entry
     */
    async logEntry(entry) {
        const auditEntry = {
            id: (0, uuid_1.v4)(),
            timestamp: new Date(),
            ...entry,
        };
        // In production, this would be persisted to database via Prisma
        this.auditLog.push(auditEntry);
        return auditEntry.id;
    }
    /**
     * Logs a successful operation
     */
    async logSuccess(traceId, action, details) {
        return this.logEntry({
            trace_id: traceId,
            action,
            status: 'success',
            details,
        });
    }
    /**
     * Logs a failed operation
     */
    async logFailure(traceId, action, errorMessage, details) {
        return this.logEntry({
            trace_id: traceId,
            action,
            status: 'failure',
            error_message: errorMessage,
            details,
        });
    }
    /**
     * Logs a warning
     */
    async logWarning(traceId, action, details) {
        return this.logEntry({
            trace_id: traceId,
            action,
            status: 'warning',
            details,
        });
    }
    /**
     * Retrieves audit entries by trace ID
     */
    async getEntriesByTraceId(traceId) {
        return this.auditLog.filter((entry) => entry.trace_id === traceId);
    }
    /**
     * Retrieves audit entries by entity ID
     */
    async getEntriesByEntityId(entityId) {
        return this.auditLog.filter((entry) => entry.entity_id === entityId);
    }
    /**
     * Retrieves audit entries by regulation
     */
    async getEntriesByRegulation(regulation) {
        return this.auditLog.filter((entry) => entry.regulation === regulation);
    }
    /**
     * Retrieves recent audit entries (limit)
     */
    async getRecentEntries(limit = 100) {
        return this.auditLog
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
    }
    /**
     * Clears audit log (for testing purposes only)
     */
    clearLog() {
        this.auditLog = [];
    }
    /**
     * Gets the total count of audit entries
     */
    getEntryCount() {
        return this.auditLog.length;
    }
}
exports.AuditService = AuditService;
//# sourceMappingURL=AuditService.js.map