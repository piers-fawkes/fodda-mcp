/**
 * Verification Test: v2.2 MCP Visual House Style & Server SVG Template Hardening
 */

import {
    renderCulturalShifts,
    renderCompetitiveCompass,
    renderTrendConstellation,
    renderImplicationLadder,
    renderInnovationPathway,
    renderWhiteSpaceMap,
} from './svgVisuals.js';
import {
    FODDA_HOUSE_VISUAL_RECIPE_V2_2,
    FODDA_HOUSE_VISUAL_RECIPE_CONFIRM_THEMES,
} from './systemPrompt.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✅ ${msg}`);
        passed++;
    } else {
        console.error(`  ❌ ${msg}`);
        failed++;
    }
}

console.log('\n--- 1. Testing Server-Side SVG Templates ---');

// 1. cultural_shifts
const shiftsSvg = renderCulturalShifts([
    { from: 'Mass Production', to: 'Micro-Batch Customization' },
    { from: 'Seasonal Drops', to: 'Continuous Real-Time Curation' },
]);
assert(shiftsSvg.includes('class="fodda-viz"'), 'cultural_shifts has class="fodda-viz"');
assert(shiftsSvg.includes('.fodda-viz {'), 'cultural_shifts styles scoped to .fodda-viz');
assert(!shiftsSvg.includes(':root {'), 'cultural_shifts does NOT contain :root');
const svgOpenTag = shiftsSvg.slice(0, shiftsSvg.indexOf('>'));
assert(svgOpenTag.includes('width="100%"'), 'cultural_shifts opening svg tag has width="100%"');
assert(!svgOpenTag.includes('width="500"'), 'cultural_shifts opening svg tag does not have fixed pixel width');
assert(shiftsSvg.includes('fill="currentColor"'), 'cultural_shifts uses fill="currentColor"');
assert(shiftsSvg.includes('var(--fodda-accent)'), 'cultural_shifts uses var(--fodda-accent)');
assert(shiftsSvg.includes('shape-rendering="crispEdges"'), 'cultural_shifts uses crispEdges on rectilinear divider lines');

// 2. competitive_compass
const compassSvg = renderCompetitiveCompass(
    [
        { name: 'Brand A', x: 0.2, y: 0.8 },
        { name: 'Brand B', x: 0.8, y: 0.3 },
        { name: 'Brand C', x: 0.5, y: 0.5 },
    ],
    { left: 'Traditional', right: 'Innovative', top: 'Premium', bottom: 'Mass' }
);
assert(compassSvg.includes('class="fodda-viz"'), 'competitive_compass has class="fodda-viz"');
assert(compassSvg.includes('.fodda-viz {'), 'competitive_compass styles scoped to .fodda-viz');
assert(compassSvg.includes('width="100%"'), 'competitive_compass has width="100%"');
assert(compassSvg.includes('shape-rendering="crispEdges"'), 'competitive_compass has crispEdges on 90° axis lines');
assert(compassSvg.includes('stroke="var(--fodda-line)"'), 'competitive_compass uses var(--fodda-line)');
assert(compassSvg.includes('fill="var(--fodda-accent)"'), 'competitive_compass highlights primary brand with var(--fodda-accent)');

// 3. trend_constellation
const constellationSvg = renderTrendConstellation(
    [
        { name: 'Digital Identity', x: 0.2, y: 0.3 },
        { name: 'Synthetic Media', x: 0.7, y: 0.4 },
        { name: 'Autonomous Agents', x: 0.4, y: 0.8 },
    ],
    [
        { from: 0, to: 1, strength: 0.8 },
        { from: 1, to: 2, strength: 0.6 },
    ]
);
assert(constellationSvg.includes('class="fodda-viz"'), 'trend_constellation has class="fodda-viz"');
assert(constellationSvg.includes('width="100%"'), 'trend_constellation has width="100%"');
assert(!constellationSvg.includes('shape-rendering="crispEdges"'), 'trend_constellation does NOT apply crispEdges to diagonal connectors');

// 4. implication_ladder
const ladderSvg = renderImplicationLadder({
    signal: 'Gen Z uses TikTok as primary search engine',
    trend: 'Algorithmic Visual Discovery',
    so_what: 'Text-first SEO ranking value drops 40%',
    do_what: 'Reallocate 30% of content budget to short-form indexed video',
});
assert(ladderSvg.includes('class="fodda-viz"'), 'implication_ladder has class="fodda-viz"');
assert(ladderSvg.includes('width="100%"'), 'implication_ladder has width="100%"');
assert(ladderSvg.includes('shape-rendering="crispEdges"'), 'implication_ladder uses crispEdges on vertical spine line');
assert(ladderSvg.includes('fill="var(--fodda-accent)"'), 'implication_ladder highlights "Do What" rung with accent');

// 5. innovation_pathway
const pathwaySvg = renderInnovationPathway({
    now: 'Fragmented manual research',
    near_term: 'Agent-assisted synthesis',
    future: 'Autonomous intelligence loops',
});
assert(pathwaySvg.includes('class="fodda-viz"'), 'innovation_pathway has class="fodda-viz"');
assert(pathwaySvg.includes('width="100%"'), 'innovation_pathway has width="100%"');
assert(pathwaySvg.includes('shape-rendering="crispEdges"'), 'innovation_pathway uses crispEdges on horizontal connector line');
assert(pathwaySvg.includes('fill="var(--fodda-accent)"'), 'innovation_pathway highlights future vision step with accent');

