// Minimal server-side TraveNexa gateway for four source-market UK travel sites.
// No PII, payments or direct booking is accepted here. API credentials remain server-only.
// Without a separately verified TraveNexa landlord backend, search fails closed with HTTP 503.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(root,'dist');
const knownMarkets = { KR:'kr',JP:'jp',CN:'cn',US:'us' };
const productTypes = new Set(['airport','hotels','local','rail','experiences']);
const supportedCurrencies = { KR:'KRW',JP:'JPY',CN:'CNY',US:'USD' };
const supportedLocales = { KR:'ko-KR',JP:'ja-JP',CN:'zh-CN',US:'en-US' };
const maxBodySize = 8192;
const port = Number(process.env.PORT || 4301);
const hostMarket = (process.env.SITE_MARKET || '').toLowerCase();
const apiOrigin = process.env.TRAVENEXA_API_ORIGIN?.trim() || '';
const apiToken = process.env.TRAVENEXA_SERVER_TOKEN?.trim() || '';
const redirectHosts = new Set((process.env.TRAVENEXA_REDIRECT_HOSTS || '').split(',')
  .map(value=>value.trim().toLowerCase()).filter(Boolean));
const hits = new Map();
const RATE_WINDOW_MS = 60_000, MAX_SEARCHES_PER_WINDOW = 18;

