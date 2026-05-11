# Fodda Widget Design System

> Visual language rules for all Fodda-powered widgets rendered via `show_widget` in Claude chat. Apply these rules consistently across all output types — brand intelligence, trend research, graph exploration, and any future widget formats.

---

## Brand Identity

### Logo

```
URL:      https://cdn.jsdelivr.net/gh/piers-fawkes/fodda-demo/public/fodda-mini-logo-claude.png
Height:   24px
Width:    auto (do not constrain)
Display:  block
```

**Fallback** — if image fails to load, render an inline monogram:

```html
<div style="
  width: 24px;
  height: 24px;
  border-radius: 5px;
  background: #663399;
  display: flex;
  align-items: center;
  justify-content: center;
">
  <span style="color: #fff; font-size: 13px; font-weight: 500; font-family: monospace;">F</span>
</div>
```

### Brand colour

```
Primary purple:      #663399
Purple light (bg):   #F5F0FF
Purple mid (border): #9B72CC
Purple dark:         #4A2470
```

Always use `#663399` as the single accent colour across all widgets. Do not introduce additional accent colours.

---

## Outer Container

Every Fodda widget is wrapped in a container with a purple border:

```css
border:        1.5px solid #663399;
border-radius: var(--border-radius-lg);   /* 12px */
padding:       1.25rem;
font-family:   var(--font-mono);
background:    transparent;
```

This purple border is the primary visual signal that a widget is Fodda-powered.

---

## Header

Every widget begins with a consistent header row:

```
Left side:   Fodda logo (24px) + wordmark
Right side:  Live status indicator
```

**Wordmark:**
```css
.logo-text { font-size: 13px; font-weight: 500; }
.logo-sub  { font-size: 10px; color: var(--color-text-secondary); margin-top: 1px; }
```

"Fodda" in `.logo-text`, feature name (e.g. "Brand Intelligence", "Trend Research") in `.logo-sub`.

**Status indicator:**
```html
<div style="font-size: 10px; color: var(--color-text-secondary); display: flex; align-items: center; gap: 5px;">
  <span style="width:6px; height:6px; border-radius:50%; background: var(--color-text-success); display:inline-block;"></span>
  Live
</div>
```

Show "Live" only. Do not show graph names or data source labels in the header.

Header is separated from content by a bottom border:
```css
padding-bottom: 1rem;
margin-bottom:  1.25rem;
border-bottom:  0.5px solid var(--color-border-tertiary);
```

---

## Typography

All widgets use monospace font as the base:
```css
font-family: var(--font-mono);
```

Serif is used exclusively for editorial provocation / `one_liner` text:
```css
font-family: var(--font-serif);
font-size:   14px;
line-height: 1.65;
```

### Type scale

| Use | Size | Weight |
|---|---|---|
| Brand / section title | 22px | 500 |
| Tab labels | 12px | 400 |
| Card title | 13px | 500 |
| Body / description | 12px | 400 |
| Badge / label | 10px | 400 |
| Micro / citation | 10px | 400 |
| In-widget action button | 9px | 400 |
| Out-of-widget action button | 11px | 400 |

Never use font sizes below 9px. Never use font weight 600 or 700.

---

## Provocation Block

The editorial opening sentence appears in every brand-level widget, before any tabs or content:

```css
font-family: var(--font-serif);
font-size:   14px;
line-height: 1.65;
padding:     1rem 1.25rem;
border-left: 2px solid #663399;
margin-bottom: 1.25rem;
color: var(--color-text-primary);
```

This is always the `one_liner` field — a sharp claim about market or cultural direction, never a data summary.

---

## Tab Bar

```css
display:       flex;
border-bottom: 0.5px solid var(--color-border-tertiary);
margin-bottom: 1.5rem;
overflow-x:    auto;
```

**Tab button:**
```css
padding:       8px 14px;
font-size:     12px;
font-family:   var(--font-mono);
cursor:        pointer;
border:        none;
border-bottom: 2px solid transparent;
background:    none;
color:         var(--color-text-secondary);
white-space:   nowrap;
transition:    color 0.15s;
```

**Hover state:**
```css
color:      #663399;
background: #F5F0FF;
```

**Active state:**
```css
color:              #663399;
border-bottom-color: #663399;
```

Tab switching uses `classList` toggle only — no re-rendering of content.

---

## Button Visual Language

