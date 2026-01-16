# Architecture Decision Records

## Akamai MCP Server - Key Architecture Decisions

**Document Version**: 1.0
**Last Updated**: 2026-01-15

---

## Decision Log

| ID | Decision | Status | Date |
|----|----------|--------|------|
| ADR-001 | Dynamic tool generation from OpenAPI | Accepted | 2025-Q4 |
| ADR-002 | Single execution path (UniversalExecutor) | Accepted | 2025-Q4 |
| ADR-003 | Three utility tools vs. 1,444 individual tools | Accepted | 2025-Q4 |
| ADR-004 | Header allowlist for security | Accepted | 2025-Q4 |
| ADR-005 | Circuit breaker pattern | Accepted | 2026-Q1 |
| ADR-006 | LRU response caching | Accepted | 2026-Q1 |
| ADR-007 | Singleton pattern for core services | Accepted | 2025-Q4 |
| ADR-008 | Winston for structured logging | Accepted | 2025-Q4 |

---

## ADR-001: Dynamic Tool Generation from OpenAPI

### Status
Accepted

### Context
Akamai provides 59 OpenAPI specifications covering 1,444 API operations. The initial v1.0 implementation hand-coded 22 tools (2% coverage), requiring significant maintenance effort.

### Decision
Generate MCP tools dynamically from OpenAPI specifications at startup, parsing all 59 specs to create an indexed registry of 1,444 operations.

### Consequences

**Positive**:
- 100% API coverage without manual tool coding
- Automatic support for new Akamai APIs (sync specs)
- Consistent parameter handling across all operations
- Reduced maintenance burden

**Negative**:
- Startup time increased (~1 second for spec parsing)
- Memory usage increased (~20MB for registry)
- Requires OpenAPI specs to be available at build time

**Trade-offs**:
- Startup latency vs. complete coverage
- Memory usage vs. manual maintenance cost

### Alternatives Considered
1. **Hand-code all tools**: Rejected due to maintenance burden (1,444 tools)
2. **On-demand spec parsing**: Rejected due to runtime latency
3. **Code generation at build time**: Rejected due to MCP context size limits

---

## ADR-002: Single Execution Path (UniversalExecutor)

### Status
Accepted

### Context
With 1,444 operations, implementing individual handlers for each would create massive code duplication and inconsistent error handling.

### Decision
Implement a single `UniversalExecutor` class that handles all API operations through one execution path, with shared validation, path building, header handling, and pagination logic.

### Consequences

**Positive**:
- Consistent error handling across all operations
- Single place for security controls (header allowlist)
- Easier testing and debugging
- Centralized pagination handling

**Negative**:
- Less flexibility for operation-specific customization
- Complex operations may need special handling

**Trade-offs**:
- Consistency vs. flexibility
- Simplicity vs. operation-specific optimizations

### Implementation
```typescript
// src/executor/universal-executor.ts
class UniversalExecutor {
  async execute(operation: OperationDefinition, options: ExecutionOptions) {
    const headers = this.buildHeaders(operation, options.headers);
    this.validateParameters(operation, { ...options, headers });
    const path = this.buildPath(operation, options.pathParams);
    // ... single path for all operations
  }
}
```

---

## ADR-003: Three Utility Tools vs. 1,444 Individual Tools

### Status
Accepted

### Context
MCP context windows have limited size. Exposing 1,444 individual tool definitions would consume significant context, reducing the LLM's ability to reason about other aspects of the conversation.

### Decision
Expose three utility tools that provide access to all 1,444 operations:
1. `akamai_raw_request` - Execute any operation by tool name
2. `akamai_list_operations` - Search and discover operations
3. `akamai_registry_stats` - Coverage statistics

### Consequences

**Positive**:
- Minimal MCP context consumption (~500 tokens vs. ~50,000)
- Discovery-based workflow (search, then execute)
- Consistent interface for all operations

