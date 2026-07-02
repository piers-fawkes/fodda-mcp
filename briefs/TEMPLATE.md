# Brief: [Agent / Feature Name]

> **Type:** `[ ] Architecture Handoff` | `[ ] Agent Task` | `[ ] Cross-Cutting Issue` | `[ ] Bug Fix`
> **Priority:** `[ ] P0 — Blocker` | `[ ] P1 — High` | `[ ] P2 — Normal`
> **Agent(s):** e.g. MCP agent, API agent, App agent, Manual

---

## 1. Objective
*What does this agent/feature do and why does it need to exist? One paragraph max.*

## 2. Persona & System Instructions
*Link to the persona file, or state "N/A — no system prompt change":*
- Persona file: `.agents/personas/<name>.md`

## 3. Tools Required
*List every tool this agent needs access to and the safety level for each:*

| Tool | Safety Level | Reason |
|:-----|:-------------|:--------|
| `view_file` | allow | Read source files |
| `run_command` | ask_user | Shell execution requires confirmation |

## 4. Safety Policy
*Copy the applicable template and fill in specifics. All production agents start from deny_all.*

```python
from google.antigravity.hooks import policy

policies = [
    policy.deny_all(),
    policy.allow("view_file"),
    # policy.allow("mcp_fodda_mcp_search_graph"),  # MCP tools must be explicitly named
    # policy.ask_user("run_command", handler=approval_handler),
]
```

## 5. Testing Plan
*How do you verify the agent behaves correctly and safely?*

- [ ] Schema test: structured JSON output matches expected shape
- [ ] Golden-set test: known query → known output (no regression)
- [ ] Anti-double-billing: internal API calls use `FODDA_INTERNAL_API_KEY`
- [ ] Edge case: [describe specific edge case to test]

## 6. Context & Implementation Notes
*Technical context, relevant files, code snippets, env vars needed. Extend freely.*

**Relevant files:**
- `src/index.ts` — central routing
- `src/toolHandlers.ts` — tool registration

**Environment variables needed:**
- `GEMINI_API_KEY` — already in Secret Manager
- `NEW_SECRET` — needs to be added (update `.env.example` and `deploy_cloud_run.sh`)

**Key constraints / gotchas:**
- 

## 7. CHANGELOG Entry
*Draft the entry to add to `CHANGELOG.md` when this ships:*

```
### Added
- [Brief name]: [one-line description of what changed]
```
