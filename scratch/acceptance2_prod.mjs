// Item 6 on the MULTI-GRAPH path (no graphId) — the path the audit flagged.
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const KEY = process.env.FODDA_API_KEY, USER = 'piers.fawkes@psfk.com';
const transport = new StreamableHTTPClientTransport(new URL(`https://mcp.fodda.ai/mcp?api_key=${KEY}&user_id=${encodeURIComponent(USER)}`));
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const client = new Client({ name: 'acc2', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
const sg = await client.callTool({ name: 'search_graph', arguments: { query: 'small format curated retail concepts', include_evidence: true } });
let sj = null;
for (const c of (sg.content || [])) { if (c.type !== 'text') continue; try { const o = JSON.parse(c.text); if (o?.rows || o?.results) { sj = o; break; } } catch {} }
const rows = sj?.rows || sj?.results || [];
const gids = [...new Set(rows.map(r => r.graphId).filter(Boolean))].sort();
const routed = [...(sj?._routed_graphs || [])].sort();
console.log('rows:', rows.length);
console.log('row graphIds:      ', JSON.stringify(gids));
console.log('_routed_graphs:    ', JSON.stringify(sj?._routed_graphs));
console.log('_attribution:      ', JSON.stringify(sj?._attribution));
console.log('deprecated in rows:', gids.filter(g => ['psfk','waldo'].includes(g)));
console.log('MATCH _routed==rows:', JSON.stringify(routed) === JSON.stringify(gids));
console.log('attribution covers all source graphs:', gids.every(g => (sj?._attribution || '').toLowerCase().includes(g.toLowerCase())) ? 'by-id-substring n/a (uses display names)' : 'check manually');
await client.close();
