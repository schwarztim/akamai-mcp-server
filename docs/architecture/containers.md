# Container Diagram (C4 Level 2)

## Akamai MCP Server - Container Architecture

**Document Version**: 1.0
**Last Updated**: 2026-01-15

---

## Container Diagram

```mermaid
graph TB
    subgraph clients["MCP Clients"]
        Claude["Claude Desktop<br/>[Desktop Application]<br/>AI assistant"]
        CLI["CLI Tools<br/>[Command Line]<br/>Developer tools"]
    end

    subgraph mcp["Akamai MCP Server [Node.js Application]"]
        subgraph protocol["Protocol Layer"]
            Server["MCP Server<br/>[Container: TypeScript]<br/>Handles JSON-RPC protocol<br/>Routes tool calls"]
        end

        subgraph tools["Tool Layer"]
            CoreTools["Core Tools<br/>[Container: TypeScript]<br/>akamai_raw_request<br/>akamai_list_operations<br/>akamai_registry_stats"]

            HighLevel["High-Level Tools<br/>[Container: TypeScript]<br/>Aggregation, Property,<br/>Security, Cache, DNS,<br/>Diagnostic, Workflow tools"]
        end

        subgraph engine["Execution Engine"]
            Registry["Operation Registry<br/>[Container: TypeScript]<br/>Parses 59 OpenAPI specs<br/>Indexes 1,444 operations"]

            Executor["Universal Executor<br/>[Container: TypeScript]<br/>Single execution path<br/>Parameter validation<br/>Pagination handling"]
        end

        subgraph infra["Infrastructure"]
            Auth["EdgeGrid Client<br/>[Container: TypeScript]<br/>HMAC-SHA256 auth<br/>Request signing"]

            Reliability["Reliability Components<br/>[Container: TypeScript]<br/>Circuit breaker<br/>Rate limiter<br/>Retry handler"]

            Cache["Response Cache<br/>[Container: TypeScript]<br/>LRU cache<br/>TTL-based expiry"]

            Config["Configuration<br/>[Container: TypeScript]<br/>Zod validation<br/>.edgerc parsing"]

            Logger["Logger<br/>[Container: Winston]<br/>Structured logging<br/>File + console"]
        end
    end

    subgraph external["External Systems"]
        AkamaiAPI["Akamai EdgeGrid APIs<br/>[External System]<br/>*.luna.akamaiapis.net"]
    end

    subgraph storage["Local Storage"]
        Specs["OpenAPI Specs<br/>[File System]<br/>specs/*.json"]
        Logs["Log Files<br/>[File System]<br/>logs/akamai-mcp.log"]
        EnvConfig[".env / .edgerc<br/>[File System]<br/>Credentials & config"]
    end

    Claude -->|"stdio<br/>JSON-RPC 2.0"| Server
    CLI -->|"stdio<br/>JSON-RPC 2.0"| Server

    Server --> CoreTools
    Server --> HighLevel

    CoreTools --> Registry
    CoreTools --> Executor
    HighLevel --> Executor

    Registry -->|"Load on startup"| Specs
    Executor --> Auth
    Auth --> Reliability
    Reliability --> Cache
    Reliability --> AkamaiAPI

    Config -.->|"Provides config"| Auth
    Config -.->|"Reads"| EnvConfig
    Logger -.->|"Writes"| Logs

    style Server fill:#1168bd,color:#fff
    style Registry fill:#438dd5,color:#fff
    style Executor fill:#438dd5,color:#fff
    style Auth fill:#438dd5,color:#fff
    style AkamaiAPI fill:#999,color:#fff
```

---

## Container Descriptions

### Protocol Layer

#### MCP Server (`src/index.ts`)

**Technology**: TypeScript, @modelcontextprotocol/sdk
**Responsibility**: MCP protocol handling and tool routing
**Interfaces**:
- Inbound: stdio (JSON-RPC 2.0)
- Outbound: Internal function calls

**Key Functions**:
```typescript
- setupHandlers()      // Register MCP request handlers
- loadTools()          // Initialize tool registry
- start()              // Begin server operation
```

**Characteristics**:
- Singleton pattern
- Event-driven (JSON-RPC messages)
- Graceful shutdown handling (SIGINT)

