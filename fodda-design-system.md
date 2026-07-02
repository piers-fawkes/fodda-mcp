---
id: FODDA-DESIGN-001
title: Fodda Widget Design System
version: 2.0.0
compliance: RFC-2119
owner: Fodda / PSFK
created: 2026-06-08
---

# Fodda Widget Design System

> [!NOTE]
> Visual language rules for all Fodda-powered widgets rendered via `show_widget` in Claude chat. Apply these rules consistently across all output types — brand intelligence, trend research, graph exploration, and any future widget formats.

---

## 1. Brand Identity

### TOKEN: BrandColors
- Primary purple: `#663399` (Use as the single accent color across all widgets. Do NOT introduce additional accent colors).
- Purple light (bg): `#F5F0FF`
- Purple mid (border): `#9B72CC`
- Purple dark: `#4A2470`

### RECORD: LogoSpecification
- name: String — "Fodda Logo"
- url: String — `https://cdn.jsdelivr.net/gh/piers-fawkes/fodda-demo/public/fodda-mini-logo-claude.png`
- height: "24px"
- width: "auto"
- display: "block"
- fallback_html: String — Monogram fallback if image fails:
  ```html
  <div style="width: 24px; height: 24px; border-radius: 5px; background: #663399; display: flex; align-items: center; justify-content: center;">
    <span style="color: #fff; font-size: 13px; font-weight: 500; font-family: monospace;">F</span>
  </div>
  ```

---

## 2. Layout & Typography

### RECORD: OuterContainer
- border: "1.5px solid #663399"
- border_radius: "12px"
- padding: "1.25rem"
- font_family: "var(--font-mono)"
- background: "transparent"
- description: "This purple border is the primary visual signal that a widget is Fodda-powered."

### RECORD: HeaderSpecification
- left_side: Logo (24px) + Wordmark
- right_side: Live status indicator
- logo_text_style: `font-size: 13px; font-weight: 500;` ("Fodda")
- logo_sub_style: `font-size: 10px; color: var(--color-text-secondary); margin-top: 1px;` (Feature name, e.g., "Brand Intelligence")
- status_indicator_html:
  ```html
  <div style="font-size: 10px; color: var(--color-text-secondary); display: flex; align-items: center; gap: 5px;">
    <span style="width:6px; height:6px; border-radius:50%; background: var(--color-text-success); display:inline-block;"></span>
    Live
  </div>
  ```
- separator_border: `padding-bottom: 1rem; margin-bottom: 1.25rem; border-bottom: 0.5px solid var(--color-border-tertiary);`
- rule: The agent MUST NOT show graph names or data source labels in the header.

### TOKEN: TypographyScale
- All widgets MUST use monospace font as the base: `font-family: var(--font-mono);`
- Serif is used exclusively for editorial provocation / `one_liner` text: `font-family: var(--font-serif); font-size: 14px; line-height: 1.65;`

| Use | Size | Weight |
|-----|------|--------|
| Brand / section title | 22px | 500 |
| Tab labels | 12px | 400 |
| Card title | 13px | 500 |
| Body / description | 12px | 400 |
| Badge / label | 10px | 400 |
| Micro / citation | 10px | 400 |
| In-widget action button | 9px | 400 |
| Out-of-widget action button | 11px | 400 |

- rule: Never use font sizes below 9px. Never use font weight 600 or 700.

### RULE: ProvocationBlock
- The editorial opening sentence (`one_liner`) MUST appear in every brand-level widget before any tabs:
  ```css
  font-family: var(--font-serif);
  font-size: 14px;
  line-height: 1.65;
  padding: 1rem 1.25rem;
  border-left: 2px solid #663399;
  margin-bottom: 1.25rem;
  color: var(--color-text-primary);
  ```

---

## 3. Navigation & Actions

