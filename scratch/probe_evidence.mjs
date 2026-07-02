// Verify co-pilot's claims: evidence relevance/linkage + data hygiene. Direct API (ground truth).
import crypto from 'node:crypto';
const BASE = process.env.FODDA_API_URL || 'https://api.fodda.ai';
const KEY = process.env.FODDA_API_KEY, SECRET = process.env.FODDA_MCP_SECRET;
const USER = 'piers.fawkes@psfk.com';
function call(method, path, body) {
  const ts = Date.now().toString();
  const h = { 'X-API-Key': KEY, 'X-User-Id': USER, 'X-Fodda-Timestamp': ts, 'X-Fodda-Billing': 'mcp-orchestrated', 'Content-Type': 'application/json' };
  if (SECRET) { const p = (method==='POST'&&body)? ts+'.'+JSON.stringify(body): ts+'.'+path; h['X-Fodda-Signature']=crypto.createHmac('sha256',SECRET).update(p).digest('hex'); }
  return fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined}).then(async r=>({status:r.status,json:await r.json().catch(()=>null)}));
}
const r = await call('POST', '/v1/graphs/retail/search', { query: 'small format curated retail concepts', limit: 6, include_evidence: true });
const rows = r.json?.rows || r.json?.results || [];
console.log('rows:', rows.length);
if (rows[0]?.evidence?.[0]) console.log('evidence item fields:', Object.keys(rows[0].evidence[0]).join(', '), '\n');

// 1. EVIDENCE LINKAGE — do the same evidence IDs repeat across different nodes?
const evToNodes = {};
for (const row of rows) {
  const node = `${row.node_id}:${(row.trendName||'').slice(0,32)}`;
  console.log(`\n● node ${node}  (evidence ${row.evidence?.length||0})`);
  for (const e of (row.evidence||[]).slice(0,4)) {
    const id = e.id||e.evidenceId||e.signalId||e.quoteId||'?';
    const title = (e.title||e.articleTitle||e.headline||'').slice(0,60);
    const url = (e.sourceUrl||e.url||'').slice(0,55);
    console.log(`    [${id}] ${title}  <${url}>`);
    (evToNodes[id] ||= new Set()).add(node);
  }
}
console.log('\n── evidence IDs appearing on MULTIPLE distinct nodes (linkage red flag) ──');
const repeated = Object.entries(evToNodes).filter(([,s])=>s.size>1);
if (!repeated.length) console.log('  none — evidence is node-specific ✅');
for (const [id,s] of repeated) console.log(`  [${id}] on ${s.size} nodes: ${[...s].join(' | ')}`);

// 2. DATA HYGIENE spot-checks
console.log('\n── data hygiene ──');
const placeJunk = new Set(); const yrBad = [];
for (const row of rows) {
  for (const p of (Array.isArray(row.place)?row.place:[])) if (['string','null','undefined',''].includes(String(p).trim().toLowerCase())) placeJunk.add(p);
  for (const d of [row.lastSeen, row.firstSeen, row.freshnessDate].filter(Boolean)) { const y=parseInt(String(d).slice(0,4)); if (y>2027||y<2015) yrBad.push(`${row.node_id}:${d}`); }
}
console.log('  literal "string"/"null" tokens in place arrays:', placeJunk.size?[...placeJunk]:'none');
console.log('  out-of-range dates (lastSeen/firstSeen):', yrBad.length?yrBad:'none');
console.log('  psfk_graph_slug on row[0] (internal-routing leak):', JSON.stringify(rows[0]?.psfk_graph_slug||null));
console.log('  title/label/trendName triplicated on row[0]:', JSON.stringify({title:rows[0]?.title, label:rows[0]?.label, trendName:rows[0]?.trendName}));
