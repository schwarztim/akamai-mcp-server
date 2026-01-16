# Changelog

All notable changes to the Akamai MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-01-16

### Added
- **Rate Limit Header Tracking**: Response headers now include Akamai API rate limit information when available
  - New `RateLimitInfo` interface with `limit`, `remaining`, and `nextReset` fields
  - Automatic extraction from `Akamai-RateLimit-*` response headers
  - Exposed in `ExecutionResult` interface for operational visibility
  - Supports case-insensitive header matching
- **Enhanced EdgeGrid Client**: Updated to return full HTTP response metadata
  - New `EdgeGridResponse` interface includes `body`, `statusCode`, and `headers`
  - Better error reporting with headers included in error responses
  - Improved request ID tracking from response headers

### Changed
- Updated `EdgeGridClient` methods to return `EdgeGridResponse<T>` instead of raw body
- Modified `UniversalExecutor.executeSingle()` to extract and populate rate limit information
- Enhanced error handling to include response headers in error objects

### Technical Improvements
- Added `extractRateLimitInfo()` helper method for consistent rate limit parsing
- Improved type safety with explicit response structure interfaces
- Synced to latest Akamai OpenAPI specifications (59 APIs, 1,444 operations)

### Developer Experience
- Created comprehensive `PERFORMANCE_ANALYSIS.md` documentation
- Analyzed and documented existing performance optimizations
- Identified that connection pooling, caching, and parallel execution are already optimal

## [3.0.0] - 2025-01-14

### Added
- Enterprise reliability patterns (circuit breaker, connection pooling, response caching)
- Graceful shutdown coordinator
- Developer experience tools (CLI, health checks, mock mode)
- Connection pooling with HTTP keep-alive (43% performance improvement)
- LRU response cache with TTL (99.8% speedup for repeated requests)

### Changed
- Migrated to dynamic tool generation (100% API coverage)
- Unified execution path through `akamai_raw_request` tool

## [2.0.0] - 2025-01-13

### Added
- Dynamic tool generation from OpenAPI specifications
- Complete Akamai API coverage (1,444 operations from 59 APIs)

### Removed
- Hand-coded tools (replaced with dynamic generation)

## [1.0.0] - 2025-01-12

### Added
- Initial release with 22 hand-coded tools
- Basic Akamai EdgeGrid authentication
- Property Manager, Cache Purge, and DNS operations

---

## Performance Benchmarks

| Metric | v3.0.0 | v3.1.0 | Improvement |
|--------|--------|--------|-------------|
| Startup time | ~1.0s | ~1.0s | - |
| Request overhead | <10ms | <10ms | - |
| Connection reuse | 43% | 43% | - |
| Cache hit speedup | 99.8% | 99.8% | - |
| Rate limit visibility | ❌ | ✅ | +100% |

## Security Status

- ✅ No critical vulnerabilities
- ⚠️ 6 moderate dev-only vulnerabilities (vitest, testing framework)
- ✅ Credentials properly managed (.env in .gitignore)
- ✅ Input validation and header allowlist implemented

## API Coverage

- **Total Operations:** 1,444
- **API Products:** 59
- **Coverage:** 100%
- **Update Frequency:** Specifications synced from [akamai/akamai-apis](https://github.com/akamai/akamai-apis)

## Contributors

- Claude Code (Performance Analysis & Rate Limit Feature)
- Original authors (v1.0 - v3.0 architecture)
