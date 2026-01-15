/**
 * DNS Management Tools
 *
 * Tools for managing Akamai Edge DNS zones and records.
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
    paginate: true,
    maxPages: 100,
  });

  return result.body;
}

/**
 * DNS Overview - All zones summary
 */
export function getDnsOverviewTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_dns_overview',
    description: `Get an overview of all DNS zones in your Akamai account.

Returns zone list with record counts and DNSSEC status.

Example: "Show me all my DNS zones"`,
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search zones by name',
        },
        type: {
          type: 'string',
          enum: ['PRIMARY', 'SECONDARY', 'ALIAS'],
          description: 'Filter by zone type',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      const search = args.search as string;
      const type = args.type as string;

      logger.info('Fetching DNS zones overview');

      const zonesData = await executeOperation('akamai_config_dns_getZones', {}, {
        ...(search && { search }),
        ...(type && { types: type }),
      });

      const zones = zonesData?.zones || [];

      // Get record counts for first few zones
      const zonesWithDetails = await Promise.all(
        zones.slice(0, 20).map(async (zone: any) => {
          try {
            const recordsData = await executeOperation(
              'akamai_config_dns_getRecordSetTypes',
              { zone: zone.zone }
            );
            return {
              zone: zone.zone,
              type: zone.type,
              activationState: zone.activationState,
              signAndServe: zone.signAndServe,
              recordTypes: recordsData?.types || [],
            };
          } catch {
            return {
              zone: zone.zone,
              type: zone.type,
              activationState: zone.activationState,
              signAndServe: zone.signAndServe,
            };
          }
        })
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary: {
                  totalZones: zones.length,
                  byType: zones.reduce((acc: any, z: any) => {
                    acc[z.type] = (acc[z.type] || 0) + 1;
                    return acc;
                  }, {}),
                },
                zones: zonesWithDetails,
                fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to get DNS overview', { error });
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
 * List DNS Records
 */
export function getDnsRecordsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_dns_records',
    description: `List DNS records for a specific zone.

Filter by record type (A, AAAA, CNAME, MX, TXT, etc.) or search by name.

Example: "Show me all A records for example.com"`,
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'DNS zone name (e.g., "example.com")',
        },
        type: {
          type: 'string',
          description: 'Record type filter (A, AAAA, CNAME, MX, TXT, NS, SOA, etc.)',
        },
        search: {
          type: 'string',
          description: 'Search by record name',
        },
      },
      required: ['zone'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const zone = args.zone as string;
      const type = args.type as string;
      const search = (args.search as string)?.toLowerCase();

      logger.info(`Fetching DNS records for zone: ${zone}`);

      // If type specified, get specific record set
      if (type) {
        const recordsData = await executeOperation(
          'akamai_config_dns_getRecordSets',
          { zone },
          { types: type }
        );

        let records = recordsData?.recordsets || [];

        if (search) {
          records = records.filter((r: any) =>
            r.name?.toLowerCase().includes(search)
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  zone,
                  type,
                  recordCount: records.length,
                  records: records.map((r: any) => ({
                    name: r.name,
                    type: r.type,
                    ttl: r.ttl,
                    rdata: r.rdata,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Get all record types first
      const typesData = await executeOperation(
        'akamai_config_dns_getRecordSetTypes',
        { zone }
      );

      const types = typesData?.types || [];

      // Get records for each type (limited)
      const allRecords: any[] = [];
      for (const t of types.slice(0, 10)) {
        try {
          const recordsData = await executeOperation(
            'akamai_config_dns_getRecordSets',
            { zone },
            { types: t }
          );
          const records = recordsData?.recordsets || [];
          allRecords.push(
            ...records.map((r: any) => ({
              name: r.name,
              type: r.type,
              ttl: r.ttl,
              rdata: r.rdata,
            }))
          );
        } catch {
          // Skip failed types
        }
      }

      let filteredRecords = allRecords;
      if (search) {
        filteredRecords = allRecords.filter((r) =>
          r.name?.toLowerCase().includes(search)
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                zone,
                recordTypes: types,
                totalRecords: filteredRecords.length,
                records: filteredRecords.slice(0, 100),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to get DNS records', { error });
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
 * Add DNS Record
 */
export function getAddDnsRecordTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_dns_add_record',
    description: `Add a new DNS record to a zone.

Supports all standard record types: A, AAAA, CNAME, MX, TXT, etc.

Example: "Add A record for www.example.com pointing to 1.2.3.4"`,
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'DNS zone name',
        },
        name: {
          type: 'string',
          description: 'Record name (e.g., "www" or "www.example.com")',
        },
        type: {
          type: 'string',
          description: 'Record type (A, AAAA, CNAME, MX, TXT, etc.)',
        },
        rdata: {
          type: 'array',
          items: { type: 'string' },
          description: 'Record data (IP address, hostname, text, etc.)',
        },
        ttl: {
          type: 'number',
          description: 'TTL in seconds (default: 300)',
          default: 300,
        },
      },
      required: ['zone', 'name', 'type', 'rdata'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const zone = args.zone as string;
      const name = args.name as string;
      const type = args.type as string;
      const rdata = args.rdata as string[];
      const ttl = (args.ttl as number) || 300;

      logger.info(`Adding ${type} record ${name} to zone ${zone}`);

      // Normalize name to be FQDN
      const fqdn = name.endsWith('.') ? name : (name.includes(zone) ? name : `${name}.${zone}`);

      await executeOperation(
        'akamai_config_dns_createRecordSet',
        { zone },
        {},
        {
          name: fqdn,
          type: type.toUpperCase(),
          ttl,
          rdata,
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                zone,
                record: {
                  name: fqdn,
                  type: type.toUpperCase(),
                  ttl,
                  rdata,
                },
                note: 'DNS changes typically propagate within minutes',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to add DNS record', { error });
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
 * Delete DNS Record
 */
export function getDeleteDnsRecordTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_dns_delete_record',
    description: `Delete a DNS record from a zone.

Permanently removes the record. Use with caution.

Example: "Delete the A record for old.example.com"`,
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'DNS zone name',
        },
        name: {
          type: 'string',
          description: 'Record name to delete',
        },
        type: {
          type: 'string',
          description: 'Record type',
        },
      },
      required: ['zone', 'name', 'type'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const zone = args.zone as string;
      const name = args.name as string;
      const type = args.type as string;

      logger.info(`Deleting ${type} record ${name} from zone ${zone}`);

      const fqdn = name.endsWith('.') ? name : (name.includes(zone) ? name : `${name}.${zone}`);

      await executeOperation(
        'akamai_config_dns_deleteRecordSet',
        { zone, name: fqdn, type: type.toUpperCase() }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                deleted: {
                  zone,
                  name: fqdn,
                  type: type.toUpperCase(),
                },
                note: 'DNS deletion will propagate within minutes',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to delete DNS record', { error });
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
 * Get all DNS tools
 */
export function getDnsTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getDnsOverviewTool(),
    getDnsRecordsTool(),
    getAddDnsRecordTool(),
    getDeleteDnsRecordTool(),
  ];
}
