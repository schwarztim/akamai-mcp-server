import { getEdgeGridClient } from '../auth/edgegrid-client.js';
import { ToolDefinition, ToolHandler, formatSuccess, formatError } from './types.js';

/**
 * List EdgeWorker IDs
 */
export const listEdgeWorkersHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const groupId = args.groupId as string | undefined;

    const params: Record<string, string> = {};
    if (groupId) params.groupId = groupId;

    const response = await client.get('/edgeworkers/v1/ids', params);

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Get EdgeWorker details
 */
export const getEdgeWorkerHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const edgeWorkerId = args.edgeWorkerId as number;

    const response = await client.get(`/edgeworkers/v1/ids/${edgeWorkerId}`);

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * List EdgeWorker versions
 */
export const listEdgeWorkerVersionsHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const edgeWorkerId = args.edgeWorkerId as number;

    const response = await client.get(`/edgeworkers/v1/ids/${edgeWorkerId}/versions`);

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Get EdgeWorker activation status
 */
export const getEdgeWorkerActivationsHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const edgeWorkerId = args.edgeWorkerId as number;
    const version = args.version as string | undefined;

    const params: Record<string, string> = {};
    if (version) params.version = version;

    const response = await client.get(
      `/edgeworkers/v1/ids/${edgeWorkerId}/activations`,
      params
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Activate EdgeWorker version
 */
export const activateEdgeWorkerHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const edgeWorkerId = args.edgeWorkerId as number;
    const version = args.version as string;
    const network = (args.network as string) || 'STAGING';
    const note = args.note as string;

    const body = {
      version,
      network,
      note,
    };

    const response = await client.post(
      `/edgeworkers/v1/ids/${edgeWorkerId}/activations`,
      body
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Tool definitions for EdgeWorkers
 */
export const edgeWorkersTools: ToolDefinition[] = [
  {
    name: 'akamai_list_edgeworkers',
    description:
      'List all EdgeWorker IDs in your account. EdgeWorkers are serverless functions that run on the Akamai edge network.',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'Filter by group ID',
        },
      },
    },
  },
  {
    name: 'akamai_get_edgeworker',
    description:
      'Get detailed information about a specific EdgeWorker including its name, group, and resource tier.',
    inputSchema: {
      type: 'object',
      properties: {
        edgeWorkerId: {
          type: 'number',
          description: 'EdgeWorker ID',
        },
      },
      required: ['edgeWorkerId'],
    },
  },
  {
    name: 'akamai_list_edgeworker_versions',
    description:
      'List all versions of an EdgeWorker. Each version contains a code bundle that can be deployed.',
    inputSchema: {
      type: 'object',
      properties: {
        edgeWorkerId: {
          type: 'number',
          description: 'EdgeWorker ID',
        },
      },
      required: ['edgeWorkerId'],
    },
  },
  {
    name: 'akamai_get_edgeworker_activations',
    description:
      'Get activation status for an EdgeWorker. Shows which versions are deployed to staging/production.',
    inputSchema: {
      type: 'object',
      properties: {
        edgeWorkerId: {
          type: 'number',
          description: 'EdgeWorker ID',
        },
        version: {
          type: 'string',
          description: 'Optional: filter by specific version',
        },
      },
      required: ['edgeWorkerId'],
    },
  },
  {
    name: 'akamai_activate_edgeworker',
    description:
      'Activate an EdgeWorker version to STAGING or PRODUCTION network. Deploys the serverless function to the edge.',
    inputSchema: {
      type: 'object',
      properties: {
        edgeWorkerId: {
          type: 'number',
          description: 'EdgeWorker ID',
        },
        version: {
          type: 'string',
          description: 'Version to activate',
        },
        network: {
          type: 'string',
          description: 'Target network',
          enum: ['STAGING', 'PRODUCTION'],
        },
        note: {
          type: 'string',
          description: 'Activation note',
        },
      },
      required: ['edgeWorkerId', 'version', 'network', 'note'],
    },
  },
];
