# Fodda Widget Template System (v2)

Revised based on real user queries and Claude's demonstrated visualization capabilities.

## The Insight

Claude can already produce ~14 different visualization formats via `show_widget`. Templating all of them would kill that flexibility. Instead: **branded shell + pre-rendered common paths + design system CSS for everything else**.

## Three-Layer Architecture

```
┌─────────────────────────────────────────────┐
│  Layer 3: CREATIVE                          │
│  Claude composes custom layouts              │
│  (radar, bubble, knowledge graph, etc.)      │
│  using Layer 1 CSS classes                   │
├─────────────────────────────────────────────┤
│  Layer 2: PRE-RENDERED TEMPLATES             │
│  Server builds ~90% of HTML for common paths │
│  (search results, evidence, trend brief)     │
├─────────────────────────────────────────────┤
│  Layer 1: BRANDED SHELL                      │
│  Logo, border, header, footer, base CSS      │
│  Every response wraps in this                │
└─────────────────────────────────────────────┘
```

## Layer 1: Branded Shell (`widgetShell.ts`)

Every Fodda widget response — whether pre-rendered or Claude-composed — wraps in:

```
┌─────────────────────────────────────────┐
│ 🟣 Fodda          {{SUBTITLE}}     Live │
├─────────────────────────────────────────┤
│ {{CONTENT}}                             │
├─────────────────────────────────────────┤
│ Sources: [Retail Graph] [Google Trends] │
└─────────────────────────────────────────┘
```

**Exports:**
- `FODDA_BASE_CSS` — all shared class definitions
- `FODDA_LOGO_BASE64` — inline PNG
- `wrapWidget(subtitle, contentHtml, sources[])` → complete HTML
- `FODDA_COMPONENT_GUIDE` — text description of available CSS classes for Claude

## Layer 2: Pre-Rendered Templates

Only for the **3 most common response types** where consistency matters most:

### A. Trend Card Grid (`searchTemplate.ts`)
**Trigger:** `search_graph` returns ≥1 trend
**What users ask:**
- "What are the key trends around [topic]?"
- "Show me what's happening in [topic] from the PSFK retail graph"
- "AI-powered personalization in stores"
- "counterintuitive design decisions working against convention CE brands"

**Content:** Lifecycle bar + trend cards + explore buttons
**Editorial slots:** `{{SEARCH_INSIGHT}}` — 1-2 sentence pattern interpretation
**Also returns:** Raw JSON as second text block (so Claude can still reason)

### B. Evidence Cards (`evidenceTemplate.ts`)
**Trigger:** `get_evidence` returns articles
**What users ask:**
- "Show me the evidence behind [trend name]"
- "How has the signal built up over time?"

**Content:** Evidence cards (title, excerpt, source, date, category, graph name)
**Editorial slots:** `{{EVIDENCE_NOTE}}` — synthesis of what evidence reveals

### C. Brand Intelligence (existing `brandTemplate.ts`)
**Trigger:** `brand_tracker`
**Status:** Already built ✅

## Layer 3: Claude-Composed (Design System)

For the remaining ~10 formats, Claude builds the layout itself but uses our **CSS component library** within the branded shell. Replace `FODDA_WIDGET_DESIGN_BRIEF` with a structured component guide:

### Formats Claude composes:

| Format | Triggered by | Claude builds using |
|---|---|---|
| Evidence timeline | "Show evidence as a timeline" | `.ec`, `.et`, `.ex`, `.em`, `.bd` |
| Bar chart | "Compare evidence strength as a chart" | `.br`, `.brl`, `.brt`, `.brf`, `.brc` |
| Brand network map | "Show brands across trends as a network" | SVG + `.svgt`, orbit positions |
| Interactive tabbed explorer | "Give me an explorer I can tab through" | `.tb`, `.t`, `.tc`, tab JS |
| Signal strength matrix | "Plot by signal score vs evidence count" | SVG bubble chart + `.card` |
| Combined macro dashboard | "Show trends alongside BEA/FRED data" | `.sg`, `.sk`, `.skv`, `.sks` + bar rows |
| Supplemental data chart | "Chart BEA spending over 3 years" | SVG line chart + `.note` |
| Trend brief (full) | "Tell me about [trend name]" | `.card`, `.ec`, `.br`, `.sg` |
| Radar chart | "Compare trends across dimensions" | SVG radar + `.card` |
| Interactive workspace | "Give me a filterable dashboard" | `.tb`, `.t`, `.tc`, `.card`, filter JS |
| Knowledge graph | "Show how trends connect" | SVG nodes + `.svgt` |
| Adjacent trend cards | "What's nearby [trend name]?" | `.card`, `.bdp`, `.lb` |

