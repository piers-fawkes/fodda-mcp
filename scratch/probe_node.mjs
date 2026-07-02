import crypto from 'node:crypto';
const BASE=process.env.FODDA_API_URL||'https://api.fodda.ai',KEY=process.env.FODDA_API_KEY,SECRET=process.env.FODDA_MCP_SECRET,USER='piers.fawkes@psfk.com';
function call(path){const ts=Date.now().toString();const h={'X-API-Key':KEY,'X-User-Id':USER,'X-Fodda-Timestamp':ts,'X-Fodda-Billing':'mcp-orchestrated','Content-Type':'application/json'};if(SECRET)h['X-Fodda-Signature']=crypto.createHmac('sha256',SECRET).update(ts+'.'+path).digest('hex');return fetch(BASE+path,{headers:h}).then(async r=>({status:r.status,json:await r.json().catch(()=>null)}));}
for(const g of ['beauty','retail','food','tech']){
  const r=await call(`/v1/graphs/${g}/nodes/6779`);
  const n=r.json?.node||r.json;
  console.log(`6779 @ ${g}: status ${r.status} | title: ${JSON.stringify(n?.trendName||n?.title||n?.label||n?.name||null)} | graphId field: ${JSON.stringify(n?.graphId||null)}`);
}
