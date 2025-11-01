/**
 * FactBox Service
 * Manages entity data, licensing information, and regulatory compliance data
 */
import { Logger } from '../utils/logger';
import { EntityStatus } from '../types';
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
export declare class FactBoxService {
    private logger;
    private storagePath;
    private entitiesPath;
    private licensesPath;
    constructor(logger?: Logger);
    /**
     * Initialize storage directories
     */
    initialize(): Promise<void>;
    /**
     * Get entity by ID
     */
    getEntity(entityId: string): Promise<Entity | null>;
    /**
     * Get all entities
     */
    getAllEntities(): Promise<Entity[]>;
    /**
     * Get licenses for an entity
     */
    getLicensesByEntity(entityId: string): Promise<License[]>;
    /**
     * Get license by ID
     */
    getLicense(licenseId: string): Promise<License | null>;
    /**
     * Get expiring licenses (within specified days)
     */
    getExpiringLicenses(withinDays: number): Promise<License[]>;
    /**
     * Get entity status with licenses
     */
    getEntityStatus(entityId: string): Promise<EntityStatus | null>;
    /**
     * Load entities from storage
     */
    private loadEntities;
    /**
     * Load licenses from storage
     */
    private loadLicenses;
    /**
     * Save entity
     */
    saveEntity(entity: Entity): Promise<void>;
    /**
     * Save license
     */
    saveLicense(license: License): Promise<void>;
}
export default FactBoxService;
//# sourceMappingURL=factbox.service.d.ts.map