Fodda uses a two-mode button system. Users can distinguish in-widget from out-of-widget actions at a glance.

### Rule

| Mode | Indicator | Style |
|---|---|---|
| Out-of-widget (opens in chat) | **↗ suffix** | Purple-light bg, purple border, purple text |
| In-widget (stays in widget) | **No ↗** | No background, muted border, muted text |

### Out-of-widget button

Used for: Compare strip, Explore buttons, competitor View buttons, suggested next prompts, export buttons, Search button.

```css
font-size:     11px;   /* 9px for small variants on trend cards */
padding:       3px 10px;
border-radius: 20px;
background:    #F5F0FF;
color:         #663399;
border:        0.5px solid #9B72CC;
cursor:        pointer;
font-family:   var(--font-mono);
transition:    background 0.15s, color 0.15s, border-color 0.15s;
```

**Hover:**
```css
background:   #663399;
color:        #fff;
border-color: #663399;
```

Always include ↗ in the button label text. Example: `Explore ↗`, `View ↗`, `Search ↗`, `Adidas ↗`.

### In-widget button

Used for: Viz toggle, List/Network sub-tabs (pill variant), any action that reveals content inside the widget.

```css
font-size:     9px;    /* 10px for sub-tabs */
padding:       2px 7px;
border-radius: 20px;
background:    none;
color:         var(--color-text-secondary);
border:        0.5px solid var(--color-border-tertiary);
cursor:        pointer;
font-family:   var(--font-mono);
transition:    border-color 0.15s, color 0.15s;
```

**Hover:**
```css
border-color: #663399;
color:        #663399;
```

Never add ↗ to in-widget buttons.

### Sub-tab pills

Used for List / Network toggle within Competitive tab:

```css
font-size:     10px;
padding:       3px 10px;
border-radius: 20px;
border:        0.5px solid var(--color-border-tertiary);
background:    var(--color-background-secondary);
color:         var(--color-text-secondary);
transition:    background 0.15s;
```

**Active:**
```css
background:   #663399;
color:        #fff;
border-color: #663399;
```

---

## Cards

### Standard card

```css
background:    var(--color-background-primary);
border:        0.5px solid var(--color-border-tertiary);
border-radius: var(--border-radius-lg);   /* 12px */
padding:       1rem 1.25rem;
margin-bottom: 8px;
```

### Metric / stat card

```css
background:    var(--color-background-secondary);
border-radius: var(--border-radius-md);   /* 8px */
padding:       10px 12px;
```

Label: 10px muted, 3px margin-bottom
Value: 17px, weight 500
Sub: 10px muted, 2px margin-top

---

## Badges and Pills

### Standard badge (muted)

```css
font-size:     10px;
padding:       2px 8px;
border-radius: 20px;
background:    var(--color-background-secondary);
color:         var(--color-text-secondary);
```

### Purple graph name pill

```css
font-size:     10px;
padding:       2px 8px;
border-radius: 20px;
background:    #F5F0FF;
color:         #663399;
```

### Lifecycle badges

| State | Background | Text |
|---|---|---|
| Building | `var(--color-background-info)` | `var(--color-text-info)` |
| Emerging | `var(--color-background-success)` | `var(--color-text-success)` |
| Mature | `var(--color-background-secondary)` | `var(--color-text-secondary)` |
| Fading | `var(--color-background-warning)` | `var(--color-text-warning)` |

### Evidence category badges

| Category | Background | Text |
|---|---|---|
| Case Study | `var(--color-background-info)` | `var(--color-text-info)` |
| Signal | `#F5F0FF` | `#663399` |
| Metric | `var(--color-background-success)` | `var(--color-text-success)` |
| Quote | `var(--color-background-warning)` | `var(--color-text-warning)` |
| Interpretation | `var(--color-background-secondary)` | `var(--color-text-secondary)` |

---

## Competitive Network Colors

From Fodda's `theme.clusters.light` palette. Use these cluster colors consistently across network diagrams and pressure type badges:

| Pressure Type | Cluster | Fill | Stroke |
|---|---|---|---|
| Direct / Heritage / Sibling | physicalSpaces | `#FFF0E0` | `#D97B2B` |
| Premium challenger | techAI | `#E6F1FB` | `#2E6BE5` |
| Co-creation / Tech partner | sustainability | `#EAF3DE` | `#3A8F5C` |
| Culture collaborator | cultureSociety | `#FBEAF0` | `#C94F7A` |
| Crossover / Category shadow | commerceEcon | `#EEEDFE` | `#7C6AB5` |

