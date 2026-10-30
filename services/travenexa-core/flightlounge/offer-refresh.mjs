import {supplierJson} from './supplier-response.mjs';
import {validBagSelection,baggageSubtotal} from './baggage-subtotal.mjs';
import {normalizeOffer,validateFlightSearch} from './live-search.mjs';
const tenant='travenexa-flightlounge';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
const amount=v=>typeof v==='string'&&/^\d{1,10}(\.\d{1,4})?$/.test(v);
const fail=(httpStatus,reason)=>({httpStatus,status:'unavailable',reason,bookingsEnabled:false});
export function itineraryKey(o){return JSON.stringify(o.slices.map(s=>s.segments.map(t=>[t.origin,t.destination,t.departingAt,t.arrivingAt,t.operatingCarrier,t.flightNumber,t.cabin])));}
// Expose only priced checked-bag services with known passenger/segment scope.
export function baggageServices(raw){
 if(!Array.isArray(raw?.passengers)||!Array.isArray(raw?.slices))return [];
 const passengerIds=raw.passengers.map(p=>p?.id);
 const segmentIds=raw.slices.flatMap(s=>Array.isArray(s?.segments)?s.segments.map(t=>t?.id):[null]);
 if(!passengerIds.length||!segmentIds.length||[...passengerIds,...segmentIds].some(v=>!id(v))||new Set(passengerIds).size!==passengerIds.length||new Set(segmentIds).size!==segmentIds.length)return [];
 const passengers=new Map(raw.passengers.map((p,i)=>[p.id,i+1]));
 const segments=new Map(raw.slices.flatMap((s,i)=>s.segments.map((t,j)=>[t.id,{leg:i+1,segment:j+1}])));
 const seen=new Set();return (Array.isArray(raw.available_services)?raw.available_services:[]).slice(0,200).flatMap(s=>{
  if(!s||s.type!=='baggage'||s.metadata?.type!=='checked'||!id(s.id)||seen.has(s.id)||!amount(s.total_amount)||!/^[A-Z]{3}$/.test(s.total_currency)||!Number.isInteger(s.maximum_quantity)||s.maximum_quantity<1||s.maximum_quantity>9||!Array.isArray(s.passenger_ids)||!s.passenger_ids.length||!Array.isArray(s.segment_ids)||!s.segment_ids.length||new Set(s.passenger_ids).size!==s.passenger_ids.length||new Set(s.segment_ids).size!==s.segment_ids.length||s.passenger_ids.some(p=>!id(p)||!passengers.has(p))||s.segment_ids.some(p=>!id(p)||!segments.has(p)))return [];
  seen.add(s.id);const positive=k=>Number.isFinite(s.metadata[k])&&s.metadata[k]>0?s.metadata[k]:null;
  return [{id:s.id,currency:s.total_currency,unitAmount:s.total_amount,maximumQuantity:s.maximum_quantity,passengers:s.passenger_ids.map(p=>passengers.get(p)),segments:s.segment_ids.map(p=>segments.get(p)),maximumWeightKg:positive('maximum_weight_kg'),dimensionsCm:{length:positive('maximum_length_cm'),height:positive('maximum_height_cm'),depth:positive('maximum_depth_cm')},selected:false}];
 });
}
export function createOfferRefresh({authorize,loadOffer,secretReader,audit,fetchImpl=fetch,now=()=>Date.now()}={}){
 return {async refresh(tenantId,raw,{signal}={}){
  if(tenantId!==tenant)return fail(403,'flightlounge_tenant_required');
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['offerRef','selectedBaggage'].includes(k))||!id(raw.offerRef)||!validBagSelection(raw.selectedBaggage===undefined?[]:raw.selectedBaggage))return fail(400,'invalid_offer_reference');
  if(!authorize||!loadOffer||!secretReader||!audit)return fail(503,'offer_refresh_not_configured');
  const context={tenantId,supplier:'duffel',product:'flights',action:'refresh',offerRef:raw.offerRef};
  const approved=g=>g?.allowed===true&&g.tenantId===tenantId&&g.supplier==='duffel';
  try{
   if(signal?.aborted)return fail(409,'refresh_cancelled');
   if(!approved(await authorize(context)))return fail(403,'offer_refresh_not_approved');
   // The resolver must enforce current actor ownership; never accept a browser-supplied snapshot.
   const record=await loadOffer(context);
   if(!record||record.tenantId!==tenantId||record.offerRef!==raw.offerRef||record.offer?.source!=='duffel'||record.offer.live!==true||!/^off_[A-Za-z0-9_-]{1,95}$/.test(record.offer.id))return fail(404,'offer_not_found');
   const query=validateFlightSearch(record.query,now());
   if(!query||!(Date.parse(record.offer.expiresAt)>now()))return fail(409,'offer_expired_or_invalid');
   const token=await secretReader(tenantId,'duffel');
   if(typeof token!=='string'||!token.startsWith('duffel_live_'))return fail(503,'live_supplier_credential_required');
   await audit({tenantId,event:'offer_refresh_started'});
   const response=await supplierJson(fetchImpl,`https://api.duffel.com/air/offers/${encodeURIComponent(record.offer.id)}?return_available_services=true`,{method:'GET',headers:{Authorization:`Bearer ${token}`,'Duffel-Version':'v2',Accept:'application/json'},redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
   if(!response.ok)return fail(response.status===404||response.status===410?409:503,'supplier_offer_unavailable');
   const supplier=response.data?.data;
   if(supplier?.id!==record.offer.id)return fail(503,'offer_identity_mismatch');
   const offer=normalizeOffer(supplier,query,now());
   if(!offer)return fail(409,'offer_no_longer_matches');
   const itineraryChanged=itineraryKey(record.offer)!==itineraryKey(offer);
   const currencyChanged=record.offer.currency!==offer.currency;
   const priceChanged=currencyChanged||record.offer.amount!==offer.amount;
   const baggageChanged=JSON.stringify(record.offer.slices.map(s=>s.segments.map(t=>t.checkedBagsPerPassenger)))!==JSON.stringify(offer.slices.map(s=>s.segments.map(t=>t.checkedBagsPerPassenger)));
   const services=baggageServices(supplier);
   if(signal?.aborted)return fail(409,'refresh_cancelled');
   if(!approved(await authorize(context)))return fail(403,'offer_refresh_access_revoked');
   await audit({tenantId,event:'offer_refresh_completed',priceChanged,itineraryChanged,baggageChanged});
   const answer={httpStatus:200,status:'live',offer,availableCheckedBagServices:services,changes:{priceChanged,currencyChanged,itineraryChanged,baggageChanged},requiresReview:priceChanged||itineraryChanged||baggageChanged,costs:{supplierFare:{amount:supplier.total_amount,currency:offer.currency,taxesIncluded:true},selectedExtras:[],finalTotal:null,unknown:['payment_and_seller_fees','selected_extras','ground_transport'],scope:'supplier_fare_only'},refreshedAt:new Date(now()).toISOString(),bookingsEnabled:false,notice:'Refreshed supplier quote, not a reservation or guaranteed checkout price. Available bags are optional, not selected or included in the fare. Review changes and revalidate before purchase.'};
   try{answer.baggageSubtotal=baggageSubtotal(answer,raw.selectedBaggage===undefined?[]:raw.selectedBaggage,now());}
   catch(error){return {...fail(409,error.message),requiresReselection:true};}
   return answer;
  }catch{return fail(503,'offer_refresh_unavailable');}
 }};
}