---

### Tool Layer

#### Core Tools (`src/generator/raw-request-tool.ts`)

**Technology**: TypeScript
**Responsibility**: Low-level API access tools
**Tools Provided**:

| Tool Name | Purpose |
|-----------|---------|
| `akamai_raw_request` | Execute any operation by tool name |
| `akamai_list_operations` | Search/discover operations |
| `akamai_registry_stats` | Coverage statistics |

**Design Rationale**: These three tools provide complete API access while keeping MCP context size manageable (vs. 1,444 individual tool definitions).

#### High-Level Tools (`src/tools/*.ts`)

**Technology**: TypeScript
**Responsibility**: Domain-specific aggregated operations
**Tool Categories**:

| Module | Tools | Purpose |
|--------|-------|---------|
| `property-tools.ts` | 8 tools | Property management workflows |
| `security-tools.ts` | 6 tools | WAF and security operations |
| `cache-tools.ts` | 4 tools | Cache purge operations |
| `dns-tools.ts` | 4 tools | DNS management |
| `diagnostic-tools.ts` | 5 tools | Troubleshooting and debugging |
| `workflow-tools.ts` | 5 tools | Multi-step operations |
| `reporting-tools.ts` | 4 tools | Performance and error reports |
| `certificate-tools.ts` | 5 tools | SSL/TLS management |
| `account-tools.ts` | 4 tools | Multi-account operations |
| `dnssec-tools.ts` | 4 tools | DNSSEC management |

---

### Execution Engine

#### Operation Registry (`src/registry/operation-registry.ts`)

**Technology**: TypeScript, @apidevtools/json-schema-ref-parser
**Responsibility**: OpenAPI spec parsing and indexing
**Data Structures**:

```typescript
Map<string, OperationDefinition>  // By tool name
Map<string, string[]>             // By product
Map<string, string[]>             // By HTTP method
```

**Key Functions**:
```typescript
- load()              // Parse all OpenAPI specs
- getOperation()      // O(1) lookup by tool name
- search()            // Filter by product/method/query
- getStats()          // Coverage statistics
```

**Performance**:
- Load time: ~900ms (59 specs, 1,444 operations)
- Lookup time: O(1)
- Memory: ~20MB

#### Universal Executor (`src/executor/universal-executor.ts`)

**Technology**: TypeScript
**Responsibility**: Single execution path for all API calls
**Key Functions**:

```typescript
- execute()                    // Main entry point
- validateParameters()         // Required param checking
- buildPath()                  // Path template substitution
- buildQueryParams()           // Query string construction
- buildHeaders()               // Header allowlist filtering
- executeSingle()              // Single request execution
- executeWithPagination()      // Multi-page fetching
```

**Security Controls**:
- Header allowlist (prevents injection)
- Path parameter encoding
- Required parameter validation

---

### Infrastructure Layer

#### EdgeGrid Client (`src/auth/edgegrid-client.ts`)

**Technology**: TypeScript, akamai-edgegrid npm package
**Responsibility**: HMAC-SHA256 authentication and HTTP requests
**Interface Methods**:

```typescript
- get<T>(path, params?, headers?)
- post<T>(path, body?, params?, headers?)
- put<T>(path, body?, params?, headers?)
- delete<T>(path, params?, headers?)
- healthCheck()
```

**Security Features**:
- HMAC-SHA256 request signing
- Timestamp and nonce generation
- Credential protection (never logged)

#### Reliability Components (`src/reliability/*.ts`)

**Components**:

| Component | File | Purpose |
|-----------|------|---------|
| Circuit Breaker | `circuit-breaker.ts` | Cascade failure prevention |
| Rate Limiter | (in `retry.ts`) | Token bucket algorithm |
| Retry Handler | `retry.ts` | Exponential backoff |
| Connection Pool | `connection-pool.ts` | HTTP keep-alive |
| Shutdown Coordinator | `shutdown-coordinator.ts` | Graceful shutdown |

**Circuit Breaker States**:
```
CLOSED → (failures >= threshold) → OPEN
OPEN → (timeout elapsed) → HALF_OPEN
HALF_OPEN → (successes >= threshold) → CLOSED
HALF_OPEN → (failure) → OPEN
```

