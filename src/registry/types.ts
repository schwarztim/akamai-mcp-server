/**
 * Operation Registry Types
 *
 * Type definitions for the OpenAPI operation registry that catalogs
 * all Akamai API operations for dynamic MCP tool generation.
 */

import type { OpenAPIV3 } from 'openapi-types';

/**
 * Parsed OpenAPI operation with all necessary information
 * for tool generation and request execution.
 */
export interface OperationDefinition {
  /** Unique operation ID (from OpenAPI or generated) */
  operationId: string;

  /** Stable, deterministic MCP tool name */
  toolName: string;

  /** Human-readable operation summary */
  summary?: string;

  /** Detailed operation description */
  description?: string;

  /** HTTP method */
  method: string;

  /** Path template (e.g., /papi/v1/properties/{propertyId}) */
  path: string;

  /** API product/service name */
  product: string;

  /** API version */
  version: string;

  /** Spec file this operation came from */
  specFile: string;

  /** Path parameters */
  pathParameters: ParameterDefinition[];

  /** Query parameters */
  queryParameters: ParameterDefinition[];

  /** Header parameters */
  headerParameters: ParameterDefinition[];

  /** Request body schema (if any) */
  requestBody?: RequestBodyDefinition;

  /** Response schemas by status code */
  responses: Record<string, ResponseDefinition>;

  /** Tags from OpenAPI spec */
  tags: string[];

  /** Security requirements */
  security?: OpenAPIV3.SecurityRequirementObject[];

  /** Server URLs from spec (for base URL resolution) */
  servers?: OpenAPIV3.ServerObject[];

  /** Indicates if operation supports pagination */
  supportsPagination?: boolean;

  /** OpenAPI extensions (x-*) */
  extensions?: Record<string, unknown>;
}

/**
 * Parameter definition (path, query, or header)
 */
export interface ParameterDefinition {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  description?: string;
  schema: OpenAPIV3.SchemaObject;
  example?: unknown;
  examples?: Record<string, OpenAPIV3.ExampleObject>;
}

/**
 * Request body definition
 */
export interface RequestBodyDefinition {
  required: boolean;
  description?: string;
  content: Record<string, MediaTypeDefinition>;
}

/**
 * Media type definition
 */
export interface MediaTypeDefinition {
  schema: OpenAPIV3.SchemaObject;
  example?: unknown;
  examples?: Record<string, OpenAPIV3.ExampleObject>;
}

/**
 * Response definition
 */
export interface ResponseDefinition {
  statusCode: string;
  description: string;
  content?: Record<string, MediaTypeDefinition>;
  headers?: Record<string, OpenAPIV3.HeaderObject>;
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  /** Total number of operations */
  totalOperations: number;

  /** Number of API specs loaded */
  specsLoaded: number;

  /** Operations by product */
  operationsByProduct: Record<string, number>;

  /** Operations by HTTP method */
  operationsByMethod: Record<string, number>;

  /** Operations with pagination support */
  paginatableOperations: number;

  /** Operations requiring request body */
  operationsWithBody: number;
}

/**
 * Registry search options
 */
export interface SearchOptions {
  /** Filter by product name */
  product?: string;

  /** Filter by HTTP method */
  method?: string;

  /** Filter by tags */
  tags?: string[];

  /** Text search in summary/description */
  query?: string;

  /** Filter operations that support pagination */
  paginatable?: boolean;
}
