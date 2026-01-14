#!/bin/bash

# Test script for Akamai MCP Server tools
# This script demonstrates how to call various tools using curl or node

set -e

echo "==================================="
echo "Akamai MCP Server - Tool Testing"
echo "==================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if server is built
if [ ! -f "../dist/index.js" ]; then
    echo -e "${RED}Error: Server not built. Run 'npm run build' first.${NC}"
    exit 1
fi

# Check if .env exists
if [ ! -f "../.env" ]; then
    echo -e "${RED}Error: .env file not found. Copy .env.example and configure it.${NC}"
    exit 1
fi

echo -e "${BLUE}Starting tests...${NC}"
echo ""

# Test 1: Health Check
echo -e "${BLUE}Test 1: Health Check${NC}"
cat > /tmp/mcp-health-check.json << 'EOF'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "akamai_health_check",
    "arguments": {}
  }
}
EOF

echo "Request:"
cat /tmp/mcp-health-check.json | jq '.'
echo ""
echo "Response:"
cat /tmp/mcp-health-check.json | node ../dist/index.js 2>/dev/null | jq '.'
echo -e "${GREEN}✓ Health check test completed${NC}"
echo ""

# Test 2: List Properties (will fail if no contractId/groupId provided, but demonstrates usage)
echo -e "${BLUE}Test 2: List Properties${NC}"
cat > /tmp/mcp-list-properties.json << 'EOF'
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "akamai_list_properties",
    "arguments": {}
  }
}
EOF

echo "Request:"
cat /tmp/mcp-list-properties.json | jq '.'
echo ""
echo "Response (may contain error if no properties accessible):"
cat /tmp/mcp-list-properties.json | node ../dist/index.js 2>/dev/null | jq '.' || echo -e "${RED}Note: This may fail if you don't have property access${NC}"
echo ""

# Test 3: Purge by URL (staging, invalidate - safest test)
echo -e "${BLUE}Test 3: Purge URL (Staging)${NC}"
cat > /tmp/mcp-purge-url.json << 'EOF'
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "akamai_purge_by_url",
    "arguments": {
      "urls": ["https://example.com/test.jpg"],
      "network": "staging",
      "action": "invalidate"
    }
  }
}
EOF

echo "Request:"
cat /tmp/mcp-purge-url.json | jq '.'
echo ""
echo "Note: Update the URL to match your domain before running in production"
echo "Response:"
cat /tmp/mcp-purge-url.json | node ../dist/index.js 2>/dev/null | jq '.' || echo -e "${RED}Purge test skipped (update URL first)${NC}"
echo ""

# Test 4: List DNS Zones
echo -e "${BLUE}Test 4: List DNS Zones${NC}"
cat > /tmp/mcp-list-dns.json << 'EOF'
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "akamai_list_dns_zones",
    "arguments": {}
  }
}
EOF

echo "Request:"
cat /tmp/mcp-list-dns.json | jq '.'
echo ""
echo "Response:"
cat /tmp/mcp-list-dns.json | node ../dist/index.js 2>/dev/null | jq '.' || echo -e "${RED}DNS test skipped (may not have DNS access)${NC}"
echo ""

# Test 5: List EdgeWorkers
echo -e "${BLUE}Test 5: List EdgeWorkers${NC}"
cat > /tmp/mcp-list-edgeworkers.json << 'EOF'
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "akamai_list_edgeworkers",
    "arguments": {}
  }
}
EOF

echo "Request:"
cat /tmp/mcp-list-edgeworkers.json | jq '.'
echo ""
echo "Response:"
cat /tmp/mcp-list-edgeworkers.json | node ../dist/index.js 2>/dev/null | jq '.' || echo -e "${RED}EdgeWorkers test skipped (may not have EdgeWorkers access)${NC}"
echo ""

echo ""
echo -e "${GREEN}==================================="
echo "All tests completed!"
echo "===================================${NC}"
echo ""
echo "Notes:"
echo "- Some tests may fail if you don't have access to specific APIs"
echo "- Update URLs, IDs, and parameters to match your Akamai configuration"
echo "- Check ../logs/akamai-mcp.log for detailed logs"
echo ""
echo "Next steps:"
echo "1. Configure your MCP client (e.g., Claude Desktop)"
echo "2. Test with real Akamai resources"
echo "3. Review logs for any errors"
echo ""

# Cleanup
rm -f /tmp/mcp-*.json
