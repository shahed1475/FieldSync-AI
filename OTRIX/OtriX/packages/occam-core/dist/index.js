"use strict";
/**
 * OCCAM Core Package
 * Phase 9: Orchestrator Hardening
 *
 * Exports telemetry, audit types, and core services
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.exposeMetrics = exports.logDecision = exports.telemetryService = exports.TelemetryService = void 0;
// Export telemetry
var telemetry_1 = require("./telemetry/telemetry");
Object.defineProperty(exports, "TelemetryService", { enumerable: true, get: function () { return telemetry_1.TelemetryService; } });
Object.defineProperty(exports, "telemetryService", { enumerable: true, get: function () { return telemetry_1.telemetryService; } });
Object.defineProperty(exports, "logDecision", { enumerable: true, get: function () { return telemetry_1.logDecision; } });
Object.defineProperty(exports, "exposeMetrics", { enumerable: true, get: function () { return telemetry_1.exposeMetrics; } });
const telemetry_2 = require("./telemetry/telemetry");
exports.default = {
    TelemetryService: telemetry_2.TelemetryService,
    telemetryService: telemetry_2.telemetryService
};
