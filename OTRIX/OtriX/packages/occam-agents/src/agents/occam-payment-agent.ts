/**
 * OCCAM Payment Agent - Intelligent payment automation for compliance
 * Secure payment processing with governance, audit, and anomaly detection
 */

import {
  PaymentData,
  PaymentResult,
  PaymentReceipt,
  PaymentVerification,
  RenewalData,
  TransactionContext
} from '../types';
import {
  VaultService,
  AuditService,
  GovernanceService,
  PaymentService,
  FactBoxService
} from '../services';
import { VaultConfig } from '../types/vault.types';

export class OCCAMPaymentAgent {
  private vaultService: VaultService;
  private auditService: AuditService;
  private governanceService: GovernanceService;
  private paymentService: PaymentService;
  private factBoxService: FactBoxService;
  private initialized: boolean = false;

  constructor() {
    // Initialize audit service first (needed by others)
    this.auditService = new AuditService(
      process.env.AUDIT_LOG_PATH || './logs',
      process.env.LOG_LEVEL || 'info'
    );

    // Initialize vault service
    const vaultConfig: VaultConfig = {
      encryptionKey: process.env.ENCRYPTION_KEY || this.generateDefaultKey(),
      vaultSecret: process.env.VAULT_SECRET || this.generateDefaultKey(),
    };
    this.vaultService = new VaultService(vaultConfig);

    // Initialize governance service
    this.governanceService = new GovernanceService(this.auditService);

    // Initialize payment service
    this.paymentService = new PaymentService(this.vaultService, this.auditService);

    // Initialize FactBox service
    this.factBoxService = new FactBoxService(this.auditService);
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.auditService.initialize();
      await this.vaultService.initialize();
      await this.governanceService.initialize();
      await this.paymentService.initialize();
      await this.factBoxService.initialize();

      this.initialized = true;

      await this.auditService.logEvent(
        'payment.initiated',
        'OCCAM Payment Agent initialized successfully',
        {
          services: [
            'VaultService',
            'AuditService',
            'GovernanceService',
            'PaymentService',
            'FactBoxService'
          ]
        },
        { severity: 'info' }
      );
    } catch (error: any) {
      await this.auditService.logEvent(
        'payment.failed',
        'OCCAM Payment Agent initialization failed',
        { error: error.message },
        { severity: 'critical', success: false, errorMessage: error.message }
      );
      throw error;
    }
  }

  /**
   * Initiate a payment transaction
   * Main method for processing payments with full governance and audit
   */
  async initiatePayment(paymentDetails: PaymentData): Promise<PaymentResult> {
    this.ensureInitialized();

    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Start audit trail
      await this.auditService.startTrail(transactionId);

      // Create transaction context for governance
      const context: TransactionContext = {
        transactionId,
        amount: paymentDetails.amount,
        currency: paymentDetails.currency,
        entityId: paymentDetails.entityId,
        timestamp: new Date(),
        metadata: paymentDetails.metadata,
      };

      // Validate against governance policies
      await this.auditService.addToTrail(
        transactionId,
        'payment.initiated',
        'Validating transaction against governance policies',
        { context }
      );

      const governanceResult = await this.governanceService.validateTransaction(context);

      if (!governanceResult.allowed) {
        const error = `Payment blocked by governance: ${governanceResult.violations.map(v => v.description).join(', ')}`;

        await this.auditService.addToTrail(
          transactionId,
          'payment.failed',
          'Payment blocked by governance policies',
          { violations: governanceResult.violations },
          { severity: 'warning', success: false, errorMessage: error }
        );

        await this.auditService.completeTrail(transactionId, 'blocked');

        return {
          success: false,
          transactionId,
          status: 'failed',
          amount: paymentDetails.amount,
          currency: paymentDetails.currency,
          timestamp: new Date(),
          error,
        };
      }

      // If approval required, return pending status
      if (governanceResult.requiresApproval) {
        await this.auditService.addToTrail(
          transactionId,
          'approval.requested',
          'Payment requires approval',
          { approvalRequestId: governanceResult.approvalRequestId },
          { severity: 'warning' }
        );

        await this.auditService.completeTrail(transactionId, 'pending_approval');

        return {
          success: false,
          transactionId,
          status: 'pending',
          amount: paymentDetails.amount,
          currency: paymentDetails.currency,
          timestamp: new Date(),
          error: `Payment requires approval. Approval ID: ${governanceResult.approvalRequestId}`,
        };
      }

      // Record transaction for governance tracking
      await this.governanceService.recordTransaction(context);

      // Process payment
      await this.auditService.addToTrail(
        transactionId,
        'payment.processing',
        'Processing payment through payment service',
        { paymentDetails }
      );

      const paymentResult = await this.paymentService.initiatePayment({
        ...paymentDetails,
        idempotencyKey: transactionId,
      });

      // Update audit trail with result
      await this.auditService.addToTrail(
        transactionId,
        paymentResult.success ? 'payment.completed' : 'payment.failed',
        paymentResult.success ? 'Payment processed successfully' : 'Payment processing failed',
        { paymentResult },
        {
          severity: paymentResult.success ? 'info' : 'error',
          success: paymentResult.success,
          errorMessage: paymentResult.error,
        }
      );

      // Complete audit trail
      await this.auditService.completeTrail(
        transactionId,
        paymentResult.success ? 'completed' : 'failed'
      );

      return {
        ...paymentResult,
        transactionId,
      };
    } catch (error: any) {
      await this.auditService.addToTrail(
        transactionId,
        'payment.failed',
        'Payment failed with exception',
        { error: error.message },
        { severity: 'error', success: false, errorMessage: error.message }
      );

      await this.auditService.completeTrail(transactionId, 'error');

      return {
        success: false,
        transactionId,
        status: 'failed',
        amount: paymentDetails.amount,
        currency: paymentDetails.currency,
        timestamp: new Date(),
        error: error.message,
      };
    }
  }

  /**
   * Verify payment status
   * Check and confirm payment transaction status
   */
  async verifyPaymentStatus(transactionId: string): Promise<PaymentVerification> {
    this.ensureInitialized();

    try {
      await this.auditService.logEvent(
        'payment.verified',
        'Payment verification requested',
        { transactionId },
        { traceId: transactionId }
      );

      const verification = await this.paymentService.verifyPaymentStatus(transactionId);

      await this.auditService.logEvent(
        'payment.verified',
        'Payment verification completed',
        { transactionId, verification },
        { traceId: transactionId, success: verification.isVerified }
      );

      return verification;
    } catch (error: any) {
      await this.auditService.logEvent(
        'payment.verified',
        'Payment verification failed',
        { transactionId, error: error.message },
        {
          traceId: transactionId,
          severity: 'error',
          success: false,
          errorMessage: error.message,
        }
      );

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
   * Log receipt for audit and compliance
   * Store payment receipt for record keeping
   */
  async logReceipt(receipt: PaymentReceipt): Promise<void> {
    this.ensureInitialized();

    try {
      await this.auditService.logEvent(
        'payment.completed',
        'Payment receipt logged',
        { receipt },
        {
          traceId: receipt.transactionId,
          severity: 'info',
          resource: receipt.receiptNumber,
        }
      );
    } catch (error: any) {
      await this.auditService.logEvent(
        'payment.failed',
        'Failed to log payment receipt',
        { receipt, error: error.message },
        {
          traceId: receipt.transactionId,
          severity: 'error',
          success: false,
          errorMessage: error.message,
        }
      );
      throw error;
    }
  }

  /**
   * Renew subscription or license
   * Handle automatic renewal payments
   */
  async renewSubscription(entityId: string, renewalData?: Partial<RenewalData>): Promise<PaymentResult> {
    this.ensureInitialized();

    try {
      // Get entity information
      const entity = await this.factBoxService.getEntity(entityId);

      if (!entity) {
        throw new Error(`Entity not found: ${entityId}`);
      }

      // Get licenses requiring renewal
      const licenses = await this.factBoxService.getLicensesByEntity(entityId);
      const renewalLicense = licenses.find(l => l.renewalRequired);

      if (!renewalLicense && !renewalData) {
        throw new Error('No license requires renewal and no renewal data provided');
      }

      // Calculate renewal amount
      const amount = renewalData?.amount ||
        renewalLicense?.renewalAmount ||
        await this.factBoxService.getPaymentAmount(
          entityId,
          renewalLicense?.id,
          renewalLicense?.issuingAuthority
        );

      if (!amount) {
        throw new Error('Unable to determine renewal amount');
      }

      // Create payment data
      const paymentData: PaymentData = {
        amount,
        currency: renewalData?.currency || 'USD',
        description: `License renewal for ${entity.name}`,
        entityId,
        licenseId: renewalLicense?.id,
        metadata: {
          renewalType: renewalData?.renewalType || 'license',
          autoRenew: renewalData?.autoRenew || false,
        },
      };

      await this.auditService.logEvent(
        'renewal.scheduled',
        'Renewal payment initiated',
        { entityId, paymentData },
        { severity: 'info', resource: entityId }
      );

      // Process payment
      const result = await this.initiatePayment(paymentData);

      if (result.success && renewalLicense) {
        // Update license expiry date
        const newExpiryDate = new Date(renewalLicense.expiryDate);
        newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);

        await this.factBoxService.upsertLicense({
          ...renewalLicense,
          expiryDate: newExpiryDate,
          status: 'active',
          renewalRequired: false,
        });

        await this.auditService.logEvent(
          'renewal.processed',
          'License renewed successfully',
          { entityId, licenseId: renewalLicense.id, newExpiryDate },
          { severity: 'info', resource: entityId }
        );
      }

      return result;
    } catch (error: any) {
      await this.auditService.logEvent(
        'renewal.processed',
        'Renewal payment failed',
        { entityId, error: error.message },
        {
          severity: 'error',
          resource: entityId,
          success: false,
          errorMessage: error.message,
        }
      );

      throw error;
    }
  }

  /**
   * Get governance service for external access
   */
  getGovernanceService(): GovernanceService {
    return this.governanceService;
  }

  /**
   * Get audit service for external access
   */
  getAuditService(): AuditService {
    return this.auditService;
  }

  /**
   * Get vault service for external access
   */
  getVaultService(): VaultService {
    return this.vaultService;
  }

  /**
   * Get FactBox service for external access
   */
  getFactBoxService(): FactBoxService {
    return this.factBoxService;
  }

  /**
   * Ensure agent is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('OCCAM Payment Agent not initialized. Call initialize() first.');
    }
  }

  /**
   * Generate default encryption key (for development only)
   */
  private generateDefaultKey(): string {
    return Buffer.from('default_key_for_development_only_replace_in_prod').toString('hex').slice(0, 64);
  }
}
