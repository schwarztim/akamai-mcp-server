/**
 * Multi-Account Support Tools
 *
 * Tools for managing multiple Akamai accounts, MSP account switching,
 * and cross-account operations.
 */

import { getOperationRegistry } from '../registry/operation-registry.js';
import { getUniversalExecutor } from '../executor/universal-executor.js';
import { getLogger } from '../utils/logger.js';
import type { MCPToolDefinition, ToolHandler } from '../generator/tool-generator.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function executeOperation(
  toolName: string,
  pathParams: Record<string, string | number> = {},
  queryParams: Record<string, string | number | boolean> = {},
  body?: any,
  headers?: Record<string, string>
): Promise<any> {
  const registry = await getOperationRegistry();
  const operation = registry.getOperation(toolName);
  if (!operation) throw new Error(`Operation not found: ${toolName}`);

  const executor = getUniversalExecutor();
  const result = await executor.execute(operation, {
    pathParams,
    queryParams,
    body,
    headers,
    paginate: true,
    maxPages: 100,
  });

  return result.body;
}

/**
 * Parse .edgerc file to extract sections
 */
function parseEdgerc(filePath: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};

  if (!fs.existsSync(filePath)) {
    return sections;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let currentSection = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    // Section header
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = {};
      continue;
    }

    // Key-value pair
    if (currentSection) {
      const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        const value = kvMatch[2].trim();
        sections[currentSection][key] = value;
      }
    }
  }

  return sections;
}

/**
 * List Available Accounts Tool
 */
