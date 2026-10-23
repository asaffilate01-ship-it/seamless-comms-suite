import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransactionPreparer } from '../transaction-orchestrator.mjs';

const TENANT='travenexa-flightlounge';
const OFFER='33333333-3333-4333-8333-333333333333';
const BOOKING='44444444-4444-4444-8444-444444444444';
const approval={tenantKey:TENANT,supplierKey:'mystifly',productType:'flights',
  status:'approved',paymentMode:'supplier_checkout',merchantOfRecord:'supplier',
  active:true,contractApproved:true,credentialsVerified:true,travelComplianceApproved:true,
  paymentApproved:true,servicingApproved:true,multiBrandPermission:true,ticketingApproved:false};
const readySupplier=()=>({
  id:'mystifly',products:['flights'],tenantIds:[TENANT],environment:'sandbox',
  contractApproved:true,credentialsVerified:true,legalApproved:true,ticketingApproved:true,
  reprice:async({offerRef})=>({
    verified:true,live:true,offerRef,currencyCode:'GBP',
    supplierMinor:20000,markupMinor:0,
    expiresAt:new Date(Date.now()+120000).toISOString(),
  }),
  createOrder:async()=>{throw Error('live_order_not_configured');},
  getOrder:async()=>{},cancelOrder:async()=>{},getRefundStatus:async()=>{},
  verifyWebhook:async()=>false,
});
const args={tenantId:TENANT,supplierKey:'mystifly',productType:'flights',
  offerRef:'flight-offer-1',idempotencyKey:'same-order-123456',
  termsAcceptanceRef:'approved-terms-ref-123',
  paymentContext:{licenceValid:true}};
function setup({a=approval,adapter=readySupplier()}={}) {
  const calls=[];
  const ledger={
    async persistVerifiedQuote(q){
      calls.push({operation:'quote',payload:q});
      return {id:OFFER,total_minor:20000,currency_code:'GBP'};
    },
    async createBookingDraft(q){
      calls.push({operation:'booking',payload:q});
      return {id:BOOKING};
    },
  };
  return {calls,prepare:createTransactionPreparer({
    ledger,approvalReader:async()=>a,providerResolver:async()=>adapter,
  })};
}
test('supplier-managed arrangement can generate a durable draft, not a payment or ticket',async()=>{
  const {prepare,calls}=setup();
  const result=await prepare(args);
  assert.equal(result.status,'draft');
  assert.equal(result.ticketed,false);
  assert.equal(result.paymentCaptured,false);
  assert.equal(result.supplierOrderCreated,false);
  assert.equal(result.amountMinor,20000);
  assert.equal(result.paymentNext,'supplier_verified_checkout_only');
  assert.equal(calls.length,2);
  assert.equal(calls[0].payload.verifiedBySupplier,true);
  assert.equal(calls[1].payload.idempotencyKey,args.idempotencyKey);
  assert.equal(calls[1].payload.customerContractReference,args.termsAcceptanceRef);
});
test('unapproved or tenant-crossing integrations never reach reprice or the booking ledger',async()=>{
  const {prepare,calls}=setup({a:{...approval,active:false}});
  assert.equal((await prepare(args)).reason,'commercial_or_regulatory_approval_required');
  assert.equal(calls.length,0);
  assert.equal((await setup({adapter:{...readySupplier(),tenantIds:['travenexa-marocways']}})
    .prepare(args)).reason,'supplier_transaction_port_not_approved');
});
test('no API, refund, PNR or payment is fabricated from an indicative fare',async()=>{
  const a=readySupplier();a.reprice=async()=>({...await readySupplier().reprice({offerRef:args.offerRef}),
    verified:false});
  const {prepare,calls}=setup({adapter:a});
  assert.equal((await prepare(args)).reason,'supplier_reprice_not_verified');
  assert.equal(calls.length,0);
});
test('supplier checkout cannot receive a hidden TraveNexa £10 markup',async()=>{
  const a=readySupplier();a.reprice=async()=>({...await readySupplier().reprice({offerRef:args.offerRef}),
    markupMinor:1000});
  const {prepare,calls}=setup({adapter:a});
  assert.equal((await prepare(args)).reason,'supplier_price_cannot_be_marked_up');
  assert.equal(calls.length,0);
});
test('Adyen collection requires externally attested licence, risk and account approvals',async()=>{
  const ap={...approval,merchantOfRecord:'travenexa',paymentMode:'platform_checkout',
    ticketingApproved:true};
  const {prepare,calls}=setup({a:ap});
  assert.equal((await prepare(args)).reason,'adyen_account_not_approved');
  assert.equal(calls.length,0);
  assert.equal((await prepare({...args,paymentContext:{
    licenceValid:true,adyenEnabled:true,riskDecision:'approved'}})).status,'draft');
});
