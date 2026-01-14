# Claude Desktop Integration Guide

This guide helps you verify and troubleshoot the Akamai MCP Server integration with Claude Desktop.

## ✅ Verification Checklist

### Step 1: Verify Configuration File Location

The Claude Desktop config file should be at:

**macOS/Linux**:
```
~/.config/Claude/claude_desktop_config.json
```

**Windows**:
```
%APPDATA%\Claude\claude_desktop_config.json
```

### Step 2: Check Configuration Content

Open your config file and verify it contains the akamai MCP server entry:

```json
{
  "mcpServers": {
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
}
```

**Key requirements**:
- ✅ Path points to `/dist/index.js` (not `src/`)
- ✅ All four environment variables are set
- ✅ No typos in variable names
- ✅ Credentials match your Akamai API Client

### Step 3: Restart Claude

After updating the config:
1. Close Claude Desktop completely
2. Wait 3 seconds
3. Reopen Claude Desktop

You should see in the Claude UI:
- "Akamai MCP Server" listed in the available tools indicator
- Or a small icon indicating connected MCP servers

### Step 4: Test a Tool

In Claude, try any of these commands:

**Option 1: Check Server Health**
```
Show me my user profile using akamai_identity_management_getUserProfile
```

**Option 2: List Available Tools**
```
Search for available Akamai tools using akamai_list_operations
```

**Option 3: Get API Statistics**
```
Show me Akamai API coverage statistics using akamai_registry_stats
```

---

## 🔧 Troubleshooting

### Issue 1: "Tool not found" or "Akamai tools not available"

**Cause**: Claude hasn't detected the MCP server.

**Solution**:
1. Verify the config file path and content
2. Check that `dist/index.js` exists:
   ```bash
   ls -la /Users/timothy.schwarz/Scripts/akamai-mcp-server/dist/index.js
   ```
3. Rebuild if missing:
   ```bash
   npm run build
   ```
4. Restart Claude completely

### Issue 2: "Permission denied" error

**Cause**: Node.js path is wrong or node isn't accessible.

**Solution**:
1. Find where node is installed:
   ```bash
   which node
   ```
2. Update the config to use the full path:
   ```json
   "command": "/usr/local/bin/node"
   ```
   (or wherever your node is located)

### Issue 3: "Authentication failed" error

**Cause**: Credentials are incorrect or expired.

**Solution**:
1. Verify credentials in your Akamai Control Center
2. Check they match your config exactly:
   ```bash
   cat .env
   ```
3. If expired, create new API client:
   - Go to Akamai Control Center
   - Create new API Client
   - Update all four env vars in the config
   - Restart Claude

### Issue 4: "Connection timeout" error

**Cause**:
- Akamai API is unreachable
- Network connectivity issue
- Rate limiting

**Solution**:
1. Test locally first:
   ```bash
   npm run health
   ```
2. Check if you can reach Akamai APIs:
   ```bash
   curl -I https://$(echo $AKAMAI_HOST | cut -d. -f1-4).luna.akamaiapis.net
   ```
3. Wait 30 seconds if you hit rate limits
4. Check logs:
   ```bash
   tail -50 logs/akamai-mcp.log
   ```

### Issue 5: MCP Server crashes on startup

**Cause**:
- dist/index.js has syntax errors
- Missing dependencies
- Environment variable issues

**Solution**:
1. Check for build errors:
   ```bash
   npm run build
   ```
2. Verify all dependencies:
   ```bash
   npm install
   ```
3. Test server locally:
   ```bash
   npm start
   ```
4. View error logs:
   ```bash
   tail -100 logs/akamai-mcp.log | grep ERROR
   ```

---

## 📋 Configuration Reference

### Valid Config Structure

