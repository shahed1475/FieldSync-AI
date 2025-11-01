/**
 * FactBoxService
 * Provides verified entity and regulatory data access
 * This service acts as a trusted source of truth for compliance verification
 */
import { EntityData, RegulatoryRule } from '../types';
export declare class FactBoxService {
    private entityCache;
    private regulatoryRulesCache;
    constructor();
    /**
     * Fetches entity data by ID
     * In production, this would query a database or external API
     */
    getEntityData(entityId: string): Promise<EntityData | null>;
    /**
     * Fetches regulatory rules for a specific regulation and jurisdiction
     */
    getRegulatoryRules(regulation: string, jurisdiction: string): Promise<RegulatoryRule[]>;
    /**
     * Verifies if an entity meets KYC requirements
     */
    verifyKYC(entityId: string): Promise<boolean>;
    /**
     * Checks if entity has required registrations for a jurisdiction
     */
    hasRequiredRegistrations(entityId: string, jurisdiction: string, requiredTypes: string[]): Promise<boolean>;
    /**
     * Stores entity data (for testing and cache purposes)
     */
    setEntityData(entityId: string, data: EntityData): void;
    /**
     * Stores regulatory rules (for testing and cache purposes)
     */
    setRegulatoryRules(regulation: string, jurisdiction: string, rules: RegulatoryRule[]): void;
    /**
     * Get expiring registrations within a specified number of days
     */
    getExpiringRegistrations(daysAhead?: number): Promise<Array<{
        entityId: string;
        registration: any;
    }>>;
    /**
     * Get expired registrations
     */
    getExpiredRegistrations(): Promise<Array<{
        entityId: string;
        registration: any;
    }>>;
    /**
     * Clears all cached data
     */
    clearCache(): void;
}
//# sourceMappingURL=FactBoxService.d.ts.map