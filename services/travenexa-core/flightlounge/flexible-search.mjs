import {validateFlightSearch} from './live-search.mjs';
const TENANT='travenexa-flightlounge';
const failure=(httpStatus,reason)=>({httpStatus,status:'unavailable',reason,candidates:[],offers:[],bookingsEnabled:false});
// A small Cartesian search of whole itineraries, never a sum of sector fares.
export function expandFlexibleSearch(raw,now=Date.now()){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['query','dateOffsets'].includes(k)))return null;
 const query=validateFlightSearch(raw.query,now);
 if(!query||!Array.isArray(raw.dateOffsets)||raw.dateOffsets.length!==query.legs.length)return null;
 const offsets=[];let count=1;
 for(const values of raw.dateOffsets){
  if(!Array.isArray(values)||values.length>7||values.some(n=>!Number.isInteger(n)||n < -3||n > 3))return null;
  const unique=[0,...new Set(values.filter(n=>n!==0))];count*=unique.length;if(count>9)return null;offsets.push(unique);
 }
 let candidates=[[]];
 for(const values of offsets)candidates=candidates.flatMap(prefix=>values.map(n=>[...prefix,n]));
 return candidates.map((shifts,index)=>{const q=structuredClone(query);q.legs.forEach((l,i)=>{l.departure_date=new Date(Date.parse(l.departure_date+'T12:00:00Z')+shifts[i]*86400000).toISOString().slice(0,10);});return {id:`candidate-${index}`,baseline:index===0,dateOffsets:shifts,query:q,valid:!!validateFlightSearch(q,now)};});
}
export function summarizeFareSavings(candidates,now=Date.now()){
 const eligible=c=>c.status==='live'?c.offers.filter(o=>o.live===true&&o.bookable===false&&o.priceScope==='supplier_fare_only'&&o.baggageRequirementMet===true&&Number.isFinite(o.amount)&&o.amount>=0&&/^[A-Z]{3}$/.test(o.currency)&&Date.parse(o.expiresAt)>now):[];
 const baseline=candidates.find(c=>c.baseline);
 const base=baseline?eligible(baseline):[];
 const all=candidates.flatMap(c=>eligible(c).map(o=>({candidateId:c.id,offerId:o.id,currency:o.currency,amount:o.amount})));
 return [...new Set(all.map(o=>o.currency))].sort().map(currency=>{
  const ranked=all.filter(o=>o.currency===currency).sort((a,b)=>a.amount-b.amount),original=base.filter(o=>o.currency===currency).sort((a,b)=>a.amount-b.amount)[0];
  return {currency,best:ranked[0],baselineAmount:original?.amount??null,supplierFareSaving:original?Math.round(Math.max(0,original.amount-ranked[0].amount)*10000)/10000:null,scope:'supplier_fare_only',finalTotalKnown:false};
 });
}
export function createFlexibleFlightSearch({flightSearch,reserveBudget,authorize,audit,now=()=>Date.now()}={}){
 return {async search(tenantId,raw,{signal}={}){
  if(tenantId!==TENANT)return failure(403,'flightlounge_tenant_required');
  const expanded=expandFlexibleSearch(raw,now());if(!expanded)return failure(400,'invalid_or_excessive_search');
  if(!flightSearch?.search||!reserveBudget||!authorize||!audit)return failure(503,'flexible_search_not_configured');
  const candidates=expanded.map(c=>({...c,status:c.valid?'not_searched':'invalid_dates',offers:[]}));
  const combined=signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000);
  try{
   const access=await authorize({tenantId,action:'flexible_search'});
   if(access?.allowed!==true||access.tenantId!==tenantId)return failure(403,'flexible_search_not_authorized');
   // The host must atomically reserve the worst-case call allowance per authenticated user/tenant.
   const budget=await reserveBudget({tenantId,calls:candidates.filter(c=>c.valid).length});
   if(budget?.allowed!==true||budget.tenantId!==tenantId)return failure(429,'search_budget_unavailable');
   await audit({tenantId,event:'flexible_search_started',candidateCount:candidates.length});
   for(const c of candidates){
    if(!c.valid)continue;if(combined.aborted){c.status='cancelled';continue;}
    const grant=await authorize({tenantId,action:'flexible_search'});
    if(grant?.allowed!==true||grant.tenantId!==tenantId)return failure(403,'flexible_search_access_revoked');
    try{const r=await flightSearch.search(tenantId,c.query,{signal:combined});
     if(combined.aborted){c.status='cancelled';continue;}
     c.status=r.status==='live'&&Array.isArray(r.offers)?'live':'unavailable';
     c.offers=c.status==='live'?r.offers.slice(0,200):[];
     c.coverage=r.coverage?{attempted:r.coverage.attempted,succeeded:r.coverage.succeeded,failed:r.coverage.failed??[],truncated:r.coverage.truncated===true}:null;
    }catch{c.status='unavailable';}
   }
   const grant=await authorize({tenantId,action:'flexible_search'});
   if(grant?.allowed!==true||grant.tenantId!==tenantId)return failure(403,'flexible_search_access_revoked');
   // Remove offers that expired while the remaining candidates were searched.
   for(const c of candidates)c.offers=c.offers.filter(o=>Date.parse(o.expiresAt)>now());
   const completed=candidates.filter(c=>c.status==='live').length;
   await audit({tenantId,event:'flexible_search_completed',completed,candidateCount:candidates.length});
   return {httpStatus:completed?200:503,status:completed?'live':'unavailable',candidates:candidates.map(({valid,...c})=>c),summaries:summarizeFareSavings(candidates,now()),coverage:{planned:candidates.length,completed,partial:completed<candidates.length},searchedAt:new Date(now()).toISOString(),bookingsEnabled:false,notice:'Whole-journey supplier fare comparison only. Required bag quantity must be included for savings summaries. Extra fees, bag weights, ground travel and final totals remain unconfirmed. Different dates may change stay length. Reprice before purchase.'};
  }catch{return failure(503,'flexible_search_unavailable');}
 }};
}
