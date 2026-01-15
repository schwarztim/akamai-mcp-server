# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Akamai MCP Server is an enterprise-grade Model Context Protocol server providing complete coverage of Akamai's APIs through **dynamic tool generation from OpenAPI specifications**. Rather than hand-coding individual tools, the system parses 59 Akamai OpenAPI specs at startup and automatically generates 1,444+ MCP tools.

**Key Architecture**: OpenAPI specs → Operation Registry → Universal Executor → EdgeGrid Client → Akamai APIs

## Essential Commands

### Build and Development
```bash
npm run build              # Compile TypeScript (runs sync:specs first)
npm run dev               # Build and run in development mode
npm run watch             # Watch mode for development
npm start                 # Run production build
```

### Testing and Validation
```bash
npm test                  # Run unit tests with Vitest
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Generate coverage report
npm run e2e               # End-to-end validation (recommended after setup)
npm run health            # Health check for system status
npm run cli               # Interactive CLI for testing operations
npm run cli:mock          # CLI with mock mode (no real API calls)
```

### Specification Management
```bash
npm run sync:specs        # Sync OpenAPI specs from github.com/akamai/akamai-apis
npm run validate          # Validate registry loads correctly and show coverage
```

### Code Quality
```bash
npm run lint              # TypeScript check + ESLint
npm run lint:fix          # Auto-fix linting issues
npm run format            # Format code with Prettier
npm run format:check      # Check code formatting
```

## Claude Code Integration

This MCP server is designed for **iterative improvement with Claude Code CLI**, providing a powerful workflow for development and testing.

### Setup with Claude Code

Configure this MCP server in your Claude Code settings (`~/.claude/mcp.json` on macOS/Linux):

**Option 1: Using ~/.edgerc (Recommended)**

If you have a standard Akamai `.edgerc` file in your home directory, you only need:

