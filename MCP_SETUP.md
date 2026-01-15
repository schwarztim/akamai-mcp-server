# Akamai MCP Server - Setup Verification

## ✅ Configuration Complete

The Akamai MCP server has been configured for both Claude Code and Claude Desktop.

### Configuration Files

**Claude Code (CLI):**
```
~/.claude/mcp.json
```

**Claude Desktop:**
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

The Claude Code configuration (`~/.claude/mcp.json`) contains:
```json
{
  "akamai": {
    "command": "node",
    "args": ["/Users/timothy.schwarz/Scripts/akamai-mcp-server/dist/index.js"],
    "env": {
      "AKAMAI_HOST": "akab-gl4p5ld6nhzjpjjp-dmcffit445cneu3o.luna.akamaiapis.net",
      "AKAMAI_CLIENT_TOKEN": "akab-hccjvdj77xex5ca6-vo7dtrphchcu4ijx",
      "AKAMAI_CLIENT_SECRET": "ZFdIAOfpfxDXst50vPyJrw2IP5kmhxOFEQ49Vuixk2c=",
      "AKAMAI_ACCESS_TOKEN": "akab-2uofdqybekqtp5nt-ly244r3vczm5ijom"
    }
  }
}
```

**Note:** If you have other MCP servers configured, add the "akamai" entry alongside them in the same JSON file.

## 🚀 How to Use

### Just Talk Naturally!

**You don't need to know tool names or operation IDs.** Just ask for what you want in plain English, and Claude Code will:
1. Search for the right Akamai operations
2. Execute them with the correct parameters
3. Return the results to you

### Examples of Natural Language Requests

```
✅ "Show me my Akamai profile"
✅ "List all my CDN properties"
✅ "What DNS zones do I have?"
✅ "Purge these URLs from cache: [URLs]"
✅ "Find all operations related to EdgeWorkers"
✅ "What's the status of purge request ABC123?"
✅ "Show me users in my account"
✅ "Get the rule tree for property XYZ"
```

Claude Code will automatically figure out which operations to use!

---

### Technical Details (For Reference)

Once the new session starts, you'll have access to these MCP tools (but you rarely need to call them directly):

#### `akamai_registry_stats`
View complete API coverage statistics.

**Example:**
```
You: Use akamai_registry_stats to show me what APIs are available
```

**Returns:**
- Total operations: 1,444
- Operations by product (AppSec: 213, Identity: 185, etc.)
- Operations by method (GET: 828, POST: 336, etc.)
- Pagination support metrics

#### `akamai_list_operations`
Search and discover operations.

**Parameters:**
- `product` - Filter by product (e.g., "papi", "ccu", "identity-management")
- `method` - Filter by HTTP method (GET, POST, PUT, DELETE)
- `query` - Text search (e.g., "purge", "property", "dns")
- `paginatable` - Show only operations with pagination support
- `limit` - Max results to return

**Example:**
```
You: Find all operations related to purging
Claude: [Calls akamai_list_operations with query: "purge"]

You: Show me all PAPI operations that support pagination
Claude: [Calls akamai_list_operations with product: "papi", paginatable: true]
```

#### `akamai_raw_request`
Execute any Akamai API operation.

**Parameters:**
- `toolName` - Operation name from akamai_list_operations (e.g., "akamai_papi_listProperties")
- `pathParams` - Path parameters as object
- `queryParams` - Query parameters as object
- `headers` - Custom headers as object
- `body` - Request body for POST/PUT/PATCH
- `paginate` - Enable automatic pagination (true/false)
- `maxPages` - Maximum pages to fetch (default: 10, max: 100)

**Example:**
```
You: Get my user profile from Akamai
Claude: [Calls akamai_raw_request with:
  {
    "toolName": "akamai_identity_management_get-user-profile"
  }
]

You: List all my CDN properties with pagination
Claude: [Calls akamai_raw_request with:
  {
    "toolName": "akamai_papi_listProperties",
    "queryParams": {
      "contractId": "ctr_XXX",
      "groupId": "grp_XXX"
    },
    "paginate": true
  }
]
```

## 🧪 Testing

### Quick Test Commands

**Just use plain English!** Claude Code will figure out which operations to call.

1. **View available APIs:**
   ```
   You: What Akamai APIs are available?
   ```
   Claude will use `akamai_registry_stats` automatically.

2. **Get your profile:**
   ```
   You: Show me my Akamai profile
   ```
   Claude will search for profile operations and execute the right one.

3. **Find operations:**
   ```
   You: What operations are available for purging cache?
   ```
   Claude will use `akamai_list_operations` to search.

