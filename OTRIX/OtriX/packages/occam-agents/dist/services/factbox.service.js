"use strict";
/**
 * FactBox Service
 * Manages entity data, licensing information, and regulatory compliance data
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FactBoxService = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
/**
 * FactBoxService - Entity and License Data Management
 */
class FactBoxService {
    constructor(logger) {
        this.logger = logger || new logger_1.Logger();
        this.storagePath = path.join(process.cwd(), 'storage', 'factbox');
        this.entitiesPath = path.join(this.storagePath, 'entities.json');
        this.licensesPath = path.join(this.storagePath, 'licenses.json');
    }
    /**
     * Initialize storage directories
     */
    async initialize() {
        try {
            await fs.mkdir(this.storagePath, { recursive: true });
            // Initialize empty files if they don't exist
            try {
                await fs.access(this.entitiesPath);
            }
            catch {
                await fs.writeFile(this.entitiesPath, JSON.stringify([], null, 2));
            }
            try {
                await fs.access(this.licensesPath);
            }
            catch {
                await fs.writeFile(this.licensesPath, JSON.stringify([], null, 2));
            }
            this.logger.info('FactBoxService initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize FactBoxService', error);
            throw error;
        }
    }
    /**
     * Get entity by ID
     */
    async getEntity(entityId) {
        try {
            const entities = await this.loadEntities();
            const entity = entities.find((e) => e.entityId === entityId);
            if (!entity) {
                this.logger.warn(`Entity not found: ${entityId}`);
                return null;
            }
            this.logger.debug(`Retrieved entity: ${entityId}`, { entity });
            return entity;
        }
        catch (error) {
            this.logger.error(`Failed to get entity: ${entityId}`, error);
            throw error;
        }
    }
    /**
     * Get all entities
     */
    async getAllEntities() {
        try {
            const entities = await this.loadEntities();
            this.logger.debug(`Retrieved ${entities.length} entities`);
            return entities;
        }
        catch (error) {
            this.logger.error('Failed to get all entities', error);
            throw error;
        }
    }
    /**
     * Get licenses for an entity
     */
    async getLicensesByEntity(entityId) {
        try {
            const licenses = await this.loadLicenses();
            const entityLicenses = licenses.filter((l) => l.entityId === entityId);
            this.logger.debug(`Retrieved ${entityLicenses.length} licenses for entity: ${entityId}`);
            return entityLicenses;
        }
        catch (error) {
            this.logger.error(`Failed to get licenses for entity: ${entityId}`, error);
            throw error;
        }
    }
    /**
     * Get license by ID
     */
    async getLicense(licenseId) {
        try {
            const licenses = await this.loadLicenses();
            const license = licenses.find((l) => l.licenseId === licenseId);
            if (!license) {
                this.logger.warn(`License not found: ${licenseId}`);
                return null;
            }
            this.logger.debug(`Retrieved license: ${licenseId}`, { license });
            return license;
        }
        catch (error) {
            this.logger.error(`Failed to get license: ${licenseId}`, error);
            throw error;
        }
    }
    /**
     * Get expiring licenses (within specified days)
     */
    async getExpiringLicenses(withinDays) {
        try {
            const licenses = await this.loadLicenses();
            const now = new Date();
            const thresholdDate = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
            const expiringLicenses = licenses.filter((license) => {
                const expiryDate = new Date(license.expiryDate);
                return (license.status === 'active' &&
                    expiryDate > now &&
                    expiryDate <= thresholdDate);
            });
            this.logger.info(`Found ${expiringLicenses.length} licenses expiring within ${withinDays} days`);
            return expiringLicenses;
        }
        catch (error) {
            this.logger.error(`Failed to get expiring licenses`, error);
            throw error;
        }
    }
    /**
     * Get entity status with licenses
     */
    async getEntityStatus(entityId) {
        try {
            const entity = await this.getEntity(entityId);
            if (!entity) {
                return null;
            }
            const licenses = await this.getLicensesByEntity(entityId);
            const now = new Date();
            const licenseStatuses = licenses.map((license) => {
                const expiryDate = new Date(license.expiryDate);
                const daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
            const entityStatus = {
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
        }
        catch (error) {
            this.logger.error(`Failed to get entity status: ${entityId}`, error);
            throw error;
        }
    }
    /**
     * Load entities from storage
     */
    async loadEntities() {
        try {
            const data = await fs.readFile(this.entitiesPath, 'utf-8');
            if (!data || data.trim() === '') {
                return [];
            }
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch (error) {
            this.logger.error('Failed to load entities', error);
            return [];
        }
    }
    /**
     * Load licenses from storage
     */
    async loadLicenses() {
        try {
            const data = await fs.readFile(this.licensesPath, 'utf-8');
            if (!data || data.trim() === '') {
                return [];
            }
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch (error) {
            this.logger.error('Failed to load licenses', error);
            return [];
        }
    }
    /**
     * Save entity
     */
    async saveEntity(entity) {
        try {
            const entities = await this.loadEntities();
            const index = entities.findIndex((e) => e.entityId === entity.entityId);
            if (index >= 0) {
                entities[index] = entity;
            }
            else {
                entities.push(entity);
            }
            await fs.writeFile(this.entitiesPath, JSON.stringify(entities, null, 2));
            this.logger.info(`Saved entity: ${entity.entityId}`);
        }
        catch (error) {
            this.logger.error(`Failed to save entity: ${entity.entityId}`, error);
            throw error;
        }
    }
    /**
     * Save license
     */
    async saveLicense(license) {
        try {
            const licenses = await this.loadLicenses();
            const index = licenses.findIndex((l) => l.licenseId === license.licenseId);
            if (index >= 0) {
                licenses[index] = license;
            }
            else {
                licenses.push(license);
            }
            await fs.writeFile(this.licensesPath, JSON.stringify(licenses, null, 2));
            this.logger.info(`Saved license: ${license.licenseId}`);
        }
        catch (error) {
            this.logger.error(`Failed to save license: ${license.licenseId}`, error);
            throw error;
        }
    }
}
exports.FactBoxService = FactBoxService;
exports.default = FactBoxService;
//# sourceMappingURL=factbox.service.js.map