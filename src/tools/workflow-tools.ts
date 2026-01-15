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
 * Bulk Onboarding Tool
 *
 * Create multiple properties from a configuration list.
 */
export function getBulkOnboardingTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_bulk_onboard',
    description: `Onboard multiple hostnames/properties in a single operation.

Accepts a list of hostname configurations and creates:
- Edge hostnames
- Properties with basic CDN rules
- Optional: Attaches to security configuration

Example: "Onboard www.example.com and api.example.com to Akamai"`,
    inputSchema: {
      type: 'object',
      properties: {
        hostnames: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              hostname: { type: 'string', description: 'Customer-facing hostname (e.g., www.example.com)' },
              origin: { type: 'string', description: 'Origin server hostname' },
              originPort: { type: 'number', description: 'Origin port (default: 443)', default: 443 },
              forwardHostHeader: { type: 'string', enum: ['REQUEST_HOST_HEADER', 'ORIGIN_HOSTNAME'], default: 'REQUEST_HOST_HEADER' },
            },
            required: ['hostname', 'origin'],
          },
          description: 'List of hostname configurations to onboard',
        },
        contractId: {
          type: 'string',
          description: 'Contract ID for the new properties',
        },
        groupId: {
          type: 'string',
          description: 'Group ID for the new properties',
        },
        productId: {
          type: 'string',
          description: 'Product ID (default: prd_SPM for Ion)',
          default: 'prd_SPM',
        },
        edgeHostnameSuffix: {
          type: 'string',
          description: 'Edge hostname suffix (default: edgesuite.net)',
          default: 'edgesuite.net',
        },
        secureNetwork: {
          type: 'string',
          enum: ['STANDARD_TLS', 'ENHANCED_TLS', 'SHARED_CERT'],
          description: 'SSL/TLS type (default: ENHANCED_TLS)',
          default: 'ENHANCED_TLS',
        },
        activateStaging: {
          type: 'boolean',
          description: 'Automatically activate to staging (default: false)',
          default: false,
        },
      },
      required: ['hostnames', 'contractId', 'groupId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      const hostnames = args.hostnames as Array<{
        hostname: string;
        origin: string;
        originPort?: number;
        forwardHostHeader?: string;
      }>;
      const contractId = args.contractId as string;
      const groupId = args.groupId as string;
      const productId = (args.productId as string) || 'prd_SPM';
      const edgeHostnameSuffix = (args.edgeHostnameSuffix as string) || 'edgesuite.net';
      const secureNetwork = (args.secureNetwork as string) || 'ENHANCED_TLS';
      const activateStaging = args.activateStaging as boolean;

      logger.info(`Bulk onboarding ${hostnames.length} hostnames`);

      const results: any[] = [];

      for (const config of hostnames) {
        try {
          const propertyName = config.hostname.replace(/\./g, '-');
          const edgeHostname = `${propertyName}.${edgeHostnameSuffix}`;

          // Step 1: Create edge hostname
          logger.info(`Creating edge hostname: ${edgeHostname}`);

          try {
            await executeOperation(
              'akamai_papi_post-edgehostnames',
              {},
              { contractId, groupId },
              {
                productId,
                domainPrefix: propertyName,
                domainSuffix: edgeHostnameSuffix,
                secureNetwork,
                ipVersionBehavior: 'IPV6_COMPLIANCE',
              }
            );
          } catch (e: any) {
            // Edge hostname might already exist
            if (!e.message?.includes('already exists')) {
              throw e;
            }
            logger.info(`Edge hostname already exists: ${edgeHostname}`);
          }

          // Step 2: Create property
          logger.info(`Creating property: ${propertyName}`);
          const propertyResult = await executeOperation(
            'akamai_papi_post-properties',
            {},
            { contractId, groupId },
            {
              productId,
              propertyName,
            }
          );

          const propertyId = propertyResult?.propertyLink?.split('/')?.pop()?.split('?')[0];
          if (!propertyId) {
            throw new Error('Failed to create property - no propertyId returned');
          }

          // Step 3: Add hostname to property
          logger.info(`Adding hostname ${config.hostname} to property`);
          await executeOperation(
            'akamai_papi_put-property-version-hostnames',
            { propertyId },
            { contractId, groupId, propertyVersion: 1 },
            {
              add: [
                {
                  cnameFrom: config.hostname,
                  cnameTo: edgeHostname,
                  cnameType: 'EDGE_HOSTNAME',
                },
              ],
            }
          );

          // Step 4: Set basic rules with origin
          logger.info(`Configuring origin: ${config.origin}`);
          const basicRules = {
            rules: {
              name: 'default',
              behaviors: [
                {
                  name: 'origin',
                  options: {
                    originType: 'CUSTOMER',
                    hostname: config.origin,
                    httpPort: 80,
                    httpsPort: config.originPort || 443,
                    forwardHostHeader: config.forwardHostHeader || 'REQUEST_HOST_HEADER',
                    cacheKeyHostname: 'ORIGIN_HOSTNAME',
                  },
                },
                {
                  name: 'cpCode',
                  options: {
                    value: {
                      id: 0, // Will be auto-generated
                      name: propertyName,
                    },
                  },
                },
              ],
              children: [],
            },
          };

          await executeOperation(
            'akamai_papi_put-property-version-rules',
            { propertyId },
            { contractId, groupId, propertyVersion: 1 },
            basicRules
          );

          // Step 5: Optionally activate to staging
          let activationId: string | undefined;
          if (activateStaging) {
            logger.info(`Activating ${propertyName} to staging`);
            const activationResult = await executeOperation(
              'akamai_papi_post-property-activations',
              { propertyId },
              { contractId, groupId },
              {
                propertyVersion: 1,
                network: 'STAGING',
                note: 'Bulk onboarding activation',
                notifyEmails: [],
              }
            );
            activationId = activationResult?.activations?.items?.[0]?.activationId;
          }

          results.push({
            hostname: config.hostname,
            status: 'SUCCESS',
            propertyId,
            propertyName,
            edgeHostname,
            activationId,
          });
        } catch (e: any) {
          logger.error(`Failed to onboard ${config.hostname}`, { error: e.message });
          results.push({
            hostname: config.hostname,
            status: 'FAILED',
            error: e.message,
          });
        }
      }

      const summary = {
        total: results.length,
        success: results.filter((r) => r.status === 'SUCCESS').length,
        failed: results.filter((r) => r.status === 'FAILED').length,
        fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ summary, results }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed bulk onboarding', { error });
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
 * Environment Deployment Tool
 *
 * Deploy property configurations across environments with variable substitution.
 */
