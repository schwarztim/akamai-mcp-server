#!/usr/bin/env node

/**
 * Akamai MCP Server
 *
 * Model Context Protocol server with complete Akamai API coverage.
 * Dynamically generates tools from OpenAPI specifications.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getLogger } from './utils/logger.js';
import { getConfig } from './utils/config.js';
import { getOperationRegistry } from './registry/operation-registry.js';
import { getToolGenerator, type GeneratedTool } from './generator/tool-generator.js';
import {
  getRawRequestTool,
  getListOperationsTool,
  getRegistryStatsTool,
} from './generator/raw-request-tool.js';

/**
 * Main MCP server for Akamai APIs
 */
class AkamaiMcpServer {
  private server: Server;
  private logger;
  private tools: Map<string, GeneratedTool>;
  private utilityTools: Map<string, { definition: any; handler: any }>;

  constructor() {
    this.logger = getLogger();
    this.tools = new Map();
    this.utilityTools = new Map();

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'akamai-mcp-server',
        version: '3.0.0', // v3.0 - Enterprise-grade reliability
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Load all tools from the registry
   */
  private async loadTools(): Promise<void> {
    this.logger.info('Loading operation registry...');

    try {
      // Load registry
      const registry = await getOperationRegistry();
      const stats = registry.getStats();

      this.logger.info(
        `Registry loaded: ${stats.totalOperations} operations from ${stats.specsLoaded} APIs`
      );

      // Generate tools
      const generator = getToolGenerator();
      const operations = registry.getAllOperations();
      const generatedTools = await generator.generateAll(operations);

      // Register tools
      for (const tool of generatedTools) {
        this.tools.set(tool.definition.name, tool);
      }

      this.logger.info(`Generated ${this.tools.size} MCP tools`);

      // Add utility tools
      this.utilityTools.set('akamai_raw_request', getRawRequestTool());
      this.utilityTools.set('akamai_list_operations', getListOperationsTool());
      this.utilityTools.set('akamai_registry_stats', getRegistryStatsTool());

      this.logger.info(`Added ${this.utilityTools.size} utility tools`);

      // Log coverage summary
      this.logger.info('Coverage by product:', stats.operationsByProduct);
      this.logger.info('Coverage by method:', stats.operationsByMethod);
    } catch (error) {
      this.logger.error('Failed to load tools', { error });
      throw error;
    }
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.info('Listing available tools');

      const allTools = [
        // Utility tools first
        ...Array.from(this.utilityTools.values()).map(t => t.definition),
        // Generated tools
        ...Array.from(this.tools.values()).map(t => t.definition),
      ];

      return {
        tools: allTools,
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.info(`Tool called: ${name}`, { args });

      try {
        // Check utility tools first
        if (this.utilityTools.has(name)) {
          const tool = this.utilityTools.get(name)!;
          const result = await tool.handler(args || {});
          this.logger.info(`Utility tool completed: ${name}`);
          return result;
        }

        // Check generated tools
        if (this.tools.has(name)) {
          const tool = this.tools.get(name)!;
          const result = await tool.handler(args || {});
          this.logger.info(`Tool completed: ${name}`);
          return result;
        }

        // Tool not found
        throw new Error(`Unknown tool: ${name}`);
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

    this.logger.info('Starting Akamai MCP Server v3.0.0...');

    try {
      // Validate configuration
      const config = getConfig();
      this.logger.info('Configuration validated successfully', {
        host: config.akamai.host.substring(0, 20) + '...',
      });

      // Load tools
      await this.loadTools();

      // Connect to transport
      await this.server.connect(transport);

      this.logger.info('✅ Akamai MCP Server started successfully');
      this.logger.info('🎯 Complete API coverage: All Akamai operations available');
      this.logger.info(`📊 Total tools: ${this.tools.size + this.utilityTools.size}`);
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
