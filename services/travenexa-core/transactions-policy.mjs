// Travel payment and fulfilment policy. No payment gateway is called by this module.
// A supplier API is not proof of merchant-of-record, accreditation or payment approval.
import { safeText } from './policy.mjs';

export const PAYMENT_MODES=Object.freeze([
  'supplier_checkout', 'platform_checkout', 'platform_split',
]);
const reject=(reason,detail)=>({allowed:false,reason,...(detail?{detail}:{})});

export function planPayment(booking, approval, {
  adyenEnabled=false,adyenPlatformSellerOnboarded=false,
  riskDecision='unknown',licenceValid=false,
}={}) {
  if (!booking || !approval || booking.tenantKey!==approval.tenantKey ||
    booking.supplierKey!==approval.supplierKey ||
    booking.productType!==approval.productType) return reject('supplier_tenant_mismatch');
  if (!PAYMENT_MODES.includes(booking.bookingMode) ||
    booking.bookingMode!==approval.paymentMode) return reject('payment_mode_not_approved');
  if (!approval.active || approval.status!=='approved' ||
    !approval.contractApproved || !approval.credentialsVerified ||
    !approval.travelComplianceApproved || !approval.paymentApproved ||
    !approval.servicingApproved || !approval.multiBrandPermission ||
    !licenceValid) return reject('commercial_or_regulatory_approval_required');
  if (approval.validUntil && Date.parse(approval.validUntil)<=Date.now())
    return reject('supplier_agreement_expired');
  if (booking.productType==='third_party_packages' &&
     (approval.merchantOfRecord!=='supplier' ||
      booking.bookingMode!=='supplier_checkout'))
    return reject('packages_must_have_authorised_supplier_organiser');
  if (booking.bookingMode==='supplier_checkout') {
    if (approval.merchantOfRecord!=='supplier')
      return reject('supplier_must_be_merchant_of_record');
    // Never tell Adyen to split funds for a supplier-hosted checkout.
    return {allowed:true,mode:'supplier_checkout',processor:'supplier',
      responsibility:'supplier',next:'supplier_verified_checkout_only'};
  }
  if (approval.merchantOfRecord!=='travenexa' &&
      approval.merchantOfRecord!=='approved_platform_seller')
    return reject('merchant_of_record_not_approved');
  if (!approval.ticketingApproved) return reject('ticketing_or_booking_rights_not_approved');
  if (!adyenEnabled) return reject('adyen_account_not_approved');
  if (riskDecision!=='approved') return reject('risk_check_incomplete');
  if (booking.bookingMode==='platform_split' && !adyenPlatformSellerOnboarded)
    return reject('adyen_platform_seller_not_onboarded');
  return {allowed:true,mode:booking.bookingMode,processor:'adyen',
    responsibility:'approved_merchant',next:'authorise_payment_before_supplier_order'};
}

export function verifySupplierPort(adapter) {
  if (!adapter || !safeText(adapter.id,100) ||
      !Array.isArray(adapter.products) || adapter.products.length===0 ||
      !['sandbox','production'].includes(adapter.environment)) return false;
  for (const fn of ['reprice','createOrder','getOrder','cancelOrder','getRefundStatus','verifyWebhook']) {
    if (typeof adapter[fn]!=='function') return false;
  }
  // These providers can only be invoked when contract scope and credentials are confirmed.
  return adapter.contractApproved===true && adapter.credentialsVerified===true &&
    adapter.legalApproved===true && adapter.ticketingApproved===true;
}
export function getSupplierCommand(adapter, {tenantId,productType,environment='sandbox'}={}) {
  if (!verifySupplierPort(adapter) ||
      !Array.isArray(adapter.tenantIds) || !adapter.tenantIds.includes(tenantId) ||
      !adapter.products.includes(productType) ||
      adapter.environment!==environment) return reject('supplier_transaction_port_not_approved');
  return {allowed:true,adapterId:adapter.id,environment};
}
export function verifyFraudPreflight({riskDecision,threeDSResult,highRisk=false}={}) {
  if (riskDecision!=='approved') return reject('fraud_decision_not_approved');
  if (highRisk && threeDSResult!=='authenticated') return reject('strong_authentication_required');
  return {allowed:true};
}
export function approvedMoney({currency,amountMinor,minorLimit=100000000000}={}) {
  return typeof currency==='string' && /^[A-Z]{3}$/.test(currency) &&
    Number.isSafeInteger(amountMinor) && amountMinor>=0 && amountMinor<=minorLimit;
}

// All supplier-specific webhooks need a real per-provider signature implementation.
// Do NOT trust x-tenant-id, x-signature, event type or PNR values from the browser.
export async function verifiedSupplierWebhook(adapter,{rawBody,headers}={}) {
  if (!verifySupplierPort(adapter)) return reject('supplier_adapter_not_approved');
  if (!(typeof rawBody==='string'||Buffer.isBuffer(rawBody)) ||
      !headers || typeof headers!=='object') return reject('invalid_supplier_webhook');
  let result;
  try { result=await adapter.verifyWebhook({rawBody,headers}); }
  catch { return reject('webhook_signature_invalid'); }
  if (!result || result.signatureVerified!==true ||
      !safeText(result.eventRef,255) || !safeText(result.tenantId,150) ||
      !safeText(result.bookingId,80) || !safeText(result.eventType,60))
    return reject('webhook_signature_invalid');
  if (!adapter.tenantIds.includes(result.tenantId))
    return reject('webhook_tenant_not_permitted');
  return {allowed:true,adapterId:adapter.id,eventRef:result.eventRef,
    tenantId:result.tenantId,bookingId:result.bookingId,eventType:result.eventType,
    supplierBookingRef:safeText(result.supplierBookingRef,250)||null};
}
