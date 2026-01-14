import { getEdgeGridClient } from '../auth/edgegrid-client.js';
import { ToolDefinition, ToolHandler, formatSuccess, formatError } from './types.js';

/**
 * Health check handler
 */
export const healthCheckHandler: ToolHandler = async () => {
  try {
    const client = getEdgeGridClient();
    const result = await client.healthCheck();

    return formatSuccess(result);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Tool definition for health check
 */
export const healthTools: ToolDefinition[] = [
  {
    name: 'akamai_health_check',
    description:
      'Test connectivity and authentication with Akamai API. Verifies that credentials are valid and the API is accessible.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