function json(res,status,body) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'});
  res.end(JSON.stringify(body));
}
function allowedOrigin() {
  try {
    const url = new URL(apiOrigin);
    return url.protocol==='https:' && !url.username && !url.password && !url.search && !url.hash
      && url.pathname==='/' ? url.origin : null;
  } catch { return null; }
}
function safeString(value,max=100) {
  if(typeof value!=='string')return null;
  const s=value.trim();
  return s.length>0 && s.length<=max && !/[\x00-\x1F]/.test(s) ? s : null;
}
function validateSearch(input) {
  if(!input || typeof input!=='object' || Array.isArray(input)) return null;
  const sourceMarket=safeString(input.sourceMarket,2);
  const productType=safeString(input.productType,24);
  const date=safeString(input.travelDate,10);
  if(!sourceMarket || !(sourceMarket in knownMarkets) || !productTypes.has(productType))return null;
  if(hostMarket && knownMarkets[sourceMarket]!==hostMarket)return null;
  if(input.destinationCountry!=='GB' || input.locale!==supportedLocales[sourceMarket]
     || input.displayCurrency!==supportedCurrencies[sourceMarket])return null;
  if(!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))return null;
  const day=Date.parse(date);
  if(day<Date.now()-86400000 || day>Date.now()+550*86400000)return null;
  const travellers=Number(input.travellers);
  if(!Number.isInteger(travellers) || travellers<1 || travellers>12)return null;
  const from=input.from==null?null:safeString(input.from,90);
  const to=input.to==null?null:safeString(input.to,90);
  if(!to || (['airport','local','rail'].includes(productType)&&!from))return null;
  const arrivalTime=input.arrivalTime==null?null:safeString(input.arrivalTime,5);
  if(arrivalTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime))return null;
  const nights=input.nights==null?null:Number(input.nights);
  if(productType==='hotels'&&(!Number.isInteger(nights)||nights<1||nights>21))return null;
  const flightNumber=input.flightNumber==null?null:safeString(input.flightNumber,12);
  return {
    sourceMarket,destinationCountry:'GB',productType,travelDate:date,arrivalTime,
    travellers,nights:productType==='hotels'?nights:undefined,from,to,
    flightNumber:productType==='airport'?flightNumber:undefined,
    locale:supportedLocales[sourceMarket],displayCurrency:supportedCurrencies[sourceMarket],
  };
}
function sanitizeRedirect(value) {
  if(typeof value!=='string' || !redirectHosts.size)return undefined;
  try {
    const url=new URL(value);
    return url.protocol==='https:' && !url.username && !url.password && redirectHosts.has(url.hostname.toLowerCase()) ? url.href : undefined;
  }catch{return undefined;}
}
function normaliseOffer(item) {
  if(!item || typeof item!=='object' || item.verified!==true || item.live!==true)return null;
  const id=safeString(item.id,160), title=safeString(item.title,180),
    supplierName=safeString(item.supplierName,100), currency=safeString(item.currency,3);
  const amount=Number(item.amount), expiresAt=safeString(item.expiresAt,50);
  if(!id||!title||!supplierName||!currency||!/^[A-Z]{3}$/.test(currency)||
      !Number.isFinite(amount)||amount<0||!expiresAt||!Number.isFinite(Date.parse(expiresAt))||
      Date.parse(expiresAt)<=Date.now())return null;
  return {id,title,supplierName,currency,amount,expiresAt,
    description:safeString(item.description,400)||undefined,
    affiliateRedirect:item.bookingMode==='affiliate'?sanitizeRedirect(item.affiliateRedirect):undefined};
}
async function readJson(req) {
  let size=0,chunks=[];
  for await (const part of req) {
    size+=part.length;
    if(size>maxBodySize)throw new Error('body_too_large');
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function rateAllowed(req) {
  const ip=req.socket.remoteAddress || 'unknown';
  const now=Date.now();
  const value=hits.get(ip)||{count:0,reset:now+RATE_WINDOW_MS};
  if(now>=value.reset){value.count=0;value.reset=now+RATE_WINDOW_MS;}
  value.count++;hits.set(ip,value);
  if(hits.size>4000)for(const [key,record] of hits)if(record.reset<now)hits.delete(key);
  return value.count<=MAX_SEARCHES_PER_WINDOW;
}
async function search(req,res) {
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')
    return json(res,415,{status:'unavailable',reason:'json_required'});
  if(!rateAllowed(req))return json(res,429,{status:'unavailable',reason:'rate_limited'});
  let raw;try{raw=await readJson(req);}catch{return json(res,400,{status:'unavailable',reason:'invalid_request'});}
  const input=validateSearch(raw);
  if(!input)return json(res,400,{status:'unavailable',reason:'invalid_search'});
  const origin=allowedOrigin();
  if(!origin||apiToken.length<24)return json(res,503,{status:'unavailable',reason:'supplier_gateway_not_configured'});
  try {
    const upstream=await fetch(new URL('/v1/inbound-uk/search',origin),{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiToken}`,
        'X-Travenexa-Market':input.sourceMarket},body:JSON.stringify(input),
    });
    if(!upstream.ok)return json(res,503,{status:'unavailable',reason:'supplier_not_verified'});
    const result=await upstream.json();
    if(result?.status!=='live'||!Array.isArray(result?.offers))
      return json(res,503,{status:'unavailable',reason:'supplier_data_not_verified'});
    const offers=result.offers.slice(0,30).map(normaliseOffer).filter(Boolean);
    return json(res,200,{status:'live',offers});
  } catch {
    return json(res,503,{status:'unavailable',reason:'supplier_service_unavailable'});
  }
}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.woff2':'font/woff2'};
async function staticFile(req,res,url) {
  let requested;
  try {requested=decodeURIComponent(url.pathname);}
  catch {res.writeHead(400);return res.end();}
  if(requested==='/' ) {
    res.writeHead(302,{Location:'/'+(hostMarket||'us')+'/'});return res.end();
  }
  // Host-level market restrictions prevent one deployed local domain from masquerading as another.
  const marketPrefix=requested.split('/')[1];
  if(hostMarket && ['kr','jp','cn','us'].includes(marketPrefix) && marketPrefix!==hostMarket){
    res.writeHead(404);return res.end();
  }
  if(requested.endsWith('/'))requested+='index.html';
  if(requested.includes('\\')||requested.includes('\0')){res.writeHead(400);return res.end();}
  const filename=resolve(dist,'.'+requested);
  if(!filename.startsWith(dist+sep)){res.writeHead(403);return res.end();}
  try {
    const info=await stat(filename);
    if(!info.isFile()){res.writeHead(404);return res.end();}
    const content=await readFile(filename);
    res.writeHead(200,{'Content-Type':mime[extname(filename)]||'application/octet-stream',
      'Cache-Control':extname(filename)==='.html'?'no-cache':'public,max-age=3600',
      'X-Content-Type-Options':'nosniff'});
    res.end(content);
  } catch {res.writeHead(404);res.end();}
}

const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/', 'http://localhost');
  if(url.pathname==='/api/travel/status'&&req.method==='GET')
    return json(res,200,{market:hostMarket||'multi-preview',supplierConnected:!!(allowedOrigin()&&apiToken.length>=24),bookingsEnabled:false});
  if(url.pathname==='/api/travel/search'&&req.method==='POST')return search(req,res);
  if(url.pathname.startsWith('/api/'))return json(res,404,{status:'unavailable',reason:'unknown_api'});
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  return staticFile(req,res,url);
});
if(process.env.NODE_ENV!=='test')server.listen(port,'0.0.0.0',()=>{
  process.stdout.write(`Travel storefront on port ${port} (suppliers ${allowedOrigin()&&apiToken?'configured':'NOT connected'})\n`);
});
export { server, validateSearch, normaliseOffer, allowedOrigin, sanitizeRedirect };
