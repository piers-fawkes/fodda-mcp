// Settle API-vs-MCP for the garbage-evidence case: probe the BEAUTY graph directly.
import crypto from 'node:crypto';
const BASE=process.env.FODDA_API_URL||'https://api.fodda.ai',KEY=process.env.FODDA_API_KEY,SECRET=process.env.FODDA_MCP_SECRET,USER='piers.fawkes@psfk.com';
function call(method,path,body){const ts=Date.now().toString();const h={'X-API-Key':KEY,'X-User-Id':USER,'X-Fodda-Timestamp':ts,'X-Fodda-Billing':'mcp-orchestrated','Content-Type':'application/json'};if(SECRET){const p=(method==='POST'&&body)?ts+'.'+JSON.stringify(body):ts+'.'+path;h['X-Fodda-Signature']=crypto.createHmac('sha256',SECRET).update(p).digest('hex');}return fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined}).then(async r=>({status:r.status,json:await r.json().catch(()=>null)}));}
const r=await call('POST','/v1/graphs/beauty/search',{query:'small format curated retail concepts',limit:6,include_evidence:true});
const rows=r.json?.rows||r.json?.results||[];
console.log('beauty rows:',rows.length);
for(const row of rows.filter(x=>['6779','6782','6784','6417'].includes(String(x.node_id)))){
  const ev=row.evidence||[];
  console.log(`\n● node ${row.node_id} "${(row.trendName||row.label||'').slice(0,40)}"  (API returned ${ev.length} evidence)`);
  // is the API list ordered by date or relevance? show first 6 with id + date + title
  ev.slice(0,6).forEach((e,i)=>console.log(`   ${i}. [${e.id}] ${String(e.publishedAt||'').slice(0,10)}  ${(e.title||'').slice(0,52)}`));
  // does this node's FULL api list even contain the garbage ids 21013/21196?
  const ids=ev.map(e=>String(e.id));
  console.log(`   contains 21013? ${ids.includes('21013')} | 21196? ${ids.includes('21196')} | total ids: ${ids.length}`);
}
