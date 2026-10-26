import {validateFlightSearch} from './live-search.mjs';
import {createOfferRefresh} from './offer-refresh.mjs';
import {validScope} from './offer-store.mjs';
const fail=(code,reason)=>({httpStatus:code,status:'unavailable',reason,offers:[],bookingsEnabled:false});
// context MUST come from a verified host session, never request JSON or an actor header.
export function createTravellerFlightSession({searchService,offerStore,authorize,refreshOptions,now=()=>Date.now()}={}){
 async function allowed(context,action){if(!validScope(context)||!authorize)return false;const g=await authorize({...context,action});return g?.allowed===true&&g.tenantId===context.tenantId&&g.actorId===context.actorId;}
 return {
  async search(context,raw,options){
   if(!searchService?.search||!offerStore?.put||!offerStore?.remove)return fail(503,'traveller_search_not_configured');
   const refs=[];
   try{
    if(!await allowed(context,'search'))return fail(403,'traveller_access_denied');
    const query=validateFlightSearch(raw,now());if(!query)return fail(400,'invalid_search');
    const result=await searchService.search(context.tenantId,query,options);
    if(result.status!=='live')return result;
    if(!Array.isArray(result.offers)||result.offers.length>200)throw Error('invalid_offers');
    if(!await allowed(context,'search'))return fail(403,'traveller_access_revoked');
    const offers=[];
    for(const offer of result.offers){const offerRef=await offerStore.put(context,{query,offer});refs.push(offerRef);offers.push({...offer,offerRef});}
    if(options?.signal?.aborted||!await allowed(context,'search'))throw Error('access_changed');
    return {...result,offers};
   }catch{await Promise.allSettled(refs.map(ref=>offerStore.remove(context,ref)));return fail(503,'traveller_search_unavailable');}
  },
  async refresh(context,raw,options){
   try{
    if(!offerStore?.get||!refreshOptions?.authorize)return fail(503,'traveller_refresh_not_configured');
    if(!await allowed(context,'refresh'))return fail(403,'traveller_access_denied');
    const refresh=createOfferRefresh({...refreshOptions,now,
     authorize:async c=>await allowed(context,'refresh')?refreshOptions.authorize({...c,actorId:context.actorId}):{allowed:false},
     loadOffer:async c=>offerStore.get(context,c.offerRef)
    });
    return await refresh.refresh(context.tenantId,raw,options);
   }catch{return fail(503,'traveller_refresh_unavailable');}
  }
 };
}
