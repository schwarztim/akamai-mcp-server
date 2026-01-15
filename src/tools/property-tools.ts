/**
 * Property Management Tools
 *
 * High-level tools for managing Akamai CDN properties.
 * Replaces Property Manager web GUI workflows.
 */

import { getOperationRegistry } from '../registry/operation-registry.js';
import { getUniversalExecutor } from '../executor/universal-executor.js';
import { getLogger } from '../utils/logger.js';
import type { MCPToolDefinition, ToolHandler } from '../generator/tool-generator.js';

// Cache for frequently accessed data (reserved for future use)
// const cache = new Map<string, { data: any; expires: number }>();
// const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
 * Get Property Details - Comprehensive property information
 */
export function getPropertyDetailsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_property_details',
    description: `Get comprehensive details about a specific CDN property.

Returns:
- Property metadata (name, ID, versions)
- Hostnames configured
- Active versions (staging/production)
- Rule tree summary
- Origin configuration

Example: "Get details for property www.example.com"`,
    inputSchema: {
      type: 'object',
      properties: {
        propertyName: {
          type: 'string',
          description: 'Property name or ID (e.g., "www.example.com" or "prp_123456")',
        },
        includeRules: {
          type: 'boolean',
          description: 'Include rule tree details (default: false)',
          default: false,
        },
      },
      required: ['propertyName'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      const propertyName = args.propertyName as string;
      const includeRules = args.includeRules as boolean;

      logger.info(`Getting details for property: ${propertyName}`);

      // First, find the property
      const contractsData = await executeOperation('akamai_papi_listContracts');
      const contracts = contractsData?.contracts?.items || [];

      const groupsData = await executeOperation('akamai_papi_listGroups');
      const groups = groupsData?.groups?.items || [];

      // Search for the property across all contract/group combinations
      let foundProperty: any = null;
      let propertyContract: string = '';
      let propertyGroup: string = '';

      for (const contract of contracts) {
        if (foundProperty) break;
        for (const group of groups) {
          try {
            const propsData = await executeOperation(
              'akamai_papi_listProperties',
              {},
              { contractId: contract.contractId, groupId: group.groupId }
            );
            const props = propsData?.properties?.items || [];
            const match = props.find(
              (p: any) =>
                p.propertyName?.toLowerCase() === propertyName.toLowerCase() ||
                p.propertyId === propertyName
            );
            if (match) {
              foundProperty = match;
              propertyContract = contract.contractId;
              propertyGroup = group.groupId;
              break;
            }
          } catch {
            // Skip failed combinations
          }
        }
      }

      if (!foundProperty) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: true, message: `Property not found: ${propertyName}` },
                null,
                2
              ),
            },
          ],
        };
      }

      // Get hostnames
      const hostnamesData = await executeOperation(
        'akamai_papi_listPropertyHostnames',
        { propertyId: foundProperty.propertyId },
        {
          contractId: propertyContract,
          groupId: propertyGroup,
          propertyVersion: foundProperty.latestVersion || 1,
        }
      );
      const hostnames = hostnamesData?.hostnames?.items || [];

      // Get rule tree if requested
      let rulesSummary: any = null;
      if (includeRules) {
        try {
          const rulesData = await executeOperation(
            'akamai_papi_getPropertyRuleTree',
            {
              propertyId: foundProperty.propertyId,
              propertyVersion: foundProperty.latestVersion || 1,
            },
            { contractId: propertyContract, groupId: propertyGroup }
          );

          // Summarize rules
          const rules = rulesData?.rules;
          if (rules) {
            rulesSummary = {
              name: rules.name,
              behaviorsCount: rules.behaviors?.length || 0,
              childRulesCount: rules.children?.length || 0,
              behaviors: (rules.behaviors || []).map((b: any) => b.name),
              childRules: (rules.children || []).map((c: any) => ({
                name: c.name,
                behaviorsCount: c.behaviors?.length || 0,
              })),
            };
          }
        } catch (e: any) {
          rulesSummary = { error: 'Failed to fetch rule tree' };
        }
      }

      const response = {
        property: {
          propertyId: foundProperty.propertyId,
          propertyName: foundProperty.propertyName,
          contractId: propertyContract,
          groupId: propertyGroup,
          latestVersion: foundProperty.latestVersion,
          productionVersion: foundProperty.productionVersion,
          stagingVersion: foundProperty.stagingVersion,
          assetId: foundProperty.assetId,
        },
        hostnames: hostnames.map((h: any) => ({
          hostname: h.cnameFrom,
          edgeHostname: h.cnameTo,
          certStatus: h.certStatus?.status,
        })),
        versions: {
          latest: foundProperty.latestVersion,
          production: foundProperty.productionVersion || 'Not activated',
          staging: foundProperty.stagingVersion || 'Not activated',
        },
        rules: rulesSummary,
        fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error: any) {
      logger.error('Failed to get property details', { error });
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
 * Activate Property - Activate to staging or production
 */
export function getActivatePropertyTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_activate_property',
    description: `Activate a property version to staging or production network.

This initiates the activation process. Activations typically take 5-15 minutes.

Example: "Activate property www.example.com version 5 to production"`,
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'Property ID (e.g., "prp_123456")',
        },
        version: {
          type: 'number',
          description: 'Property version to activate',
        },
        network: {
          type: 'string',
          enum: ['STAGING', 'PRODUCTION'],
          description: 'Target network',
        },
        notifyEmails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses to notify on completion',
        },
        note: {
          type: 'string',
          description: 'Activation note/comment',
        },
        acknowledgeWarnings: {
          type: 'boolean',
          description: 'Acknowledge any warnings (default: false)',
          default: false,
        },
      },
      required: ['propertyId', 'version', 'network'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const propertyId = args.propertyId as string;
      const version = args.version as number;
      const network = args.network as string;
      const notifyEmails = (args.notifyEmails as string[]) || [];
      const note = (args.note as string) || `Activated via MCP at ${new Date().toISOString()}`;
      const acknowledgeWarnings = args.acknowledgeWarnings as boolean;

      logger.info(`Activating property ${propertyId} v${version} to ${network}`);

      // First get the property to find contract/group
      const contractsData = await executeOperation('akamai_papi_listContracts');
      const contracts = contractsData?.contracts?.items || [];
      const groupsData = await executeOperation('akamai_papi_listGroups');
      const groups = groupsData?.groups?.items || [];

      // Find property
      let propertyContract: string = '';
      let propertyGroup: string = '';

      outerLoop: for (const contract of contracts) {
        for (const group of groups) {
          try {
            const propsData = await executeOperation(
              'akamai_papi_listProperties',
              {},
              { contractId: contract.contractId, groupId: group.groupId }
            );
            const props = propsData?.properties?.items || [];
            if (props.some((p: any) => p.propertyId === propertyId)) {
              propertyContract = contract.contractId;
              propertyGroup = group.groupId;
              break outerLoop;
            }
          } catch {
            // Skip failed combinations
          }
        }
      }

      if (!propertyContract || !propertyGroup) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: 'Property not found' }, null, 2) },
          ],
        };
      }

      // Create activation
      const activationBody = {
        propertyVersion: version,
        network: network,
        note: note,
        notifyEmails: notifyEmails.length > 0 ? notifyEmails : ['noreply@akamai.com'],
        acknowledgeAllWarnings: acknowledgeWarnings,
      };

      const result = await executeOperation(
        'akamai_papi_createActivation',
        { propertyId },
        { contractId: propertyContract, groupId: propertyGroup },
        activationBody
      );

      const activationId = result?.activationLink?.split('/').pop() || result?.activationId;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Activation initiated for ${propertyId} v${version} to ${network}`,
                activationId,
                estimatedTime: '5-15 minutes',
                note: 'Use akamai_activation_status to check progress',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to activate property', { error });
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
 * Get Activation Status
 */
export function getActivationStatusTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_activation_status',
    description: `Check the status of a property activation.

