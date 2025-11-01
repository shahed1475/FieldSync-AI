"use strict";
/**
 * FactBoxService
 * Provides verified entity and regulatory data access
 * This service acts as a trusted source of truth for compliance verification
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FactBoxService = void 0;
class FactBoxService {
    constructor() {
        this.entityCache = new Map();
        this.regulatoryRulesCache = new Map();
    }
    /**
     * Fetches entity data by ID
     * In production, this would query a database or external API
     */
    async getEntityData(entityId) {
        // Check cache first
        if (this.entityCache.has(entityId)) {
            return this.entityCache.get(entityId) || null;
        }
        // In production, query database via Prisma
        // For now, return null to indicate entity not found
        return null;
    }
    /**
     * Fetches regulatory rules for a specific regulation and jurisdiction
     */
    async getRegulatoryRules(regulation, jurisdiction) {
        const cacheKey = `${regulation}-${jurisdiction}`;
        // Check cache first
        if (this.regulatoryRulesCache.has(cacheKey)) {
            return this.regulatoryRulesCache.get(cacheKey) || [];
        }
        // In production, query database for active rules
        // For now, return empty array
        return [];
    }
    /**
     * Verifies if an entity meets KYC requirements
     */
    async verifyKYC(entityId) {
        const entity = await this.getEntityData(entityId);
        if (!entity) {
            return false;
        }
        return entity.kyc_status === 'verified';
    }
    /**
     * Checks if entity has required registrations for a jurisdiction
     */
    async hasRequiredRegistrations(entityId, jurisdiction, requiredTypes) {
        const entity = await this.getEntityData(entityId);
        if (!entity) {
            return false;
        }
        const activeRegistrations = entity.registrations.filter((reg) => reg.status === 'active' && reg.jurisdiction === jurisdiction);
        return requiredTypes.every((type) => activeRegistrations.some((reg) => reg.type === type));
    }
    /**
     * Stores entity data (for testing and cache purposes)
     */
    setEntityData(entityId, data) {
        this.entityCache.set(entityId, data);
    }
    /**
     * Stores regulatory rules (for testing and cache purposes)
     */
    setRegulatoryRules(regulation, jurisdiction, rules) {
        const cacheKey = `${regulation}-${jurisdiction}`;
        this.regulatoryRulesCache.set(cacheKey, rules);
    }
    /**
     * Get expiring registrations within a specified number of days
     */
    async getExpiringRegistrations(daysAhead = 30) {
        const expiringRegistrations = [];
        const now = new Date();
        const threshold = new Date();
        threshold.setDate(threshold.getDate() + daysAhead);
        // Iterate through all cached entities
        for (const [entityId, entity] of this.entityCache.entries()) {
            if (entity.registrations) {
                for (const registration of entity.registrations) {
                    if (registration.expirationDate) {
                        const expirationDate = new Date(registration.expirationDate);
                        if (expirationDate >= now && expirationDate <= threshold) {
                            expiringRegistrations.push({
                                entityId,
                                registration,
                            });
                        }
                    }
                }
            }
        }
        return expiringRegistrations;
    }
    /**
     * Get expired registrations
     */
    async getExpiredRegistrations() {
        const expiredRegistrations = [];
        const now = new Date();
        for (const [entityId, entity] of this.entityCache.entries()) {
            if (entity.registrations) {
                for (const registration of entity.registrations) {
                    if (registration.expirationDate) {
                        const expirationDate = new Date(registration.expirationDate);
                        if (expirationDate < now && registration.status === 'active') {
                            expiredRegistrations.push({
                                entityId,
                                registration,
                            });
                        }
                    }
                }
            }
        }
        return expiredRegistrations;
    }
    /**
     * Clears all cached data
     */
    clearCache() {
        this.entityCache.clear();
        this.regulatoryRulesCache.clear();
    }
}
exports.FactBoxService = FactBoxService;
//# sourceMappingURL=FactBoxService.js.map