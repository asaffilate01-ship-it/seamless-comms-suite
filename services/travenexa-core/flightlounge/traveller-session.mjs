import {expandFlexibleSearch,summarizeFareSavings} from './flexible-search.mjs';
import {validateFlightSearch} from './live-search.mjs';
import {createOfferRefresh} from './offer-refresh.mjs';
import {validScope} from './offer-store.mjs';
const fail=(code,reason)=>({httpStatus:code,status:'unavailable',reason,offers:[],bookingsEnabled:false});
// context MUST come from a verified host session, never request JSON or an actor header.
export function createTravellerFlightSession({searchService,flexibleSearchService,offerStore,authorize,refreshOptions,now=()=>Date.now()}={}){
 async function allowed(context,action){if(!validScope(context)||!authorize)return false;const g=await authorize({...context,action});return g?.allowed===true&&g.tenantId===context.tenantId&&g.actorId===context.actorId;}
 return {
  async search(context,raw,options){
   if(!searchService?.search||!offerStore?.put||!offerStore?.remove)return fail(503,'traveller_search_not_configured');
   const refs=[];
   try{
    if(!await allowed(context,'search'))return fail(403,'traveller_access_denied');
    const query=validateFlightSearch(raw,now());if(!query)return fail(400,'invalid_search');
    if(options?.signal?.aborted)return fail(409,'search_cancelled');
    const result=await searchService.search(context.tenantId,query,options);
    if(result.status!=='live')return result;
    if(!Array.isArray(result.offers)||result.offers.length>200)throw Error('invalid_offers');
    if(!await allowed(context,'search'))return fail(403,'traveller_access_revoked');
    const offers=[];
    for(const offer of result.offers){const offerRef=await offerStore.put(context,{query,offer},{signal:options?.signal});refs.push(offerRef);offers.push({...offer,offerRef});}
    if(options?.signal?.aborted||!await allowed(context,'search'))throw Error('access_changed');
    const current=[];for(const offer of offers){if(Date.parse(offer.expiresAt)>now())current.push(offer);else await offerStore.remove(context,offer.offerRef);}
    return {...result,offers:current};
   }catch{await Promise.allSettled(refs.map(ref=>offerStore.remove(context,ref)));return fail(503,'traveller_search_unavailable');}
  },
  async flexibleSearch(context,raw,options){
   if(!flexibleSearchService?.search||!offerStore?.put||!offerStore?.remove)return fail(503,'traveller_flexible_search_not_configured');
   const refs=[];
   try{
    if(!await allowed(context,'flexible_search'))return fail(403,'traveller_access_denied');
    const expected=expandFlexibleSearch(raw,now());if(!expected)return fail(400,'invalid_flexible_search');
    if(options?.signal?.aborted)return fail(409,'search_cancelled');
    const result=await flexibleSearchService.search(context.tenantId,raw,options);
    if(result.status!=='live')return result;
    if(!Array.isArray(result.candidates)||result.candidates.length!==expected.length)throw Error('invalid_candidates');
    const candidates=[];
    for(let i=0;i<expected.length;i++){
     const c=result.candidates[i],e=expected[i];
     if(!c||c.id!==e.id||c.baseline!==e.baseline||JSON.stringify(c.query)!==JSON.stringify(e.query)||!Array.isArray(c.offers)||c.offers.length>200||(!e.valid&&c.status==='live')||(c.status!=='live'&&c.offers.length))throw Error('candidate_mismatch');
     if(options?.signal?.aborted||!await allowed(context,'flexible_search'))throw Error('access_changed');
     const offers=[];
     for(const offer of c.offers){
      if(!(Date.parse(offer.expiresAt)>now()))continue;
      const offerRef=await offerStore.put(context,{query:e.query,offer},{signal:options?.signal});refs.push(offerRef);offers.push({...offer,offerRef});
     }
     candidates.push({...c,offers});
    }
    if(options?.signal?.aborted||!await allowed(context,'flexible_search'))throw Error('access_changed');
    // Storage may take time; expired offers must not remain advertised or ranked.
    for(const c of candidates){const kept=[];for(const o of c.offers){if(Date.parse(o.expiresAt)>now())kept.push(o);else await offerStore.remove(context,o.offerRef);}c.offers=kept;}
    const summaries=summarizeFareSavings(candidates,now()).map(s=>({...s,best:{...s.best,offerRef:candidates.find(c=>c.id===s.best.candidateId)?.offers.find(o=>o.id===s.best.offerId)?.offerRef}}));
    return {...result,candidates,summaries};
   }catch{await Promise.allSettled(refs.map(ref=>offerStore.remove(context,ref)));return fail(503,'traveller_flexible_search_unavailable');}
  },
  async refresh(context,raw,options){
   try{
    if(!offerStore?.get||!refreshOptions?.authorize)return fail(503,'traveller_refresh_not_configured');
    if(!await allowed(context,'refresh'))return fail(403,'traveller_access_denied');
    const refresh=createOfferRefresh({...refreshOptions,now,
     authorize:async c=>await allowed(context,'refresh')?refreshOptions.authorize({...c,actorId:context.actorId}):{allowed:false},
     loadOffer:async c=>offerStore.get(context,c.offerRef,{signal:options?.signal})
    });
    return await refresh.refresh(context.tenantId,raw,options);
   }catch{return fail(503,'traveller_refresh_unavailable');}
  }
 };
}
