# Brief: MCP Registry & Discovery-Surface Propagation

**To:** Agent working on Fodda's MCP registry / discovery surfaces
**Date:** 2026-07-03
**Repo:** `/Users/piersfawkes/Documents/Fodda MCP` (main checkout). Do NOT work in `.claude/worktrees/*`.
**Type:** State-of-play + fix list. Self-contained — assumes no prior context.

---

## 1. What Fodda is

Fodda is a hosted MCP server (`https://mcp.fodda.ai/mcp`) exposing expert-curated knowledge-graph, brand, research, and earnings intelligence to AI agents. Canonical registry identity: **`ai.fodda/mcp-server`** (domain-verified via fodda.ai DNS). Canonical website host is **`https://www.fodda.ai`** — the bare apex `fodda.ai/<path>` 404s on sub-paths (domain forwarding strips paths), so always use `www`.

## 2. Current live state (verified 2026-07-03)

Version is now **coherent at 1.32.0** across every surface that auto-updates:

| Surface | State | How it updates |
|---|---|---|
| Live MCP server (initialize) | v1.32.0 ✓ | Cloud Run deploy |
| npm `fodda-mcp` | v1.32.0 ✓ | `npm publish` (in publish script) |
| Official MCP registry `ai.fodda/mcp-server` | v1.32.0, active, updated 2026-07-03 ✓ | `mcp-publisher` (DNS auth) |
| A2A agent card `mcp.fodda.ai/.well-known/agent-card.json` | v1.32.0, 5 skills ✓ | served from code, updates on deploy |
| www agent card `www.fodda.ai/.well-known/agent-card.json` | now PROXIES the mcp card ✓ (fixed 2026-07-02 — was a divergent v1.0.0 card) | proxy in website server.js |

The old duplicate registry entry `io.github.piers-fawkes/fodda` is correctly **deprecated**.

## 3. Tool-count facts (important — get this right)

There are three legitimate numbers; do not "fix" one into another blindly:

- **31** = Fodda's own callable tools (the count in `tools-manifest.json`, and what the registry currently advertises). This is the honest public number.
- **47** = what an agent sees in `tools/list` on the live server. The extra **16** are `paralogy_*` tools, dynamically discovered from an **external third-party skill server** (`mcp.paralogy.ai`) that Fodda re-exposes. They are NOT Fodda's tools and are NOT in the manifest.
- **30** = a now-stale number still in some places (website was fixed to 30 before `get_company_earnings` was added, so 30 → should be 31).

**Recommendation:** advertise **31** (or "30+") everywhere. Never 47 — that counts a third party's app. Paralogy is a separate open decision (whether to collapse its fan-out to one router tool); do not let it inflate public counts.

## 4. Two open content decisions (flag to Piers, don't guess)

1. **Registry description is the SHORT one.** It currently reads: *"Expert-curated knowledge graphs for AI agents — 31 tools across 220+ graphs."* This omits the platform's actual differentiators that the A2A card already advertises: **agentic expert consults, earnings intelligence, and SPT pay-per-task (no account required).** Decide whether to swap in an offerings-rich description (source the wording from `src/a2aHandler.ts`'s AGENT_CARD.description, which is current and good). Keep it registry-length.
2. **Tool count in that same string** — if 30 was ever chosen for simplicity, confirm 31 is correct before republishing.

Both live in `fodda_mcp_server.json` `description` field. Changing them needs a registry-only republish (§6).

## 5. Surfaces that are STALE right now (the real propagation gap)

These do NOT auto-update and went stale because propagation is manual. Each needs a manual push or dashboard action:

