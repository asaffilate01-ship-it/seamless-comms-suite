// Server-only, single-landlord supplier search orchestration. No payment or ticket issuance.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { SUPPLIER_BY_ID, TENANTS } from './catalog.mjs';
import { supplierApprovalValid, canPresentOffer } from './supplier-approvals.mjs';
import { calculateSellPrice, checkoutReadiness, safeText, validateSearch,
  validatedHttpsRedirect } from './policy.mjs';

const deny = reason => ({httpStatus:503,status:'unavailable',reason});
function tokenEquals(expected, supplied) {
  if (typeof expected!=='string' || expected.length<24 || typeof supplied!=='string') return false;
  const a=Buffer.from(expected), b=Buffer.from(supplied);
  return a.length===b.length && timingSafeEqual(a,b);
}
function validProvider(adapter, query) {
  const supplier=SUPPLIER_BY_ID[adapter?.id];
  return !!(supplier && supplier.products.includes(query.productType) &&
    adapter.connected===true && adapter.contractApproved===true &&
    adapter.credentialsVerified===true && adapter.legalApproved===true &&
    Array.isArray(adapter.tenantIds) && adapter.tenantIds.includes(query.tenantId) &&
    Array.isArray(adapter.products) && adapter.products.includes(query.productType) &&
    (adapter.countries===undefined ||
      (Array.isArray(adapter.countries)&&adapter.countries.includes(query.destinationCountry))) &&
    typeof adapter.search==='function');
}
function normalize(item, adapter, approval, query, at, rules, quoteStore) {
  const supplier=SUPPLIER_BY_ID[adapter.id];
  if (!item || item.verified!==true || item.live!==true || !supplier) return null;
  const supplierOfferId=safeText(item.offerId,120), title=safeText(item.title,180);
  const expiresAt=Date.parse(item.expiresAt);
  if (!supplierOfferId || !title || !Number.isFinite(expiresAt) ||
      expiresAt<=at || expiresAt>at+30*60*1000) return null;
  const bookingMode=item.bookingMode;
  if (!canPresentOffer(approval,bookingMode)) return null;
  const supplierHosted = bookingMode==='affiliate'||bookingMode==='supplier_checkout';
  if (bookingMode==='affiliate' && adapter.affiliateApproved!==true) return null;
  if (bookingMode==='supplier_checkout' && (adapter.checkoutApproved!==true ||
      adapter.servicingApproved!==true)) return null;
  if (!supplierHosted && (adapter.bookingApiApproved!==true ||
      adapter.paymentApproved!==true || adapter.ticketingApproved!==true ||
      adapter.finalConsumerPriceApproved!==true || item.totalPriceVerified!==true)) return null;
  const supplierLink=supplierHosted
    ? validatedHttpsRedirect(bookingMode==='affiliate'?item.affiliateRedirect:item.supplierCheckoutUrl,
        adapter.redirectHosts||[])
    : null;
  if (supplierHosted && !supplierLink) return null;
  const markupMinor=rules?.[query.tenantId]?.[query.productType]?.[adapter.id] ?? 0;
  const pricing=calculateSellPrice({supplierMinor:item.totalMinor,
    currencyCode:item.currency, markupMinor,
    allowMarkup:adapter.markupApproved===true && !supplierHosted,bookingMode});
  if (!pricing) return null;
  if (quoteStore.size>20000) {
    for (const [key,stored] of quoteStore) if (stored.expiresAt<=at) quoteStore.delete(key);
    if (quoteStore.size>20000) quoteStore.clear(); // never preserve unverifiable offers
  }
  const id='tnx_'+randomUUID();
  quoteStore.set(id,Object.freeze({
    tenantId:query.tenantId,providerId:adapter.id,supplierOfferId,
    currency:pricing.currency,amountMinor:pricing.finalMinor,expiresAt,
    bookingMode,productType:query.productType,
  }));
  return {
    id,title,supplierName:supplier.name,currency:pricing.currency,
    amount:pricing.amount,expiresAt:new Date(expiresAt).toISOString(),
    description:safeText(item.description,400)||undefined,
    verified:true,live:true,bookingMode,
    affiliateRedirect:bookingMode==='affiliate'?supplierLink:undefined,
    supplierCheckoutUrl:bookingMode==='supplier_checkout'?supplierLink:undefined,
    priceProvenance:'contracted_live_supplier', supplierResponsible:supplierHosted,
    // No invented conversion: offer currency is the contracted supplier currency.
    quotedCurrency:pricing.currency, presentationCurrency:query.displayCurrency,
  };
}
export function createTravelEngine({tenantTokens={},adapters=[],pricingRules={},
  approvalReader=async()=>null, now=()=>Date.now()}={}) {
  const quoteStore=new Map();
  const unique=new Set();
  for (const [tenantId,value] of Object.entries(tenantTokens)) {
    if (!TENANTS[tenantId] || typeof value!=='string' || value.length<24 ||
        unique.has(value)) throw new Error('invalid_tenant_token_configuration');
    unique.add(value);
  }
  function authenticate(tenantId, bearer) {
    return !!TENANTS[tenantId] && tokenEquals(tenantTokens[tenantId],bearer);
  }
  async function approvedAdapters(query) {
    const candidates=adapters.filter(adapter=>validProvider(adapter,query));
    const assessed=await Promise.allSettled(candidates.map(async adapter=>{
      const approval=await approvalReader({
        tenantId:query.tenantId,supplierKey:adapter.id,productType:query.productType,
      });
      return supplierApprovalValid(approval,{
        tenantId:query.tenantId,supplierKey:adapter.id,productType:query.productType,
        at:now(),
      }) ? {adapter,approval} : null;
    }));
    return assessed.filter(x=>x.status==='fulfilled' && x.value).map(x=>x.value);
  }
  async function search(tenantId, raw) {
    const at=now();
    const query=validateSearch(raw,tenantId,at);
    if (!query) return {httpStatus:400,status:'unavailable',reason:'invalid_search'};
    const eligible=await approvedAdapters(query);
    if (!eligible.length) return deny('supplier_not_connected');
    const responses=await Promise.allSettled(eligible.map(async ({adapter,approval})=>{
      const result=await adapter.search(query);
      if (!Array.isArray(result)) throw new Error('invalid_provider_response');
      return result.slice(0,40).map(item=>normalize(item,adapter,approval,query,at,pricingRules,quoteStore)).filter(Boolean);
    }));
    const succeeded=responses.filter(item=>item.status==='fulfilled');
    if (!succeeded.length) return deny('supplier_service_unavailable');
    const offers=succeeded.flatMap(item=>item.value).slice(0,50)
      .sort((a,b)=>a.currency===b.currency ? a.amount-b.amount : a.currency.localeCompare(b.currency));
    // Never compare amounts from different currencies as if exchange rates were known.
    return {httpStatus:200,status:'live',offers};
  }
  async function readiness(tenantId) {
    const tenant=TENANTS[tenantId];
    if (!tenant) return {httpStatus:404,status:'unavailable',reason:'unknown_tenant'};
    // Product readiness is derived from current persisted tenant/provider approvals,
    // never merely from environment variables or connector's in-memory booleans.
    const eligible=new Set();
    for (const productType of tenant.products) {
      const query={tenantId,productType,destinationCountry:tenant.destinationCountry};
      const active=await approvedAdapters(query);
      for (const {adapter} of active) eligible.add(adapter.id);
    }
    return {httpStatus:200,status:eligible.size?'supplier_approved':'configuration_pending',
      landlord:'travenexa',tenantId,brand:tenant.name,productTypes:tenant.products,
      eligibleSuppliers:[...eligible],
      bookingsEnabled:false,paymentsEnabled:false,
      omniqora:{searchAssist:'interface_only',marketingAutomation:'pending_connection'}};
  }
  function bookingPreflight(tenantId,reference) {
    const quote=quoteStore.get(reference);
    if (!quote || quote.tenantId!==tenantId || quote.expiresAt<=now())
      return {httpStatus:404,status:'blocked',reason:'offer_not_found_or_expired'};
    // A passed supplier search does not imply permission to sell, charge or issue a ticket.
    const gate=checkoutReadiness({});
    return {httpStatus:503,status:'blocked',reason:'booking_not_enabled',
      blockers:gate.blockers.concat('durable_booking_ledger_required','live_payment_flow_required',
        'supplier_reprice_and_ticketing_required'),quoteCurrency:quote.currency};
  }
  return {authenticate,search,readiness,bookingPreflight,
    hasConfiguredTenants:()=>Object.keys(tenantTokens).length>0,
    // No public create-booking or payment endpoint until contracted integrations exist.
  };
}
