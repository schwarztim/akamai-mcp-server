/**
 * Aggregation Tools
 *
 * High-level tools that combine multiple API calls into single operations.
 * These provide natural language-friendly interfaces for common workflows.
 */

import { getOperationRegistry } from '../registry/operation-registry.js';
import { getUniversalExecutor } from '../executor/universal-executor.js';
import { getLogger } from '../utils/logger.js';
import type { MCPToolDefinition, ToolHandler } from '../generator/tool-generator.js';

// Simple in-memory cache with TTL
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

/**
 * Execute an operation by tool name with simplified interface
 */
async function executeOperation(
  toolName: string,
  pathParams: Record<string, string | number> = {},
  queryParams: Record<string, string | number | boolean> = {}
): Promise<any> {
  const registry = await getOperationRegistry();
  const operation = registry.getOperation(toolName);

  if (!operation) {
    throw new Error(`Operation not found: ${toolName}`);
  }

  const executor = getUniversalExecutor();
  const result = await executor.execute(operation, {
    pathParams,
    queryParams,
    paginate: true,
    maxPages: 100,
  });

  return result.body;
}

/**
 * List All Hostnames Tool
 *
 * Aggregates hostnames from ALL properties in the account in one call.
 * Much faster than sequential: contracts → groups → properties → hostnames
 */