Brand center node:
```
fill:   #F5F0FF
stroke: #663399
stroke-width: 2px
radius: 30–34px
```

---

## Sparklines

Inject on demand only — never pre-render in hidden DOM.

```
viewBox:  0 0 300 72
width:    100%
height:   72px
```

Line color: `#663399`, stroke-width: 1.5px, stroke-linejoin: round, stroke-linecap: round

Area fill: gradient from `rgba(102,51,153,0.12)` to `rgba(102,51,153,0)` top-to-bottom

X-axis line at y=66, color: `var(--color-border-tertiary)`, 0.5px

X-axis labels: `Q3 '25` · `Q4 '25` · `Q1 '26`, font-size 7px, monospace, muted

Annotation text: 7px, `#663399`, right-aligned at peak or current

---

## Google Trends Chart

```
viewBox:  0 0 300 96
width:    100%
height:   96px
```

X-axis at y=88. Area fill with gradient. Annotations at peak and latest value. Same line/fill colors as sparklines.

Caption style: 10px muted, placed immediately below the SVG.

---

## Bar Charts

Used for Wikipedia, geographic spread, industry presence:

```css
.bar-row {
  display:       flex;
  align-items:   center;
  gap:           8px;
  margin-bottom: 5px;
  font-size:     12px;
}

.bar-label {
  width:          120px;
  color:          var(--color-text-secondary);
  white-space:    nowrap;
  overflow:       hidden;
  text-overflow:  ellipsis;
  flex-shrink:    0;
}

.bar-track {
  flex:            1;
  height:          4px;
  background:      var(--color-background-secondary);
  border-radius:   3px;
  overflow:        hidden;
}

.bar-fill {
  height:          100%;
  background:      #663399;
  border-radius:   3px;
}

.bar-count {
  min-width:    44px;
  text-align:   right;
  color:        var(--color-text-secondary);
  font-size:    11px;
}
```

---

## Footer

Every widget ends with a source attribution row:

```css
display:       flex;
gap:           5px;
flex-wrap:     wrap;
margin-top:    1.5rem;
padding-top:   1rem;
border-top:    0.5px solid var(--color-border-tertiary);
align-items:   center;
```

**"Sources:" label:** 10px muted, 2px right margin

**Source pill:** purple-light style (same as graph name pill)

Include all graphs used by name + Google Trends + Wikipedia + Amazon where applicable.

---

## Hover States — all interactive elements

All interactive elements use `transition: 0.15s ease` on `background`, `color`, and `border-color`.

| Element | Hover effect |
|---|---|
| Tab | Purple text + purple-light bg fill |
| Out-of-widget button | Purple fill + white text |
| In-widget button | Purple border + purple text (no fill) |
| Suggested next / export buttons | Purple-light bg + purple-mid border |
| Competitor View buttons | Purple fill + white text |

---

## Performance Rules

- Total widget HTML target: **under 12KB**
- No inline `onclick` anywhere — use `addEventListener` or `data-p` attribute pattern with delegated listener
- Sparklines and on-demand content: **inject only when triggered**, never pre-render in hidden DOM
- Tab switching: `classList` toggle only, no content re-rendering
- No external scripts, no CDN imports except the Fodda logo image
- Amazon product images: do not attempt to render (Amazon CDN blocked by widget sandbox — no error message)
- All transitions: CSS only (`transition` property), no JS animation libraries

---

## What NOT to Show

Across all Fodda widgets:

- Evidence counts as standalone metrics
- Trend counts as standalone metrics
- Graph counts as standalone metrics
- Evidence by type breakdowns
- Industry presence bars
- Any "thin coverage" or data quality warnings
- Source/publication names in evidence badge rows (category badge only)
- Graph names in the widget header (header shows "Live" only)
- "The Fodda graph" — always attribute to named graph authors

---

## Graph Attribution Rule

Every trend card and evidence card must carry the `graphName` field from its originating `search_graph` row. This is the human-readable, author-attributed name.

Use: `"PSFK's Retail Graph"`, `"PSFK's Sports Graph"`, `"Ezra Eeman's Wayfinder Graph"`

Never use: `"the Fodda graph"`, `"psfk"`, `"retail"`, `"sports"` as display names.

Fodda is the platform. The graphs have named curators.
