import {validTravelDate,safeText} from '../policy.mjs';
const CABINS=['economy','premium_economy','business','first'];
export function validateFlightSearch(raw,now=Date.now()) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const allowed=['legs','adults','cabin','maxConnections','checkedBags'];
  if(Object.keys(raw).some(k=>!allowed.includes(k)))return null;
  if(!Array.isArray(raw.legs)||raw.legs.length<1||raw.legs.length>6||!Number.isInteger(raw.adults)||raw.adults<1||raw.adults>9||!CABINS.includes(raw.cabin)||!Number.isInteger(raw.maxConnections)||raw.maxConnections<0||raw.maxConnections>2||!Number.isInteger(raw.checkedBags)||raw.checkedBags<0||raw.checkedBags>2)return null;
  let last='';const legs=[];
  for(const leg of raw.legs){
    if(!leg||Object.keys(leg).some(k=>!['origin','destination','departure_date'].includes(k))||!/^([A-Z]{3})$/.test(leg.origin)||!/^([A-Z]{3})$/.test(leg.destination)||leg.origin===leg.destination||!validTravelDate(leg.departure_date,now)||leg.departure_date<last)return null;
    last=leg.departure_date;legs.push({...leg});
  }
  return {legs,adults:raw.adults,cabin:raw.cabin,maxConnections:raw.maxConnections,checkedBags:raw.checkedBags};
}
const unavailable=reason=>({httpStatus:503,status:'unavailable',reason,offers:[],coverage:{attempted:[],succeeded:[]}});
// Inject persisted server-side supplier approval and tenant-scoped secrets. Nothing enabled by default.
export function createLiveFlightSearch({authorize,secretReader,audit,fetchImpl=fetch,now=()=>Date.now()}={}) {
  return {async search(tenantId,raw){
    const query=validateFlightSearch(raw,now());
    if(!query)return {httpStatus:400,status:'invalid_request',reason:'unsupported_or_invalid_search',offers:[]};
    if(tenantId!=='travenexa-flightlounge')return {httpStatus:403,status:'unavailable',reason:'flightlounge_tenant_required',offers:[]};
    if(!authorize||!secretReader||!audit)return unavailable('supplier_not_configured');
    try {
      const grant=await authorize({tenantId,supplier:'duffel',product:'flights',action:'search'});
      if(grant?.allowed!==true||grant.tenantId!==tenantId||grant.supplier!=='duffel')return unavailable('supplier_not_approved');
      const token=await secretReader(tenantId,'duffel');
      if(typeof token!=='string'||!token.startsWith('duffel_live_'))return unavailable('live_supplier_credential_required');
      await audit({tenantId,supplier:'duffel',event:'search_started'});
      const response=await fetchImpl('https://api.duffel.com/air/offer_requests?return_offers=true&supplier_timeout=10000',{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Duffel-Version':'v2','Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({data:{slices:query.legs,passengers:Array.from({length:query.adults},()=>({type:'adult'})),cabin_class:query.cabin,max_connections:query.maxConnections}}),
        redirect:'error',signal:AbortSignal.timeout(15000)
      });
      if(!response.ok)return {...unavailable('supplier_request_failed'),coverage:{attempted:['duffel'],succeeded:[]}};
      const text=await response.text();if(text.length>4000000)throw Error('response_too_large');
      const data=JSON.parse(text).data;
      if(data?.live_mode!==true||!Array.isArray(data.offers))return unavailable('non_live_or_invalid_supplier_response');
      const offers=data.offers.slice(0,200).map(o=>normalizeOffer(o,query,now())).filter(Boolean);
      const currencies=[...new Set(offers.map(o=>o.currency))];
      offers.sort((a,b)=>a.currency.localeCompare(b.currency)||Number(b.baggageRequirementMet)-Number(a.baggageRequirementMet)||a.amount-b.amount);
      await audit({tenantId,supplier:'duffel',event:'search_completed',offerCount:offers.length});
      return {httpStatus:200,status:'live',offers,currencies,coverage:{attempted:['duffel'],succeeded:['duffel'],rejectedOffers:data.offers.length-offers.length,truncated:data.offers.length>200},searchedAt:new Date(now()).toISOString(),notice:'Supplier fare quotes only. No worldwide-lowest claim. Additional baggage, seats and final seller fees must be confirmed before purchase.',bookingsEnabled:false};
    }catch{return unavailable('supplier_unavailable');}
  }};
}
export function normalizeOffer(o,q,now){
  if(o?.live_mode!==true||!safeText(o.id)||!/^\d+(\.\d{1,4})?$/.test(o.total_amount)||!Number.isFinite(Number(o.total_amount))||! /^[A-Z]{3}$/.test(o.total_currency)||!(Date.parse(o.expires_at)>now)||!Array.isArray(o.slices)||o.slices.length!==q.legs.length||!Array.isArray(o.passengers)||o.passengers.length!==q.adults)return null;
  const slices=[];let baggageRequirementMet=true;
  for(let i=0;i<q.legs.length;i++){
    const slice=o.slices[i],leg=q.legs[i];
    if(!Array.isArray(slice.segments)||!slice.segments.length||slice.segments.length>q.maxConnections+1)return null;
    const segments=[];
    for(const s of slice.segments){
      if(!/^[A-Z]{3}$/.test(s.origin?.iata_code)||! /^[A-Z]{3}$/.test(s.destination?.iata_code)||!safeText(s.operating_carrier?.name)||!safeText(s.departing_at)||!safeText(s.arriving_at)||!Number.isFinite(Date.parse(s.departing_at))||!Number.isFinite(Date.parse(s.arriving_at))||!Array.isArray(s.passengers)||s.passengers.length!==q.adults||s.passengers.some(p=>p.cabin_class!==q.cabin))return null;
      const bags=s.passengers.map(p=>{const b=p.baggages?.find(b=>b.type==='checked');return Number.isInteger(b?.quantity)&&b.quantity>=0?b.quantity:null});
      if(bags.some(b=>b===null||b<q.checkedBags))baggageRequirementMet=false;
      segments.push({origin:s.origin.iata_code,destination:s.destination.iata_code,departingAt:s.departing_at,arrivingAt:s.arriving_at,originTimezone:s.origin.time_zone||null,destinationTimezone:s.destination.time_zone||null,operatingCarrier:s.operating_carrier.name,flightNumber:s.operating_carrier_flight_number||null,cabin:q.cabin,checkedBagsPerPassenger:bags});
    }
    if(segments[0].origin!==leg.origin||segments.at(-1).destination!==leg.destination||segments[0].departingAt.slice(0,10)!==leg.departure_date)return null;
    slices.push({segments});
  }
  return {id:o.id,source:'duffel',live:true,currency:o.total_currency,amount:Number(o.total_amount),expiresAt:o.expires_at,slices,baggageRequirementMet,priceScope:'supplier_fare_only',bookable:false};
}