// 6. opportunity_map
const mapSvg = renderWhiteSpaceMap(
    [
        { name: 'Feature X', consumer_desire: 0.9, market_activity: 0.1 },
        { name: 'Feature Y', consumer_desire: 0.3, market_activity: 0.8 },
    ],
    'Market Activity →',
    'Consumer Desire →'
);
assert(mapSvg.includes('class="fodda-viz"'), 'opportunity_map has class="fodda-viz"');
assert(mapSvg.includes('width="100%"'), 'opportunity_map has width="100%"');
assert(mapSvg.includes('★ BUILD HERE'), 'opportunity_map renders ★ BUILD HERE zone');
assert(mapSvg.includes('shape-rendering="crispEdges"'), 'opportunity_map applies crispEdges on 90° axes');

console.log('\n--- 2. Testing Client-Rendered Multi-Item Guidance Recipes ---');
assert(FODDA_HOUSE_VISUAL_RECIPE_V2_2.includes('[Fodda House Visual Recipe v2.2]'), 'Recipe v2.2 contains header');
assert(FODDA_HOUSE_VISUAL_RECIPE_V2_2.includes('currentColor and host CSS variables'), 'Recipe v2.2 mentions currentColor');
assert(FODDA_HOUSE_VISUAL_RECIPE_V2_2.includes('Light mode: Bg #ffffff / #faf9f5'), 'Recipe v2.2 contains light mode palette');
assert(FODDA_HOUSE_VISUAL_RECIPE_V2_2.includes('Dark mode: Bg #18181b'), 'Recipe v2.2 contains dark mode palette');
assert(FODDA_HOUSE_VISUAL_RECIPE_CONFIRM_THEMES.includes('Layout hint: Horizontal progress stepper'), 'confirm_themes recipe has stepper layout hint');

import fs from 'fs';
import path from 'path';

// Generate HTML gallery for manual visual verification (Light Mode, Dark Mode, 380px column)
const htmlGallery = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Fodda MCP Visual Hardening v2.2 - Preview Gallery</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    padding: 24px;
    background: #e2e8f0;
    color: #1e293b;
  }
  h1, h2 { margin-top: 0; }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-bottom: 32px;
  }
  .preview-card {
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
  }
  .light-theme {
    background: #ffffff;
    color: #18181b;
  }
  .dark-theme {
    background: #18181b;
    color: #f4f4f5;
  }
  .mobile-container {
    width: 380px;
    margin: 0 auto;
    border: 2px dashed #94a3b8;
    padding: 12px;
    border-radius: 12px;
  }
  .section-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #cbd5e1;
  }
</style>
</head>
<body>
  <h1>Fodda MCP Visual House Style & Server SVG Hardening (v2.2)</h1>
  <p>Visual verification suite for Light Theme, Dark Theme, and Narrow Mobile Viewport (380px).</p>

  <h2 class="section-title">1. Cultural Shifts</h2>
  <div class="grid">
    <div class="preview-card light-theme">
      <h3>Light Mode</h3>
      ${shiftsSvg}
    </div>
    <div class="preview-card dark-theme">
      <h3>Dark Mode</h3>
      ${shiftsSvg}
    </div>
  </div>

  <h2 class="section-title">2. Competitive Positioning Compass</h2>
  <div class="grid">
    <div class="preview-card light-theme">
      <h3>Light Mode (Standard)</h3>
      ${compassSvg}
    </div>
    <div class="preview-card dark-theme">
      <h3>Dark Mode (Standard)</h3>
      ${compassSvg}
    </div>
  </div>
  <div class="mobile-container light-theme">
    <h3>Mobile 380px Container (Light)</h3>
    ${compassSvg}
  </div>

  <h2 class="section-title">3. Trend Constellation</h2>
  <div class="grid">
    <div class="preview-card light-theme">
      <h3>Light Mode</h3>
      ${constellationSvg}
    </div>
    <div class="preview-card dark-theme">
      <h3>Dark Mode</h3>
      ${constellationSvg}
    </div>
  </div>

  <h2 class="section-title">4. Strategic Implication Ladder</h2>
  <div class="grid">
    <div class="preview-card light-theme">
      <h3>Light Mode</h3>
      ${ladderSvg}
    </div>
    <div class="preview-card dark-theme">
      <h3>Dark Mode</h3>
      ${ladderSvg}
    </div>
  </div>

  <h2 class="section-title">5. Innovation Pathway</h2>
  <div class="grid">
    <div class="preview-card light-theme">
      <h3>Light Mode</h3>
      ${pathwaySvg}
    </div>
    <div class="preview-card dark-theme">
      <h3>Dark Mode</h3>
      ${pathwaySvg}
    </div>
  </div>

  <h2 class="section-title">6. Opportunity White Space Map</h2>
  <div class="grid">
    <div class="preview-card light-theme">
      <h3>Light Mode</h3>
      ${mapSvg}
    </div>
    <div class="preview-card dark-theme">
      <h3>Dark Mode</h3>
      ${mapSvg}
    </div>
  </div>
</body>
</html>`;

const scratchDir = path.resolve('scratch');
if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
fs.writeFileSync(path.join(scratchDir, 'visual_preview.html'), htmlGallery, 'utf8');
console.log('  ✅ Generated scratch/visual_preview.html gallery for manual visual inspection.');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('🎉 All tests passed successfully!');
}
