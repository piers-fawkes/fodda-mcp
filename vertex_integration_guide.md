# Fodda MCP — Gemini & Vertex AI Integration Guide

This guide describes how to integrate the Fodda MCP server into enterprise Gemini workflows via Vertex AI.

## 0. Enterprise Integration Patterns

Select the pattern that best fits your security and architecture requirements:

- **Direct API Integration**: Secure, point-to-point connection for standard RAG pipelines.
- **Private Service Connect**: Private Google Cloud connectivity for strict governance environments.
- **Model Context Protocol (MCP)**: Standardized context layer for tool-use and agentic frameworks.
- **Proxy-based Deployment**: Integrated deployment within your existing enterprise security perimeter.


## 1. Deployment (Model B: Customer-Hosted Proxy)

Enterprise clients typically prefer hosting the MCP proxy within their own GCP project to maintain control over IAM and logging.

### Prerequisites
- Google Cloud Project
- Fodda API Key

### Steps
1. **Clone the MCP repository** (or use the provided Dockerfile).
2. **Deploy to Cloud Run**:
   ```bash
   ./deploy_cloud_run.sh
   ```
3. **Set environment variables** in the Cloud Run console:
   - `FODDA_API_KEY`: Your dedicated enterprise key.
   - `FODDA_API_URL`: `https://api.fodda.ai`

## 2. Vertex AI ADK Integration

Once deployed, you can register the Fodda tools in your Vertex AI Agents or Extensions.

### Configuration Template (`vertex-ai-config.json`)
```json
{
  "name": "fodda_knowledge_graph",
  "description": "Access curated expert knowledge graphs for trends, signals, and evidence.",
  "mcp_endpoint": "https://fodda-mcp-xyz.a.run.app",
  "auth": {
    "type": "api_key",
    "location": "header",
    "name": "X-API-Key"
  }
}
```

## 3. Tool Usage Best Practices

- **Provenance First**: Always use `get_evidence` after finding a relevant trend to ensure the LLM cites sources correctly.
- **User Tracking**: Pass the `userId` in tool calls to separate usage tracking within your shared account API key.
- **Deterministic Guardrails**: The MCP server automatically enforces deterministic mode to ensure stable, tool-friendly outputs.

## 4. Security Philosophy

- **Read-Only**: Fodda MCP does not accept write commands or ingestion.
- **Stateless**: No prompt text or conversation history is stored by the proxy.
- **Auditable**: All tool call metadata is logged via standard Cloud Logging for enterprise audit trails.
