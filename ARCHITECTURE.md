# Architecture Documentation

This document provides a comprehensive overview of the Akamai MCP Server architecture, design decisions, and implementation details.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Component Design](#component-design)
- [Data Flow](#data-flow)
- [Security Architecture](#security-architecture)
- [Error Handling Strategy](#error-handling-strategy)
- [Performance Considerations](#performance-considerations)
- [Design Decisions](#design-decisions)

## System Overview

The Akamai MCP Server is a TypeScript-based Model Context Protocol server that provides a standardized interface for interacting with Akamai's EdgeGrid APIs. The server acts as a middleware layer between MCP clients (like Claude Desktop) and Akamai's API infrastructure.

### Key Characteristics

- **Protocol**: Model Context Protocol (MCP) over stdio transport
- **Language**: TypeScript with Node.js runtime
- **Authentication**: EdgeGrid HMAC-SHA256 signing
- **Communication**: JSON-RPC 2.0 messages
- **Deployment**: Standalone process or containerized

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Client                               │
│                    (Claude Desktop, etc.)                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ stdio (JSON-RPC)
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    Akamai MCP Server                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              MCP Protocol Layer (index.ts)                │  │
│  │  - Request routing                                        │  │
│  │  - Tool registration                                      │  │
│  │  - Response formatting                                    │  │
│  └──────────────┬────────────────────────┬──────────────────┘  │
│                 │                        │                       │
│  ┌──────────────▼──────┐   ┌────────────▼──────────┐          │
│  │   Tool Handlers      │   │   Utilities           │          │
│  │  - Property Manager  │   │  - Configuration      │          │
│  │  - Fast Purge        │   │  - Logging            │          │
│  │  - EdgeWorkers       │   │  - Retry Logic        │          │
│  │  - DNS Management    │   │  - Rate Limiting      │          │
│  │  - Health Check      │   └───────────────────────┘          │
│  └──────────────┬────────┘                                      │
│                 │                                                │
│  ┌──────────────▼──────────────────────────────────────────┐  │
│  │           EdgeGrid Client (auth/edgegrid-client.ts)      │  │
│  │  - HMAC-SHA256 signing                                   │  │
│  │  - Request/Response handling                             │  │
│  │  - Automatic retries                                     │  │
│  │  - Rate limiting                                         │  │
│  └──────────────┬───────────────────────────────────────────┘  │
└─────────────────┼──────────────────────────────────────────────┘
                  │ HTTPS (EdgeGrid Auth)
                  │
┌─────────────────▼──────────────────────────────────────────────┐
│              Akamai EdgeGrid APIs                               │
│  - Property Manager API (PAPI)                                  │
│  - Fast Purge API (CCU)                                         │
│  - EdgeWorkers API                                              │
│  - Edge DNS API                                                 │
│  - Identity Management API                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. MCP Protocol Layer (`src/index.ts`)

**Responsibility**: Handle MCP protocol messages and route requests to appropriate handlers.

**Key Classes**:
- `AkamaiMcpServer`: Main server class that initializes and manages the MCP server

**Functions**:
- `setupHandlers()`: Register protocol handlers for ListTools and CallTool
- `start()`: Initialize server and connect to stdio transport

**Design Patterns**:
- **Singleton**: EdgeGrid client instance
- **Strategy**: Different tool handlers for different API categories
- **Command**: Tool handlers encapsulate operations

### 2. Authentication Layer (`src/auth/`)

#### EdgeGrid Client (`edgegrid-client.ts`)

**Responsibility**: Manage authentication and HTTP communication with Akamai APIs.

**Key Features**:
- EdgeGrid HMAC-SHA256 signature generation
- Request lifecycle management
- Automatic retry with exponential backoff
- Rate limiting using token bucket algorithm
- Request/response logging

**Methods**:
```typescript
class EdgeGridClient {
  async get<T>(path: string, params?: Record<string, string>): Promise<T>
  async post<T>(path: string, body?: unknown, params?: Record<string, string>): Promise<T>
  async put<T>(path: string, body?: unknown, params?: Record<string, string>): Promise<T>
  async delete<T>(path: string, params?: Record<string, string>): Promise<T>
  async healthCheck(): Promise<{ status: string; message: string }>
}
```

**Error Handling**:
- Network errors (ECONNRESET, ETIMEDOUT)
- HTTP 4xx/5xx responses
- Timeout errors
- JSON parsing errors

### 3. Tool Handlers (`src/tools/`)

Each tool category has its own module with:
- Tool definitions (name, description, schema)
- Handler functions (async operations)
- Input validation
- Response formatting

#### Tool Module Structure

```typescript
// Tool handler type
type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
}>;

// Tool definition
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Example handler
export const listPropertiesHandler: ToolHandler = async (args) => {
  const client = getEdgeGridClient();
  const response = await client.get('/papi/v1/properties', args);
  return formatSuccess(response);
};
```

#### Tool Categories

1. **Property Manager** (`property-manager.ts`)
   - List/get properties
   - Get rule trees
   - List hostnames
   - Activate configurations

2. **Fast Purge** (`fast-purge.ts`)
   - Purge by URL
   - Purge by cache tag
   - Purge by CP code
   - Check purge status

3. **EdgeWorkers** (`edgeworkers.ts`)
   - List EdgeWorkers
   - Get EdgeWorker details
   - List versions
   - Activate versions

4. **DNS Management** (`dns.ts`)
   - List/get zones
   - CRUD operations on records
   - Support for all record types

5. **Health Check** (`health.ts`)
   - Verify connectivity
   - Validate credentials

### 4. Utility Layer (`src/utils/`)

#### Configuration (`config.ts`)

**Responsibility**: Load and validate environment configuration.

**Features**:
- Zod schema validation
- Type-safe configuration access
- Singleton pattern for efficiency
- Detailed validation errors

**Configuration Schema**:
```typescript
{
  akamai: {
    host: string;
    clientToken: string;
    clientSecret: string;
    accessToken: string;
    accountKey?: string;
  },
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug';
    file: string;
  },
  retry: {
    maxRetries: number;    // 0-10
    delayMs: number;       // 100-10000
  },
  timeout: number;         // 1000-300000
}
```

#### Logging (`logger.ts`)

**Responsibility**: Structured logging with Winston.

**Features**:
- Console and file transports
- Log rotation (10MB files, keep 5)
- Timestamp formatting
- Stack trace capture
- Colored console output

**Log Levels**:
- `error`: Critical failures
- `warn`: Recoverable issues, retries
- `info`: Normal operations (default)
- `debug`: Detailed debugging info

**Helper Functions**:
```typescript
logRequest(method: string, path: string, params?: unknown): void
logResponse(method: string, path: string, status: number, duration: number): void
logError(error: Error, context?: Record<string, unknown>): void
```

#### Retry Logic (`retry.ts`)

**Responsibility**: Handle transient failures with intelligent retry strategy.

**Features**:
- Exponential backoff with jitter
- Retryable error detection
- Configurable max retries
- Per-operation retry tracking

**Retry Strategy**:
```
Attempt 0: immediate
Attempt 1: baseDelay * 2^0 + jitter = ~1000ms
Attempt 2: baseDelay * 2^1 + jitter = ~2000ms
Attempt 3: baseDelay * 2^2 + jitter = ~4000ms
Max delay: 30000ms
```

**Retryable Errors**:
- HTTP 429 (Too Many Requests)
- HTTP 500-504 (Server Errors)
- Network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND)

**Rate Limiter**:
- Token bucket algorithm
- Default: 20 tokens, refill 2/second
- Prevents client-side rate limit violations
- Automatic waiting for token availability

## Data Flow

### Typical Request Flow

```
1. MCP Client sends CallTool request
   ↓
2. MCP Protocol Layer receives JSON-RPC message
   ↓
3. Parse request: extract tool name and arguments
   ↓
4. Lookup tool handler in registry
   ↓
5. Invoke tool handler with arguments
   ↓
6. Tool handler validates input
   ↓
7. Tool handler calls EdgeGrid client method
   ↓
8. EdgeGrid client acquires rate limit token
   ↓
9. EdgeGrid client builds HTTP request with auth
   ↓
10. EdgeGrid client sends request to Akamai API
    ↓
11. Wait for response (with timeout)
    ↓
12. Parse response (handle errors if needed)
    ↓
13. If error is retryable: wait and retry (up to max)
    ↓
14. Format response as MCP tool result
    ↓
15. Log response details
    ↓
16. Return formatted result to MCP client
```

### Error Flow

```
Error Occurs
   ↓
Is it retryable? (429, 5xx, network)
   ↓ YES                           ↓ NO
Exponential backoff             Log error
Wait + jitter                      ↓
   ↓                          Format error response
Retry attempt                      ↓
   ↓                          Return to client
Max retries?
   ↓ NO          ↓ YES
Retry        Log & fail
   ↓
Return error
```

## Security Architecture

### Authentication

**EdgeGrid HMAC-SHA256 Signing**:
```
Authorization: EG1-HMAC-SHA256
  client_token=<token>;
  access_token=<token>;
  timestamp=<timestamp>;
  nonce=<nonce>;
  signature=<hmac-sha256-signature>
```

**Signature Components**:
1. Request data (method, path, headers, body)
2. Timestamp (prevents replay attacks)
3. Nonce (unique per request)
4. Client secret (never transmitted)

### Credential Management

**Environment Variables**:
- Credentials loaded from `.env` file
- Never hardcoded in source
- Validated on startup

**Best Practices**:
- Use secret management services (AWS Secrets Manager, etc.)
- Rotate credentials regularly
- Limit API client permissions
- Monitor API usage

### Transport Security

- All API communication over HTTPS (TLS 1.2+)
- No sensitive data in URLs (query params)
- Credentials not logged (redacted in logs)

## Error Handling Strategy

### Error Categories

1. **Configuration Errors**
   - Missing required environment variables
   - Invalid configuration values
   - Validation failures
   - **Action**: Fail fast on startup

2. **Authentication Errors**
   - Invalid credentials (401)
   - Insufficient permissions (403)
   - **Action**: Return error immediately, log

3. **Rate Limit Errors**
   - Too many requests (429)
   - **Action**: Retry with exponential backoff

4. **Server Errors**
   - Internal server errors (500)
   - Service unavailable (503)
   - Gateway timeout (504)
   - **Action**: Retry up to max attempts

5. **Network Errors**
   - Connection timeout
   - DNS resolution failure
   - Connection reset
   - **Action**: Retry up to max attempts

6. **Validation Errors**
   - Invalid tool arguments
   - Schema validation failure
   - **Action**: Return error immediately

### Error Response Format

```typescript
{
  error: true,
  message: "Human-readable error message",
  details?: {
    // Additional context
  }
}
```

## Performance Considerations

### Optimization Strategies

1. **Connection Reuse**
   - Singleton EdgeGrid client
   - HTTP connection pooling (via underlying library)

2. **Rate Limiting**
   - Client-side rate limiting prevents 429 errors
   - Token bucket algorithm allows bursts
   - Configurable limits

3. **Caching**
   - Configuration cached on first load
   - Logger instance cached
   - EdgeGrid client instance cached

4. **Efficient Logging**
   - Asynchronous file writes
   - Log rotation to prevent disk fill
   - Structured logging (JSON-compatible)

5. **Request Optimization**
   - Only required parameters sent
   - Minimal response parsing
   - Streaming for large responses (future enhancement)

### Performance Metrics

- **Typical Request Latency**: 200-500ms (depends on Akamai API)
- **Rate Limit**: 20 requests/sec (default, configurable)
- **Memory Usage**: ~50-100MB (steady state)
- **Max Concurrent Requests**: Limited by rate limiter

## Design Decisions

### Why TypeScript?

- **Type Safety**: Catch errors at compile time
- **Better IDE Support**: Autocomplete, refactoring
- **MCP SDK**: Official SDK is TypeScript
- **Maintainability**: Easier to understand and modify

### Why stdio Transport?

- **Simplicity**: No network configuration needed
- **Security**: No exposed ports or network access
- **MCP Standard**: Recommended for local servers
- **Process Isolation**: Clean lifecycle management

### Why Singleton Pattern?

- **Efficiency**: Avoid repeated initialization
- **Resource Management**: Single HTTP client, single logger
- **Configuration**: Load and validate once
- **State Management**: Centralized rate limiter

### Why Modular Tool Structure?

- **Separation of Concerns**: Each API has its own module
- **Maintainability**: Easy to add/modify tools
- **Testing**: Can test modules independently
- **Code Organization**: Clear file structure

### Why Winston for Logging?

- **Mature**: Well-tested, widely used
- **Flexible**: Multiple transports (file, console)
- **Structured**: JSON-compatible logging
- **Features**: Log rotation, levels, formatting

### Why Exponential Backoff?

- **Best Practice**: Industry standard for retries
- **Prevents Thundering Herd**: Jitter reduces concurrent retries
- **Adapts to Load**: Longer waits as retries increase
- **Configurable**: Can adjust for different environments

### Why Token Bucket Rate Limiting?

- **Allows Bursts**: Can handle occasional spikes
- **Smooth Operation**: Gradual token refill
- **Predictable**: Clear limit on requests/second
- **Prevents 429s**: Catches rate limits client-side

## Future Enhancements

### Potential Improvements

1. **Caching Layer**
   - Cache frequently accessed resources
   - TTL-based invalidation
   - Reduce API calls

2. **Metrics & Monitoring**
   - Prometheus metrics export
   - Request duration histograms
   - Error rate tracking

3. **GraphQL Support**
   - Alternative API interface
   - More flexible queries
   - Reduced over-fetching

4. **Batch Operations**
   - Bulk property updates
   - Batch purge operations
   - Parallel request handling

5. **WebSocket Support**
   - Real-time notifications
   - Activation status updates
   - DNS propagation monitoring

6. **Additional APIs**
   - Application Security
   - Image & Video Manager
   - Global Traffic Management
   - Bot Manager

7. **Testing**
   - Unit tests for all modules
   - Integration tests
   - Mock API server
   - Performance benchmarks

## Conclusion

The Akamai MCP Server is designed with production reliability, security, and maintainability in mind. The modular architecture allows for easy extension and modification, while the robust error handling and retry logic ensure resilient operation in real-world conditions.

The use of modern TypeScript patterns, comprehensive logging, and industry-standard practices make this server suitable for both development and production deployments.
