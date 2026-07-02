import crypto from 'node:crypto';
const BASE=process.env.FODDA_API_URL||'https://api.fodda.ai',KEY=process.env.FODDA_API_KEY,SECRET=process.env.FODDA_MCP_SECRET,USER='piers.fawkes@psfk.com';
function call(path){const ts=Date.now().toString();const h={'X-API-Key':KEY,'X-User-Id':USER,'X-Fodda-Timestamp':ts,'X-Fodda-Billing':'mcp-orchestrated','Content-Type':'application/json'};if(SECRET)h['X-Fodda-Signature']=crypto.createHmac('sha256',SECRET).update(ts+'.'+path).digest('hex');return fetch(BASE+path,{headers:h}).then(async r=>({status:r.status,json:await r.json().catch(()=>null)}));}
// 6678 = "Small-Format Store Growth", a CLEAN retail node (slug "retail"); 6779 = corrupted mega-slug cluster node
for(const nid of ['6678','6779']){
  console.log(`\n=== node ${nid} ===`);
  for(const g of ['retail','beauty','food','tech']){
    const r=await call(`/v1/graphs/${g}/nodes/${nid}`);
    const n=r.json?.node||r.json;
    const title=(n?.trendName||n?.title||n?.name||(r.json?.error?'ERROR':null));
    console.log(`  get_node(${g}, ${nid}) → ${r.status}  ${r.status===200?`title="${String(title).slice(0,32)}" node.graphId=${JSON.stringify(n?.graphId)}`:'(404 / not in graph)'}`);
  }
}
