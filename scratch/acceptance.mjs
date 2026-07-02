// End-to-end acceptance: drives the running MCP server with a real key.
// Start server first: PORT=8080 node dist/index.js  (loads .env)
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const KEY = process.env.FODDA_API_KEY;
const USER = 'piers.fawkes@psfk.com';
const BASE = process.env.MCP_BASE || 'http://localhost:8080';
console.log('target:', BASE);
const url = new URL(`${BASE}/mcp?api_key=${KEY}&user_id=${encodeURIComponent(USER)}`);

const transport = new StreamableHTTPClientTransport(url);
const { Client: MCPClient } = await import('@modelcontextprotocol/sdk/client/index.js');
const client = new MCPClient({ name: 'acceptance', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const kb = (n) => (n / 1024).toFixed(1) + 'KB';
const textOf = (r) => (r.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

// ── list_graphs ──
console.log('\n── list_graphs ──');
const lg = await client.callTool({ name: 'list_graphs', arguments: {} });
const lgText = textOf(lg);
const lgBytes = Buffer.byteLength(lgText, 'utf8');
console.log(`AFTER size: ${kb(lgBytes)}  (BEFORE raw /v1/graphs ~645KB compact / ~883KB pretty)`);
check('list_graphs ≤25KB', lgBytes <= 25 * 1024, kb(lgBytes));
for (const f of ['owner_email', 'owner_account_id', 'blog_post_content', 'portrait_url', 'what_it_does', 'mcp_url'])
  check(`  no "${f}"`, !lgText.includes(f), f);

// ── search_graph ──
console.log('\n── search_graph (retail, repro query) ──');
const sg = await client.callTool({ name: 'search_graph', arguments: { graphId: 'retail', query: 'small format curated retail concepts', include_evidence: true } });
// diagnostics: enumerate content blocks
console.log('content blocks:', (sg.content || []).map((c, i) => `[${i}] ${c.type} ${kb(Buffer.byteLength(c.text || JSON.stringify(c.resource || c) || '', 'utf8'))}`).join('  '));
const sgText = textOf(sg);
const sgBytes = Buffer.byteLength(sgText, 'utf8');
console.log(`AFTER size (all text blocks): ${kb(sgBytes)}  (BEFORE ~161.8KB compact / ~233KB pretty for 10 rows)`);
check('search_graph ≤25KB', sgBytes <= 25 * 1024, kb(sgBytes));
// robust: find the JSON block that actually carries rows
let sj = null;
for (const c of (sg.content || [])) {
  if (c.type !== 'text') continue;
  try { const o = JSON.parse(c.text); if (o && (o.rows || o.results)) { sj = o; break; } if (!sj && o) sj = o; } catch {}
}
const rows = sj?.rows || sj?.results || [];
console.log('parsed top-level keys:', sj ? Object.keys(sj).join(', ') : '(none)', '| rows:', rows.length);
if (rows.length) {
  const r0 = rows[0];
  check('  brandNames is array', Array.isArray(r0.brandNames), `${typeof r0.brandNames}`);
  check('  brand_count present', typeof r0.brand_count === 'number', `${r0.brand_count}`);
  check('  brandNames capped ≤10', !Array.isArray(r0.brandNames) || r0.brandNames.length <= 10, `len ${r0.brandNames?.length}`);
  check('  place is array', Array.isArray(r0.place), `${typeof r0.place}`);
  check('  place_count present', typeof r0.place_count === 'number', `${r0.place_count}`);
  check('  alias trendId dropped', r0.trendId === undefined);
  check('  alias _score dropped', r0._score === undefined);
  check('  alias evidenceCount dropped', r0.evidenceCount === undefined);
  check('  canonical evidence_count present', r0.evidence_count !== undefined, `${r0.evidence_count}`);
  check('  node_id present', r0.node_id !== undefined, `${r0.node_id}`);
  const maxRowBytes = Math.max(...rows.map(r => Buffer.byteLength(JSON.stringify(r))));
  check('  ≤2KB/row', maxRowBytes <= 2048, `max ${maxRowBytes}B`);
  const evRows = rows.filter(r => Array.isArray(r.evidence) && r.evidence.length > 0).length;
  check('  evidence flows through', evRows > 0, `${evRows}/${rows.length} rows`);
  const overCap = rows.filter(r => Array.isArray(r.evidence) && r.evidence.length > 3).length;
  check('  evidence capped ≤3/row', overCap === 0, `${overCap} rows over cap`);
  const hasCitation = rows.some(r => (r.evidence || []).some(e => e.formatted_citation));
  check('  evidence has formatted_citation', hasCitation);
  const gids = [...new Set(rows.map(r => r.graphId).filter(Boolean))];
  check('  no psfk/waldo rows', !gids.some(g => ['psfk', 'waldo'].includes(g)), JSON.stringify(gids));
  check('  _routed_graphs == row graphIds', JSON.stringify([...(sj._routed_graphs || [])].sort()) === JSON.stringify(gids.sort()), `routed=${JSON.stringify(sj._routed_graphs)} rows=${JSON.stringify(gids)}`);
} else { check('  search returned rows', false, 'EMPTY result set'); }

// ── get_my_account ──
console.log('\n── get_my_account ──');
const ga = await client.callTool({ name: 'get_my_account', arguments: {} });
const gaText = textOf(ga);
check('  no "undefined" string', !gaText.includes('undefined'));
check('  no "$0" string', !gaText.includes('$0'));
check('  no "Upgrade to undefined"', !gaText.includes('Upgrade to undefined'));
let gj = null; try { gj = JSON.parse(gaText); } catch {}
check('  profile.name not a rec id', !/^rec[A-Za-z0-9]{14}$/.test(gj?.profile?.name || ''), gj?.profile?.name ?? '(omitted)');
check('  graphs_enabled_count present (not array)', typeof gj?.graphs_enabled_count === 'number' && !Array.isArray(gj?.graphs_enabled), `${gj?.graphs_enabled_count}`);

await client.close();
const passed = results.filter(r => r.pass).length;
console.log(`\n=== ${passed}/${results.length} checks passed ===`);
process.exit(results.every(r => r.pass) ? 0 : 1);