4. **Manage resources:**
   ```
   You: List all my CDN properties
   You: Show me DNS zones in my account
   You: What EdgeWorkers do I have deployed?
   ```
   Claude will find and execute the appropriate operations.

### Expected Results

When working correctly, Claude will:
- See the three Akamai utility tools
- Be able to call them directly
- Return Akamai API data in JSON format
- Handle pagination automatically when requested
- Show 1,444 available operations via registry stats

## 🔧 Troubleshooting

### Tools Not Appearing

**Problem:** Akamai tools not visible in new Claude Code session

**Solutions:**
1. Verify config file exists: `cat ~/.config/claude-code/config.json`
2. Check path is absolute (not relative): Must be full path to `dist/index.js`
3. Ensure build is current: Run `npm run build` in the server directory
4. Check server starts: Run `node /Users/timothy.schwarz/Scripts/akamai-mcp-server/dist/index.js` manually
5. Restart Claude Code completely (not just new chat)

### Server Connection Errors

**Problem:** "Failed to connect to MCP server"

**Solutions:**
1. Verify Node.js installed: `node --version` (need v18+)
2. Check build artifacts: `ls -la /Users/timothy.schwarz/Scripts/akamai-mcp-server/dist/`
3. Test credentials: `npm run health` in server directory
4. Check logs: `tail -f /Users/timothy.schwarz/Scripts/akamai-mcp-server/logs/akamai-mcp.log`

### API Call Failures

**Problem:** Operations return errors

**Solutions:**
1. Verify credentials are valid in `.env` file
2. Check API permissions in Akamai Control Center
3. Enable debug logging: Set `LOG_LEVEL=debug` in config
4. Test with mock mode: `npm run cli:mock` in server directory

## 📚 Additional Resources

- **CLAUDE.md** - Comprehensive development guide
- **ARCHITECTURE_V2.md** - Dynamic tool generation architecture
- **README.md** - Full project documentation
- **API Reference:** https://techdocs.akamai.com/home/page/api-references

## 🎯 Common Workflows

**Use natural language - Claude Code handles the rest!**

### Workflow 1: Explore Your Akamai Setup
```
You: What Akamai services do I have access to?
You: Show me all my CDN properties
You: What EdgeWorkers are deployed?
You: List my DNS zones
You: What certificates do I have in CPS?
```
Claude will automatically discover and call the appropriate operations.

### Workflow 2: Get Account Information
```
You: Show me my Akamai profile
You: What's my account information?
You: Who are the users in my account?
You: What API clients exist?
You: When was I last logged in?
```
Claude will search for identity/user operations and retrieve your data.

### Workflow 3: Manage CDN Configuration
```
You: Show me the properties in group X
You: Get the rules for property Y
You: What hostnames are configured on this property?
You: Show me recent property activations
You: What's the current version of property Z?
```
Claude will use PAPI operations to get configuration details.

### Workflow 4: Cache Management
```
You: Purge these URLs from cache: [list of URLs]
You: Invalidate cache for these tags: [cache tags]
You: Check the status of purge request ABC123
You: What cache purge operations are available?
```
Claude will use CCU (Fast Purge) operations.

### Workflow 5: Troubleshooting and Analysis
```
You: Are there any recent errors in my configurations?
You: Show me properties that haven't been activated in 30 days
You: Which properties use behavior X?
You: Find all references to hostname Y
```
Claude will combine multiple operations to analyze your setup.

## ✅ Verification Checklist

- [x] Config file exists at `~/.claude/mcp.json`
- [x] Akamai server added to config
- [x] Server builds successfully (`npm run build`)
- [x] All tests pass (`npm test` - 153/153)
- [x] Health check succeeds (`npm run health`)
- [x] Registry validates (`npm run validate` - 1,444 operations)
- [x] Profile retrieval works (tested via direct API call)
- [ ] New Claude Code session can see Akamai tools (restart required)
- [ ] Tools execute successfully (test in new session)

---

## 🎯 Remember: Just Use Plain English!

You **don't need to memorize** tool names or operation IDs. Simply:

1. **Ask for what you want:**
   - "Show me my profile"
   - "List my properties"
   - "Purge these URLs"

2. **Claude Code handles:**
   - Finding the right operations
   - Calling them with correct parameters
   - Formatting the results

3. **You get the answer:**
   - No need to know MCP internals
   - No need to know Akamai API structure
   - Just natural conversation!

**Status:** Configured and tested ✅
**Last Updated:** January 15, 2026
**Your Profile:** Timothy Schwarz (timothy.schwarz@qvc.com)
**Operations Available:** 1,444 across 56 Akamai products
