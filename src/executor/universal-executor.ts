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
 * Rate limit information from Akamai API headers
 */
export interface RateLimitInfo {
  /** Maximum requests allowed in current window */
  limit?: number;

  /** Requests remaining in current window */
  remaining?: number;

  /** Time when rate limit resets (ISO 8601 format) */
  nextReset?: string;
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

  /** Rate limit information (if available in response headers) */
  rateLimit?: RateLimitInfo;
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

    // Build headers FIRST (includes auto-injection for required headers)
    // This must happen before validation so auto-injected headers are considered
    const headers = this.buildHeaders(operation, options.headers || {});

    // Validate required parameters (with merged headers)
    this.validateParameters(operation, { ...options, headers });

    // Build request path
    const path = this.buildPath(operation, options.pathParams || {});

    // Build query string
    const queryParams = this.buildQueryParams(operation, options.queryParams || {});

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

    // Check required headers (case-insensitive)
    for (const param of operation.headerParameters) {
      if (param.required) {
        const headerKeys = Object.keys(options.headers || {}).map(k => k.toLowerCase());
        if (!headerKeys.includes(param.name.toLowerCase())) {
          throw new Error(`Missing required header: ${param.name}`);
        }
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
    // Get base path from servers array (e.g., "/papi/v1" from "https://{hostname}/papi/v1")
    let basePath = '';
    if (operation.servers && operation.servers.length > 0) {
      const serverUrl = operation.servers[0].url;
      // Extract path portion from URL (after the hostname placeholder or domain)
      const match = serverUrl.match(/https?:\/\/[^/]+(\/.*)/);
      if (match) {
        basePath = match[1];
      }
    }

    // Combine base path with operation path
    let path = basePath + operation.path;

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
   * Build headers with allowlist and auto-inject required headers
   */
  private buildHeaders(
    operation: OperationDefinition,
    headers: Record<string, string>
  ): Record<string, string> {
    // Header allowlist (security: prevent header injection)
    // Includes standard HTTP headers + Akamai-specific headers
    const allowedHeaders = [
      'accept',
      'content-type',
      'if-match',
      'if-none-match',
      'prefer',
      'x-request-id',
      // Akamai-specific headers
      'papi-use-prefixes',
      'x-akamai-contract',
      'x-akamai-group',
      'x-akamai-purge',
      'akamai-signature-algorithm',
    ];

    const result: Record<string, string> = {};

    // Auto-inject required headers based on API product
    // PAPI requires PAPI-Use-Prefixes header
    if (operation.product === 'papi') {
      result['PAPI-Use-Prefixes'] = 'true';
    }

    // Apply user-provided headers (override auto-injected ones)
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
   * Extract rate limit information from response headers
   */
  private extractRateLimitInfo(headers: Record<string, string>): RateLimitInfo | undefined {
    const limit = headers['akamai-ratelimit-limit'] || headers['Akamai-RateLimit-Limit'];
    const remaining = headers['akamai-ratelimit-remaining'] || headers['Akamai-RateLimit-Remaining'];
    const nextReset = headers['akamai-ratelimit-next'] || headers['Akamai-RateLimit-Next'];

    if (!limit && !remaining && !nextReset) {
      return undefined;
    }

    return {
      limit: limit ? parseInt(limit, 10) : undefined,
      remaining: remaining ? parseInt(remaining, 10) : undefined,
      nextReset: nextReset || undefined,
    };
  }

  /**
   * Execute single request
   */
  private async executeSingle(
    operation: OperationDefinition,
    path: string,
    queryParams: Record<string, string>,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<ExecutionResult> {
    const client = getEdgeGridClient();
    const method = operation.method;

    try {
      let response: any;

      switch (method) {
        case 'GET':
          response = await client.get(path, queryParams, headers);
          break;
        case 'POST':
          response = await client.post(path, body, queryParams, headers);
          break;
        case 'PUT':
          response = await client.put(path, body, queryParams, headers);
          break;
        case 'DELETE':
          response = await client.delete(path, queryParams, headers);
          break;
        case 'PATCH':
          // EdgeGrid client doesn't have patch, use post with method override
          response = await client.post(path, body, queryParams, headers);
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }

      const result: ExecutionResult = {
        status: response.statusCode || 200,
        headers: response.headers || {},
        body: response.body,
        requestId: response.headers?.['x-request-id'] || response.headers?.['X-Request-ID'],
      };

      // Extract rate limit info if available
      const rateLimit = this.extractRateLimitInfo(response.headers || {});
      if (rateLimit) {
        result.rateLimit = rateLimit;
      }

      return result;
    } catch (error: any) {
      // Normalize errors
      if (error.response) {
        throw new ExecutionError(
          error.message || 'API request failed',
          error.response.status,
          error.response.data,
          error.response.headers?.['x-request-id'] || error.response.headers?.['X-Request-ID']
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