Returns activation status (PENDING, ACTIVE, FAILED, etc.) and estimated completion time.

Example: "Check activation status for property prp_123456"`,
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'Property ID',
        },
        activationId: {
          type: 'string',
          description: 'Specific activation ID (optional - shows latest if not provided)',
        },
      },
      required: ['propertyId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const propertyId = args.propertyId as string;

      // Find property contract/group
      const contractsData = await executeOperation('akamai_papi_listContracts');
      const contracts = contractsData?.contracts?.items || [];
      const groupsData = await executeOperation('akamai_papi_listGroups');
      const groups = groupsData?.groups?.items || [];

      let propertyContract: string = '';
      let propertyGroup: string = '';

      outerLoop: for (const contract of contracts) {
        for (const group of groups) {
          try {
            const propsData = await executeOperation(
              'akamai_papi_listProperties',
              {},
              { contractId: contract.contractId, groupId: group.groupId }
            );
            const props = propsData?.properties?.items || [];
            if (props.some((p: any) => p.propertyId === propertyId)) {
              propertyContract = contract.contractId;
              propertyGroup = group.groupId;
              break outerLoop;
            }
          } catch {
            // Skip
          }
        }
      }

      if (!propertyContract) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: 'Property not found' }, null, 2) },
          ],
        };
      }

      // Get activations
      const activationsData = await executeOperation(
        'akamai_papi_listPropertyActivations',
        { propertyId },
        { contractId: propertyContract, groupId: propertyGroup }
      );

      const activations = activationsData?.activations?.items || [];

      if (activations.length === 0) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ message: 'No activations found for this property' }, null, 2) },
          ],
        };
      }

      // Get latest activations for each network
      const latest = activations.slice(0, 10).map((a: any) => ({
        activationId: a.activationId,
        network: a.network,
        status: a.status,
        version: a.propertyVersion,
        submittedBy: a.submittedByUser,
        submitDate: a.submitDate,
        updateDate: a.updateDate,
        note: a.note,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                propertyId,
                recentActivations: latest,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to get activation status', { error });
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
 * Compare Property Versions
 */
export function getCompareVersionsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_compare_versions',
    description: `Compare two versions of a property to see what changed.

