// Four-decimal fixed-point arithmetic preserves supplier precision without float rounding.
function units(value){
 if(typeof value!=='string'||!/^\d{1,10}(\.\d{1,4})?$/.test(value))throw Error('invalid_supplier_amount');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));
}
function decimal(value){const whole=value/10000n,fraction=(value%10000n).toString().padStart(4,'0').replace(/0+$/,'');return whole.toString()+(fraction?'.'+fraction:'');}
export function validBagSelection(selection){
 return Array.isArray(selection)&&selection.length<=12&&new Set(selection.map(s=>s?.id)).size===selection.length&&selection.every(s=>s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).every(k=>['id','quantity'].includes(k))&&typeof s.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s.id)&&Number.isInteger(s.quantity)&&s.quantity>=1&&s.quantity<=9);
}
export function baggageSubtotal(refreshed,selection=[],now=Date.now()){
 if(!validBagSelection(selection))throw Error('invalid_baggage_selection');
 if(refreshed?.status!=='live'||refreshed.offer?.live!==true||refreshed.offer?.bookable!==false||!(Date.parse(refreshed.offer.expiresAt)>now))throw Error('fresh_offer_required');
 const fare=refreshed.costs?.supplierFare;
 if(!fare||!/^[A-Z]{3}$/.test(fare.currency)||fare.currency!==refreshed.offer.currency||fare.taxesIncluded!==true)throw Error('invalid_supplier_fare');
 let extra=0n;const occupied=new Set(),lines=[];
 for(const chosen of selection){
  const matches=refreshed.availableCheckedBagServices?.filter(s=>s.id===chosen.id)||[];
  if(matches.length!==1)throw Error('selected_baggage_unavailable');
  const service=matches[0];
  if(service.currency!==fare.currency)throw Error('mixed_currency_baggage');
  if(!Number.isInteger(service.maximumQuantity)||chosen.quantity>service.maximumQuantity)throw Error('baggage_quantity_unavailable');
  if(!Array.isArray(service.passengers)||!service.passengers.length||!Array.isArray(service.segments)||!service.segments.length)throw Error('unknown_baggage_scope');
  // Overlapping service alternatives may be incompatible. Require a provider selection flow instead.
  for(const passenger of service.passengers)for(const segment of service.segments){
   if(!Number.isInteger(passenger)||passenger<1||!Number.isInteger(segment.leg)||segment.leg<1||!Number.isInteger(segment.segment)||segment.segment<1)throw Error('unknown_baggage_scope');
   const key=`${passenger}:${segment.leg}:${segment.segment}`;
   if(occupied.has(key))throw Error('overlapping_baggage_services');occupied.add(key);
  }
  const line=units(service.unitAmount)*BigInt(chosen.quantity);extra+=line;
  lines.push({...service,quantity:chosen.quantity,lineAmount:decimal(line),selected:true});
 }
 return {currency:fare.currency,supplierFare:fare.amount,selectedBaggage:decimal(extra),knownSubtotal:decimal(units(fare.amount)+extra),lines,finalTotal:null,scope:'supplier_fare_plus_selected_checked_baggage',unknown:['payment_and_seller_fees','other_selected_extras','ground_transport'],notice:'Calculated subtotal from the refreshed fare and selected baggage quotes. Not a supplier-confirmed checkout total, reservation or confirmation that all baggage requirements are met.'};
}
