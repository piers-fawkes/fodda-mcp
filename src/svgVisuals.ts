/**
 * SVG Visual Generator for Fodda MCP
 * 
 * Style Guide: Watercolor purple nodes with fine specks and splatter drops.
 * Organic, editorial feel — not corporate charts. The nodes subtly evoke
 * knowledge graph connections without being literal.
 * 
 * Palette:
 *   Deep Purple:   #3D1A78
 *   Brand Purple:  #6C3CE1
 *   Medium Purple: #9B7AE8
 *   Light Lavender:#D4B8F0
 *   Faint Wash:    #EDE4F7
 *   Paper:         #F8F6F1
 */

// ── Palette ──
const DEEP = '#3D1A78';
const BRAND = '#6C3CE1';
const MEDIUM = '#9B7AE8';
const LIGHT = '#D4B8F0';
const WASH = '#EDE4F7';
const PAPER = '#F8F6F1';
const INK = '#2D1B4E';
const GRAY = '#8892a4';

function escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Seeded pseudo-random for deterministic speck placement */
function seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return s / 2147483647;
    };
}

/** Shared SVG filter definitions for the watercolor aesthetic */
function watercolorDefs(): string {
    return `<defs>
    <!-- Paper grain texture -->
    <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise"/>
        <feColorMatrix type="saturate" values="0" in="noise" result="gray"/>
        <feBlend in="SourceGraphic" in2="gray" mode="multiply" result="blend"/>
        <feComponentTransfer in="blend"><feFuncA type="linear" slope="0.97"/></feComponentTransfer>
    </filter>
    <!-- Watercolor blob softener — subtle organic edges, not watery -->
    <filter id="wc-soft" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="2" result="warp"/>
        <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <!-- Gentle glow for nodes -->
    <filter id="wc-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="4" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <!-- Radial gradients for watercolor nodes -->
    <radialGradient id="node-deep" cx="40%" cy="40%"><stop offset="0%" stop-color="${DEEP}" stop-opacity="0.92"/><stop offset="55%" stop-color="${BRAND}" stop-opacity="0.7"/><stop offset="85%" stop-color="${MEDIUM}" stop-opacity="0.4"/><stop offset="100%" stop-color="${LIGHT}" stop-opacity="0.12"/></radialGradient>
    <radialGradient id="node-mid" cx="45%" cy="35%"><stop offset="0%" stop-color="${BRAND}" stop-opacity="0.85"/><stop offset="50%" stop-color="${MEDIUM}" stop-opacity="0.6"/><stop offset="85%" stop-color="${LIGHT}" stop-opacity="0.3"/><stop offset="100%" stop-color="${WASH}" stop-opacity="0.08"/></radialGradient>
    <radialGradient id="node-faint" cx="50%" cy="50%"><stop offset="0%" stop-color="${MEDIUM}" stop-opacity="0.7"/><stop offset="60%" stop-color="${LIGHT}" stop-opacity="0.45"/><stop offset="100%" stop-color="${WASH}" stop-opacity="0.1"/></radialGradient>
</defs>`;
}

