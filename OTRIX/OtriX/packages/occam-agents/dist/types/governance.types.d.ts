/**
 * Governance Type Definitions for OCCAM Payment Agent
 * Defines approval workflows, limits, and policy enforcement
 */
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';
export type PolicyType = 'spending_limit' | 'approval_workflow' | 'rate_limit' | 'anomaly_detection';
/**
 * Approval request for transactions requiring authorization
 */
export interface ApprovalRequest {
    id: string;
    transactionId: string;
    amount: number;
    currency: string;
    description: string;
    requestedBy: string;
    requestedAt: Date;
    status: ApprovalStatus;
    approver?: string;
    approvedAt?: Date;
    denialReason?: string;
    expiresAt: Date;
    metadata?: Record<string, any>;
}
/**
 * Governance policy configuration
 */
export interface GovernancePolicy {
    id: string;
    policyType: PolicyType;
    enabled: boolean;
    configuration: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Spending limits policy
 */
export interface SpendingLimits {
    maxTransactionAmount: number;
    approvalThreshold: number;
    dailyLimit: number;
    weeklyLimit?: number;
    monthlyLimit?: number;
    currency: string;
}
/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    windowMinutes: number;
    maxTransactionsPerWindow: number;
    enabled: boolean;
}
/**
 * Anomaly detection configuration
 */
export interface AnomalyDetectionConfig {
    enabled: boolean;
    suspiciousPatternThreshold: number;
    unusualAmountMultiplier: number;
    rapidTransactionCount: number;
    rapidTransactionWindowMinutes: number;
    notifyOnAnomaly: boolean;
}
/**
 * Detected anomaly
 */
export interface DetectedAnomaly {
    id: string;
    transactionId?: string;
    anomalyType: 'unusual_amount' | 'rapid_transactions' | 'suspicious_pattern' | 'duplicate_transaction' | 'off_hours';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    detectedAt: Date;
    blocked: boolean;
    resolved: boolean;
    resolvedAt?: Date;
    metadata?: Record<string, any>;
}
/**
 * Governance validation result
 */
export interface GovernanceValidationResult {
    allowed: boolean;
    requiresApproval: boolean;
    violations: PolicyViolation[];
    warnings: string[];
    approvalRequestId?: string;
}
/**
 * Policy violation
 */
export interface PolicyViolation {
    policyId: string;
    policyType: PolicyType;
    description: string;
    severity: 'warning' | 'blocking';
    details?: Record<string, any>;
}
/**
 * Transaction context for governance checks
 */
export interface TransactionContext {
    transactionId: string;
    amount: number;
    currency: string;
    entityId?: string;
    timestamp: Date;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
}
/**
 * Approval decision
 */
export interface ApprovalDecision {
    approvalRequestId: string;
    decision: 'approve' | 'deny';
    approver: string;
    reason?: string;
    timestamp: Date;
}
//# sourceMappingURL=governance.types.d.ts.map