**Negative**:
- Two-step process (discover, then call)
- Less discoverability for specific tools
- AI must know to search before executing

**Trade-offs**:
- Context efficiency vs. immediate discoverability
- Consistency vs. tool-specific optimization

### Mitigation
Added high-level tools (~50 total) for common workflows:
- `akamai_list_all_properties`
- `akamai_purge_urls`
- `akamai_activate_property`
- etc.

---

## ADR-004: Header Allowlist for Security

### Status
Accepted

### Context
User-provided headers could be used to inject dangerous headers like `Authorization`, `Host`, or `X-Forwarded-For`, potentially bypassing security controls.

### Decision
Implement a strict header allowlist. Only explicitly allowed headers are forwarded to Akamai APIs:

```typescript
const allowedHeaders = [
  'accept', 'content-type', 'if-match', 'if-none-match',
  'prefer', 'x-request-id', 'papi-use-prefixes',
  'x-akamai-contract', 'x-akamai-group', 'x-akamai-purge',
  'akamai-signature-algorithm'
];
```

### Consequences

**Positive**:
- Prevents header injection attacks
- Clear security boundary
- Auditable (rejected headers logged)

**Negative**:
- May need updates for new Akamai headers
- Some advanced use cases blocked

**Trade-offs**:
- Security vs. flexibility
- Safety vs. completeness

---

## ADR-005: Circuit Breaker Pattern

### Status
Accepted

### Context
When Akamai APIs are degraded, continued requests can cause cascade failures, resource exhaustion, and poor user experience.

### Decision
Implement the circuit breaker pattern with three states:
- **CLOSED**: Normal operation
- **OPEN**: Fail fast (5+ failures in 10s window)
- **HALF_OPEN**: Test recovery (after 60s timeout)

### Consequences

**Positive**:
- Prevents cascade failures
- Gives upstream systems time to recover
- Provides clear failure signals
- Improves overall system stability

**Negative**:
- Additional complexity
- Potential false positives during transient errors
- Requires tuning for optimal thresholds

**Configuration**:
```typescript
{
  failureThreshold: 5,     // Failures to open
  successThreshold: 2,     // Successes to close
  timeout: 60000,          // Recovery timeout (ms)
  windowSize: 10000        // Failure window (ms)
}
```

---

## ADR-006: LRU Response Caching

### Status
Accepted

### Context
Many operations are read-heavy (listing properties, getting rules). Caching responses reduces API calls, improves latency, and reduces risk of rate limiting.

### Decision
Implement an LRU cache with TTL for GET request responses:
- Max 1,000 entries
- 1-minute default TTL
- Only cache 2xx responses

### Consequences

**Positive**:
- 99.8% faster for repeated requests
- Reduces API rate limit consumption
- Improves user experience

**Negative**:
- Stale data possible within TTL
- Memory usage increases
- Cache invalidation complexity

**Trade-offs**:
- Freshness vs. performance
- Memory vs. latency

**Cache Policy**:
```typescript
// Only cache:
// - GET requests
// - 2xx responses
// - Within size limits

ResponseCache.shouldCache(method, statusCode) {
  return method === 'GET' && statusCode >= 200 && statusCode < 300;
}
```

---

## ADR-007: Singleton Pattern for Core Services

### Status
Accepted

### Context
Core services (registry, executor, client, cache) need consistent state across the application. Multiple instances would waste memory and create inconsistencies.

### Decision
Use singleton pattern for core services:
- `OperationRegistry` - Single registry instance
- `UniversalExecutor` - Single executor
- `EdgeGridClient` - Single authenticated client
- `ResponseCache` - Single cache instance
- `ConfigLoader` - Single configuration

### Consequences

**Positive**:
- Memory efficiency
- Consistent state
- Simple access pattern
- Easy initialization

**Negative**:
- Harder to test (global state)
- Tight coupling
- No dependency injection

