// PII-safe check: are owner_email values the CALLER's reflected email, or third-party owners'?
// Prints counts only — never the addresses.
import crypto from 'node:crypto';
const BASE = process.env.FODDA_API_URL || 'https://api.fodda.ai';
const KEY = process.env.FODDA_API_KEY, SECRET = process.env.FODDA_MCP_SECRET;
const CALLER = 'piers.fawkes@psfk.com';
const ts = Date.now().toString();
const path = '/v1/graphs';
const headers = { 'X-API-Key': KEY, 'X-User-Id': CALLER, 'X-Fodda-Timestamp': ts, 'X-Fodda-Billing': 'mcp-orchestrated', 'Content-Type': 'application/json' };
if (SECRET) headers['X-Fodda-Signature'] = crypto.createHmac('sha256', SECRET).update(ts + '.' + path).digest('hex');
const res = await fetch(BASE + path, { headers });
const d = await res.json();
const graphs = d.graphs || [];
const emails = graphs.map(g => g.owner_email).filter(Boolean);
const distinct = [...new Set(emails.map(e => e.toLowerCase()))];
const callerLc = CALLER.toLowerCase();
const matchCaller = distinct.filter(e => e === callerLc).length;
const thirdParty = distinct.filter(e => e !== callerLc).length;
// crude domain tally without revealing local-parts
const domains = {};
for (const e of distinct) { const dn = e.split('@')[1] || '?'; domains[dn] = (domains[dn] || 0) + 1; }
console.log('graphs with owner_email:', emails.length, '/', graphs.length);
console.log('distinct owner_email values:', distinct.length);
console.log('  == caller email:', matchCaller);
console.log('  != caller (third-party owners):', thirdParty);
console.log('distinct values by domain (counts only):', JSON.stringify(domains));
