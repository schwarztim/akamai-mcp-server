/**
 * Response Schema Validation
 *
 * Validates API responses against OpenAPI schemas to ensure data integrity
 * and catch API contract violations early.
 */

import { z } from 'zod';
import { getLogger } from '../utils/logger.js';
import type { OpenAPIV3 } from 'openapi-types';

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
  data?: any;
}

export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
  received?: string;
}

export interface ValidationStats {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  errorsByType: Record<string, number>;
}

/**
 * Response Validator
 */
export class ResponseValidator {
  private validationCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private errorsByType: Map<string, number> = new Map();
  private readonly logger;
  private readonly strictMode: boolean;

  constructor(options: { strictMode?: boolean } = {}) {
    this.logger = getLogger();
    this.strictMode = options.strictMode ?? false;

    this.logger.info('Response validator initialized', {
      strictMode: this.strictMode,
    });
  }

  /**
   * Validate response against OpenAPI schema
   */
  validate(
    response: any,
    schema: OpenAPIV3.SchemaObject | undefined,
    statusCode: number
  ): ValidationResult {
    this.validationCount++;

    if (!schema) {
      this.logger.debug('No schema provided for validation');
      return {
        valid: true,
        data: response,
      };
    }

    try {
      // Convert OpenAPI schema to Zod schema
      const zodSchema = this.openAPIToZod(schema);

      // Validate response
      const result = zodSchema.safeParse(response);

      if (result.success) {
        this.successCount++;
        return {
          valid: true,
          data: result.data,
        };
      }

      // Handle validation errors
      this.failureCount++;
      const errors = this.formatZodErrors(result.error);

      // Track error types
      for (const error of errors) {
        const count = this.errorsByType.get(error.message) || 0;
        this.errorsByType.set(error.message, count + 1);
      }

      this.logger.warn('Response validation failed', {
        statusCode,
        errors: errors.slice(0, 5), // Limit logged errors
        totalErrors: errors.length,
      });

      return {
        valid: false,
        errors,
        data: this.strictMode ? undefined : response,
      };
    } catch (error) {
      this.failureCount++;

      this.logger.error('Validation error', { error });

      return {
        valid: false,
        errors: [
          {
            path: '$',
            message: 'Schema validation failed',
            expected: 'valid schema',
            received: String(error),
          },
        ],
        data: this.strictMode ? undefined : response,
      };
    }
  }

  /**
   * Convert OpenAPI schema to Zod schema
   */
  private openAPIToZod(schema: OpenAPIV3.SchemaObject): z.ZodType<any> {
    // Handle references (simplified - full implementation would resolve $ref)
    if ('$ref' in schema) {
      // For now, accept any for refs
      return z.any();
    }

    // Handle type-based schemas
    const schemaType = schema.type;

    if (schemaType === 'string') {
      return this.createStringSchema(schema);
    }

    if (schemaType === 'number' || schemaType === 'integer') {
      return this.createNumberSchema(schema);
    }

    if (schemaType === 'boolean') {
      return z.boolean();
    }

    if (schemaType === 'array') {
      return this.createArraySchema(schema);
    }

    if (schemaType === 'object') {
      return this.createObjectSchema(schema);
    }

    // Handle allOf, anyOf, oneOf
    if (schema.allOf) {
      return this.createAllOfSchema(schema.allOf as OpenAPIV3.SchemaObject[]);
    }

    if (schema.anyOf) {
      return this.createAnyOfSchema(schema.anyOf as OpenAPIV3.SchemaObject[]);
    }

    if (schema.oneOf) {
      return this.createOneOfSchema(schema.oneOf as OpenAPIV3.SchemaObject[]);
    }

    // Default to any if unknown
    return z.any();
  }

  /**
   * Create string schema with constraints
   */
  private createStringSchema(schema: OpenAPIV3.SchemaObject): z.ZodString {
    let zodSchema = z.string();

    if (schema.minLength !== undefined) {
      zodSchema = zodSchema.min(schema.minLength);
    }

    if (schema.maxLength !== undefined) {
      zodSchema = zodSchema.max(schema.maxLength);
    }

    if (schema.pattern) {
      zodSchema = zodSchema.regex(new RegExp(schema.pattern));
    }

    if (schema.format === 'email') {
      zodSchema = zodSchema.email();
    }

    if (schema.format === 'uri' || schema.format === 'url') {
      zodSchema = zodSchema.url();
    }

    if (schema.format === 'uuid') {
      zodSchema = zodSchema.uuid();
    }

    return zodSchema;
  }