**Rate Limiter Algorithm**:
```
Token Bucket:
- Capacity: 20 tokens
- Refill rate: 2 tokens/second
- Wait if no tokens available
```

#### Response Cache (`src/cache/response-cache.ts`)

**Technology**: TypeScript (custom LRU implementation)
**Responsibility**: Cache GET responses to reduce API calls
**Configuration**:

```typescript
{
  defaultTTL: 60000,    // 1 minute
  maxSize: 1000,        // entries
  enabled: true
}
```

**Cache Policy**:
- Only cache GET requests
- Only cache 2xx responses
- LRU eviction when full
- Automatic TTL expiry

#### Configuration (`src/utils/config.ts`)

**Technology**: TypeScript, Zod, dotenv
**Responsibility**: Configuration loading and validation
**Sources** (priority order):
1. Environment variables
2. `.edgerc` file (~/.edgerc or project local)

**Schema**:
```typescript
{
  akamai: {
    host: string,
    clientToken: string,
    clientSecret: string,
    accessToken: string,
    accountKey?: string
  },
  logging: {
    level: 'error' | 'warn' | 'info' | 'debug',
    file: string
  },
  retry: {
    maxRetries: number,
    retryDelayMs: number
  },
  timeout: number
}
```

#### Logger (`src/utils/logger.ts`)

**Technology**: Winston
**Responsibility**: Structured logging
**Outputs**:
- Console (colored, formatted)
- File (JSON, rotatable)

**Log Levels**:
```
error → Critical failures
warn  → Recoverable issues, rate limiting
info  → Normal operations, startup/shutdown
debug → Detailed request/response data
```

---

## Container Interactions

### Startup Sequence

```mermaid
sequenceDiagram
    participant Main as main()
    participant Config as Configuration
    participant Registry as Operation Registry
    participant Server as MCP Server
    participant Logger as Logger

    Main->>Config: getConfig()
    Config->>Config: Load .env / .edgerc
    Config->>Config: Validate with Zod
    Config-->>Main: Config validated

    Main->>Registry: getOperationRegistry()
    Registry->>Registry: Find spec files
    Registry->>Registry: Parse OpenAPI specs
    Registry->>Registry: Build indexes
    Registry-->>Main: Registry loaded (1,444 ops)

    Main->>Server: loadTools()
    Server->>Server: Register core tools
    Server->>Server: Register high-level tools
    Server-->>Main: Tools ready

    Main->>Server: start()
    Server->>Server: Connect stdio transport
    Server-->>Logger: "Server started"
```

### Request Flow

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant Server as MCP Server
    participant Tool as Tool Handler
    participant Executor as Universal Executor
    participant Auth as EdgeGrid Client
    participant API as Akamai API

    Client->>Server: tools/call (JSON-RPC)
    Server->>Server: Parse request
    Server->>Tool: Route to handler

    Tool->>Executor: execute(operation, options)
    Executor->>Executor: Validate parameters
    Executor->>Executor: Build path & headers
    Executor->>Auth: request(method, path, body)

    Auth->>Auth: Sign request (HMAC)
    Auth->>Auth: Apply rate limiting
    Auth->>API: HTTPS request

    API-->>Auth: Response
    Auth-->>Executor: Response data
    Executor-->>Tool: ExecutionResult
    Tool-->>Server: MCP response
    Server-->>Client: JSON-RPC response
```

---

## Container: Resource Requirements

| Container | Memory | CPU | Disk |
|-----------|--------|-----|------|
| MCP Server | ~50MB | Low | Minimal |
| Operation Registry | ~20MB | Spike at startup | N/A |
| Response Cache | ~10-50MB | Minimal | N/A |
| Logger | ~5MB | Minimal | ~100MB/day |

**Total**: ~50-100MB RAM, low CPU, minimal disk

---

## Open Questions and Gaps

1. **Registry refresh** - Currently loads once at startup; no hot-reload when specs change
2. **Cache persistence** - In-memory only; loses cache on restart
3. **Metrics export** - No Prometheus/StatsD integration yet
4. **Health endpoint** - Health checks are CLI-only, not HTTP-exposed

---

*Generated: 2026-01-15*
