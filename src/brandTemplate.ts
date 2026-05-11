/**
 * Brand Intelligence Widget Template Engine
 * 
 * Server-side slot filling for the Fodda brand intelligence widget.
 * Fills ~90% of slots mechanically. Returns near-complete HTML with
 * only editorial slots open for Claude to fill (~200 tokens).
 */

// ---------------------------------------------------------------------------
// Pressure type color mapping
// ---------------------------------------------------------------------------
import { fillBrandOneLiner, fillBrandVerdict, fillTrendFootprintIntro, fillMarketDataIntro, replaceSlots, type TrendSummary } from './editorialFill.js';
import { esc, FODDA_SHELL_CSS, PLAYFAIR_LINK, FODDA_LOGO_URL } from './widgetShell.js';
import { getDomainGraphIds } from './catalogCache.js';

const PRESSURE_COLORS: Record<string, { bg: string; color: string; label: string }> = {
    'Direct competitor':     { bg: '#FFF0E0', color: '#D97B2B', label: 'Direct competitor' },
    'Adjacent signal':       { bg: '#E6F1FB', color: '#2E6BE5', label: 'Adjacent signal' },
    'Crossover mention':     { bg: '#EEEDFE', color: '#7C6AB5', label: 'Crossover mention' },
    'Related brand':         { bg: '#F5F0FF', color: '#663399', label: 'Related brand' },
    // Legacy labels (backward compat)
    'Heritage challenger':   { bg: '#FFF0E0', color: '#D97B2B', label: 'Heritage challenger' },
    'Sibling challenger':    { bg: '#FFF0E0', color: '#D97B2B', label: 'Sibling challenger' },
    'Premium challenger':    { bg: '#E6F1FB', color: '#2E6BE5', label: 'Premium challenger' },
    'Co-creation partner':   { bg: '#EAF3DE', color: '#3A8F5C', label: 'Co-creation partner' },
    'Tech partner':          { bg: '#EAF3DE', color: '#3A8F5C', label: 'Tech partner' },
    'Culture collaborator':  { bg: '#FBEAF0', color: '#C94F7A', label: 'Culture collaborator' },
    'Crossover threat':      { bg: '#EEEDFE', color: '#7C6AB5', label: 'Crossover threat' },
    'Category shadow':       { bg: '#EEEDFE', color: '#7C6AB5', label: 'Category shadow' },
};

const DEFAULT_PRESSURE = { bg: '#FFF0E0', color: '#D97B2B', label: 'Competitor' };

// Sector-aware pressure type assignment based on graph overlap
function guessPressureType(_index: number, competitor?: any, brandGraphIds?: Set<string>, domainGraphIds?: Set<string>): string {
    const compGraphArr = competitor?.graphIds || [];
    if (compGraphArr.length > 0 && brandGraphIds && brandGraphIds.size > 0) {
        const compGraphs = new Set<string>(compGraphArr);
        const sharedGraphs = [...compGraphs].filter(g => brandGraphIds.has(g));
        if (sharedGraphs.length === 0) return 'Crossover mention';
        // Any shared DOMAIN graph = direct competitor (both in retail, both in beauty, etc.)
        const sharedDomain = domainGraphIds ? sharedGraphs.filter(g => domainGraphIds.has(g)) : [];
        if (sharedDomain.length > 0) return 'Direct competitor';
        // Shared expert graph only = adjacent signal (co-mentioned in research, not same market)
        return 'Adjacent signal';
    }
    // Fallback: no graph data — conservative label
    return 'Related brand';
}

// ---------------------------------------------------------------------------
// Network node orbit positions (fixed, up to 5 competitors)
// ---------------------------------------------------------------------------
const ORBIT_POSITIONS = [
    { cx: 65, cy: 40 },    // top-left
    { cx: 255, cy: 52 },   // top-right
    { cx: 268, cy: 155 },  // right
    { cx: 155, cy: 208 },  // bottom
    { cx: 30, cy: 162 },   // left
];

// ---------------------------------------------------------------------------
// Sparkline shape derivation
// ---------------------------------------------------------------------------
function deriveSparklineShape(trend: any): string {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const lastSeen = trend.lastSeen || trend.published_at;
    const firstSeen = trend.firstSeen || trend.published_at;
    const evCount = trend.evidence_count || 0;

    if (lastSeen && new Date(lastSeen).getTime() > thirtyDaysAgo && evCount <= 3) return 'new-signal';
    if (firstSeen && lastSeen) {
        const span = new Date(lastSeen).getTime() - new Date(firstSeen).getTime();
        const midpoint = new Date(firstSeen).getTime() + span / 2;
        // If most evidence is recent, accelerating
        if (evCount >= 5) return 'accelerating';
        if (evCount >= 3) return 'emerging';
    }
    if (evCount <= 2) return 'emerging';
    return 'steady';
}

// ---------------------------------------------------------------------------
// Lifecycle CSS class
// ---------------------------------------------------------------------------
function lcClass(lifecycle: string): string {
    switch (lifecycle) {
        case 'building': return 'lb-b';
        case 'emerging': return 'lb-e';
        case 'mature': case 'established': return 'lb-m';
        case 'fading': case 'plateauing': return 'lb-f';
        default: return 'lb-e';
    }
}

function computeLifecycle(trend: any): string {
    const now = Date.now();
    const first = trend.firstSeen || trend.firstSeenDate ? new Date(trend.firstSeen || trend.firstSeenDate).getTime() : 0;
    const last = trend.lastSeen || trend.lastSeenDate ? new Date(trend.lastSeen || trend.lastSeenDate).getTime() : 0;

    // Use freshnessDays as staleness proxy when dates are available
    const freshness = trend.freshnessDays;

    if (first && last) {
        // Date-based lifecycle (most reliable)
        const ageMonths = (now - first) / (1000 * 60 * 60 * 24 * 30);
        const staleDays = (now - last) / (1000 * 60 * 60 * 24);
        const count = trend.evidenceCount || trend.evidence_count || 0;
        if (staleDays > 180) return 'fading';
        if (ageMonths < 6 && count < 5) return 'emerging';
        if (ageMonths > 12 && count > 10) return 'mature';
        return 'building';
    }

    // freshnessDays-based lifecycle (when API provides it but not firstSeen/lastSeen)
    if (freshness !== null && freshness !== undefined) {
        if (freshness > 365) return 'fading';
        if (freshness > 180) return 'fading';
        if (freshness < 90) return 'emerging';
        return 'building';
    }

    // Last resort: signal-score heuristic (least reliable — avoid evidence count dependency)
    const signal = trend.signal_score || 0;
    if (signal >= 70) return 'mature';
    if (signal >= 45) return 'building';
    if (signal < 20) return 'fading';
    return 'emerging';
}

