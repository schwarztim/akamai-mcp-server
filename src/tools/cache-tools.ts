/**
 * Cache Management Tools
 *
 * Tools for Akamai cache purge and invalidation.
 * Fast Purge (CCU) and ECCU operations.
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
 * Purge URLs - Fast Purge by URL
 */
export function getPurgeUrlsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_purge_urls',
    description: `Purge specific URLs from Akamai cache.

Fast Purge typically completes within seconds. Use 'invalidate' for soft purge
(returns stale content if origin fails) or 'delete' for hard purge.

Example: "Purge https://www.example.com/page.html from cache"`,
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'URLs to purge (include full URL with protocol)',
        },
        action: {
          type: 'string',
          enum: ['invalidate', 'delete'],
          description: 'Purge action (invalidate=soft, delete=hard)',
          default: 'invalidate',
        },
        network: {
          type: 'string',
          enum: ['staging', 'production'],
          description: 'Network to purge from',
          default: 'production',
        },
      },
      required: ['urls'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const urls = args.urls as string[];
      const action = (args.action as string) || 'invalidate';
      const network = (args.network as string) || 'production';

      if (!urls || urls.length === 0) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: 'No URLs provided' }, null, 2) },
          ],
        };
      }

      logger.info(`Purging ${urls.length} URLs via ${action} on ${network}`);

      // Determine the correct operation based on action
      const operationName = action === 'delete'
        ? 'akamai_ccu_post-delete-url'
        : 'akamai_ccu_post-invalidate-url';

      const result = await executeOperation(
        operationName,
        { network },
        {},
        { objects: urls }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                action,
                network,
                urlCount: urls.length,
                purgeId: result?.purgeId,
                estimatedSeconds: result?.estimatedSeconds || 5,
                supportId: result?.supportId,
                httpStatus: result?.httpStatus,
                detail: result?.detail || 'Request accepted',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to purge URLs', { error });
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
 * Purge by Cache Tag
 */
export function getPurgeTagsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_purge_tags',
    description: `Purge cache by cache tags (surrogate keys).

Cache tags allow you to purge groups of related content at once.
Much more efficient than purging individual URLs.

Example: "Purge all content with tag 'product-123'"`,
    inputSchema: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Cache tags to purge',
        },
        action: {
          type: 'string',
          enum: ['invalidate', 'delete'],
          description: 'Purge action',
          default: 'invalidate',
        },
        network: {
          type: 'string',
          enum: ['staging', 'production'],
          description: 'Network to purge from',
          default: 'production',
        },
      },
      required: ['tags'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const tags = args.tags as string[];
      const action = (args.action as string) || 'invalidate';
      const network = (args.network as string) || 'production';

      if (!tags || tags.length === 0) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: 'No tags provided' }, null, 2) },
          ],
        };
      }

      logger.info(`Purging ${tags.length} cache tags via ${action} on ${network}`);

      const operationName = action === 'delete'
        ? 'akamai_ccu_post-delete-tag'
        : 'akamai_ccu_post-invalidate-tag';

      const result = await executeOperation(
        operationName,
        { network },
        {},
        { objects: tags }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                action,
                network,
                tagCount: tags.length,
                purgeId: result?.purgeId,
                estimatedSeconds: result?.estimatedSeconds || 5,
                supportId: result?.supportId,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to purge tags', { error });
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
 * Purge by CP Code
 */
export function getPurgeCpCodeTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_purge_cpcode',
    description: `Purge all content under a CP code.

Use this for broad purges when you need to clear everything for a specific
content provider code. This is a nuclear option - use carefully.

Example: "Purge all content for CP code 123456"`,
    inputSchema: {
      type: 'object',
      properties: {
        cpCodes: {
          type: 'array',
          items: { type: 'number' },
          description: 'CP codes to purge',
        },
        action: {
          type: 'string',
          enum: ['invalidate', 'delete'],
          description: 'Purge action',
          default: 'invalidate',
        },
        network: {
          type: 'string',
          enum: ['staging', 'production'],
          description: 'Network to purge from',
          default: 'production',
        },
      },
      required: ['cpCodes'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const cpCodes = args.cpCodes as number[];
      const action = (args.action as string) || 'invalidate';
      const network = (args.network as string) || 'production';

      if (!cpCodes || cpCodes.length === 0) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: 'No CP codes provided' }, null, 2) },
          ],
        };
      }

      logger.info(`Purging ${cpCodes.length} CP codes via ${action} on ${network}`);

      const operationName = action === 'delete'
        ? 'akamai_ccu_post-delete-cpcode'
        : 'akamai_ccu_post-invalidate-cpcode';

      const result = await executeOperation(
        operationName,
        { network },
        {},
        { objects: cpCodes }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                action,
                network,
                cpCodeCount: cpCodes.length,
                purgeId: result?.purgeId,
                estimatedSeconds: result?.estimatedSeconds || 5,
                supportId: result?.supportId,
                warning: 'CP code purge affects ALL content under these codes',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to purge CP codes', { error });
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
 * Bulk Purge - Multiple operations at once
 */
export function getBulkPurgeTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_bulk_purge',
    description: `Perform bulk cache purge operations.

Efficiently purge multiple URLs, tags, or CP codes in a single request.
Maximum 500 objects per request.

Example: "Bulk purge these 50 URLs from production"`,
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['url', 'tag', 'cpcode'],
          description: 'Type of objects to purge',
        },
        objects: {
          type: 'array',
          items: { type: 'string' },
          description: 'Objects to purge (URLs, tags, or CP codes)',
        },
        action: {
          type: 'string',
          enum: ['invalidate', 'delete'],
          default: 'invalidate',
        },
        network: {
          type: 'string',
          enum: ['staging', 'production'],
          default: 'production',
        },
      },
      required: ['type', 'objects'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const type = args.type as string;
      const objects = args.objects as string[];
      const action = (args.action as string) || 'invalidate';
      const network = (args.network as string) || 'production';

      if (!objects || objects.length === 0) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: 'No objects provided' }, null, 2) },
          ],
        };
      }

      if (objects.length > 500) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: 'Maximum 500 objects per request' }, null, 2) },
          ],
        };
      }

      logger.info(`Bulk purging ${objects.length} ${type}s via ${action} on ${network}`);

      // Map type to operation
      const operationMap: Record<string, string> = {
        url: action === 'delete' ? 'akamai_ccu_post-delete-url' : 'akamai_ccu_post-invalidate-url',
        tag: action === 'delete' ? 'akamai_ccu_post-delete-tag' : 'akamai_ccu_post-invalidate-tag',
        cpcode: action === 'delete' ? 'akamai_ccu_post-delete-cpcode' : 'akamai_ccu_post-invalidate-cpcode',
      };

      const operationName = operationMap[type];
      if (!operationName) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: `Invalid type: ${type}` }, null, 2) },
          ],
        };
      }

      // For CP codes, convert to numbers
      const payload = type === 'cpcode'
        ? { objects: objects.map((o) => parseInt(o, 10)) }
        : { objects };

      const result = await executeOperation(operationName, { network }, {}, payload);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                type,
                action,
                network,
                objectCount: objects.length,
                purgeId: result?.purgeId,
                estimatedSeconds: result?.estimatedSeconds || 5,
                supportId: result?.supportId,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed bulk purge', { error });
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
 * Get all cache tools
 */
export function getCacheTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getPurgeUrlsTool(),
    getPurgeTagsTool(),
    getPurgeCpCodeTool(),
    getBulkPurgeTool(),
  ];
}
