/**
 * Raw Request Tool
 *
 * Generic tool that can call any operation by registry ID.
 * Useful for debugging and advanced use cases.
 */

import { getOperationRegistry } from '../registry/operation-registry.js';
import { getUniversalExecutor, type ExecutionOptions } from '../executor/universal-executor.js';
import { getLogger } from '../utils/logger.js';
import type { MCPToolDefinition, ToolHandler } from './tool-generator.js';

/**
 * Get raw request tool definition
 */
export function getRawRequestTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_raw_request',
    description: `Execute any Akamai API operation by tool name. This is a low-level tool for advanced usage and debugging.

Usage:
1. Use akamai_list_operations to find available operations
2. Call this tool with the operation's toolName and required parameters

Example:
{
  "toolName": "akamai_papi_listProperties",
  "pathParams": {},
  "queryParams": { "contractId": "ctr_123" },
  "body": null
}

Parameters:
- toolName: The exact tool name from the registry
- pathParams: Object with path parameter values
- queryParams: Object with query parameter values
- headers: Object with header values
- body: Request body (for POST/PUT/PATCH)
- paginate: Enable automatic pagination (boolean)
- maxPages: Maximum pages to fetch when paginating (number)`,
    inputSchema: {
      type: 'object',
      properties: {
        toolName: {
          type: 'string',
          description: 'The tool name of the operation to execute (e.g., akamai_papi_listProperties)',
        },
        pathParams: {
          type: 'object',
          description: 'Path parameter values',
          additionalProperties: true,
        },
        queryParams: {
          type: 'object',
          description: 'Query parameter values',
          additionalProperties: true,
        },
        headers: {
          type: 'object',
          description: 'HTTP headers',
          additionalProperties: { type: 'string' },
        },
        body: {
          description: 'Request body (for POST/PUT/PATCH operations)',
        },
        paginate: {
          type: 'boolean',
          description: 'Enable automatic pagination',
        },
        maxPages: {
          type: 'number',
          description: 'Maximum number of pages to fetch',
        },
      },
      required: ['toolName'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const toolName = args.toolName as string;

      if (!toolName) {
        throw new Error('toolName is required');
      }

      // Get operation from registry
      const registry = await getOperationRegistry();
      const operation = registry.getOperation(toolName);

      if (!operation) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: `Operation not found: ${toolName}`,
                  hint: 'Use akamai_list_operations to see available operations',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Build execution options
      const options: ExecutionOptions = {
        pathParams: (args.pathParams as Record<string, string | number>) || {},
        queryParams: (args.queryParams as Record<string, string | number | boolean>) || {},
        headers: (args.headers as Record<string, string>) || {},
        body: args.body,
        paginate: args.paginate as boolean,
        maxPages: args.maxPages as number,
      };

      // Execute
      const executor = getUniversalExecutor();
      const result = await executor.execute(operation, options);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                operation: {
                  toolName: operation.toolName,
                  method: operation.method,
                  path: operation.path,
                  product: operation.product,
                },
                result: {
                  status: result.status,
                  requestId: result.requestId,
                  paginated: result.paginated,
                  pageCount: result.pageCount,
                  totalItems: result.totalItems,
                  data: result.body,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Raw request execution failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: true,
                message: error.message,
                status: error.status,
                requestId: error.requestId,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  };

  return { definition, handler };
}

/**
 * Get list operations tool
 */
export function getListOperationsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_list_operations',
    description: `List all available Akamai API operations in the registry.

This tool helps you discover what operations are available and their tool names.
You can filter by product, method, or search by keyword.

Filters:
- product: Filter by API product (e.g., "papi", "ccu", "edgeworkers")
- method: Filter by HTTP method (GET, POST, PUT, DELETE, PATCH)
- query: Text search in operation summary/description
- paginatable: Filter operations that support pagination`,
    inputSchema: {
      type: 'object',
      properties: {
        product: {
          type: 'string',
          description: 'Filter by product name (e.g., papi, ccu, edgeworkers)',
        },
        method: {
          type: 'string',
          description: 'Filter by HTTP method',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        },
        query: {
          type: 'string',
          description: 'Search text in operation summary/description',
        },
        paginatable: {
          type: 'boolean',
          description: 'Filter operations that support pagination',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 50)',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const registry = await getOperationRegistry();

      // Search with filters
      const results = registry.search({
        product: args.product as string,
        method: args.method as string,
        query: args.query as string,
        paginatable: args.paginatable as boolean,
      });

      // Limit results
      const limit = Math.min((args.limit as number) || 50, 500);
      const limited = results.slice(0, limit);

      // Format results
      const formatted = limited.map(op => ({
        toolName: op.toolName,
        summary: op.summary,
        method: op.method,
        path: op.path,
        product: op.product,
        version: op.version,
        paginatable: op.supportsPagination,
        tags: op.tags,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: results.length,
                showing: limited.length,
                operations: formatted,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('List operations failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: true,
                message: error.message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  };

  return { definition, handler };
}

/**
 * Get registry stats tool
 */
export function getRegistryStatsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_registry_stats',
    description: `Get statistics about the operation registry.

Shows:
- Total number of operations
- Number of API specs loaded
- Operations by product
- Operations by HTTP method
- Pagination support statistics`,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async () => {
    const logger = getLogger();

    try {
      const registry = await getOperationRegistry();
      const stats = registry.getStats();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Get registry stats failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: true,
                message: error.message,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  };

  return { definition, handler };
}
