# Changelog

All notable changes to the Fodda MCP server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-02-14

### Added
- simulated Gemini tool invocation mode (`gemini_echo`) for testing without upstream API calls.
- `psfk_overview` tool for generating macro overviews.
- System validation endpoint `/v1/system/validation`.

### Changed
- Updated `@modelcontextprotocol/sdk` to `^1.26.0`.
- Enforced API Key validation for all tool calls.

## [1.0.0] - 2026-01-01

### Added
- Initial release of Fodda MCP Server.
- Core graph tools: `search_graph`, `get_neighbors`, `get_evidence`, `get_node`.
