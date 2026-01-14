#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getLogger } from './utils/logger.js';
import { getConfig } from './utils/config.js';

// Import tool definitions and handlers
import {
  propertyManagerTools,
  listPropertiesHandler,
  getPropertyHandler,
  getPropertyRulesHandler,
  listPropertyHostnamesHandler,
  activatePropertyHandler,
} from './tools/property-manager.js';

import {
  fastPurgeTools,
  purgeByUrlHandler,
  purgeByCacheTagHandler,
  purgeByCpCodeHandler,
  getPurgeStatusHandler,
} from './tools/fast-purge.js';

import {
  edgeWorkersTools,
  listEdgeWorkersHandler,
  getEdgeWorkerHandler,
  listEdgeWorkerVersionsHandler,
  getEdgeWorkerActivationsHandler,
  activateEdgeWorkerHandler,
} from './tools/edgeworkers.js';

import {
  dnsTools,
  listDnsZonesHandler,
  getDnsZoneHandler,
  listDnsRecordsHandler,
  getDnsRecordHandler,
  createDnsRecordHandler,
  updateDnsRecordHandler,
  deleteDnsRecordHandler,
} from './tools/dns.js';

import { healthTools, healthCheckHandler } from './tools/health.js';
import { ToolHandler } from './tools/types.js';

/**
 * Main MCP server for Akamai APIs
 */
class AkamaiMcpServer {
  private server: Server;
  private logger;
  private toolHandlers: Map<string, ToolHandler>;

  constructor() {
    this.logger = getLogger();

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'akamai-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Map tool names to handlers
    this.toolHandlers = new Map([
      // Property Manager
      ['akamai_list_properties', listPropertiesHandler],
      ['akamai_get_property', getPropertyHandler],
      ['akamai_get_property_rules', getPropertyRulesHandler],
      ['akamai_list_property_hostnames', listPropertyHostnamesHandler],
      ['akamai_activate_property', activatePropertyHandler],
      // Fast Purge
      ['akamai_purge_by_url', purgeByUrlHandler],
      ['akamai_purge_by_cache_tag', purgeByCacheTagHandler],
      ['akamai_purge_by_cpcode', purgeByCpCodeHandler],
      ['akamai_get_purge_status', getPurgeStatusHandler],
      // EdgeWorkers
      ['akamai_list_edgeworkers', listEdgeWorkersHandler],
      ['akamai_get_edgeworker', getEdgeWorkerHandler],
      ['akamai_list_edgeworker_versions', listEdgeWorkerVersionsHandler],
      ['akamai_get_edgeworker_activations', getEdgeWorkerActivationsHandler],
      ['akamai_activate_edgeworker', activateEdgeWorkerHandler],
      // DNS Management
      ['akamai_list_dns_zones', listDnsZonesHandler],
      ['akamai_get_dns_zone', getDnsZoneHandler],
      ['akamai_list_dns_records', listDnsRecordsHandler],
      ['akamai_get_dns_record', getDnsRecordHandler],
      ['akamai_create_dns_record', createDnsRecordHandler],
      ['akamai_update_dns_record', updateDnsRecordHandler],
      ['akamai_delete_dns_record', deleteDnsRecordHandler],
      // Health
      ['akamai_health_check', healthCheckHandler],
    ]);

    this.setupHandlers();
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.info('Listing available tools');

      return {
        tools: [
          ...healthTools,
          ...propertyManagerTools,
          ...fastPurgeTools,
          ...edgeWorkersTools,
          ...dnsTools,
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.info(`Tool called: ${name}`, { args });

      try {
        const handler = this.toolHandlers.get(name);

        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }

        const result = await handler(args || {});
        this.logger.info(`Tool completed: ${name}`);

        return result;
      } catch (error) {
        this.logger.error(`Tool error: ${name}`, { error });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: error instanceof Error ? error.message : String(error),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    });

    // Handle errors
    this.server.onerror = (error) => {
      this.logger.error('Server error', { error });
    };

    // Process exit handler
    process.on('SIGINT', async () => {
      this.logger.info('Shutting down server...');
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();

    this.logger.info('Starting Akamai MCP server...');

    try {
      // Validate configuration on startup
      const config = getConfig();
      this.logger.info('Configuration validated successfully', {
        host: config.akamai.host.substring(0, 20) + '...',
      });

      await this.server.connect(transport);
      this.logger.info('Akamai MCP server started successfully');
    } catch (error) {
      this.logger.error('Failed to start server', { error });
      throw error;
    }
  }
}

/**
 * Start the server
 */
async function main(): Promise<void> {
  try {
    const server = new AkamaiMcpServer();
    await server.start();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