Shows differences in rules, behaviors, and configurations between versions.

Example: "Compare version 4 and version 5 of property prp_123456"`,
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: {
          type: 'string',
          description: 'Property ID',
        },
        version1: {
          type: 'number',
          description: 'First version to compare',
        },
        version2: {
          type: 'number',
          description: 'Second version to compare',
        },
      },
      required: ['propertyId', 'version1', 'version2'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const propertyId = args.propertyId as string;
      const version1 = args.version1 as number;
      const version2 = args.version2 as number;

      // Find property contract/group
      const contractsData = await executeOperation('akamai_papi_listContracts');
      const contracts = contractsData?.contracts?.items || [];
      const groupsData = await executeOperation('akamai_papi_listGroups');
      const groups = groupsData?.groups?.items || [];

      let propertyContract: string = '';
      let propertyGroup: string = '';

      outerLoop: for (const contract of contracts) {
        for (const group of groups) {
          try {
            const propsData = await executeOperation(
              'akamai_papi_listProperties',
              {},
              { contractId: contract.contractId, groupId: group.groupId }
            );
            const props = propsData?.properties?.items || [];
            if (props.some((p: any) => p.propertyId === propertyId)) {
              propertyContract = contract.contractId;
              propertyGroup = group.groupId;
              break outerLoop;
            }
          } catch {
            // Skip
          }
        }
      }

      if (!propertyContract) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: true, message: 'Property not found' }, null, 2) },
          ],
        };
      }

      // Get both rule trees in parallel
      const [rules1Data, rules2Data] = await Promise.all([
        executeOperation(
          'akamai_papi_getPropertyRuleTree',
          { propertyId, propertyVersion: version1 },
          { contractId: propertyContract, groupId: propertyGroup }
        ),
        executeOperation(
          'akamai_papi_getPropertyRuleTree',
          { propertyId, propertyVersion: version2 },
          { contractId: propertyContract, groupId: propertyGroup }
        ),
      ]);

      // Simple comparison - count behaviors and rules
      const rules1 = rules1Data?.rules || {};
      const rules2 = rules2Data?.rules || {};

      const countBehaviors = (rule: any): number => {
        let count = (rule.behaviors || []).length;
        for (const child of rule.children || []) {
          count += countBehaviors(child);
        }
        return count;
      };

      const countRules = (rule: any): number => {
        let count = (rule.children || []).length;
        for (const child of rule.children || []) {
          count += countRules(child);
        }
        return count;
      };

      const getBehaviorNames = (rule: any, names: Set<string> = new Set()): Set<string> => {
        for (const b of rule.behaviors || []) {
          names.add(b.name);
        }
        for (const child of rule.children || []) {
          getBehaviorNames(child, names);
        }
        return names;
      };

      const behaviors1 = getBehaviorNames(rules1);
      const behaviors2 = getBehaviorNames(rules2);

      const added = [...behaviors2].filter((b) => !behaviors1.has(b));
      const removed = [...behaviors1].filter((b) => !behaviors2.has(b));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                propertyId,
                comparison: {
                  version1: {
                    version: version1,
                    totalBehaviors: countBehaviors(rules1),
                    totalRules: countRules(rules1),
                  },
                  version2: {
                    version: version2,
                    totalBehaviors: countBehaviors(rules2),
                    totalRules: countRules(rules2),
                  },
                },
                changes: {
                  behaviorsAdded: added,
                  behaviorsRemoved: removed,
                  behaviorsDifference: countBehaviors(rules2) - countBehaviors(rules1),
                  rulesDifference: countRules(rules2) - countRules(rules1),
                },
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to compare versions', { error });
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
 * Search Properties
 */
export function getSearchPropertiesTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_search_properties',
    description: `Search for properties by name, hostname, or other criteria.

