import { getEdgeGridClient } from '../auth/edgegrid-client.js';
import { ToolDefinition, ToolHandler, formatSuccess, formatError } from './types.js';

/**
 * List properties (CDN configurations)
 */
export const listPropertiesHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const contractId = args.contractId as string | undefined;
    const groupId = args.groupId as string | undefined;

    const params: Record<string, string> = {};
    if (contractId) params.contractId = contractId;
    if (groupId) params.groupId = groupId;

    const response = await client.get('/papi/v1/properties', params);

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Get property details
 */
export const getPropertyHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const propertyId = args.propertyId as string;
    const contractId = args.contractId as string;
    const groupId = args.groupId as string;

    const response = await client.get(
      `/papi/v1/properties/${propertyId}`,
      { contractId, groupId }
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Get property version rules
 */
export const getPropertyRulesHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const propertyId = args.propertyId as string;
    const version = args.version as number;
    const contractId = args.contractId as string;
    const groupId = args.groupId as string;

    const response = await client.get(
      `/papi/v1/properties/${propertyId}/versions/${version}/rules`,
      { contractId, groupId }
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * List property hostnames
 */
export const listPropertyHostnamesHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const propertyId = args.propertyId as string;
    const version = args.version as number;
    const contractId = args.contractId as string;
    const groupId = args.groupId as string;

    const response = await client.get(
      `/papi/v1/properties/${propertyId}/versions/${version}/hostnames`,
      { contractId, groupId }
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Activate property version
 */
export const activatePropertyHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const propertyId = args.propertyId as string;
    const version = args.version as number;
    const network = (args.network as string) || 'STAGING';
    const notifyEmails = (args.notifyEmails as string[]) || [];
    const note = args.note as string;
    const contractId = args.contractId as string;
    const groupId = args.groupId as string;

    const body = {
      propertyVersion: version,
      network,
      notifyEmails,
      note,
    };

    const response = await client.post(
      `/papi/v1/properties/${propertyId}/activations`,
      body,
      { contractId, groupId }
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Tool definitions for Property Manager
 */
export const propertyManagerTools: ToolDefinition[] = [
  {
    name: 'akamai_list_properties',
    description:
      'List all properties (CDN configurations) in your Akamai account. Properties define how content is delivered through the Akamai network.',
    inputSchema: {
      type: 'object',
      properties: {
        contractId: {
          type: 'string',
          description: 'Filter by contract ID (format: ctr_X-XXXXX)',
        },
        groupId: {
          type: 'string',
          description: 'Filter by group ID (format: grp_XXXXX)',
        },
      },
    },
  },
  {
    name: 'akamai_get_property',
    description:
      'Get detailed information about a specific property including its versions, staging/production status, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'Property ID (format: prp_XXXXX)',
        },
        contractId: {
          type: 'string',
          description: 'Contract ID',
        },
        groupId: {
          type: 'string',
          description: 'Group ID',
        },
      },
      required: ['propertyId', 'contractId', 'groupId'],
    },
  },
  {
    name: 'akamai_get_property_rules',
    description:
      'Get the complete rule tree configuration for a property version. Rules define caching behaviors, origin settings, performance optimizations, and more.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'Property ID',
        },
        version: {
          type: 'number',
          description: 'Property version number',
        },
        contractId: {
          type: 'string',
          description: 'Contract ID',
        },
        groupId: {
          type: 'string',
          description: 'Group ID',
        },
      },
      required: ['propertyId', 'version', 'contractId', 'groupId'],
    },
  },
  {
    name: 'akamai_list_property_hostnames',
    description:
      'List all hostnames (domains) associated with a property version. Shows which domains are configured to use this CDN configuration.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'Property ID',
        },
        version: {
          type: 'number',
          description: 'Property version number',
        },
        contractId: {
          type: 'string',
          description: 'Contract ID',
        },
        groupId: {
          type: 'string',
          description: 'Group ID',
        },
      },
      required: ['propertyId', 'version', 'contractId', 'groupId'],
    },
  },
  {
    name: 'akamai_activate_property',
    description:
      'Activate a property version to either STAGING or PRODUCTION network. This deploys your configuration changes to the Akamai edge network.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'Property ID',
        },
        version: {
          type: 'number',
          description: 'Property version number to activate',
        },
        network: {
          type: 'string',
          description: 'Target network: STAGING or PRODUCTION',
          enum: ['STAGING', 'PRODUCTION'],
        },
        notifyEmails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses to notify when activation completes',
        },
        note: {
          type: 'string',
          description: 'Activation note/comment',
        },
        contractId: {
          type: 'string',
          description: 'Contract ID',
        },
        groupId: {
          type: 'string',
          description: 'Group ID',
        },
      },
      required: ['propertyId', 'version', 'network', 'note', 'contractId', 'groupId'],
    },
  },
];
