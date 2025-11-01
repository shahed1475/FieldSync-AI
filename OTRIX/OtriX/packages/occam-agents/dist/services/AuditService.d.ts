/**
 * AuditService
 * Manages audit logging for all compliance operations
 * Every validation, rule check, and filing is logged with trace IDs
 */
import { AuditEntry } from '../types';
export declare class AuditService {
    private auditLog;
    constructor();
    /**
     * Generates a unique trace ID for operations
     */
    generateTraceId(): string;
    /**
     * Logs an audit entry
     */
    logEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<string>;
    /**
     * Logs a successful operation
     */
    logSuccess(traceId: string, action: string, details: Record<string, any>): Promise<string>;
    /**
     * Logs a failed operation
     */
    logFailure(traceId: string, action: string, errorMessage: string, details: Record<string, any>): Promise<string>;
    /**
     * Logs a warning
     */
    logWarning(traceId: string, action: string, details: Record<string, any>): Promise<string>;
    /**
     * Retrieves audit entries by trace ID
     */
    getEntriesByTraceId(traceId: string): Promise<AuditEntry[]>;
    /**
     * Retrieves audit entries by entity ID
     */
    getEntriesByEntityId(entityId: string): Promise<AuditEntry[]>;
    /**
     * Retrieves audit entries by regulation
     */
    getEntriesByRegulation(regulation: string): Promise<AuditEntry[]>;
    /**
     * Retrieves recent audit entries (limit)
     */
    getRecentEntries(limit?: number): Promise<AuditEntry[]>;
    /**
     * Clears audit log (for testing purposes only)
     */
    clearLog(): void;
    /**
     * Gets the total count of audit entries
     */
    getEntryCount(): number;
}
//# sourceMappingURL=AuditService.d.ts.map