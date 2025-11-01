/**
 * OCCAM Compliance Engine - Form Agent
 * Intelligent automation for regulatory form parsing, validation, and submission
 */
import { ParsedForm, ValidationResult, SubmissionConfig, SubmissionResult, AutoFillData, OCCAMFormAgentOptions } from '../types';
/**
 * OCCAMFormAgent - Intelligent Form Processing Agent
 *
 * Capabilities:
 * - Parse forms in multiple formats (PDF, JSON, HTML, XML)
 * - Auto-fill fields using verified FactBox data
 * - Validate completeness and compliance before submission
 * - Securely submit forms with credential management
 * - Comprehensive audit trail of all operations
 *
 * Security:
 * - Input sanitization for all user data
 * - Encrypted credential storage via SecureVault
 * - GDPR/HIPAA/PCI-DSS compliant data handling
 */
export declare class OCCAMFormAgent {
    private factBoxService;
    private auditService;
    private secureVault;
    private storageDir;
    private enableAutoFill;
    private validateBeforeSubmitFlag;
    private maxRetries;
    constructor(options?: OCCAMFormAgentOptions);
    /**
     * Parse a form from file and extract field definitions
     *
     * Supports multiple formats:
     * - PDF: Extracts form fields from PDF structure
     * - JSON: Parses structured form schema
     * - HTML: Extracts form elements and attributes
     * - XML: Parses XML-based form definitions
     */
    parseForm(filePath: string): Promise<ParsedForm>;
    /**
     * Auto-fill form fields using verified data from FactBoxService
     *
     * Intelligently maps entity data to form fields:
     * - Entity information (name, ID, contact details)
     * - Regulatory data (registrations, compliance status)
     * - Custom data sources
     */
    autoFill(parsedForm: ParsedForm, autoFillData: AutoFillData): Promise<Record<string, any>>;
    /**
     * Validate form data before submission
     *
     * Validates:
     * - Required fields are present
     * - Field types match expected values
     * - Validation rules are satisfied
     * - Conditional fields are handled correctly
     */
    validateBeforeSubmit(parsedForm: ParsedForm, formData: Record<string, any>): Promise<ValidationResult>;
    /**
     * Submit form to endpoint with secure authentication
     *
     * Features:
     * - Secure credential retrieval from SecureVault
     * - Retry logic with exponential backoff
     * - Comprehensive error handling
     * - Response capture and confirmation tracking
     */
    submitForm(parsedForm: ParsedForm, formData: Record<string, any>, config: SubmissionConfig): Promise<SubmissionResult>;
    /**
     * Detect form format from file extension
     */
    private detectFormat;
    /**
     * Parse JSON form definition
     */
    private parseJsonForm;
    /**
     * Parse HTML form (basic implementation)
     */
    private parseHtmlForm;
    /**
     * Parse XML form (basic implementation)
     */
    private parseXmlForm;
    /**
     * Parse PDF form
     * Note: PDF parsing requires external library (pdf-lib, pdf-parse, etc.)
     * This is a placeholder implementation
     */
    private parsePdfForm;
    /**
     * Map HTML input type to FieldType
     */
    private mapHtmlTypeToFieldType;
    /**
     * Map form field to entity data
     */
    private mapFieldToData;
    /**
     * Sanitize input to prevent injection attacks
     */
    private sanitizeInput;
    /**
     * Validate field type
     */
    private validateFieldType;
    /**
     * Validate individual validation rule
     */
    private validateRule;
    /**
     * Prepare submission payload
     */
    private prepareSubmissionPayload;
    /**
     * Prepare request headers with authentication
     */
    private prepareHeaders;
    /**
     * Submit with retry logic
     */
    private submitWithRetry;
    /**
     * Extract confirmation ID from response
     */
    private extractConfirmationId;
    /**
     * Save submission record to storage
     */
    private saveSubmissionRecord;
}
//# sourceMappingURL=occam-form-agent.d.ts.map