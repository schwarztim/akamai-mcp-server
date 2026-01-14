/**
 * MCP Tool Generator
 *
 * Generates MCP tool definitions from OpenAPI operations.
 * Creates input schemas (Zod) and tool handlers dynamically.
 */

import type { OpenAPIV3 } from 'openapi-types';
import type { OperationDefinition } from '../registry/types.js';
import { getUniversalExecutor, type ExecutionOptions } from '../executor/universal-executor.js';
import { getLogger } from '../utils/logger.js';

/**
 * MCP tool definition
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/**
 * Tool handler function
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
}>;

/**
 * Generated tool with handler
 */
export interface GeneratedTool {
  definition: MCPToolDefinition;
  handler: ToolHandler;
  operation: OperationDefinition;
}

/**
 * Tool Generator
 *
 * Generates MCP tools from operation definitions.
 */
export class ToolGenerator {
  /**
   * Generate MCP tool from operation
   */
  generate(operation: OperationDefinition): GeneratedTool {
    const definition = this.generateDefinition(operation);
    const handler = this.generateHandler(operation);

    return {
      definition,
      handler,
      operation,
    };
  }

  /**
   * Generate tool definition
   */
  private generateDefinition(operation: OperationDefinition): MCPToolDefinition {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    // Add path parameters
    for (const param of operation.pathParameters) {
      properties[param.name] = this.schemaToJsonSchema(param.schema, param.description);
      if (param.required) {
        required.push(param.name);
      }
    }

    // Add query parameters
    for (const param of operation.queryParameters) {
      properties[param.name] = this.schemaToJsonSchema(param.schema, param.description);
      if (param.required) {
        required.push(param.name);
      }
    }

    // Add header parameters (non-auth headers only)
    for (const param of operation.headerParameters) {
      const lowerName = param.name.toLowerCase();
      if (!lowerName.startsWith('authorization') && lowerName !== 'x-api-key') {
        properties[param.name] = this.schemaToJsonSchema(param.schema, param.description);
        if (param.required) {
          required.push(param.name);
        }
      }
    }

    // Add request body if present
    if (operation.requestBody) {
      const jsonContent = operation.requestBody.content['application/json'];
      if (jsonContent) {
        properties.body = this.schemaToJsonSchema(
          jsonContent.schema,
          operation.requestBody.description
        );
        if (operation.requestBody.required) {
          required.push('body');
        }
      }
    }

    // Add pagination options if supported
    if (operation.supportsPagination) {
      properties.paginate = {
        type: 'boolean',
        description: 'Enable automatic pagination to fetch all results',
      };
      properties.maxPages = {
        type: 'number',
        description: 'Maximum number of pages to fetch (default: 10, max: 100)',
      };
    }

    // Build description
    const description = this.buildDescription(operation);

    return {
      name: operation.toolName,
      description,
      inputSchema: {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined,
        additionalProperties: false,
      },
    };
  }

  /**
   * Generate tool handler
   */
  private generateHandler(operation: OperationDefinition): ToolHandler {
    return async (args: Record<string, unknown>) => {
      const logger = getLogger();

      try {
        // Build execution options
        const options: ExecutionOptions = {
          pathParams: {},
          queryParams: {},
          headers: {},
        };

        // Extract path parameters
        for (const param of operation.pathParameters) {
          if (args[param.name] !== undefined) {
            options.pathParams![param.name] = args[param.name] as string | number;
          }
        }

        // Extract query parameters
        for (const param of operation.queryParameters) {
          if (args[param.name] !== undefined) {
            options.queryParams![param.name] = args[param.name] as string | number | boolean;
          }
        }

        // Extract header parameters
        for (const param of operation.headerParameters) {
          if (args[param.name] !== undefined) {
            options.headers![param.name] = String(args[param.name]);
          }
        }

        // Extract body
        if (args.body !== undefined) {
          options.body = args.body;
        }

        // Extract pagination options
        if (args.paginate !== undefined) {
          options.paginate = args.paginate as boolean;
        }
        if (args.maxPages !== undefined) {
          const maxPages = Number(args.maxPages);
          options.maxPages = Math.min(maxPages, 100); // Cap at 100 pages
        }

        // Execute operation
        const executor = getUniversalExecutor();
        const result = await executor.execute(operation, options);

        // Format result
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: result.status,
                  requestId: result.requestId,
                  paginated: result.paginated,
                  pageCount: result.pageCount,
                  totalItems: result.totalItems,
                  data: result.body,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        logger.error(`Tool execution error: ${operation.toolName}`, { error });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: true,
                  message: error.message,
                  status: error.status,
                  requestId: error.requestId,
                  body: error.body,
                },
                null,
                2
              ),
            },
          ],
        };
      }
    };
  }

  /**
   * Convert OpenAPI schema to JSON Schema
   */
  private schemaToJsonSchema(schema: OpenAPIV3.SchemaObject, description?: string): unknown {
    const result: Record<string, unknown> = { ...schema };

    if (description) {
      result.description = description;
    }

    // Remove OpenAPI-specific properties
    delete result.example;
    delete result.examples;
    delete result.discriminator;
    delete result.xml;
    delete result.externalDocs;

    return result;
  }

  /**
   * Build tool description (minimal to avoid bloating context)
   */
  private buildDescription(operation: OperationDefinition): string {
    // Keep descriptions minimal - just summary
    // Detailed info in tool name format: akamai_product_operation
    let desc = operation.summary || `${operation.method} ${operation.path}`;

    // Add pagination note if applicable
    if (operation.supportsPagination) {
      desc += ' [supports pagination: use paginate=true]';
    }

    return desc.trim();
  }

  /**
   * Generate all tools from registry
   */
  async generateAll(operations: OperationDefinition[]): Promise<GeneratedTool[]> {
    const logger = getLogger();
    logger.info(`Generating ${operations.length} MCP tools...`);

    const startTime = Date.now();
    const tools: GeneratedTool[] = [];

    for (const operation of operations) {
      try {
        const tool = this.generate(operation);
        tools.push(tool);
      } catch (error) {
        logger.error(`Failed to generate tool for ${operation.operationId}`, { error });
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Generated ${tools.length} tools in ${duration}ms`);

    return tools;
  }
}

// Singleton instance
let generatorInstance: ToolGenerator | null = null;

/**
 * Get tool generator singleton
 */
export function getToolGenerator(): ToolGenerator {
  if (!generatorInstance) {
    generatorInstance = new ToolGenerator();
  }
  return generatorInstance;
}

/**
 * Reset generator (for testing)
 */
export function resetGenerator(): void {
  generatorInstance = null;
}
