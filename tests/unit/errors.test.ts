/**
 * Unit tests for error classes
 */
import { describe, it, expect } from 'vitest';
import {
  AkamaiMcpError,
  AuthenticationError,
  ConfigurationError,
  RateLimitError,
  NetworkError,
  ValidationError,
  NotFoundError,
  TimeoutError,
  ApiError,
  ToolExecutionError,
  normalizeError,
  isRetryable,
} from '../../src/errors/index.js';

describe('Error Classes', () => {
  describe('AkamaiMcpError', () => {
    it('should create base error with all properties', () => {
      const error = new AkamaiMcpError('Test error', 'TEST_CODE', 500, { detail: 'test' });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.name).toBe('AkamaiMcpError');
    });

    it('should serialize to JSON correctly', () => {
      const error = new AkamaiMcpError('Test error', 'TEST_CODE', 500);
      const json = error.toJSON();

      expect(json).toEqual({
        name: 'AkamaiMcpError',
        message: 'Test error',
        code: 'TEST_CODE',
        statusCode: 500,
        details: undefined,
      });
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with correct defaults', () => {
      const error = new AuthenticationError('Invalid credentials');

      expect(error.message).toBe('Invalid credentials');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('AuthenticationError');
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error with retry after', () => {
      const error = new RateLimitError('Too many requests', 60);

      expect(error.message).toBe('Too many requests');
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });

    it('should use default message when none provided', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('API rate limit exceeded');
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with resource and identifier', () => {
      const error = new NotFoundError('Property', 'prp_123456');

      expect(error.message).toBe("Property with identifier 'prp_123456' not found");
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.details).toEqual({ resource: 'Property', identifier: 'prp_123456' });
    });

    it('should create not found error without identifier', () => {
      const error = new NotFoundError('Property');

      expect(error.message).toBe('Property not found');
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error with operation details', () => {
      const error = new TimeoutError('api_call', 30000);

      expect(error.message).toBe("Operation 'api_call' timed out after 30000ms");
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.statusCode).toBe(408);
      expect(error.details).toEqual({ operation: 'api_call', timeoutMs: 30000 });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with field errors', () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const error = new ValidationError('Validation failed', errors);

      expect(error.message).toBe('Validation failed');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.errors).toEqual(errors);
    });
  });

  describe('ToolExecutionError', () => {
    it('should create tool execution error with context', () => {
      const error = new ToolExecutionError('akamai_purge', 'Invalid URL format', {
        url: 'invalid',
      });

      expect(error.message).toBe("Tool 'akamai_purge' execution failed: Invalid URL format");
      expect(error.code).toBe('TOOL_EXECUTION_ERROR');
      expect(error.details).toEqual({ toolName: 'akamai_purge', url: 'invalid' });
    });
  });

  describe('normalizeError', () => {
    it('should return AkamaiMcpError as-is', () => {
      const original = new AuthenticationError('Test');
      const normalized = normalizeError(original);

      expect(normalized).toBe(original);
    });

    it('should convert 401 response to AuthenticationError', () => {
      const axiosError = {
        response: {
          status: 401,
          data: { detail: 'Invalid token' },
        },
      };

      const normalized = normalizeError(axiosError);

      expect(normalized).toBeInstanceOf(AuthenticationError);
      expect(normalized.message).toBe('Invalid token');
    });

    it('should convert 404 response to NotFoundError', () => {
      const axiosError = {
        response: {
          status: 404,
          data: { identifier: 'prp_123' },
        },
      };

      const normalized = normalizeError(axiosError, 'Property');

      expect(normalized).toBeInstanceOf(NotFoundError);
    });

    it('should convert 429 response to RateLimitError', () => {
      const axiosError = {
        response: {
          status: 429,
          headers: { 'retry-after': '60' },
        },
      };

      const normalized = normalizeError(axiosError);

      expect(normalized).toBeInstanceOf(RateLimitError);
      expect((normalized as RateLimitError).retryAfter).toBe(60);
    });

    it('should convert network errors to NetworkError', () => {
      const networkError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      };

      const normalized = normalizeError(networkError);

      expect(normalized).toBeInstanceOf(NetworkError);
      expect(normalized.message).toBe('Connection refused');
    });

    it('should convert timeout errors to TimeoutError', () => {
      const timeoutError = {
        code: 'ETIMEDOUT',
        timeout: 5000,
      };

      const normalized = normalizeError(timeoutError, 'api_request');

      expect(normalized).toBeInstanceOf(TimeoutError);
    });

    it('should handle generic Error objects', () => {
      const error = new Error('Something went wrong');
      const normalized = normalizeError(error);

      expect(normalized).toBeInstanceOf(AkamaiMcpError);
      expect(normalized.message).toBe('Something went wrong');
      expect(normalized.code).toBe('UNKNOWN_ERROR');
    });

    it('should handle unknown error types', () => {
      const normalized = normalizeError('String error');

      expect(normalized).toBeInstanceOf(AkamaiMcpError);
      expect(normalized.message).toBe('String error');
      expect(normalized.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('isRetryable', () => {
    it('should return true for RateLimitError', () => {
      const error = new RateLimitError();
      expect(isRetryable(error)).toBe(true);
    });

    it('should return true for NetworkError', () => {
      const error = new NetworkError('Connection failed');
      expect(isRetryable(error)).toBe(true);
    });

    it('should return true for TimeoutError', () => {
      const error = new TimeoutError('request', 5000);
      expect(isRetryable(error)).toBe(true);
    });

    it('should return true for 5xx ApiError', () => {
      const error = new ApiError('Server error', 500);
      expect(isRetryable(error)).toBe(true);
    });

    it('should return false for 4xx ApiError', () => {
      const error = new ApiError('Bad request', 400);
      expect(isRetryable(error)).toBe(false);
    });

    it('should return false for AuthenticationError', () => {
      const error = new AuthenticationError('Invalid credentials');
      expect(isRetryable(error)).toBe(false);
    });

    it('should return false for ValidationError', () => {
      const error = new ValidationError('Invalid input');
      expect(isRetryable(error)).toBe(false);
    });

    it('should return false for generic errors', () => {
      const error = new Error('Unknown error');
      expect(isRetryable(error)).toBe(false);
    });
  });
});
