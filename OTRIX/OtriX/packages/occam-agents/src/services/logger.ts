/**
 * Logger Configuration
 * Winston-based structured logging for OCCAM Compliance Engine
 */

import * as winston from 'winston';
import { OCCAMConfig } from '../types';

/**
 * Creates and configures a Winston logger instance
 */
export function createLogger(config?: Partial<OCCAMConfig['logging']>): winston.Logger {
  const logLevel = config?.level || process.env.LOG_LEVEL || 'info';
  const logFormat = config?.format || process.env.LOG_FORMAT || 'json';

  const formats = [
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
  ];

  if (logFormat === 'json') {
    formats.push(winston.format.json());
  } else {
    formats.push(
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    );
  }

  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(...formats),
    defaultMeta: { service: 'occam-compliance-engine' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      }),
      // In production, add file transports
      // new winston.transports.File({ filename: 'error.log', level: 'error' }),
      // new winston.transports.File({ filename: 'combined.log' }),
    ],
  });

  return logger;
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Log with trace ID
 */
export function logWithTrace(
  logger: winston.Logger,
  level: string,
  message: string,
  traceId: string,
  meta?: Record<string, any>
): void {
  logger.log(level, message, { trace_id: traceId, ...meta });
}

/**
 * Logger class wrapper for OCCAM services
 */
export class Logger {
  private logger: winston.Logger;
  private traceId: string;

  constructor(config?: Partial<OCCAMConfig['logging']>) {
    this.logger = createLogger(config);
    this.traceId = this.generateTraceId();
  }

  info(message: string, meta?: Record<string, any>): void {
    this.logger.info(message, { trace_id: this.traceId, ...meta });
  }

  error(message: string, error?: Error, meta?: Record<string, any>): void {
    this.logger.error(message, { trace_id: this.traceId, error: error?.message, stack: error?.stack, ...meta });
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.logger.warn(message, { trace_id: this.traceId, ...meta });
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.logger.debug(message, { trace_id: this.traceId, ...meta });
  }

  getTraceId(): string {
    return this.traceId;
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
