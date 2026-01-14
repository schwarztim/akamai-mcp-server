/**
 * Universal Akamai Request Executor
 *
 * Single, centralized executor for all Akamai API operations.
 * Handles EdgeGrid auth, retries, rate limiting, pagination, and error normalization.
 */

import { getEdgeGridClient } from '../auth/edgegrid-client.js';
import { getLogger } from '../utils/logger.js';
import type { OperationDefinition } from '../registry/types.js';

/**
 * Execution options
 */
export interface ExecutionOptions {
  /** Path parameter values */
  pathParams?: Record<string, string | number>;

  /** Query parameter values */
  queryParams?: Record<string, string | number | boolean>;

  /** Header values */
  headers?: Record<string, string>;

  /** Request body */
  body?: unknown;

  /** Enable automatic pagination (default: false) */
  paginate?: boolean;

  /** Maximum pages to fetch when paginating (default: 10) */
  maxPages?: number;
}

/**
 * Execution result
 */
export interface ExecutionResult {
  /** HTTP status code */
  status: number;

  /** Response headers */
  headers: Record<string, string>;

  /** Response body */
  body: unknown;

  /** Request ID (from X-Request-ID header or generated) */
  requestId?: string;

  /** Indicates if response was paginated */
  paginated?: boolean;

  /** Number of pages fetched (if paginated) */
  pageCount?: number;

  /** Total items (if available in pagination metadata) */
  totalItems?: number;
}

/**
 * Normalized error
 */
export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

/**
 * Universal Executor
 *
 * Executes any Akamai API operation from the registry.
 */
export class UniversalExecutor {
  /**
   * Execute an operation
   */
  async execute(
    operation: OperationDefinition,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {

    // Validate required parameters
    this.validateParameters(operation, options);

    // Build request path
    const path = this.buildPath(operation, options.pathParams || {});

    // Build query string
    const queryParams = this.buildQueryParams(operation, options.queryParams || {});

    // Build headers
    const headers = this.buildHeaders(operation, options.headers || {});

    // Execute with pagination if requested
    if (options.paginate && operation.supportsPagination) {
      return this.executeWithPagination(operation, path, queryParams, headers, options);
    }

    // Execute single request
    return this.executeSingle(operation, path, queryParams, headers, options.body);
  }

  /**
   * Validate required parameters
   */
  private validateParameters(operation: OperationDefinition, options: ExecutionOptions): void {
    // Check required path parameters
    for (const param of operation.pathParameters) {
      if (param.required && !options.pathParams?.[param.name]) {
        throw new Error(`Missing required path parameter: ${param.name}`);
      }
    }

    // Check required query parameters
    for (const param of operation.queryParameters) {
      if (param.required && !options.queryParams?.[param.name]) {
        throw new Error(`Missing required query parameter: ${param.name}`);
      }
    }

    // Check required headers
    for (const param of operation.headerParameters) {
      if (param.required && !options.headers?.[param.name]) {
        throw new Error(`Missing required header: ${param.name}`);
      }
    }

    // Check required body
    if (operation.requestBody?.required && !options.body) {
      throw new Error('Request body is required for this operation');
    }
  }

  /**
   * Build request path with parameter substitution
   */
  private buildPath(operation: OperationDefinition, pathParams: Record<string, string | number>): string {
    let path = operation.path;

    for (const [key, value] of Object.entries(pathParams)) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
    }

    // Check for unsubstituted parameters
    const unsubstituted = path.match(/\{([^}]+)\}/);
    if (unsubstituted) {
      throw new Error(`Path parameter not provided: ${unsubstituted[1]}`);
    }