// ---------------------------------------------------------------------------
// Category CSS class
// ---------------------------------------------------------------------------
function catClass(category: string): string {
    switch (category) {
        case 'Case Study': return 'cat-cs';
        case 'Signal': return 'cat-si';
        case 'Metric': return 'cat-me';
        case 'Quote': return 'cat-qu';
        case 'Interpretation': return 'cat-in';
        default: return 'cat-cs';
    }
}

// ---------------------------------------------------------------------------
// Velocity class
// ---------------------------------------------------------------------------
function velocityClass(trend: string): { cls: string; label: string } {
    switch (trend) {
        case 'accelerating': return { cls: 'vc-up', label: 'rising ↑' };
        case 'stable': return { cls: 'vc-steady', label: 'steady →' };
        case 'decelerating': return { cls: 'vc-slow', label: 'slowing ↓' };
        default: return { cls: 'vc-build', label: 'building ↗' };
    }
}

// HTML escaping — imported from widgetShell.ts (single source of truth)

// ---------------------------------------------------------------------------
// Google Trends SVG helpers
// ---------------------------------------------------------------------------
function gtY(value: number): number {
    return Math.round(88 - (value / 100 * 76));
}

function buildGoogleTrendsSVG(gtData: any): {
    polyline: string; polygon: string;
    peakX: number; peakY: number; peakLabel: string;
    nowLabel: string; annX: number; annY: number; annText: string;
    description: string; caption: string;
    relatedQueriesHtml: string;
    comparisonBarsHtml: string;
} {
    const defaults = {
        polyline: '0,88 300,88', polygon: '0,88 300,88,300,88,0,88',
        peakX: 150, peakY: 88, peakLabel: '', nowLabel: '',
        annX: 297, annY: 84, annText: '', description: 'Google Trends',
        caption: 'Relative interest (0–100). Not absolute volume. Source: Google Trends.',
        relatedQueriesHtml: '',
        comparisonBarsHtml: '',
    };

    if (!gtData) return defaults;
    // API wraps data in a snapshot object
    const gt = gtData.snapshot || gtData;

    if (!gt?.interest_over_time?.length) return defaults;

    const points = gt.interest_over_time;
    const n = points.length;
    const step = 300 / Math.max(n - 1, 1);

    let peakVal = 0, peakIdx = 0;
    const coords: string[] = [];
    for (let i = 0; i < n; i++) {
        const x = Math.round(i * step);
        const y = gtY(points[i].value || 0);
        coords.push(`${x},${y}`);
        if ((points[i].value || 0) > peakVal) {
            peakVal = points[i].value;
            peakIdx = i;
        }
    }

    const polyline = coords.join(' ');
    const polygon = polyline + ',300,88,0,88';
    const lastVal = points[n - 1]?.value || 0;
    const lastY = gtY(lastVal);
    const peakX = Math.round(peakIdx * step);
    const peakY = gtY(peakVal);
    const peakDate = points[peakIdx]?.date || '';
    const trend = lastVal > peakVal * 0.9 ? '↑ near peak' : lastVal > peakVal * 0.6 ? '↑ rising' : '→ moderate';

    const relatedQueriesHtml = (gt.related_queries || [])
        .slice(0, 8)
        .map((q: string) => `<span class="rqp">${esc(q)}</span>`)
        .join('');

    // Comparison bars (brand vs competitors) — hide if all values are identical (API blending)
    const comparison: any[] = gt.comparison || [];
    const compValues = comparison.map((c: any) => c.latest_value || c.peak_interest || 0);
    const allSame = compValues.length > 1 && compValues.every((v: number) => v === compValues[0]);
    const compMax = Math.max(...compValues, 1);
    const comparisonBarsHtml = allSame ? '' : comparison.slice(0, 5).map((c: any) =>
        barRow(c.term || c.keyword || '', c.latest_value || 0, compMax)
    ).join('\n');

    return {
        polyline, polygon, peakX, peakY,
        peakLabel: `${peakDate} peak ${peakVal}`,
        nowLabel: `now ${lastVal}`,
        annX: 297, annY: lastY - 4, annText: trend,
        description: `"${gt.query || 'brand'}", US, past 12 months`,
        caption: 'Relative interest (0–100). Not absolute volume. Source: Google Trends.',
        relatedQueriesHtml,
        comparisonBarsHtml,
    };
}

