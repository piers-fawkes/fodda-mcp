// Focused search probe: validate §3 routing fix without emptying results.
import crypto from 'node:crypto';
const BASE = process.env.FODDA_API_URL || 'https://api.fodda.ai';
const KEY = process.env.FODDA_API_KEY, SECRET = process.env.FODDA_MCP_SECRET;
const USER = 'piers.fawkes@psfk.com';
function call(method, path, body) {
  const ts = Date.now().toString();
  const h = { 'X-API-Key': KEY, 'X-User-Id': USER, 'X-Fodda-Timestamp': ts, 'X-Fodda-Billing': 'mcp-orchestrated', 'Content-Type': 'application/json' };
  if (SECRET) { const p = (method==='POST'&&body)? ts+'.'+JSON.stringify(body) : ts+'.'+path; h['X-Fodda-Signature'] = crypto.createHmac('sha256', SECRET).update(p).digest('hex'); }
  return fetch(BASE+path, { method, headers: h, body: body?JSON.stringify(body):undefined }).then(async r => ({ status: r.status, json: await r.json().catch(()=>null) }));
}
for (const g of ['retail','food','tech']) {
  const r = await call('POST', `/v1/graphs/${g}/search`, { query: 'small format curated retail concepts', limit: 10 });
  const rows = r.json?.results || r.json?.rows || r.json?.trends || [];
  const gids = {}; const slugs = {};
  for (const x of rows) { const id = x.graphId||'?'; gids[id]=(gids[id]||0)+1; const s=x.psfk_graph_slug||'?'; slugs[s]=(slugs[s]||0)+1; }
  console.log(`\n=== /v1/graphs/${g}/search === status ${r.status} | rows: ${rows.length}`);
  console.log('  row graphId distribution:', JSON.stringify(gids));
  console.log('  psfk_graph_slug distribution:', JSON.stringify(slugs));
  const dep = rows.filter(x => ['psfk','waldo'].includes(x.graphId)).length;
  console.log('  rows still tagged psfk/waldo:', dep);
}
