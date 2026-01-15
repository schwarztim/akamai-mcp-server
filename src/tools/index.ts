/**
 * Tools Index
 *
 * Central export for all high-level Akamai MCP tools.
 */

export { getPropertyTools } from './property-tools.js';
export { getSecurityTools } from './security-tools.js';
export { getCacheTools } from './cache-tools.js';
export { getDnsTools } from './dns-tools.js';
export { getDiagnosticTools } from './diagnostic-tools.js';
export { getWorkflowTools } from './workflow-tools.js';
export { getReportingTools } from './reporting-tools.js';
export { getCertificateTools } from './certificate-tools.js';
export { getAccountTools } from './account-tools.js';
export { getDnssecTools } from './dnssec-tools.js';

// Re-export aggregation tools (already exists)
export { getAggregationTools } from '../aggregation/aggregation-tools.js';

import type { MCPToolDefinition, ToolHandler } from '../generator/tool-generator.js';
import { getPropertyTools } from './property-tools.js';
import { getSecurityTools } from './security-tools.js';
import { getCacheTools } from './cache-tools.js';
import { getDnsTools } from './dns-tools.js';
import { getDiagnosticTools } from './diagnostic-tools.js';
import { getWorkflowTools } from './workflow-tools.js';
import { getReportingTools } from './reporting-tools.js';
import { getCertificateTools } from './certificate-tools.js';
import { getAccountTools } from './account-tools.js';
import { getDnssecTools } from './dnssec-tools.js';
import { getAggregationTools } from '../aggregation/aggregation-tools.js';

/**
 * Get all high-level tools
 */
export function getAllTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    ...getAggregationTools(),
    ...getPropertyTools(),
    ...getSecurityTools(),
    ...getCacheTools(),
    ...getDnsTools(),
    ...getDiagnosticTools(),
    ...getWorkflowTools(),
    ...getReportingTools(),
    ...getCertificateTools(),
    ...getAccountTools(),
    ...getDnssecTools(),
  ];
}
