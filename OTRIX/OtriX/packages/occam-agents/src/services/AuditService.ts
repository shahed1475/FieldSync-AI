/**
 * AuditService
 * Manages audit logging for all compliance operations
 * Every validation, rule check, and filing is logged with trace IDs
 */

import { AuditEntry } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class AuditService {
  private auditLog: AuditEntry[];

  constructor() {
    this.auditLog = [];
  }

  /**
   * Generates a unique trace ID for operations
   */
  generateTraceId(): string {
    return uuidv4();
  }

  /**
   * Logs an audit entry
   */
  async logEntry(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<string> {
    const auditEntry: AuditEntry = {
      id: uuidv4(),
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
  async logSuccess(
    traceId: string,
    action: string,
    details: Record<string, any>
  ): Promise<string> {
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
  async logFailure(
    traceId: string,
    action: string,
    errorMessage: string,
    details: Record<string, any>
  ): Promise<string> {
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
  async logWarning(
    traceId: string,
    action: string,
    details: Record<string, any>
  ): Promise<string> {
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
  async getEntriesByTraceId(traceId: string): Promise<AuditEntry[]> {
    return this.auditLog.filter((entry) => entry.trace_id === traceId);
  }

  /**
   * Retrieves audit entries by entity ID
   */
  async getEntriesByEntityId(entityId: string): Promise<AuditEntry[]> {
    return this.auditLog.filter((entry) => entry.entity_id === entityId);
  }

  /**
   * Retrieves audit entries by regulation
   */
  async getEntriesByRegulation(regulation: string): Promise<AuditEntry[]> {
    return this.auditLog.filter((entry) => entry.regulation === regulation);
  }

  /**
   * Retrieves recent audit entries (limit)
   */
  async getRecentEntries(limit: number = 100): Promise<AuditEntry[]> {
    return this.auditLog
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Clears audit log (for testing purposes only)
   */
  clearLog(): void {
    this.auditLog = [];
  }

  /**
   * Gets the total count of audit entries
   */
  getEntryCount(): number {
    return this.auditLog.length;
  }
}
