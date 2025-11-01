/**
 * PaymentService - Core payment processing service
 * Handles payment provider integrations and transaction processing
 */
import { PaymentData, PaymentResult, PaymentVerification, PaymentWebhookEvent } from '../types';
import { VaultService } from './vault.service';
import { AuditService } from './audit.service';
export declare class PaymentService {
    private vaultService;
    private auditService;
    private stripeClient?;
    private defaultProvider;
    constructor(vaultService: VaultService, auditService: AuditService);
    /**
     * Initialize payment service and load credentials
     */
    initialize(): Promise<void>;
    /**
     * Initiate a payment transaction
     */
    initiatePayment(paymentData: PaymentData): Promise<PaymentResult>;
    /**
     * Process Stripe payment
     */
    private processStripePayment;
    /**
     * Process PayPal payment (mock implementation)
     */
    private processPayPalPayment;
    /**
     * Process Paddle payment (mock implementation)
     */
    private processPaddlePayment;
    /**
     * Verify payment status
     */
    verifyPaymentStatus(transactionId: string): Promise<PaymentVerification>;
    /**
     * Generate payment receipt
     */
    private generateReceipt;
    /**
     * Generate validation hash for receipt
     */
    private generateValidationHash;
    /**
     * Process webhook event
     */
    processWebhookEvent(event: PaymentWebhookEvent): Promise<void>;
    /**
     * Refund a payment
     */
    refundPayment(transactionId: string, amount?: number): Promise<PaymentResult>;
}
//# sourceMappingURL=payment.service.d.ts.map