export function getListAllHostnamesTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_list_all_hostnames',
    description: `List ALL hostnames across your entire Akamai CDN configuration in one call.

This high-level tool aggregates data from multiple APIs in parallel:
- Lists all contracts and groups
- Lists all properties
- Gets all hostnames for each property

Use this instead of making sequential API calls. Returns hostnames grouped by property.

Options:
- includeEdgeHostnames: Include edge hostname mappings (default: true)
- includePropertyDetails: Include property version info (default: false)`,
    inputSchema: {
      type: 'object',
      properties: {
        includeEdgeHostnames: {
          type: 'boolean',
          description: 'Include edge hostname mappings',
          default: true,
        },
        includePropertyDetails: {
          type: 'boolean',
          description: 'Include property version details',
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
      // Check cache first
      const cacheKey = `hostnames-${JSON.stringify(args)}`;
      const cached = getCached<any>(cacheKey);
      if (cached) {
        logger.info('Returning cached hostname data', { cacheHit: true });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ...cached, cached: true, cacheAge: 'under 5 minutes' }, null, 2),
            },
          ],
        };
      }

      logger.info('Aggregating all hostnames - starting parallel fetch');

      // Step 1: Get all contracts
      const contractsData = await executeOperation('akamai_papi_get-contracts');
      const contracts = contractsData?.contracts?.items || [];
      logger.info(`Found ${contracts.length} contracts`);

      // Step 2: Get all groups (parallel across contracts)
      const groupPromises = contracts.map(async (contract: any) => {
        try {
          const groupsData = await executeOperation('akamai_papi_get-groups');
          return (groupsData?.groups?.items || []).map((g: any) => ({
            ...g,
            contractId: contract.contractId,
          }));
        } catch (e) {
          logger.warn(`Failed to get groups for contract ${contract.contractId}`);
          return [];
        }
      });

      const groupsArrays = await Promise.all(groupPromises);
      const allGroups = groupsArrays.flat();

      // Deduplicate groups by groupId
      const uniqueGroups = Array.from(
        new Map(allGroups.map((g: any) => [g.groupId, g])).values()
      );
      logger.info(`Found ${uniqueGroups.length} unique groups`);

      // Step 3: Get all properties (parallel across contract/group combinations)
      const seenCombinations = new Set<string>();
      const propertyPromises: Promise<any[]>[] = [];

      for (const contract of contracts) {
        for (const group of uniqueGroups as any[]) {
          const key = `${contract.contractId}-${group.groupId}`;
          if (seenCombinations.has(key)) continue;
          seenCombinations.add(key);

          propertyPromises.push(
            executeOperation('akamai_papi_get-properties', {}, {
              contractId: contract.contractId,
              groupId: group.groupId,
            })
              .then((data: any) => {
                const props = data?.properties?.items || [];
                return props.map((p: any) => ({
                  ...p,
                  contractId: contract.contractId,
                  groupId: group.groupId,
                  groupName: group.groupName,
                }));
              })
              .catch(() => {
                // Silently skip failed combinations
                return [];
              })
          );
        }
      }

      const propertiesArrays = await Promise.all(propertyPromises);
      const allProperties = propertiesArrays.flat();

      // Deduplicate properties by propertyId
      const uniqueProperties = Array.from(
        new Map(allProperties.map((p: any) => [p.propertyId, p])).values()
      ) as any[];
      logger.info(`Found ${uniqueProperties.length} unique properties`);

      // Step 4: Get hostnames for each property (parallel with concurrency limit)
      const CONCURRENCY_LIMIT = 10;
      const results: any[] = [];
      const includeEdge = args.includeEdgeHostnames !== false;

      for (let i = 0; i < uniqueProperties.length; i += CONCURRENCY_LIMIT) {
        const batch = uniqueProperties.slice(i, i + CONCURRENCY_LIMIT);
        const batchPromises = batch.map(async (property: any) => {
          try {
            const hostnamesData = await executeOperation(
              'akamai_papi_get-property-version-hostnames',
              {
                propertyId: property.propertyId,
              },
              {
                contractId: property.contractId,
                groupId: property.groupId,
                propertyVersion: property.latestVersion || 1,
              }
            );

            const hostnames = hostnamesData?.hostnames?.items || [];
            return {
              propertyId: property.propertyId,
              propertyName: property.propertyName,
              groupName: property.groupName,
              contractId: property.contractId,
              latestVersion: property.latestVersion,
              productionVersion: property.productionVersion,
              stagingVersion: property.stagingVersion,
              hostnames: hostnames.map((h: any) => ({
                cnameFrom: h.cnameFrom,
                cnameTo: includeEdge ? h.cnameTo : undefined,
                cnameType: h.cnameType,
                edgeHostnameId: includeEdge ? h.edgeHostnameId : undefined,
              })),
            };
          } catch (e: any) {
            logger.warn(`Failed to get hostnames for ${property.propertyName}`, {
              error: e.message,
            });
            return {
              propertyId: property.propertyId,
              propertyName: property.propertyName,
              hostnames: [],
              error: 'Failed to fetch hostnames',
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }

      // Build summary
      const totalHostnames = results.reduce(
        (sum, p) => sum + (p.hostnames?.length || 0),
        0
      );

      const allHostnamesList = results.flatMap((p) =>
        (p.hostnames || []).map((h: any) => ({
          hostname: h.cnameFrom,
          property: p.propertyName,
          edgeHostname: h.cnameTo,
        }))
      );

      const response = {
        summary: {
          totalContracts: contracts.length,
          totalGroups: uniqueGroups.length,
          totalProperties: uniqueProperties.length,
          totalHostnames,
          fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        },
        allHostnames: allHostnamesList,
        propertiesByGroup: results.reduce((acc: any, p) => {
          const key = p.groupName || 'Unknown';
          if (!acc[key]) acc[key] = [];
          acc[key].push({
            propertyName: p.propertyName,
            hostnames: p.hostnames?.map((h: any) => h.cnameFrom) || [],
          });
          return acc;
        }, {}),
      };

      // Cache the result
      setCache(cacheKey, response);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to aggregate hostnames', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: true,
                message: error.message,
                hint: 'Try checking individual contracts/groups with akamai_raw_request',
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
 * Account Overview Tool
 *
 * Provides a comprehensive overview of the Akamai account in one call.
 */
export function getAccountOverviewTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_account_overview',
    description: `Get a comprehensive overview of your Akamai account in one call.

Returns:
- User profile and account info
- List of contracts
- List of groups
- Property count per contract/group
- Available products

This is the fastest way to understand your Akamai setup.`,
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
      // Check cache
      const cacheKey = 'account-overview';
      const cached = getCached<any>(cacheKey);
      if (cached) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ...cached, cached: true }, null, 2),
            },
          ],
        };
      }

      logger.info('Fetching account overview - parallel API calls');

      // Execute all in parallel
      const [profileData, contractsData, groupsData] = await Promise.all([
        executeOperation('akamai_identity_management_get-user-profile').catch(() => null),
        executeOperation('akamai_papi_get-contracts').catch(() => ({ contracts: { items: [] } })),
        executeOperation('akamai_papi_get-groups').catch(() => ({ groups: { items: [] } })),
      ]);

      const contracts = contractsData?.contracts?.items || [];
      const groups = groupsData?.groups?.items || [];

      // Get property counts per contract/group combination (parallel)
      const propertyCountPromises = contracts.flatMap((contract: any) =>
        groups.slice(0, 5).map(async (group: any) => {
          try {
            const data = await executeOperation(
              'akamai_papi_get-properties',
              {},
              { contractId: contract.contractId, groupId: group.groupId }
            );
            return {
              contractId: contract.contractId,
              groupId: group.groupId,
              count: data?.properties?.items?.length || 0,
            };
          } catch {
            return { contractId: contract.contractId, groupId: group.groupId, count: 0 };
          }
        })
      );

      const propertyCounts = await Promise.all(propertyCountPromises);
      const totalProperties = propertyCounts.reduce((sum, pc) => sum + pc.count, 0);

      const response = {
        profile: profileData
          ? {
              name: `${profileData.firstName} ${profileData.lastName}`,
              email: profileData.email,
              accountId: profileData.accountId,
              lastLogin: profileData.lastLoginDate,
            }
          : null,
        account: {
          contracts: contracts.map((c: any) => ({
            contractId: c.contractId,
            name: c.contractTypeName,
          })),
          groups: groups.map((g: any) => ({
            groupId: g.groupId,
            groupName: g.groupName,
            parentGroupId: g.parentGroupId,
          })),
          totalProperties,
        },
        fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      };

      setCache(cacheKey, response);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to get account overview', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: true, message: error.message }, null, 2),
          },
        ],
      };
    }
  };

  return { definition, handler };
}

