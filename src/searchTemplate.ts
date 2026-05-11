/**
 * Search Results Widget Template
 * 
 * Server-side rendering for search_graph responses.
 * Tabs: Trends (with optional scrubber), Companies, Market, Analysis
 * Returns near-complete HTML with editorial slots for Claude.
 */

import { wrapWidget, esc } from './widgetShell.js';
import { fillSearchInsight, fillAnalysis, replaceSlots, type TrendSummary } from './editorialFill.js';

// ---------------------------------------------------------------------------
// Temporal detection — decides scrubber vs simple grid
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Lifecycle stage calculation
// ---------------------------------------------------------------------------
interface TrendRow {
    trendName?: string;
    name?: string;
    label?: string;
    signal_score?: number;
    evidenceCount?: number;
    evidence_count?: number;
    brandNames?: string | string[];
    Brand?: string | string[];
    firstSeen?: string;
    lastSeen?: string;
    trendDescription?: string;
    description?: string;
    graphId?: string;
    graphName?: string;
    trendLifecycle?: string;
    momentum?: string;
    fastMover?: boolean;
    _use_this_graphId?: string;
}

function computeStage(t: TrendRow): string {
    const now = Date.now();
    const signal = t.signal_score || 0;
    const evCount = t.evidenceCount || t.evidence_count || 0;
    const firstMs = t.firstSeen ? new Date(t.firstSeen).getTime() : now;
    const lastMs = t.lastSeen ? new Date(t.lastSeen).getTime() : now;
    const daysSinceLast = (now - lastMs) / 864e5;
    const ageDays = (now - firstMs) / 864e5;

    if (signal >= 70 && evCount >= 12 && daysSinceLast < 90) return 'established';
    if (signal >= 70 && daysSinceLast >= 90) return 'plateauing';
    if (signal < 45 && ageDays > 120) return 'plateauing';
    if (signal >= 45 || evCount >= 8) return 'building';
    return 'emerging';
}

function normalizeBrands(raw: string | string[] | undefined): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.slice(0, 4);
    return raw.split('|').map(b => b.trim()).filter(Boolean).slice(0, 4);
}

// ---------------------------------------------------------------------------
// Build Google Trends section
// ---------------------------------------------------------------------------
function buildGoogleTrendsHtml(gt: any, query: string): string {
    if (!gt) return '';
    const snap = gt?.snapshot || gt;
    const interest = snap?.interest_over_time;
    if (!interest?.timeline_data?.length) return '';

    const points = interest.timeline_data;
    const latest = points[points.length - 1];
    const latestVal = latest?.values?.[0]?.extracted_value ?? latest?.value ?? 0;
    const peak = Math.max(...points.map((p: any) => p?.values?.[0]?.extracted_value ?? p?.value ?? 0));
    const peakPoint = points.find((p: any) => (p?.values?.[0]?.extracted_value ?? p?.value ?? 0) === peak);
    const peakDate = peakPoint?.date || '';
    const direction = latestVal > (points[Math.max(0, points.length - 4)]?.values?.[0]?.extracted_value ?? 0) ? '↑ rising' : '↓ declining';

    // Build mini sparkline
    const vals = points.map((p: any) => p?.values?.[0]?.extracted_value ?? p?.value ?? 0);
    const max = Math.max(...vals, 1);
    const svgW = 200;
    const svgH = 32;
    const pathPoints = vals.map((v: number, i: number) =>
        `${(i / (vals.length - 1)) * svgW},${svgH - (v / max) * svgH}`
    ).join(' ');

    return `
<div class="sl2">Search interest — "${esc(query)}"</div>
<div style="display:flex;align-items:center;gap:16px;margin-bottom:8px;">
  <svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="flex-shrink:0;">
    <polyline points="${pathPoints}" fill="none" stroke="var(--p)" stroke-width="1.5"/>
  </svg>
  <div style="font-size:11px;color:var(--color-text-secondary);line-height:1.5;">
    <div>Now <strong>${latestVal}</strong> · Peak ${peak} (${esc(peakDate)})</div>
    <div>${direction}</div>
  </div>
</div>
<p class="fnote">Relative interest (0–100). Source: Google Trends.</p>`;
}

