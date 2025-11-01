/**
 * FactBox Service
 * Manages entity data, licensing information, and regulatory compliance data
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { EntityStatus, LicenseStatus } from '../types';

export interface Entity {
  entityId: string;
  entityName: string;
  entityType: string;
  registrationNumber: string;
  registrationDate: string;
  status: 'active' | 'inactive' | 'suspended';
  metadata: Record<string, any>;
}

export interface License {
  licenseId: string;
  entityId: string;
  licenseName: string;
  licenseType: string;
  licenseNumber: string;
  status: 'active' | 'expired' | 'pending' | 'suspended';
  issueDate: string;
  expiryDate: string;
  issuingAuthority: string;
  metadata: Record<string, any>;
}

/**
 * FactBoxService - Entity and License Data Management
 */
export class FactBoxService {
  private logger: Logger;
  private storagePath: string;
  private entitiesPath: string;
  private licensesPath: string;

  constructor(logger?: Logger) {
    this.logger = logger || new Logger();
    this.storagePath = path.join(process.cwd(), 'storage', 'factbox');
    this.entitiesPath = path.join(this.storagePath, 'entities.json');
    this.licensesPath = path.join(this.storagePath, 'licenses.json');
  }

  /**
   * Initialize storage directories
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });

      // Initialize empty files if they don't exist
      try {
        await fs.access(this.entitiesPath);
      } catch {
        await fs.writeFile(this.entitiesPath, JSON.stringify([], null, 2));
      }

      try {
        await fs.access(this.licensesPath);
      } catch {
        await fs.writeFile(this.licensesPath, JSON.stringify([], null, 2));
      }

      this.logger.info('FactBoxService initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize FactBoxService', error as Error);
      throw error;
    }
  }

  /**
   * Get entity by ID
   */
  async getEntity(entityId: string): Promise<Entity | null> {
    try {
      const entities = await this.loadEntities();
      const entity = entities.find((e) => e.entityId === entityId);

      if (!entity) {
        this.logger.warn(`Entity not found: ${entityId}`);
        return null;
      }

      this.logger.debug(`Retrieved entity: ${entityId}`, { entity });
      return entity;
    } catch (error) {
      this.logger.error(`Failed to get entity: ${entityId}`, error as Error);
      throw error;
    }
  }

  /**
   * Get all entities
   */
  async getAllEntities(): Promise<Entity[]> {
    try {
      const entities = await this.loadEntities();
      this.logger.debug(`Retrieved ${entities.length} entities`);
      return entities;
    } catch (error) {
      this.logger.error('Failed to get all entities', error as Error);
      throw error;
    }
  }

  /**
   * Get licenses for an entity
   */
  async getLicensesByEntity(entityId: string): Promise<License[]> {
    try {
      const licenses = await this.loadLicenses();
      const entityLicenses = licenses.filter((l) => l.entityId === entityId);

      this.logger.debug(`Retrieved ${entityLicenses.length} licenses for entity: ${entityId}`);
      return entityLicenses;
    } catch (error) {
      this.logger.error(`Failed to get licenses for entity: ${entityId}`, error as Error);
      throw error;
    }
  }

  /**
   * Get license by ID
   */
  async getLicense(licenseId: string): Promise<License | null> {
    try {
      const licenses = await this.loadLicenses();
      const license = licenses.find((l) => l.licenseId === licenseId);

      if (!license) {
        this.logger.warn(`License not found: ${licenseId}`);
        return null;
      }

      this.logger.debug(`Retrieved license: ${licenseId}`, { license });
      return license;
    } catch (error) {
      this.logger.error(`Failed to get license: ${licenseId}`, error as Error);
      throw error;
    }
  }

