# Fodda MCP Publication Summary

**Date:** February 16, 2026  
**Status:** ✅ Successfully Published

---

## Published Locations

### 1. Official MCP Registry
- **Server Name:** `io.github.piers-fawkes/fodda`
- **Title:** Fodda Knowledge Graphs
- **Version:** 1.3.2
- **Status:** Active
- **Published At:** 2026-02-17T00:58:53Z
- **Search URL:** https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.piers-fawkes/fodda

### 2. npm Registry
- **Package Name:** `fodda-mcp`
- **Version:** 1.3.2
- **npm URL:** https://www.npmjs.com/package/fodda-mcp
- **Install Command:** `npm install fodda-mcp`

---

## Installation Instructions

### For End Users

#### Option 1: Via npm (Recommended)
```bash
npx fodda-mcp
```

#### Option 2: Install Globally
```bash
npm install -g fodda-mcp
fodda-mcp
```

#### Option 3: Add to MCP Client Config

**Claude Desktop:**
```json
{
  "mcpServers": {
    "fodda": {
      "command": "npx",
      "args": ["fodda-mcp"],
      "env": {
        "FODDA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**Gemini CLI:**
```bash
gemini mcp add fodda npx fodda-mcp
```

---

## Configuration

### Required Environment Variables
- `FODDA_API_KEY` - Your Fodda API key (required)

### Optional Environment Variables
- `FODDA_API_URL` - Upstream Fodda API URL (default: `https://api.fodda.ai`)

---

## Available Tools

1. **search_graph** - Search the knowledge graph
2. **get_neighbors** - Get neighboring nodes
3. **get_evidence** - Retrieve evidence for nodes
4. **get_node** - Get detailed node information
5. **psfk_overview** - Generate macro overviews
6. **psfk_insights** - Get AI-powered insights

---

## Technical Details

### Transport
- **Type:** stdio
- **Protocol:** MCP 2025-12-11

### Authentication
- **Method:** GitHub-based (for registry publishing)
- **Namespace:** `io.github.piers-fawkes/*`

### Package Contents
- Compiled TypeScript (dist/)
- README.md
- server.json (MCP manifest)

---

## Known Limitations

1. **Remote SSE Endpoint:** Temporarily removed from registry listing due to namespace conflicts
   - The SSE endpoint (`https://mcp.fodda.ai/sse`) is still functional
   - It's just not advertised in the registry listing
   - Users can still connect to it directly if needed

2. **Namespace:** Currently published under personal GitHub namespace (`io.github.piers-fawkes`)
   - Can be migrated to organization namespace later if needed
   - Would require making organization membership public

---

## Next Steps

### Immediate
- ✅ Published to MCP Registry
- ✅ Published to npm
- ✅ Documentation updated

### Future Considerations
1. **Organization Namespace Migration**
   - Create or join `fodda` GitHub organization
   - Make membership public
   - Republish under `io.github.fodda/fodda` namespace

2. **Remote SSE Endpoint**
   - Resolve namespace conflict with old `ai.fodda/mcp-server` entry
   - Re-add `remotes` section to server.json

3. **Community Directories**
   - Submit to Glama.ai
   - Submit to Smithery
   - Submit to PulseMCP, MCP.so, etc.

---

## Support

- **Documentation:** See README.md
- **Issues:** https://github.com/piers-fawkes/fodda-mcp/issues
- **API Docs:** https://api.fodda.ai/docs

---

## Publication History

- **v1.3.2** - 2026-02-16 - Published to MCP Registry and npm
- **v1.3.1** - 2026-02-16 - Version bump (namespace update)
- **v1.3.0** - 2026-02-16 - Initial marketplace preparation
