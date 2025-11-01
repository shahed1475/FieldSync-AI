/**
 * Logger Configuration
 * Winston-based structured logging for OCCAM Compliance Engine
 */
import * as winston from 'winston';
import { OCCAMConfig } from '../types';
/**
 * Creates and configures a Winston logger instance
 */
export declare function createLogger(config?: Partial<OCCAMConfig['logging']>): winston.Logger;
/**
 * Default logger instance
 */
export declare const logger: winston.Logger;
/**
 * Log with trace ID
 */
export declare function logWithTrace(logger: winston.Logger, level: string, message: string, traceId: string, meta?: Record<string, any>): void;
//# sourceMappingURL=logger.d.ts.map