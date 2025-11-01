"use strict";
/**
 * Logger Configuration
 * Winston-based structured logging for OCCAM Compliance Engine
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
exports.logger = void 0;
exports.createLogger = createLogger;
exports.logWithTrace = logWithTrace;
const winston = __importStar(require("winston"));
/**
 * Creates and configures a Winston logger instance
 */
function createLogger(config) {
    const logLevel = config?.level || process.env.LOG_LEVEL || 'info';
    const logFormat = config?.format || process.env.LOG_FORMAT || 'json';
    const formats = [
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
    ];
    if (logFormat === 'json') {
        formats.push(winston.format.json());
    }
    else {
        formats.push(winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
        }));
    }
    const logger = winston.createLogger({
        level: logLevel,
        format: winston.format.combine(...formats),
        defaultMeta: { service: 'occam-compliance-engine' },
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
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
exports.logger = createLogger();
/**
 * Log with trace ID
 */
function logWithTrace(logger, level, message, traceId, meta) {
    logger.log(level, message, { trace_id: traceId, ...meta });
}
//# sourceMappingURL=logger.js.map