/**
 * SVG Visual Generator for Fodda MCP (v2.2 House Visual Style)
 * 
 * Aesthetic: Editorial density (dots, ticks, rungs, dumbbell bars, ledger grids).
 * Scoped styles: .fodda-viz with light/dark theme variables, currentColor text,
 * responsive viewBox width="100%", and crisp rectilinear hairlines.
 */

function escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Shared SVG theme style definitions scoped strictly to .fodda-viz */
function svgThemeBlock(): string {
    return `<defs>
    <style>
      .fodda-viz {
        --fodda-bg: #ffffff;
        --fodda-text: #18181b;
        --fodda-muted: #71717a;
        --fodda-line: #e4e4e7;
        --fodda-accent: #663399;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-variant-numeric: tabular-nums;
      }
      @media (prefers-color-scheme: dark) {
        .fodda-viz {
          --fodda-bg: #18181b;
          --fodda-text: #f4f4f5;
          --fodda-muted: #a1a1aa;
          --fodda-line: #27272a;
          --fodda-accent: #9d65d4;
        }
      }
    </style>
  </defs>`;
}

/** Fodda watermark */
function watermark(width: number, height: number): string {
    return `<text x="${width - 16}" y="${height - 12}" font-size="9" fill="var(--fodda-muted)" text-anchor="end" opacity="0.6">Powered by Fodda</text>`;
}

// ════════════════════════════════════════════════
// CHART GENERATORS
// ════════════════════════════════════════════════

/**
 * Cultural Shift Arrows — Bold "From → To" transitions.
 */
export function renderCulturalShifts(shifts: Array<{ from: string; to: string }>): string {
    const rowHeight = 54;
    const padding = 20;
    const width = 500;
    const items = Array.isArray(shifts) ? shifts : [];
    const height = Math.max(160, padding * 2 + items.length * rowHeight + 40);

    let rows = '';
    items.forEach((shift, i) => {
        const y = padding + 40 + i * rowHeight;
        const isLast = i === items.length - 1;

        // Dumbbell / rung dot on left
        rows += `<circle cx="${padding + 16}" cy="${y + 14}" r="4.5" fill="var(--fodda-muted)"/>`;
        // From text
        rows += `<text x="${padding + 28}" y="${y + 18}" font-size="12" font-weight="500" fill="var(--fodda-muted)">${escapeXml(shift.from || '')}</text>`;
        // Arrow connector
        rows += `<text x="${width / 2}" y="${y + 18}" font-size="14" font-weight="700" fill="var(--fodda-accent)" text-anchor="middle">→</text>`;
        // To text (highlighted)
        rows += `<text x="${width - padding - 28}" y="${y + 18}" font-size="12" font-weight="600" fill="currentColor" text-anchor="end">${escapeXml(shift.to || '')}</text>`;
        // Rung dot on right
        rows += `<circle cx="${width - padding - 16}" cy="${y + 14}" r="4.5" fill="var(--fodda-accent)"/>`;

        // Row divider hairline (except after last row)
        if (!isLast) {
            rows += `<line x1="${padding + 12}" y1="${y + rowHeight - 6}" x2="${width - padding - 12}" y2="${y + rowHeight - 6}" stroke="var(--fodda-line)" stroke-width="1" shape-rendering="crispEdges"/>`;
        }
    });

    return `<svg class="fodda-viz" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%">
    ${svgThemeBlock()}
    <rect width="${width}" height="${height}" rx="12" fill="var(--fodda-bg)" stroke="var(--fodda-line)" stroke-width="1"/>
    <text x="${width / 2}" y="${padding + 18}" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle" letter-spacing="0.5">Cultural Shifts</text>
    ${rows}
    ${watermark(width, height)}
</svg>`;
}

/**
 * Competitive Positioning Compass — Brands plotted on two strategic axes.
 * Pure points on 2 axes with no artificial connector lines.
 */
