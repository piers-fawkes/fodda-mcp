
# Fodda MCP Marketplace Readiness Guide
_Last updated: 2026-02-16_

This document provides background research on Model Context Protocol (MCP) marketplaces, directories, and developer hubs where Fodda — or individual datasets such as the PSFK Retail Graph — could be listed.

This guide focuses on:

- Where Fodda MCP servers can be listed
- Whether listings are server-level or tool-level
- Discovery and onboarding mechanics
- Required manifests and metadata
- Schema expectations
- Spec references and technical links

⚠️ Billing considerations intentionally excluded from this document.

---

# 1. Official MCP Registry (Anthropic)

## Overview
The official Model Context Protocol Registry is the canonical metadata registry for publicly accessible MCP servers.

It is vendor-neutral and supports discovery by MCP-compatible clients including:
- Claude Code
- Gemini CLI
- Custom agent frameworks

Listings are server-level (not individual tools).

## Listing Model
- Register entire MCP server
- Tools are discovered dynamically via `/mcp/tools`
- Private servers are not supported

## Publishing Process
- Package server (npm / PyPI / Docker)
- Create `server.json` manifest
- Use `mcp-publisher` CLI
- Verify namespace via GitHub or DNS

## Required Metadata Example

{
  "name": "io.fodda.psfk-retail",
  "version": "1.2.0",
  "description": "PSFK Retail Knowledge Graph via MCP",
  "repository": "https://github.com/fodda/mcp-server",
  "transport": "sse",
  "authentication": {
    "type": "bearer"
  }
}

## Spec Links
MCP Specification:
https://modelcontextprotocol.io/specification

MCP Registry Docs:
https://modelcontextprotocol.io/registry

MCP Publisher CLI:
https://github.com/modelcontextprotocol/registry

---

# 2. Google Gemini / Vertex AI (MCP Integration)

## Overview
Gemini CLI and Vertex AI Agent Development Kit (ADK) support MCP tool integrations.

There is currently no centralized Gemini MCP marketplace UI — integration is configuration-driven.

## Listing Model
- Full MCP server registration
- Tools discovered dynamically

## Integration Pattern

{
  "tools": [
    {
      "type": "mcp",
      "name": "fodda",
      "url": "https://mcp.fodda.ai/messages",
      "headers": {
        "Authorization": "Bearer <API_KEY>"
      }
    }
  ]
}

## Documentation Links
Gemini CLI:
https://ai.google.dev/gemini-api/docs/cli

Vertex AI Agent Development Kit:
https://cloud.google.com/vertex-ai/docs/agents

---

# 3. Anthropic Claude (Claude Code + SDK)

## Overview
Claude Code supports MCP server integrations via CLI configuration.

## CLI Example

claude mcp add --transport http fodda https://mcp.fodda.ai/messages

## Documentation Links
Claude Code MCP Integration:
https://docs.anthropic.com/claude/docs/mcp

---

# 4. Hugging Face Hub (Tool-Level Publishing)

## Overview
Hugging Face supports publishing individual tools as standalone repositories (Spaces).

## Example tool_config.json

{
  "name": "psfk_retail_search",
  "description": "Search PSFK Retail knowledge graph",
  "entry_point": "tool.py"
}

## Documentation Links
Transformers Agents Tools:
https://huggingface.co/docs/transformers/main/en/tools

Hugging Face Hub:
https://huggingface.co/spaces

---

# 5. Glama.ai (Hosted MCP Marketplace)

## Overview
Glama is a hosted MCP marketplace and infrastructure platform.

## Documentation
https://glama.ai
https://glama.ai/docs

---

# 6. Smithery (MCP Hosting + Install Platform)

## Overview
Smithery provides one-click install and cloud-hosted MCP infrastructure.

## Documentation
https://smithery.ai
https://docs.smithery.ai

---

# 7. Community Directories

- PulseMCP — https://pulsemcp.com
- MCP.so — https://mcp.so
- All MCP Servers — https://allmcpservers.com
- MCP Catalog — https://mcpcatalog.io

---

# Key Technical Requirements for Market Readiness

Before publishing Fodda MCP:

1. Stable `/mcp/tools` endpoint
2. Versioned tool schemas
3. Optional `outputSchema` support
4. Public `server.json`
5. Namespaced server name
6. Transport clarity (SSE vs HTTP)
7. Health endpoint (`/health`)
8. Clean README with install instructions

---

# Summary

Primary publishing path:
→ Official MCP Registry

Secondary distribution:
→ Gemini / Vertex quickstart
→ Claude CLI integration
→ Glama / Smithery
→ Hugging Face (tool-level variant)
→ Community directories

