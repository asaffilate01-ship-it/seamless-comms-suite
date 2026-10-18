// Node 22 HTTP entry point for TraveNexa's authenticated server-to-server gateway.
// All supplier adapters are absent by default; no demo fare ever appears as live.
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createTravelEngine } from './engine.mjs';
import { INBOUND_MARKETS, TENANTS } from './catalog.mjs';
import { TRAVEL_AI_TOOLS, runTravelAiTool } from './omniqora-tools.mjs';

function parseTokens(value) {
  if (!value) return {};
  try {
    const parsed=JSON.parse(value);
    if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('invalid');
    return parsed;
  } catch { throw new Error('TRAVENEXA_TENANT_TOKENS_JSON must be a JSON object'); }
}
const defaultEngine=()=>createTravelEngine({
  tenantTokens:parseTokens(process.env.TRAVENEXA_TENANT_TOKENS_JSON),
  adapters:[], // Inject only separately built, contract-approved, server-side supplier adapters.
});
const MAX_BODY=8192, MAX_REQUESTS=30, WINDOW=60000;
function reply(res,code,body) {
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  res.end(JSON.stringify(body));
}
async function bodyJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim()!=='application/json')
    throw new Error('json_required');
  let length=0;
  const parts=[];
  for await (const chunk of req) {
    length+=chunk.length;
    if (length>MAX_BODY) throw new Error('body_too_large');
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export function createServer({engine=defaultEngine()}={}) {
  const hits=new Map();
  const server=http.createServer(async (req,res)=>{
    const path=new URL(req.url||'/', 'http://localhost').pathname;
    if (path==='/healthz' && req.method==='GET')
      return reply(res,200,{service:'travenexa-core',supplierInventory:'not_verified_by_health',
        configuredTenants:engine.hasConfiguredTenants(),bookingsEnabled:false,paymentsEnabled:false});
    const scopedPaths=['/v1/travel/search','/v1/inbound-uk/search','/v1/travel/readiness',
      '/v1/travel/booking-preflight','/v1/omniqora/tools','/v1/omniqora/tool-call'];
    if (!scopedPaths.includes(path)) return reply(res,404,{status:'unavailable',reason:'unknown_api'});
    if (!engine.hasConfiguredTenants()) return reply(res,503,{status:'unavailable',reason:'tenant_auth_not_configured'});
    const inbound=path==='/v1/inbound-uk/search';
    const headerMarket=req.headers['x-travenexa-market'];
    const requestedTenant=req.headers['x-travenexa-tenant'];
    const tenantId=inbound ?
      INBOUND_MARKETS[headerMarket] :
      typeof requestedTenant==='string' && TENANTS[requestedTenant] ? requestedTenant : null;
    const bearer=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'')?.[1];
    if (!tenantId || !engine.authenticate(tenantId,bearer))
      return reply(res,401,{status:'unavailable',reason:'unauthorised_tenant'});
    const key=tenantId+':'+(req.socket.remoteAddress||'unknown');
    const at=Date.now(),hit=hits.get(key)||{at,count:0};
    if (at-hit.at>=WINDOW){hit.at=at;hit.count=0;}
    hit.count+=1;hits.set(key,hit);
    if (hits.size>10000) for(const [k,v] of hits) if(at-v.at>=WINDOW)hits.delete(k);
    if (hit.count>MAX_REQUESTS) return reply(res,429,{status:'unavailable',reason:'rate_limited'});
    if (path==='/v1/omniqora/tools' && req.method==='GET')
      return reply(res,200,{status:'read_only',tenantId,tools:TRAVEL_AI_TOOLS});
    if (path==='/v1/travel/readiness' && req.method==='GET') {
      const answer=await engine.readiness(tenantId);
      return reply(res,answer.httpStatus,answer);
    }
    if (req.method!=='POST') return reply(res,405,{status:'unavailable',reason:'method_not_allowed'});
    let data;
    try {data=await bodyJson(req);} catch {
      return reply(res,400,{status:'unavailable',reason:'invalid_json_request'});
    }
    if (path==='/v1/omniqora/tool-call') {
      const answer=await runTravelAiTool(engine,tenantId,data);
      return reply(res,answer.httpStatus,answer);
    }
    if (path==='/v1/travel/booking-preflight') {
      const answer=engine.bookingPreflight(tenantId,data?.offerId);
      return reply(res,answer.httpStatus,answer);
    }
    const answer=await engine.search(tenantId,data);
    return reply(res,answer.httpStatus,answer);
  });
  return server;
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.PORT||4302);
  createServer().listen(port,process.env.HOST||'127.0.0.1',()=>{
    process.stdout.write('TraveNexa core API listening on '+port+'; external suppliers are not connected.\n');
  });
}