Fast search across all your CDN properties.

Example: "Find all properties with 'api' in the name"`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (matches property name or hostname)',
        },
        hostname: {
          type: 'string',
          description: 'Search by specific hostname',
        },
        activeOnly: {
          type: 'boolean',
          description: 'Only show properties with production activations',
          default: false,
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      const query = (args.query as string)?.toLowerCase();
      const hostname = args.hostname as string;
      const activeOnly = args.activeOnly as boolean;

      // If searching by hostname, use the search API
      if (hostname) {
        try {
          const searchResult = await executeOperation(
            'akamai_papi_searchProperties',
            {},
            {},
            { hostname }
          );

          const versions = searchResult?.versions?.items || [];
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    searchType: 'hostname',
                    hostname,
                    results: versions.map((v: any) => ({
                      propertyId: v.propertyId,
                      propertyName: v.propertyName,
                      version: v.propertyVersion,
                      productionStatus: v.productionStatus,
                      stagingStatus: v.stagingStatus,
                    })),
                    fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch {
          // Fall back to manual search
        }
      }

      // Manual search across all properties
      const contractsData = await executeOperation('akamai_papi_listContracts');
      const contracts = contractsData?.contracts?.items || [];
      const groupsData = await executeOperation('akamai_papi_listGroups');
      const groups = groupsData?.groups?.items || [];

      const allProperties: any[] = [];
      const seenCombinations = new Set<string>();

      for (const contract of contracts) {
        for (const group of groups) {
          const key = `${contract.contractId}-${group.groupId}`;
          if (seenCombinations.has(key)) continue;
          seenCombinations.add(key);

          try {
            const propsData = await executeOperation(
              'akamai_papi_listProperties',
              {},
              { contractId: contract.contractId, groupId: group.groupId }
            );
            const props = propsData?.properties?.items || [];
            allProperties.push(
              ...props.map((p: any) => ({
                ...p,
                contractId: contract.contractId,
                groupId: group.groupId,
              }))
            );
          } catch {
            // Skip
          }
        }
      }

      // Deduplicate and filter
      let results = Array.from(
        new Map(allProperties.map((p) => [p.propertyId, p])).values()
      );

      if (query) {
        results = results.filter((p: any) =>
          p.propertyName?.toLowerCase().includes(query)
        );
      }

      if (activeOnly) {
        results = results.filter((p: any) => p.productionVersion != null);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                searchType: 'name',
                query,
                totalFound: results.length,
                results: results.slice(0, 50).map((p: any) => ({
                  propertyId: p.propertyId,
                  propertyName: p.propertyName,
                  latestVersion: p.latestVersion,
                  productionVersion: p.productionVersion,
                  stagingVersion: p.stagingVersion,
                })),
                fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to search properties', { error });
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
 * Get all property management tools
 */
export function getPropertyTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getPropertyDetailsTool(),
    getActivatePropertyTool(),
    getActivationStatusTool(),
    getCompareVersionsTool(),
    getSearchPropertiesTool(),
  ];
}
