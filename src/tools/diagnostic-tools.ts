/**
 * Diagnostic Tools
 *
 * Tools for troubleshooting and diagnosing Akamai configurations.
 * Edge Diagnostics, connectivity tests, and URL analysis.
 */

import { getOperationRegistry } from '../registry/operation-registry.js';
import { getUniversalExecutor } from '../executor/universal-executor.js';
import { getLogger } from '../utils/logger.js';
import type { MCPToolDefinition, ToolHandler } from '../generator/tool-generator.js';

async function executeOperation(
  toolName: string,
  pathParams: Record<string, string | number> = {},
  queryParams: Record<string, string | number | boolean> = {},
  body?: any
): Promise<any> {
  const registry = await getOperationRegistry();
  const operation = registry.getOperation(toolName);
  if (!operation) throw new Error(`Operation not found: ${toolName}`);

  const executor = getUniversalExecutor();
  const result = await executor.execute(operation, {
    pathParams,
    queryParams,
    body,
  });

  return result.body;
}

/**
 * Diagnose URL - Comprehensive URL analysis
 */
export function getDiagnoseUrlTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_diagnose_url',
    description: `Run comprehensive diagnostics on a URL through Akamai.

Analyzes:
- Edge server response
- Cache status
- Response headers
- Origin connectivity
- Certificate status

Example: "Diagnose https://www.example.com/page.html"`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to diagnose (full URL with protocol)',
        },
        edgeLocationId: {
          type: 'string',
          description: 'Specific edge location (optional)',
        },
        requestHeaders: {
          type: 'object',
          description: 'Custom request headers',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const url = args.url as string;
      const edgeLocationId = args.edgeLocationId as string;
      const requestHeaders = args.requestHeaders as Record<string, string>;

      logger.info(`Diagnosing URL: ${url}`);

      // Run URL health check
      const requestBody: any = {
        url,
        ...(edgeLocationId && { edgeLocationId }),
        ...(requestHeaders && { requestHeaders: Object.entries(requestHeaders).map(([name, value]) => ({ name, value })) }),
      };

      const result = await executeOperation(
        'akamai_edge_diagnostics_post-url-health-check',
        {},
        {},
        requestBody
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                url,
                requestId: result?.requestId,
                link: result?.link,
                retryAfter: result?.retryAfter,
                note: 'Diagnostic request submitted. Results may take a few seconds.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to diagnose URL', { error });
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: true, message: error.message }, null, 2) },
        ],
      };
    }
  };

  return { definition, handler };
}

/**
 * Edge Locations - List available edge locations
 */
export function getEdgeLocationsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_edge_locations',
    description: `List available Akamai edge server locations.

Useful for targeted diagnostics and understanding geographic coverage.

Example: "Show me edge locations in Europe"`,
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search by location name or region',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const search = (args.search as string)?.toLowerCase();

      logger.info('Fetching edge locations');

      const result = await executeOperation('akamai_edge_diagnostics_get-edge-locations');

      let locations = result?.edgeLocations || [];

      if (search) {
        locations = locations.filter(
          (loc: any) =>
            loc.id?.toLowerCase().includes(search) ||
            loc.value?.toLowerCase().includes(search)
        );
      }

      // Group by region
      const byRegion = locations.reduce((acc: any, loc: any) => {
        const region = loc.id?.split('-')[0] || 'Unknown';
        if (!acc[region]) acc[region] = [];
        acc[region].push(loc);
        return acc;
      }, {});

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                totalLocations: locations.length,
                byRegion,
                locations: locations.slice(0, 50),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to get edge locations', { error });
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: true, message: error.message }, null, 2) },
        ],
      };
    }
  };

  return { definition, handler };
}

/**
 * Connectivity Test - Test origin connectivity
 */