export function renderCompetitiveCompass(
    brands: Array<{ name: string; x: number; y: number; focus?: boolean; is_focus?: boolean; highlight?: boolean }>,
    axisLabels: { left: string; right: string; top: string; bottom: string },
    focusBrand?: string
): string {
    const size = 460;
    const margin = 50;
    const center = size / 2;
    const plotArea = size - margin * 2;
    const brandList = Array.isArray(brands) ? brands : [];

    let dots = '';
    brandList.forEach((brand) => {
        // Clamp brand positions within plot area so labels don't clip
        const rawX = typeof brand.x === 'number' ? Math.max(0.06, Math.min(0.94, brand.x)) : 0.5;
        const rawY = typeof brand.y === 'number' ? Math.max(0.06, Math.min(0.94, brand.y)) : 0.5;
        const px = margin + rawX * plotArea;
        const py = margin + (1 - rawY) * plotArea;
        const isFocal = Boolean(
            brand.focus ||
            brand.is_focus ||
            brand.highlight ||
            (focusBrand && brand.name?.trim().toLowerCase() === focusBrand.trim().toLowerCase())
        );

        const nodeFill = isFocal ? 'var(--fodda-accent)' : 'var(--fodda-bg)';
        const nodeStroke = isFocal ? 'var(--fodda-accent)' : 'var(--fodda-line)';
        const nodeR = isFocal ? 7 : 5.5;
        dots += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${nodeR}" fill="${nodeFill}" stroke="${nodeStroke}" stroke-width="2"/>`;
        
        // Offset label vertically based on Y position to prevent collision with axes/edges
        const labelY = py > margin + 25 ? py - 9 : py + 18;
        dots += `<text x="${px.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="11" font-weight="${isFocal ? '700' : '600'}" fill="currentColor" text-anchor="middle">${escapeXml(brand.name || '')}</text>`;
    });

    const leftText = axisLabels?.left ? `← ${axisLabels.left}` : '';
    const rightText = axisLabels?.right ? `${axisLabels.right} →` : '';

    return `<svg class="fodda-viz" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%">
    ${svgThemeBlock()}
    <rect width="${size}" height="${size}" rx="12" fill="var(--fodda-bg)" stroke="var(--fodda-line)" stroke-width="1"/>
    <!-- Rectilinear 90° Axis Lines -->
    <line x1="${margin}" y1="${center}" x2="${size - margin}" y2="${center}" stroke="var(--fodda-line)" stroke-width="1" stroke-dasharray="3 3" shape-rendering="crispEdges"/>
    <line x1="${center}" y1="${margin}" x2="${center}" y2="${size - margin}" stroke="var(--fodda-line)" stroke-width="1" stroke-dasharray="3 3" shape-rendering="crispEdges"/>
    <!-- Axis Labels anchored inward below horizontal axis line to prevent baseline collision with brand labels -->
    <text x="${margin + 6}" y="${center + 14}" font-size="10" font-weight="600" fill="var(--fodda-muted)" text-anchor="start">${escapeXml(leftText)}</text>
    <text x="${size - margin - 6}" y="${center + 14}" font-size="10" font-weight="600" fill="var(--fodda-muted)" text-anchor="end">${escapeXml(rightText)}</text>
    <text x="${center}" y="${margin - 14}" font-size="10" font-weight="600" fill="var(--fodda-muted)" text-anchor="middle">${escapeXml(axisLabels?.top || '')}</text>
    <text x="${center}" y="${size - margin + 22}" font-size="10" font-weight="600" fill="var(--fodda-muted)" text-anchor="middle">${escapeXml(axisLabels?.bottom || '')}</text>
    ${dots}
    ${watermark(size, size)}
</svg>`;
}

/**
 * Trend Constellation — Network diagram showing how trends relate.
 */
export function renderTrendConstellation(
    trends: Array<{ name: string; x: number; y: number; focus?: boolean; is_focus?: boolean; highlight?: boolean }>,
    connections: Array<{ from: number; to: number; strength: number }>,
    focusTrend?: string
): string {
    const size = 480;
    const margin = 55;
    const plotArea = size - margin * 2;
    const trendList = Array.isArray(trends) ? trends : [];
    const connList = Array.isArray(connections) ? connections : [];

    let lines = '';
    connList.forEach(conn => {
        const from = trendList[conn.from];
        const to = trendList[conn.to];
        if (!from || !to) return;
        const x1 = margin + (from.x || 0) * plotArea;
        const y1 = margin + (from.y || 0) * plotArea;
        const x2 = margin + (to.x || 0) * plotArea;
        const y2 = margin + (to.y || 0) * plotArea;
        const strokeW = Math.max(1, Math.min(3, Math.round((conn.strength || 0.5) * 2.5)));
        lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--fodda-line)" stroke-width="${strokeW}" opacity="0.8"/>`;
    });

    let nodes = '';
    trendList.forEach((trend) => {
        const rawX = typeof trend.x === 'number' ? Math.max(0.06, Math.min(0.94, trend.x)) : 0.5;
        const rawY = typeof trend.y === 'number' ? Math.max(0.06, Math.min(0.94, trend.y)) : 0.5;
        const px = margin + rawX * plotArea;
        const py = margin + rawY * plotArea;
        const isFocal = Boolean(
            trend.focus ||
            trend.is_focus ||
            trend.highlight ||
            (focusTrend && trend.name?.trim().toLowerCase() === focusTrend.trim().toLowerCase())
        );

        const nodeFill = isFocal ? 'var(--fodda-accent)' : 'var(--fodda-bg)';
        const nodeStroke = isFocal ? 'var(--fodda-accent)' : 'var(--fodda-line)';
        const r = isFocal ? 7 : 5.5;
        nodes += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}" fill="${nodeFill}" stroke="${nodeStroke}" stroke-width="2"/>`;
        nodes += `<text x="${px.toFixed(1)}" y="${(py + r + 13).toFixed(1)}" font-size="11" font-weight="${isFocal ? '700' : '600'}" fill="currentColor" text-anchor="middle">${escapeXml(trend.name || '')}</text>`;
    });

    return `<svg class="fodda-viz" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%">
    ${svgThemeBlock()}
    <rect width="${size}" height="${size}" rx="12" fill="var(--fodda-bg)" stroke="var(--fodda-line)" stroke-width="1"/>
    <text x="${size / 2}" y="32" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle" letter-spacing="0.5">Trend Constellation</text>
    ${lines}
    ${nodes}
    ${watermark(size, size)}
</svg>`;
}