### RECORD: TabBar
- container_style: `display: flex; border-bottom: 0.5px solid var(--color-border-tertiary); margin-bottom: 1.5rem; overflow-x: auto;`
- tab_button_style: `padding: 8px 14px; font-size: 12px; font-family: var(--font-mono); cursor: pointer; border: none; border-bottom: 2px solid transparent; background: none; color: var(--color-text-secondary); white-space: nowrap; transition: color 0.15s;`
- hover_state: `color: #663399; background: #F5F0FF;`
- active_state: `color: #663399; border-bottom-color: #663399;`
- transition: Tab switching MUST use classList toggle only — no content re-rendering.

### RULE: ButtonVisualLanguage
- Fodda uses a two-mode button system:
  1. **Out-of-widget (opens in chat)**: Label MUST suffix with `↗`. Style MUST use purple-light bg, purple border, and purple text.
     ```css
     font-size: 11px; padding: 3px 10px; border-radius: 20px; background: #F5F0FF; color: #663399; border: 0.5px solid #9B72CC; cursor: pointer; font-family: var(--font-mono);
     ```
     *Hover*: `background: #663399; color: #fff; border-color: #663399;`
  2. **In-widget (stays in widget)**: Label MUST NOT contain `↗`. Style MUST use no background, muted border, and muted text.
     ```css
     font-size: 9px; padding: 2px 7px; border-radius: 20px; background: none; color: var(--color-text-secondary); border: 0.5px solid var(--color-border-tertiary); cursor: pointer; font-family: var(--font-mono);
     ```
     *Hover*: `border-color: #663399; color: #663399;`
- **Sub-tab pills** (used for List / Network toggle in Competitive tab):
  ```css
  font-size: 10px; padding: 3px 10px; border-radius: 20px; border: 0.5px solid var(--color-border-tertiary); background: var(--color-background-secondary); color: var(--color-text-secondary);
  ```
  *Active*: `background: #663399; color: #fff; border-color: #663399;`

---

## 4. Components

### RECORD: StandardCard
- background: "var(--color-background-primary)"
- border: "0.5px solid var(--color-border-tertiary)"
- border_radius: "12px"
- padding: "1rem 1.25rem"
- margin_bottom: "8px"

### RECORD: MetricCard
- background: "var(--color-background-secondary)"
- border_radius: "8px"
- padding: "10px 12px"
- label_style: "10px muted, 3px margin-bottom"
- value_style: "17px, weight 500"
- sub_style: "10px muted, 2px margin-top"

### TOKEN: BadgeColors
- Standard badge (muted): `font-size: 10px; padding: 2px 8px; border-radius: 20px; background: var(--color-background-secondary); color: var(--color-text-secondary);`
- Purple graph pill: `font-size: 10px; padding: 2px 8px; border-radius: 20px; background: #F5F0FF; color: #663399;`
- Lifecycle badges:
  - Building: bg `var(--color-background-info)`, text `var(--color-text-info)`
  - Emerging: bg `var(--color-background-success)`, text `var(--color-text-success)`
  - Mature: bg `var(--color-background-secondary)`, text `var(--color-text-secondary)`
  - Fading: bg `var(--color-background-warning)`, text `var(--color-text-warning)`
- Evidence category badges:
  - Case Study: bg `var(--color-background-info)`, text `var(--color-text-info)`
  - Signal: bg `#F5F0FF`, text `#663399`
  - Metric: bg `var(--color-background-success)`, text `var(--color-text-success)`
  - Quote: bg `var(--color-background-warning)`, text `var(--color-text-warning)`
  - Interpretation: bg `var(--color-background-secondary)`, text `var(--color-text-secondary)`

