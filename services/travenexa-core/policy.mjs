// Deterministic travel policy functions; no AI can override these booking/payment gates.
import { PRODUCT_ALIASES, PRODUCT_TYPES, TENANTS } from './catalog.mjs';

export const safeText = (value, max=120) => {
  if (typeof value !== 'string') return null;
  const result=value.trim();
  return result && result.length <= max && !/[\x00-\x1f\x7f]/.test(result) ? result : null;
};
export const country = value => typeof value === 'string' && /^[A-Z]{2}$/.test(value) ? value : null;
export const currency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;
export function validTravelDate(value, at=Date.now()) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const ts=Date.parse(value);
  if (!Number.isFinite(ts) || new Date(ts).toISOString().slice(0,10)!==value) return false;
  const start=Date.parse(new Date(at).toISOString().slice(0,10));
  return ts>=start && ts<=start+550*86400000;
}
export function validateSearch(raw, tenantId, at=Date.now()) {
  const tenant=TENANTS[tenantId];
  if (!tenant || !raw || typeof raw!=='object' || Array.isArray(raw)) return null;
  const requested=safeText(raw.productType,40);
  const type=PRODUCT_ALIASES[requested] || requested;
  if (!PRODUCT_TYPES.includes(type) || !tenant.products.includes(type)) return null;
  // This is a platform for travel worldwide, but the four market-specific UK sites
  // cannot expand their market, destination, language or presentation currency.
  const destination=country(raw.destinationCountry);
  if (!destination || (tenant.destinationCountry && destination!==tenant.destinationCountry)) return null;
  if (tenant.sourceMarket && (raw.sourceMarket!==tenant.sourceMarket ||
    raw.locale!==tenant.locale || raw.displayCurrency!==tenant.displayCurrency)) return null;
  if (raw.sourceMarket != null && !country(raw.sourceMarket)) return null;
  if (!validTravelDate(raw.travelDate,at)) return null;
  const travellers=Number(raw.travellers);
  if (!Number.isInteger(travellers) || travellers<1 || travellers>12) return null;
  const origin=raw.from==null?null:safeText(raw.from,100);
  const destinationPoint=safeText(raw.to,100);
  if (!destinationPoint || (['flights','rail','coach','chauffeur','transfers','car_hire'].includes(type) && !origin)) return null;
  if (!['flights','rail','coach','chauffeur','transfers','car_hire'].includes(type) && raw.from!=null && !origin) return null;
  const nights=raw.nights==null?null:Number(raw.nights);
  if (type==='hotels' && (!Number.isInteger(nights) || nights<1 || nights>30)) return null;
  const arrivalTime=raw.arrivalTime==null?null:safeText(raw.arrivalTime,5);
  if (arrivalTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(arrivalTime)) return null;
  const flightNumber=raw.flightNumber==null?null:safeText(raw.flightNumber,16);
  if (raw.flightNumber!=null && !flightNumber) return null;
  if (raw.locale!=null && (!safeText(raw.locale,20)||!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(raw.locale))) return null;
  if (raw.displayCurrency!=null && !currency(raw.displayCurrency)) return null;
  return Object.freeze({
    tenantId, productType:type, requestedProductType:requested, destinationCountry:destination,
    sourceMarket:tenant.sourceMarket || country(raw.sourceMarket), travelDate:raw.travelDate,
    travellers, from:origin, to:destinationPoint, nights:type==='hotels'?nights:null,
    arrivalTime, flightNumber:type==='transfers'?flightNumber:null,
    locale:tenant.locale||raw.locale||'en-GB',
    displayCurrency:tenant.displayCurrency||raw.displayCurrency||'GBP',
  });
}
export function validatedHttpsRedirect(value, allowedHosts=[]) {
  if (typeof value!=='string') return null;
  try {
    const uri=new URL(value);
    const hosts=new Set(allowedHosts.map(h=>h.toLowerCase()));
    if (uri.protocol!=='https:' || uri.username || uri.password || uri.port ||
        !hosts.has(uri.hostname.toLowerCase()) || !hosts.size) return null;
    return uri.href;
  } catch { return null; }
}
export function currencyDigits(code) {
  if (!currency(code)) return null;
  try {
    return new Intl.NumberFormat('en-GB',{style:'currency',currency:code})
      .resolvedOptions().maximumFractionDigits;
  } catch { return null; }
}
export function calculateSellPrice({supplierMinor,currencyCode,markupMinor=0,allowMarkup=false,bookingMode}) {
  const digits=currencyDigits(currencyCode);
  if (digits==null || !Number.isSafeInteger(supplierMinor) || supplierMinor<0 ||
      supplierMinor>100_000_000 || !Number.isSafeInteger(markupMinor) || markupMinor<0 || markupMinor>100_000)
    return null;
  // Affiliate or supplier-owned prices cannot be silently marked up by TraveNexa.
  if ((bookingMode==='affiliate' || !allowMarkup) && markupMinor!==0) return null;
  const finalMinor=supplierMinor+markupMinor;
  return {currency:currencyCode, supplierMinor, markupMinor, finalMinor,
    amount:finalMinor/(10**digits), grossMarginMinor:markupMinor};
}
export function checkoutReadiness({supplierApproved=false,travelComplianceApproved=false,
  merchantApproved=false,paymentMode='supplier_checkout',adyenOnboarded=false,
  ticketingApproved=false,providerServicingApproved=false}) {
  const blockers=[];
  if (!supplierApproved) blockers.push('supplier_contract_required');
  if (!travelComplianceApproved) blockers.push('travel_compliance_approval_required');
  if (!merchantApproved) blockers.push('merchant_of_record_agreement_required');
  if (!providerServicingApproved) blockers.push('servicing_responsibility_required');
  if (!['supplier_checkout','platform_checkout','platform_split'].includes(paymentMode))
    blockers.push('payment_mode_invalid');
  if (paymentMode==='platform_split'&&!adyenOnboarded) blockers.push('adyen_platform_onboarding_required');
  if (paymentMode!=='supplier_checkout'&&!ticketingApproved) blockers.push('ticketing_approval_required');
  return {enabled:blockers.length===0, blockers};
}
