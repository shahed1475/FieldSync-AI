"use strict";
/**
 * OCCAM Core - Policy, SOP, and Compliance Framework
 * Phase 0: Foundation Setup
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VERSION = exports.telemetryLogger = exports.logDecision = void 0;
__exportStar(require("./types"), exports);
__exportStar(require("./telemetry"), exports);
var telemetry_1 = require("./telemetry");
Object.defineProperty(exports, "logDecision", { enumerable: true, get: function () { return telemetry_1.logDecision; } });
Object.defineProperty(exports, "telemetryLogger", { enumerable: true, get: function () { return telemetry_1.telemetryLogger; } });
exports.VERSION = '1.0.0';
//# sourceMappingURL=index.js.map