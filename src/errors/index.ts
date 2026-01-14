/**
 * Custom error classes for better error handling and debugging
 */

/**
 * Base error class for all Akamai MCP errors
 */
export class AkamaiMcpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends AkamaiMcpError {
  constructor(message: string, details?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
  }
}

/**
 * Configuration validation errors
 */
export class ConfigurationError extends AkamaiMcpError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIGURATION_ERROR', undefined, details);
  }
}

/**
 * API rate limiting errors
 */
export class RateLimitError extends AkamaiMcpError {
  constructor(
    message: string = 'API rate limit exceeded',
    public readonly retryAfter?: number,
    details?: unknown
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429, details);
  }
}

/**
 * Network and connection errors
 */
export class NetworkError extends AkamaiMcpError {
  constructor(message: string, details?: unknown) {
    super(message, 'NETWORK_ERROR', undefined, details);
  }
}

/**
 * API validation errors (invalid parameters)
 */
export class ValidationError extends AkamaiMcpError {
  constructor(message: string, public readonly errors?: unknown[], details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends AkamaiMcpError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, { resource, identifier });
  }
}

/**
 * API timeout errors
 */
export class TimeoutError extends AkamaiMcpError {
  constructor(operation: string, timeoutMs: number) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 'TIMEOUT_ERROR', 408, {
      operation,
      timeoutMs,
    });
  }
}

/**
 * General API errors from Akamai
 */
export class ApiError extends AkamaiMcpError {
  constructor(message: string, statusCode: number, details?: unknown) {
    super(message, 'API_ERROR', statusCode, details);
  }
}

/**
 * Errors related to tool execution
 */
export class ToolExecutionError extends AkamaiMcpError {
  constructor(toolName: string, message: string, details?: unknown) {
    super(`Tool '${toolName}' execution failed: ${message}`, 'TOOL_EXECUTION_ERROR', undefined, {
      toolName,
      ...(typeof details === 'object' && details !== null ? details : { details }),
    });
  }
}

/**
 * Helper function to create appropriate error from unknown error
 */
export function normalizeError(error: unknown, context?: string): AkamaiMcpError {
  // Already a custom error
  if (error instanceof AkamaiMcpError) {
    return error;
  }

  // HTTP error with status code
  if (error && typeof error === 'object') {
    const err = error as any;

    // Check for axios-style errors
    if (err.response?.status) {
      const status = err.response.status;
      const message = err.response.data?.detail || err.response.data?.message || err.message || 'API request failed';

      if (status === 401 || status === 403) {
        return new AuthenticationError(message, err.response.data);
      }
      if (status === 404) {
        return new NotFoundError(context || 'Resource', err.response.data?.identifier);
      }
      if (status === 429) {
        const retryAfter = err.response.headers?.['retry-after'];
        return new RateLimitError(message, retryAfter ? parseInt(retryAfter, 10) : undefined, err.response.data);
      }
      if (status >= 400 && status < 500) {
        return new ValidationError(message, err.response.data?.errors, err.response.data);
      }
      if (status >= 500) {
        return new ApiError(message, status, err.response.data);
      }
    }

    // Timeout errors (check before network errors since ETIMEDOUT is both)
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      return new TimeoutError(context || 'request', err.timeout || 30000);
    }

    // Network errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
      return new NetworkError(err.message || 'Network error occurred', { code: err.code });
    }
  }

  // Generic error
  if (error instanceof Error) {
    return new AkamaiMcpError(error.message, 'UNKNOWN_ERROR', undefined, { originalError: error.name });
  }

  // Unknown error type
  return new AkamaiMcpError(String(error), 'UNKNOWN_ERROR');
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof RateLimitError || error instanceof NetworkError || error instanceof TimeoutError) {
    return true;
  }

  if (error instanceof ApiError && error.statusCode) {
    return error.statusCode >= 500 && error.statusCode <= 504;
  }

  return false;
}
