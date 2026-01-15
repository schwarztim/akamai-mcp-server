# Bob (Claude Code) Per-Project MCP Configuration

## The Issue

Bob (a custom Claude Code build) uses **per-project MCP server configuration** that overrides global MCP settings.

### Configuration Locations

**Global MCP config** (used by standard Claude Code):
```
~/.claude/mcp.json
```

**Bob's per-project config**:
```
~/.config/bob/.claude.json
```

Structure:
```json
{
  "projects": {
    "/Users/timothy.schwarz": {
      "mcpServers": {
        // Project-specific MCP servers go here
        // If empty {}, NO MCP servers will load for this project!
      }
    }
  }
}
```

## The Fix

Added Akamai MCP server directly to the project configuration:

```bash
# Edit ~/.config/bob/.claude.json and add to the mcpServers object:
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
```

## Important Notes

1. **Per-Project**: Each directory you work in with bob has its own `mcpServers` configuration
2. **Override Behavior**: Project-specific config overrides global config completely
3. **Empty = No Servers**: If `mcpServers: {}` is empty, no MCP servers load (even if configured globally)
4. **Restart Required**: Changes only take effect when starting a new bob session

## Verification

After restarting bob, check available tools with:
```
What MCP tools are available?
```

You should see:
- `akamai_raw_request`
- `akamai_list_operations`
- `akamai_registry_stats`

## For Other Projects

If you want Akamai tools in a different project directory, add the configuration to that project's entry in `.claude.json`:

```json
{
  "projects": {
    "/path/to/other/project": {
      "mcpServers": {
        "akamai": { ... }
      }
    }
  }
}
```