### Component Guide (replaces FODDA_WIDGET_DESIGN_BRIEF)

Sent to Claude with every response that isn't pre-rendered:

```
── FODDA COMPONENT LIBRARY ──
Always call wrapWidget() or use this shell structure. Your content goes in {{CONTENT}}.

CARDS: .card (12px radius, .5px border)
  .th (header flex), .tn (title 13px/500), .ta (actions), .td (description)
  .brow (badge row), .bdp (graph pill), .bd (meta badge), .lb (lifecycle)

BAR ROWS: .br container, .brl (label 120px), .brt (track), .brf (fill), .brc (value)

STAT GRID: .sg (2-col grid), .sk (stat card), .skl (label), .skv (value 17px), .sks (sub)

TABS: .tb (tab bar), .t (tab button, .t.a active), .tc (tab content, .tc.a visible)
  JS: classList toggle pattern (see brand widget)

BADGES: .lb-b (building/blue), .lb-e (emerging/green), .lb-m (mature/gray), .lb-f (fading/amber)
  .bdp (graph name pill), .bd (meta), .bd-fast (fast mover)

EVIDENCE: .ec (card), .et (title link), .ex (excerpt), .em (meta row), .cit (citation)

BUTTONS: .cp (compare pill), .cv (view pill), .nb (next button), .xb (export block)
  .btn-in (in-widget), .btn-out (out-of-widget with ↗)

NOTES: .note (10px secondary), .sl2 (section label 13px/500)

SVG: Use viewBox, .svgt font class. Colors: #663399 primary, #F5F0FF light bg, #9B72CC medium

RULES:
- <12KB HTML total
- No CDN resources except what's in the shell
- Graph attribution on every card (.bdp pill)
- Never say "the Fodda graph" — use "PSFK's Retail Graph", etc.
```

## Implementation Plan

### Phase 1: Shell extraction + search template
1. Create `widgetShell.ts` — extract CSS, logo, header, footer from `brandTemplate.ts`
2. Create `searchTemplate.ts` — trend card grid
3. Refactor `brandTemplate.ts` to import from shell
4. Update `search_graph` handler to call `renderSearchWidget()`
5. Replace `FODDA_WIDGET_DESIGN_BRIEF` with `FODDA_COMPONENT_GUIDE`
6. Deploy + test

### Phase 2: Evidence template
1. Create `evidenceTemplate.ts` — evidence cards
2. Update `get_evidence` handler
3. Deploy + test

### Phase 3: Refinement
1. Monitor which Claude-composed formats look best
2. Promote any to pre-rendered if they're common enough
3. Expand component guide based on what Claude needs

## Open Questions

1. **Should the component guide include the full CSS?** If Claude has the actual class definitions it can compose more accurately. But it burns context tokens (~2KB). Recommendation: include it — consistency is worth it.

2. **Should pre-rendered templates also return raw JSON?** Yes — Claude still needs data to write editorial slots and answer follow-ups. Return `widget_html` + `data_json` as two text blocks.

3. **Should `list_graphs` get a template?** It's the first call every session — a branded graph catalog would make a strong first impression. Add to Phase 3.

## Real User Queries → Format Mapping

These recent queries would trigger:

| Query | Format | Layer |
|---|---|---|
| "airline sustainability regenerative" | Trend card grid | **Layer 2** (search template) |
| "AI-powered personalization in stores" | Trend card grid | **Layer 2** (search template) |
| "Creator-led commerce models" | Trend card grid | **Layer 2** (search template) |
| "brand intelligence: Nike" | Brand Intelligence | **Layer 2** (brand template) |
| "Show me evidence behind [trend]" | Evidence cards | **Layer 2** (evidence template) |
| "Compare evidence strength as a chart" | Bar chart | Layer 3 (Claude composes) |
| "Show me a network map of brands" | Network map | Layer 3 (Claude composes) |
| "Plot by signal score vs evidence count" | Bubble matrix | Layer 3 (Claude composes) |
| "Show trends alongside BEA spending" | Macro dashboard | Layer 3 (Claude composes) |

Most real queries → Layer 2 (pre-rendered). Exotic queries → Layer 3 (Claude composes within shell).
