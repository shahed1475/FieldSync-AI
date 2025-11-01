/**
 * OCCAMComplianceAgent
 * AI-driven agent that interprets regulatory rules, validates compliance data,
 * and executes filings automatically
 */

import {
  ComplianceAction,
  ComplianceReport,
  ComplianceFinding,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  FilingResult,
  RegulatoryRule,
  EntityData,
} from '../types';
import { FactBoxService } from '../services/FactBoxService';
import { AuditService } from '../services/AuditService';
import { SecureVault } from '../services/SecureVault';
import Ajv, { JSONSchemaType } from 'ajv';
import { v4 as uuidv4 } from 'uuid';

export class OCCAMComplianceAgent {
  private factBoxService: FactBoxService;
  private auditService: AuditService;
  private secureVault: SecureVault;
  private ajv: Ajv;

  constructor(
    factBoxService?: FactBoxService,
    auditService?: AuditService,
    secureVault?: SecureVault
  ) {
    this.factBoxService = factBoxService || new FactBoxService();
    this.auditService = auditService || new AuditService();
    this.secureVault = secureVault || new SecureVault();
    this.ajv = new Ajv({ allErrors: true, strict: false });
  }

  /**
   * Analyzes a regulatory document and extracts compliance actions
   * @param document - The regulatory document text to analyze
   * @returns Array of compliance actions to be executed
   */
  async analyzeRegulation(document: string): Promise<ComplianceAction[]> {
    const traceId = this.auditService.generateTraceId();
    const actions: ComplianceAction[] = [];

    try {
      await this.auditService.logEntry({
        trace_id: traceId,
        action: 'analyze_regulation',
        status: 'success',
        details: {
          document_length: document.length,
          timestamp: new Date(),
        },
      });

      // Parse the document to extract regulatory requirements
      // In a real implementation, this would use NLP/AI to understand the document
      const parsedRequirements = this.parseRegulatoryDocument(document);

      // Create compliance actions based on parsed requirements
      for (const requirement of parsedRequirements) {
        const action: ComplianceAction = {
          id: uuidv4(),
          regulation: requirement.regulation,
          actionType: requirement.type,
          entityId: requirement.entityId || '',
          requirementsVerified: false,
          data: requirement.data,
          metadata: {
            createdAt: new Date(),
            priority: requirement.priority || 'medium',
            deadline: requirement.deadline,
            status: 'pending',
          },
        };

        actions.push(action);
      }

      await this.auditService.logSuccess(traceId, 'analyze_regulation', {
        actions_generated: actions.length,
      });

      return actions;
    } catch (error) {
      await this.auditService.logFailure(
        traceId,
        'analyze_regulation',
        error instanceof Error ? error.message : 'Unknown error',
        { document_length: document.length }
      );
      throw error;
    }
  }