| Surface | Problem | Fix |
|---|---|---|
| **Smithery** (`smithery.ai`, listing `fodda/fodda`) | ~18 tool descriptions behind live; pre-offerings server description. The repo's `smithery.yaml` is DEAD (declares stdio/npx; the live listing is remote HTTP) — it feeds nothing | Trigger a rescan from the Smithery dashboard (it reads the live server, so tool descriptions self-heal); update the listing blurb; fix or delete `smithery.yaml` |
| **Glama.ai** | Ancient ~v1.2-era description; tools list empty; license mis-detected | Claim the listing via Glama dashboard and refresh |
| **PulseMCP** | Lists the server as `authentication_method: "open"` and `cost: "free"` — **actively wrong** for a Bearer-auth paid server | Contact PulseMCP / correct the entry. Highest-priority external error |
| **M365 Copilot package** (`~/Documents/Fodda MSFT`) | appPackage v1.1.0 (Apr 2026): only 4 functions, "20+ graphs" copy | Regenerate appPackage from current tool set, bump version, re-upload zip (separate task) |
| **Anthropic Connectors Directory** | Submitted March 2026, not yet listed | Follow up with Anthropic |
| **Gemini Enterprise A2A agent** | Was synced from the old divergent www card | Re-sync in the Gemini Enterprise console now that www proxies the correct card |

## 6. Local manifest files & the publish mechanism

- **`fodda_mcp_server.json`** — the canonical publish source (name `ai.fodda/mcp-server`, remotes, DNS auth). This is what the registry gets.
- **`server.json`** — shipped inside the npm tarball (stdio, no remotes). Keep its version in sync.
- **`tools-manifest.json`** — regenerated from `src/toolHandlers.ts` via `scripts/generate-tools-manifest.mjs`. Do NOT hand-edit. It also seeds the API's Airtable Offerings catalog, so regenerate + re-seed when tool descriptions change.
- **`src/tools.ts`** `MCP_SERVER_VERSION` and **`package.json`** `version` — keep aligned.

**Publish script:** `scripts/publish_registry.sh`.
- Full run: `npm run build` → `npm publish` → `mcp-publisher publish` (DNS auth).
- **Registry-only (npm already current):** `./scripts/publish_registry.sh --registry` — skips npm. Use this for a description-only change since npm is already 1.32.0.
- DNS auth: `mcp-publisher login dns --domain fodda.ai --private-key $(cat ~/.fodda-mcp-dns-key)`. Key lives at `~/.fodda-mcp-dns-key` (chmod 600, outside repo). Keep exactly ONE `v=MCPv1` TXT record at the fodda.ai apex.

## 7. Root-cause fix (the actual ask)

Propagation is entirely manual and there is **no CI** (`.github/workflows` is empty). Every deploy risks re-staling these surfaces. Build a single **`scripts/sync-discovery.mjs`** that:

1. Regenerates `tools-manifest.json` from `toolHandlers.ts`.
2. Stamps ONE version (read from `package.json`; make `MCP_SERVER_VERSION` derive from it instead of being hand-edited) into `server.json` and `fodda_mcp_server.json`, deriving one from the other to end the two-file drift.
3. Emits/validates the canonical description + tool count into both manifests from a single source.
4. Runs a **live-diff step**: curl the official registry, Smithery, both agent cards, npm, PulseMCP, Glama — and print exactly which surfaces differ from local truth and which command/dashboard action fixes each.
5. Is called as a post-step in the Cloud Run deploy script so staleness is caught the moment it's created.

Push remains partly manual (mcp-publisher + npm are scripted; Smithery/Gemini/MSFT are dashboard actions) — but "what's stale where" becomes one command instead of a forensic audit.

## 8. Immediate actions (in order)

1. Decide §4 (description + count) with Piers.
2. Edit `fodda_mcp_server.json` description; run `./scripts/publish_registry.sh --registry`.
3. Trigger Smithery rescan + blurb update; delete/fix `smithery.yaml`.
4. Correct PulseMCP (free/open is misleading) and claim Glama.
5. Re-sync Gemini Enterprise from the now-correct www card.
6. Build `sync-discovery.mjs` (§7) so this never silently rots again.

**Do not** publish anything outward-facing without Piers's confirmation on the description wording — a prior release moved underneath an in-flight edit, so confirm the working tree is settled (check `git status`; another session recently added `get_company_earnings`, `pricingCache.ts`, and bumped to 1.32.0) before any publish.