```json
{
  "mcpServers": {
    "akamai": {
      "command": "node",
      "args": ["/path/to/dist/index.js"],
      "env": {
        "AKAMAI_HOST": "string (akab-*.luna.akamaiapis.net)",
        "AKAMAI_CLIENT_TOKEN": "string (akab-*)",
        "AKAMAI_CLIENT_SECRET": "string (base64 encoded)",
        "AKAMAI_ACCESS_TOKEN": "string (akab-*)",
        "LOG_LEVEL": "info|debug|warn|error (optional, default: info)"
      }
    }
  }
}
```

### Optional Environment Variables

```json
"AKAMAI_ACCOUNT_KEY": "string (for multi-account access)",
"LOG_FILE": "string (path to log file, default: logs/akamai-mcp.log)",
"MAX_RETRIES": "number (default: 3)",
"RETRY_DELAY_MS": "number (default: 1000)",
"REQUEST_TIMEOUT": "number (default: 30000)"
```

---

## 🚀 Verification Commands

Run these commands to verify your setup:

**Check file exists**:
```bash
test -f /Users/timothy.schwarz/Scripts/akamai-mcp-server/dist/index.js && echo "✅ File exists" || echo "❌ File missing"
```

**Check build is fresh**:
```bash
ls -lh /Users/timothy.schwarz/Scripts/akamai-mcp-server/dist/index.js
```

**Verify config JSON syntax**:
```bash
python3 -m json.tool ~/.config/Claude/claude_desktop_config.json > /dev/null && echo "✅ Valid JSON" || echo "❌ Invalid JSON"
```

**Test credentials locally**:
```bash
npm run health
```

**View recent errors**:
```bash
grep "ERROR" /Users/timothy.schwarz/Scripts/akamai-mcp-server/logs/akamai-mcp.log | tail -10
```

---

## 📊 Expected Behavior After Setup

Once correctly configured, you should see:

1. **In Claude UI**:
   - Akamai MCP server indicator (usually a small icon)
   - Access to akamai_* tools
   - Tool autocomplete when typing "akamai_"

2. **In Logs** (run `tail -f logs/akamai-mcp.log`):
   ```
   [INFO]: Loading OpenAPI specifications...
   [INFO]: Registry loaded: 1444 operations from 56 specs
   [INFO]: Generated 1444 MCP tools
   [INFO]: MCP Server initialized (stdio transport)
   [INFO]: Server listening...
   ```

3. **When Using Tools**:
   - Tools execute within 1-5 seconds for simple operations
   - Results return formatted as JSON or text
   - Errors clearly explain what went wrong

---

## 🔐 Security Notes

### Credentials in Config

The credentials are stored in the Claude Desktop config file:
- ✅ **Protected**: Only your user can read it
- ⚠️ **Not encrypted**: Stored in plaintext
- ⚠️ **In backups**: Included if you backup your Claude config

### Best Practices

1. **Use strong, limited-scope API credentials**:
   - Create API clients with minimal required permissions
   - Rotate credentials monthly
   - Don't reuse credentials across tools

2. **Monitor API usage**:
   - Check Akamai logs periodically
   - Set up alerts for unusual activity
   - Review permissions quarterly

3. **If credentials are compromised**:
   - Immediately delete the API client in Akamai Control Center
   - Create a new one with the same permissions
   - Update all references (config, .env, etc.)
   - Audit Akamai logs for unauthorized activity

---

## 🎯 Next Steps

Once verified, you can:

1. **Explore Available APIs**: Use `akamai_list_operations` to discover tools
2. **Read Usage Guide**: See [USAGE_GUIDE.md](USAGE_GUIDE.md) for workflows
3. **Test Operations**: Try the examples in the Usage Guide
4. **Monitor Performance**: Check logs for performance insights

---

## 📞 Support

If you encounter issues:

1. Check the [troubleshooting section](#-troubleshooting) above
2. Review logs: `tail -f logs/akamai-mcp.log`
3. Test locally: `npm run e2e`
4. Verify Akamai API status: https://status.akamai.com
5. Review Akamai API documentation: https://developer.akamai.com

---

**Last Updated**: 2026-01-14
**Version**: 3.0.0