export function getConnectivityTestTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_connectivity_test',
    description: `Test connectivity from Akamai edge to your origin server.

Verifies that Akamai can reach your origin and measures latency.

Example: "Test connectivity to origin server origin.example.com"`,
    inputSchema: {
      type: 'object',
      properties: {
        hostname: {
          type: 'string',
          description: 'Origin hostname to test',
        },
        port: {
          type: 'number',
          description: 'Port to test (default: 443)',
          default: 443,
        },
        edgeLocationId: {
          type: 'string',
          description: 'Edge location to test from',
        },
      },
      required: ['hostname'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const hostname = args.hostname as string;
      const port = (args.port as number) || 443;
      const edgeLocationId = args.edgeLocationId as string;

      logger.info(`Testing connectivity to ${hostname}:${port}`);

      const requestBody: any = {
        hostname,
        port,
        ...(edgeLocationId && { edgeLocationId }),
      };

      const result = await executeOperation(
        'akamai_edge_diagnostics_post-connectivity-problems',
        {},
        {},
        requestBody
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                hostname,
                port,
                requestId: result?.requestId,
                link: result?.link,
                note: 'Connectivity test initiated. Results may take a few seconds.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed connectivity test', { error });
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: true, message: error.message }, null, 2) },
        ],
      };
    }
  };

  return { definition, handler };
}

/**
 * Translate Error Code
 */
export function getTranslateErrorTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_translate_error',
    description: `Translate Akamai error codes and reference numbers.

When you see an error page with a reference code, use this to understand what happened.

Example: "What does Akamai error reference 12.abc123.1234567890.abcdef mean?"`,
    inputSchema: {
      type: 'object',
      properties: {
        errorCode: {
          type: 'string',
          description: 'Akamai error/reference code',
        },
      },
      required: ['errorCode'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const errorCode = args.errorCode as string;

      logger.info(`Translating error code: ${errorCode}`);

      const result = await executeOperation(
        'akamai_edge_diagnostics_post-error-translator',
        {},
        {},
        { errorCode }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                errorCode,
                requestId: result?.requestId,
                link: result?.link,
                translation: result?.translatedError,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to translate error', { error });
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: true, message: error.message }, null, 2) },
        ],
      };
    }
  };

  return { definition, handler };
}

/**
 * Debug URL from Edge
 */
export function getEdgeCurlTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_curl_from_edge',
    description: `Execute a curl-like request from an Akamai edge server.

See exactly what the edge server receives when fetching your content.

Example: "Curl https://www.example.com from the London edge"`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to request',
        },
        edgeLocationId: {
          type: 'string',
          description: 'Edge location to request from',
        },
        method: {
          type: 'string',
          enum: ['GET', 'HEAD'],
          description: 'HTTP method',
          default: 'GET',
        },
        headers: {
          type: 'object',
          description: 'Custom headers to include',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const url = args.url as string;
      const edgeLocationId = args.edgeLocationId as string;
      const method = (args.method as string) || 'GET';
      const headers = args.headers as Record<string, string>;

      logger.info(`Curl from edge: ${method} ${url}`);

      const requestBody: any = {
        url,
        ...(edgeLocationId && { edgeLocationId }),
        ...(headers && {
          requestHeaders: Object.entries(headers).map(([name, value]) => ({ name, value })),
        }),
      };

      const result = await executeOperation(
        'akamai_edge_diagnostics_post-curl',
        {},
        {},
        requestBody
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                request: { url, method, edgeLocationId },
                requestId: result?.requestId,
                link: result?.link,
                note: 'Curl request initiated. Results may take a few seconds.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed edge curl', { error });
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: true, message: error.message }, null, 2) },
        ],
      };
    }
  };

  return { definition, handler };
}

/**
 * Get all diagnostic tools
 */
export function getDiagnosticTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getDiagnoseUrlTool(),
    getEdgeLocationsTool(),
    getConnectivityTestTool(),
    getTranslateErrorTool(),
    getEdgeCurlTool(),
  ];
}
