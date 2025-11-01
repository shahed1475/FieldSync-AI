"use strict";
/**
 * GovernanceService - Payment governance and policy enforcement
 * Handles approval workflows, spending limits, and anomaly detection
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernanceService = void 0;
const uuid_1 = require("uuid");
const fs_extra_1 = __importDefault(require("fs-extra"));
const path_1 = __importDefault(require("path"));
class GovernanceService {
    constructor(auditService, storagePath = './storage/governance') {
        this.auditService = auditService;
        this.storagePath = storagePath;
        this.approvalRequests = new Map();
        this.transactionHistory = [];
        // Default spending limits
        this.spendingLimits = {
            maxTransactionAmount: parseFloat(process.env.MAX_TRANSACTION_AMOUNT || '10000'),
            approvalThreshold: parseFloat(process.env.APPROVAL_REQUIRED_THRESHOLD || '5000'),
            dailyLimit: parseFloat(process.env.DAILY_TRANSACTION_LIMIT || '50000'),
            currency: 'USD',
        };
        // Default rate limiting
        this.rateLimitConfig = {
            windowMinutes: parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '60'),
            maxTransactionsPerWindow: parseInt(process.env.MAX_TRANSACTIONS_PER_WINDOW || '100'),
            enabled: true,
        };
        // Default anomaly detection
        this.anomalyConfig = {
            enabled: process.env.ANOMALY_DETECTION_ENABLED !== 'false',
            suspiciousPatternThreshold: parseInt(process.env.SUSPICIOUS_PATTERN_THRESHOLD || '3'),
            unusualAmountMultiplier: 3.0,
            rapidTransactionCount: 10,
            rapidTransactionWindowMinutes: 5,
            notifyOnAnomaly: true,
        };
    }
    /**
     * Initialize governance service
     */
    async initialize() {
        await fs_extra_1.default.ensureDir(this.storagePath);
        await this.loadConfiguration();
        await this.loadApprovalRequests();
    }
    /**
     * Validate transaction against governance policies
     */
    async validateTransaction(context) {
        const violations = [];
        const warnings = [];
        let requiresApproval = false;
        // Check spending limits
        if (context.amount > this.spendingLimits.maxTransactionAmount) {
            violations.push({
                policyId: 'spending-limit-max',
                policyType: 'spending_limit',
                description: `Transaction amount exceeds maximum limit of ${this.spendingLimits.currency} ${this.spendingLimits.maxTransactionAmount}`,
                severity: 'blocking',
                details: { amount: context.amount, limit: this.spendingLimits.maxTransactionAmount },
            });
        }
        if (context.amount >= this.spendingLimits.approvalThreshold) {
            requiresApproval = true;
            warnings.push(`Transaction requires approval (amount >= ${this.spendingLimits.currency} ${this.spendingLimits.approvalThreshold})`);
        }
        // Check daily limit
        const dailyTotal = this.getDailyTransactionTotal();
        if (dailyTotal + context.amount > this.spendingLimits.dailyLimit) {
            violations.push({
                policyId: 'spending-limit-daily',
                policyType: 'spending_limit',
                description: `Daily transaction limit would be exceeded`,
                severity: 'blocking',
                details: {
                    currentDaily: dailyTotal,
                    newAmount: context.amount,
                    limit: this.spendingLimits.dailyLimit
                },
            });
        }
        // Check rate limits
        if (this.rateLimitConfig.enabled) {
            const recentTransactions = this.getRecentTransactions(this.rateLimitConfig.windowMinutes);
            if (recentTransactions.length >= this.rateLimitConfig.maxTransactionsPerWindow) {
                violations.push({
                    policyId: 'rate-limit',
                    policyType: 'rate_limit',
                    description: `Rate limit exceeded: ${this.rateLimitConfig.maxTransactionsPerWindow} transactions per ${this.rateLimitConfig.windowMinutes} minutes`,
                    severity: 'blocking',
                    details: { currentCount: recentTransactions.length },
                });
            }
        }
        // Check for anomalies
        if (this.anomalyConfig.enabled) {
            const anomalies = await this.detectAnomalies(context);
            if (anomalies.length > 0) {
                for (const anomaly of anomalies) {
                    if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
                        requiresApproval = true;
                        warnings.push(`Anomaly detected: ${anomaly.description}`);
                    }
                    await this.auditService.logEvent('anomaly.detected', 'Payment anomaly detected', { anomaly, transaction: context }, { severity: anomaly.severity === 'critical' ? 'critical' : 'warning' });
                }
            }
        }
        // Create approval request if needed
        let approvalRequestId;
        if (requiresApproval && violations.length === 0) {
            approvalRequestId = await this.createApprovalRequest(context);
        }
        return {
            allowed: violations.length === 0,
            requiresApproval,
            violations,
            warnings,
            approvalRequestId,
        };
    }
    /**
     * Create approval request
     */
    async createApprovalRequest(context) {
        const request = {
            id: (0, uuid_1.v4)(),
            transactionId: context.transactionId,
            amount: context.amount,
            currency: context.currency,
            description: `Payment of ${context.currency} ${context.amount}`,
            requestedBy: context.entityId || 'system',
            requestedAt: new Date(),
            status: 'pending',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            metadata: context.metadata,
        };
        this.approvalRequests.set(request.id, request);
        await this.persistApprovalRequests();
        await this.auditService.logEvent('approval.requested', 'Approval requested for payment', { approvalRequest: request }, { severity: 'warning', resource: context.transactionId });
        return request.id;
    }
    /**
     * Process approval decision
     */
    async processApproval(decision) {
        const request = this.approvalRequests.get(decision.approvalRequestId);
        if (!request) {
            throw new Error(`Approval request not found: ${decision.approvalRequestId}`);
        }
        if (request.status !== 'pending') {
            throw new Error(`Approval request already processed: ${request.status}`);
        }
        if (new Date() > request.expiresAt) {
            request.status = 'expired';
            await this.persistApprovalRequests();
            throw new Error('Approval request has expired');
        }
        request.status = decision.decision === 'approve' ? 'approved' : 'denied';
        request.approver = decision.approver;
        request.approvedAt = decision.timestamp;
        request.denialReason = decision.reason;
        await this.persistApprovalRequests();
        await this.auditService.logEvent(decision.decision === 'approve' ? 'approval.granted' : 'approval.denied', `Approval ${decision.decision}d by ${decision.approver}`, { approvalRequest: request, decision }, {
            severity: 'info',
            actor: decision.approver,
            resource: request.transactionId
        });
        return request;
    }
    /**
     * Get approval request status
     */
    getApprovalStatus(approvalRequestId) {
        const request = this.approvalRequests.get(approvalRequestId);
        return request ? request.status : null;
    }
    /**
     * Detect anomalies in transaction
     */
    async detectAnomalies(context) {
        const anomalies = [];
        // Check for unusual amount (compared to historical average)
        const avgAmount = this.getAverageTransactionAmount();
        if (avgAmount > 0 && context.amount > avgAmount * this.anomalyConfig.unusualAmountMultiplier) {
            anomalies.push({
                id: (0, uuid_1.v4)(),
                transactionId: context.transactionId,
                anomalyType: 'unusual_amount',
                severity: context.amount > avgAmount * 5 ? 'high' : 'medium',
                description: `Transaction amount (${context.amount}) is significantly higher than average (${avgAmount.toFixed(2)})`,
                detectedAt: new Date(),
                blocked: false,
                resolved: false,
            });
        }
        // Check for rapid transactions
        const recentCount = this.getRecentTransactions(this.anomalyConfig.rapidTransactionWindowMinutes).length;
        if (recentCount >= this.anomalyConfig.rapidTransactionCount) {
            anomalies.push({
                id: (0, uuid_1.v4)(),
                transactionId: context.transactionId,
                anomalyType: 'rapid_transactions',
                severity: 'high',
                description: `Rapid transactions detected: ${recentCount} in ${this.anomalyConfig.rapidTransactionWindowMinutes} minutes`,
                detectedAt: new Date(),
                blocked: false,
                resolved: false,
            });
        }
        // Check for duplicate transaction (same amount within 5 minutes)
        const duplicates = this.transactionHistory.filter(t => t.amount === context.amount &&
            (context.timestamp.getTime() - t.timestamp.getTime()) < 5 * 60 * 1000);
        if (duplicates.length > 0) {
            anomalies.push({
                id: (0, uuid_1.v4)(),
                transactionId: context.transactionId,
                anomalyType: 'duplicate_transaction',
                severity: 'medium',
                description: `Potential duplicate transaction detected`,
                detectedAt: new Date(),
                blocked: false,
                resolved: false,
                metadata: { duplicates: duplicates.length },
            });
        }
        return anomalies;
    }
    /**
     * Record transaction for governance tracking
     */
    async recordTransaction(context) {
        this.transactionHistory.push(context);
        // Keep only last 1000 transactions in memory
        if (this.transactionHistory.length > 1000) {
            this.transactionHistory = this.transactionHistory.slice(-1000);
        }
        await this.persistTransactionHistory();
    }
    /**
     * Get daily transaction total
     */
    getDailyTransactionTotal() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return this.transactionHistory
            .filter(t => t.timestamp >= today)
            .reduce((sum, t) => sum + t.amount, 0);
    }
    /**
     * Get recent transactions within window
     */
    getRecentTransactions(windowMinutes) {
        const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
        return this.transactionHistory.filter(t => t.timestamp >= cutoff);
    }
    /**
     * Get average transaction amount
     */
    getAverageTransactionAmount() {
        if (this.transactionHistory.length === 0)
            return 0;
        const sum = this.transactionHistory.reduce((acc, t) => acc + t.amount, 0);
        return sum / this.transactionHistory.length;
    }
    /**
     * Update spending limits
     */
    async updateSpendingLimits(limits) {
        this.spendingLimits = { ...this.spendingLimits, ...limits };
        await this.persistConfiguration();
        await this.auditService.logEvent('configuration.changed', 'Spending limits updated', { newLimits: this.spendingLimits }, { severity: 'info' });
    }
    /**
     * Load configuration from disk
     */
    async loadConfiguration() {
        try {
            const configFile = path_1.default.join(this.storagePath, 'config.json');
            if (await fs_extra_1.default.pathExists(configFile)) {
                const config = await fs_extra_1.default.readJson(configFile);
                this.spendingLimits = config.spendingLimits || this.spendingLimits;
                this.rateLimitConfig = config.rateLimitConfig || this.rateLimitConfig;
                this.anomalyConfig = config.anomalyConfig || this.anomalyConfig;
            }
        }
        catch (error) {
            // Use defaults
        }
    }
    /**
     * Persist configuration to disk
     */
    async persistConfiguration() {
        const configFile = path_1.default.join(this.storagePath, 'config.json');
        await fs_extra_1.default.writeJson(configFile, {
            spendingLimits: this.spendingLimits,
            rateLimitConfig: this.rateLimitConfig,
            anomalyConfig: this.anomalyConfig,
        }, { spaces: 2 });
    }
    /**
     * Load approval requests from disk
     */
    async loadApprovalRequests() {
        try {
            const requestsFile = path_1.default.join(this.storagePath, 'approvals.json');
            if (await fs_extra_1.default.pathExists(requestsFile)) {
                const requests = await fs_extra_1.default.readJson(requestsFile);
                this.approvalRequests = new Map(Object.entries(requests));
            }
        }
        catch (error) {
            this.approvalRequests = new Map();
        }
    }
    /**
     * Persist approval requests to disk
     */
    async persistApprovalRequests() {
        const requestsFile = path_1.default.join(this.storagePath, 'approvals.json');
        const requestsObj = Object.fromEntries(this.approvalRequests);
        await fs_extra_1.default.writeJson(requestsFile, requestsObj, { spaces: 2 });
    }
    /**
     * Persist transaction history to disk
     */
    async persistTransactionHistory() {
        const historyFile = path_1.default.join(this.storagePath, 'transaction-history.json');
        await fs_extra_1.default.writeJson(historyFile, this.transactionHistory.slice(-1000), { spaces: 2 });
    }
}
exports.GovernanceService = GovernanceService;
//# sourceMappingURL=governance.service.js.map