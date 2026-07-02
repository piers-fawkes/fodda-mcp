import crypto from 'node:crypto';
const BASE=process.env.FODDA_API_URL||'https://api.fodda.ai',KEY=process.env.FODDA_API_KEY,SECRET=process.env.FODDA_MCP_SECRET,USER='piers.fawkes@psfk.com';
function call(method,path,body){const ts=Date.now().toString();const h={'X-API-Key':KEY,'X-User-Id':USER,'X-Fodda-Timestamp':ts,'X-Fodda-Billing':'mcp-orchestrated','Content-Type':'application/json'};if(SECRET){const p=(method==='POST'&&body)?ts+'.'+JSON.stringify(body):ts+'.'+path;h['X-Fodda-Signature']=crypto.createHmac('sha256',SECRET).update(p).digest('hex');}return fetch(BASE+path,{method,headers:h,body:body?JSON.stringify(body):undefined}).then(async r=>({status:r.status,json:await r.json().catch(()=>null)}));}
for(const gid of ['ce-design','psfk-consumer-electronics']){
  let rows=[];
  for(const q of ['design','consumer electronics','product design trends','innovation']){
    const r=await call('POST',`/v1/graphs/${gid}/search`,{query:q,limit:10,include_evidence:true});
    rows=r.json?.rows||r.json?.results||[]; if(rows.length) break;
  }
  console.log(`\n=== ${gid} === rows ${rows.length}`);
  if(!rows.length){console.log('  no rows'); continue;}
  const sig={},yrBad=[],strJunk=new Set(); let maxEv=0, fragTitles=0, noSpeaker=0, evCount=0;
  for(const x of rows){
    const s=x.signal_score??x.confidenceScore; sig[s]=(sig[s]||0)+1;
    for(const d of [x.lastSeen,x.firstSeen].filter(Boolean)){const y=parseInt(String(d).slice(0,4)); if(y>2027||y<2015) yrBad.push(`${x.node_id}:${d}`);}
    for(const p of (Array.isArray(x.place)?x.place:[])) if(['string','null','undefined'].includes(String(p).trim().toLowerCase())) strJunk.add(p);
    maxEv=Math.max(maxEv, x.evidenceCount||x.evidence_count||0);
    for(const e of (x.evidence||[])){evCount++; const t=(e.title||''); if(t && /^(and |but |which |that |to |the |a )/i.test(t)===false && t.length<25 && !/[.!?]$/.test(t) && t.split(' ').length<4) fragTitles++; if(e.speakerName===undefined && e.speaker_name===undefined && /quote|interview/i.test(e.contentType||'')) noSpeaker++;}
  }
  console.log('  signal_score distribution:', JSON.stringify(sig));
  console.log('  out-of-range dates:', yrBad.length?yrBad:'none');
  console.log('  place string/null tokens:', strJunk.size?[...strJunk]:'none');
  console.log('  max evidenceCount:', maxEv, '| evidence items sampled:', evCount);
}
