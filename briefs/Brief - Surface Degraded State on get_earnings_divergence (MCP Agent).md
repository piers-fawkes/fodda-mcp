# Brief: Surface Degraded State on `get_earnings_divergence`

> **Target Repo:** `Fodda MCP` (`fodda-mcp`)  
> **Owning Agent:** `mcp-agent`  
> **Date:** 2026-09-15  
> **Status:** READY FOR PICKUP  
> **Type:** Implementation  
> **Execution Handle:** `/build-from-brief briefs/Brief - Surface Degraded State on get_earnings_divergence (MCP Agent).md`

---

## 1. Context

In `Fodda API`, `GET /v1/earnings/divergence` now detects and surfaces degraded clustering state:
- When Gemini semantic clustering succeeds, `degraded: false`, `deterministic: true`, and `model_used: "gemini-2.5-flash"`.
- When Gemini is unconfigured or errors, clustering falls back to literal string matching on exact question theme text. In this degraded state, `degraded: true`, `deterministic: false`, `model_used: "literal-fallback"`, and `message` states:
  `"Clustering fell back to literal string matching and the groupings are not semantic convergence."`

In `fodda-mcp`, `get_earnings_divergence` (`src/toolHandlers.ts:3630`) passes the API response payload through as JSON text. While the JSON text contains `degraded` and `model_used`, calling LLMs (Claude, ChatGPT, Copilot Studio makers) can easily overlook JSON flags and treat literal string matches as verified cross-company causal convergence.

This brief updates `get_earnings_divergence` in `fodda-mcp` so that degraded responses are unmistakably signaled to both agent reasoning and human makers.

---

## 2. Source of Truth & Published Pricing

- **Airtable Offerings Base:** `appXUeeWN1uD9NdCW`, table `Offerings` / `Query Pricing` (`tblHsMfyoW39LqCv8`).
- **Published Price:** **$20.00** per query (40 tokens, billed as `earnings_divergence`).
- **Rule:** Every human- or maker-visible string quotes **$20**. Never output token counts or SPT phrasing.

---

## 3. What to Build

### 3A. Tool Description & Response Documentation (`src/toolHandlers.ts`)

Update the description for `get_earnings_divergence` to document the `degraded` status flag:

```typescript
'Cross-company analyst-management deflection and divergence scan ($20 per query). Surfaces where executives are deflecting, reframing, or avoiding specific topics across 517 covered consumer-sector companies from Fodda\'s earnings truth layer. Returns question themes, company counts, causal rationales, and directness breakdowns. When degraded=true, clustering fell back to literal string matching rather than semantic convergence; check degraded and model_used before asserting multi-company trends. For single-company Q&A deflections, use get_company_earnings with view=qa.'
```

### 3B. Handler Response Formatting on Degraded Clusters (`src/toolHandlers.ts`)

In `server.tool('get_earnings_divergence', ...)`:
After fetching `data = await foddaRequest(...)`:

1. Inspect the response for degradation:
   ```typescript
   const isDegraded = Boolean(data?.degraded || data?.data?.degraded || data?.model_used === 'literal-fallback' || data?.data?.model_used === 'literal-fallback');
   ```

2. When `isDegraded === true`:
   - If the response payload is wrapped for text output, prepend a concise warning header or ensure `data.warning` / top-level notice is explicit:
     ```typescript
     if (isDegraded) {
         data.warning = "DEGRADED CLUSTERING: The underlying AI clustering service fell back to literal string matching. Groupings reflect identical question theme phrasing across calls, NOT semantic convergence on a shared operational or economic mechanism.";
     }
     ```
   - This ensures LLMs ingesting the tool output immediately read the warning banner before interpreting theme groupings.

3. When `isDegraded === false`:
   - Leave output shape completely untouched.

### 3C. Tools Manifest & Version Bump

1. Regenerate `tools-manifest.json` via the build script.
2. Bump patch version in `package.json`.
3. Update `CHANGELOG.md` with verification results.

---

## 4. Definition of Done

1. `get_earnings_divergence` tool description explicitly informs callers about `degraded=true` and `model_used`.
2. Mocking or receiving a degraded response from `/v1/earnings/divergence` (`degraded: true`) produces a response containing `warning: "DEGRADED CLUSTERING..."` so downstream LLMs do not hallucinate semantic convergence.
3. Normal responses (`degraded: false`) remain identical in structure and emit no false warnings.
4. `npm run build` succeeds cleanly with 0 TypeScript errors.
5. `tools-manifest.json` reflects the updated tool description.
6. `CHANGELOG.md` is updated with manual or automated verification results.

---

## 5. Do Not

- Do not change or invent pricing ($20 published price is invariant).
- Do not mention "tokens" or "SPT" in tool descriptions or user-facing strings.
- Do not throw on degraded responses — degraded responses are valid tool outputs with explicit signaling.
- Do not modify other earnings tools (`get_company_earnings`, `get_earnings_intelligence`, `get_validated_trends`).

---

## 6. Files Expected to Change

1. `src/toolHandlers.ts`
2. `tools-manifest.json`
3. `package.json`
4. `CHANGELOG.md`
