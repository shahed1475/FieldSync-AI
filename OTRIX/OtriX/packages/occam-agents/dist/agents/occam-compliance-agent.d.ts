/**
 * OCCAMComplianceAgent
 * AI-driven agent that interprets regulatory rules, validates compliance data,
 * and executes filings automatically
 */
import { ComplianceAction, ComplianceReport, ValidationResult, FilingResult } from '../types';
import { FactBoxService } from '../services/FactBoxService';
import { AuditService } from '../services/AuditService';
import { SecureVault } from '../services/SecureVault';
export declare class OCCAMComplianceAgent {
    private factBoxService;
    private auditService;
    private secureVault;
    private ajv;
    constructor(factBoxService?: FactBoxService, auditService?: AuditService, secureVault?: SecureVault);
    /**
     * Analyzes a regulatory document and extracts compliance actions
     * @param document - The regulatory document text to analyze
     * @returns Array of compliance actions to be executed
     */
    analyzeRegulation(document: string): Promise<ComplianceAction[]>;
    /**
     * Verifies that an entity meets all compliance requirements
     * @param entityId - The ID of the entity to verify
     * @returns Validation result with errors and warnings
     */
    verifyRequirements(entityId: string): Promise<ValidationResult>;
    /**
     * Executes a compliance filing action
     * @param action - The compliance action to execute
     * @returns Filing result with confirmation details
     */
    executeFiling(action: ComplianceAction): Promise<FilingResult>;
    /**
     * Validates data against a JSON schema
     * @param data - Data to validate
     * @param schema - JSON schema to validate against
     * @returns Validation result
     */
    validateWithSchema(data: any, schema: any): ValidationResult;
    /**
     * Generates a comprehensive compliance report
     * @param entityId - Entity ID to generate report for
     * @param regulation - Regulation to assess
     * @returns Compliance report
     */
    generateComplianceReport(entityId: string, regulation: string): Promise<ComplianceReport>;
    /**
     * Helper: Parse regulatory document (simplified version)
     * In production, this would use NLP/AI
     */
    private parseRegulatoryDocument;
    /**
     * Helper: Generate next steps based on validation and findings
     */
    private generateNextSteps;
}
//# sourceMappingURL=occam-compliance-agent.d.ts.map