```json
{
  "mcpServers": {
    "akamai": {
      "command": "node",
      "args": ["/absolute/path/to/akamai-mcp-server/dist/index.js"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

The server will automatically read credentials from `~/.edgerc` (the `[default]` section).

**Option 2: Using Environment Variables**

For explicit credential configuration:

```json
{
  "mcpServers": {
    "akamai": {
      "command": "node",
      "args": ["/absolute/path/to/akamai-mcp-server/dist/index.js"],
      "env": {
        "AKAMAI_HOST": "your-host.luna.akamaiapis.net",
        "AKAMAI_CLIENT_TOKEN": "akab-your-client-token",
        "AKAMAI_CLIENT_SECRET": "your-client-secret",
        "AKAMAI_ACCESS_TOKEN": "akab-your-access-token",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Additional .edgerc Options**:
- `AKAMAI_EDGERC`: Custom path to .edgerc file (default: `~/.edgerc`)
- `AKAMAI_EDGERC_SECTION`: Section to use (default: `default`)

**Important**:
- Use absolute paths in the config. Relative paths may not resolve correctly.
- If you have other MCP servers configured, add the "akamai" entry alongside them in the same file.
- Environment variables take precedence over .edgerc file settings.

### Iterative Development Workflow

The power of Claude Code + MCP for iterative improvement:

#### 1. Make Changes to the Codebase
```bash
# Example: Modify the universal executor
vim src/executor/universal-executor.ts
```

#### 2. Rebuild and Test Locally
```bash
npm run build           # Rebuild TypeScript
npm run test           # Run unit tests
npm run validate       # Verify registry loads
npm run cli:mock       # Test interactively with mocks
```

#### 3. Restart Claude Code Session
Claude Code automatically reconnects to MCP servers when you start a new session. No manual restart needed.

#### 4. Test with Real API Calls
Use the MCP tools directly from Claude Code:
```
You: Use akamai_list_operations to find all PAPI operations
Claude: [Calls akamai_list_operations with product: "papi"]

You: Now test akamai_raw_request with akamai_papi_listProperties
Claude: [Calls akamai_raw_request with appropriate parameters]
```

#### 5. Iterate Based on Results
```
You: The pagination isn't working correctly for large result sets. Let's fix the executeWithPagination method.
Claude: [Reads universal-executor.ts, identifies issue, proposes fix]

You: Apply that fix and add a test case
Claude: [Modifies code, adds test, rebuilds]
```

### Testing Changes with Claude Code

**Local testing loop**:
```bash
# Terminal 1: Watch mode for auto-rebuild
npm run watch

# Terminal 2: Run tests on changes
npm run test:watch

# Terminal 3: Interactive CLI for manual testing
npm run cli
```

**With Claude Code**:
- Use `npm run e2e` to validate the full stack before testing with Claude Code
- Enable debug logging (`LOG_LEVEL=debug`) to see detailed request/response info
- Check logs at `logs/akamai-mcp.log` for troubleshooting

### Debugging MCP Integration

**Server not starting?**
```bash
# Check logs
tail -f logs/akamai-mcp.log

# Verify configuration
npm run health

# Test registry loads
npm run validate
```

**Tools not appearing in Claude Code?**
1. Verify config path is absolute: `/full/path/to/dist/index.js`
2. Check build is up to date: `npm run build`
3. Restart Claude Code session
4. Check stderr output: `npm start 2>&1 | tee debug.log`

**API calls failing?**
1. Test credentials: `npm run health`
2. Check EdgeGrid auth: `LOG_LEVEL=debug npm start`
3. Verify network access to `*.akamaiapis.net`
4. Use mock mode to isolate: `npm run cli:mock`

### Development Best Practices with Claude Code

**For adding new features**:
1. **Plan first**: Use Claude Code to discuss the approach before coding
2. **Write tests**: Add test cases before implementing
3. **Iterate locally**: Use `npm run cli:mock` for rapid iteration
4. **Validate integration**: Test with real MCP calls from Claude Code

**For debugging issues**:
1. **Enable debug logging**: `LOG_LEVEL=debug` in config
2. **Use CLI for isolation**: `npm run cli` tests without MCP overhead
3. **Check logs**: Tail `logs/akamai-mcp.log` for detailed traces
4. **Reproduce with mocks**: `npm run cli:mock` eliminates API variables

**For performance optimization**:
1. **Profile with metrics**: Use `src/metrics/` instrumentation
2. **Test pagination**: Use `akamai_list_operations` with `paginatable: true`
3. **Monitor rate limits**: Watch for 429 errors in logs
4. **Benchmark**: Compare before/after with `npm run e2e`

## Architecture Deep Dive

### Dynamic Tool Generation Flow

The core innovation is **complete API coverage without manual coding**:

1. **Build Time** (`npm run sync:specs`):
   - Clones github.com/akamai/akamai-apis
   - Copies 59 OpenAPI specs to `specs/` directory
   - Specs are versioned locally (no network dependency at runtime)

2. **Server Startup** (~1 second):
   - `OperationRegistry` loads all specs from `specs/`
   - `$RefParser` dereferences complex `$ref` chains
   - Parses 1,444 operations with metadata (pagination, body params, etc.)
   - Builds indexes: by product, by method, by tool name
   - Registers 3 utility tools: `akamai_raw_request`, `akamai_list_operations`, `akamai_registry_stats`

3. **Runtime Execution**:
   - MCP client calls a utility tool (e.g., `akamai_raw_request`)
   - Tool handler invokes `UniversalExecutor.execute()`
   - Executor validates parameters, builds request, handles pagination
   - `EdgeGridClient` adds HMAC-SHA256 authentication
   - Response returned to client

### Key Components

#### `src/registry/operation-registry.ts`
The brain of dynamic generation. Parses OpenAPI specs and builds a searchable index.

**Critical capabilities**:
- `$ref` dereferencing (handles nested schemas)
- Pagination detection (finds `limit`, `offset`, `page`, `cursor` params)
- Multi-index search (by product, method, text query)
- Fast O(1) tool name lookups

**Search API**:
```typescript
registry.search({ product: 'papi', method: 'GET', paginatable: true, query: 'property' })
```

#### `src/executor/universal-executor.ts`
Single execution path for ALL API requests. Centralizes:
- Parameter validation (path, query, header, body)
- Path template substitution (`/properties/{propertyId}`)
- Header allowlist security (only safe headers forwarded)
- Automatic pagination (detects pageable operations, combines results)
- Error normalization

**Pagination strategy**:
1. Detect pagination param in operation definition
2. Make first request
3. Extract items from response (keys: `items`, `results`, `data`)
4. Check pagination metadata (`hasMore`, `nextPage`, etc.)
5. Loop until no more pages (max 100 pages safety cap)
6. Combine all results with metadata

#### `src/auth/edgegrid-client.ts`
EdgeGrid HMAC-SHA256 authentication with retry and rate limiting.

**Built-in resilience**:
- Token bucket rate limiter (20 req/s default, configurable)
- Exponential backoff retry (429, 5xx, network errors)
- Connection pooling (43% faster via HTTP keep-alive)
- Circuit breaker pattern (v3.0 - prevents cascade failures)

**Security features**:
- Credentials never in responses
- Request signing per EdgeGrid spec
- No secret leakage in logs

#### `src/generator/raw-request-tool.ts`
Generates the 3 utility tools:

1. **`akamai_raw_request`**: Execute any operation by tool name
   - Full control over all parameters
   - Supports pagination, custom headers
   - Primary interface for API access

2. **`akamai_list_operations`**: Discover available operations
   - Filter by product, method, paginatable, text query
   - Returns operation metadata (path, method, summary)
   - Essential for exploration

3. **`akamai_registry_stats`**: Coverage statistics
   - Total operations count
   - Breakdown by product and method
   - Pagination support metrics

### Tool Naming Convention

```
Format: akamai_{product}_{operationId}

Examples:
  akamai_papi_listProperties
  akamai_ccu_purgeByUrl
  akamai_edgeworkers_listEdgeWorkers
  akamai_config_dns_listZones

Properties:
  - Deterministic (same every time)
  - Collision-free (unique per operation)
  - Descriptive (clear purpose)
```

## Configuration

Environment variables loaded from `.env` (copy from `.env.example`):

```env
# Akamai EdgeGrid Credentials (required)
AKAMAI_HOST=your-host.luna.akamaiapis.net
AKAMAI_CLIENT_TOKEN=akab-your-client-token
AKAMAI_CLIENT_SECRET=your-client-secret
AKAMAI_ACCESS_TOKEN=akab-your-access-token
AKAMAI_ACCOUNT_KEY=optional-account-switch-key

# Logging
LOG_LEVEL=info          # error | warn | info | debug
LOG_FILE=logs/akamai-mcp.log

# Retry
MAX_RETRIES=3           # 0-10
RETRY_DELAY_MS=1000     # 100-10000

# Timeout
REQUEST_TIMEOUT=30000   # 1000-300000 (ms)
```

**Configuration validation**: Zod schemas in `src/utils/config.ts` validate all env vars on startup. Fail fast if invalid.

## Error Handling Strategy

### Error Categories and Actions

| Category | HTTP Codes | Action | Reason |
|----------|-----------|--------|--------|
| **Authentication** | 401, 403 | Fail immediately | Invalid credentials or permissions |
| **Rate Limit** | 429 | Retry with backoff | Temporary capacity issue |
| **Server Error** | 500-504 | Retry with backoff | Transient server issue |
| **Network Error** | ETIMEDOUT, ECONNRESET | Retry with backoff | Transient network issue |
| **Validation** | 400 | Fail immediately | Invalid request parameters |

### Retry Strategy

```
Attempt 1: immediate
Attempt 2: 1s + jitter (random 0-200ms)
Attempt 3: 2s + jitter
Attempt 4: 4s + jitter
Max delay: 30s
Max attempts: 3 (configurable via MAX_RETRIES)
```

**Jitter prevents thundering herd**: Multiple failing clients don't retry synchronously.

### Error Response Format

All errors returned in consistent format:
```json
{
  "error": true,
  "message": "HTTP 404: Property not found",
  "status": 404,
  "requestId": "a1b2c3d4",
  "body": { /* original error from Akamai */ }
}
```

## Security Architecture

### Header Allowlist

**Critical security control**: Only these headers forwarded to prevent injection:
```typescript
['accept', 'content-type', 'if-match', 'if-none-match', 'prefer', 'x-request-id']
```

Rejected headers logged as warnings. Never allow arbitrary headers from user input.

### Other Security Features

- **No Secret Leakage**: EdgeGrid credentials never in responses, redacted in logs
- **No Arbitrary Hosts**: All requests through configured EdgeGrid client
- **Path Parameter Encoding**: All path params URL-encoded (prevents path traversal)
- **Request Validation**: Parameters validated against OpenAPI schemas

## Testing Strategy

### Unit Tests (`tests/*.test.ts`)

Run with Vitest:
```bash
npm test                # Run once
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

**Mock strategy**: Use `nock` to mock Akamai API responses. Never hit real APIs in unit tests.

### Integration Testing

```bash
npm run e2e             # Validates full setup without real API calls
npm run cli:mock        # Interactive testing with mocks
```

### Manual Testing

```bash
npm run cli             # Interactive CLI with real API calls
```

**CLI features**:
- Test any operation by name
- Pagination support
- Mock mode for safe testing
- JSON response formatting

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| **Startup time** | ~1 second | Includes registry loading |
| **Registry loading** | ~900ms | Parses 59 specs, 1,444 operations |
| **Tool generation** | 6ms | All 1,444 tools (v2.0 generated, v3.0 uses raw_request) |
| **Request overhead** | <10ms | Auth + validation per request |
| **Memory usage** | ~50MB | Loaded registry + caches |
| **Rate limit** | 20 req/s | Configurable, token bucket algorithm |
| **Connection pooling** | 43% faster | HTTP keep-alive (v3.0) |
| **Cache hit speedup** | 99.8% faster | Response cache for repeated requests (v3.0) |

## Reliability Patterns (v3.0)

### Circuit Breaker

**Purpose**: Prevent cascade failures when Akamai APIs are degraded.

**States**:
- `CLOSED`: Normal operation
- `OPEN`: Failing fast (errors >= threshold)
- `HALF_OPEN`: Testing recovery

**Configuration** (in `src/reliability/circuit-breaker.ts`):
- Failure threshold: 5 errors
- Timeout: 60 seconds
- Half-open test requests: 3

### Connection Pooling

**Purpose**: Reuse HTTP connections for 43% faster requests.

**Implementation**: `src/reliability/connection-pool.ts`
- HTTP keep-alive enabled
- Automatic connection reuse
- Graceful connection lifecycle

### Response Caching

**Purpose**: Avoid redundant API calls, 99.8% faster for repeated requests.

**Implementation**: `src/cache/response-cache.ts`
- LRU cache (max 1000 entries)
- TTL-based expiration
- Only caches GET requests with 2xx responses

### Graceful Shutdown

**Purpose**: Zero data loss during deployments.

**Implementation**: `src/reliability/shutdown-coordinator.ts`
- Drains in-flight requests (timeout: 30s)
- Closes connections cleanly
- Handles SIGTERM/SIGINT

## Common Development Tasks

### Adding Support for a New API

The beauty of dynamic generation: **no code changes needed!**

1. Add spec to github.com/akamai/akamai-apis
2. Run `npm run sync:specs` to pull latest specs
3. Run `npm run build` to regenerate tools
4. Run `npm run validate` to verify coverage

New operations automatically available via `akamai_raw_request`.

### Debugging API Calls

Enable debug logging to see full request/response details:
```bash
LOG_LEVEL=debug npm start
```

Logs show:
- Request method, path, params
- EdgeGrid signature generation
- Response status, duration
- Retry attempts
- Rate limiting

### Modifying Universal Executor Behavior

All API requests flow through `src/executor/universal-executor.ts`. To add features:

1. **Request transformation**: Modify `buildRequest()` method
2. **Response caching**: Extend `ResponseCache` in `src/cache/response-cache.ts`
3. **Custom retry logic**: Modify `shouldRetry()` in `src/utils/retry.ts`
4. **Metrics collection**: Add instrumentation in `src/metrics/`

### Testing a Specific Operation

```bash
npm run cli
# Then interactively:
# - Enter operation name (e.g., akamai_papi_listProperties)
# - Enter parameters as JSON
# - View formatted response
```

## Troubleshooting

### Registry Loading Fails

**Symptoms**: "Specs directory not found" error on startup

**Fix**:
```bash
npm run sync:specs  # Download specs from GitHub
npm run validate    # Verify they loaded correctly
```

### Authentication Errors (401/403)

**Symptoms**: "Unauthorized" or "Forbidden" in API responses

**Checklist**:
1. Verify `.env` credentials are correct
2. Check API client has required permissions in Akamai Control Center
3. Ensure `AKAMAI_HOST` doesn't include `https://` prefix
4. Confirm API client is active (not revoked)

### Rate Limiting (429)

**Symptoms**: "Too Many Requests" errors

**Solutions**:
1. Built-in rate limiter should prevent this (20 req/s default)
2. Increase retry delay: `RETRY_DELAY_MS=2000`
3. Check Akamai API quotas in Control Center
4. Consider implementing request batching

### Operation Not Found

**Symptoms**: "Unknown operation" error from `akamai_raw_request`

**Debug**:
1. Use `akamai_list_operations` to search for the operation
2. Verify tool name matches exactly (case-sensitive)
3. Check operation exists in registry: `npm run validate`
4. Confirm specs synced: `npm run sync:specs`

### Pagination Not Working

**Symptoms**: Only first page of results returned

**Debug**:
1. Confirm operation supports pagination: `akamai_list_operations` with `paginatable: true`
2. Check pagination parameters in operation definition
3. Enable debug logging to see pagination logic: `LOG_LEVEL=debug`
4. Verify `paginate: true` in request args

## Code Style and Conventions

### TypeScript

- **Strict mode enabled**: All type checks enforced
- **No `any` types**: Use proper types or `unknown`
- **Async/await**: Never use raw Promises or callbacks
- **Named exports**: Avoid default exports

### Error Handling

- **Never swallow errors**: Always log or rethrow
- **Include context**: Use structured logging with error context
- **User-friendly messages**: Error messages should be actionable

### Logging

- **Structured logging**: Use key-value pairs, not string concatenation
- **Appropriate levels**: error (critical), warn (recoverable), info (normal), debug (detailed)
- **Sensitive data**: Never log credentials or secrets

### Testing

- **Arrange-Act-Assert**: Clear test structure
- **Mock external dependencies**: Use `nock` for HTTP mocks
- **Descriptive test names**: Test name should describe behavior
- **Test error paths**: Don't just test happy paths

## Quick Reference: Common Claude Code Workflows

**Key Principle:** Use natural language. Claude Code will discover and execute the right operations automatically.

### Exploring Your Akamai Setup

```
You: What Akamai APIs are available to me?
Claude: [Calls akamai_registry_stats automatically]

You: List all my CDN properties
Claude: [Searches for property operations, executes with pagination]

You: Show me DNS zones in my account
Claude: [Finds and calls DNS zone listing operation]

You: What EdgeWorkers do I have deployed?
Claude: [Discovers EdgeWorker operations, lists them]
```

### Getting Account Information

```
You: Show me my Akamai profile
Claude: [Searches for profile operations, retrieves your data]

You: Who are the users in my account?
Claude: [Finds user listing operation, executes it]

You: What's my last login date?
Claude: [Gets profile, extracts login info]
```

### Managing Resources

```
You: Purge these URLs from cache: https://example.com/page1, https://example.com/page2
Claude: [Finds purge operation, executes with URLs]

You: What's the rule tree for property XYZ?
Claude: [Searches for rule tree operation, gets configuration]

You: Check the status of purge request ABC123
Claude: [Finds status check operation, queries it]
```

### Iterating on Features

```
You: The pagination is only returning 10 items but there are 100+ total.
     Let's investigate the executeWithPagination method.
Claude: [Reads universal-executor.ts, analyzes pagination logic]

You: I think the issue is we're not detecting the "hasMore" field correctly.
     Can you check how we parse pagination metadata?
Claude: [Shows relevant code, identifies the issue]

You: Fix that and add a test case for hasMore:true pagination
Claude: [Modifies code, adds test, runs npm run build && npm test]

You: Now test it with a real API call
Claude: [Calls akamai_raw_request with paginate: true, verifies fix]
```

### Debugging Issues

```
You: I'm getting a 401 error when calling the DNS API
Claude: [Calls akamai_raw_request to reproduce, analyzes error response]

You: Check the EdgeGrid authentication in edgegrid-client.ts
Claude: [Reads file, explains HMAC signing process]

You: Run the health check to verify credentials
Claude: [Runs: npm run health, interprets results]
```

### Performance Optimization

```
You: The listProperties call is slow with 500+ properties.
     Can we add caching?
Claude: [Reads response-cache.ts, proposes caching strategy]

You: Implement that with a 5-minute TTL
Claude: [Modifies cache config, adds caching to GET operations]

You: Benchmark before and after
Claude: [Runs tests, compares response times, shows improvement]
```

### Adding New Features

```
You: I want to add support for batch purge operations.
     Let's design the approach first.
Claude: [Analyzes existing purge tools, proposes batch design]

You: Implement that in a new method in universal-executor.ts
Claude: [Creates method, adds validation, writes tests]

You: Now expose it via a new utility tool
Claude: [Creates tool definition in raw-request-tool.ts, registers it]

You: Test it end-to-end
Claude: [Rebuilds, validates registry, tests with mock and real calls]
```

## Version History

- **v1.0**: Hand-coded 22 tools (2% API coverage)
- **v2.0**: Dynamic generation, 1,444 tools (100% API coverage)
- **v3.0**: Enterprise reliability patterns (circuit breaker, connection pooling, caching, graceful shutdown) + developer experience tools (CLI, health checks, mock mode)

## Additional Resources

- `ARCHITECTURE.md`: Original v1 architecture details
- `ARCHITECTURE_V2.md`: Dynamic generation design (v2)
- `V3_ENTERPRISE_UPGRADE.md`: Enterprise reliability patterns (v3)
- `V4_SENIOR_STAFF_UPGRADE.md`: Advanced architecture patterns
- `docs/API_REFERENCE.md`: Detailed API documentation
- `docs/SECURITY_ARCHITECTURE.md`: Security deep dive
