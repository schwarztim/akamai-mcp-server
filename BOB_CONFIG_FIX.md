# Bob (Claude Code) MCP Configuration

## Global Configuration (Recommended)

The Akamai MCP server is configured at the **top level** of bob's config, making it available from **any directory**.

### Configuration Location

```
~/.config/bob/.claude.json
```

### Structure

```json
{
  "mcpServers": {
    "akamai": {
      "command": "node",
      "args": ["/Users/timothy.schwarz/Scripts/akamai-mcp-server/dist/index.js"],
      "env": {
        "AKAMAI_HOST": "...",
        "AKAMAI_CLIENT_TOKEN": "...",
        "AKAMAI_CLIENT_SECRET": "...",
        "AKAMAI_ACCESS_TOKEN": "..."
      }
    }
  },
  "projects": {
    // Per-project settings (optional)
  }
}
```

## How It Works

1. **Top-level `mcpServers`**: Available globally from any directory
2. **Per-project `mcpServers`**: Override/extend global settings for specific directories

## Available Tools

After restarting bob, you should have access to:

### Utility Tools
- `akamai_raw_request` - Execute any of 1,444 Akamai operations
- `akamai_list_operations` - Search and discover operations
- `akamai_registry_stats` - View API coverage statistics

### Aggregation Tools (High Performance)
- `akamai_list_all_hostnames` - Get ALL hostnames in ~30 seconds
- `akamai_account_overview` - Comprehensive account summary
- `akamai_list_all_properties` - List all CDN properties

## Verification

After restarting bob from any directory:
```
Show me my Akamai account overview
```

If the MCP server is loaded, you'll get results. If not, bob will fall back to CLI commands.

## Troubleshooting

### MCP Server Not Loading

1. Check the config exists:
   ```bash
   cat ~/.config/bob/.claude.json | jq '.mcpServers'
   ```

2. Verify the server starts:
   ```bash
   node /Users/timothy.schwarz/Scripts/akamai-mcp-server/dist/index.js
   ```
   (Should show "Akamai MCP Server started successfully")

3. Restart bob completely (not just a new chat)

### Per-Project Override

If a project has `"mcpServers": {}` in its config, it will override the global setting with no servers. Either:
- Remove the empty `mcpServers` from the project config, OR
- Add the Akamai config to that project's `mcpServers`