**Mitigation**:
```typescript
// Reset functions for testing
export function resetRegistry(): void {
  registryInstance = null;
}

export function resetExecutor(): void {
  executorInstance = null;
}
```

---

## ADR-008: Winston for Structured Logging

### Status
Accepted

### Context
Need comprehensive logging for debugging, auditing, and operations. Logs must be structured (JSON) for log aggregation systems.

### Decision
Use Winston logger with:
- JSON format for file logs
- Colored format for console
- Multiple transports (file + console)
- Log levels (error, warn, info, debug)

### Consequences

**Positive**:
- Structured logs for SIEM integration
- Multiple output targets
- Configurable log levels
- Industry-standard library

**Negative**:
- Additional dependency
- Configuration complexity
- File I/O overhead

**Implementation**:
```typescript
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: config.logging.file }),
    new winston.transports.Console({ format: colorFormat })
  ]
});
```

---

## Architecture Dimensions Analysis

### Modularity and Boundaries

| Current State | Rationale | Trade-offs | Future Improvements |
|--------------|-----------|------------|---------------------|
| Clear layer separation | Maintainability | Complexity vs. clarity | Plugin architecture |
| Singleton services | Simplicity | Testability impact | DI container |
| High-level tool modules | Organization | Coupling to executor | Tool interface abstraction |

### Scalability and Performance

| Current State | Rationale | Trade-offs | Future Improvements |
|--------------|-----------|------------|---------------------|
| Single process | Simplicity | No horizontal scaling | Process pool |
| In-memory cache | Performance | Memory vs. persistence | Redis cache |
| ~1s startup | Acceptable latency | Cold start impact | Lazy loading |

### Reliability and Availability

| Current State | Rationale | Trade-offs | Future Improvements |
|--------------|-----------|------------|---------------------|
| Circuit breaker | Cascade prevention | Complexity | Per-product breakers |
| Retry with backoff | Transient failures | Latency increase | Adaptive retry |
| Rate limiting | API protection | Throughput limit | Dynamic limits |

### Maintainability and Operability

| Current State | Rationale | Trade-offs | Future Improvements |
|--------------|-----------|------------|---------------------|
| TypeScript strict | Type safety | Learning curve | - |
| Comprehensive logging | Debugging | Log volume | Log sampling |
| Health checks | Monitoring | CLI-only | HTTP health endpoint |

### Security and Privacy

| Current State | Rationale | Trade-offs | Future Improvements |
|--------------|-----------|------------|---------------------|
| Header allowlist | Injection prevention | Flexibility | Dynamic allowlist |
| Credential protection | Account security | - | Auto-rotation |
| TLS 1.2+ | Transport security | Compatibility | TLS 1.3 only |

### Cost and Efficiency

| Current State | Rationale | Trade-offs | Future Improvements |
|--------------|-----------|------------|---------------------|
| ~50MB memory | Acceptable | vs. persistence | Lazy registry |
| Single process | Simplicity | CPU utilization | Worker threads |
| Response caching | API efficiency | Memory cost | Cache tuning |

### Observability

| Current State | Rationale | Trade-offs | Future Improvements |
|--------------|-----------|------------|---------------------|
| Structured logs | Analysis | Volume | Metrics export |
| Health checks | Liveness | Limited scope | Readiness probes |
| Error tracking | Debugging | Privacy | Distributed tracing |

### Compliance and Governance

| Current State | Rationale | Trade-offs | Future Improvements |
|--------------|-----------|------------|---------------------|
| Audit logging | Accountability | Storage | Log retention policy |
| NIST CSF mapping | Framework | Documentation | SOC2 mapping |
| No PII handling | Privacy | Functionality | PII detection |

---

## Open Questions and Gaps

1. **Multi-tenancy** - No session isolation for concurrent users
2. **Metrics** - Internal metrics exist but no export mechanism
3. **Hot reload** - Registry requires restart to update
4. **Approval workflows** - No operation approval/review gates

---

*Generated: 2026-01-15*
