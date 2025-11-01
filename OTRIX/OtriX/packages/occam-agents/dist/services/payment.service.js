"use strict";
/**
 * PaymentService - Core payment processing service
 * Handles payment provider integrations and transaction processing
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const stripe_1 = __importDefault(require("stripe"));
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
class PaymentService {
    constructor(vaultService, auditService) {
        this.vaultService = vaultService;
        this.auditService = auditService;
        this.defaultProvider = process.env.PAYMENT_PROVIDER || 'stripe';
    }
    /**
     * Initialize payment service and load credentials
     */
    async initialize() {
        // Initialize Stripe if configured
        if (this.defaultProvider === 'stripe') {
            const stripeKey = await this.vaultService.getCredential({
                provider: 'stripe',
                credentialType: 'secret_key',
            });
            if (stripeKey) {
                this.stripeClient = new stripe_1.default(stripeKey, {
                    apiVersion: '2023-10-16',
                });
            }
        }
        await this.auditService.logEvent('payment.initiated', 'Payment service initialized', { provider: this.defaultProvider }, { severity: 'info' });
    }
    /**
     * Initiate a payment transaction
     */
    async initiatePayment(paymentData) {
        const transactionId = (0, uuid_1.v4)();
        const idempotencyKey = paymentData.idempotencyKey || (0, uuid_1.v4)();
        try {
            await this.auditService.logEvent('payment.initiated', 'Payment initiated', { transactionId, amount: paymentData.amount, currency: paymentData.currency }, { traceId: transactionId, severity: 'info' });
            const provider = paymentData.provider || this.defaultProvider;
            let result;
            switch (provider) {
                case 'stripe':
                    result = await this.processStripePayment(paymentData, transactionId, idempotencyKey);
                    break;
                case 'paypal':
                    result = await this.processPayPalPayment(paymentData, transactionId);
                    break;
                case 'paddle':
                    result = await this.processPaddlePayment(paymentData, transactionId);
                    break;
                default:
                    throw new Error(`Unsupported payment provider: ${provider}`);
            }
            await this.auditService.logEvent(result.success ? 'payment.completed' : 'payment.failed', result.success ? 'Payment completed successfully' : 'Payment failed', { transactionId, result }, {
                traceId: transactionId,
                severity: result.success ? 'info' : 'error',
                success: result.success,
                errorMessage: result.error,
            });
            return result;
        }
        catch (error) {
            await this.auditService.logEvent('payment.failed', 'Payment failed with exception', { transactionId, error: error.message }, {
                traceId: transactionId,
                severity: 'error',
                success: false,
                errorMessage: error.message,
            });
            return {
                success: false,
                transactionId,
                status: 'failed',
                amount: paymentData.amount,
                currency: paymentData.currency,
                timestamp: new Date(),
                error: error.message,
            };
        }
    }
    /**
     * Process Stripe payment
     */
    async processStripePayment(paymentData, transactionId, idempotencyKey) {
        if (!this.stripeClient) {
            throw new Error('Stripe client not initialized');
        }
        try {
            // Create payment intent
            const paymentIntent = await this.stripeClient.paymentIntents.create({
                amount: Math.round(paymentData.amount * 100), // Convert to cents
                currency: paymentData.currency.toLowerCase(),
                description: paymentData.description,
                metadata: {
                    transactionId,
                    entityId: paymentData.entityId || '',
                    licenseId: paymentData.licenseId || '',
                    authorityId: paymentData.authorityId || '',
                    ...paymentData.metadata,
                },
                automatic_payment_methods: {
                    enabled: true,
                },
            }, {
                idempotencyKey,
            });
            // For testing purposes, we'll mark as completed
            // In production, you'd wait for webhook confirmation
            const status = paymentIntent.status === 'succeeded' ? 'completed' : 'processing';
            const receipt = this.generateReceipt({
                transactionId,
                amount: paymentData.amount,
                currency: paymentData.currency,
                description: paymentData.description,
                provider: 'stripe',
                method: paymentData.method || 'card',
                providerTransactionId: paymentIntent.id,
            });
            return {
                success: true,
                transactionId,
                providerTransactionId: paymentIntent.id,
                status,
                amount: paymentData.amount,
                currency: paymentData.currency,
                timestamp: new Date(),
                receipt,
            };
        }
        catch (error) {
            throw new Error(`Stripe payment failed: ${error.message}`);
        }
    }
    /**
     * Process PayPal payment (mock implementation)
     */
    async processPayPalPayment(paymentData, transactionId) {
        // Mock PayPal implementation
        // In production, integrate with PayPal SDK
        await this.auditService.logEvent('payment.processed', 'PayPal payment processed (mock)', { transactionId }, { traceId: transactionId });
        const receipt = this.generateReceipt({
            transactionId,
            amount: paymentData.amount,
            currency: paymentData.currency,
            description: paymentData.description,
            provider: 'paypal',
            method: paymentData.method || 'card',
            providerTransactionId: `paypal_${transactionId}`,
        });
        return {
            success: true,
            transactionId,
            providerTransactionId: `paypal_${transactionId}`,
            status: 'completed',
            amount: paymentData.amount,
            currency: paymentData.currency,
            timestamp: new Date(),
            receipt,
        };
    }
    /**
     * Process Paddle payment (mock implementation)
     */
    async processPaddlePayment(paymentData, transactionId) {
        // Mock Paddle implementation
        await this.auditService.logEvent('payment.processed', 'Paddle payment processed (mock)', { transactionId }, { traceId: transactionId });
        const receipt = this.generateReceipt({
            transactionId,
            amount: paymentData.amount,
            currency: paymentData.currency,
            description: paymentData.description,
            provider: 'paddle',
            method: paymentData.method || 'card',
            providerTransactionId: `paddle_${transactionId}`,
        });
        return {
            success: true,
            transactionId,
            providerTransactionId: `paddle_${transactionId}`,
            status: 'completed',
            amount: paymentData.amount,
            currency: paymentData.currency,
            timestamp: new Date(),
            receipt,
        };
    }
    /**
     * Verify payment status
     */
    async verifyPaymentStatus(transactionId) {
        try {
            await this.auditService.logEvent('payment.verified', 'Payment verification requested', { transactionId }, { traceId: transactionId });
            // In production, query the payment provider for actual status
            // For now, return mock verification
            return {
                transactionId,
                isVerified: true,
                status: 'completed',
                verificationTime: new Date(),
            };
        }
        catch (error) {
            return {
                transactionId,
                isVerified: false,
                status: 'failed',
                verificationTime: new Date(),
                error: error.message,
            };
        }
    }
    /**
     * Generate payment receipt
     */
    generateReceipt(data) {
        const receipt = {
            transactionId: data.transactionId,
            receiptNumber: `RCP-${Date.now()}-${data.transactionId.slice(0, 8)}`,
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            timestamp: new Date(),
            provider: data.provider,
            method: data.method,
            recipientInfo: {
                name: 'Regulatory Authority',
                purpose: data.description,
            },
            validationHash: this.generateValidationHash(data.transactionId, data.amount),
        };
        return receipt;
    }
    /**
     * Generate validation hash for receipt
     */
    generateValidationHash(transactionId, amount) {
        const data = `${transactionId}:${amount}:${Date.now()}`;
        return crypto_1.default.createHash('sha256').update(data).digest('hex');
    }
    /**
     * Process webhook event
     */
    async processWebhookEvent(event) {
        await this.auditService.logEvent('payment.completed', `Webhook received: ${event.eventType}`, { event }, { traceId: event.transactionId });
        // Process different event types
        switch (event.eventType) {
            case 'payment.completed':
                // Update transaction status
                break;
            case 'payment.failed':
                // Handle failure
                break;
            case 'refund.processed':
                // Handle refund
                break;
            case 'subscription.renewed':
                // Handle renewal
                break;
        }
    }
    /**
     * Refund a payment
     */
    async refundPayment(transactionId, amount) {
        try {
            await this.auditService.logEvent('payment.refunded', 'Payment refund initiated', { transactionId, amount }, { traceId: transactionId });
            // Implementation depends on payment provider
            // For now, return success
            return {
                success: true,
                transactionId,
                status: 'refunded',
                amount: amount || 0,
                currency: 'USD',
                timestamp: new Date(),
            };
        }
        catch (error) {
            return {
                success: false,
                transactionId,
                status: 'failed',
                amount: amount || 0,
                currency: 'USD',
                timestamp: new Date(),
                error: error.message,
            };
        }
    }
}
exports.PaymentService = PaymentService;
//# sourceMappingURL=payment.service.js.map