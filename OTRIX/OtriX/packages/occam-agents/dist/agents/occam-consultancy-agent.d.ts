/**
 * OCCAM Consultancy Agent
 * Provides compliance readiness checks, policy summaries, and actionable recommendations
 */
import { ReadinessCheckResult, PolicySummary, ImprovementRecommendation, ComplianceReport, LLMConfig } from '../types';
import { FactBoxService } from '../services/FactBoxService';
import { AuditService } from '../services/AuditService';
import { SecureVault } from '../services/SecureVault';
import winston from 'winston';
/**
 * OCCAM Consultancy Agent
 * Performs readiness checks, generates policy summaries, and provides compliance guidance
 */
export declare class OCCAMConsultancyAgent {
    private factBox;
    private auditService;
    private secureVault;
    private logger;
    private llmConfig?;
    private storageDir;
    constructor(factBox?: FactBoxService, auditService?: AuditService, secureVault?: SecureVault, logger?: winston.Logger, llmConfig?: LLMConfig, storageDir?: string);
    /**
     * Runs a comprehensive readiness check for an entity
     */
    runReadinessCheck(entityId: string): Promise<ReadinessCheckResult>;
    /**
     * Generates a policy summary for a compliance domain
     */
    generatePolicySummary(domain: string, jurisdiction?: string): Promise<PolicySummary>;
    /**
     * Recommends next steps based on compliance reports
     */
    recommendNextSteps(reports: ComplianceReport[]): Promise<ImprovementRecommendation[]>;
    /**
     * Performs KYC verification check
     */
    private performKYCCheck;
    /**
     * Performs registration checks
     */
    private performRegistrationChecks;
    /**
     * Performs documentation check
     */
    private performDocumentationCheck;
    /**
     * Performs license checks
     */
    private performLicenseChecks;
    /**
     * Generates actionable next steps from readiness checks
     */
    private generateNextActions;
    /**
     * Saves readiness report to storage
     */
    private saveReadinessReport;
    /**
     * Generates markdown formatted readiness report
     */
    private generateReadinessMarkdown;
    /**
     * Saves policy summary to storage
     */
    private savePolicySummary;
    /**
     * Generates markdown formatted policy summary
     */
    private generatePolicySummaryMarkdown;
    /**
     * Generates AI-powered recommendations for readiness improvement
     */
    private generateAIRecommendations;
    /**
     * Generates AI-powered policy summary
     */
    private generateAIPolicySummary;
    /**
     * Generates AI-powered improvement recommendations
     */
    private generateAIImprovementRecommendations;
}
//# sourceMappingURL=occam-consultancy-agent.d.ts.map