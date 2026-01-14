import { getEdgeGridClient } from '../auth/edgegrid-client.js';
import { ToolDefinition, ToolHandler, formatSuccess, formatError } from './types.js';

/**
 * List DNS zones
 */
export const listDnsZonesHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const contractId = args.contractId as string | undefined;

    const params: Record<string, string> = {};
    if (contractId) params.contractId = contractId;

    const response = await client.get('/config-dns/v2/zones', params);

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Get DNS zone details
 */
export const getDnsZoneHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const zone = args.zone as string;

    const response = await client.get(`/config-dns/v2/zones/${zone}`);

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * List DNS records in a zone
 */
export const listDnsRecordsHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const zone = args.zone as string;

    const response = await client.get(`/config-dns/v2/zones/${zone}/recordsets`);

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Get specific DNS record
 */
export const getDnsRecordHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const zone = args.zone as string;
    const name = args.name as string;
    const type = args.type as string;

    const response = await client.get(
      `/config-dns/v2/zones/${zone}/names/${name}/types/${type}`
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Create DNS record
 */
export const createDnsRecordHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const zone = args.zone as string;
    const name = args.name as string;
    const type = args.type as string;
    const ttl = (args.ttl as number) || 300;
    const rdata = args.rdata as string[];

    const body = {
      name,
      type,
      ttl,
      rdata,
    };

    const response = await client.post(
      `/config-dns/v2/zones/${zone}/names/${name}/types/${type}`,
      body
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Update DNS record
 */
export const updateDnsRecordHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const zone = args.zone as string;
    const name = args.name as string;
    const type = args.type as string;
    const ttl = args.ttl as number;
    const rdata = args.rdata as string[];

    const body = {
      name,
      type,
      ttl,
      rdata,
    };

    const response = await client.put(
      `/config-dns/v2/zones/${zone}/names/${name}/types/${type}`,
      body
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Delete DNS record
 */
export const deleteDnsRecordHandler: ToolHandler = async (args) => {
  try {
    const client = getEdgeGridClient();
    const zone = args.zone as string;
    const name = args.name as string;
    const type = args.type as string;

    const response = await client.delete(
      `/config-dns/v2/zones/${zone}/names/${name}/types/${type}`
    );

    return formatSuccess(response);
  } catch (error) {
    return formatError(error);
  }
};

/**
 * Tool definitions for DNS Management
 */
export const dnsTools: ToolDefinition[] = [
  {
    name: 'akamai_list_dns_zones',
    description:
      'List all DNS zones managed by Akamai Edge DNS. Shows all domains configured for DNS hosting.',
    inputSchema: {
      type: 'object',
      properties: {
        contractId: {
          type: 'string',
          description: 'Filter by contract ID',
        },
      },
    },
  },
  {
    name: 'akamai_get_dns_zone',
    description:
      'Get detailed information about a specific DNS zone including nameservers, SOA record, and zone settings.',
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'Zone name (e.g., example.com)',
        },
      },
      required: ['zone'],
    },
  },
  {
    name: 'akamai_list_dns_records',
    description:
      'List all DNS records in a zone. Returns all A, AAAA, CNAME, MX, TXT, and other record types.',
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'Zone name',
        },
      },
      required: ['zone'],
    },
  },
  {
    name: 'akamai_get_dns_record',
    description:
      'Get a specific DNS record by name and type (e.g., www.example.com A record).',
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'Zone name',
        },
        name: {
          type: 'string',
          description: 'Record name (e.g., www, @, subdomain)',
        },
        type: {
          type: 'string',
          description: 'Record type (A, AAAA, CNAME, MX, TXT, etc.)',
        },
      },
      required: ['zone', 'name', 'type'],
    },
  },
  {
    name: 'akamai_create_dns_record',
    description:
      'Create a new DNS record in a zone. Supports all standard record types.',
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'Zone name',
        },
        name: {
          type: 'string',
          description: 'Record name',
        },
        type: {
          type: 'string',
          description: 'Record type',
        },
        ttl: {
          type: 'number',
          description: 'Time to live in seconds (default: 300)',
        },
        rdata: {
          type: 'array',
          items: { type: 'string' },
          description: 'Record data (e.g., ["192.0.2.1"] for A record)',
        },
      },
      required: ['zone', 'name', 'type', 'rdata'],
    },
  },
  {
    name: 'akamai_update_dns_record',
    description:
      'Update an existing DNS record. Replaces all record data with new values.',
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'Zone name',
        },
        name: {
          type: 'string',
          description: 'Record name',
        },
        type: {
          type: 'string',
          description: 'Record type',
        },
        ttl: {
          type: 'number',
          description: 'Time to live in seconds',
        },
        rdata: {
          type: 'array',
          items: { type: 'string' },
          description: 'New record data',
        },
      },
      required: ['zone', 'name', 'type', 'ttl', 'rdata'],
    },
  },
  {
    name: 'akamai_delete_dns_record',
    description:
      'Delete a DNS record from a zone. This action cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'Zone name',
        },
        name: {
          type: 'string',
          description: 'Record name',
        },
        type: {
          type: 'string',
          description: 'Record type',
        },
      },
      required: ['zone', 'name', 'type'],
    },
  },
];
