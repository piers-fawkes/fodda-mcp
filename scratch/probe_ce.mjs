import crypto from 'node:crypto';
const BASE=process.env.FODDA_API_URL||'https://api.fodda.ai',KEY=process.env.FODDA_API_KEY,SECRET=process.env.FODDA_MCP_SECRET,USER='piers.fawkes@psfk.com';
function call(method,path,body){const ts=Date.now().toString();const h={'X-API-Key':KEY,'X-User-Id':USER,'X-Fodda-Timestamp':ts,'X-Fodda-Billing':'mcp-orchestrated','Content-Type':'application/json'};if(SECRET){const p=(method==='POST'&&body)?ts+'.'+JSON.stringify(body):ts+'.'+path;h['X-Fodda-Signature']=crypto.createHmac('sha256',SECRET).update(p).digest('hex');}return fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined}).then(async r=>({status:r.status,json:await r.json().catch(()=>null)}));}
// find CE / consumer-electronics / expert graphs
const g=await call('GET','/v1/graphs');
const cands=(g.json?.graphs||[]).filter(x=>/ce|consumer|electronic/i.test(x.graph_id||'')||/consumer electronic/i.test(x.name||''));
console.log('CE-ish graph candidates:', cands.map(x=>`${x.graph_id} (${x.graph_type||'?'})`).join(' | ')||'none by id; will try ce-design');
const gid = (cands[0]?.graph_id) || 'ce-design';
console.log('\nprobing graph:', gid);
const r=await call('POST',`/v1/graphs/${gid}/search`,{query:'consumer electronics trends',limit:10,include_evidence:true});
const rows=r.json?.rows||r.json?.results||[];
console.log('status',r.status,'rows',rows.length);
if(!rows.length){console.log('no rows — try a different gid'); process.exit(0);}
const sig={},yrBad=[],strJunk=new Set(); let maxEv=0;
for(const x of rows){
  const s=x.signal_score??x.confidenceScore; sig[s]=(sig[s]||0)+1;
  for(const d of [x.lastSeen,x.firstSeen].filter(Boolean)){const y=parseInt(String(d).slice(0,4)); if(y>2027||y<2015) yrBad.push(`${x.node_id}:${d}`);}
  for(const p of (Array.isArray(x.place)?x.place:[])) if(['string','null','undefined'].includes(String(p).trim().toLowerCase())) strJunk.add(p);
  maxEv=Math.max(maxEv, x.evidenceCount||x.evidence_count||0);
}
console.log('signal_score distribution:', JSON.stringify(sig));
console.log('out-of-range dates (2602 class):', yrBad.length?yrBad:'none');
console.log('place "string"/"null" tokens:', strJunk.size?[...strJunk]:'none');
console.log('max evidenceCount (over-link check):', maxEv);
console.log('sample row fields:', Object.keys(rows[0]).filter(k=>/score|confidence|signal|place|lastSeen|evidence/i.test(k)).join(', '));