export function getEnvironmentDeployTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_environment_deploy',
    description: `Deploy a property configuration to a different environment with variable substitution.

Supports:
- Cloning property rules from source to target
- Variable substitution for environment-specific values
- Origin, hostname, and CP code remapping
- Automatic version creation and activation

Example: "Deploy property from staging to production with production origins"`,
    inputSchema: {
      type: 'object',
      properties: {
        sourcePropertyId: {
          type: 'string',
          description: 'Source property ID to clone from',
        },
        sourceVersion: {
          type: 'number',
          description: 'Source property version (defaults to latest)',
        },
        targetPropertyId: {
          type: 'string',
          description: 'Target property ID to deploy to (creates new version)',
        },
        variables: {
          type: 'object',
          description: 'Variable substitutions as key-value pairs',
          additionalProperties: { type: 'string' },
        },
        originMapping: {
          type: 'object',
          description: 'Origin hostname mappings (source -> target)',
          additionalProperties: { type: 'string' },
        },
        targetNetwork: {
          type: 'string',
          enum: ['STAGING', 'PRODUCTION'],
          description: 'Network to activate on after deployment',
        },
        note: {
          type: 'string',
          description: 'Deployment note/comment',
        },
      },
      required: ['sourcePropertyId', 'targetPropertyId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      const sourcePropertyId = args.sourcePropertyId as string;
      const sourceVersion = args.sourceVersion as number;
      const targetPropertyId = args.targetPropertyId as string;
      const variables = (args.variables as Record<string, string>) || {};
      const originMapping = (args.originMapping as Record<string, string>) || {};
      const targetNetwork = args.targetNetwork as string;
      const note = (args.note as string) || 'Environment deployment via Akamai MCP';

      logger.info(`Deploying from ${sourcePropertyId} to ${targetPropertyId}`);

      // Get source property context
      const contractsData = await executeOperation('akamai_papi_get-contracts');
      const groupsData = await executeOperation('akamai_papi_get-groups');
      const contracts = contractsData?.contracts?.items || [];
      const groups = groupsData?.groups?.items || [];

      // Find source property
      let sourceProperty: any = null;
      let contractId = '';
      let groupId = '';

      for (const contract of contracts) {
        for (const group of groups) {
          try {
            const propsData = await executeOperation('akamai_papi_get-properties', {}, {
              contractId: contract.contractId,
              groupId: group.groupId,
            });
            const prop = propsData?.properties?.items?.find(
              (p: any) => p.propertyId === sourcePropertyId
            );
            if (prop) {
              sourceProperty = prop;
              contractId = contract.contractId;
              groupId = group.groupId;
              break;
            }
          } catch {
            // Skip
          }
        }
        if (sourceProperty) break;
      }

      if (!sourceProperty) {
        throw new Error(`Source property not found: ${sourcePropertyId}`);
      }

      // Get source rules
      const version = sourceVersion || sourceProperty.latestVersion || 1;
      const rulesData = await executeOperation(
        'akamai_papi_get-property-version-rules',
        { propertyId: sourcePropertyId },
        { contractId, groupId, propertyVersion: version }
      );

      // Apply transformations
      let rulesJson = JSON.stringify(rulesData.rules);

      // Variable substitution (${VAR_NAME} pattern)
      for (const [key, value] of Object.entries(variables)) {
        const pattern = new RegExp(`\\$\\{${key}\\}`, 'g');
        rulesJson = rulesJson.replace(pattern, value);
      }

      // Origin mapping
      for (const [source, target] of Object.entries(originMapping)) {
        rulesJson = rulesJson.replace(new RegExp(source, 'g'), target);
      }

      const transformedRules = JSON.parse(rulesJson);

      // Find target property
      let targetProperty: any = null;
      let targetContractId = '';
      let targetGroupId = '';

      for (const contract of contracts) {
        for (const group of groups) {
          try {
            const propsData = await executeOperation('akamai_papi_get-properties', {}, {
              contractId: contract.contractId,
              groupId: group.groupId,
            });
            const prop = propsData?.properties?.items?.find(
              (p: any) => p.propertyId === targetPropertyId
            );
            if (prop) {
              targetProperty = prop;
              targetContractId = contract.contractId;
              targetGroupId = group.groupId;
              break;
            }
          } catch {
            // Skip
          }
        }
        if (targetProperty) break;
      }

      if (!targetProperty) {
        throw new Error(`Target property not found: ${targetPropertyId}`);
      }

      // Create new version on target
      const newVersionResult = await executeOperation(
        'akamai_papi_post-property-versions',
        { propertyId: targetPropertyId },
        { contractId: targetContractId, groupId: targetGroupId },
        {
          createFromVersion: targetProperty.latestVersion || 1,
        }
      );

      const newVersion = newVersionResult?.versionLink?.match(/versions\/(\d+)/)?.[1] ||
                         (targetProperty.latestVersion || 0) + 1;

      // Update rules on new version
      await executeOperation(
        'akamai_papi_put-property-version-rules',
        { propertyId: targetPropertyId },
        { contractId: targetContractId, groupId: targetGroupId, propertyVersion: newVersion },
        { rules: transformedRules }
      );

      // Optionally activate
      let activationId: string | undefined;
      if (targetNetwork) {
        const activationResult = await executeOperation(
          'akamai_papi_post-property-activations',
          { propertyId: targetPropertyId },
          { contractId: targetContractId, groupId: targetGroupId },
          {
            propertyVersion: newVersion,
            network: targetNetwork,
            note,
            notifyEmails: [],
          }
        );
        activationId = activationResult?.activations?.items?.[0]?.activationId;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                source: {
                  propertyId: sourcePropertyId,
                  propertyName: sourceProperty.propertyName,
                  version,
                },
                target: {
                  propertyId: targetPropertyId,
                  propertyName: targetProperty.propertyName,
                  newVersion,
                  activationId,
                  network: targetNetwork,
                },
                transformations: {
                  variablesApplied: Object.keys(variables).length,
                  originsMapped: Object.keys(originMapping).length,
                },
                fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed environment deployment', { error });
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
 * Test Suite Runner Tool
 *
 * Execute Test Center test suites and report results.
 */
export function getTestSuiteRunnerTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_test_suite_run',
    description: `Execute a Test Center test suite and report results.

Runs functional tests against your Akamai property configuration:
- Execute test cases
- Check pass/fail status
- Get detailed results

Example: "Run test suite 12345 and show me the results"`,
    inputSchema: {
      type: 'object',
      properties: {
        testSuiteId: {
          type: 'string',
          description: 'Test suite ID to execute',
        },
        propertyId: {
          type: 'string',
          description: 'Property ID to test against (optional, uses suite default)',
        },
        propertyVersion: {
          type: 'number',
          description: 'Property version to test (optional)',
        },
        environment: {
          type: 'string',
          enum: ['STAGING', 'PRODUCTION'],
          description: 'Environment to test (default: STAGING)',
          default: 'STAGING',
        },
        waitForResults: {
          type: 'boolean',
          description: 'Wait for test execution to complete (default: true)',
          default: true,
        },
        maxWaitSeconds: {
          type: 'number',
          description: 'Maximum seconds to wait for results (default: 300)',
          default: 300,
        },
      },
      required: ['testSuiteId'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      const testSuiteId = args.testSuiteId as string;
      const propertyId = args.propertyId as string;
      const propertyVersion = args.propertyVersion as number;
      const environment = (args.environment as string) || 'STAGING';
      const waitForResults = args.waitForResults !== false;
      const maxWaitSeconds = (args.maxWaitSeconds as number) || 300;

      logger.info(`Running test suite ${testSuiteId} on ${environment}`);

      // Get test suite details
      const suiteData = await executeOperation('akamai_test_management_get-test-suites-id', {
        testSuiteId,
      });

      // Start test execution
      const execBody: any = {
        testSuiteExecutions: [
          {
            testSuiteId: parseInt(testSuiteId),
          },
        ],
        environment,
      };

      if (propertyId) {
        execBody.testSuiteExecutions[0].propertyId = propertyId;
      }
      if (propertyVersion) {
        execBody.testSuiteExecutions[0].propertyVersion = propertyVersion;
      }

      const execResult = await executeOperation(
        'akamai_test_management_post-functional-test-executions',
        {},
        {},
        execBody
      );

      const executionId = execResult?.testSuiteExecutions?.[0]?.testSuiteExecutionId;

      if (!executionId) {
        throw new Error('Failed to start test execution - no executionId returned');
      }

      // Wait for results if requested
      let results: any = null;
      let status = 'PENDING';

      if (waitForResults) {
        const pollInterval = 5000; // 5 seconds
        const maxPolls = Math.ceil((maxWaitSeconds * 1000) / pollInterval);
        let polls = 0;

        while (polls < maxPolls && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          polls++;

          try {
            const statusResult = await executeOperation(
              'akamai_test_management_get-test-suite-executions-id',
              { testSuiteExecutionId: executionId }
            );

            status = statusResult?.status || 'UNKNOWN';
            results = statusResult;

            logger.info(`Test execution status: ${status} (poll ${polls}/${maxPolls})`);
          } catch (e: any) {
            logger.warn(`Failed to get execution status: ${e.message}`);
          }
        }
      }

      // Get test case results if completed
      let testCaseResults: any[] = [];
      if (status === 'COMPLETED' && results) {
        try {
          const casesResult = await executeOperation(
            'akamai_test_management_get-test-suite-executions-id-test-case-executions',
            { testSuiteExecutionId: executionId }
          );
          testCaseResults = casesResult?.testCaseExecutions || [];
        } catch {
          // Test case details might not be available
        }
      }

      const summary = {
        testSuiteName: suiteData?.name,
        executionId,
        status,
        environment,
        totalCases: testCaseResults.length,
        passed: testCaseResults.filter((tc: any) => tc.status === 'PASSED').length,
        failed: testCaseResults.filter((tc: any) => tc.status === 'FAILED').length,
        fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                summary,
                testCases: testCaseResults.map((tc: any) => ({
                  name: tc.testCaseName,
                  status: tc.status,
                  conditionsPassed: tc.conditionsPassed,
                  conditionsFailed: tc.conditionsFailed,
                })),
                note: status === 'COMPLETED'
                  ? 'Test execution completed'
                  : `Test execution status: ${status}. Use akamai_raw_request with test-management API to check later.`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to run test suite', { error });
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
 * Reporting Tool
 *
 * Get traffic and performance reports (replaces mPulse for basic metrics).
 */
export function getReportingTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_traffic_report',
    description: `Get traffic and performance reports for your Akamai properties.

Returns:
- Traffic volume (hits, bytes)
- Cache hit rates
- Error rates
- Response times

Note: For Real User Monitoring (RUM) data, mPulse API is required but not publicly available.

Example: "Show me traffic report for CP code 12345"`,
    inputSchema: {
      type: 'object',
      properties: {
        cpCode: {
          type: 'string',
          description: 'CP code to get reports for',
        },
        reportType: {
          type: 'string',
          enum: ['traffic-by-time', 'hits-by-response-class', 'hits-by-cache-state'],
          description: 'Type of report (default: traffic-by-time)',
          default: 'traffic-by-time',
        },
        startDate: {
          type: 'string',
          description: 'Start date (ISO format, e.g., 2024-01-01T00:00:00Z)',
        },
        endDate: {
          type: 'string',
          description: 'End date (ISO format)',
        },
        interval: {
          type: 'string',
          enum: ['FIVE_MINUTES', 'HOUR', 'DAY', 'WEEK', 'MONTH'],
          description: 'Reporting interval (default: DAY)',
          default: 'DAY',
        },
      },
      required: ['cpCode'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const startTime = Date.now();

    try {
      const cpCode = args.cpCode as string;
      const reportType = (args.reportType as string) || 'traffic-by-time';
      const interval = (args.interval as string) || 'DAY';

      // Default date range: last 7 days
      const endDate = args.endDate as string || new Date().toISOString();
      const startDateDefault = new Date();
      startDateDefault.setDate(startDateDefault.getDate() - 7);
      const startDate = args.startDate as string || startDateDefault.toISOString();

      logger.info(`Fetching ${reportType} report for CP code ${cpCode}`);

      // Use Reporting API
      const reportBody = {
        objectType: 'cpcode',
        objectIds: [cpCode],
        metrics: ['edgeHits', 'edgeHitsPercent', 'originHits', 'bytesOffload', 'edgeBytes', 'originBytes'],
        filters: {},
      };

      const reportResult = await executeOperation(
        'akamai_reporting_api_post-report',
        { version: 1, name: reportType },
        {
          start: startDate,
          end: endDate,
          interval,
        },
        reportBody
      );

      // Process results
      const data = reportResult?.data || [];

      // Calculate summaries
      const totalEdgeHits = data.reduce((sum: number, d: any) => sum + (d.edgeHits || 0), 0);
      const totalOriginHits = data.reduce((sum: number, d: any) => sum + (d.originHits || 0), 0);
      const totalEdgeBytes = data.reduce((sum: number, d: any) => sum + (d.edgeBytes || 0), 0);
      const totalOriginBytes = data.reduce((sum: number, d: any) => sum + (d.originBytes || 0), 0);
      const cacheHitRate = totalEdgeHits > 0
        ? ((totalEdgeHits - totalOriginHits) / totalEdgeHits * 100).toFixed(2)
        : 'N/A';
      const bytesOffloadRate = totalEdgeBytes > 0
        ? ((totalEdgeBytes - totalOriginBytes) / totalEdgeBytes * 100).toFixed(2)
        : 'N/A';

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                report: {
                  cpCode,
                  reportType,
                  interval,
                  dateRange: { start: startDate, end: endDate },
                },
                summary: {
                  totalEdgeHits,
                  totalOriginHits,
                  cacheHitRate: `${cacheHitRate}%`,
                  totalEdgeBytes,
                  totalOriginBytes,
                  bytesOffloadRate: `${bytesOffloadRate}%`,
                },
                timeSeries: data.slice(0, 50).map((d: any) => ({
                  timestamp: d.startdatetime,
                  edgeHits: d.edgeHits,
                  originHits: d.originHits,
                  edgeBytes: d.edgeBytes,
                  bytesOffload: d.bytesOffload,
                })),
                fetchTime: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
                note: 'For Real User Monitoring (RUM) data, mPulse subscription and API access is required.',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      logger.error('Failed to get traffic report', { error });
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
    getBulkOnboardingTool(),
    getEnvironmentDeployTool(),
    getTestSuiteRunnerTool(),
    getReportingTool(),
  ];
}
