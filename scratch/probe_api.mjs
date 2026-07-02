// Read-only API probe to ground the audit fixes. Prints AGGREGATES only — never raw PII.
// Usage: node --env-file=.env scratch/probe_api.mjs
import crypto from 'node:crypto';

const BASE = process.env.FODDA_API_URL || 'https://api.fodda.ai';
const KEY = process.env.FODDA_API_KEY;
const SECRET = process.env.FODDA_MCP_SECRET;
const USER = 'piers.fawkes@psfk.com';

if (!KEY) { console.error('No FODDA_API_KEY'); process.exit(1); }

function headers(method, path, body) {
  const ts = Date.now().toString();
  const h = {
    'X-API-Key': KEY, 'X-User-Id': USER, 'X-Fodda-Timestamp': ts,
    'X-Fodda-Billing': 'mcp-orchestrated', 'Content-Type': 'application/json',
  };
  if (SECRET) {
    const payload = (method === 'POST' && body) ? ts + '.' + JSON.stringify(body) : ts + '.' + path;
    h['X-Fodda-Signature'] = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  }
  return h;
}

const bytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8');
const kb = (n) => (n / 1024).toFixed(1) + 'KB';

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method, headers: headers(method, path, body),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

// ── 1. GET /v1/graphs ───────────────────────────────────────────────
console.log('\n=== GET /v1/graphs ===');
const g = await call('GET', '/v1/graphs');
console.log('status:', g.status);
if (g.json) {
  const graphs = Array.isArray(g.json.graphs) ? g.json.graphs : [];
  console.log('total payload:', kb(bytes(g.json)), '| graphs:', graphs.length);
  const sample = graphs[0] || {};
  console.log('per-graph fields present:', Object.keys(sample).sort().join(', '));
  const leaky = ['owner_email','owner_account_id','blog_post_content','blog_post_title',
    'what_it_does','key_features','portrait_url','icon_url','mcp_url','content_ownership'];
  for (const f of leaky) {
    const n = graphs.filter(x => x[f] !== undefined && x[f] !== null && x[f] !== '').length;
    if (n) console.log(`  LEAK field "${f}" present on ${n}/${graphs.length} graphs`);
  }
  // count distinct owner_email values (PII) WITHOUT printing them
  const emails = new Set(graphs.map(x => x.owner_email).filter(Boolean));
  console.log('  distinct owner_email values exposed:', emails.size);
  // blog_post_content total weight
  const blogBytes = graphs.reduce((a, x) => a + (x.blog_post_content ? Buffer.byteLength(String(x.blog_post_content)) : 0), 0);
  console.log('  blog_post_content total weight:', kb(blogBytes), `(${(blogBytes/bytes(g.json)*100).toFixed(0)}% of payload)`);
  // _account shape
  const acct = g.json._account || {};
  console.log('  _account.profile:', JSON.stringify(acct.profile || null));
  console.log('  _account.upsell:', JSON.stringify(acct.upsell || null));
  console.log('  _account.graphs_enabled length:', (acct.graphs_enabled||[]).length);
} else {
  console.log('non-JSON body (first 300):', g.text.slice(0, 300));
}

// ── 2. POST /v1/graphs/retail/search (include_evidence) ─────────────
console.log('\n=== POST /v1/graphs/retail/search ===');
const body = { query: 'small format curated retail concepts', limit: 10, include_evidence: true };
const s = await call('POST', '/v1/graphs/retail/search', body);
console.log('status:', s.status);
if (s.json) {
  const rows = s.json.results || s.json.rows || s.json.trends || [];
  console.log('total payload:', kb(bytes(s.json)), '| rows:', rows.length);
  if (rows[0]) {
    console.log('row[0] fields:', Object.keys(rows[0]).sort().join(', '));
    const r = rows[0];
    const flen = (v) => v == null ? 'absent' : (typeof v === 'string' ? v.length + ' chars' : (Array.isArray(v) ? 'array['+v.length+']' : typeof v));
    for (const f of ['brandNames','place','trendDescription','description','summary','trendId','node_id','id',
                     'relevance_score','_score','semantic_score','score','evidenceCount','evidence','graphId']) {
      console.log(`  ${f}: ${flen(r[f])}`);
    }
    // evidence reality check across all rows
    const withEvCount = rows.filter(x => (x.evidenceCount||0) > 0).length;
    const withEvArray = rows.filter(x => Array.isArray(x.evidence) && x.evidence.length > 0).length;
    console.log(`  rows with evidenceCount>0: ${withEvCount} | rows with non-empty evidence[]: ${withEvArray}`);
    const totalEvCount = rows.reduce((a,x)=>a+(x.evidenceCount||0),0);
    console.log(`  sum(evidenceCount)=${totalEvCount} | sum(evidence[].length)=${rows.reduce((a,x)=>a+((x.evidence||[]).length),0)}`);
    // biggest brandNames/place strings
    const maxBrand = Math.max(...rows.map(x => typeof x.brandNames==='string'?x.brandNames.length:0));
    const maxPlace = Math.max(...rows.map(x => typeof x.place==='string'?x.place.length:0));
    console.log(`  max brandNames string: ${maxBrand} chars | max place string: ${maxPlace} chars`);
  }
  console.log('  _routed_graphs:', JSON.stringify(s.json._routed_graphs));
  console.log('  _attribution:', JSON.stringify(s.json._attribution));
  console.log('  distinct row graphIds:', JSON.stringify([...new Set(rows.map(x=>x.graphId).filter(Boolean))]));
} else {
  console.log('non-JSON body (first 300):', s.text.slice(0, 300));
}
console.log('\n=== done ===');
