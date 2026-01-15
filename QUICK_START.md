# Akamai MCP Server - Quick Start

## TL;DR

1. **Start bob**: `bob` (MCP server starts automatically)
2. **Ask questions**: Use plain English
3. **That's it!** No manual server management needed

## What You Get

### Complete Akamai API Access

- **1,444 operations** across **56 products**
- Every Akamai API is available via natural language
- No need to memorize API endpoints or parameters

### Top Products Available

| Product | Operations | What You Can Do |
|---------|-----------|-----------------|
| AppSec | 213 | WAF policies, bot detection, security events |
| Identity & Access | 185 | Users, groups, API clients, permissions |
| Crux | 172 | Customer data platform operations |
| ETP | 114 | Enterprise Threat Protector config |
| PAPI | 81 | CDN properties, rule trees, activations |
| DNS | 60 | Zone management, records, DNSSEC |
| EdgeWorkers | 40 | Serverless functions at the edge |
| CCU (Fast Purge) | 6 | Cache invalidation by URL/tag/CP code |

...and 48 more products!

## How It Works

### MCP Server Lifecycle

```
You:    bob
        ↓
Bob:    Reads ~/.config/bob/.claude.json
        Spawns: node akamai-mcp-server/dist/index.js
        Connects via stdio
        Loads 1,444 Akamai operations
        ↓
        Ready! MCP server running in background
        ↓
You:    Show me my Akamai profile
        ↓
Bob:    Searches for profile operations
        Calls akamai_raw_request
        Returns your profile data
        ↓
You:    exit
        ↓
Bob:    Shuts down MCP server automatically
```

### You Never Run the Server Manually!

The MCP server is **automatically managed by bob**:
- ✅ Auto-starts when bob starts
- ✅ Auto-stops when bob exits
- ✅ Auto-restarts if it crashes
- ✅ Zero manual intervention required

## Example Questions to Try

### Account & Identity
```
Show me my Akamai profile
List all users in my account
What API clients do I have?
Show me my last login date
```

### CDN Properties
```
List all my properties
Show me properties in group X
Get the rule tree for property Y
What's the latest version of property Z?
Show me recent activations
```

### DNS Management
```
List all my DNS zones
Show records for zone example.com
What's the SOA record for this zone?
Add an A record to zone X
```

### EdgeWorkers
```
What EdgeWorkers are deployed?
Show me EdgeWorker with ID 123
Get logs for EdgeWorker X
List all EdgeWorker versions
```

### Cache Purge
```
Purge these URLs: [list]
Invalidate cache for tag ABC
Check status of purge request 123
What purge operations are available?
```

### Security (AppSec)
```
List all WAF policies
Show me security events for the last hour
What rate limiting rules are active?
Show bot detection settings
```

### Certificates (CPS)
```
List all my SSL certificates
Show certificate enrollment status
What certificates expire soon?
Get certificate deployment info
```

### Hostnames
```
Show me all hostnames enrolled in Akamai
List hostnames for property X
What properties use hostname Y?
```

## No Tool Names Required!

**You DON'T need to know:**
- Tool names (`akamai_raw_request`)
- Operation IDs (`akamai_papi_listProperties`)
- API endpoints (`/papi/v1/properties`)
- Parameter names (`contractId`, `groupId`)

**Just ask in plain English!**

Bob automatically:
1. Searches the 1,444 operations
2. Finds the right one
3. Extracts required parameters
4. Makes the API call
5. Returns formatted results

## Troubleshooting

### "Unknown skill: akamai"

**Problem**: You tried `Skill(akamai)` but got an error.

**Solution**: The Akamai MCP server isn't a skill. Just ask naturally:
```
❌ Skill(akamai)
✅ Show me my Akamai profile
```

### Bob Falls Back to Akamai CLI

**Problem**: Bob tries to use `akamai` CLI instead of MCP tools.

**Solution**: Restart bob to load the MCP server:
```bash
exit
bob
```

### MCP Server Not Loading

**Check configuration**:
```bash
cat ~/.config/bob/.claude.json | jq '.projects["/Users/timothy.schwarz"].mcpServers.akamai'
```

Should show:
```json
{
  "command": "node",
  "args": ["/Users/timothy.schwarz/Scripts/akamai-mcp-server/dist/index.js"],
  "env": { ... }
}
```

**Check server logs**:
```bash
tail -f ~/Scripts/akamai-mcp-server/logs/akamai-mcp.log
```

Should show:
```
✅ Akamai MCP Server started successfully
📊 Total tools: 3
```

## Configuration Files

**Bob's project config**:
```
~/.config/bob/.claude.json
```

**Standard Claude Code config**:
```
~/.claude/mcp.json
```

**MCP server location**:
```
~/Scripts/akamai-mcp-server/dist/index.js
```

## Additional Resources

- `CLAUDE.md` - Development guide for Claude Code
- `MCP_SETUP.md` - Detailed setup instructions
- `BOB_CONFIG_FIX.md` - Per-project MCP configuration details
- `ARCHITECTURE_V2.md` - How dynamic tool generation works

## Key Takeaways

1. ✅ **Automatic**: MCP server starts/stops with bob
2. ✅ **Complete**: All 1,444 Akamai operations available
3. ✅ **Natural**: Just ask in plain English
4. ✅ **Zero Config**: Once set up, no maintenance needed
5. ✅ **Always Current**: Synced with Akamai's OpenAPI specs

**Just start bob and ask questions!** 🚀
