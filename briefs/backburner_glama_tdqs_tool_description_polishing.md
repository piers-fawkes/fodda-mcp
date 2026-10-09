# Backburner Brief — Glama TDQS Tool Description Polishing (MCP Agent)

**Owning repo:** `Fodda MCP`  
**Agent:** `mcp-agent`  
**Status:** Backburner / low priority (server is live, Grade A maintenance & license)  
**Date:** 2026-10-07  

---

## 1. Context

Glama's automated Tool Definition Quality Score (TDQS) evaluator reviewed `fodda-mcp` tools and identified specific areas where individual tool descriptions can be tightened for workflow context and usage guidelines.

The server is fully functional and live in the registry; this brief captures the specific description refinements for a future polish pass.

---

## 2. Target Improvements

### A. `get_evidence`
* **Issue:** Lacks explicit prerequisite context.
* **Update:** State clearly that this tool is a follow-up to `search_graph` requiring a valid `for_node_id` from previous results.

### B. `manage_scheduled_reports`
* **Issue:** High schema coverage, but the main description omits how the 6 action enums behave.
* **Update:** Add a brief summary of the action lifecycle (`create`, `list`, `get`, `update`, `pause`, `delete`) in the top-level description.

### C. `submit_mcp_source`
* **Issue:** Omits its place in the expert onboarding lifecycle.
* **Update:** Clarify its step in the onboarding sequence and distinguish it from direct file upload or standard voice study paths.

### D. `get_validated_trends`
* **Issue:** Lacks clear sibling routing against general trend search and earnings tools.
* **Update:** Add sibling routing explaining when to use `get_validated_trends` vs `search_graph` and `get_domain_intelligence`.

---

## 3. Implementation Rules

* **Zero breaking changes:** Do not delete, rename, or merge tools. Keep all parameters unchanged.
* **Source of truth:** Update both `src/toolHandlers.ts` and Airtable Offerings (`tbl93DJ627r81zKVP`) for tools managed there.
* **House rules:** No bare `\$` signs; never use internal token terms in descriptions.
