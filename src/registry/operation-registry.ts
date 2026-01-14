/**
 * Operation Registry
 *
 * Loads and indexes all Akamai OpenAPI operations for dynamic tool generation.
 * Provides fast lookups, search, and metadata extraction.
 */

import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { OpenAPIV3 } from 'openapi-types';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { getLogger } from '../utils/logger.js';
import type {
  OperationDefinition,
  ParameterDefinition,
  RequestBodyDefinition,
  ResponseDefinition,
  RegistryStats,
  SearchOptions,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = join(__dirname, '../../specs');

/**
 * Operation Registry
 *
 * Singleton that manages all Akamai API operations.
 */
export class OperationRegistry {
  private operations: Map<string, OperationDefinition> = new Map();
  private operationsByProduct: Map<string, string[]> = new Map();
  private operationsByMethod: Map<string, string[]> = new Map();
  private loaded: boolean = false;

  /**
   * Load all OpenAPI specifications and build the registry
   */
  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    const logger = getLogger();
    logger.info('Loading OpenAPI specifications...');

    const startTime = Date.now();

    if (!existsSync(SPECS_DIR)) {
      throw new Error(
        `Specs directory not found: ${SPECS_DIR}. Run: npm run sync:specs`
      );
    }

    // Find all openapi.json files
    const specFiles = this.findSpecFiles(SPECS_DIR);
    logger.info(`Found ${specFiles.length} OpenAPI specifications`);

    // Load and parse each spec
    let totalOperations = 0;

    for (const specFile of specFiles) {
      try {
        const operations = await this.loadSpec(specFile);
        totalOperations += operations;
      } catch (error) {
        logger.error(`Failed to load spec: ${specFile}`, { error });
      }
    }

    this.loaded = true;

    const duration = Date.now() - startTime;
    logger.info(
      `Registry loaded: ${totalOperations} operations from ${specFiles.length} specs in ${duration}ms`
    );
  }

  /**
   * Find all openapi.json files recursively
   */
  private findSpecFiles(dir: string): string[] {
    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...this.findSpecFiles(fullPath));
      } else if (entry.name === 'openapi.json') {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Load and parse a single OpenAPI spec
   */
  private async loadSpec(specFile: string): Promise<number> {
    const logger = getLogger();

    try {
      // Dereference all $refs
      const spec = (await $RefParser.dereference(specFile)) as OpenAPIV3.Document;

      // Extract product and version from path
      const relativePath = specFile.replace(SPECS_DIR + '/', '');
      const pathParts = relativePath.split('/');
      const product = pathParts[0];
      const version = pathParts[1] || 'v1';

      let operationsAdded = 0;

      // Parse all paths and operations
      if (spec.paths) {
        for (const [path, pathItem] of Object.entries(spec.paths)) {
          if (!pathItem) continue;

          const operations = this.parsePathItem(path, pathItem, product, version, spec, specFile);
          for (const op of operations) {
            this.addOperation(op);
            operationsAdded++;
          }
        }
      }

      logger.debug(`Loaded ${operationsAdded} operations from ${product}/${version}`);
      return operationsAdded;
    } catch (error) {
      logger.error(`Failed to parse spec: ${specFile}`, { error });
      throw error;
    }
  }

  /**
   * Parse operations from a path item
   */
  private parsePathItem(
    path: string,
    pathItem: OpenAPIV3.PathItemObject,
    product: string,
    version: string,
    spec: OpenAPIV3.Document,
    specFile: string
  ): OperationDefinition[] {
    const operations: OperationDefinition[] = [];
    const methods: Array<OpenAPIV3.HttpMethods> = [
      OpenAPIV3.HttpMethods.GET,
      OpenAPIV3.HttpMethods.POST,
      OpenAPIV3.HttpMethods.PUT,
      OpenAPIV3.HttpMethods.DELETE,
      OpenAPIV3.HttpMethods.PATCH,
      OpenAPIV3.HttpMethods.OPTIONS,
      OpenAPIV3.HttpMethods.HEAD,
    ];

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      const op = this.parseOperation(path, method, operation, product, version, spec, specFile);
      operations.push(op);
    }

    return operations;
  }

  /**
   * Parse a single operation
   */
  private parseOperation(
    path: string,
    method: string,
    operation: OpenAPIV3.OperationObject,
    product: string,
    version: string,
    spec: OpenAPIV3.Document,
    specFile: string
  ): OperationDefinition {
    // Generate operation ID if not present
    const operationId = operation.operationId || this.generateOperationId(method, path);

    // Generate stable tool name
    const toolName = this.generateToolName(product, version, operationId);

    // Parse parameters
    const pathParams: ParameterDefinition[] = [];
    const queryParams: ParameterDefinition[] = [];
    const headerParams: ParameterDefinition[] = [];

    if (operation.parameters) {
      for (const param of operation.parameters) {
        const p = param as OpenAPIV3.ParameterObject;
        const paramDef: ParameterDefinition = {
          name: p.name,
          in: p.in as 'path' | 'query' | 'header',
          required: p.required || false,
          description: p.description,
          schema: p.schema as OpenAPIV3.SchemaObject,
          example: p.example,
          examples: p.examples as Record<string, OpenAPIV3.ExampleObject> | undefined,
        };

        if (p.in === 'path') pathParams.push(paramDef);
        else if (p.in === 'query') queryParams.push(paramDef);
        else if (p.in === 'header') headerParams.push(paramDef);
      }
    }

    // Parse request body
    let requestBody: RequestBodyDefinition | undefined;
    if (operation.requestBody) {
      const rb = operation.requestBody as OpenAPIV3.RequestBodyObject;
      requestBody = {
        required: rb.required || false,
        description: rb.description,
        content: rb.content as Record<string, any>,
      };
    }

    // Parse responses
    const responses: Record<string, ResponseDefinition> = {};
    if (operation.responses) {
      for (const [statusCode, response] of Object.entries(operation.responses)) {
        const resp = response as OpenAPIV3.ResponseObject;
        responses[statusCode] = {
          statusCode,
          description: resp.description,
          content: resp.content as Record<string, any>,
          headers: resp.headers as Record<string, OpenAPIV3.HeaderObject>,
        };
      }
    }

    // Detect pagination support (common patterns)
    const supportsPagination = this.detectPagination(queryParams, responses);

    return {
      operationId,
      toolName,
      summary: operation.summary,
      description: operation.description,
      method: method.toUpperCase(),
      path,
      product,
      version,
      specFile,
      pathParameters: pathParams,
      queryParameters: queryParams,
      headerParameters: headerParams,
      requestBody,
      responses,
      tags: operation.tags || [],
      security: operation.security,
      servers: spec.servers,
      supportsPagination,
      extensions: (operation as any)['x-akamai-api'] as Record<string, unknown> | undefined,
    };
  }

  /**
   * Generate operation ID from method and path
   */
  private generateOperationId(method: string, path: string): string {
    // Remove path parameters and convert to camelCase
    const normalized = path
      .replace(/\{[^}]+\}/g, '') // Remove {param}
      .replace(/^\//, '') // Remove leading slash
      .replace(/\/$/, '') // Remove trailing slash
      .split('/')
      .filter(Boolean)
      .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join('');

    return `${method.toLowerCase()}${normalized.charAt(0).toUpperCase() + normalized.slice(1)}`;
  }

  /**
   * Generate stable, deterministic tool name
   */
  private generateToolName(product: string, _version: string, operationId: string): string {
    // Format: akamai_{product}_{operation}
    // MCP has a 64-character limit on tool names, so truncate if needed
    const normalizedProduct = product.replace(/-/g, '_');
    let toolName = `akamai_${normalizedProduct}_${operationId}`;

    if (toolName.length > 64) {
      // Truncate operationId to fit within 64 chars
      const prefix = `akamai_${normalizedProduct}_`;
      const maxOpIdLength = 64 - prefix.length;
      const truncatedOpId = operationId.substring(0, maxOpIdLength);
      toolName = `${prefix}${truncatedOpId}`;
    }

    return toolName;
  }

  /**
   * Detect if operation supports pagination
   */
  private detectPagination(
    queryParams: ParameterDefinition[],
    responses: Record<string, ResponseDefinition>
  ): boolean {
    // Common pagination parameters
    const paginationParams = ['limit', 'offset', 'page', 'pageSize', 'cursor'];

    const hasPageParam = queryParams.some(p =>
      paginationParams.some(pp => p.name.toLowerCase().includes(pp))
    );

    // Check if response contains pagination metadata
    const success200 = responses['200'];
    if (success200?.content?.['application/json']) {
      const schema = success200.content['application/json'].schema as OpenAPIV3.SchemaObject;
      if (schema.properties) {
        const hasPaginationMeta =
          'totalCount' in schema.properties ||
          'nextPage' in schema.properties ||
          'cursor' in schema.properties ||
          'hasMore' in schema.properties;
        return hasPageParam || hasPaginationMeta;
      }
    }

    return hasPageParam;
  }

  /**
   * Add operation to registry with indexing
   */
  private addOperation(operation: OperationDefinition): void {
    this.operations.set(operation.toolName, operation);

    // Index by product
    if (!this.operationsByProduct.has(operation.product)) {
      this.operationsByProduct.set(operation.product, []);
    }
    this.operationsByProduct.get(operation.product)!.push(operation.toolName);

    // Index by method
    if (!this.operationsByMethod.has(operation.method)) {
      this.operationsByMethod.set(operation.method, []);
    }
    this.operationsByMethod.get(operation.method)!.push(operation.toolName);
  }

  /**
   * Get operation by tool name
   */
  getOperation(toolName: string): OperationDefinition | undefined {
    return this.operations.get(toolName);
  }

  /**
   * Get all operations
   */
  getAllOperations(): OperationDefinition[] {
    return Array.from(this.operations.values());
  }

  /**
   * Search operations
   */
  search(options: SearchOptions): OperationDefinition[] {
    let results = this.getAllOperations();

    if (options.product) {
      const opNames = this.operationsByProduct.get(options.product) || [];
      results = results.filter(op => opNames.includes(op.toolName));
    }

    if (options.method) {
      results = results.filter(op => op.method === options.method!.toUpperCase());
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter(op => options.tags!.some(tag => op.tags.includes(tag)));
    }

    if (options.paginatable !== undefined) {
      results = results.filter(op => op.supportsPagination === options.paginatable);
    }

    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(
        op =>
          op.summary?.toLowerCase().includes(query) ||
          op.description?.toLowerCase().includes(query) ||
          op.toolName.toLowerCase().includes(query)
      );
    }

    return results;
  }

  /**
   * Get registry statistics
   */
  getStats(): RegistryStats {
    const operationsByProduct: Record<string, number> = {};
    for (const [product, ops] of this.operationsByProduct.entries()) {
      operationsByProduct[product] = ops.length;
    }

    const operationsByMethod: Record<string, number> = {};
    for (const [method, ops] of this.operationsByMethod.entries()) {
      operationsByMethod[method] = ops.length;
    }

    const paginatableOperations = this.getAllOperations().filter(op => op.supportsPagination)
      .length;

    const operationsWithBody = this.getAllOperations().filter(op => op.requestBody).length;

    return {
      totalOperations: this.operations.size,
      specsLoaded: this.operationsByProduct.size,
      operationsByProduct,
      operationsByMethod,
      paginatableOperations,
      operationsWithBody,
    };
  }
}

// Singleton instance
let registryInstance: OperationRegistry | null = null;

/**
 * Get the operation registry singleton
 */
export async function getOperationRegistry(): Promise<OperationRegistry> {
  if (!registryInstance) {
    registryInstance = new OperationRegistry();
    await registryInstance.load();
  }
  return registryInstance;
}

/**
 * Reset registry (for testing)
 */
export function resetRegistry(): void {
  registryInstance = null;
}
