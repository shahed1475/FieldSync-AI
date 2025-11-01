/**
 * FactBoxService
 * Provides verified entity and regulatory data access
 * This service acts as a trusted source of truth for compliance verification
 */

import { EntityData, RegulatoryRule } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class FactBoxService {
  private entityCache: Map<string, EntityData>;
  private regulatoryRulesCache: Map<string, RegulatoryRule[]>;

  constructor() {
    this.entityCache = new Map();
    this.regulatoryRulesCache = new Map();
  }

  /**
   * Fetches entity data by ID
   * In production, this would query a database or external API
   */
  async getEntityData(entityId: string): Promise<EntityData | null> {
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
  async getRegulatoryRules(
    regulation: string,
    jurisdiction: string
  ): Promise<RegulatoryRule[]> {
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
  async verifyKYC(entityId: string): Promise<boolean> {
    const entity = await this.getEntityData(entityId);

    if (!entity) {
      return false;
    }

    return entity.kyc_status === 'verified';
  }

  /**
   * Checks if entity has required registrations for a jurisdiction
   */
  async hasRequiredRegistrations(
    entityId: string,
    jurisdiction: string,
    requiredTypes: string[]
  ): Promise<boolean> {
    const entity = await this.getEntityData(entityId);

    if (!entity) {
      return false;
    }

    const activeRegistrations = entity.registrations.filter(
      (reg) => reg.status === 'active' && reg.jurisdiction === jurisdiction
    );

    return requiredTypes.every((type) =>
      activeRegistrations.some((reg) => reg.type === type)
    );
  }

  /**
   * Stores entity data (for testing and cache purposes)
   */
  setEntityData(entityId: string, data: EntityData): void {
    this.entityCache.set(entityId, data);
  }

  /**
   * Stores regulatory rules (for testing and cache purposes)
   */
  setRegulatoryRules(regulation: string, jurisdiction: string, rules: RegulatoryRule[]): void {
    const cacheKey = `${regulation}-${jurisdiction}`;
    this.regulatoryRulesCache.set(cacheKey, rules);
  }

  /**
   * Clears all cached data
   */
  clearCache(): void {
    this.entityCache.clear();
    this.regulatoryRulesCache.clear();
  }
}
