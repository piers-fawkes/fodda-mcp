---
description: Update CHANGELOG.md after making code changes to the Fodda MCP codebase
---

# Update Changelog Workflow

**This workflow MUST be followed whenever you make meaningful changes to the Fodda MCP codebase.** After completing any task that modifies source code, configuration, documentation, or project structure, update `CHANGELOG.md` before considering the task complete.

## When to Update

You MUST update the changelog when any of the following occur:

- **New features** are added (tools, endpoints, transports, middleware)
- **Bug fixes** are applied to existing functionality
- **Breaking changes** are introduced (API contract, config env vars, transport protocols)
- **Security improvements** are made (auth, rate limiting, HMAC, input validation)
- **Dependencies** are added, removed, or upgraded in `package.json`
- **Configuration** changes (new env vars, changed defaults, `server.json` schema updates)
- **Documentation** additions or significant rewrites (`README.md`, setup guides)
- **Deprecations** of existing features or APIs
- **Removals** of previously deprecated features

You do NOT need to update the changelog for:
- Trivial whitespace or formatting-only changes
- Adding comments to code without functional changes
- Changes to `.gitignore`, `.dockerignore`, or similar metadata files

## Step 1: Review what changed

Before writing the changelog entry, review the changes you just made. Summarise them mentally under the [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) categories:

| Category      | Use when…                                              |
|---------------|--------------------------------------------------------|
| **Added**     | New feature, endpoint, tool, file, or capability       |
| **Changed**   | Modification of existing behaviour or interface        |
| **Deprecated**| Feature marked for future removal                      |
| **Removed**   | Previously deprecated feature is deleted               |
| **Fixed**     | Bug fix                                                |
| **Security**  | Vulnerability patch or security hardening              |

## Step 2: Open the changelog

Open `CHANGELOG.md` at the project root:

```
/Users/piersfawkes/Documents/Fodda MCP/CHANGELOG.md
```

## Step 3: Add entries under `[Unreleased]`

Insert your entries under the `## [Unreleased]` section at the top of the file. Use the appropriate sub-heading (`### Added`, `### Changed`, etc.) and write each entry as a bullet point.

**Formatting rules:**
- Start each bullet with `- ` (dash + space).
- Use **bold** for the feature/component name when helpful, e.g. `- **Rate Limiter**: Increased default from 60 to 120 req/min.`
- Reference affected files in backticks when it aids clarity, e.g. `src/tools.ts`.
- Keep entries concise but specific — someone reading the changelog should understand *what* changed and *why* without reading the diff.
- If the change is user-facing (affects tool behaviour, API contract, or config), prefer the user's perspective: "Added `get_label_values` tool" rather than "Added handler case in switch statement".

**Example:**

```markdown
## [Unreleased]

### Added
- **`get_label_values` tool**: Returns all distinct values for a given node label in a graph.

### Fixed
- `search_graph` no longer returns duplicate nodes when `use_semantic` is true.

### Security
- Upgraded `axios` to 1.14.0 to address CVE-2026-XXXXX.
```

## Step 4: Bump to a release version (only when publishing)

When preparing a release (e.g. before running `/publish-to-mcp-registry`):

1. Replace `## [Unreleased]` with `## [X.Y.Z] - YYYY-MM-DD` using today's date.
2. Add a fresh empty `## [Unreleased]` section above the new release heading.
3. Add a compare link at the bottom of the file:
   ```
   [X.Y.Z]: https://github.com/piers-fawkes/fodda-mcp/compare/vPREVIOUS...vX.Y.Z
   ```
4. Update the `[Unreleased]` link to compare from the new tag:
   ```
   [Unreleased]: https://github.com/piers-fawkes/fodda-mcp/compare/vX.Y.Z...HEAD
   ```
5. Update `version` in `package.json` and `server.json` to match.

## Step 5: Verify formatting

After editing, quickly scan the file to ensure:
- The `## [Unreleased]` section exists at the top (below the header).
- Entries are under the correct sub-heading.
- No duplicate entries.
- Markdown renders correctly (no broken links or formatting).

## Reminder

> **Every code-changing task should end with a changelog update.** If you completed a task and didn't touch `CHANGELOG.md`, go back and add an entry now. This is the single source of truth for what has changed in the Fodda MCP server, and it keeps the human operator informed.
