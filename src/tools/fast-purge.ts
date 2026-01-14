import { getEdgeGridClient } from '../auth/edgegrid-client.js';
import { ToolDefinition, ToolHandler, formatSuccess, formatError } from './types.js';

/**
 * Purge content by URL
 */
export const purgeByUrlHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const urls = args.urls as string[];
    const network = (args.network as string) || 'production';
    const action = (args.action as string) || 'remove';

    const body = {
      objects: urls,
    };

    const response = await client.post(
      `/ccu/v3/${action}/url/${network}`,
      body
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Purge content by cache tag (CP code)
 */
export const purgeByCacheTagHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const tags = args.tags as string[];
    const network = (args.network as string) || 'production';
    const action = (args.action as string) || 'remove';

    const body = {
      objects: tags,
    };

    const response = await client.post(
      `/ccu/v3/${action}/tag/${network}`,
      body
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Purge content by CP code
 */
export const purgeByCpCodeHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const cpCodes = args.cpCodes as number[];
    const network = (args.network as string) || 'production';
    const action = (args.action as string) || 'remove';

    const body = {
      objects: cpCodes,
    };

    const response = await client.post(
      `/ccu/v3/${action}/cpcode/${network}`,
      body
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Get purge status
 */
export const getPurgeStatusHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const purgeId = args.purgeId as string;

    const response = await client.get(`/ccu/v3/purges/${purgeId}`);

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Tool definitions for Fast Purge
 */
export const fastPurgeTools: ToolDefinition[] = [
  {
    name: 'akamai_purge_by_url',
    description:
      'Purge (invalidate or remove) cached content by specific URLs. Use this to clear cache for specific pages or assets on the CDN.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of URLs to purge (max 50 per request)',
        },
        network: {
          type: 'string',
          description: 'Network to purge from: staging or production',
          enum: ['staging', 'production'],
        },
        action: {
          type: 'string',
          description:
            'Purge action: remove (delete from cache) or invalidate (mark as stale)',
          enum: ['remove', 'invalidate'],
        },
      },
      required: ['urls'],
    },
  },
  {
    name: 'akamai_purge_by_cache_tag',
    description:
      'Purge cached content by cache tags. Cache tags allow you to group and purge related content efficiently.',
    inputSchema: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of cache tags to purge (max 50 per request)',
        },
        network: {
          type: 'string',
          description: 'Network to purge from',
          enum: ['staging', 'production'],
        },
        action: {
          type: 'string',
          description: 'Purge action',
          enum: ['remove', 'invalidate'],
        },
      },
      required: ['tags'],
    },
  },
  {
    name: 'akamai_purge_by_cpcode',
    description:
      'Purge all cached content for specific CP codes (Content Provider codes). This purges all content associated with the billing/reporting code.',
    inputSchema: {
      type: 'object',
      properties: {
        cpCodes: {
          type: 'array',
          items: { type: 'number' },
          description: 'List of CP codes to purge (max 50 per request)',
        },
        network: {
          type: 'string',
          description: 'Network to purge from',
          enum: ['staging', 'production'],
        },
        action: {
          type: 'string',
          description: 'Purge action',
          enum: ['remove', 'invalidate'],
        },
      },
      required: ['cpCodes'],
    },
  },
  {
    name: 'akamai_get_purge_status',
    description:
      'Check the status of a purge request. Returns whether the purge is complete and how long it took.',
    inputSchema: {
      type: 'object',
      properties: {
        purgeId: {
          type: 'string',
          description: 'Purge request ID returned from a purge operation',
        },
      },
      required: ['purgeId'],
    },
  },
];
