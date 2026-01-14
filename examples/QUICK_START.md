# Quick Start Guide

This guide will get you up and running with the Akamai MCP Server in 5 minutes.

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Credentials

1. Get your Akamai API credentials:
   - Go to https://control.akamai.com
   - Navigate to Identity & Access Management
   - Create API Client with required permissions
   - Download credentials

2. Create `.env` file:

```bash
cp .env.example .env
```

3. Edit `.env` with your credentials:

```env
AKAMAI_HOST=your-host.luna.akamaiapis.net
AKAMAI_CLIENT_TOKEN=akab-your-client-token
AKAMAI_CLIENT_SECRET=your-client-secret
AKAMAI_ACCESS_TOKEN=akab-your-access-token
```

## Step 3: Build the Server

```bash
npm run build
```

## Step 4: Test the Server

Run health check:

```bash
node examples/example-usage.js
```

You should see:
```json
{
  "status": "healthy",
  "message": "Successfully connected to Akamai API"
}
```

## Step 5: Use with MCP Client

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "akamai": {
      "command": "node",
      "args": ["/full/path/to/akamai-mcp-server/dist/index.js"],
      "env": {
        "AKAMAI_HOST": "your-host.luna.akamaiapis.net",
        "AKAMAI_CLIENT_TOKEN": "akab-your-client-token",
        "AKAMAI_CLIENT_SECRET": "your-client-secret",
        "AKAMAI_ACCESS_TOKEN": "akab-your-access-token"
      }
    }
  }
}
```

Restart Claude Desktop and you're ready to use Akamai tools!

## Common Operations

### List Properties

Ask Claude:
> "List all my Akamai properties"

### Purge Cache

Ask Claude:
> "Purge these URLs from staging: https://example.com/image.jpg"

### List DNS Records

Ask Claude:
> "Show me all DNS records for example.com"

### Activate EdgeWorker

Ask Claude:
> "Activate EdgeWorker ID 12345 version 1.0.0 to staging"

## Troubleshooting

### "Configuration validation failed"

- Check that all required variables are set in `.env`
- Ensure no typos in variable names
- Verify credentials are correct

### "401 Unauthorized"

- Verify your API credentials are correct
- Check that the API client has required permissions
- Ensure credentials haven't expired

### "Command not found"

- Run `npm run build` first
- Check that Node.js 18+ is installed
- Verify the path in your MCP client config

## Next Steps

1. Review [README.md](../README.md) for complete documentation
2. Check [ARCHITECTURE.md](../ARCHITECTURE.md) to understand the design
3. Read [DEPLOYMENT.md](../DEPLOYMENT.md) for production deployment
4. Explore available tools in [README.md#available-tools](../README.md#available-tools)

## Getting Help

- Check logs: `tail -f logs/akamai-mcp.log`
- Review examples: `ls examples/`
- Read documentation: All `.md` files in project root

## Safety Tips

1. **Test in Staging First**: Always test operations in staging before production
2. **Use Invalidate**: Use `invalidate` instead of `remove` for cache purging when possible
3. **Backup First**: Backup configurations before making changes
4. **Check Permissions**: Verify your API client has minimal required permissions
5. **Monitor Logs**: Keep an eye on `logs/akamai-mcp.log` for issues

---

**Happy automating!** 🚀