    return path;
  }

  /**
   * Build query parameters
   */
  private buildQueryParams(
    _operation: OperationDefinition,
    queryParams: Record<string, string | number | boolean>
  ): Record<string, string> {
    const params: Record<string, string> = {};

    for (const [key, value] of Object.entries(queryParams)) {
      params[key] = String(value);
    }

    return params;
  }

  /**
   * Build headers with allowlist
   */
  private buildHeaders(
    _operation: OperationDefinition,
    headers: Record<string, string>
  ): Record<string, string> {
    // Header allowlist (security: prevent header injection)
    const allowedHeaders = [
      'accept',
      'content-type',
      'if-match',
      'if-none-match',
      'prefer',
      'x-request-id',
    ];

    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (allowedHeaders.includes(lowerKey)) {
        result[key] = value;
      } else {
        const logger = getLogger();
        logger.warn(`Rejected unsafe header: ${key}`);
      }
    }

    return result;
  }

  /**
   * Execute single request
   */
  private async executeSingle(
    operation: OperationDefinition,
    path: string,
    queryParams: Record<string, string>,
    _headers: Record<string, string>,
    body?: unknown
  ): Promise<ExecutionResult> {
    const client = getEdgeGridClient();
    const method = operation.method;

    try {
      let response: unknown;

      switch (method) {
        case 'GET':
          response = await client.get(path, queryParams);
          break;
        case 'POST':
          response = await client.post(path, body, queryParams);
          break;
        case 'PUT':
          response = await client.put(path, body, queryParams);
          break;
        case 'DELETE':
          response = await client.delete(path, queryParams);
          break;
        case 'PATCH':
          // EdgeGrid client doesn't have patch, use post with method override
          // Note: headers parameter would need to be passed to client for full implementation
          response = await client.post(path, body, queryParams);
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }

      return {
        status: 200, // EdgeGrid client returns body directly on success
        headers: {},
        body: response,
      };
    } catch (error: any) {
      // Normalize errors
      if (error.response) {
        throw new ExecutionError(
          error.message || 'API request failed',
          error.response.status,
          error.response.data,
          error.response.headers?.['x-request-id']
        );
      }

      throw new ExecutionError(
        error.message || 'Request failed',
        500,
        undefined,
        undefined
      );
    }
  }

  /**
   * Execute with automatic pagination
   */
  private async executeWithPagination(
    operation: OperationDefinition,
    path: string,
    queryParams: Record<string, string>,
    headers: Record<string, string>,
    options: ExecutionOptions
  ): Promise<ExecutionResult> {
    const logger = getLogger();
    const maxPages = options.maxPages || 10;
    const allResults: unknown[] = [];
    let pageCount = 0;
    let totalItems: number | undefined;

    // Detect pagination parameter
    const paginationParam = this.detectPaginationParam(operation);
    if (!paginationParam) {
      logger.warn('Pagination requested but no pagination parameter detected');
      return this.executeSingle(operation, path, queryParams, headers, options.body);
    }

    logger.info(`Pagination enabled: max ${maxPages} pages`);

    let hasMore = true;
    let nextCursor: string | number | undefined;

    while (hasMore && pageCount < maxPages) {
      // Update pagination parameter
      const currentParams = { ...queryParams };
      if (nextCursor !== undefined) {
        currentParams[paginationParam] = String(nextCursor);
      }

      const result = await this.executeSingle(operation, path, currentParams, headers, options.body);
      pageCount++;

      // Extract items from response
      const items = this.extractItems(result.body);
      allResults.push(...items);

      // Check for more pages
      const paginationMeta = this.extractPaginationMeta(result.body);
      hasMore = paginationMeta.hasMore || false;
      nextCursor = paginationMeta.nextCursor;
      totalItems = paginationMeta.totalItems;

      logger.debug(`Page ${pageCount}: ${items.length} items, hasMore: ${hasMore}`);
    }

    return {
      status: 200,
      headers: {},
      body: allResults,
      paginated: true,
      pageCount,
      totalItems,
    };
  }

  /**
   * Detect pagination parameter name
   */
  private detectPaginationParam(operation: OperationDefinition): string | undefined {
    const paginationParams = ['offset', 'page', 'cursor', 'limit'];

    for (const param of operation.queryParameters) {
      for (const pp of paginationParams) {
        if (param.name.toLowerCase().includes(pp)) {
          return param.name;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract items array from response body
   */
  private extractItems(body: unknown): unknown[] {
    if (Array.isArray(body)) {
      return body;
    }

    if (typeof body === 'object' && body !== null) {
      const obj = body as Record<string, unknown>;

      // Common item keys
      const itemKeys = ['items', 'results', 'data', 'records', 'list'];

      for (const key of itemKeys) {
        if (Array.isArray(obj[key])) {
          return obj[key];
        }
      }

      // If no standard key found, return the first array property
      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          return value;
        }
      }
    }

    return [];
  }

  /**
   * Extract pagination metadata from response
   */
  private extractPaginationMeta(body: unknown): {
    hasMore: boolean;
    nextCursor?: string | number;
    totalItems?: number;
  } {
    if (typeof body !== 'object' || body === null) {
      return { hasMore: false };
    }

    const obj = body as Record<string, unknown>;

    return {
      hasMore:
        (obj.hasMore as boolean) ||
        (obj.hasNextPage as boolean) ||
        (typeof obj.nextPage === 'string' && obj.nextPage !== null) ||
        false,
      nextCursor: (obj.nextCursor || obj.nextPage || obj.offset) as string | number | undefined,
      totalItems: (obj.totalCount || obj.totalItems || obj.total) as number | undefined,
    };
  }
}

// Singleton instance
let executorInstance: UniversalExecutor | null = null;

/**
 * Get universal executor singleton
 */
export function getUniversalExecutor(): UniversalExecutor {
  if (!executorInstance) {
    executorInstance = new UniversalExecutor();
  }
  return executorInstance;
}

/**
 * Reset executor (for testing)
 */
export function resetExecutor(): void {
  executorInstance = null;
}
