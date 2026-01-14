# API Reference

Complete API documentation for the Akamai MCP Server.

## Table of Contents

- [Error Handling](#error-handling)
- [Input Validation](#input-validation)
- [Tool Handlers](#tool-handlers)
- [Utilities](#utilities)
- [Configuration](#configuration)

## Error Handling

### Error Classes

All errors extend `AkamaiMcpError` which provides consistent error structure.

#### AkamaiMcpError

Base error class for all MCP errors.

```typescript
class AkamaiMcpError extends Error {
  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: unknown
  );

  toJSON(): {
    name: string;
    message: string;
    code: string;
    statusCode?: number;
    details?: unknown;
  };
}
```

#### AuthenticationError

Authentication and authorization failures.

```typescript
class AuthenticationError extends AkamaiMcpError {
  constructor(message: string, details?: unknown);
  // statusCode: 401
  // code: 'AUTHENTICATION_ERROR'
}
```

**Example:**
```typescript
throw new AuthenticationError('Invalid API credentials');
```

#### ValidationError

Input validation failures.

```typescript
class ValidationError extends AkamaiMcpError {
  constructor(
    message: string,
    errors?: unknown[],
    details?: unknown
  );
  // statusCode: 400
  // code: 'VALIDATION_ERROR'
}
```

**Example:**
```typescript
throw new ValidationError('Invalid input', [
  { field: 'email', message: 'Invalid email format' }
]);
```

#### RateLimitError

API rate limiting errors.

```typescript
class RateLimitError extends AkamaiMcpError {
  constructor(
    message?: string,
    retryAfter?: number,
    details?: unknown
  );
  // statusCode: 429
  // code: 'RATE_LIMIT_ERROR'
}
```

**Example:**
```typescript
throw new RateLimitError('Rate limit exceeded', 60);
```

#### Other Error Classes

- `NetworkError` - Network and connection issues
- `NotFoundError` - Resource not found (404)
- `TimeoutError` - Request timeout (408)
- `ApiError` - General API errors with status code
- `ToolExecutionError` - Tool execution failures
- `ConfigurationError` - Configuration validation errors

### Error Utilities

#### normalizeError

Converts unknown errors to structured `AkamaiMcpError` instances.

```typescript
function normalizeError(
  error: unknown,
  context?: string
): AkamaiMcpError;
```

**Example:**
```typescript
try {
  await apiCall();
} catch (error) {
  const normalized = normalizeError(error, 'property fetch');
  logger.error('API call failed', { error: normalized });
  throw normalized;
}
```

#### isRetryable

Determines if an error should trigger a retry.

```typescript
function isRetryable(error: unknown): boolean;
```

Returns `true` for:
- `RateLimitError` (429)
- `NetworkError` (connection issues)
- `TimeoutError` (timeouts)
- `ApiError` with 5xx status codes

**Example:**
```typescript
try {
  await operation();
} catch (error) {
  if (isRetryable(error)) {
    // Retry logic
  } else {
    throw error;
  }
}
```

## Input Validation

### validateInput

Validates input against a Zod schema and throws `ValidationError` on failure.

```typescript
function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): T;
```

**Example:**
```typescript
import { validateInput, fastPurgeSchemas } from '../utils/validation.js';

const validated = validateInput(fastPurgeSchemas.purgeByUrl, args);
// validated is fully typed and guaranteed valid
```

### Common Schemas

Pre-defined validation schemas for common patterns:

```typescript
const commonSchemas = {
  network: z.enum(['staging', 'production']).default('production'),
  purgeAction: z.enum(['remove', 'invalidate']).default('remove'),
  propertyId: z.string().regex(/^prp_\d+$/),
  contractId: z.string().regex(/^ctr_[A-Z0-9-]+$/),
  groupId: z.string().regex(/^grp_\d+$/),
  edgeWorkerId: z.number().int().positive(),
  propertyVersion: z.number().int().positive(),
  email: z.string().email(),
  url: z.string().url(),
  dnsZone: z.string().regex(/^[a-zA-Z0-9.-]+$/),
  dnsRecordType: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', ...]),
  ttl: z.number().int().min(60).max(86400),
};
```

### Fast Purge Schemas

```typescript
const fastPurgeSchemas = {
  purgeByUrl: z.object({
    urls: z.array(commonSchemas.url).min(1).max(50),
    network: commonSchemas.network,
    action: commonSchemas.purgeAction,
  }),

  purgeByCacheTag: z.object({
    tags: z.array(z.string()).min(1).max(50),
    network: commonSchemas.network,
    action: commonSchemas.purgeAction,
  }),

  purgeByCpCode: z.object({
    cpCodes: z.array(z.number().int().positive()).min(1).max(50),
    network: commonSchemas.network,
    action: commonSchemas.purgeAction,
  }),

  getPurgeStatus: z.object({
    purgeId: z.string().min(1),
  }),
};
```

## Tool Handlers

### ToolHandler Type

All tool handlers follow this signature:

```typescript
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}
```

### Creating a Tool Handler

```typescript
import { validateInput } from '../utils/validation.js';
import { ToolHandler, formatSuccess, formatError } from './types.js';

export const myToolHandler: ToolHandler = async (args) => {
  try {
    // 1. Validate input
    const validated = validateInput(mySchema, args);

    // 2. Get client
    const client = getEdgeGridClient();

    // 3. Perform operation
    const result = await client.get('/api/endpoint', {
      params: validated,
    });

    // 4. Return success
    return formatSuccess(result);
  } catch (error) {
    // 5. Handle errors
    return formatError(error);
  }
};
```

### Format Functions

#### formatSuccess

Formats successful responses for MCP protocol.

```typescript
function formatSuccess(data: unknown): ToolResponse;
```

#### formatError

Formats error responses with proper structure.

```typescript
function formatError(error: unknown): ToolResponse;
```

## Utilities

### Retry Logic

#### withRetry

Executes a function with exponential backoff retry logic.

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  operationOrOptions: string | RetryOptions
): Promise<T>;

interface RetryOptions {
  maxRetries?: number;
  delayMs?: number;
}
```

**Example:**
```typescript
const result = await withRetry(
  () => client.get('/endpoint'),
  { maxRetries: 3, delayMs: 1000 }
);
```

Features:
- Exponential backoff with jitter
- Automatic retry for retryable errors
- Configurable retry count and delay
- Respects non-retryable errors (4xx)

### Rate Limiting

#### RateLimiter

Token bucket rate limiter to prevent API throttling.

```typescript
class RateLimiter {
  constructor(maxTokens?: number, refillRate?: number);
  async acquire(): Promise<void>;
}
```

**Example:**
```typescript
const limiter = new RateLimiter(20, 2); // 20 tokens, refill 2/sec

await limiter.acquire(); // Waits if no tokens available
await performApiCall();
```

### Logging

#### getLogger

Returns singleton Winston logger instance.

```typescript
function getLogger(): Logger;

interface Logger {
  info(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  debug(message: string, meta?: object): void;
}
```

**Example:**
```typescript
import { getLogger } from '../utils/logger.js';

const logger = getLogger();
logger.info('Operation started', { propertyId: 'prp_123' });
```

## Configuration

### getConfig

Returns validated configuration singleton.

```typescript
function getConfig(): Config;

interface Config {
  akamai: {
    host: string;
    clientToken: string;
    clientSecret: string;
    accessToken: string;
    accountKey?: string;
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    file: string;
  };
  retry: {
    maxRetries: number;
    retryDelayMs: number;
  };
  timeout: number;
}
```

### resetConfig

Resets configuration singleton (primarily for testing).

```typescript
function resetConfig(): void;
```

## Best Practices

### 1. Always Validate Input

```typescript
// ❌ Bad
const urls = args.urls as string[];

// ✅ Good
const validated = validateInput(fastPurgeSchemas.purgeByUrl, args);
const urls = validated.urls;
```

### 2. Use Custom Errors

```typescript
// ❌ Bad
throw new Error('Not found');

// ✅ Good
throw new NotFoundError('Property', propertyId);
```

### 3. Log Important Operations

```typescript
// ✅ Good
logger.info('Purging cache', { urls, network });
const result = await purgeCache(urls);
logger.info('Purge complete', { purgeId: result.purgeId });
```

### 4. Handle Errors Properly

```typescript
// ✅ Good
try {
  const result = await operation();
  return formatSuccess(result);
} catch (error) {
  logger.error('Operation failed', { error });
  return formatError(error);
}
```

### 5. Use Retry for Transient Failures

```typescript
// ✅ Good
const result = await withRetry(
  () => client.get('/endpoint'),
  'fetch property'
);
```
