import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const KEY=process.env.FODDA_API_KEY, USER='piers.fawkes@psfk.com';
const t=new StreamableHTTPClientTransport(new URL(`https://mcp.fodda.ai/mcp?api_key=${KEY}&user_id=${encodeURIComponent(USER)}`));
const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');
const c=new Client({name:'v',version:'1'},{capabilities:{}});await c.connect(t);
const sg=await c.callTool({name:'search_graph',arguments:{graphId:'beauty',query:'small format curated retail concepts',include_evidence:true}});
let sj=null; for(const b of (sg.content||[])){if(b.type!=='text')continue; try{const o=JSON.parse(b.text); if(o?.rows){sj=o;break;}}catch{}}
const rows=sj?.rows||[];
console.log('rows:',rows.length);
for(const r of rows.slice(0,4)){
  console.log(`\n● node ${r.node_id} "${(r.title||r.trendName||'').slice(0,40)}"  evidence_count=${r.evidence_count} role(s)=${JSON.stringify([...new Set((r.evidence||[]).map(e=>e.role??'(unset)'))])}`);
  for(const e of (r.evidence||[])) console.log(`   - ${(e.title||'').slice(0,64)}`);
}
await c.close();
