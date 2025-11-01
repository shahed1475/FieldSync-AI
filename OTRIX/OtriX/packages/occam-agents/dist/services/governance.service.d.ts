/**
 * GovernanceService - Payment governance and policy enforcement
 * Handles approval workflows, spending limits, and anomaly detection
 */
import { ApprovalRequest, ApprovalStatus, SpendingLimits, GovernanceValidationResult, TransactionContext, ApprovalDecision } from '../types';
import { AuditService } from './audit.service';
export declare class GovernanceService {
    private spendingLimits;
    private rateLimitConfig;
    private anomalyConfig;
    private approvalRequests;
    private transactionHistory;
    private storagePath;
    private auditService;
    constructor(auditService: AuditService, storagePath?: string);
    /**
     * Initialize governance service
     */
    initialize(): Promise<void>;
    /**
     * Validate transaction against governance policies
     */
    validateTransaction(context: TransactionContext): Promise<GovernanceValidationResult>;
    /**
     * Create approval request
     */
    private createApprovalRequest;
    /**
     * Process approval decision
     */
    processApproval(decision: ApprovalDecision): Promise<ApprovalRequest>;
    /**
     * Get approval request status
     */
    getApprovalStatus(approvalRequestId: string): ApprovalStatus | null;
    /**
     * Detect anomalies in transaction
     */
    private detectAnomalies;
    /**
     * Record transaction for governance tracking
     */
    recordTransaction(context: TransactionContext): Promise<void>;
    /**
     * Get daily transaction total
     */
    private getDailyTransactionTotal;
    /**
     * Get recent transactions within window
     */
    private getRecentTransactions;
    /**
     * Get average transaction amount
     */
    private getAverageTransactionAmount;
    /**
     * Update spending limits
     */
    updateSpendingLimits(limits: Partial<SpendingLimits>): Promise<void>;
    /**
     * Load configuration from disk
     */
    private loadConfiguration;
    /**
     * Persist configuration to disk
     */
    private persistConfiguration;
    /**
     * Load approval requests from disk
     */
    private loadApprovalRequests;
    /**
     * Persist approval requests to disk
     */
    private persistApprovalRequests;
    /**
     * Persist transaction history to disk
     */
    private persistTransactionHistory;
}
//# sourceMappingURL=governance.service.d.ts.map