/** Generate ambient purple specks scattered across the SVG */
function renderSpecks(width: number, height: number, count: number, seed: number = 42): string {
    const rng = seededRandom(seed);
    const purples = [DEEP, BRAND, MEDIUM, LIGHT];
    let specks = '';
    for (let i = 0; i < count; i++) {
        const x = rng() * width;
        const y = rng() * height;
        const r = 0.5 + rng() * 2;
        const color = purples[Math.floor(rng() * purples.length)]!;
        const opacity = 0.08 + rng() * 0.25;
        specks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`;
    }
    return specks;
}

/** Render a watercolor node blob — solid paint drop with subtle organic edges */
function renderWcNode(cx: number, cy: number, r: number, variant: 'deep' | 'mid' | 'faint' = 'deep'): string {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#node-${variant})" filter="url(#wc-soft)"/>`;
}

/** Render a dotted trail between two points (the speck-chain style) */
function renderDotTrail(x1: number, y1: number, x2: number, y2: number, dots: number = 12, seed: number = 7): string {
    const rng = seededRandom(seed);
    let trail = '';
    for (let i = 0; i <= dots; i++) {
        const t = i / dots;
        const x = x1 + (x2 - x1) * t + (rng() - 0.5) * 4;
        const y = y1 + (y2 - y1) * t + (rng() - 0.5) * 4;
        const r = 0.8 + rng() * 1.5;
        const opacity = 0.15 + (1 - Math.abs(t - 0.5) * 2) * 0.35;
        trail += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${MEDIUM}" opacity="${opacity.toFixed(2)}"/>`;
    }
    return trail;
}

/** Fodda watermark */
function watermark(width: number, height: number): string {
    return `<text x="${width - 12}" y="${height - 10}" font-family="Inter, system-ui, sans-serif" font-size="8" fill="${LIGHT}" text-anchor="end" opacity="0.6">Powered by Fodda</text>`;
}

// ════════════════════════════════════════════════
// CHART GENERATORS
// ════════════════════════════════════════════════

/**
 * Cultural Shift Arrows — Bold "From → To" transitions.
 */
export function renderCulturalShifts(shifts: Array<{ from: string; to: string }>): string {
    const rowHeight = 68;
    const padding = 24;
    const width = 580;
    const height = padding * 2 + shifts.length * rowHeight + 48;

    let rows = '';
    const rng = seededRandom(99);
    shifts.forEach((shift, i) => {
        const y = padding + 48 + i * rowHeight;
        const nodeR = 14 + rng() * 4;
        // Left watercolor blob
        rows += renderWcNode(padding + 28, y + 22, nodeR, i % 2 === 0 ? 'deep' : 'mid');
        // Right watercolor blob
        rows += renderWcNode(width - padding - 28, y + 22, nodeR * 0.9, i % 2 === 0 ? 'mid' : 'deep');
        // Dot trail between them
        rows += renderDotTrail(padding + 50, y + 22, width - padding - 50, y + 22, 18, i * 31 + 5);
        // Labels
        rows += `<text x="${padding + 58}" y="${y + 27}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600" fill="${INK}">${escapeXml(shift.from)}</text>`;
        rows += `<text x="${width / 2}" y="${y + 27}" font-family="Inter, system-ui, sans-serif" font-size="16" fill="${BRAND}" text-anchor="middle" font-weight="700">→</text>`;
        rows += `<text x="${width - padding - 58}" y="${y + 27}" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600" fill="${DEEP}" text-anchor="end">${escapeXml(shift.to)}</text>`;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    ${watercolorDefs()}
    <rect width="${width}" height="${height}" rx="12" fill="${PAPER}"/>
    ${renderSpecks(width, height, 35, 77)}
    <text x="${width / 2}" y="${padding + 24}" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="700" fill="${INK}" text-anchor="middle" letter-spacing="0.5">Cultural Shifts</text>
    ${rows}
    ${watermark(width, height)}
</svg>`;
}

/**
 * Competitive Positioning Compass — Brands plotted on two strategic axes.
 */
export function renderCompetitiveCompass(
    brands: Array<{ name: string; x: number; y: number }>,
    axisLabels: { left: string; right: string; top: string; bottom: string }
): string {
    const size = 500;
    const margin = 65;
    const center = size / 2;
    const plotArea = size - margin * 2;

    let dots = '';
    const rng = seededRandom(42);
    brands.forEach((brand, i) => {
        const px = margin + brand.x * plotArea;
        const py = margin + (1 - brand.y) * plotArea;
        const r = 12 + rng() * 6;
        const variant = (['deep', 'mid', 'faint'] as const)[i % 3]!;
        dots += renderWcNode(px, py, r, variant);
        dots += `<text x="${px}" y="${py + r + 14}" font-family="Inter, system-ui, sans-serif" font-size="10" font-weight="600" fill="${INK}" text-anchor="middle">${escapeXml(brand.name)}</text>`;
    });

    // Connect nearby brands with subtle dot trails
    let trails = '';
    for (let i = 0; i < brands.length; i++) {
        for (let j = i + 1; j < brands.length; j++) {
            const dx = brands[i]!.x - brands[j]!.x;
            const dy = brands[i]!.y - brands[j]!.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.45) {
                const x1 = margin + brands[i]!.x * plotArea;
                const y1 = margin + (1 - brands[i]!.y) * plotArea;
                const x2 = margin + brands[j]!.x * plotArea;
                const y2 = margin + (1 - brands[j]!.y) * plotArea;
                trails += renderDotTrail(x1, y1, x2, y2, 10, i * 13 + j);
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${watercolorDefs()}
    <rect width="${size}" height="${size}" rx="12" fill="${PAPER}"/>
    ${renderSpecks(size, size, 50, 33)}
    <!-- Axis lines as faint dot trails -->
    ${renderDotTrail(margin, center, size - margin, center, 30, 1)}
    ${renderDotTrail(center, margin, center, size - margin, 30, 2)}
    <!-- Axis labels -->
    <text x="${margin - 8}" y="${center - 6}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="${MEDIUM}" text-anchor="end">${escapeXml(axisLabels.left)}</text>
    <text x="${size - margin + 8}" y="${center - 6}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="${MEDIUM}">${escapeXml(axisLabels.right)}</text>
    <text x="${center}" y="${margin - 12}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="${MEDIUM}" text-anchor="middle">${escapeXml(axisLabels.top)}</text>
    <text x="${center}" y="${size - margin + 18}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="${MEDIUM}" text-anchor="middle">${escapeXml(axisLabels.bottom)}</text>
    ${trails}
    ${dots}
    ${watermark(size, size)}
</svg>`;
}

/**
 * Trend Constellation — Network diagram showing how trends relate.
 * Dark background with glowing watercolor nodes and speck trails.
 */
export function renderTrendConstellation(
    trends: Array<{ name: string; x: number; y: number }>,
    connections: Array<{ from: number; to: number; strength: number }>
): string {
    const size = 520;
    const margin = 70;
    const plotArea = size - margin * 2;

    let lines = '';
    connections.forEach(conn => {
        const from = trends[conn.from];
        const to = trends[conn.to];
        if (!from || !to) return;
        const x1 = margin + from.x * plotArea;
        const y1 = margin + from.y * plotArea;
        const x2 = margin + to.x * plotArea;
        const y2 = margin + to.y * plotArea;
        lines += renderDotTrail(x1, y1, x2, y2, Math.round(8 + conn.strength * 12), conn.from * 7 + conn.to);
    });

    let nodes = '';
    trends.forEach((trend, i) => {
        const px = margin + trend.x * plotArea;
        const py = margin + trend.y * plotArea;
        const r = 14 + (i % 3) * 4;
        const variant = (['deep', 'mid', 'faint'] as const)[i % 3]!;
        nodes += renderWcNode(px, py, r, variant);
        nodes += `<text x="${px}" y="${py + r + 14}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="${INK}" text-anchor="middle">${escapeXml(trend.name)}</text>`;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${watercolorDefs()}
    <rect width="${size}" height="${size}" rx="12" fill="${PAPER}"/>
    ${renderSpecks(size, size, 60, 88)}
    <text x="${size / 2}" y="32" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="700" fill="${INK}" text-anchor="middle" letter-spacing="0.5">Trend Constellation</text>
    ${lines}
    ${nodes}
    ${watermark(size, size)}
</svg>`;
}

/**
 * Strategic Implication Ladder — Signal → Trend → So What → Do What.
 * Vertical flow with watercolor nodes at each rung.
 */
export function renderImplicationLadder(steps: { signal: string; trend: string; so_what: string; do_what: string }): string {
    const width = 480;
    const height = 380;
    const labels = ['Signal', 'Trend', 'So What', 'Do What'];
    const values = [steps.signal, steps.trend, steps.so_what, steps.do_what];
    const variants: ('faint' | 'mid' | 'mid' | 'deep')[] = ['faint', 'mid', 'mid', 'deep'];

    let blocks = '';
    const cx = 50;
    for (let i = 0; i < 4; i++) {
        const y = 60 + i * 78;
        const r = 12 + i * 3; // Grows deeper and larger as you descend
        blocks += renderWcNode(cx, y, r, variants[i]!);
        blocks += `<text x="${cx + 30}" y="${y - 6}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="700" fill="${MEDIUM}" letter-spacing="1">${labels[i]!.toUpperCase()}</text>`;
        blocks += `<text x="${cx + 30}" y="${y + 10}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="500" fill="${INK}">${escapeXml(values[i]!.substring(0, 60))}${values[i]!.length > 60 ? '…' : ''}</text>`;
        if (i < 3) {
            blocks += renderDotTrail(cx, y + r + 4, cx, y + 78 - r - 4, 8, i * 17);
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    ${watercolorDefs()}
    <rect width="${width}" height="${height}" rx="12" fill="${PAPER}"/>
    ${renderSpecks(width, height, 30, 55)}
    <text x="${width / 2}" y="36" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="700" fill="${INK}" text-anchor="middle" letter-spacing="0.5">Strategic Implication</text>
    ${blocks}
    ${watermark(width, height)}
</svg>`;
}

/**
 * Innovation Pathway — Now → Near-Term → Future Vision.
 * Three watercolor nodes connected by speck trails.
 */
export function renderInnovationPathway(stages: { now: string; near_term: string; future: string }): string {
    const width = 600;
    const height = 200;
    const labels = ['Now', 'Near-Term Shift', 'Future Vision'];
    const values = [stages.now, stages.near_term, stages.future];
    const variants: ('faint' | 'mid' | 'deep')[] = ['faint', 'mid', 'deep'];
    const positions = [100, 300, 500];

    let content = '';
    for (let i = 0; i < 3; i++) {
        const x = positions[i]!;
        const r = 22 + i * 5;
        content += renderWcNode(x, 90, r, variants[i]!);
        content += `<text x="${x}" y="${90 + r + 18}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="700" fill="${MEDIUM}" text-anchor="middle" letter-spacing="0.8">${labels[i]!.toUpperCase()}</text>`;
        content += `<text x="${x}" y="${90 + r + 32}" font-family="Inter, system-ui, sans-serif" font-size="10" font-weight="500" fill="${INK}" text-anchor="middle">${escapeXml(values[i]!.substring(0, 35))}${values[i]!.length > 35 ? '…' : ''}</text>`;
        if (i < 2) {
            content += renderDotTrail(x + r + 8, 90, positions[i + 1]! - (22 + (i + 1) * 5) - 8, 90, 14, i * 23);
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    ${watercolorDefs()}
    <rect width="${width}" height="${height}" rx="12" fill="${PAPER}"/>
    ${renderSpecks(width, height, 25, 44)}
    <text x="${width / 2}" y="30" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="700" fill="${INK}" text-anchor="middle" letter-spacing="0.5">Innovation Pathway</text>
    ${content}
    ${watermark(width, height)}
</svg>`;
}

/**
 * Opportunity White Space Map — 2×2 quadrant for strategic assessment.
 * Watercolor nodes positioned in the quadrant space.
 */
export function renderWhiteSpaceMap(
    items: Array<{ name: string; consumer_desire: number; market_activity: number }>,
    xLabel?: string,
    yLabel?: string
): string {
    const size = 480;
    const margin = 70;
    const center = size / 2;
    const plotArea = size - margin * 2;

    // Light watercolor wash in the "build here" quadrant (high desire, low activity = top-left)
    const goldZone = `<circle cx="${margin + plotArea * 0.25}" cy="${margin + plotArea * 0.25}" r="${plotArea * 0.22}" fill="${WASH}" opacity="0.4" filter="url(#wc-soft)"/>
    <text x="${margin + plotArea * 0.25}" y="${margin + 20}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="700" fill="${BRAND}" text-anchor="middle" opacity="0.5">★ BUILD HERE</text>`;

    let dots = '';
    items.forEach((item, i) => {
        const px = margin + item.market_activity * plotArea;
        const py = margin + (1 - item.consumer_desire) * plotArea;
        const r = 13 + (i % 3) * 3;
        const variant = (['deep', 'mid', 'faint'] as const)[i % 3]!;
        dots += renderWcNode(px, py, r, variant);
        dots += `<text x="${px}" y="${py - r - 4}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="${INK}" text-anchor="middle">${escapeXml(item.name)}</text>`;
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${watercolorDefs()}
    <rect width="${size}" height="${size}" rx="12" fill="${PAPER}"/>
    ${renderSpecks(size, size, 45, 66)}
    <text x="${size / 2}" y="30" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="700" fill="${INK}" text-anchor="middle" letter-spacing="0.5">Opportunity Map</text>
    ${goldZone}
    <!-- Axis trails -->
    ${renderDotTrail(margin, center, size - margin, center, 25, 3)}
    ${renderDotTrail(center, margin, center, size - margin, 25, 4)}
    <text x="${center}" y="${size - margin + 18}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="${MEDIUM}" text-anchor="middle">${escapeXml(xLabel || 'Market Activity →')}</text>
    <text x="${margin - 12}" y="${center}" font-family="Inter, system-ui, sans-serif" font-size="9" font-weight="600" fill="${MEDIUM}" text-anchor="middle" transform="rotate(-90,${margin - 12},${center})">${escapeXml(yLabel || 'Consumer Desire →')}</text>
    ${dots}
    ${watermark(size, size)}
</svg>`;
}