/**
 * List All Properties Tool
 *
 * Lists all properties across all contracts and groups with optional filtering.
 */
export function getListAllPropertiesTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_list_all_properties',
    description: `List ALL CDN properties across your Akamai account in one call.

Returns all properties with their metadata including:
- Property name and ID
- Contract and group associations
- Version information (latest, production, staging)
- Asset IDs

Options:
- filter: Filter properties by name (partial match)
- activeOnly: Only show properties with active production versions`,
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: 'Filter by property name (partial match, case-insensitive)',
        },
        activeOnly: {
          type: 'boolean',
          description: 'Only show properties with production versions',
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
      const cacheKey = `properties-${JSON.stringify(args)}`;
      const cached = getCached<any>(cacheKey);
      if (cached) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ...cached, cached: true }, null, 2),
            },
          ],
        };
      }

      logger.info('Aggregating all properties');

      // Get contracts and groups
      const [contractsData, groupsData] = await Promise.all([
        executeOperation('akamai_papi_get-contracts'),
        executeOperation('akamai_papi_get-groups'),
      ]);

      const contracts = contractsData?.contracts?.items || [];
      const groups = groupsData?.groups?.items || [];

      // Fetch properties for all combinations
      const seenCombinations = new Set<string>();
      const propertyPromises: Promise<any[]>[] = [];

      for (const contract of contracts) {
        for (const group of groups) {
          const key = `${contract.contractId}-${group.groupId}`;
          if (seenCombinations.has(key)) continue;
          seenCombinations.add(key);

          propertyPromises.push(
            executeOperation('akamai_papi_get-properties', {}, {
              contractId: contract.contractId,
              groupId: group.groupId,
            })
              .then((data: any) => {
                const props = data?.properties?.items || [];
                return props.map((p: any) => ({
                  ...p,
                  contractId: contract.contractId,
                  groupId: group.groupId,
                  groupName: group.groupName,
                }));
              })
              .catch(() => [])
          );
        }
      }

      const propertiesArrays = await Promise.all(propertyPromises);
      let allProperties = propertiesArrays.flat();

      // Deduplicate
      allProperties = Array.from(
        new Map(allProperties.map((p: any) => [p.propertyId, p])).values()
      );

      // Apply filters
      const filter = args.filter as string | undefined;
      const activeOnly = args.activeOnly as boolean;

      if (filter) {
        const filterLower = filter.toLowerCase();
        allProperties = allProperties.filter((p: any) =>
          p.propertyName?.toLowerCase().includes(filterLower)
        );
      }

      if (activeOnly) {
        allProperties = allProperties.filter((p: any) => p.productionVersion != null);
      }

      // Format output
      const formatted = allProperties.map((p: any) => ({
        propertyId: p.propertyId,
        propertyName: p.propertyName,
        groupName: p.groupName,
        contractId: p.contractId,
        latestVersion: p.latestVersion,
        productionVersion: p.productionVersion,
        stagingVersion: p.stagingVersion,
        assetId: p.assetId,
      }));

      const response = {
        summary: {
          total: formatted.length,
          withProduction: formatted.filter((p: any) => p.productionVersion).length,
          withStaging: formatted.filter((p: any) => p.stagingVersion).length,
          fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        },
        properties: formatted,
      };

      setCache(cacheKey, response);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to list all properties', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: true, message: error.message }, null, 2),
          },
        ],
      };
    }
  };

  return { definition, handler };
}

/**
 * Get all aggregation tools
 */
export function getAggregationTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getListAllHostnamesTool(),
    getAccountOverviewTool(),
    getListAllPropertiesTool(),
  ];
}