  /**
   * Verifies that an entity meets all compliance requirements
   * @param entityId - The ID of the entity to verify
   * @returns Validation result with errors and warnings
   */
  async verifyRequirements(entityId: string): Promise<ValidationResult> {
    const traceId = this.auditService.generateTraceId();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      await this.auditService.logEntry({
        trace_id: traceId,
        action: 'verify_requirements',
        entity_id: entityId,
        status: 'success',
        details: { timestamp: new Date() },
      });

      // Fetch entity data
      const entity = await this.factBoxService.getEntityData(entityId);

      if (!entity) {
        errors.push({
          field: 'entity',
          message: 'Entity not found',
          rule: 'entity_existence',
          severity: 'critical',
        });

        await this.auditService.logFailure(
          traceId,
          'verify_requirements',
          'Entity not found',
          { entity_id: entityId }
        );

        return {
          valid: false,
          errors,
          warnings,
          completeness_score: 0,
          trace_id: traceId,
        };
      }

      // Verify KYC status
      if (entity.kyc_status !== 'verified') {
        errors.push({
          field: 'kyc_status',
          message: 'KYC verification required',
          rule: 'kyc_verification',
          severity: 'critical',
          value: entity.kyc_status,
        });
      }

      // Check for expired registrations
      const now = new Date();
      entity.registrations.forEach((reg) => {
        if (reg.expiryDate && reg.expiryDate < now) {
          warnings.push({
            field: 'registration',
            message: `Registration ${reg.type} has expired`,
            recommendation: 'Renew registration before filing',
          });
        }
      });

      // Validate entity data completeness
      const requiredFields = ['name', 'type', 'jurisdiction'];
      requiredFields.forEach((field) => {
        if (!entity[field as keyof EntityData]) {
          errors.push({
            field,
            message: `Required field '${field}' is missing`,
            rule: 'required_field',
            severity: 'error',
          });
        }
      });

      // Calculate completeness score
      const totalChecks = requiredFields.length + 1; // +1 for KYC
      const passedChecks = totalChecks - errors.length;
      const completeness_score = Math.round((passedChecks / totalChecks) * 100);

      const result: ValidationResult = {
        valid: errors.length === 0,
        errors,
        warnings,
        completeness_score,
        trace_id: traceId,
      };

      await this.auditService.logSuccess(traceId, 'verify_requirements', {
        entity_id: entityId,
        valid: result.valid,
        completeness_score,
        error_count: errors.length,
        warning_count: warnings.length,
      });

      return result;
    } catch (error) {
      await this.auditService.logFailure(
        traceId,
        'verify_requirements',
        error instanceof Error ? error.message : 'Unknown error',
        { entity_id: entityId }
      );
      throw error;
    }
  }

  /**
   * Executes a compliance filing action
   * @param action - The compliance action to execute
   * @returns Filing result with confirmation details
   */
  async executeFiling(action: ComplianceAction): Promise<FilingResult> {
    const traceId = this.auditService.generateTraceId();

    try {
      await this.auditService.logEntry({
        trace_id: traceId,
        action: 'execute_filing',
        entity_id: action.entityId,
        regulation: action.regulation,
        status: 'success',
        details: {
          action_id: action.id,
          action_type: action.actionType,
          timestamp: new Date(),
        },
      });

      // Verify requirements before filing
      if (!action.requirementsVerified) {
        const validation = await this.verifyRequirements(action.entityId);

        if (!validation.valid) {
          const result: FilingResult = {
            success: false,
            timestamp: new Date(),
            trace_id: traceId,
            errors: validation.errors.map((e) => e.message),
            metadata: {
              validation_failed: true,
              completeness_score: validation.completeness_score,
            },
          };

          await this.auditService.logFailure(
            traceId,
            'execute_filing',
            'Validation failed',
            { action_id: action.id, errors: result.errors }
          );

          return result;
        }
      }

      // In production, this would submit to actual regulatory APIs
      // using credentials from SecureVault
      const filingId = uuidv4();
      const confirmationNumber = `OCCAM-${Date.now()}-${filingId.substring(0, 8)}`;

      const result: FilingResult = {
        success: true,
        filing_id: filingId,
        confirmation_number: confirmationNumber,
        timestamp: new Date(),
        trace_id: traceId,
        metadata: {
          regulation: action.regulation,
          entity_id: action.entityId,
          action_type: action.actionType,
        },
      };

      await this.auditService.logSuccess(traceId, 'execute_filing', {
        action_id: action.id,
        filing_id: filingId,
        confirmation_number: confirmationNumber,
      });

      return result;
    } catch (error) {
      await this.auditService.logFailure(
        traceId,
        'execute_filing',
        error instanceof Error ? error.message : 'Unknown error',
        { action_id: action.id }
      );

      return {
        success: false,
        timestamp: new Date(),
        trace_id: traceId,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        metadata: {},
      };
    }
  }

  /**
   * Validates data against a JSON schema
   * @param data - Data to validate
   * @param schema - JSON schema to validate against
   * @returns Validation result
   */
  validateWithSchema(data: any, schema: any): ValidationResult {
    const traceId = this.auditService.generateTraceId();
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const validate = this.ajv.compile(schema);
    const valid = validate(data);

    if (!valid && validate.errors) {
      validate.errors.forEach((error) => {
        errors.push({
          field: error.instancePath || error.schemaPath,
          message: error.message || 'Validation failed',
          rule: error.keyword,
          severity: 'error',
          value: error.data,
        });
      });
    }

    // Calculate completeness score based on required fields
    const requiredFields = schema.required || [];
    const providedFields = Object.keys(data).filter((key) => data[key] !== undefined);
    const completeness_score = requiredFields.length > 0
      ? Math.round((providedFields.length / requiredFields.length) * 100)
      : 100;

    return {
      valid,
      errors,
      warnings,
      completeness_score,
      trace_id: traceId,
    };
  }

  /**
   * Generates a comprehensive compliance report
   * @param entityId - Entity ID to generate report for
   * @param regulation - Regulation to assess
   * @returns Compliance report
   */
  async generateComplianceReport(
    entityId: string,
    regulation: string
  ): Promise<ComplianceReport> {
    const traceId = this.auditService.generateTraceId();
    const findings: ComplianceFinding[] = [];

    try {
      // Verify requirements
      const validation = await this.verifyRequirements(entityId);

      // Convert validation errors to findings
      validation.errors.forEach((error) => {
        findings.push({
          rule: error.rule,
          severity: error.severity === 'critical' ? 'critical' : 'error',
          message: error.message,
          field: error.field,
          expected: 'Valid value',
          actual: error.value,
        });
      });

      // Convert validation warnings to findings
      validation.warnings.forEach((warning) => {
        findings.push({
          rule: 'compliance_warning',
          severity: 'warning',
          message: warning.message,
          field: warning.field,
        });
      });

      // Determine risk level based on findings
      const criticalCount = findings.filter((f) => f.severity === 'critical').length;
      const errorCount = findings.filter((f) => f.severity === 'error').length;

      let risk_level: ComplianceReport['risk_level'];
      if (criticalCount > 0) {
        risk_level = 'critical';
      } else if (errorCount > 2) {
        risk_level = 'high';
      } else if (errorCount > 0 || validation.warnings.length > 0) {
        risk_level = 'moderate';
      } else {
        risk_level = 'low';
      }

      // Determine status
      let status: ComplianceReport['status'];
      if (validation.valid && validation.completeness_score >= 90) {
        status = 'ready_for_submission';
      } else if (validation.completeness_score >= 70) {
        status = 'requires_attention';
      } else if (criticalCount > 0) {
        status = 'failed';
      } else {
        status = 'incomplete';
      }

      // Generate recommended action
      let recommended_action = '';
      if (status === 'ready_for_submission') {
        recommended_action = 'Proceed with filing submission';
      } else if (validation.errors.some((e) => e.rule === 'kyc_verification')) {
        recommended_action = 'Complete KYC verification before proceeding';
      } else if (errorCount > 0) {
        recommended_action = 'Address all critical errors before filing';
      } else {
        recommended_action = 'Complete missing requirements';
      }

      const missing_requirements = validation.errors.map((e) => e.field);
      const next_steps = this.generateNextSteps(validation, findings);

      const report: ComplianceReport = {
        regulation,
        risk_level,
        status,
        recommended_action,
        entity_id: entityId,
        timestamp: new Date(),
        trace_id: traceId,
        findings,
        missing_requirements: missing_requirements.length > 0 ? missing_requirements : undefined,
        next_steps: next_steps.length > 0 ? next_steps : undefined,
      };

      await this.auditService.logSuccess(traceId, 'generate_compliance_report', {
        entity_id: entityId,
        regulation,
        risk_level,
        status,
        findings_count: findings.length,
      });

      return report;
    } catch (error) {
      await this.auditService.logFailure(
        traceId,
        'generate_compliance_report',
        error instanceof Error ? error.message : 'Unknown error',
        { entity_id: entityId, regulation }
      );
      throw error;
    }
  }

  /**
   * Helper: Parse regulatory document (simplified version)
   * In production, this would use NLP/AI
   */
  private parseRegulatoryDocument(document: string): any[] {
    // Simplified parsing - in production, use NLP/AI models
    const requirements = [];
    const lines = document.split('\n');

    for (const line of lines) {
      if (line.includes('filing') || line.includes('submit')) {
        requirements.push({
          regulation: 'parsed-regulation',
          type: 'filing' as const,
          data: { description: line },
          priority: 'medium' as const,
        });
      }
    }

    return requirements;
  }

  /**
   * Helper: Generate next steps based on validation and findings
   */
  private generateNextSteps(
    validation: ValidationResult,
    findings: ComplianceFinding[]
  ): string[] {
    const steps: string[] = [];

    // Critical errors first
    const criticalFindings = findings.filter((f) => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      steps.push('Address all critical compliance issues immediately');
    }

    // KYC verification
    if (validation.errors.some((e) => e.rule === 'kyc_verification')) {
      steps.push('Complete KYC verification process');
    }

    // Missing fields
    const missingFields = validation.errors.filter((e) => e.rule === 'required_field');
    if (missingFields.length > 0) {
      steps.push(`Complete ${missingFields.length} required field(s)`);
    }

    // Warnings
    if (validation.warnings.length > 0) {
      steps.push('Review and address warning items for optimal compliance');
    }

    return steps;
  }
}