// ---------------------------------------------------------------------------
// Build Census Retail section  
// ---------------------------------------------------------------------------
function buildCensusHtml(census: any): string {
    if (!census) return '';
    const snap = census?.snapshot || census;
    const total = snap?.total_retail;
    const subs = snap?.subcategories || [];
    if (!total && !subs.length) return '';

    const fmtB = (v: number) => `$${(v / 1e9).toFixed(1)}B`;
    const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

    let html = `<div class="sl2">US retail sales — Census Bureau</div><div class="sg">`;

    if (total) {
        html += `<div class="sk"><div class="skl">Total US retail</div><div class="skv">${fmtB(total.value || 0)}</div><div class="sks">${fmtPct(total.mom_change || 0)} MoM</div></div>`;
    }

    // Show first subcategory
    if (subs.length > 0) {
        const sub = subs[0];
        html += `<div class="sk"><div class="skl">${esc(sub.name || '')}</div><div class="skv">${fmtB(sub.value || 0)}</div><div class="sks">${fmtPct(sub.mom_change || 0)} MoM</div></div>`;
    }

    html += `</div>`;
    return html;
}

// ---------------------------------------------------------------------------
// Build Companies section (brand frequency bars)
// ---------------------------------------------------------------------------
function buildCompaniesHtml(rows: any[]): string {
    const brandCounts: Record<string, number> = {};
    rows.forEach(r => {
        const brands = normalizeBrands(r.brandNames || r.Brand);
        brands.forEach(b => {
            brandCounts[b] = (brandCounts[b] || 0) + 1;
        });
    });

    const sorted = Object.entries(brandCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    if (sorted.length === 0) return '<p class="fnote">No brand data available for these trends.</p>';

    return `<div class="co-grid">${sorted.map(([brand, count]) => {
        const query = `Tell me about ${brand.replace(/'/g, "\\'")}'s innovation strategy across the knowledge graphs`;
        return `<button class="co-pill" onclick="sendPrompt('${query}')">${esc(brand)}<span class="co-count">${count}</span></button>`;
    }).join('\n')}</div>`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------
const SEARCH_CSS = `
/* Grid */
.tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;}
.tc2{background:var(--color-background-primary);border:1px solid var(--color-border-tertiary);border-radius:4px;
  padding:1rem 1.125rem;display:flex;flex-direction:column;gap:6px;transition:opacity .25s,transform .25s;}

.tc2-top{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;}
.tc2-eyebrow{font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:var(--color-text-secondary);margin-bottom:2px;}
.tc2-eyebrow .sep{color:var(--color-border-tertiary);}
.signal{display:inline-flex;align-items:baseline;gap:6px;flex-shrink:0;}
.signal-num{font-family:var(--font-display);font-style:italic;font-size:18px;font-weight:400;color:var(--color-text-primary);}
.signal-meta{font-family:var(--font-mono);font-size:9px;letter-spacing:0.16em;text-transform:uppercase;color:var(--color-text-secondary);}
.signal.high .signal-num{color:var(--color-text-success);}
.signal.mid .signal-num{color:var(--color-text-warning);}
.signal.low .signal-num{color:var(--color-text-secondary);}
.tc2-name{font-size:13px;font-weight:500;line-height:1.35;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
.tc2-desc{font-size:11px;color:var(--color-text-secondary);line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
.bchips{display:flex;flex-wrap:wrap;gap:3px;}
.bchip{font-size:11px;background:var(--color-background-secondary);color:var(--color-text-secondary);border-radius:4px;padding:1px 6px;}
.tc2-foot{display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--color-text-tertiary);margin-top:2px;gap:6px;}
.tc2-graph{font-size:10px;padding:2px 8px;border-radius:20px;background:var(--pl);color:var(--pl-on);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;}
.tc2-exp{font-size:11px;border:1px solid var(--color-border-tertiary);border-radius:4px;padding:3px 10px;
  cursor:pointer;background:transparent;color:var(--color-text-secondary);margin-top:auto;width:fit-content;
  transition:all .15s;font-family:var(--font-mono);}
.tc2-exp:hover{background:var(--pl);border-color:var(--pm);color:var(--pl-on);}
.search-insight{font-size:14px;font-family:var(--font-display);font-style:italic;font-weight:400;line-height:1.65;padding:14px 16px;
  background:var(--pl);border:1px solid var(--p);border-left-width:3px;border-radius:4px;margin-bottom:1.25rem;color:var(--color-text-primary);}

/* Company pills */
.co-grid{display:flex;flex-wrap:wrap;gap:6px;}
.co-pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:5px 12px;border-radius:20px;
  border:.5px solid var(--color-border-tertiary);background:none;color:var(--color-text-primary);
  cursor:pointer;font-family:var(--font-mono);transition:all .15s;}
