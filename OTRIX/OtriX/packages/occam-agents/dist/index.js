"use strict";
/**
 * OCCAM Agents - Intelligent Compliance Agents
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
exports.VERSION = exports.FactBoxService = exports.AuditService = exports.workflowOrchestrator = exports.WorkflowOrchestrator = exports.OCCAMStatusAgent = exports.OCCAMAccountAgent = exports.OCCAMPaymentAgent = exports.OCCAMFormAgent = exports.OCCAMConsultancyAgent = exports.OCCAMComplianceAgent = void 0;
// Export agent registry
__exportStar(require("./agent-registry"), exports);
// Export all 6 OCCAM agents
var occam_compliance_agent_1 = require("./agents/occam-compliance-agent");
Object.defineProperty(exports, "OCCAMComplianceAgent", { enumerable: true, get: function () { return occam_compliance_agent_1.OCCAMComplianceAgent; } });
var occam_consultancy_agent_1 = require("./agents/occam-consultancy-agent");
Object.defineProperty(exports, "OCCAMConsultancyAgent", { enumerable: true, get: function () { return occam_consultancy_agent_1.OCCAMConsultancyAgent; } });
var occam_form_agent_1 = require("./agents/occam-form-agent");
Object.defineProperty(exports, "OCCAMFormAgent", { enumerable: true, get: function () { return occam_form_agent_1.OCCAMFormAgent; } });
var occam_payment_agent_1 = require("./agents/occam-payment-agent");
Object.defineProperty(exports, "OCCAMPaymentAgent", { enumerable: true, get: function () { return occam_payment_agent_1.OCCAMPaymentAgent; } });
var occam_account_agent_1 = require("./agents/occam-account-agent");
Object.defineProperty(exports, "OCCAMAccountAgent", { enumerable: true, get: function () { return occam_account_agent_1.OCCAMAccountAgent; } });
var occam_status_agent_1 = require("./agents/occam-status-agent");
Object.defineProperty(exports, "OCCAMStatusAgent", { enumerable: true, get: function () { return occam_status_agent_1.OCCAMStatusAgent; } });
// Export workflow orchestrator
var workflow_orchestrator_1 = require("./workflow-orchestrator");
Object.defineProperty(exports, "WorkflowOrchestrator", { enumerable: true, get: function () { return workflow_orchestrator_1.WorkflowOrchestrator; } });
Object.defineProperty(exports, "workflowOrchestrator", { enumerable: true, get: function () { return workflow_orchestrator_1.workflowOrchestrator; } });
// Export services
var audit_service_1 = require("./services/audit.service");
Object.defineProperty(exports, "AuditService", { enumerable: true, get: function () { return audit_service_1.AuditService; } });
var FactBoxService_1 = require("./services/FactBoxService");
Object.defineProperty(exports, "FactBoxService", { enumerable: true, get: function () { return FactBoxService_1.FactBoxService; } });
// Export types
__exportStar(require("./types"), exports);
exports.VERSION = '1.0.0';
//# sourceMappingURL=index.js.map