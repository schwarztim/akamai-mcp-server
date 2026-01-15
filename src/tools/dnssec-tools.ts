/**
 * DNSSEC Tools
 *
 * High-level tools for managing DNSSEC (DNS Security Extensions) via Akamai Edge DNS.
 * Supports key management, signing operations, and DNSSEC status monitoring.
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
 * DNSSEC Status Tool
 */
export function getDnssecStatusTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_dnssec_status',
    description: `Check DNSSEC status for a DNS zone.

Shows:
- Whether DNSSEC is enabled
- Current signing status
- Key information (KSK/ZSK)
- DS record for parent zone delegation

Example: "Check DNSSEC status for example.com"`,
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'DNS zone name (e.g., example.com)',
        },
      },
      required: ['zone'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const zone = args.zone as string;

    logger.info(`Checking DNSSEC status for zone ${zone}`);

    try {
      // Get zone info first
      let zoneInfo: any = null;
      try {
        zoneInfo = await executeOperation('akamai_config_dns_getZone', { zone });
      } catch (e) {
        logger.debug('Could not fetch zone info');
      }

      // Get DNSSEC status
      let dnssecStatus: any = null;
      try {
        dnssecStatus = await executeOperation('akamai_config_dns_getZoneDnssec', { zone });
      } catch (e) {
        // DNSSEC might not be enabled or API not available
        logger.debug('Could not fetch DNSSEC status');
      }

      // Get DNSSEC keys
      let keys: any[] = [];
      try {
        const keysResult = await executeOperation('akamai_config_dns_listDnssecKeys', { zone });
        keys = keysResult?.keys || keysResult || [];
      } catch (e) {
        logger.debug('Could not fetch DNSSEC keys');
      }

      // Determine status
      const isEnabled = dnssecStatus?.enabled || keys.length > 0;

      // Find KSK and ZSK
      const ksk = keys.find((k: any) => k.keyType === 'KSK' || k.type === 'KSK');
      const zsk = keys.find((k: any) => k.keyType === 'ZSK' || k.type === 'ZSK');

      const result = {
        zone,
        dnssecEnabled: isEnabled,
        status: isEnabled ? '✅ DNSSEC is enabled' : '⚠️ DNSSEC is not enabled',
        zoneInfo: zoneInfo ? {
          type: zoneInfo.type,
          masters: zoneInfo.masters,
          comment: zoneInfo.comment,
        } : null,
        signing: dnssecStatus ? {
          algorithm: dnssecStatus.algorithm || 'ECDSAP256SHA256',
          nsec3: dnssecStatus.nsec3 || false,
          status: dnssecStatus.status || 'unknown',
        } : null,
        keys: {
          ksk: ksk ? {
            keyTag: ksk.keyTag || ksk.tag,
            algorithm: ksk.algorithm,
            created: ksk.created || ksk.createdAt,
            expires: ksk.expires || ksk.expiresAt,
            status: ksk.status,
          } : null,
          zsk: zsk ? {
            keyTag: zsk.keyTag || zsk.tag,
            algorithm: zsk.algorithm,
            created: zsk.created || zsk.createdAt,
            expires: zsk.expires || zsk.expiresAt,
            status: zsk.status,
          } : null,
        },
        dsRecord: ksk ? {
          description: 'Add this DS record to your parent zone (registrar)',
          keyTag: ksk.keyTag || ksk.tag,
          algorithm: ksk.algorithm || 13,
          digestType: 2, // SHA-256
          digest: ksk.digest || ksk.dsRecord,
          fullRecord: ksk.dsRecord || `${zone}. IN DS ${ksk.keyTag || ksk.tag} ${ksk.algorithm || 13} 2 ${ksk.digest || '[digest]'}`,
        } : null,
        recommendations: isEnabled ? [
          ksk?.expires ? `⏰ KSK expires: ${ksk.expires} - schedule key rollover` : null,
          zsk?.expires ? `⏰ ZSK expires: ${zsk.expires} - automatic rollover typically handled` : null,
          '💡 Verify DS record is published at your registrar',
          '💡 Use online DNSSEC analyzers to validate chain of trust',
        ].filter(Boolean) : [
          '💡 Enable DNSSEC with akamai_dnssec_enable to secure your zone',
          '💡 DNSSEC prevents DNS spoofing and cache poisoning',
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`DNSSEC status check failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error checking DNSSEC status: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Enable DNSSEC Tool
 */
export function getEnableDnssecTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_dnssec_enable',
    description: `Enable DNSSEC signing for a DNS zone.

This will:
1. Generate Key Signing Key (KSK) and Zone Signing Key (ZSK)
2. Sign all records in the zone
3. Generate DS record for parent zone delegation

⚠️ After enabling, you must add the DS record to your registrar!

Example: "Enable DNSSEC for example.com"`,
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'DNS zone name (e.g., example.com)',
        },
        algorithm: {
          type: 'string',
          enum: ['ECDSAP256SHA256', 'ECDSAP384SHA384', 'RSASHA256', 'RSASHA512'],
          description: 'Signing algorithm (default: ECDSAP256SHA256)',
          default: 'ECDSAP256SHA256',
        },
        nsec3: {
          type: 'boolean',
          description: 'Use NSEC3 instead of NSEC (default: true)',
          default: true,
        },
      },
      required: ['zone'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const zone = args.zone as string;
    const algorithm = (args.algorithm as string) || 'ECDSAP256SHA256';
    const nsec3 = args.nsec3 !== false;

    logger.info(`Enabling DNSSEC for zone ${zone}`);

    try {
      // First verify zone exists
      try {
        await executeOperation('akamai_config_dns_getZone', { zone });
      } catch (e) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Zone not found',
                zone,
                message: `Zone ${zone} does not exist or is not accessible.`,
                suggestion: 'Use akamai_dns_overview to list available zones.',
              }, null, 2),
            },
          ],
          isError: true,
        };
      }

      // Enable DNSSEC
      const dnssecConfig = {
        algorithm,
        nsec3Enabled: nsec3,
        enabled: true,
      };

      try {
        await executeOperation(
          'akamai_config_dns_updateZoneDnssec',
          { zone },
          {},
          dnssecConfig
        );
      } catch (e) {
        // Try alternative endpoint
        try {
          await executeOperation(
            'akamai_config_dns_enableDnssec',
            { zone },
            {},
            dnssecConfig
          );
        } catch (e2) {
          throw e;
        }
      }

      // Get the generated keys
      let keys: any[] = [];
      try {
        // Wait a moment for key generation
        await new Promise(resolve => setTimeout(resolve, 2000));
        const keysResult = await executeOperation('akamai_config_dns_listDnssecKeys', { zone });
        keys = keysResult?.keys || keysResult || [];
      } catch (e) {
        logger.debug('Could not fetch newly generated keys');
      }

      const ksk = keys.find((k: any) => k.keyType === 'KSK' || k.type === 'KSK');

      const response = {
        success: true,
        zone,
        message: 'DNSSEC has been enabled for the zone',
        configuration: {
          algorithm,
          nsec3,
          status: 'signing',
        },
        keys: {
          ksk: ksk ? {
            keyTag: ksk.keyTag || ksk.tag,
            algorithm: ksk.algorithm,
          } : 'Generating...',
          zsk: keys.find((k: any) => k.keyType === 'ZSK' || k.type === 'ZSK') ? 'Generated' : 'Generating...',
        },
        dsRecord: ksk ? {
          instruction: '⚠️ IMPORTANT: Add this DS record to your parent zone (registrar)',
          record: ksk.dsRecord || `${zone}. IN DS ${ksk.keyTag || ksk.tag} ${ksk.algorithm || 13} 2 ${ksk.digest || '[check with akamai_dnssec_status]'}`,
        } : {
          instruction: 'DS record will be available once keys are generated',
          nextStep: 'Run akamai_dnssec_status in a few minutes to get the DS record',
        },
        nextSteps: [
          '1. Wait for zone signing to complete (typically 1-5 minutes)',
          '2. Run akamai_dnssec_status to verify and get the DS record',
          '3. Add the DS record to your domain registrar',
          '4. Wait for DS record propagation (up to 48 hours)',
          '5. Test with: dig +dnssec ' + zone,
        ],
        warnings: [
          '⚠️ DNSSEC chain of trust requires DS record at registrar',
          '⚠️ Without DS record, DNSSEC validation will fail',
          '⚠️ Plan for key rollovers (KSK annually, ZSK quarterly)',
        ],
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Enable DNSSEC failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error enabling DNSSEC: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * DNSSEC Keys Tool
 */
export function getDnssecKeysTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_dnssec_keys',
    description: `List and manage DNSSEC keys for a zone.

Shows:
- Key Signing Keys (KSK) - signs DNSKEY records
- Zone Signing Keys (ZSK) - signs zone records
- Key status and expiration
- DS records for delegation

Example: "Show DNSSEC keys for example.com"`,
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'DNS zone name (e.g., example.com)',
        },
        action: {
          type: 'string',
          enum: ['list', 'rollover-ksk', 'rollover-zsk'],
          description: 'Action to perform (default: list)',
          default: 'list',
        },
      },
      required: ['zone'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const zone = args.zone as string;
    const action = (args.action as string) || 'list';

    logger.info(`Managing DNSSEC keys for zone ${zone}, action: ${action}`);

    try {
      if (action === 'list') {
        // Get all DNSSEC keys
        let keys: any[] = [];
        try {
          const keysResult = await executeOperation('akamai_config_dns_listDnssecKeys', { zone });
          keys = keysResult?.keys || keysResult || [];
        } catch (e) {
          logger.debug('Could not fetch DNSSEC keys');
        }

        if (keys.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  zone,
                  message: 'No DNSSEC keys found',
                  suggestion: 'DNSSEC may not be enabled. Use akamai_dnssec_enable to enable it.',
                }, null, 2),
              },
            ],
          };
        }

        // Categorize keys
        const kskKeys = keys.filter((k: any) => k.keyType === 'KSK' || k.type === 'KSK');
        const zskKeys = keys.filter((k: any) => k.keyType === 'ZSK' || k.type === 'ZSK');

        const formatKey = (key: any) => ({
          keyTag: key.keyTag || key.tag,
          algorithm: key.algorithm,
          algorithmName: getAlgorithmName(key.algorithm),
          status: key.status || 'active',
          created: key.created || key.createdAt,
          expires: key.expires || key.expiresAt,
          bits: key.bits || key.keySize,
          isActive: key.status === 'active' || key.active,
        });

        const result = {
          zone,
          totalKeys: keys.length,
          kskKeys: {
            count: kskKeys.length,
            description: 'Key Signing Keys - sign DNSKEY records, require DS at registrar',
            keys: kskKeys.map(formatKey),
          },
          zskKeys: {
            count: zskKeys.length,
            description: 'Zone Signing Keys - sign zone data, rolled automatically',
            keys: zskKeys.map(formatKey),
          },
          dsRecords: kskKeys.map((k: any) => ({
            keyTag: k.keyTag || k.tag,
            dsRecord: k.dsRecord || `${zone}. IN DS ${k.keyTag || k.tag} ${k.algorithm} 2 [digest]`,
          })),
          keyRolloverInfo: {
            ksk: 'KSK rollover requires updating DS record at registrar - use with caution',
            zsk: 'ZSK rollover is transparent - no external changes required',
          },
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Key rollover actions
      if (action === 'rollover-ksk' || action === 'rollover-zsk') {
        const keyType = action === 'rollover-ksk' ? 'KSK' : 'ZSK';

        let rolloverResult: any = null;
        try {
          rolloverResult = await executeOperation(
            'akamai_config_dns_rolloverDnssecKey',
            { zone },
            {},
            { keyType }
          );
        } catch (e) {
          // Try alternative
          try {
            rolloverResult = await executeOperation(
              'akamai_config_dns_createDnssecKey',
              { zone },
              {},
              { keyType, rollover: true }
            );
          } catch (e2) {
            throw e;
          }
        }

        const response = {
          zone,
          action: `${keyType} rollover`,
          status: 'initiated',
          result: rolloverResult,
          nextSteps: keyType === 'KSK' ? [
            '1. Wait for new KSK to be generated',
            '2. Run akamai_dnssec_keys to get new DS record',
            '3. Add new DS record to registrar (keep old one too initially)',
            '4. Wait for DS propagation (24-48 hours)',
            '5. Remove old DS record from registrar',
            '6. Old KSK will be retired automatically',
          ] : [
            '1. ZSK rollover is automatic and transparent',
            '2. No action required at registrar',
            '3. New ZSK will be active immediately',
            '4. Old ZSK will be retired after TTL expiration',
          ],
          warning: keyType === 'KSK'
            ? '⚠️ KSK rollover requires careful DS record management to avoid breaking DNSSEC!'
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
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: `Unknown action: ${action}` }, null, 2),
          },
        ],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`DNSSEC keys operation failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error managing DNSSEC keys: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * DNSSEC Disable Tool
 */
export function getDisableDnssecTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_dnssec_disable',
    description: `Disable DNSSEC for a DNS zone.

⚠️ WARNING: This will remove DNSSEC protection from your zone.

Before disabling:
1. Remove DS record from registrar
2. Wait for DS record to expire from caches (24-48 hours)
3. Then disable DNSSEC

Example: "Disable DNSSEC for example.com"`,
    inputSchema: {
      type: 'object',
      properties: {
        zone: {
          type: 'string',
          description: 'DNS zone name (e.g., example.com)',
        },
        confirm: {
          type: 'boolean',
          description: 'Confirm you want to disable DNSSEC',
        },
      },
      required: ['zone', 'confirm'],
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const zone = args.zone as string;
    const confirm = args.confirm as boolean;

    if (!confirm) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              zone,
              error: 'Confirmation required',
              message: 'Set confirm: true to disable DNSSEC',
              warning: 'Disabling DNSSEC removes cryptographic protection from your zone',
              preDisableChecklist: [
                '☐ Remove DS record from domain registrar',
                '☐ Wait 24-48 hours for DS record to expire from caches',
                '☐ Verify DS record is no longer resolving',
                '☐ Then proceed with disabling DNSSEC',
              ],
            }, null, 2),
          },
        ],
      };
    }

    logger.info(`Disabling DNSSEC for zone ${zone}`);

    try {
      // Disable DNSSEC
      let result: any = null;
      try {
        result = await executeOperation(
          'akamai_config_dns_updateZoneDnssec',
          { zone },
          {},
          { enabled: false }
        );
      } catch (e) {
        // Try alternative
        try {
          result = await executeOperation(
            'akamai_config_dns_disableDnssec',
            { zone }
          );
        } catch (e2) {
          throw e;
        }
      }

      const response = {
        zone,
        status: 'DNSSEC disabled',
        result,
        postDisableActions: [
          '✅ Zone is now unsigned',
          '✅ DNSKEY records will be removed',
          '💡 Verify DS record was removed from registrar',
          '💡 Monitor for any resolution issues',
        ],
        toReEnable: 'Use akamai_dnssec_enable to re-enable DNSSEC',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Disable DNSSEC failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error disabling DNSSEC: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Helper to get algorithm name
 */
function getAlgorithmName(algorithm: number | string): string {
  const algorithms: Record<string, string> = {
    '8': 'RSA/SHA-256',
    '10': 'RSA/SHA-512',
    '13': 'ECDSA P-256/SHA-256',
    '14': 'ECDSA P-384/SHA-384',
    '15': 'Ed25519',
    '16': 'Ed448',
    'RSASHA256': 'RSA/SHA-256',
    'RSASHA512': 'RSA/SHA-512',
    'ECDSAP256SHA256': 'ECDSA P-256/SHA-256',
    'ECDSAP384SHA384': 'ECDSA P-384/SHA-384',
  };
  return algorithms[String(algorithm)] || String(algorithm);
}

/**
 * Get all DNSSEC tools
 */
export function getDnssecTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getDnssecStatusTool(),
    getEnableDnssecTool(),
    getDnssecKeysTool(),
    getDisableDnssecTool(),
  ];
}