.co-pill:hover{background:var(--pl);border-color:var(--pm);color:var(--pl-on);}
.co-count{font-size:10px;background:var(--color-background-secondary);color:var(--color-text-tertiary);
  border-radius:10px;padding:1px 5px;}

/* Market stats */
.sg{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px;}
.sk{background:var(--color-background-secondary);border-radius:8px;padding:10px 12px;}
.skl{font-size:10px;color:var(--color-text-secondary);margin-bottom:2px;}
.skv{font-family:var(--font-display);font-style:italic;font-size:22px;font-weight:400;}
.sks{font-size:10px;color:var(--color-text-secondary);}
.sl2{font-size:13px;font-weight:500;margin:1rem 0 8px;}.sl2:first-child{margin-top:0;}

/* Analysis */
.analysis-content{font-size:13px;line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
.analysis-content p{margin-bottom:10px;}
.analysis-content strong{font-weight:600;}

/* Dark mode */
@media(prefers-color-scheme:dark){
  .bchip{background:rgba(255,255,255,0.08);}
}
`;

// ---------------------------------------------------------------------------
// Stage definitions
// ---------------------------------------------------------------------------
const STAGES = [
    { id: 'all', label: 'All', color: '#444441', desc: 'Every signal in the result set' },
    { id: 'emerging', label: 'Emerging', color: '#A07CD4', desc: 'New signals — thin evidence, high uncertainty' },
    { id: 'building', label: 'Building', color: '#2E6BE5', desc: 'Gaining momentum — evidence accumulating' },
    { id: 'established', label: 'Established', color: '#1D9E75', desc: 'Well-documented — high signal, broad coverage' },
    { id: 'plateauing', label: 'Plateauing', color: '#888780', desc: 'Slowing — signal strong but evidence aging' },
];

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------
export async function renderSearchWidget(
    data: any,
    query: string,
    graphName?: string,
    supplemental?: { google_trends?: any; census_retail?: any },
): Promise<{ widget_html: string; editorial_instruction: string; open_slots: string[] }> {

    const rows: TrendRow[] = data?.rows || data?.results || [];
    // Only render widget for 3+ results; 1-2 results → Claude uses raw JSON
    if (rows.length < 3) {
        return {
            widget_html: '',
            editorial_instruction: '',
            open_slots: [],
        };
    }



    // Compute stages
    const enriched = rows.map(r => ({
        ...r,
        _stage: r.trendLifecycle || computeStage(r),
        _signal: r.signal_score || 0,
        _name: r.trendName || r.name || (r as any).label || '',
        _desc: (r.trendDescription || r.description || '').slice(0, 140),
        _brands: normalizeBrands(r.brandNames || (r as any).Brand),
        _graphName: r.graphName || graphName || '',
        _evCount: r.evidenceCount || r.evidence_count || 0,
        _firstSeen: r.firstSeen || '',
        _lastSeen: r.lastSeen || '',
    }));

    enriched.sort((a, b) => b._signal - a._signal);



    // Collect source names
    const sourceSet = new Set<string>();
    enriched.forEach(t => { if (t._graphName) sourceSet.add(t._graphName); });
    if (supplemental?.google_trends) sourceSet.add('Google Trends');
    if (supplemental?.census_retail) sourceSet.add('Census Bureau');
    const sources = [...sourceSet];



    // Build Market tab content
    const censusHtml = buildCensusHtml(supplemental?.census_retail);
    const gtHtml = buildGoogleTrendsHtml(supplemental?.google_trends, query);
    const marketContent = (censusHtml || gtHtml)
        ? `${censusHtml}${gtHtml}`
        : '<p class="fnote">No market data available for this query.</p>';

    // Build Companies tab content
    const companiesHtml = buildCompaniesHtml(rows);

    const scrubberHtml = `<p class="scr-count">${enriched.length} signals across ${sources.filter(s => s !== 'Google Trends' && s !== 'Census Bureau').join(', ')}</p>`;

    // Build Trends grid server-side
    const smap = Object.fromEntries(STAGES.map(s => [s.id, s]));
    const trendsGridHtml = enriched.map(t => {
        const stageObj = smap[t._stage] || smap['emerging'];
        const sc = t._signal >= 80 ? 'high' : t._signal >= 50 ? 'mid' : 'low';
        const queryStr = `Tell me about ${t._name} from the ${t._graphName}`.replace(/'/g, "\\'");
        return `<div class="tc2">
          <div class="tc2-eyebrow">${esc(t._graphName)} <span class="sep">·</span> ${(stageObj?.label || 'Emerging').toUpperCase()}</div>
          <div class="tc2-top"><p class="tc2-name">${esc(t._name)}</p>
          <div class="signal ${sc}"><span class="signal-num">${t._signal}</span><span class="signal-meta">signal</span></div></div>
          <p class="tc2-desc">${esc(t._desc)}</p>
          <div class="bchips">${t._brands.map((b: string) => `<span class="bchip">${esc(b)}</span>`).join('')}</div>
          <div class="tc2-foot"><span class="tc2-graph">${esc(t._graphName)}</span><span>${(t as any).relevance ? (t as any).relevance + '% match' : t._evCount + ' ev.'}</span></div>
          <button class="tc2-exp" onclick="sendPrompt('${queryStr}')">Explore ↗</button></div>`;
    }).join('');

    // Build content HTML linearly without tabs
    const contentHtml = `
<div class="search-insight">{{SEARCH_INSIGHT}}</div>

<div class="sec">Trends</div>
${scrubberHtml}
<div class="tgrid" id="tgrid">${trendsGridHtml}</div>

<div class="sec">Companies</div>
<div class="sl2">Brands appearing across these trends</div>
<p class="fnote">Frequency of brand mentions across ${enriched.length} trends. Higher count = wider strategic footprint.</p>
${companiesHtml}

<div class="sec">Market</div>
${marketContent}

<div class="sec">Analysis</div>
<div class="analysis-content">{{ANALYSIS_HTML}}</div>
`;

    const subtitle = `Search: ${query}`;
    let widget_html = wrapWidget(subtitle, contentHtml, sources, SEARCH_CSS);

    // Count unique brands for editorial context
    const uniqueBrands = new Set<string>();
    enriched.forEach(t => t._brands.forEach(b => uniqueBrands.add(b)));

    // ── Tier 1 + Tier 2: Run both Gemini fills in parallel ──
    const trendSummaries: TrendSummary[] = enriched.map(t => ({
        name: t._name, signal: t._signal, stage: t._stage,
        graphName: t._graphName, brands: t._brands, desc: t._desc,
    }));
    const suppSummary = supplemental?.google_trends ? 'Google Trends data available for query.' : '';
    const [insightResult, analysisResult] = await Promise.allSettled([
        fillSearchInsight(trendSummaries, query),
        fillAnalysis(query, trendSummaries, suppSummary),
    ]);
    const insightText = insightResult.status === 'fulfilled' ? insightResult.value : '';
    const analysisHtml = analysisResult.status === 'fulfilled' ? analysisResult.value : '';
    if (analysisResult.status === 'rejected') {
        console.error(`[searchTemplate] fillAnalysis failed:`, analysisResult.reason);
    }

    // Replace slots
    const fills: Record<string, string> = {};
    if (insightText) fills['SEARCH_INSIGHT'] = insightText;
    if (analysisHtml) fills['ANALYSIS_HTML'] = analysisHtml;
    widget_html = replaceSlots(widget_html, fills);

    const slotsRemaining = [];
    if (!insightText) slotsRemaining.push('SEARCH_INSIGHT');
    if (!analysisHtml) slotsRemaining.push('ANALYSIS_HTML');

    const editorial_instruction = slotsRemaining.length === 0
        ? `── SEARCH WIDGET: READY ──
The widget is fully populated. Call show_widget with the widget_html as-is. Do NOT modify the HTML.`
        : `── SEARCH WIDGET: EDITORIAL SLOTS ──
The widget_html has ${slotsRemaining.length} unfilled slot(s): ${slotsRemaining.join(', ')}.
Fill them and call show_widget.

CONTEXT:
- Query: "${query}"
- ${enriched.length} trends across ${sources.join(', ')}
- Top signal: "${enriched[0]?._name}" (score ${enriched[0]?._signal})
- ${uniqueBrands.size} unique brands

CRITICAL: ALL output must go INSIDE the widget slots. Do NOT redesign or restyle.`;

    // Final cleanup: strip any remaining unfilled {{...}} placeholders
    widget_html = widget_html.replace(/\{\{[A-Z_0-9]+\}\}/g, '');

    return {
        widget_html,
        editorial_instruction,
        open_slots: slotsRemaining,
    };
}
