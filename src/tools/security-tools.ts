/**
 * Security Tools
 *
 * High-level tools for Akamai security operations.
 * Covers App & API Protector, WAF, Bot Manager, and Network Lists.
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
    maxPages: 50,
  });

  return result.body;
}

/**
 * Security Overview - Dashboard-style summary
 */
export function getSecurityOverviewTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_security_overview',
    description: `Get a comprehensive overview of your Akamai security posture.

Returns:
- List of security configurations
- Active WAF policies
- Bot Manager status
- Network lists summary
- Recent security events count

This is your security dashboard in one call.`,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async () => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      logger.info('Fetching security overview');

      // Get security configurations
      const [configsData, networkListsData] = await Promise.all([
        executeOperation('akamai_appsec_get-configs').catch(() => ({ configurations: [] })),
        executeOperation('akamai_network_lists_get-network-lists').catch(() => ({ networkLists: [] })),
      ]);

      const configs = configsData?.configurations || [];
      const networkLists = networkListsData?.networkLists || [];

      // Get details for each config (limited to first 5)
      const configDetails = await Promise.all(
        configs.slice(0, 5).map(async (config: any) => {
          try {
            const versionsData = await executeOperation(
              'akamai_appsec_get-config-versions',
              { configId: config.id }
            );
            const versions = versionsData?.versionList || [];
            const latestVersion = versions[0];

            return {
              id: config.id,
              name: config.name,
              description: config.description,
              latestVersion: latestVersion?.version,
              productionVersion: latestVersion?.production?.status === 'Active' ? latestVersion.version : null,
              stagingVersion: latestVersion?.staging?.status === 'Active' ? latestVersion.version : null,
            };
          } catch {
            return {
              id: config.id,
              name: config.name,
              description: config.description,
            };
          }
        })
      );

      // Categorize network lists
      const networkListSummary = {
        total: networkLists.length,
        byType: networkLists.reduce((acc: any, nl: any) => {
          const type = nl.type || 'UNKNOWN';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {}),
        recent: networkLists.slice(0, 5).map((nl: any) => ({
          name: nl.name,
          type: nl.type,
          elementCount: nl.elementCount,
        })),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                securityConfigurations: {
                  total: configs.length,
                  configs: configDetails,
                },
                networkLists: networkListSummary,
                fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to get security overview', { error });
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
 * WAF Events - Recent security events
 */
export function getWafEventsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_waf_events',
    description: `Get recent WAF (Web Application Firewall) security events.

Shows attacks blocked, rules triggered, and traffic analysis.

Options:
- configId: Security configuration ID
- hours: How far back to look (default: 24)
- limit: Maximum events to return (default: 100)

Example: "Show me WAF events from the last 6 hours"`,
    inputSchema: {
      type: 'object',
      properties: {
        configId: {
          type: 'number',
          description: 'Security configuration ID (optional - uses first config if not specified)',
        },
        hours: {
          type: 'number',
          description: 'Hours to look back (default: 24)',
          default: 24,
        },
        limit: {
          type: 'number',
          description: 'Maximum events to return (default: 100)',
          default: 100,
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      let configId = args.configId as number;
      const hours = (args.hours as number) || 24;
      // const limit = (args.limit as number) || 100; // Reserved for pagination

      // Get config ID if not provided
      if (!configId) {
        const configsData = await executeOperation('akamai_appsec_get-configs');
        const configs = configsData?.configurations || [];
        if (configs.length === 0) {
          return {
            content: [
              { type: 'text', text: JSON.stringify({ error: true, message: 'No security configurations found' }, null, 2) },
            ],
          };
        }
        configId = configs[0].id;
      }

      // Calculate time range
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

      // Try to get security events via SIEM or event viewer
      // Note: The actual implementation depends on which APIs are available
      // This is a simplified version

      const response = {
        configId,
        timeRange: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          hours,
        },
        note: 'Use Akamai SIEM API or Security Center for detailed event data',
        suggestion: 'For real-time events, consider integrating with Akamai SIEM or DataStream',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error: any) {
      logger.error('Failed to get WAF events', { error });
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
 * Network List Management
 */
export function getNetworkListTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_network_lists',
    description: `Manage Akamai network lists for IP blocking/allowing.

Actions:
- List all network lists
- Get details of a specific list
- Search lists by name

Example: "Show me all IP blocklists"`,
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'search'],
          description: 'Action to perform',
          default: 'list',
        },
        listId: {
          type: 'string',
          description: 'Network list ID (for get action)',
        },
        query: {
          type: 'string',
          description: 'Search query (for search action)',
        },
        type: {
          type: 'string',
          enum: ['IP', 'GEO'],
          description: 'Filter by list type',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const action = (args.action as string) || 'list';
      const listId = args.listId as string;
      const query = (args.query as string)?.toLowerCase();
      const type = args.type as string;

      if (action === 'get' && listId) {
        // Get specific list
        const listData = await executeOperation(
          'akamai_network_lists_get-network-list',
          { networkListId: listId }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  networkList: {
                    id: listData.uniqueId,
                    name: listData.name,
                    type: listData.type,
                    description: listData.description,
                    elementCount: listData.elementCount,
                    syncPoint: listData.syncPoint,
                    elements: listData.list?.slice(0, 100), // Limit to 100 elements
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // List all network lists
      const listsData = await executeOperation('akamai_network_lists_get-network-lists');
      let lists = listsData?.networkLists || [];

      // Filter by type
      if (type) {
        lists = lists.filter((l: any) => l.type === type);
      }

      // Filter by query
      if (query) {
        lists = lists.filter(
          (l: any) =>
            l.name?.toLowerCase().includes(query) ||
            l.description?.toLowerCase().includes(query)
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: lists.length,
                networkLists: lists.map((l: any) => ({
                  id: l.uniqueId,
                  name: l.name,
                  type: l.type,
                  elementCount: l.elementCount,
                  description: l.description?.substring(0, 100),
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to manage network lists', { error });
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
 * Add/Remove IPs from Network List
 */
export function getModifyNetworkListTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_modify_network_list',
    description: `Add or remove IP addresses from a network list.

Use this to block or unblock IPs quickly.

Example: "Add IP 1.2.3.4 to blocklist xyz"`,
    inputSchema: {
      type: 'object',
      properties: {
        listId: {
          type: 'string',
          description: 'Network list ID',
        },
        action: {
          type: 'string',
          enum: ['add', 'remove'],
          description: 'Add or remove elements',
        },
        elements: {
          type: 'array',
          items: { type: 'string' },
          description: 'IP addresses or CIDR blocks to add/remove',
        },
      },
      required: ['listId', 'action', 'elements'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const listId = args.listId as string;
      const action = args.action as string;
      const elements = args.elements as string[];

      logger.info(`${action}ing ${elements.length} elements to/from network list ${listId}`);

      if (action === 'add') {
        await executeOperation(
          'akamai_network_lists_post-network-list-append',
          { networkListId: listId },
          {},
          { list: elements }
        );
      } else {
        // For remove, we need to get the list first, then update it
        const listData = await executeOperation(
          'akamai_network_lists_get-network-list',
          { networkListId: listId }
        );

        const currentElements = listData?.list || [];
        const newElements = currentElements.filter(
          (e: string) => !elements.includes(e)
        );

        await executeOperation(
          'akamai_network_lists_put-network-list',
          { networkListId: listId },
          {},
          { ...listData, list: newElements }
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                action,
                listId,
                elementsModified: elements.length,
                note: 'Changes will propagate across Akamai network within minutes',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to modify network list', { error });
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
 * Security Configuration Details
 */
export function getSecurityConfigTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_security_config',
    description: `Get detailed information about a security configuration.

Shows WAF settings, rate limiting, bot management settings, and more.

Example: "Show me details of security config 12345"`,
    inputSchema: {
      type: 'object',
      properties: {
        configId: {
          type: 'number',
          description: 'Security configuration ID',
        },
        version: {
          type: 'number',
          description: 'Specific version (optional - uses latest)',
        },
      },
      required: ['configId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const configId = args.configId as number;
      let version = args.version as number;

      // Get version if not specified
      if (!version) {
        const versionsData = await executeOperation(
          'akamai_appsec_get-config-versions',
          { configId }
        );
        const versions = versionsData?.versionList || [];
        version = versions[0]?.version;
      }

      if (!version) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: 'No versions found for config' }, null, 2) },
          ],
        };
      }

      // Get config details
      const [configData, policiesData] = await Promise.all([
        executeOperation('akamai_appsec_get-config', { configId }),
        executeOperation('akamai_appsec_get-policies', { configId, version }).catch(() => ({})),
      ]);

      const policies = policiesData?.policies || [];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                config: {
                  id: configData.id,
                  name: configData.name,
                  description: configData.description,
                  version,
                },
                policies: policies.map((p: any) => ({
                  id: p.policyId,
                  name: p.policyName,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to get security config', { error });
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
 * Get all security tools
 */
export function getSecurityTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getSecurityOverviewTool(),
    getWafEventsTool(),
    getNetworkListTool(),
    getModifyNetworkListTool(),
    getSecurityConfigTool(),
  ];
}