/**
 * Strategic Implication Ladder — Signal → Trend → So What → Do What.
 */
export function renderImplicationLadder(steps: { signal: string; trend: string; so_what: string; do_what: string }): string {
    const width = 460;
    const height = 360;
    const labels = ['Signal', 'Trend', 'So What', 'Do What'];
    const values = [steps?.signal || '', steps?.trend || '', steps?.so_what || '', steps?.do_what || ''];

    let blocks = '';
    const spineX = 40;
    // Vertical spine line
    blocks += `<line x1="${spineX}" y1="65" x2="${spineX}" y2="295" stroke="var(--fodda-line)" stroke-width="2" shape-rendering="crispEdges"/>`;

    for (let i = 0; i < 4; i++) {
        const y = 65 + i * 76;
        const isFinal = i === 3;
        const nodeFill = isFinal ? 'var(--fodda-accent)' : 'var(--fodda-bg)';
        const nodeStroke = isFinal ? 'var(--fodda-accent)' : 'var(--fodda-line)';
        const nodeR = isFinal ? 7 : 5.5;

        blocks += `<circle cx="${spineX}" cy="${y}" r="${nodeR}" fill="${nodeFill}" stroke="${nodeStroke}" stroke-width="2"/>`;
        blocks += `<text x="${spineX + 22}" y="${y - 4}" font-size="9" font-weight="700" fill="${isFinal ? 'var(--fodda-accent)' : 'var(--fodda-muted)'}" letter-spacing="1">${labels[i]!.toUpperCase()}</text>`;
        blocks += `<text x="${spineX + 22}" y="${y + 14}" font-size="11" font-weight="${isFinal ? '600' : '400'}" fill="currentColor">${escapeXml(values[i]!.substring(0, 65))}${values[i]!.length > 65 ? '…' : ''}</text>`;

        if (i < 3) {
            blocks += `<line x1="${spineX + 22}" y1="${y + 40}" x2="${width - 24}" y2="${y + 40}" stroke="var(--fodda-line)" stroke-width="1" stroke-dasharray="2 2" shape-rendering="crispEdges"/>`;
        }
    }

    return `<svg class="fodda-viz" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%">
    ${svgThemeBlock()}
    <rect width="${width}" height="${height}" rx="12" fill="var(--fodda-bg)" stroke="var(--fodda-line)" stroke-width="1"/>
    <text x="${width / 2}" y="32" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle" letter-spacing="0.5">Strategic Implication</text>
    ${blocks}
    ${watermark(width, height)}
</svg>`;
}

/**
 * Innovation Pathway — Now → Near-Term → Future Vision.
 */
export function renderInnovationPathway(stages: { now: string; near_term: string; future: string }): string {
    const width = 520;
    const height = 180;
    const labels = ['Now', 'Near-Term Shift', 'Future Vision'];
    const values = [stages?.now || '', stages?.near_term || '', stages?.future || ''];
    const positions = [85, 260, 435];

    let content = '';
    // Horizontal spine connecting nodes
    content += `<line x1="${positions[0]}" y1="85" x2="${positions[2]}" y2="85" stroke="var(--fodda-line)" stroke-width="2" shape-rendering="crispEdges"/>`;

    for (let i = 0; i < 3; i++) {
        const x = positions[i]!;
        const isFinal = i === 2;
        const nodeFill = isFinal ? 'var(--fodda-accent)' : 'var(--fodda-bg)';
        const nodeStroke = isFinal ? 'var(--fodda-accent)' : 'var(--fodda-line)';
        const nodeR = isFinal ? 8 : 6;

        content += `<circle cx="${x}" cy="85" r="${nodeR}" fill="${nodeFill}" stroke="${nodeStroke}" stroke-width="2"/>`;
        content += `<text x="${x}" y="60" font-size="9" font-weight="700" fill="${isFinal ? 'var(--fodda-accent)' : 'var(--fodda-muted)'}" text-anchor="middle" letter-spacing="0.8">${labels[i]!.toUpperCase()}</text>`;
        content += `<text x="${x}" y="116" font-size="11" font-weight="${isFinal ? '600' : '400'}" fill="currentColor" text-anchor="middle">${escapeXml(values[i]!.substring(0, 30))}${values[i]!.length > 30 ? '…' : ''}</text>`;
    }

    return `<svg class="fodda-viz" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%">
    ${svgThemeBlock()}
    <rect width="${width}" height="${height}" rx="12" fill="var(--fodda-bg)" stroke="var(--fodda-line)" stroke-width="1"/>
    <text x="${width / 2}" y="28" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle" letter-spacing="0.5">Innovation Pathway</text>
    ${content}
    ${watermark(width, height)}
</svg>`;
}

