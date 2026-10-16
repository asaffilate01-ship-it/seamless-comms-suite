// Back-end transaction preparation. Does not charge Adyen or issue supplier orders.
// A provider's own approved reprice API must attest each amount before persistence.
import { getSupplierCommand, planPayment, approvedMoney } from './transactions-policy.mjs';
import { safeText } from './policy.mjs';

const blocked=(reason,detail)=>({status:'blocked',reason,...(detail?{detail}:{})});
export function createTransactionPreparer({ledger,approvalReader,providerResolver}={}) {
  if(!ledger || typeof ledger.persistVerifiedQuote!=='function' ||
     typeof ledger.createBookingDraft!=='function' ||
     typeof approvalReader!=='function' || typeof providerResolver!=='function')
    throw new TypeError('transaction_preparer_requires_trusted_services');
  return async function prepare({
    tenantId,supplierKey,productType,offerRef,idempotencyKey,termsAcceptanceRef,
    paymentContext={},environment='sandbox',
  }={}) {
    if(!safeText(tenantId,150)||!safeText(supplierKey,100)||
       !safeText(productType,40)||!safeText(offerRef,250)||
       !safeText(idempotencyKey,128)||!safeText(termsAcceptanceRef,250))
      return blocked('invalid_booking_request');
    // These values must be resolved from the authenticated backend, NOT browser headers.
    const adapter=await providerResolver(supplierKey);
    const port=getSupplierCommand(adapter,{tenantId,productType,environment});
    if(!port.allowed)return blocked(port.reason);
    const approval=await approvalReader({tenantKey:tenantId,supplierKey,productType});
    if(!approval)return blocked('supplier_approval_not_found');
    const payment=planPayment({
      tenantKey:tenantId,supplierKey,productType,bookingMode:approval.paymentMode,
    },approval,paymentContext);
    if(!payment.allowed)return blocked(payment.reason);
    // The supplier must return a FRESH, binding quote. No scraped or indicative prices.
    let offer;
    try {offer=await adapter.reprice({tenantId,productType,offerRef});}
    catch {return blocked('supplier_reprice_unavailable');}
    if(!offer || offer.verified!==true || offer.live!==true ||
       offer.offerRef!==offerRef ||
       !approvedMoney({currency:offer.currencyCode,amountMinor:offer.supplierMinor}) ||
       !Number.isSafeInteger(offer.markupMinor??0) ||
       (offer.markupMinor??0)<0 ||
       !offer.expiresAt || Date.parse(offer.expiresAt)<=Date.now())
      return blocked('supplier_reprice_not_verified');
    if(approval.paymentMode==='supplier_checkout' && (offer.markupMinor??0)!==0)
      return blocked('supplier_price_cannot_be_marked_up');
    const stored=await ledger.persistVerifiedQuote({
      tenantKey:tenantId,supplierKey,productType,
      supplierOfferRef:offerRef,bookingMode:approval.paymentMode,
      currencyCode:offer.currencyCode,supplierMinor:offer.supplierMinor,
      markupMinor:offer.markupMinor??0,expiresAt:offer.expiresAt,
      supplierTermsDigest:offer.termsDigest??null,
      sourceReference:offer.supplierSourceRef??null,verifiedBySupplier:true,
    });
    if(!stored?.id)return blocked(stored?.reason||'verified_quote_not_persisted');
    const draft=await ledger.createBookingDraft({
      tenantKey:tenantId,offerId:stored.id,
      idempotencyKey,customerContractReference:termsAcceptanceRef,
    });
    if(!draft?.id)return blocked(draft?.reason||'booking_draft_not_persisted');
    return {status:'draft',bookingId:draft.id,offerId:stored.id,
      tenantId,supplierKey,productType,amountMinor:stored.total_minor,
      currency:stored.currency_code,bookingMode:approval.paymentMode,
      paymentNext:payment.next,
      // Not a PNR, ticket, hotel confirmation or settled charge.
      ticketed:false,paymentCaptured:false,supplierOrderCreated:false};
  };
}