// ---------------------------------------------------------------------------
// Bar row sub-template
// ---------------------------------------------------------------------------
function barRow(label: string, value: number, maxValue: number): string {
    const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
    return `<div class="br"><div class="brl">${esc(label)}</div><div class="brt"><div class="brf" style="width:${pct}%"></div></div><div class="brc">${value.toLocaleString()}</div></div>`;
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------
export async function renderBrandWidget(profile: any): Promise<{ widget_html: string; editorial_context: any; open_slots: string[] }> {
    const brand = profile.brand || 'Brand';
    const trends = profile.trend_footprint || [];
    const evidence = profile.evidence_items || [];
    const competitors = profile.competitive_context?.co_occurring_brands || [];
    const crossGraph = profile.cross_graph_presence || [];
    const supplemental = profile.supplemental_signals || {};
    const velocity = velocityClass(profile.summary?.evidence_velocity?.trend || 'stable');
    const timeline = profile.activity_timeline || [];

    // Build set of graphIds the target brand is present in (for sector-aware competitor labels)
    const brandGraphIds = new Set<string>(crossGraph.map((g: any) => g.graphId).filter(Boolean));
    // Domain graphs from the catalog (retail, beauty, etc.) — used to distinguish real sector overlap
    const domainGIds = getDomainGraphIds();

    // ── Earnings Intelligence section ──
    const earnings = profile.earningsIntelligence || [];
    const earningsHtml = earnings.length > 0
        ? earnings.slice(0, 5).map((e: any) => {
            const topicPills = (e.key_topics || e.keyTopics || []).slice(0, 5)
                .map((t: string) => `<span class="rqp">${esc(t)}</span>`).join('');
            const provenance = e.source === 'web_supplemental' ? 'Recent reports suggest' : 'Management noted';
            const summary = e.summary || e.description || '';
            return `<div class="ec">
  <div class="et" style="font-size:12px;font-weight:500;">${esc(e.company || e.ticker || '')} — ${esc(e.quarter || e.period || '')}</div>
  <div class="ex">${esc(provenance)}: ${esc(summary)}</div>
  <div class="rq" style="margin-top:6px;">${topicPills}</div>
</div>`;
        }).join('\n')
        : '';

    // Enrich trends with lifecycle if missing
    trends.forEach((t: any) => {
        if (!t.lifecycle || t.lifecycle === 'unknown') {
            t.lifecycle = computeLifecycle(t);
        }
    });

    // ── Lifecycle bar ──
    const lcDist = profile.summary?.lifecycle_distribution || {};
    const lcTotal = Object.values(lcDist).reduce((a: number, b: any) => a + (b as number), 0) as number;
    const lcColors: Record<string, string> = { building: 'var(--color-text-info)', emerging: 'var(--color-text-success)', mature: 'var(--color-text-secondary)', fading: 'var(--color-text-warning)' };
    const lifecycleBar = Object.entries(lcDist)
        .map(([state, count]) => {
            const pct = lcTotal > 0 ? Math.round(((count as number) / lcTotal) * 100) : 0;
            return `<div style="width:${pct}%;background:${lcColors[state] || '#999'};border-radius:4px;"></div>`;
        }).join('');
    const lifecycleLegend = Object.entries(lcDist)
        .map(([state, count]) => `<div class="lci"><div class="lcd" style="background:${lcColors[state] || '#999'}"></div>${state} (${count})</div>`)
        .join('');

    // ── Weak signals (separate from main list) ──
    const weakSignalNames = new Set<string>();
    const weakSignals = trends.filter((t: any) => (t.evidence_count || 0) < 3 && t.lifecycle === 'emerging');
    weakSignals.forEach((t: any) => weakSignalNames.add(t.trend_name?.trim()));

    // ── Trend cards (exclude weak signals to avoid duplication) ──
    const mainTrends = trends.filter((t: any) => !weakSignalNames.has(t.trend_name?.trim()));
    const trendsHtml = mainTrends.map((t: any, i: number) => {
        const spark = deriveSparklineShape(t);
        const tName = (t.trend_name || '').trim();
        const badges = [
            `<span class="bdp">${esc(t.graphName)}</span>`,
            `<span class="bd">${t.evidence_count || 0} evidence</span>`,
            t.signal_score ? `<span class="bd">signal ${t.signal_score}</span>` : '',
            t.momentum?.fastMover ? '<span class="bd-fast">fast mover ↗</span>' : '',
        ].filter(Boolean).join('\n      ');

        return `<div class="card" style="cursor:pointer;" onclick="sendPrompt('Explore ${esc(tName).replace(/'/g, '\\&#39;')} trend in Fodda')">
  <div class="th">
    <div class="tn">${esc(tName)}</div>
    <div class="ta">
      <span class="lb ${lcClass(t.lifecycle)}">${esc(t.lifecycle)}</span>
    </div>
  </div>
  <div class="td">${esc(t.trend_description)}</div>
  <div class="brow">${badges}</div>
</div>`;
    }).join('\n');

    // Weak signals section (trends already excluded from main list above)
    const weakSignalsHtml = weakSignals.length > 0
        ? `<div class="wl"><span class="wd"></span>Weak signal — watch</div>
` +
          weakSignals.slice(0, 3).map((t: any) => {
            const tName = (t.trend_name || '').trim();
            return `<div class="card" style="opacity:.75;cursor:pointer;" onclick="sendPrompt('Explore ${esc(tName).replace(/'/g, '\\&#39;')} trend in Fodda')">
  <div class="th">
    <div class="tn">${esc(tName)}</div>
    <span class="lb ${lcClass(t.lifecycle)}">${esc(t.lifecycle)}</span>
  </div>
  <div class="td">${esc(t.trend_description)}</div>
  <div class="brow"><span class="bdp">${esc(t.graphName)}</span><span class="bd">${t.evidence_count || 0} evidence</span></div>
</div>`;
          }).join('\n')
        : '';

    // ── Evidence cards ──
    const evidenceHtml = evidence.slice(0, 20).map((ev: any) => {
        const imgTag = ev.image_url ? `<img src="${esc(ev.image_url)}" style="width:100%;border-radius:6px;margin-bottom:8px;" onerror="this.style.display='none'"/>` : '';
        const placeBadge = ev.place ? `<span class="bd">${esc(ev.place)}</span>` : '';
        // Safe date parsing — fallback to empty on Invalid Date
        let date = '';
        if (ev.published_at) {
            const parsed = new Date(ev.published_at);
            date = isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
        const titleHtml = ev.source_url
            ? `<a href="${esc(ev.source_url)}">${esc(ev.title)}</a>`
            : esc(ev.title);
        return `<div class="ec">
  ${imgTag}<div class="et">${titleHtml}</div>
  <div class="ex">${esc(ev.excerpt)}</div>
  <div class="em">
    <span class="lb ${catClass(ev.category)} bd">${esc(ev.category)}</span>
    <span class="bdp">${esc(ev.graphName)}</span>
    <span class="bd">${date}</span>
    ${placeBadge}
  </div>
</div>`;
    }).join('\n');

    // ── Competitor list cards ──
    const competitorListHtml = competitors.slice(0, 8).map((c: any, i: number) => {
        const pType = guessPressureType(i, c, brandGraphIds, domainGIds);
        const colors = PRESSURE_COLORS[pType] || DEFAULT_PRESSURE;
        return `<div class="cc">
  <div>
    <div class="cn">${esc(c.brand)}</div>
    <div class="cd">Co-occurs in ${c.co_occurrences} evidence item${c.co_occurrences !== 1 ? 's' : ''}</div>
  </div>
  <div class="ca">
    <span class="pb" style="background:${colors.bg};color:${colors.color};">${colors.label}</span>
    <button class="cv" onclick="sendPrompt('brand intelligence: ${esc(c.brand)}')">View ↗</button>
  </div>
</div>`;
    }).join('\n');

    // ── Network SVG ──
    const topComps = competitors.slice(0, 5);
    const networkNodesHtml = topComps.map((c: any, i: number) => {
        const pos = ORBIT_POSITIONS[i] || { cx: 150, cy: 113 };
        const pType = guessPressureType(i, c, brandGraphIds, domainGIds);
        const colors = PRESSURE_COLORS[pType] || DEFAULT_PRESSURE;
        return `<line x1="150" y1="113" x2="${pos.cx}" y2="${pos.cy}" stroke="${colors.color}" stroke-width="0.5" stroke-dasharray="3,3"/>
        <circle cx="${pos.cx}" cy="${pos.cy}" r="18" fill="${colors.bg}" stroke="${colors.color}" stroke-width="1"/>
        <text x="${pos.cx}" y="${pos.cy + 3}" class="svgt" font-size="7.5" text-anchor="middle" fill="${colors.color}">${esc(c.brand)}</text>`;
    }).join('\n        ');

    // Network legend — bottom-right (avoid overlapping left orbit node)
    const legendTypes: string[] = [...new Set(topComps.map((c: any, i: number) => guessPressureType(i, c, brandGraphIds, domainGIds)))].slice(0, 5) as string[];
    const networkLegendHtml = legendTypes.map((pType: string, i: number) => {
        const colors = PRESSURE_COLORS[pType] || DEFAULT_PRESSURE;
        const y = 190 + i * 11;
        return `<rect x="200" y="${y}" width="6" height="6" rx="1" fill="${colors.bg}" stroke="${colors.color}" stroke-width=".5"/>
        <text x="210" y="${y + 5}" class="svgt" font-size="6" fill="var(--color-text-secondary)">${pType}</text>`;
    }).join('\n        ');

    // ── Compare buttons ──
    const compareButtonsHtml = competitors.slice(0, 4).map((c: any) =>
        `<button class="cp" onclick="sendPrompt('brand intelligence: ${esc(c.brand)}')">${esc(c.brand)} ↗</button>`
    ).join('\n    ');

    // ── Google Trends ──
    const gt = buildGoogleTrendsSVG(supplemental?.google_trends);
    const hasGoogleTrendsData = gt.polyline !== '0,88 300,88'; // false when API returned empty time-series

    // ── Wikipedia bars ──
    const rawWiki = supplemental?.wikipedia;
    const wikiData: any[] = Array.isArray(rawWiki) ? rawWiki : (rawWiki?.snapshot || rawWiki?.articles || rawWiki?.results || []);
    const wikiMax = Math.max(...wikiData.map((w: any) => w.avg_daily_views || 0), 1);
    const wikiBarsHtml = wikiData.slice(0, 5).map((w: any) =>
        barRow(w.article || '', w.avg_daily_views || 0, wikiMax)
    ).join('\n');

    const amazonRaw = supplemental?.amazon || {};
    const amazon = amazonRaw?.snapshot || amazonRaw;
    const products = amazon?.example_products || amazon?.products || [];
    const amazonProductsHtml = products.slice(0, 4).map((p: any) =>
        `<div class="ap"><div><div class="an2">${esc(p.name || p.title)}</div><div class="am2">${esc(p.price || '')}</div></div><div><div class="astar">${'★'.repeat(Math.round(p.rating || 0))}${'☆'.repeat(5 - Math.round(p.rating || 0))}</div><div class="am2">${(p.reviews || 0).toLocaleString()} reviews</div></div></div>`
    ).join('\n');

    // ── Geographic bars ──
    const geoDist = profile.geographic_distribution || [];
    const geoMax = Math.max(...geoDist.map((g: any) => g.count || 0), 1);
    const geoBarsHtml = geoDist.slice(0, 6).map((g: any) =>
        barRow(g.place || 'Unknown', g.count || 0, geoMax)
    ).join('\n');

    // ── Census Retail data (sector-mapped) ──
    const censusRaw = supplemental?.census_retail;
    const censusSnap = censusRaw?.snapshot || censusRaw || {};
    const censusSubs: any[] = censusSnap?.subcategories || [];
    const graphIds = crossGraph.map((g: any) => (g.graphId || '').toLowerCase());
    const trendNames = trends.map((t: any) => (t.trendName || t.name || '').toLowerCase());
    const brandLower = brand.toLowerCase();
    const sectorContext = [brandLower, ...graphIds, ...trendNames].join(' ');
    const foodSignals = ['food', 'restaurant', 'dining', 'menu', 'mcdonald', 'burger', 'pizza', 'starbucks', 'coffee', 'cafe', 'bakery', 'grocery'];
    const isFoodBrand = foodSignals.some(kw => sectorContext.includes(kw));
    let matchedSector: any = null;
    if (isFoodBrand) {
        matchedSector = censusSubs.find((c: any) => (c.name || '').toLowerCase().includes('food service'));
        if (!matchedSector) matchedSector = censusSubs.find((c: any) => (c.name || '').toLowerCase().includes('food and beverage'));
    }
    if (!matchedSector && (sectorContext.includes('fashion') || sectorContext.includes('sports') || sectorContext.includes('apparel') || sectorContext.includes('beauty') || sectorContext.includes('shoe') || sectorContext.includes('sneaker'))) {
        matchedSector = censusSubs.find((c: any) => (c.name || '').toLowerCase().includes('clothing'));
    }
    if (!matchedSector) {
        matchedSector = censusSubs.find((c: any) => (c.name || '').toLowerCase().includes('non-store') || (c.name || '').toLowerCase().includes('e-commerce'));
    }
    const totalRetail = censusSnap?.total_retail_sales_millions;
    const totalMom = censusSnap?.month_over_month_change_pct;
    const beaLabel = matchedSector ? esc(matchedSector.name).replace(/ Stores$/, '') : 'Retail sector';
    const beaValue = matchedSector?.sales_millions ? `$${(matchedSector.sales_millions / 1000).toFixed(1)}B` : '—';
    const beaSub = matchedSector?.mom_change_pct != null ? `${matchedSector.mom_change_pct > 0 ? '+' : ''}${matchedSector.mom_change_pct.toFixed(1)}% MoM` : '';
    const beaChangeLabel = 'Total US retail';
    const beaChangeValue = totalRetail ? `$${(totalRetail / 1000).toFixed(0)}B` : '—';
    const beaChangeSub = totalMom != null ? `${totalMom > 0 ? '+' : ''}${totalMom.toFixed(1)}% MoM` : '';

    // ── Source pills ──
    const graphNames = crossGraph.map((g: any) => g.graphName).filter(Boolean);
    const sourcePills = [
        ...graphNames.map((n: string) => `<span class="gp">${esc(n)}</span>`),
        hasGoogleTrendsData ? '<span class="gp">Google Trends</span>' : '',
        supplemental?.wikipedia ? '<span class="gp">Wikipedia</span>' : '',
        supplemental?.amazon ? '<span class="gp">Amazon</span>' : '',
        supplemental?.census_retail ? '<span class="gp">US Census</span>' : '',
    ].filter(Boolean).join('\n    ');

    // ── Export slots (data-driven labels) ──
    const exportLabels: Array<{ label: string; desc: string; prompt: string }> = [
        { label: 'Editorial brief', desc: `Strategic analysis of ${brand}'s innovation position`, prompt: `Write editorial brief for ${brand}` },
        { label: 'Competitor comparison', desc: `Head-to-head with ${competitors[0]?.brand || 'top rival'}`, prompt: `Compare ${brand} vs ${competitors[0]?.brand || 'competitor'}` },
        { label: 'Weak signal forecast', desc: `Emerging opportunities on ${brand}'s horizon`, prompt: `Weak signal forecast for ${brand}` },
        { label: 'Steal this idea', desc: `Actionable concepts from ${brand}'s playbook`, prompt: `Steal this idea from ${brand}` },
    ];

    const now = new Date();
    const doy = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 864e5);
    const folioStr = `ISSUE ${doy} \u00b7 ${now.getDate()} ${now.toLocaleString('en-US', { month: 'short' }).toUpperCase()} \u00b7 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    const slotFills: Record<string, string> = {
        'FOLIO': folioStr,
        'BRAND_NAME': esc(brand),
        'VELOCITY_CLASS': velocity.cls,
        'VELOCITY_LABEL': velocity.label,
        'COMPARE_BUTTONS': compareButtonsHtml,
        'LIFECYCLE_BAR': lifecycleBar,
        'LIFECYCLE_LEGEND': lifecycleLegend,
        'TRENDS_HTML': trendsHtml,
        'WEAK_SIGNALS_HTML': weakSignalsHtml,
        'EVIDENCE_HTML': evidenceHtml,
        'COMPETITOR_LIST_HTML': competitorListHtml,
        'GT_SECTION_HTML': hasGoogleTrendsData ? `<div class="sl2">${gt.description}</div>
    <svg viewBox="0 0 300 96" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:96px;margin-bottom:4px;">
      <defs>
        <linearGradient id="gtg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#663399" stop-opacity=".1"/>
          <stop offset="100%" stop-color="#663399" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <polygon points="${gt.polygon}" fill="url(#gtg)"/>
      <polyline points="${gt.polyline}" fill="none" stroke="#663399" stroke-width="1.5" stroke-linejoin="round"/>
      <line x1="0" y1="88" x2="300" y2="88" stroke="var(--color-border-tertiary)" stroke-width=".5"/>
      <text x="2" y="93" font-size="7" fill="var(--color-text-secondary)" font-family="monospace">Apr '25</text>
      <text x="150" y="93" font-size="7" fill="var(--color-text-secondary)" text-anchor="middle" font-family="monospace">${gt.peakLabel}</text>
      <text x="298" y="93" font-size="7" fill="var(--color-text-secondary)" text-anchor="end" font-family="monospace">${gt.nowLabel}</text>
      <circle cx="${gt.peakX}" cy="${gt.peakY}" r="2" fill="#663399"/>
      <circle cx="300" cy="${gt.annY}" r="2.5" fill="#663399"/>
      <text x="${gt.annX}" y="${gt.annY}" font-size="7" fill="#663399" text-anchor="end" font-family="monospace">${gt.annText}</text>
    </svg>
    <p class="note">{{GT_CAPTION}}</p>` : '',
        'GT_COMPARISON_SECTION_HTML': gt.comparisonBarsHtml ? `<div class="sl2">Search interest — brand vs competitors</div>
    ${gt.comparisonBarsHtml}` : '',
        'RELATED_QUERIES_SECTION_HTML': gt.relatedQueriesHtml ? `<div class="sl2">Top related queries</div>
    <div class="rq">${gt.relatedQueriesHtml}</div>
    <p class="note">{{RELATED_QUERIES_NOTE}}</p>` : '',
        'WIKI_BARS_HTML': wikiBarsHtml,
        'AMAZON_STAT_1_LABEL': 'Listings',
        'AMAZON_STAT_1_VALUE': (amazon.product_count || 0).toLocaleString(),
        'AMAZON_STAT_1_SUB': 'total listings',
        'AMAZON_STAT_2_LABEL': 'Median price',
        'AMAZON_STAT_2_VALUE': amazon?.price_range?.median || amazon?.median_price || '—',
        'AMAZON_STAT_2_SUB': 'across all listings',
        'AMAZON_STAT_3_LABEL': 'Avg rating',
        'AMAZON_STAT_3_VALUE': String(amazon?.average_rating || '—'),
        'AMAZON_STAT_3_SUB': 'product average',
        'AMAZON_STAT_4_LABEL': 'Top reviewed',
        'AMAZON_STAT_4_VALUE': products[0] ? (products[0].reviews || 0).toLocaleString() : '—',
        'AMAZON_STAT_4_SUB': products[0] ? esc(products[0].name || products[0].title || '') : '',
        'AMAZON_PRODUCTS_HTML': amazonProductsHtml,
        'AMAZON_CAPTION': 'Snapshot only. Source: Amazon.',
        'BEA_STAT_1_LABEL': beaLabel,
        'BEA_STAT_1_VALUE': beaValue,
        'BEA_STAT_1_SUB': beaSub,
        'BEA_STAT_2_LABEL': beaChangeLabel,
        'BEA_STAT_2_VALUE': beaChangeValue,
        'BEA_STAT_2_SUB': beaChangeSub,
        'GEO_SECTION_HTML': geoBarsHtml ? `<div class="sl2">Geographic spread</div>
    ${geoBarsHtml}` : '',
        'EARNINGS_SECTION_HTML': earningsHtml ? `<div class="sl2">Earnings intelligence</div>
    ${earningsHtml}
    <p class="note">Source: Fodda Earnings Intelligence.</p>` : '',
        'SOURCE_PILLS_HTML': sourcePills,
        'EXPORT_1_LABEL': exportLabels[0]!.label,
        'EXPORT_1_DESC': exportLabels[0]!.desc,
        'EXPORT_1_PROMPT': exportLabels[0]!.prompt,
        'EXPORT_2_LABEL': exportLabels[1]!.label,
        'EXPORT_2_DESC': exportLabels[1]!.desc,
        'EXPORT_2_PROMPT': exportLabels[1]!.prompt,
        'EXPORT_3_LABEL': exportLabels[2]!.label,
        'EXPORT_3_DESC': exportLabels[2]!.desc,
        'EXPORT_3_PROMPT': exportLabels[2]!.prompt,
        'EXPORT_4_LABEL': exportLabels[3]!.label,
        'EXPORT_4_DESC': exportLabels[3]!.desc,
        'EXPORT_4_PROMPT': exportLabels[3]!.prompt
    };

    let html = TEMPLATE;
    const fills: Record<string, string> = { ...slotFills };

    // ── Parallel Gemini fills: one-liner + section intros ──
    const [oneLiner, trendIntro, marketIntro] = await Promise.allSettled([
        fillBrandOneLiner(brand, trends, velocity.label, competitors.slice(0, 3).map((c: any) => c.brand)),
        fillTrendFootprintIntro(brand, trends, profile.summary?.lifecycle_distribution || {}),
        fillMarketDataIntro(brand, supplemental),
    ]);
    fills['ONE_LINER'] = oneLiner.status === 'fulfilled' ? oneLiner.value : `${brand} is ${velocity.label} across ${trends.length} trend${trends.length !== 1 ? 's' : ''}.`;
    const trendIntroText = trendIntro.status === 'fulfilled' ? trendIntro.value : '';
    fills['TREND_FOOTPRINT_INTRO'] = trendIntroText ? `<p class="si">${esc(trendIntroText)}</p>` : '';
    const marketIntroText = marketIntro.status === 'fulfilled' ? marketIntro.value : '';
    fills['MARKET_DATA_INTRO'] = marketIntroText ? `<p class="si">${esc(marketIntroText)}</p>` : '';

    trends.slice(0, 10).forEach((t: any, i: number) => {
        const tName = t.trend_name || t.trendName || 'this trend';
        fills[`EXPLORE_PROMPT_${i + 1}`] = `Tell me more about "${tName}" and how ${brand} is positioned`;
    });
    fills['GT_CAPTION'] = supplemental?.google_trends ? `12-month search interest for "${brand}". Peak: ${supplemental.google_trends.peak_interest || '—'}, current: ${supplemental.google_trends.latest_value || '—'}. Source: Google Trends.` : `Search interest data for "${brand}". Source: Google Trends.`;
    fills['RELATED_QUERIES_NOTE'] = supplemental?.google_trends?.related_queries?.length ? `Top related searches when people look for ${brand}.` : '';
    fills['WIKI_NOTE'] = wikiData.length > 0 ? `Daily Wikipedia pageviews for ${brand}-related articles. Higher = more cultural attention.` : '';
    fills['SUGGESTED_NEXT_HTML'] = `<div style="display:flex;flex-wrap:wrap;gap:6px;">
        <button class="btn-out" onclick="sendPrompt('What are ${brand.replace(/'/g, "\\'")}'s competitors doing differently?')">Competitive landscape</button>
        <button class="btn-out" onclick="sendPrompt('Show me the evidence behind ${brand.replace(/'/g, "\\'")}'s strongest trend')">Deep dive</button>
        <button class="btn-out" onclick="sendPrompt('How does ${brand.replace(/'/g, "\\'")}' compare to ${competitors[0]?.brand.replace(/'/g, "\\'") || 'its top competitor'}?')">Head-to-head</button>
    </div>`;

    html = replaceSlots(html, fills);

    // ── Final cleanup: strip any remaining unfilled {{...}} placeholders ──
    html = html.replace(/\{\{[A-Z_0-9]+\}\}/g, '');

    const editorialContext = { brand, total_trends: trends.length };
    return { widget_html: html, editorial_context: editorialContext, open_slots: [] };
}

// const TEMPLATE = `
export const TEMPLATE = `
<style>
:root{--p:#663399;--pl:#F5F0FF;--pm:#9B72CC;--pl-on:#663399;}
@media(prefers-color-scheme:dark){:root{--p:#9B72CC;--pl:rgba(155,114,204,0.14);--pm:#663399;--pl-on:#C4A7E8;}}
.w{border:1px solid var(--p);border-top:3px solid var(--p);border-radius:6px;padding:1.25rem;font-family:var(--font-mono);}
.hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem;padding-bottom:1rem;border-bottom:.5px solid var(--color-border-tertiary);}
.logo{display:flex;align-items:center;gap:10px;}
.logo img{height:24px;width:auto;display:block;}
.lt{font-size:13px;font-weight:500;}.ls{font-size:10px;color:var(--color-text-secondary);}
.bfolio{font-family:var(--font-mono);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:var(--color-text-secondary);}
.bh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem;}
.bn{font-family:var(--font-serif);font-style:italic;font-weight:400;font-size:22px;letter-spacing:-0.01em;}
.vc{font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:3px 8px;border:1px solid currentColor;border-radius:2px;font-family:var(--font-mono);}
.vc-up{color:var(--color-text-success);}
.vc-build{color:var(--color-text-info);}
.vc-steady{color:var(--color-text-secondary);}
.vc-slow{color:var(--color-text-warning);}
.pv{font-size:14px;font-family:var(--font-serif);font-style:italic;font-weight:400;line-height:1.65;padding:14px 16px;background:var(--pl);border:1px solid var(--p);border-left-width:3px;border-radius:4px;margin-bottom:1.25rem;color:var(--color-text-primary);}
.lcb{display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:.75rem;gap:2px;}
.lcl{display:flex;gap:12px;margin-bottom:1.25rem;flex-wrap:wrap;}
.lci{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--color-text-secondary);}
.lcd{width:8px;height:8px;border-radius:2px;}
.card{background:var(--color-background-primary);border:1px solid var(--color-border-tertiary);border-radius:4px;padding:1rem 1.25rem;margin-bottom:8px;transition:border-color .15s,background .15s;}
.card:hover{border-color:#663399;background:#F5F0FF;}
.th{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:8px;}
.tn{font-size:13px;font-weight:500;}
.ta{display:flex;align-items:center;gap:4px;flex-shrink:0;}
.td{font-size:12px;color:var(--color-text-secondary);margin-bottom:5px;line-height:1.5;}
.lb{font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:3px 8px;border:1px solid currentColor;border-radius:2px;white-space:nowrap;font-family:var(--font-mono);background:transparent;}
.lb-b{color:var(--color-text-info);}
.lb-e{color:var(--color-text-success);}
.lb-m{color:var(--color-text-secondary);}
.lb-f{color:var(--color-text-warning);}
.bd{font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:3px 8px;border:1px solid currentColor;border-radius:2px;background:transparent;color:var(--color-text-secondary);font-family:var(--font-mono);}
.bd-fast{font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:3px 8px;border:1px solid currentColor;border-radius:2px;background:transparent;color:#7A4000;font-family:var(--font-mono);}
.bdp{font-size:10px;padding:2px 8px;border-radius:20px;background:var(--pl);color:var(--pl-on);font-family:var(--font-mono);}
.brow{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
.wl{font-size:11px;color:var(--color-text-secondary);margin:1.25rem 0 8px;display:flex;align-items:center;gap:6px;}
.wd{width:6px;height:6px;border-radius:50%;background:var(--color-text-warning);display:inline-block;}
.ec{border:1px dashed var(--color-border-tertiary);border-radius:4px;margin-bottom:8px;padding:1rem 1.25rem;}
.et a{color:var(--color-text-info);text-decoration:none;font-size:13px;font-weight:500;}.et a:hover{text-decoration:underline;}
.ex{font-size:12px;color:var(--color-text-secondary);line-height:1.5;margin:6px 0 8px;}
.em{display:flex;gap:6px;flex-wrap:wrap;}
.cit{font-size:10px;color:var(--color-text-secondary);margin-top:8px;padding-top:8px;border-top:.5px solid var(--color-border-tertiary);}
.cit a{color:var(--color-text-info);text-decoration:none;}
.cat-cs{background:var(--color-background-info);color:var(--color-text-info);}
.cat-si{background:var(--pl);color:var(--p);}
.cat-me{background:var(--color-background-success);color:var(--color-text-success);}
.cat-qu{background:var(--color-background-warning);color:var(--color-text-warning);}
.cat-in{background:var(--color-background-secondary);color:var(--color-text-secondary);}
.cc{background:var(--color-background-primary);border:1px solid var(--color-border-tertiary);border-radius:4px;padding:.875rem 1.25rem;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;}
.cn{font-size:13px;font-weight:500;margin-bottom:3px;}
.cd{font-size:11px;color:var(--color-text-secondary);}
.ca{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.pb{font-size:9px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;padding:3px 8px;border:1px solid currentColor;border-radius:2px;font-family:var(--font-mono);background:transparent;}
.sl2, .sec{font-size:13px;font-weight:500;color:var(--color-text-primary);margin:1.25rem 0 8px;}.sl2:first-child, .sec:first-child{margin-top:0;}
.br{display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:12px;}
.brl{width:120px;color:var(--color-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;}
.brt{flex:1;height:4px;background:var(--color-background-secondary);border-radius:3px;overflow:hidden;}
.brf{height:100%;background:var(--p);border-radius:3px;}
.brc{min-width:44px;text-align:right;color:var(--color-text-secondary);font-size:11px;}
.sg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:1rem;}
.sk{background:var(--color-background-secondary);border-radius:8px;padding:10px 12px;}
.skl{font-size:10px;color:var(--color-text-secondary);margin-bottom:3px;}
.skv{font-family:var(--font-serif);font-style:italic;font-size:22px;font-weight:400;}.sks{font-size:10px;color:var(--color-text-secondary);margin-top:2px;}
.rq{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:.75rem;}
.rqp{font-size:10px;padding:3px 9px;border-radius:20px;background:var(--color-background-secondary);color:var(--color-text-secondary);border:.5px solid var(--color-border-tertiary);}
.xb{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--color-background-secondary);border:.5px solid var(--color-border-tertiary);border-radius:8px;cursor:pointer;text-align:left;width:100%;margin-bottom:8px;font-family:var(--font-mono);transition:all .15s;}
.xb:hover{background:var(--pl);border-color:var(--pm);}
.xi{font-size:11px;width:28px;font-weight:500;flex-shrink:0;color:var(--color-text-secondary);}
.xd{font-size:11px;color:var(--color-text-secondary);margin-top:2px;}
.xbl{font-weight:500;font-size:12px;}
.gf{display:flex;gap:5px;flex-wrap:wrap;margin-top:1.5rem;padding-top:1rem;border-top:.5px solid var(--color-border-tertiary);align-items:center;}
.gfl{font-size:10px;color:var(--color-text-secondary);margin-right:2px;}
.gp{font-size:10px;padding:2px 9px;border-radius:20px;background:var(--pl);color:var(--pl-on);border:.5px solid var(--pm);}
.ap{background:var(--color-background-secondary);border-radius:8px;margin-bottom:6px;padding:.75rem 1rem;display:flex;justify-content:space-between;align-items:center;}
.an2{font-size:12px;font-weight:500;}
.am2{font-size:11px;color:var(--color-text-secondary);margin-top:2px;}
.astar{font-size:11px;color:var(--p);}
.note{font-size:10px;color:var(--color-text-secondary);margin-bottom:1.25rem;}
.btn-out{font-size:9px;padding:2px 7px;cursor:pointer;border:.5px solid var(--pm);border-radius:20px;background:var(--pl);color:var(--pl-on);font-family:var(--font-mono);}
.btn-out:hover{background:var(--p);color:#fff;border-color:var(--p);}
.cp{font-size:11px;background:var(--pl);color:var(--pl-on);border:.5px solid var(--pm);border-radius:20px;padding:3px 10px;cursor:pointer;font-family:var(--font-mono);transition:all .15s;}
.cp:hover{background:var(--p);color:#fff;}
.cv{font-size:10px;background:var(--pl);color:var(--pl-on);border:.5px solid var(--pm);border-radius:20px;padding:2px 8px;cursor:pointer;font-family:var(--font-mono);transition:all .15s;}
.cv:hover{background:var(--p);color:#fff;}
.an{font-size:13px;line-height:1.7;color:var(--color-text-primary);}
.an p{margin:0 0 .75rem;}
.an strong{font-weight:500;}
.si{font-size:12px;line-height:1.65;color:var(--color-text-secondary);font-style:italic;margin:0 0 1rem;}
</style>

<div class="w">
  <div class="hd">
    <div class="logo">
      <img src="${FODDA_LOGO_URL}" alt="Fodda" style="height:24px;width:24px;"/>
      <div><div class="lt">Fodda</div><div class="ls">Brand Intelligence</div></div>
    </div>
    <div class="bfolio">{{FOLIO}}</div>
  </div>

  <div class="bh">
    <div class="bn">{{BRAND_NAME}}</div>
    <span class="vc {{VELOCITY_CLASS}}">{{VELOCITY_LABEL}}</span>
  </div>

  <div class="pv">{{ONE_LINER}}</div>

  <div class="sec">Case Studies</div>
  {{EVIDENCE_HTML}}

  {{EARNINGS_SECTION_HTML}}

  <div class="sec">Relevant trends</div>
  {{TREND_FOOTPRINT_INTRO}}
  <div class="lcb">{{LIFECYCLE_BAR}}</div>
  <div class="lcl">{{LIFECYCLE_LEGEND}}</div>
  {{TRENDS_HTML}}
  {{WEAK_SIGNALS_HTML}}

  <div class="sec">Competitive</div>
  {{COMPETITOR_LIST_HTML}}

  <div class="sec">Market data</div>
  {{MARKET_DATA_INTRO}}
  <div class="sl2">US retail sales — Census Bureau</div>
  <div class="sg">
    <div class="sk"><div class="skl">{{BEA_STAT_1_LABEL}}</div><div class="skv">{{BEA_STAT_1_VALUE}}</div><div class="sks">{{BEA_STAT_1_SUB}}</div></div>
    <div class="sk"><div class="skl">{{BEA_STAT_2_LABEL}}</div><div class="skv">{{BEA_STAT_2_VALUE}}</div><div class="sks">{{BEA_STAT_2_SUB}}</div></div>
  </div>

  {{GT_SECTION_HTML}}
  {{GT_COMPARISON_SECTION_HTML}}
  {{RELATED_QUERIES_SECTION_HTML}}

  <div class="sl2">Wikipedia — avg daily pageviews</div>
  {{WIKI_BARS_HTML}}
  <p class="note">{{WIKI_NOTE}}</p>

  <div class="sl2">Amazon footprint</div>
  <div class="sg">
    <div class="sk"><div class="skl">{{AMAZON_STAT_1_LABEL}}</div><div class="skv">{{AMAZON_STAT_1_VALUE}}</div><div class="sks">{{AMAZON_STAT_1_SUB}}</div></div>
    <div class="sk"><div class="skl">{{AMAZON_STAT_2_LABEL}}</div><div class="skv">{{AMAZON_STAT_2_VALUE}}</div><div class="sks">{{AMAZON_STAT_2_SUB}}</div></div>
    <div class="sk"><div class="skl">{{AMAZON_STAT_3_LABEL}}</div><div class="skv">{{AMAZON_STAT_3_VALUE}}</div><div class="sks">{{AMAZON_STAT_3_SUB}}</div></div>
    <div class="sk"><div class="skl">{{AMAZON_STAT_4_LABEL}}</div><div class="skv">{{AMAZON_STAT_4_VALUE}}</div><div class="sks">{{AMAZON_STAT_4_SUB}}</div></div>
  </div>
  {{AMAZON_PRODUCTS_HTML}}
  <p class="note">{{AMAZON_CAPTION}}</p>

  {{GEO_SECTION_HTML}}

  {{EARNINGS_SECTION_HTML}}



  <div class="sec">Explore further</div>
  {{SUGGESTED_NEXT_HTML}}
  <button class="xb" onclick="sendPrompt('{{EXPORT_1_PROMPT}}')"><span class="xi">↗</span><div><div class="xbl">{{EXPORT_1_LABEL}}</div><div class="xd">{{EXPORT_1_DESC}}</div></div></button>
  <button class="xb" onclick="sendPrompt('{{EXPORT_2_PROMPT}}')"><span class="xi">↗</span><div><div class="xbl">{{EXPORT_2_LABEL}}</div><div class="xd">{{EXPORT_2_DESC}}</div></div></button>
  <button class="xb" onclick="sendPrompt('{{EXPORT_3_PROMPT}}')"><span class="xi">↗</span><div><div class="xbl">{{EXPORT_3_LABEL}}</div><div class="xd">{{EXPORT_3_DESC}}</div></div></button>
  <button class="xb" onclick="sendPrompt('{{EXPORT_4_PROMPT}}')"><span class="xi">↗</span><div><div class="xbl">{{EXPORT_4_LABEL}}</div><div class="xd">{{EXPORT_4_DESC}}</div></div></button>

  <div class="gf">
    <span class="gfl">Sources:</span>
    {{SOURCE_PILLS_HTML}}
</div>`;
