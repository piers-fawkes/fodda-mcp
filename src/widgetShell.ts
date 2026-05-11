/**
 * Fodda Widget Shell
 * 
 * Shared wrapper for all Fodda widget responses.
 * Provides consistent branding: logo, header, footer, base CSS.
 */

// Logo (CDN-hosted — saves ~5KB per widget)
// ---------------------------------------------------------------------------
export const FODDA_LOGO_URL = 'https://cdn.jsdelivr.net/gh/piers-fawkes/fodda-demo@main/public/fodda-mini-logo-claude.png';

// Playfair Display italic — brand display font (removed, using Claude's built-in serif)
export const PLAYFAIR_LINK = '';

// ---------------------------------------------------------------------------
// Escape helper
// ---------------------------------------------------------------------------
function esc(s: string): string {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export { esc };

// ---------------------------------------------------------------------------
// Shell CSS — shared across all templates
// ---------------------------------------------------------------------------
export const FODDA_SHELL_CSS = `
:root{--p:#663399;--pl:#F5F0FF;--pm:#9B72CC;--pl-on:#663399;--font-display:var(--font-serif);}
@media(prefers-color-scheme:dark){:root{--p:#9B72CC;--pl:rgba(155,114,204,0.14);--pm:#663399;--pl-on:#C4A7E8;}}
.w{border:1px solid var(--p);border-top:3px solid var(--p);border-radius:6px;padding:1.25rem;font-family:var(--font-mono);}
.hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;padding-bottom:1rem;border-bottom:.5px solid var(--color-border-tertiary);}
.logo{display:flex;align-items:center;gap:10px;}
.logo img{height:24px;width:auto;display:block;}
.lt{font-size:13px;font-weight:500;}.ls{font-size:10px;color:var(--color-text-secondary);}
.bfolio{font-family:var(--font-mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--color-text-secondary);}
.gf{display:flex;gap:5px;flex-wrap:wrap;margin-top:1.5rem;padding-top:1rem;border-top:.5px solid var(--color-border-tertiary);align-items:center;}
.gfl{font-size:10px;color:var(--color-text-secondary);margin-right:2px;}
.gp{font-size:10px;padding:2px 9px;border-radius:20px;background:var(--pl);color:var(--pl-on);border:.5px solid var(--pm);}
.note{font-size:10px;color:var(--color-text-secondary);margin-bottom:1.25rem;}
.sl2{font-size:13px;font-weight:500;color:var(--color-text-primary);margin:1.25rem 0 8px;}.sl2:first-child{margin-top:0;}
.eyebrow{font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:6px;display:flex;gap:8px;align-items:baseline;}
.eyebrow .sep{color:var(--color-border-tertiary);}
.eyebrow.brand{color:var(--p);}
.stamp{display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:3px 8px;border:1px solid currentColor;border-radius:2px;background:transparent;color:var(--color-text-secondary);}
.stamp.brand{color:var(--p);}
.stamp.success{color:var(--color-text-success);}
.stamp.warning{color:var(--color-text-warning);}
.editors-note{background:var(--pl);border:1px solid var(--p);border-left-width:3px;border-radius:4px;padding:14px 16px;color:var(--color-text-primary);}
.editors-note::before{content:"Editor's note";display:block;font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--p);margin-bottom:6px;}
`;

// ---------------------------------------------------------------------------
// Wrap content in the Fodda branded shell
// ---------------------------------------------------------------------------
export function wrapWidget(
    subtitle: string,
    contentHtml: string,
    sources: string[],
    extraCss: string = '',
): string {
    const sourcePills = sources
        .filter(Boolean)
        .map(s => `<span class="gp">${esc(s)}</span>`)
        .join('\n    ');

    // Dossier folio: timestamp of when this widget was assembled
    const now = new Date();
    const day = now.getDate();
    const mon = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const doy = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 864e5);
    const folio = `ISSUE ${doy} · ${day} ${mon} · ${hh}:${mm}`;

    return `
<style>
${FODDA_SHELL_CSS}
${extraCss}
</style>

<div class="w">
  <div class="hd">
    <div class="logo">
      <img src="${FODDA_LOGO_URL}" alt="Fodda" style="height:24px;width:24px;"/>
      <div><div class="lt">Fodda</div><div class="ls">${esc(subtitle)}</div></div>
    </div>
    <div class="bfolio">${folio}</div>
  </div>

  ${contentHtml}

  <div class="gf">
    <span class="gfl">Sources:</span>
    ${sourcePills}
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Component guide — sent to Claude for Layer 3 (creative compositions)
// ---------------------------------------------------------------------------
export const FODDA_COMPONENT_GUIDE = `
── FODDA COMPONENT LIBRARY ──
When rendering Fodda data via show_widget, ALWAYS use the branded shell below.

DESIGN LANGUAGE: editorial briefing. Mono base, italic serif accent. No gradients on surfaces. Lines, not lifts — no box-shadows. Paper, not pillow.

SHELL: 1px border + 3px top spine. Folio timestamp top-right. 6px radius (not 12).
BRANDING: ALWAYS include the Fodda logo (<img src="${FODDA_LOGO_URL}" height="24" width="24"/>) and "Fodda" wordmark in the header. The logo+wordmark must appear in every widget — it's the first thing the user sees.

TYPOGRAPHY:
- Display (brand name, stat values, insight blocks): var(--font-display) italic 400
- Body/cards: system sans
- UI chrome/tabs/pills: var(--font-mono)

AVAILABLE COMPONENTS:
Cards: .card{border:1px solid var(--color-border-tertiary);border-radius:4px;padding:1rem 1.25rem;margin-bottom:8px;}
Eyebrow: .eyebrow{font-mono 10px 700 uppercase 0.18em tracking} — above every card title: "[GRAPH] · [STAGE]"
Stamp badges: .stamp{border:1px solid currentColor;radius:2px;9px mono uppercase} — for status/stage/category (not source pills)
Source pills: .gp{radius:20px;bg:var(--pl);color:var(--pl-on)} — keep rounded, navigational
Editors note: .editors-note{bg:var(--pl);border-left:3px solid var(--p);radius:4px} — for LLM-authored insight/analysis
Stat grid: .sg .sk — same as before. .skv{font-family:var(--font-display);font-style:italic;font-size:22px;}
Bar rows: .br .brl .brt .brf — same as before
Tabs: .tb .t — same as before

COLORS: var(--p) primary (auto-switches: #663399 light, #9B72CC dark). var(--pl) light bg (auto-switches). var(--pl-on) text-on-light-bg.
DARK MODE RULE: Always use var(--pl-on) for text on var(--pl) backgrounds. Never hardcode #663399 for dark-mode text.
RULES: <12KB HTML, no CDN (except Google Fonts), graph attribution on every card, never say "the Fodda graph"
`;

// ---------------------------------------------------------------------------
// Shell template with open slots — for non-templated responses
// Claude fills {{SUBTITLE}}, {{CONTENT}}, and {{SOURCE_PILLS}}
// ---------------------------------------------------------------------------
export function getShellTemplate(subtitle?: string, sources?: string[]): string {
    const subtitleFilled = subtitle ? esc(subtitle) : '{{SUBTITLE}}';
    const sourcePills = sources
        ? sources.filter(Boolean).map(s => `<span class="gp">${esc(s)}</span>`).join('\n    ')
        : '{{SOURCE_PILLS}}';

    const now = new Date();
    const doy = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 864e5);
    const folio = `ISSUE ${doy} \u00b7 ${now.getDate()} ${now.toLocaleString('en-US', { month: 'short' }).toUpperCase()} \u00b7 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `
<style>
${FODDA_SHELL_CSS}
{{EXTRA_CSS}}
</style>

<div class="w">
  <div class="hd">
    <div class="logo">
      <img src="${FODDA_LOGO_URL}" alt="Fodda" style="height:24px;width:24px;"/>
      <div><div class="lt">Fodda</div><div class="ls">${subtitleFilled}</div></div>
    </div>
    <div class="bfolio">${folio}</div>
  </div>

  {{CONTENT}}

  <div class="gf">
    <span class="gfl">Sources:</span>
    ${sourcePills}
  </div>
</div>`;
}