  /**
   * Create number schema with constraints
   */
  private createNumberSchema(schema: OpenAPIV3.SchemaObject): z.ZodNumber {
    let zodSchema = z.number();

    if (schema.type === 'integer') {
      zodSchema = zodSchema.int();
    }

    if (schema.minimum !== undefined) {
      zodSchema = zodSchema.min(schema.minimum);
    }

    if (schema.maximum !== undefined) {
      zodSchema = zodSchema.max(schema.maximum);
    }

    return zodSchema;
  }

  /**
   * Create array schema
   */
  private createArraySchema(schema: any): z.ZodArray<any> {
    const items = schema.items as OpenAPIV3.SchemaObject | undefined;
    const itemSchema = items ? this.openAPIToZod(items) : z.any();

    let zodSchema = z.array(itemSchema);

    if (schema.minItems !== undefined) {
      zodSchema = zodSchema.min(schema.minItems);
    }

    if (schema.maxItems !== undefined) {
      zodSchema = zodSchema.max(schema.maxItems);
    }

    return zodSchema;
  }

  /**
   * Create object schema
   */
  private createObjectSchema(schema: OpenAPIV3.SchemaObject): z.ZodObject<any> {
    const properties = schema.properties || {};
    const required = schema.required || [];

    const shape: Record<string, z.ZodType<any>> = {};

    for (const [key, propSchema] of Object.entries(properties)) {
      const zodProp = this.openAPIToZod(propSchema as OpenAPIV3.SchemaObject);
      shape[key] = required.includes(key) ? zodProp : zodProp.optional();
    }

    const zodObject = z.object(shape);

    // Handle additionalProperties
    if (schema.additionalProperties === false) {
      return zodObject.strict();
    }

    return zodObject.passthrough();
  }

  /**
   * Create allOf schema (intersection)
   */
  private createAllOfSchema(schemas: OpenAPIV3.SchemaObject[]): z.ZodType<any> {
    if (schemas.length === 0) {
      return z.any();
    }

    if (schemas.length === 1) {
      return this.openAPIToZod(schemas[0]);
    }

    // Create intersection of all schemas
    let result = this.openAPIToZod(schemas[0]);
    for (let i = 1; i < schemas.length; i++) {
      result = z.intersection(result, this.openAPIToZod(schemas[i]));
    }

    return result;
  }

  /**
   * Create anyOf schema (union)
   */
  private createAnyOfSchema(schemas: OpenAPIV3.SchemaObject[]): z.ZodType<any> {
    if (schemas.length === 0) {
      return z.any();
    }

    if (schemas.length === 1) {
      return this.openAPIToZod(schemas[0]);
    }

    const zodSchemas = schemas.map((s) => this.openAPIToZod(s));
    return z.union([zodSchemas[0], zodSchemas[1], ...zodSchemas.slice(2)]);
  }

  /**
   * Create oneOf schema (discriminated union)
   */
  private createOneOfSchema(schemas: OpenAPIV3.SchemaObject[]): z.ZodType<any> {
    // Similar to anyOf for now
    return this.createAnyOfSchema(schemas);
  }

  /**
   * Format Zod errors into our ValidationError format
   */
  private formatZodErrors(error: z.ZodError): ValidationError[] {
    return error.errors.map((err) => ({
      path: err.path.join('.') || '$',
      message: err.message,
      expected: err.code,
      received: 'received' in err ? String(err.received) : undefined,
    }));
  }

  /**
   * Get validation statistics
   */
  getStats(): ValidationStats {
    return {
      totalValidations: this.validationCount,
      successfulValidations: this.successCount,
      failedValidations: this.failureCount,
      errorsByType: Object.fromEntries(this.errorsByType),
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.validationCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.errorsByType.clear();
  }

  /**
   * Get validation health
   */
  getHealth(): {
    healthy: boolean;
    successRate: number;
    message: string;
  } {
    if (this.validationCount === 0) {
      return {
        healthy: true,
        successRate: 100,
        message: 'No validations performed',
      };
    }

    const successRate = (this.successCount / this.validationCount) * 100;

    if (successRate < 80) {
      return {
        healthy: false,
        successRate: Math.round(successRate * 100) / 100,
        message: 'High validation failure rate',
      };
    }

    return {
      healthy: true,
      successRate: Math.round(successRate * 100) / 100,
      message: 'Validation healthy',
    };
  }
}

// Singleton instance
let validatorInstance: ResponseValidator | null = null;

/**
 * Get the global response validator
 */
export function getResponseValidator(options?: {
  strictMode?: boolean;
}): ResponseValidator {
  if (!validatorInstance) {
    validatorInstance = new ResponseValidator(options);
  }
  return validatorInstance;
}

/**
 * Reset the response validator (for testing)
 */
export function resetResponseValidator(): void {
  validatorInstance = null;
}
