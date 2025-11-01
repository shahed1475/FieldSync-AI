/**
 * OCCAM Payment Agent - Intelligent payment automation for compliance
 * Secure payment processing with governance, audit, and anomaly detection
 */
import { PaymentData, PaymentResult, PaymentReceipt, PaymentVerification, RenewalData } from '../types';
import { VaultService, AuditService, GovernanceService, FactBoxService } from '../services';
export declare class OCCAMPaymentAgent {
    private vaultService;
    private auditService;
    private governanceService;
    private paymentService;
    private factBoxService;
    private initialized;
    constructor();
    /**
     * Initialize all services
     */
    initialize(): Promise<void>;
    /**
     * Initiate a payment transaction
     * Main method for processing payments with full governance and audit
     */
    initiatePayment(paymentDetails: PaymentData): Promise<PaymentResult>;
    /**
     * Verify payment status
     * Check and confirm payment transaction status
     */
    verifyPaymentStatus(transactionId: string): Promise<PaymentVerification>;
    /**
     * Log receipt for audit and compliance
     * Store payment receipt for record keeping
     */
    logReceipt(receipt: PaymentReceipt): Promise<void>;
    /**
     * Renew subscription or license
     * Handle automatic renewal payments
     */
    renewSubscription(entityId: string, renewalData?: Partial<RenewalData>): Promise<PaymentResult>;
    /**
     * Get governance service for external access
     */
    getGovernanceService(): GovernanceService;
    /**
     * Get audit service for external access
     */
    getAuditService(): AuditService;
    /**
     * Get vault service for external access
     */
    getVaultService(): VaultService;
    /**
     * Get FactBox service for external access
     */
    getFactBoxService(): FactBoxService;
    /**
     * Ensure agent is initialized
     */
    private ensureInitialized;
    /**
     * Generate default encryption key (for development only)
     */
    private generateDefaultKey;
}
//# sourceMappingURL=occam-payment-agent.d.ts.map