export function getListAccountsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_list_accounts',
    description: `List all available Akamai accounts from your .edgerc configuration.

Shows:
- All configured account sections
- Account switch keys if available
- Current active account

Useful for MSPs and enterprises managing multiple Akamai accounts.

Example: "List all my configured Akamai accounts"`,
    inputSchema: {
      type: 'object',
      properties: {
        edgercPath: {
          type: 'string',
          description: 'Custom path to .edgerc file (default: ~/.edgerc)',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const customPath = args.edgercPath as string | undefined;
    const edgercPath = customPath || path.join(os.homedir(), '.edgerc');

    logger.info(`Listing accounts from ${edgercPath}`);

    try {
      const sections = parseEdgerc(edgercPath);
      const sectionNames = Object.keys(sections);

      if (sectionNames.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                edgercPath,
                error: 'No accounts found',
                message: `No sections found in ${edgercPath}. Ensure the file exists and contains valid credentials.`,
                example: `[default]
client_secret = your-secret
host = your-host.luna.akamaiapis.net
access_token = akab-your-access-token
client_token = akab-your-client-token`,
              }, null, 2),
            },
          ],
        };
      }

      // Get current config to identify active section
      const currentSection = process.env.AKAMAI_EDGERC_SECTION || 'default';

      // Build account list
      const accounts = sectionNames.map(section => {
        const sectionData = sections[section];
        const host = sectionData.host || '';

        // Mask sensitive data
        return {
          section,
          isActive: section === currentSection,
          host: host ? `${host.substring(0, 20)}...` : 'not set',
          hasClientToken: !!sectionData.client_token,
          hasAccessToken: !!sectionData.access_token,
          hasClientSecret: !!sectionData.client_secret,
          accountSwitchKey: sectionData.account_key || sectionData.accountSwitchKey || null,
          isComplete: !!(
            sectionData.host &&
            sectionData.client_token &&
            sectionData.access_token &&
            sectionData.client_secret
          ),
        };
      });

      // Validate active account
      const activeAccount = accounts.find(a => a.isActive);

      const result = {
        edgercPath,
        totalAccounts: accounts.length,
        currentSection,
        accounts,
        activeAccountStatus: activeAccount?.isComplete
          ? '✅ Active account credentials are complete'
          : '⚠️ Active account credentials may be incomplete',
        usage: {
          switchAccount: 'Set AKAMAI_EDGERC_SECTION environment variable',
          example: 'AKAMAI_EDGERC_SECTION=production',
          inMcpConfig: 'Add "AKAMAI_EDGERC_SECTION": "section-name" to env in mcp.json',
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`List accounts failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error listing accounts: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Get Current Account Info Tool
 */
export function getCurrentAccountTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_current_account',
    description: `Get information about the currently active Akamai account.

Shows:
- Account name and ID
- Contract information
- User profile details
- Available products

Example: "What Akamai account am I using?"`,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async () => {
    const logger = getLogger();
    logger.info('Getting current account information');

    try {
      // Get identity/account info
      let identity: any = null;
      try {
        identity = await executeOperation('akamai_identity_management_api_v3_getUserProfile', {}, {});
      } catch (e) {
        logger.debug('Could not fetch user profile');
      }

      // Get contracts
      let contracts: any[] = [];
      try {
        const contractsResult = await executeOperation('akamai_papi_listContracts', {}, {});
        contracts = contractsResult?.contracts?.items || contractsResult?.items || [];
      } catch (e) {
        logger.debug('Could not fetch contracts');
      }

      // Get groups
      let groups: any[] = [];
      try {
        const groupsResult = await executeOperation('akamai_papi_listGroups', {}, {});
        groups = groupsResult?.groups?.items || groupsResult?.items || [];
      } catch (e) {
        logger.debug('Could not fetch groups');
      }

      // Get products for first contract
      let products: any[] = [];
      if (contracts.length > 0) {
        try {
          const productsResult = await executeOperation(
            'akamai_papi_listProducts',
            {},
            { contractId: contracts[0].contractId }
          );
          products = productsResult?.products?.items || productsResult?.items || [];
        } catch (e) {
          logger.debug('Could not fetch products');
        }
      }

      const currentSection = process.env.AKAMAI_EDGERC_SECTION || 'default';
      const accountSwitchKey = process.env.AKAMAI_ACCOUNT_KEY;

      const result = {
        edgercSection: currentSection,
        accountSwitchKey: accountSwitchKey || 'none',
        user: identity ? {
          username: identity.uiUserName || identity.email,
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
          country: identity.country,
          preferredLanguage: identity.preferredLanguage,
          sessionTimeout: identity.sessionTimeOut,
          lastLogin: identity.lastLoginDate,
        } : 'Unable to fetch user profile',
        contracts: contracts.map((c: any) => ({
          id: c.contractId,
          name: c.contractTypeName,
        })),
        groups: groups.slice(0, 10).map((g: any) => ({
          id: g.groupId,
          name: g.groupName,
          parentGroupId: g.parentGroupId,
        })),
        products: products.slice(0, 15).map((p: any) => ({
          id: p.productId,
          name: p.productName,
        })),
        summary: {
          totalContracts: contracts.length,
          totalGroups: groups.length,
          totalProducts: products.length,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Get current account failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error getting current account: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * List Switchable Accounts Tool (for MSPs)
 */
export function getListSwitchableAccountsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_list_switchable_accounts',
    description: `List accounts you can switch to (for MSPs and multi-account users).

Returns all accounts accessible with your API credentials via account switch keys.
Useful for Managed Service Providers managing multiple customer accounts.

Example: "What accounts can I switch to?"`,
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search filter for account name',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const search = args.search as string | undefined;

    logger.info('Listing switchable accounts');

    try {
      // Try to get switchable accounts via identity management API
      let accounts: any[] = [];

      try {
        const result = await executeOperation(
          'akamai_identity_management_api_v3_listAccountSwitchKeys',
          {},
          search ? { search } : {}
        );
        accounts = result?.accountSwitchKeys || result?.items || result || [];
      } catch (e) {
        // Alternative: try account API
        try {
          const result = await executeOperation(
            'akamai_account_getAccounts',
            {},
            {}
          );
          accounts = result?.accounts || result?.items || result || [];
        } catch (e2) {
          logger.debug('Could not fetch switchable accounts');
        }
      }

      if (!Array.isArray(accounts) || accounts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                message: 'No switchable accounts found',
                possibleReasons: [
                  '• Your API credentials may not have account switch permissions',
                  '• You may not be an MSP user with multi-account access',
                  '• The Identity Management API may not be enabled',
                ],
                alternatives: [
                  'Use akamai_list_accounts to see .edgerc sections',
                  'Contact Akamai support to enable account switching',
                ],
              }, null, 2),
            },
          ],
        };
      }

      const formattedAccounts = accounts.map((acct: any) => ({
        accountSwitchKey: acct.accountSwitchKey || acct.key,
        accountName: acct.accountName || acct.name,
        accountId: acct.accountId || acct.id,
      }));

      const result = {
        totalAccounts: formattedAccounts.length,
        searchFilter: search || 'none',
        accounts: formattedAccounts,
        usage: {
          toSwitch: 'Set AKAMAI_ACCOUNT_KEY environment variable',
          example: `AKAMAI_ACCOUNT_KEY=${formattedAccounts[0]?.accountSwitchKey || 'B-C-1234567:1-ABCD'}`,
          perRequest: 'Use accountSwitchKey parameter in API calls',
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`List switchable accounts failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error listing switchable accounts: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Validate Account Credentials Tool
 */
export function getValidateCredentialsTool(): { definition: MCPToolDefinition; handler: ToolHandler } {
  const definition: MCPToolDefinition = {
    name: 'akamai_validate_credentials',
    description: `Validate Akamai API credentials for a specific .edgerc section.

Tests:
- Credential format validity
- API connectivity
- Authentication success
- Available permissions

Useful for troubleshooting authentication issues.

Example: "Validate my production credentials"`,
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description: 'The .edgerc section to validate (default: current)',
        },
        edgercPath: {
          type: 'string',
          description: 'Custom path to .edgerc file',
        },
      },
      additionalProperties: false,
    },
  };

  const handler: ToolHandler = async (args: Record<string, unknown>) => {
    const logger = getLogger();
    const section = (args.section as string) || process.env.AKAMAI_EDGERC_SECTION || 'default';
    const customPath = args.edgercPath as string | undefined;
    const edgercPath = customPath || path.join(os.homedir(), '.edgerc');

    logger.info(`Validating credentials for section [${section}]`);

    try {
      const sections = parseEdgerc(edgercPath);
      const sectionData = sections[section];

      const validation: Record<string, any> = {
        section,
        edgercPath,
        fileExists: fs.existsSync(edgercPath),
        sectionExists: !!sectionData,
        credentials: {
          host: { present: false, valid: false },
          clientToken: { present: false, valid: false },
          clientSecret: { present: false, valid: false },
          accessToken: { present: false, valid: false },
        },
        apiTest: null,
        overallStatus: 'unknown',
      };

      if (!sectionData) {
        validation.overallStatus = '❌ Section not found';
        validation.suggestions = [
          `Create section [${section}] in ${edgercPath}`,
          'Or specify a different section with the section parameter',
        ];
        return {
          content: [{ type: 'text', text: JSON.stringify(validation, null, 2) }],
        };
      }

      // Validate credential format
      if (sectionData.host) {
        validation.credentials.host.present = true;
        validation.credentials.host.valid = sectionData.host.includes('.akamaiapis.net');
      }
      if (sectionData.client_token) {
        validation.credentials.clientToken.present = true;
        validation.credentials.clientToken.valid = sectionData.client_token.startsWith('akab-');
      }
      if (sectionData.client_secret) {
        validation.credentials.clientSecret.present = true;
        validation.credentials.clientSecret.valid = sectionData.client_secret.length > 20;
      }
      if (sectionData.access_token) {
        validation.credentials.accessToken.present = true;
        validation.credentials.accessToken.valid = sectionData.access_token.startsWith('akab-');
      }

      const allPresent = Object.values(validation.credentials).every((c: any) => c.present);
      const allValid = Object.values(validation.credentials).every((c: any) => c.valid);

      if (!allPresent) {
        validation.overallStatus = '❌ Missing credentials';
        validation.suggestions = Object.entries(validation.credentials)
          .filter(([_, v]: [string, any]) => !v.present)
          .map(([k]) => `Add ${k} to [${section}] section`);
        return {
          content: [{ type: 'text', text: JSON.stringify(validation, null, 2) }],
        };
      }

      if (!allValid) {
        validation.overallStatus = '⚠️ Invalid credential format';
        validation.suggestions = Object.entries(validation.credentials)
          .filter(([_, v]: [string, any]) => !v.valid)
          .map(([k]) => `Check ${k} format in [${section}] section`);
        return {
          content: [{ type: 'text', text: JSON.stringify(validation, null, 2) }],
        };
      }

      // Test API connectivity (only if this is the active section)
      if (section === (process.env.AKAMAI_EDGERC_SECTION || 'default')) {
        try {
          await executeOperation('akamai_papi_listContracts', {}, {});
          validation.apiTest = {
            success: true,
            message: 'API authentication successful',
          };
          validation.overallStatus = '✅ Credentials valid and working';
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : 'Unknown error';
          validation.apiTest = {
            success: false,
            error: errorMsg,
          };
          if (errorMsg.includes('401') || errorMsg.includes('403')) {
            validation.overallStatus = '❌ Authentication failed';
            validation.suggestions = [
              'Check if API client is active in Akamai Control Center',
              'Verify client has necessary permissions',
              'Regenerate credentials if expired',
            ];
          } else {
            validation.overallStatus = '⚠️ API test failed';
            validation.suggestions = [
              'Check network connectivity to Akamai APIs',
              `Verify host ${sectionData.host} is reachable`,
            ];
          }
        }
      } else {
        validation.apiTest = {
          skipped: true,
          reason: `Section [${section}] is not the active section`,
          activeSection: process.env.AKAMAI_EDGERC_SECTION || 'default',
        };
        validation.overallStatus = '✅ Credential format valid (API test skipped)';
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(validation, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Credential validation failed: ${message}`);
      return {
        content: [{ type: 'text', text: `Error validating credentials: ${message}` }],
        isError: true,
      };
    }
  };

  return { definition, handler };
}

/**
 * Get all account tools
 */
export function getAccountTools(): Array<{ definition: MCPToolDefinition; handler: ToolHandler }> {
  return [
    getListAccountsTool(),
    getCurrentAccountTool(),
    getListSwitchableAccountsTool(),
    getValidateCredentialsTool(),
  ];
}