/**
 * Opportunity White Space Map — 2×2 quadrant for strategic assessment.
 */
export function renderWhiteSpaceMap(
    items: Array<{ name: string; consumer_desire: number; market_activity: number; focus?: boolean; is_focus?: boolean; highlight?: boolean }>,
    xLabel?: string,
    yLabel?: string,
    focusItem?: string
): string {
    const size = 460;
    const margin = 55;
    const center = size / 2;
    const plotArea = size - margin * 2;
    const itemList = Array.isArray(items) ? items : [];

    // "BUILD HERE" quadrant highlight (high desire, low activity = top-left quadrant)
    const quadSize = plotArea / 2;
    const goldZone = `<rect x="${margin}" y="${margin}" width="${quadSize}" height="${quadSize}" rx="6" fill="var(--fodda-accent)" fill-opacity="0.08" stroke="var(--fodda-accent)" stroke-opacity="0.25" stroke-dasharray="3 3"/>
    <text x="${margin + quadSize / 2}" y="${margin + 18}" font-size="9" font-weight="700" fill="var(--fodda-accent)" text-anchor="middle" letter-spacing="0.5">★ BUILD HERE</text>`;

    let dots = '';
    itemList.forEach((item) => {
        const rawX = typeof item.market_activity === 'number' ? Math.max(0.06, Math.min(0.94, item.market_activity)) : 0.5;
        const rawY = typeof item.consumer_desire === 'number' ? Math.max(0.06, Math.min(0.94, item.consumer_desire)) : 0.5;
        const px = margin + rawX * plotArea;
        const py = margin + (1 - rawY) * plotArea;
        const isFocal = Boolean(
            item.focus ||
            item.is_focus ||
            item.highlight ||
            (focusItem && item.name?.trim().toLowerCase() === focusItem.trim().toLowerCase())
        );

        const nodeFill = isFocal ? 'var(--fodda-accent)' : 'var(--fodda-bg)';
        const nodeStroke = isFocal ? 'var(--fodda-accent)' : 'var(--fodda-line)';
        const nodeR = isFocal ? 7 : 5.5;
        dots += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${nodeR}" fill="${nodeFill}" stroke="${nodeStroke}" stroke-width="2"/>`;
        dots += `<text x="${px.toFixed(1)}" y="${(py - 9).toFixed(1)}" font-size="11" font-weight="${isFocal ? '700' : '600'}" fill="currentColor" text-anchor="middle">${escapeXml(item.name || '')}</text>`;
    });

    return `<svg class="fodda-viz" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%">
    ${svgThemeBlock()}
    <rect width="${size}" height="${size}" rx="12" fill="var(--fodda-bg)" stroke="var(--fodda-line)" stroke-width="1"/>
    <text x="${size / 2}" y="28" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle" letter-spacing="0.5">Opportunity Map</text>
    ${goldZone}
    <!-- Rectilinear 90° Axis Lines -->
    <line x1="${margin}" y1="${center}" x2="${size - margin}" y2="${center}" stroke="var(--fodda-line)" stroke-width="1" stroke-dasharray="3 3" shape-rendering="crispEdges"/>
    <line x1="${center}" y1="${margin}" x2="${center}" y2="${size - margin}" stroke="var(--fodda-line)" stroke-width="1" stroke-dasharray="3 3" shape-rendering="crispEdges"/>
    <!-- Axis Labels -->
    <text x="${center}" y="${size - margin + 20}" font-size="10" font-weight="600" fill="var(--fodda-muted)" text-anchor="middle">${escapeXml(xLabel || 'Market Activity →')}</text>
    <text x="${margin - 12}" y="${center}" font-size="10" font-weight="600" fill="var(--fodda-muted)" text-anchor="middle" transform="rotate(-90,${margin - 12},${center})">${escapeXml(yLabel || 'Consumer Desire →')}</text>
    ${dots}
    ${watermark(size, size)}
</svg>`;
}
