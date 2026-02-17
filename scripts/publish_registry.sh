#!/bin/bash
# publish_registry.sh — Publish Fodda MCP to npm and the Official MCP Registry
# Prerequisites: mcp-publisher CLI installed (brew install mcp-publisher)
#
# Usage:
#   ./scripts/publish_registry.sh              # Full: npm publish + registry publish (DNS auth)
#   ./scripts/publish_registry.sh --github     # Full: npm publish + registry publish (GitHub auth)
#   ./scripts/publish_registry.sh --registry   # Registry only (skip npm publish)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_JSON="$ROOT_DIR/fodda_mcp_server.json"

echo "=== Fodda MCP Registry Publisher ==="
echo ""

# 1. Verify server.json exists
if [ ! -f "$SERVER_JSON" ]; then
  echo "❌ server.json not found at $SERVER_JSON"
  exit 1
fi
echo "✅ Found server.json"

# 2. Validate required fields
node -e "
  const s = require('$SERVER_JSON');
  const errors = [];
  if (!s['\$schema']) errors.push('Missing \$schema');
  if (!s.name) errors.push('Missing name');
  if (!s.version) errors.push('Missing version');
  if (!s.remotes && !s.packages) errors.push('Missing remotes or packages');
  if (errors.length) { console.error('❌ Validation errors:', errors.join(', ')); process.exit(1); }
  console.log('✅ Schema validated:', s.name, 'v' + s.version);
"

# 3. Build to verify code compiles
echo ""
echo "Building project..."
cd "$ROOT_DIR"
npm run build
echo "✅ Build succeeded"

# 4. Publish to npm (unless --registry flag skips it)
if [ "${1:-}" != "--registry" ]; then
  echo ""
  echo "Publishing to npm..."
  cd "$ROOT_DIR"
  npm publish --access public
  echo "✅ npm publish succeeded"
fi

# 5. Authenticate with MCP Registry (if needed)
echo ""
if [ "${1:-}" = "--github" ]; then
  echo "Authenticating with GitHub..."
  mcp-publisher login github
else
  echo "Using DNS-based authentication for fodda.ai"
  echo "Ensure TXT record is set on fodda.ai (see registry docs)"
  echo "If not yet configured, run: mcp-publisher login dns --domain fodda.ai --private-key YOUR_PRIVATE_KEY"
fi

# 6. Publish to MCP Registry
echo ""
echo "Publishing to MCP Registry..."
cd "$ROOT_DIR"
mcp-publisher publish

echo ""
echo "🎉 Published! Verify at:"
echo "   curl \"https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.fodda/mcp-server\""
echo "   https://www.npmjs.com/package/fodda-mcp"
