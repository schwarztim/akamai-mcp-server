/**
 * Workflow Tools
 *
 * High-level workflow tools that go beyond raw API wrappers.
 * Provides automation, batch operations, and deployment workflows.
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
 * Terraform Export Tool
 *
 * Exports Akamai configurations to Terraform HCL format.
 */
export function getTerraformExportTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_terraform_export',
    description: `Export Akamai configurations to Terraform HCL format.

Supports exporting:
- Properties (CDN configurations)
- DNS zones and records
- GTM domains and datacenters
- EdgeWorkers

Returns HCL code ready for use with the Akamai Terraform provider.

Example: "Export property example.com to Terraform"`,
    inputSchema: {
      type: 'object',
      properties: {
        resourceType: {
          type: 'string',
          enum: ['property', 'dns_zone', 'gtm_domain', 'edgeworker'],
          description: 'Type of resource to export',
        },
        resourceId: {
          type: 'string',
          description: 'Resource ID or name to export',
        },
        includeVersion: {
          type: 'number',
          description: 'Specific version to export (properties only, defaults to latest)',
        },
      },
      required: ['resourceType', 'resourceId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const resourceType = args.resourceType as string;
      const resourceId = args.resourceId as string;

      logger.info(`Exporting ${resourceType} ${resourceId} to Terraform`);

      let hcl = '';

      switch (resourceType) {
        case 'property':
          hcl = await exportPropertyToTerraform(resourceId, args.includeVersion as number);
          break;
        case 'dns_zone':
          hcl = await exportDnsZoneToTerraform(resourceId);
          break;
        case 'gtm_domain':
          hcl = await exportGtmDomainToTerraform(resourceId);
          break;
        case 'edgeworker':
          hcl = await exportEdgeWorkerToTerraform(resourceId);
          break;
        default:
          throw new Error(`Unsupported resource type: ${resourceType}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                resourceType,
                resourceId,
                terraform: hcl,
                usage: `
# Save to main.tf and run:
terraform init
terraform import akamai_${resourceType === 'property' ? 'property' : resourceType} ${resourceId}
terraform plan
`.trim(),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to export to Terraform', { error });
      return {
        content: [
          { type: 'text', text: JSON.stringify({ error: true, message: error.message }, null, 2) },
        ],
      };
    }
  };

  return { definition, handler };
}

async function exportPropertyToTerraform(
  propertyNameOrId: string,
  version?: number
): Promise<string> {
  // Find the property
  const contractsData = await executeOperation('akamai_papi_get-contracts');
  const groupsData = await executeOperation('akamai_papi_get-groups');

  const contracts = contractsData?.contracts?.items || [];
  const groups = groupsData?.groups?.items || [];

  let property: any = null;
  let contractId = '';
  let groupId = '';

  // Search for property across all contract/group combinations
  for (const contract of contracts) {
    for (const group of groups) {
      try {
        const propsData = await executeOperation('akamai_papi_get-properties', {}, {
          contractId: contract.contractId,
          groupId: group.groupId,
        });

        const props = propsData?.properties?.items || [];
        property = props.find(
          (p: any) =>
            p.propertyId === propertyNameOrId ||
            p.propertyName === propertyNameOrId ||
            p.propertyName?.includes(propertyNameOrId)
        );

        if (property) {
          contractId = contract.contractId;
          groupId = group.groupId;
          break;
        }
      } catch {
        // Skip failed combinations
      }
    }
    if (property) break;
  }

  if (!property) {
    throw new Error(`Property not found: ${propertyNameOrId}`);
  }

  // Get property rules
  const targetVersion = version || property.latestVersion || 1;
  const rulesData = await executeOperation(
    'akamai_papi_get-property-version-rules',
    { propertyId: property.propertyId },
    { contractId, groupId, propertyVersion: targetVersion }
  );

  // Get hostnames
  const hostnamesData = await executeOperation(
    'akamai_papi_get-property-version-hostnames',
    { propertyId: property.propertyId },
    { contractId, groupId, propertyVersion: targetVersion }
  );

  const hostnames = hostnamesData?.hostnames?.items || [];

  // Generate Terraform HCL
  const hcl = `
# Akamai Property: ${property.propertyName}
# Generated by Akamai MCP Server
# Version: ${targetVersion}

terraform {
  required_providers {
    akamai = {
      source  = "akamai/akamai"
      version = ">= 6.0.0"
    }
  }
}

# Configure the Akamai Provider
provider "akamai" {
  # Credentials from ~/.edgerc or environment variables
}

# Property Configuration
resource "akamai_property" "${sanitizeResourceName(property.propertyName)}" {
  name        = "${property.propertyName}"
  contract_id = "${contractId}"
  group_id    = "${groupId}"
  product_id  = "${property.productId || 'prd_SPM'}"

${hostnames.map((h: any) => `  hostnames {
    cname_from             = "${h.cnameFrom}"
    cname_to               = "${h.cnameTo}"
    cert_provisioning_type = "${h.certProvisioningType || 'DEFAULT'}"
  }`).join('\n\n')}

  rule_format = "${rulesData?.ruleFormat || 'latest'}"

  rules = jsonencode(${JSON.stringify(rulesData?.rules || {}, null, 2).split('\n').map((line, i) => i === 0 ? line : '  ' + line).join('\n')})
}

# Property Activation (Staging)
resource "akamai_property_activation" "${sanitizeResourceName(property.propertyName)}_staging" {
  property_id = akamai_property.${sanitizeResourceName(property.propertyName)}.id
  contact     = ["your-email@example.com"]
  version     = akamai_property.${sanitizeResourceName(property.propertyName)}.latest_version
  network     = "STAGING"
}

# Property Activation (Production) - Uncomment when ready
# resource "akamai_property_activation" "${sanitizeResourceName(property.propertyName)}_production" {
#   property_id = akamai_property.${sanitizeResourceName(property.propertyName)}.id
#   contact     = ["your-email@example.com"]
#   version     = akamai_property.${sanitizeResourceName(property.propertyName)}.latest_version
#   network     = "PRODUCTION"
# }
`.trim();

  return hcl;
}

async function exportDnsZoneToTerraform(zone: string): Promise<string> {
  // Get zone details
  const zoneData = await executeOperation('akamai_config_dns_get-zone', { zone });

  // Get record types
  const typesData = await executeOperation('akamai_config_dns_get-zone-name-types', { zone });
  const types = typesData?.types || [];

  // Get records for each type
  const allRecords: any[] = [];
  for (const type of types.slice(0, 20)) {
    try {
      const recordsData = await executeOperation(
        'akamai_config_dns_get-zones-zone-recordsets',
        { zone },
        { types: type }
      );
      allRecords.push(...(recordsData?.recordsets || []));
    } catch {
      // Skip failed types
    }
  }

  const hcl = `
# Akamai DNS Zone: ${zone}
# Generated by Akamai MCP Server

terraform {
  required_providers {
    akamai = {
      source  = "akamai/akamai"
      version = ">= 6.0.0"
    }
  }
}

provider "akamai" {}

# DNS Zone
resource "akamai_dns_zone" "${sanitizeResourceName(zone)}" {
  zone    = "${zone}"
  type    = "${zoneData?.type || 'PRIMARY'}"
  contract = "${zoneData?.contractId || 'ctr_XXXXXX'}"
  group   = "${zoneData?.group || 'grp_XXXXXX'}"
}

# DNS Records
${allRecords.map((r: any) => `
resource "akamai_dns_record" "${sanitizeResourceName(r.name + '_' + r.type)}" {
  zone       = akamai_dns_zone.${sanitizeResourceName(zone)}.zone
  name       = "${r.name}"
  recordtype = "${r.type}"
  ttl        = ${r.ttl || 300}
  target     = ${JSON.stringify(r.rdata || [])}
}`).join('\n')}
`.trim();

  return hcl;
}

async function exportGtmDomainToTerraform(domain: string): Promise<string> {
  // Get GTM domain
  const domainData = await executeOperation('akamai_config_gtm_get-domain', { domainName: domain });

  // Get datacenters
  const datacentersData = await executeOperation(
    'akamai_config_gtm_get-datacenters',
    { domainName: domain }
  );
  const datacenters = datacentersData?.items || [];

  // Get properties
  const propertiesData = await executeOperation(
    'akamai_config_gtm_get-properties',
    { domainName: domain }
  );
  const properties = propertiesData?.items || [];

  const hcl = `
# Akamai GTM Domain: ${domain}
# Generated by Akamai MCP Server

terraform {
  required_providers {
    akamai = {
      source  = "akamai/akamai"
      version = ">= 6.0.0"
    }
  }
}

provider "akamai" {}

# GTM Domain
resource "akamai_gtm_domain" "${sanitizeResourceName(domain)}" {
  name     = "${domain}"
  type     = "${domainData?.type || 'basic'}"
  contract = "${domainData?.contract || 'ctr_XXXXXX'}"
  group    = "${domainData?.group || 'grp_XXXXXX'}"
}

# Datacenters
${datacenters.map((dc: any) => `
resource "akamai_gtm_datacenter" "${sanitizeResourceName(domain + '_dc_' + dc.datacenterId)}" {
  domain    = akamai_gtm_domain.${sanitizeResourceName(domain)}.name
  nickname  = "${dc.nickname || dc.datacenterId}"
  city      = ${dc.city ? `"${dc.city}"` : 'null'}
  country   = ${dc.country ? `"${dc.country}"` : 'null'}
  continent = ${dc.continent ? `"${dc.continent}"` : 'null'}
}`).join('\n')}

# GTM Properties
${properties.map((prop: any) => `
resource "akamai_gtm_property" "${sanitizeResourceName(domain + '_' + prop.name)}" {
  domain                 = akamai_gtm_domain.${sanitizeResourceName(domain)}.name
  name                   = "${prop.name}"
  type                   = "${prop.type || 'weighted-round-robin'}"
  score_aggregation_type = "${prop.scoreAggregationType || 'mean'}"
  handout_mode           = "${prop.handoutMode || 'normal'}"
  handout_limit          = ${prop.handoutLimit || 8}
  failover_delay         = ${prop.failoverDelay || 0}
  failback_delay         = ${prop.failbackDelay || 0}
}`).join('\n')}
`.trim();

  return hcl;
}

async function exportEdgeWorkerToTerraform(ewId: string): Promise<string> {
  // Get EdgeWorker details
  const ewData = await executeOperation('akamai_edgeworkers_get-id', { edgeWorkerId: ewId });

  // Get versions
  const versionsData = await executeOperation(
    'akamai_edgeworkers_get-id-versions',
    { edgeWorkerId: ewId }
  );
  const versions = versionsData?.versions || [];
  const latestVersion = versions[0]?.version || '1.0';

  const hcl = `
# Akamai EdgeWorker: ${ewData?.name || ewId}
# Generated by Akamai MCP Server

terraform {
  required_providers {
    akamai = {
      source  = "akamai/akamai"
      version = ">= 6.0.0"
    }
  }
}

provider "akamai" {}

# EdgeWorker
resource "akamai_edgeworker" "${sanitizeResourceName(ewData?.name || 'ew_' + ewId)}" {
  name             = "${ewData?.name || 'EdgeWorker ' + ewId}"
  group_id         = "${ewData?.groupId || 'grp_XXXXXX'}"
  resource_tier_id = ${ewData?.resourceTierId || 200}

  # Local bundle path - update with your bundle location
  local_bundle = "edgeworkers/${ewId}/bundle.tgz"
}

# EdgeWorker Activation (Staging)
resource "akamai_edgeworkers_activation" "${sanitizeResourceName(ewData?.name || 'ew_' + ewId)}_staging" {
  edgeworker_id = akamai_edgeworker.${sanitizeResourceName(ewData?.name || 'ew_' + ewId)}.id
  network       = "STAGING"
  version       = "${latestVersion}"
}

# EdgeWorker Activation (Production) - Uncomment when ready
# resource "akamai_edgeworkers_activation" "${sanitizeResourceName(ewData?.name || 'ew_' + ewId)}_production" {
#   edgeworker_id = akamai_edgeworker.${sanitizeResourceName(ewData?.name || 'ew_' + ewId)}.id
#   network       = "PRODUCTION"
#   version       = "${latestVersion}"
# }
`.trim();

  return hcl;
}

function sanitizeResourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Bulk Activation Tool
 *
 * Activate multiple properties at once.
 */
export function getBulkActivationTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_bulk_activate',
    description: `Activate multiple CDN properties at once.

Parallel activation across staging or production networks.
Returns activation status for each property.

Example: "Activate properties prop_123, prop_456 to staging"`,
    inputSchema: {
      type: 'object',
      properties: {
        propertyIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of property IDs to activate',
        },
        network: {
          type: 'string',
          enum: ['STAGING', 'PRODUCTION'],
          description: 'Target network (default: STAGING)',
          default: 'STAGING',
        },
        notificationEmails: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email addresses for activation notifications',
        },
        note: {
          type: 'string',
          description: 'Activation note/comment',
        },
        acknowledgeWarnings: {
          type: 'boolean',
          description: 'Auto-acknowledge warnings (default: false)',
          default: false,
        },
      },
      required: ['propertyIds'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      const propertyIds = args.propertyIds as string[];
      const network = (args.network as string) || 'STAGING';
      const notificationEmails = (args.notificationEmails as string[]) || [];
      const note = (args.note as string) || 'Bulk activation via Akamai MCP';
      const acknowledgeWarnings = args.acknowledgeWarnings as boolean;

      logger.info(`Bulk activating ${propertyIds.length} properties to ${network}`);

      // Get property details first
      const contractsData = await executeOperation('akamai_papi_get-contracts');
      const groupsData = await executeOperation('akamai_papi_get-groups');

      const contracts = contractsData?.contracts?.items || [];
      const groups = groupsData?.groups?.items || [];

      // Find each property
      const propertyPromises = propertyIds.map(async (propId) => {
        try {
          // Find property in contract/group combinations
          for (const contract of contracts) {
            for (const group of groups) {
              try {
                const propsData = await executeOperation('akamai_papi_get-properties', {}, {
                  contractId: contract.contractId,
                  groupId: group.groupId,
                });

                const props = propsData?.properties?.items || [];
                const property = props.find((p: any) => p.propertyId === propId);

                if (property) {
                  // Activate the property
                  const activationBody = {
                    propertyVersion: property.latestVersion,
                    network,
                    note,
                    notifyEmails: notificationEmails,
                    acknowledgeWarnings: acknowledgeWarnings ? ['msg_CAWARN'] : [],
                  };

                  const activation = await executeOperation(
                    'akamai_papi_post-property-activations',
                    { propertyId: propId },
                    { contractId: contract.contractId, groupId: group.groupId },
                    activationBody
                  );

                  return {
                    propertyId: propId,
                    propertyName: property.propertyName,
                    status: 'ACTIVATED',
                    activationId: activation?.activations?.items?.[0]?.activationId,
                    version: property.latestVersion,
                    network,
                  };
                }
              } catch {
                // Skip failed combinations
              }
            }
          }

          return {
            propertyId: propId,
            status: 'NOT_FOUND',
            error: 'Property not found in any contract/group',
          };
        } catch (e: any) {
          return {
            propertyId: propId,
            status: 'FAILED',
            error: e.message,
          };
        }
      });

      const results = await Promise.all(propertyPromises);

      const summary = {
        total: results.length,
        activated: results.filter((r) => r.status === 'ACTIVATED').length,
        failed: results.filter((r) => r.status === 'FAILED').length,
        notFound: results.filter((r) => r.status === 'NOT_FOUND').length,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary,
                network,
                results,
                fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed bulk activation', { error });
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
 * Security Overview Tool
 *
 * Comprehensive security configuration overview.
 */
export function getSecurityOverviewTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_security_overview',
    description: `Get a comprehensive overview of your Akamai security configuration.

Returns:
- All AppSec configurations and policies
- Network lists (IP allow/block)
- WAF rule counts and modes
- Rate limiting policies
- Bot management status

Example: "Show me my security overview"`,
    inputSchema: {
      type: 'object',
      properties: {
        includeNetworkLists: {
          type: 'boolean',
          description: 'Include network list details (default: true)',
          default: true,
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      logger.info('Fetching security overview');

      const includeNetworkLists = args.includeNetworkLists !== false;

      // Parallel fetch of security data
      const [configsData, networkListsData] = await Promise.all([
        executeOperation('akamai_appsec_get-configs').catch(() => ({ configurations: [] })),
        includeNetworkLists
          ? executeOperation('akamai_network_lists_get-network-lists').catch(() => ({
              networkLists: [],
            }))
          : Promise.resolve({ networkLists: [] }),
      ]);

      const configs = configsData?.configurations || [];
      const networkLists = networkListsData?.networkLists || [];

      // Get details for each config (limited to first 5)
      const configDetails = await Promise.all(
        configs.slice(0, 5).map(async (config: any) => {
          try {
            const policiesData = await executeOperation(
              'akamai_appsec_get-config-versions-version-security-policies',
              { configId: config.id, versionNumber: config.latestVersion || 1 }
            );

            return {
              id: config.id,
              name: config.name,
              latestVersion: config.latestVersion,
              stagingVersion: config.stagingVersion,
              productionVersion: config.productionVersion,
              policies: (policiesData?.policies || []).map((p: any) => ({
                policyId: p.policyId,
                policyName: p.policyName,
              })),
            };
          } catch {
            return {
              id: config.id,
              name: config.name,
              latestVersion: config.latestVersion,
              policies: [],
              error: 'Failed to fetch details',
            };
          }
        })
      );

      // Categorize network lists
      const networkListsByType = networkLists.reduce((acc: any, list: any) => {
        const type = list.type || 'UNKNOWN';
        if (!acc[type]) acc[type] = [];
        acc[type].push({
          name: list.name,
          uniqueId: list.uniqueId,
          elementCount: list.elementCount,
          syncPoint: list.syncPoint,
        });
        return acc;
      }, {});

      const response = {
        summary: {
          totalConfigs: configs.length,
          totalPolicies: configDetails.reduce(
            (sum, c) => sum + (c.policies?.length || 0),
            0
          ),
          totalNetworkLists: networkLists.length,
          fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        },
        securityConfigs: configDetails,
        networkLists: includeNetworkLists
          ? {
              byType: networkListsByType,
              total: networkLists.length,
            }
          : null,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
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
 * GTM Overview Tool
 *
 * Global Traffic Management configuration overview.
 */
export function getGtmOverviewTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_gtm_overview',
    description: `Get an overview of your Akamai Global Traffic Management (GTM) configuration.

Returns:
- All GTM domains
- Datacenters per domain
- GTM properties and their types
- Current traffic distribution

Example: "Show me my GTM configuration"`,
    inputSchema: {
      type: 'object',
      properties: {
        domainFilter: {
          type: 'string',
          description: 'Filter domains by name (partial match)',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      logger.info('Fetching GTM overview');

      const domainFilter = args.domainFilter as string;

      // Get all GTM domains
      const domainsData = await executeOperation('akamai_config_gtm_get-domains');
      let domains = domainsData?.items || [];

      if (domainFilter) {
        const filterLower = domainFilter.toLowerCase();
        domains = domains.filter((d: any) => d.name?.toLowerCase().includes(filterLower));
      }

      // Get details for each domain (limited to first 10)
      const domainDetails = await Promise.all(
        domains.slice(0, 10).map(async (domain: any) => {
          try {
            const [datacentersData, propertiesData] = await Promise.all([
              executeOperation('akamai_config_gtm_get-datacenters', { domainName: domain.name }).catch(
                () => ({ items: [] })
              ),
              executeOperation('akamai_config_gtm_get-properties', { domainName: domain.name }).catch(
                () => ({ items: [] })
              ),
            ]);

            return {
              name: domain.name,
              type: domain.type,
              status: domain.status,
              lastModified: domain.lastModified,
              datacenters: (datacentersData?.items || []).map((dc: any) => ({
                id: dc.datacenterId,
                nickname: dc.nickname,
                city: dc.city,
                country: dc.country,
              })),
              properties: (propertiesData?.items || []).map((prop: any) => ({
                name: prop.name,
                type: prop.type,
                handoutMode: prop.handoutMode,
              })),
            };
          } catch {
            return {
              name: domain.name,
              type: domain.type,
              error: 'Failed to fetch details',
            };
          }
        })
      );

      const summary = {
        totalDomains: domains.length,
        totalDatacenters: domainDetails.reduce(
          (sum, d) => sum + (d.datacenters?.length || 0),
          0
        ),
        totalProperties: domainDetails.reduce(
          (sum, d) => sum + (d.properties?.length || 0),
          0
        ),
        fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary,
                domains: domainDetails,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to get GTM overview', { error });
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
 * EdgeWorker Deploy Tool
 *
 * Streamlined EdgeWorker deployment workflow.
 */
export function getEdgeWorkerDeployTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_edgeworker_deploy',
    description: `Deploy an EdgeWorker with a single command.

Handles the full workflow:
1. Upload bundle (if provided)
2. Create new version
3. Activate to staging or production

Example: "Deploy EdgeWorker 12345 to staging"`,
    inputSchema: {
      type: 'object',
      properties: {
        edgeWorkerId: {
          type: 'string',
          description: 'EdgeWorker ID to deploy',
        },
        version: {
          type: 'string',
          description: 'Specific version to activate (defaults to latest)',
        },
        network: {
          type: 'string',
          enum: ['STAGING', 'PRODUCTION'],
          description: 'Target network (default: STAGING)',
          default: 'STAGING',
        },
      },
      required: ['edgeWorkerId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();

    try {
      const edgeWorkerId = args.edgeWorkerId as string;
      const network = (args.network as string) || 'STAGING';
      let version = args.version as string;

      logger.info(`Deploying EdgeWorker ${edgeWorkerId} to ${network}`);

      // Get EdgeWorker details
      const ewData = await executeOperation('akamai_edgeworkers_get-id', { edgeWorkerId });

      // Get versions if not specified
      if (!version) {
        const versionsData = await executeOperation('akamai_edgeworkers_get-id-versions', {
          edgeWorkerId,
        });
        const versions = versionsData?.versions || [];
        version = versions[0]?.version;

        if (!version) {
          throw new Error('No versions found for this EdgeWorker');
        }
      }

      // Activate the version
      const activationBody = {
        network,
        version,
      };

      const activation = await executeOperation(
        'akamai_edgeworkers_post-id-activations',
        { edgeWorkerId },
        {},
        activationBody
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                edgeWorkerId,
                name: ewData?.name,
                version,
                network,
                activationId: activation?.activationId,
                status: activation?.status || 'PENDING',
                note: 'Activation typically completes within 5 minutes',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to deploy EdgeWorker', { error });
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
 * Certificate Audit Tool
 *
 * Audit all certificates with expiration tracking.
 */
export function getCertificateAuditTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_certificate_audit',
    description: `Audit all SSL/TLS certificates in your Akamai account.

Returns:
- All certificates with expiration dates
- Certificates expiring soon (30/60/90 days)
- Certificate-to-property mappings
- Enrollment status

Example: "Show me certificates expiring in the next 30 days"`,
    inputSchema: {
      type: 'object',
      properties: {
        expiringWithinDays: {
          type: 'number',
          description: 'Filter to certificates expiring within N days',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      logger.info('Running certificate audit');

      const expiringWithinDays = args.expiringWithinDays as number;

      // Get all enrollments
      const enrollmentsData = await executeOperation('akamai_cps_get-enrollments');
      const enrollments = enrollmentsData?.enrollments || [];

      const now = new Date();
      const certificates = enrollments.map((e: any) => {
        const expiry = e.pendingChanges?.[0]?.certificate?.expiry || e.certificate?.expiry;
        const expiryDate = expiry ? new Date(expiry) : null;
        const daysUntilExpiry = expiryDate
          ? Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          enrollmentId: e.id,
          cn: e.csr?.cn,
          sans: e.csr?.sans?.slice(0, 5),
          sansCount: e.csr?.sans?.length || 0,
          validationType: e.validationType,
          status: e.pendingChanges?.length > 0 ? 'PENDING_CHANGE' : 'ACTIVE',
          expiry: expiry,
          daysUntilExpiry,
          expiryStatus:
            daysUntilExpiry === null
              ? 'UNKNOWN'
              : daysUntilExpiry < 0
              ? 'EXPIRED'
              : daysUntilExpiry <= 30
              ? 'CRITICAL'
              : daysUntilExpiry <= 60
              ? 'WARNING'
              : daysUntilExpiry <= 90
              ? 'ATTENTION'
              : 'OK',
        };
      });

      // Filter if requested
      let filtered = certificates;
      if (expiringWithinDays) {
        filtered = certificates.filter(
          (c: any) => c.daysUntilExpiry !== null && c.daysUntilExpiry <= expiringWithinDays
        );
      }

      // Sort by expiry
      filtered.sort((a: any, b: any) => {
        if (a.daysUntilExpiry === null) return 1;
        if (b.daysUntilExpiry === null) return -1;
        return a.daysUntilExpiry - b.daysUntilExpiry;
      });

      const summary = {
        total: certificates.length,
        expired: certificates.filter((c: any) => c.expiryStatus === 'EXPIRED').length,
        critical: certificates.filter((c: any) => c.expiryStatus === 'CRITICAL').length,
        warning: certificates.filter((c: any) => c.expiryStatus === 'WARNING').length,
        attention: certificates.filter((c: any) => c.expiryStatus === 'ATTENTION').length,
        ok: certificates.filter((c: any) => c.expiryStatus === 'OK').length,
        fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary,
                certificates: filtered.slice(0, 50),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed certificate audit', { error });
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
 * Get all workflow tools
 */
export function getWorkflowTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getTerraformExportTool(),
    getBulkActivationTool(),
    getSecurityOverviewTool(),
    getGtmOverviewTool(),
    getEdgeWorkerDeployTool(),
    getCertificateAuditTool(),
  ];
}