### TOKEN: CompetitiveNetworkColors
- Brand center node: fill `#F5F0FF`, stroke `#663399`, stroke-width `2px`, radius `30–34px`
- Orbiting nodes:
  - Direct / Heritage / Sibling: fill `#FFF0E0`, stroke `#D97B2B`
  - Premium challenger: fill `#E6F1FB`, stroke `#2E6BE5`
  - Co-creation / Tech partner: fill `#EAF3DE`, stroke `#3A8F5C`
  - Culture collaborator: fill `#FBEAF0`, stroke `#C94F7A`
  - Crossover / Category shadow: fill `#EEEDFE`, stroke `#7C6AB5`

---

## 5. Visualizations

### RECORD: Sparklines
- view_box: "0 0 300 72"
- width: "100%"
- height: "72px"
- line_style: "color #663399, stroke-width 1.5px, stroke-linejoin round, stroke-linecap round"
- area_fill: "gradient from rgba(102,51,153,0.12) to rgba(102,51,153,0) top-to-bottom"
- axis_line: "y=66, color var(--color-border-tertiary), 0.5px"
- axis_labels: "Q3 '25 · Q4 '25 · Q1 '26, font-size 7px, monospace, muted"
- annotation: "7px, #663399, right-aligned at peak or current"
- rule: Inject on demand only — never pre-render in hidden DOM.

### RECORD: GoogleTrendsChart
- view_box: "0 0 300 96"
- width: "100%"
- height: "96px"
- rule: X-axis at y=88. Area fill with gradient. Annotations at peak and latest. Same colors as sparkline. Caption (10px muted) placed immediately below.

### RECORD: BarCharts
- Used for: Wikipedia, geographic distribution, industry presence.
- bar_row_style: `display: flex; align-items: center; gap: 8px; margin-bottom: 5px; font-size: 12px;`
- bar_label_style: `width: 120px; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;`
- bar_track_style: `flex: 1; height: 4px; background: var(--color-background-secondary); border-radius: 3px; overflow: hidden;`
- bar_fill_style: `height: 100%; background: #663399; border-radius: 3px;`
- bar_count_style: `min-width: 44px; text-align: right; color: var(--color-text-secondary); font-size: 11px;`

### RECORD: FooterSpecification
- container_style: `display: flex; gap: 5px; flex-wrap: wrap; margin-top: 1.5rem; padding-top: 1rem; border-top: 0.5px solid var(--color-border-tertiary); align-items: center;`
- label_style: "10px muted, 2px right margin"
- pill_style: "purple-light style"
- contents: All graphs used + Google Trends + Wikipedia + Amazon.

---

## 6. Constraints

### RULE: HoverStates
- All interactive elements MUST use `transition: 0.15s ease` on `background`, `color`, and `border-color`.
- Tab -> Purple text + purple-light bg fill
- Out-of-widget button -> Purple fill + white text
- In-widget button -> Purple border + purple text
- Suggested next / export -> Purple-light bg + purple-mid border
- Competitor View -> Purple fill + white text

### RULE: DesignPerformance
- Total widget HTML target MUST be **under 12KB**.
- No inline `onclick` anywhere — use `addEventListener` or `data-p` delegated listener.
- Sparklines and on-demand content: **inject only when triggered**, never pre-render.
- Tab switching: `classList` toggle only.
- No external scripts or CDN imports except the Fodda logo.
- Do NOT attempt to render Amazon product images (Amazon CDN blocked).

### RULE: VisualRestrictions
- The agent MUST NOT show:
  - Evidence/trend/graph counts as standalone metrics.
  - Evidence by type breakdowns.
  - Industry presence bars.
  - Thin coverage or data quality warnings.
  - Source/publication names in evidence badge rows (category badge only).
  - Graph names in the widget header.
  - "The Fodda graph" (always attribute to named graph authors).

### RULE: GraphAttribution
- Every trend card and evidence card MUST carry the `graphName` field from its originating `search_graph` row.
- Use: `"PSFK's Retail Graph"`, `"PSFK's Sports Graph"`, `"Ezra Eeman's Wayfinder Graph"`.
- Do NOT use: `"the Fodda graph"`, `"psfk"`, `"retail"`, `"sports"`.