  /**
   * Get expiring licenses (within specified days)
   */
  async getExpiringLicenses(withinDays: number): Promise<License[]> {
    try {
      const licenses = await this.loadLicenses();
      const now = new Date();
      const thresholdDate = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

      const expiringLicenses = licenses.filter((license) => {
        const expiryDate = new Date(license.expiryDate);
        return (
          license.status === 'active' &&
          expiryDate > now &&
          expiryDate <= thresholdDate
        );
      });

      this.logger.info(
        `Found ${expiringLicenses.length} licenses expiring within ${withinDays} days`
      );
      return expiringLicenses;
    } catch (error) {
      this.logger.error(`Failed to get expiring licenses`, error as Error);
      throw error;
    }
  }

  /**
   * Get entity status with licenses
   */
  async getEntityStatus(entityId: string): Promise<EntityStatus | null> {
    try {
      const entity = await this.getEntity(entityId);
      if (!entity) {
        return null;
      }

      const licenses = await this.getLicensesByEntity(entityId);
      const now = new Date();

      const licenseStatuses: LicenseStatus[] = licenses.map((license) => {
        const expiryDate = new Date(license.expiryDate);
        const daysUntilExpiry = Math.floor(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          licenseId: license.licenseId,
          licenseName: license.licenseName,
          licenseType: license.licenseType,
          status: license.status,
          issueDate: license.issueDate,
          expiryDate: license.expiryDate,
          daysUntilExpiry,
          renewalRequired: daysUntilExpiry <= 30 && license.status === 'active',
        };
      });

      // Calculate compliance score (simplified)
      const activeLicenses = licenseStatuses.filter((l) => l.status === 'active').length;
      const totalLicenses = licenseStatuses.length;
      const complianceScore = totalLicenses > 0 ? (activeLicenses / totalLicenses) * 100 : 100;

      const entityStatus: EntityStatus = {
        entityId: entity.entityId,
        entityName: entity.entityName,
        entityType: entity.entityType,
        workflows: [], // Populated by workflow service
        licenses: licenseStatuses,
        complianceScore: Math.round(complianceScore),
        lastAudit: new Date().toISOString(),
        nextRenewal: licenseStatuses.find((l) => l.renewalRequired)?.expiryDate,
      };

      this.logger.info(`Generated entity status for: ${entityId}`, { complianceScore });
      return entityStatus;
    } catch (error) {
      this.logger.error(`Failed to get entity status: ${entityId}`, error as Error);
      throw error;
    }
  }

  /**
   * Load entities from storage
   */
  private async loadEntities(): Promise<Entity[]> {
    try {
      const data = await fs.readFile(this.entitiesPath, 'utf-8');
      if (!data || data.trim() === '') {
        return [];
      }
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      this.logger.error('Failed to load entities', error as Error);
      return [];
    }
  }

  /**
   * Load licenses from storage
   */
  private async loadLicenses(): Promise<License[]> {
    try {
      const data = await fs.readFile(this.licensesPath, 'utf-8');
      if (!data || data.trim() === '') {
        return [];
      }
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      this.logger.error('Failed to load licenses', error as Error);
      return [];
    }
  }

  /**
   * Save entity
   */
  async saveEntity(entity: Entity): Promise<void> {
    try {
      const entities = await this.loadEntities();
      const index = entities.findIndex((e) => e.entityId === entity.entityId);

      if (index >= 0) {
        entities[index] = entity;
      } else {
        entities.push(entity);
      }

      await fs.writeFile(this.entitiesPath, JSON.stringify(entities, null, 2));
      this.logger.info(`Saved entity: ${entity.entityId}`);
    } catch (error) {
      this.logger.error(`Failed to save entity: ${entity.entityId}`, error as Error);
      throw error;
    }
  }

  /**
   * Save license
   */
  async saveLicense(license: License): Promise<void> {
    try {
      const licenses = await this.loadLicenses();
      const index = licenses.findIndex((l) => l.licenseId === license.licenseId);

      if (index >= 0) {
        licenses[index] = license;
      } else {
        licenses.push(license);
      }

      await fs.writeFile(this.licensesPath, JSON.stringify(licenses, null, 2));
      this.logger.info(`Saved license: ${license.licenseId}`);
    } catch (error) {
      this.logger.error(`Failed to save license: ${license.licenseId}`, error as Error);
      throw error;
    }
  }
}

export default FactBoxService;
