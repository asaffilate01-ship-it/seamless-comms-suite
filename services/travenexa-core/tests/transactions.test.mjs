import test from 'node:test';
import assert from 'node:assert/strict';
import { planPayment, verifySupplierPort, getSupplierCommand,
  verifyFraudPreflight, approvedMoney, verifiedSupplierWebhook } from '../transactions-policy.mjs';
import { createTraveNexaLedger, BOOKING_TRANSITIONS } from '../ledger.mjs';

const TENANT='travenexa-flightlounge', BOOKING='11111111-1111-4111-8111-111111111111';
const OFFER='22222222-2222-4222-8222-222222222222';
const baseApproval={tenantKey:TENANT,supplierKey:'mystifly',productType:'flights',status:'approved',
  active:true,contractApproved:true,credentialsVerified:true,travelComplianceApproved:true,
  paymentApproved:true,servicingApproved:true,multiBrandPermission:true,
  merchantOfRecord:'travenexa',paymentMode:'platform_checkout',ticketingApproved:true};
const baseBooking={tenantKey:TENANT,supplierKey:'mystifly',productType:'flights',
  bookingMode:'platform_checkout'};
function recorder(rows=[{id:BOOKING}]) {
  const calls=[];
  const db={async query(text,params){calls.push({text,params});return {rows};}};
  return {ledger:createTraveNexaLedger({db}),calls};
}
test('travel sales remain disabled until supplier, compliance, merchant and ticketing approvals',()=>{
  assert.equal(planPayment(baseBooking,{},{}).reason,'supplier_tenant_mismatch');
  assert.equal(planPayment(baseBooking,baseApproval,{licenceValid:false}).allowed,false);
  assert.equal(planPayment(baseBooking,baseApproval,{licenceValid:true}).reason,'adyen_account_not_approved');
  assert.equal(planPayment(baseBooking,baseApproval,{licenceValid:true,adyenEnabled:true})
    .reason,'risk_check_incomplete');
  const ready=planPayment(baseBooking,baseApproval,
    {licenceValid:true,adyenEnabled:true,riskDecision:'approved'});
  assert.equal(ready.allowed,true);
  assert.equal(ready.next,'authorise_payment_before_supplier_order');
  assert.equal(ready.processor,'adyen');
});
test('supplier-managed checkout never requires nor creates an Adyen split',()=>{
  const approval={...baseApproval,paymentMode:'supplier_checkout',
    merchantOfRecord:'supplier',ticketingApproved:false};
  const quote={...baseBooking,bookingMode:'supplier_checkout'};
  const decision=planPayment(quote,approval,{licenceValid:true});
  assert.equal(decision.allowed,true);
  assert.equal(decision.processor,'supplier');
  assert.equal(decision.next,'supplier_verified_checkout_only');
  const wrong=planPayment({...quote,productType:'third_party_packages'},
    {...approval,productType:'third_party_packages',merchantOfRecord:'travenexa'},
    {licenceValid:true});
  assert.equal(wrong.allowed,false);
});
test('Adyen for Platforms is gated by seller onboarding and fraud approval',()=>{
  const q={...baseBooking,bookingMode:'platform_split'};
  const a={...baseApproval,paymentMode:'platform_split',merchantOfRecord:'approved_platform_seller'};
  assert.equal(planPayment(q,a,{licenceValid:true,adyenEnabled:true,riskDecision:'approved'})
    .reason,'adyen_platform_seller_not_onboarded');
  assert.equal(planPayment(q,a,{licenceValid:true,adyenEnabled:true,
    riskDecision:'approved',adyenPlatformSellerOnboarded:true}).allowed,true);
  assert.equal(verifyFraudPreflight({riskDecision:'review'}).allowed,false);
  assert.equal(verifyFraudPreflight({riskDecision:'approved',highRisk:true}).allowed,false);
  assert.equal(verifyFraudPreflight({riskDecision:'approved',highRisk:true,
    threeDSResult:'authenticated'}).allowed,true);
  assert.equal(approvedMoney({currency:'GBP',amountMinor:21000}),true);
  assert.equal(approvedMoney({currency:'GBP',amountMinor:21.5}),false);
});
const fakeSupplier=(other={})=>({
  id:'mystifly',products:['flights'],tenantIds:[TENANT],environment:'sandbox',
  contractApproved:true,credentialsVerified:true,legalApproved:true,ticketingApproved:true,
  reprice:async()=>{},createOrder:async()=>{},getOrder:async()=>{},
  cancelOrder:async()=>{},getRefundStatus:async()=>{},
  verifyWebhook:async()=>({signatureVerified:true,eventRef:'order-created-123',
    tenantId:TENANT,bookingId:BOOKING,eventType:'confirmed'}),
  ...other,
});
test('transaction adapter requires signed commercial approval, sandbox and tenant entitlements',()=>{
  const adapter=fakeSupplier();
  assert.equal(verifySupplierPort(adapter),true);
  assert.equal(verifySupplierPort({...adapter,legalApproved:false}),false);
  assert.equal(getSupplierCommand(adapter,{tenantId:TENANT,productType:'flights'}).allowed,true);
  assert.equal(getSupplierCommand(adapter,{tenantId:'travenexa-marocways',productType:'flights'})
    .allowed,false);
  assert.equal(getSupplierCommand(adapter,{tenantId:TENANT,productType:'hotels'}).allowed,false);
  assert.equal(getSupplierCommand(adapter,{tenantId:TENANT,productType:'flights',
    environment:'production'}).allowed,false);
});
test('provider webhooks cannot claim verified state without a real adapter validation',async()=>{
  const rawBody=JSON.stringify({id:'order-created-123'});
  assert.equal((await verifiedSupplierWebhook(fakeSupplier({verifyWebhook:async()=>({signatureVerified:false})}),
    {rawBody,headers:{}})).allowed,false);
  assert.equal((await verifiedSupplierWebhook(fakeSupplier({verifyWebhook:async()=>{
    throw new Error('bad hmac');
  }}),{rawBody,headers:{}})).allowed,false);
  const receipt=await verifiedSupplierWebhook(fakeSupplier(),{rawBody,headers:{}});
  assert.equal(receipt.allowed,true);
  assert.equal(receipt.tenantId,TENANT);
  assert.equal((await verifiedSupplierWebhook(fakeSupplier({verifyWebhook:async()=>({
    signatureVerified:true,eventRef:'any',tenantId:'travenexa-marocways',
    bookingId:BOOKING,eventType:'confirmed',
  })}),{rawBody,headers:{}})).allowed,false);
});
test('quote is never stored unless live supplier attestation and valid money are supplied',async()=>{
  const {ledger,calls}=recorder();
  const quote={tenantKey:TENANT,supplierKey:'mystifly',productType:'flights',
    supplierOfferRef:'NDC-123',bookingMode:'platform_checkout',
    currencyCode:'GBP',supplierMinor:20000,markupMinor:1000,
    expiresAt:new Date(Date.now()+10*60000).toISOString(),verifiedBySupplier:true};
  await assert.rejects(()=>ledger.persistVerifiedQuote({...quote,verifiedBySupplier:false}),
    /supplier_price_not_verified/);
  await assert.rejects(()=>ledger.persistVerifiedQuote({...quote,supplierMinor:-1}),
    /invalid_quote_amount/);
  await assert.rejects(()=>ledger.persistVerifiedQuote({...quote,bookingMode:'supplier_checkout'}),
    /supplier_price_cannot_be_marked_up/);
  await ledger.persistVerifiedQuote(quote);
  assert.equal(calls.length,1);
  assert.match(calls[0].text,/FROM public.travenexa_supplier_approvals/);
  assert.match(calls[0].text,/a.active=true/);
  assert.deepEqual(calls[0].params.slice(0,5),[TENANT,'mystifly','flights','NDC-123','platform_checkout']);
});
test('draft booking uses tenant-locked offer, live expiry and atomic idempotency',async()=>{
  const {ledger,calls}=recorder();
  await assert.rejects(()=>ledger.createBookingDraft({tenantKey:TENANT,offerId:OFFER,
    idempotencyKey:'bad'}),/invalid_idempotency_key/);
  const args={tenantKey:TENANT,offerId:OFFER,idempotencyKey:'once-per-order-12345',
    customerContractReference:'terms-acceptance-123'};
  await ledger.createBookingDraft(args);
  assert.match(calls[0].text,/o.tenant_key=\$1/);
  assert.match(calls[0].text,/o.expires_at>now\(\)/);
  assert.match(calls[0].text,/ON CONFLICT\(tenant_key,idempotency_key\)/);
  assert.match(calls[0].text,/offer_id=EXCLUDED.offer_id/);
  assert.equal(calls[0].params[2],args.idempotencyKey);
});
test('only verified payment/supplier evidence can be written; replay-safe on provider event IDs',async()=>{
  const {ledger,calls}=recorder();
  await assert.rejects(()=>ledger.recordPaymentProof({tenantKey:TENANT,bookingId:BOOKING,
    processor:'adyen',eventRef:'EVENT-1',eventType:'authorised',
    amountMinor:21000,currencyCode:'GBP'}),/unverified_payment_event/);
  await ledger.recordPaymentProof({tenantKey:TENANT,bookingId:BOOKING,
    processor:'adyen',eventRef:'EVENT-1',eventType:'authorised',
    amountMinor:21000,currencyCode:'GBP',signatureVerified:true});
  assert.match(calls[0].text,/b.gross_minor=\$6/);
  assert.match(calls[0].text,/ON CONFLICT\(processor,external_event_ref\) DO NOTHING/);
  await assert.rejects(()=>ledger.recordSupplierProof({tenantKey:TENANT,bookingId:BOOKING,
    supplierKey:'mystifly',eventRef:'S-001',eventType:'ticketed'}),/unverified_supplier_event/);
  await ledger.recordSupplierProof({tenantKey:TENANT,bookingId:BOOKING,
    supplierKey:'mystifly',eventRef:'S-001',eventType:'ticketed',signatureVerified:true});
  assert.match(calls[1].text,/b.supplier_key=\$3/);
});
test('booking state machine requires fresh matched signed evidence and compare-and-swap',async()=>{
  const {ledger,calls}=recorder();
  assert.deepEqual(BOOKING_TRANSITIONS.refunded,[]);
  await assert.rejects(()=>ledger.advanceBooking({tenantKey:TENANT,bookingId:BOOKING,
    expectedStatus:'draft',toStatus:'ticketed',eventRef:'supplier-ticket-123'}),
    /invalid_state_transition/);
  await assert.rejects(()=>ledger.advanceBooking({tenantKey:TENANT,bookingId:BOOKING,
    expectedStatus:'supplier_submitted',toStatus:'supplier_confirmed',
    source:'operator',eventRef:'operator-1'}),/untrusted_transition_source/);
  await ledger.advanceBooking({tenantKey:TENANT,bookingId:BOOKING,
    expectedStatus:'supplier_submitted',toStatus:'supplier_confirmed',
    eventRef:'supplier-confirmed-12',source:'supplier'});
  assert.match(calls[0].text,/FOR UPDATE/);
  assert.match(calls[0].text,/ev.signature_verified=true/);
  assert.match(calls[0].text,/l.status=\$3/);
  assert.match(calls[0].text,/recorded AS [(]/);
  assert.match(calls[0].text,/ON CONFLICT DO NOTHING/);
  assert.match(calls[0].text,/FROM recorded r/);
  assert.equal(calls[0].params[6],'confirmed');
});
test('commission ledger requires independently verified supplier statement; GMV is not commission',async()=>{
  const {ledger,calls}=recorder();
  const data={tenantKey:TENANT,bookingId:BOOKING,supplierKey:'mystifly',
    entryType:'commission_receivable',direction:'credit',amountMinor:1000,
    currencyCode:'GBP',sourceReference:'statement-oct2026-1'};
  await assert.rejects(()=>ledger.recordCommissionStatement(data),/supplier_statement_not_verified/);
  await ledger.recordCommissionStatement({...data,verifiedStatement:true});
  assert.match(calls[0].text,/verification_status/);
  assert.match(calls[0].text,/ON CONFLICT[(]tenant_key,booking_id,supplier_key,entry_type,source_reference[)]/);
  assert.equal(calls[0].params[3],'commission_receivable');
});
