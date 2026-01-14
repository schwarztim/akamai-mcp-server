# Akamai MCP Server - Usage Guide

Your Akamai MCP Server is now running with **1,444 dynamically generated tools** providing complete API coverage of Akamai's platform.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Tool Categories](#tool-categories)
3. [Discovery Tools](#discovery-tools)
4. [Common Workflows](#common-workflows)
5. [API Request Patterns](#api-request-patterns)
6. [Error Handling](#error-handling)
7. [Rate Limiting & Throttling](#rate-limiting--throttling)
8. [Debugging](#debugging)

---

## Quick Start

### 1. Start the Server

```bash
npm start
```

You should see:

```
[INFO]: Loading OpenAPI specifications...
[INFO]: Registry loaded: 1444 operations from 56 specs in ~1000ms
[INFO]: Generated 1444 MCP tools in ~5ms
[INFO]: MCP Server initialized (stdio transport)
```

### 2. Use Tools in Claude

Once started, all `akamai_*` tools are available in Claude. Try:

```
List my Akamai properties using akamai_papi_listProperties
```

### 3. Browse Available Tools Locally

```bash
npm run cli
```

This opens an interactive CLI where you can:
- Search for specific operations
- View tool descriptions and parameters
- Test tools without Claude

---

## Tool Categories

All 1,444 tools are organized by Akamai product. Here are the major products:

| Product | Tools | Use Case |
|---------|-------|----------|
| **PAPI** (Property Manager) | 81 | Manage CDN configurations, properties, hostnames, rules |
| **AppSec** | 213 | Security policies, attack groups, rate controls, IP lists |
| **CloudLets** | 50 | Policy management for traffic management and geo-steering |
| **DNS** | 60 | DNS record management, zone configuration |
| **EdgeWorkers** | 40 | Serverless compute deployment and management |
| **Identity & Access** | 185 | User accounts, authentication, MFA |
| **CRUX** | 172 | Data analytics and insights |
| **ETP** | 152 | Enterprise Threat Protection reporting & configuration |
| **API Definitions** | 58 | API security and API traffic management |
| **Alerts** | 48 | Notification and alert management |

### Viewing Available Tools

**Option 1: Search by Product**

In Claude, try:

```
Find all AppSec tools using akamai_list_operations with filter "appsec"
```

**Option 2: Get Statistics**

```
Show me API coverage statistics using akamai_registry_stats
```

**Option 3: Full Registry Listing**

```
List all operations with akamai_list_operations
```

---

## Discovery Tools

The server includes **3 built-in utility tools** for discovering and testing the registry:

### 1. `akamai_registry_stats`

Get statistics about available tools and API coverage.

**Usage:**
```
Show me statistics about available APIs using akamai_registry_stats
```

**Output includes:**
- Total operations: 1,444
- Operations by product
- Operations by HTTP method
- Paginatable operations count

### 2. `akamai_list_operations`

Search and filter operations by name, product, or method.

**Parameters:**
- `query` (optional): Search term (product name, operation name, etc.)
- `method` (optional): Filter by HTTP method (GET, POST, PUT, DELETE)
- `limit` (optional): Max results (default: 100)

**Examples:**
```
# Find all GET operations
akamai_list_operations with method: "GET" and limit: 50

# Search for property operations
akamai_list_operations with query: "property"

# Find all POST operations in AppSec
akamai_list_operations with query: "appsec" and method: "POST"
```

### 3. `akamai_raw_request`

Make raw HTTP requests to any Akamai API endpoint for operations not yet in the registry.

**Parameters:**
- `method`: HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD)
- `path`: API path (e.g., `/papi/v1/properties`)
- `body` (optional): Request body for POST/PUT
- `params` (optional): Query parameters as object

**Example:**
```
Make a raw GET request to /identity-management/v3/user-profile
```

---

## Common Workflows

### Workflow 1: Managing CDN Properties (PAPI)

```
1. List all properties
   akamai_papi_listProperties

2. Get property details
   akamai_papi_getProperty with propertyId: "123456"

3. Create new property
   akamai_papi_createProperty with propertyName: "my-cdn-site.com"

4. Activate property to staging
   akamai_papi_activateProperty with propertyId: "123456" and network: "STAGING"

5. Activate to production
   akamai_papi_activateProperty with propertyId: "123456" and network: "PRODUCTION"
```

### Workflow 2: Security Policy Configuration (AppSec)

```
1. List security policies
   akamai_appsec_listPolicies

2. View policy details
   akamai_appsec_getPolicy with policyId: "abcd1234"

3. Enable specific attack groups
   akamai_appsec_enableAttackGroup with policyId: "abcd1234" and groupId: "SQL_INJECTION"

4. Configure IP reputation list
   akamai_appsec_updateIpReputationControl with policyId: "abcd1234"

5. Activate changes to staging
   akamai_appsec_activatePolicy with policyId: "abcd1234" and network: "STAGING"
```

### Workflow 3: DNS Management

```
1. List zones
   akamai_dns_listZones

2. Get zone details
   akamai_dns_getZone with zone: "example.com"

3. Add DNS record
   akamai_dns_addRecord with zone: "example.com", name: "www", type: "CNAME", target: "cdn.example.com"

4. Update record
   akamai_dns_updateRecord with zone: "example.com", name: "www"

5. Activate changes
   akamai_dns_activateZone with zone: "example.com"
```

### Workflow 4: User Account Management

```
1. List all users
   akamai_identity_management_listUsers

2. Get user details
   akamai_identity_management_getUser with userId: "user123"

3. Create new user
   akamai_identity_management_createUser with email: "newuser@company.com", firstName: "John", lastName: "Doe"

4. Enable MFA for user
   akamai_identity_management_enableMFA with userId: "user123"

5. Grant role to user
   akamai_identity_management_grantRole with userId: "user123" and roleId: "admin"
```

---

## API Request Patterns

### Pattern 1: Simple GET Request

```
Retrieve user profile using akamai_identity_management_getUserProfile
```

### Pattern 2: GET with Query Parameters

```
List properties with limit 50 and filter using akamai_papi_listProperties with:
  - limit: 50
  - search: "production"
```

### Pattern 3: POST with Request Body

```
Create new security policy using akamai_appsec_createPolicy with:
  - policyName: "my-policy"
  - productId: "Web_Application_Protector"
  - description: "Policy for main website"
```

### Pattern 4: PUT to Update Resource

```
Update property using akamai_papi_updateProperty with:
  - propertyId: "123456"
  - propertyName: "updated-name"
  - rules: [...]
```

### Pattern 5: DELETE Resource

```
Delete security policy using akamai_appsec_deletePolicy with:
  - policyId: "abcd1234"
```

### Pattern 6: Handling Pagination

Most list operations (GET with multiple results) automatically handle pagination:

```
List all AppSec evaluation rules (auto-paginated):
akamai_appsec_listEvaluationRules with policyId: "abcd1234"
```

The server automatically:
- Detects paginatable endpoints
- Fetches all pages
- Merges results
- Returns complete dataset

---

## Error Handling

### Common Errors and Solutions

**Error: "Invalid credentials"**
```
Solution: Check that .env file has correct values:
  - AKAMAI_HOST (should start with "akab-")
  - AKAMAI_CLIENT_TOKEN
  - AKAMAI_CLIENT_SECRET
  - AKAMAI_ACCESS_TOKEN

The credentials must be from Akamai Control Center API Client creation.
```

**Error: "Rate limit exceeded"**
```
Solution: Server automatically enforces rate limiting (20 req/sec).
If you still see this, wait 30 seconds before retrying.
The server uses exponential backoff with max 3 retries.
```

**Error: "Resource not found (404)"**
```
Possible causes:
  1. Resource ID is incorrect
  2. Resource was deleted
  3. User doesn't have permission to access it

Solution: Verify the ID and check permissions in Akamai Control Center.
```

**Error: "Unauthorized (401)"**
```
Solution: Your credentials have expired or been rotated.
To fix:
  1. Go to Akamai Control Center
  2. Delete old API Client
  3. Create new one
  4. Update .env file with new credentials
  5. Restart server
```

---

## Rate Limiting & Throttling

The server includes built-in rate limiting to protect your Akamai account:

- **Default**: 20 requests per second
- **Retry Policy**: Exponential backoff (1s, 2s, 4s, 8s)
- **Max Retries**: 3 attempts
- **Request Timeout**: 30 seconds

### To Modify Rate Limiting

Edit `src/auth/edgegrid-client.ts` line 25:

```typescript
this.rateLimiter = new RateLimiter(20, 2); // 20 requests, refill 2/sec
// Change to: new RateLimiter(50, 5) for 50 req/sec
```

Then rebuild:

```bash
npm run build
npm start
```

---

## Debugging

### View Server Logs

```bash
tail -f logs/akamai-mcp.log
```

### View Recent Logs

```bash
tail -100 logs/akamai-mcp.log
```

### Search Logs for Errors

```bash
grep "ERROR" logs/akamai-mcp.log
```

### Run Server in Debug Mode

```bash
# Rebuild with debug logging
LOG_LEVEL=debug npm start
```

### Test Specific Tool

```bash
npm run cli
# Then select tool and test it interactively
```

### Health Check

```bash
npm run health
```

This verifies:
- Credentials are valid
- Connection to Akamai works
- Server can authenticate

---

## Tool Naming Convention

All tools follow the pattern:

```
akamai_<product>_<operation-name>
```

**Examples:**
- `akamai_papi_listProperties` - PAPI product, listProperties operation
- `akamai_appsec_createPolicy` - AppSec product, createPolicy operation
- `akamai_dns_addRecord` - DNS product, addRecord operation

### How to Find Tool Names

1. **By operation**: Use `akamai_list_operations` in Claude
2. **By product**: Search "appsec", "papi", "dns", etc.
3. **In CLI**: Run `npm run cli` and browse interactive list

---

## Tips & Best Practices

### ✅ Do

- Use discovery tools (`akamai_list_operations`, `akamai_registry_stats`) to find operations
- Batch related operations when possible
- Use specific query parameters to reduce result sizes
- Check logs regularly for errors
- Keep credentials secure in .env file (it's git-ignored)

### ❌ Don't

- Share your .env file or API credentials
- Rotate credentials while server is running
- Make requests with blank/empty required parameters
- Use the raw_request tool for standard operations (use generated tools instead)
- Leave server running unattended for extended periods

---

## Need Help?

- **View Akamai API Docs**: https://developer.akamai.com
- **Check Server Status**: `npm run health`
- **List Available Tools**: `akamai_list_operations`
- **View Tool Descriptions**: `akamai_registry_stats`

---

**Version**: 3.0.0 (Enterprise-grade MCP Server)
**Tools**: 1,444 (100% API coverage)
**Last Updated**: 2026-01-14
