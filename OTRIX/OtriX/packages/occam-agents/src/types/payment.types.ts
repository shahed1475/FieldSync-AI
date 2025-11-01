/**
 * Payment Type Definitions for OCCAM Payment Agent
 * Defines all payment-related interfaces and types
 */

export type PaymentProvider = 'stripe' | 'paypal' | 'paddle';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
export type PaymentMethod = 'card' | 'bank_transfer' | 'ach' | 'wire' | 'crypto' | 'other';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';
export type TransactionType = 'payment' | 'refund' | 'renewal' | 'subscription' | 'filing_fee';

/**
 * Payment data structure for initiating transactions
 */
export interface PaymentData {
  amount: number;
  currency: Currency;
  description: string;
  method?: PaymentMethod;
  provider?: PaymentProvider;
  entityId?: string;
  licenseId?: string;
  authorityId?: string;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

/**
 * Payment result after processing
 */
export interface PaymentResult {
  success: boolean;
  transactionId: string;
  providerTransactionId?: string;
  status: PaymentStatus;
  amount: number;
  currency: Currency;
  timestamp: Date;
  receipt?: PaymentReceipt;
  error?: string;
}

/**
 * Payment receipt for record keeping
 */
export interface PaymentReceipt {
  transactionId: string;
  receiptNumber: string;
  amount: number;
  currency: Currency;
  description: string;
  timestamp: Date;
  provider: PaymentProvider;
  method: PaymentMethod;
  payerInfo?: {
    name?: string;
    email?: string;
    entityId?: string;
  };
  recipientInfo?: {
    name: string;
    authority?: string;
    purpose: string;
  };
  validationHash: string;
}

/**
 * Payment verification status
 */
export interface PaymentVerification {
  transactionId: string;
  isVerified: boolean;
  status: PaymentStatus;
  verificationTime: Date;
  providerResponse?: any;
  error?: string;
}

/**
 * Renewal payment data
 */
export interface RenewalData {
  entityId: string;
  licenseId?: string;
  renewalType: 'license' | 'registration' | 'subscription' | 'filing';
  amount: number;
  currency: Currency;
  dueDate: Date;
  autoRenew?: boolean;
  notifyBeforeDays?: number;
}

/**
 * Payment webhook event
 */
export interface PaymentWebhookEvent {
  eventId: string;
  eventType: 'payment.completed' | 'payment.failed' | 'refund.processed' | 'subscription.renewed';
  provider: PaymentProvider;
  transactionId: string;
  timestamp: Date;
  data: any;
  signature?: string;
}

/**
 * Payment transaction record
 */
export interface PaymentTransaction {
  id: string;
  transactionType: TransactionType;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  provider: PaymentProvider;
  method: PaymentMethod;
  description: string;
  entityId?: string;
  licenseId?: string;
  authorityId?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  metadata?: Record<string, any>;
  receipt?: PaymentReceipt;
  auditTrail: string[];
}
