// Server-side PostgreSQL transaction repository. This module cannot take money or issue tickets.
// The caller must authenticate tenant context and use a private service-role DB connection.
// Every SQL operation scopes by tenant, booking and supplier, with immutable event references.
import { safeText } from './policy.mjs';
import { approvedMoney, PAYMENT_MODES } from './transactions-policy.mjs';

const isUuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const isSha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const head=x=>x?.rows?.[0]||null;
const assert=(valid,reason)=>{if(!valid)throw new TypeError(reason)};
const statuses=Object.freeze({
  draft:['price_revalidated','failed','manual_review'],
  price_revalidated:['payment_authorised','supplier_submitted','failed','manual_review'],
  payment_authorised:['supplier_submitted','failed','manual_review'],
  supplier_submitted:['supplier_confirmed','failed','manual_review'],
  supplier_confirmed:['ticketed','cancelled','manual_review'],
  ticketed:['cancelled','manual_review'],
  cancel_requested:['cancelled','manual_review'],
  cancelled:['refunded','manual_review'],
  refund_pending:['refunded','manual_review'],
  refunded:[],failed:['manual_review'],manual_review:[],
});
const proofKinds=Object.freeze({
  price_revalidated:{source:'supplier',kind:'price_revalidated'},
  payment_authorised:{source:'payment',kind:'authorised'},
  supplier_submitted:{source:'supplier',kind:'submitted'},
  supplier_confirmed:{source:'supplier',kind:'confirmed'},
  ticketed:{source:'supplier',kind:'ticketed'},
  cancelled:{source:'supplier',kind:'cancelled'},
  refunded:{source:'payment',kind:'refunded'},
  failed:{source:'supplier',kind:'supplier_failed'},
  manual_review:{source:'operator',kind:'approved_exception'},
});
const paymentKinds=new Set(['authorised','refused','captured','capture_failed','refunded',
  'refund_failed','chargeback','cancelled']);
const supplierKinds=new Set(['price_revalidated','submitted','confirmed','ticketed',
  'supplier_failed','schedule_changed','cancelled','refund_confirmed']);
const ledgerKinds=new Set(['gross_booking','supplier_payable','markup_revenue','commission_receivable',
  'commission_paid','payment_fee','fx_fee','refund','chargeback','supplier_credit']);

export function createTraveNexaLedger({db}={}) {
  assert(db&&typeof db.query==='function','postgres_query_adapter_required');
  const sql=db.query.bind(db);
  async function persistVerifiedQuote({
    tenantKey,supplierKey,productType,supplierOfferRef,bookingMode,
    currencyCode,supplierMinor,markupMinor=0,expiresAt,supplierTermsDigest=null,
    sourceReference=null,verifiedBySupplier=false,
  }={}) {
    assert(safeText(tenantKey,150)&&safeText(supplierKey,100)&&safeText(productType,40),
      'invalid_quote_scope');
    assert(verifiedBySupplier===true,'supplier_price_not_verified');
    assert(safeText(supplierOfferRef,250)&&PAYMENT_MODES.includes(bookingMode),'invalid_offer');
    assert(approvedMoney({currency:currencyCode,amountMinor:supplierMinor})&&
      Number.isSafeInteger(markupMinor)&&markupMinor>=0&&markupMinor<=100000000,
      'invalid_quote_amount');
    assert(bookingMode!=='supplier_checkout'||markupMinor===0,'supplier_price_cannot_be_marked_up');
    const until=Date.parse(expiresAt);
    assert(Number.isFinite(until)&&until>Date.now()+5000&&until<Date.now()+30*60000,
      'invalid_quote_expiry');
    assert(supplierTermsDigest===null||isSha(supplierTermsDigest),'invalid_terms_digest');
    const result=await sql(`
      INSERT INTO public.travenexa_live_offers
        (tenant_key,supplier_key,product_type,supplier_offer_ref,booking_mode,
         currency_code,supplier_minor,markup_minor,verified_at,expires_at,
         supplier_terms_digest,source_reference)
      SELECT a.tenant_key,a.supplier_key,a.product_type,$4,$5,$6,$7,$8,now(),$9,$10,$11
      FROM public.travenexa_supplier_approvals a
      WHERE a.tenant_key=$1 AND a.supplier_key=$2 AND a.product_type=$3
        AND a.active=true AND a.status='approved' AND a.contract_approved=true
        AND a.credentials_verified=true AND a.travel_compliance_approved=true
        AND a.payment_approved=true AND a.servicing_approved=true
        AND a.multi_brand_permission=true AND a.payment_mode=$5
        AND (a.valid_until IS NULL OR a.valid_until>now())
        AND (a.payment_mode='supplier_checkout' OR a.ticketing_approved=true)
      RETURNING id,tenant_key,expires_at,total_minor,currency_code
    `,[tenantKey,supplierKey,productType,supplierOfferRef,bookingMode,
       currencyCode,supplierMinor,markupMinor,expiresAt,supplierTermsDigest,sourceReference]);
    return head(result)||{status:'blocked',reason:'supplier_not_approved'};
  }
  async function createBookingDraft({tenantKey,offerId,idempotencyKey,customerContractReference}={}) {
    assert(safeText(tenantKey,150)&&isUuid(offerId),'invalid_booking_scope');
    assert(safeText(idempotencyKey,128)&&idempotencyKey.length>=12,'invalid_idempotency_key');
    assert(safeText(customerContractReference,250),'contract_acceptance_required');
    // Atomic idempotency: a repeated key with a DIFFERENT quote cannot create/return a booking.
    const result=await sql(`
      INSERT INTO public.travenexa_booking_records
        (tenant_key,offer_id,supplier_key,product_type,idempotency_key,
         booking_mode,seller_of_record,currency_code,gross_minor,
         supplier_minor,markup_minor,customer_contract_reference)
      SELECT o.tenant_key,o.id,o.supplier_key,o.product_type,$3,
             o.booking_mode,a.merchant_of_record,o.currency_code,o.total_minor,
             o.supplier_minor,o.markup_minor,$4
      FROM public.travenexa_live_offers o
      JOIN public.travenexa_supplier_approvals a
        ON a.tenant_key=o.tenant_key AND a.supplier_key=o.supplier_key
       AND a.product_type=o.product_type
      WHERE o.id=$2 AND o.tenant_key=$1 AND o.expires_at>now()
        AND o.verified_at>=now()-interval '30 minutes'
        AND a.active=true AND a.status='approved'
        AND a.contract_approved=true AND a.credentials_verified=true
        AND a.travel_compliance_approved=true AND a.payment_approved=true
        AND a.servicing_approved=true AND a.multi_brand_permission=true
        AND a.payment_mode=o.booking_mode AND a.merchant_of_record<>'unconfirmed'
        AND (a.valid_until IS NULL OR a.valid_until>now())
        AND (a.payment_mode='supplier_checkout' OR a.ticketing_approved=true)
        AND (o.product_type<>'third_party_packages' OR
          (a.merchant_of_record='supplier' AND o.booking_mode='supplier_checkout'))
      ON CONFLICT(tenant_key,idempotency_key) DO UPDATE
        SET updated_at=public.travenexa_booking_records.updated_at
        WHERE public.travenexa_booking_records.offer_id=EXCLUDED.offer_id
      RETURNING id,tenant_key,offer_id,supplier_key,status,
        booking_mode,seller_of_record,gross_minor,currency_code
    `,[tenantKey,offerId,idempotencyKey,customerContractReference]);
    return head(result)||{status:'blocked',reason:'offer_or_approval_not_valid'};
  }
  async function getBooking({tenantKey,bookingId}={}) {
    assert(safeText(tenantKey,150)&&isUuid(bookingId),'invalid_booking_scope');
    return head(await sql(`
      SELECT id,tenant_key,offer_id,supplier_key,product_type,status,
        booking_mode,seller_of_record,gross_minor,supplier_minor,markup_minor,
        currency_code,supplier_booking_ref,supplier_pnr_ref,supplier_ticket_ref,
        created_at,updated_at
      FROM public.travenexa_booking_records
      WHERE tenant_key=$1 AND id=$2 LIMIT 1`,[tenantKey,bookingId]));
  }
  async function recordPaymentProof({
    tenantKey,bookingId,processor,eventRef,eventType,amountMinor,
    currencyCode,signatureVerified=false,payloadDigest=null,paymentReference=null,
  }={}) {
    assert(safeText(tenantKey,150)&&isUuid(bookingId),'invalid_payment_scope');
    assert(['adyen','supplier','other_approved'].includes(processor) &&
      safeText(eventRef,255)&&eventRef.length>=3&&paymentKinds.has(eventType),
      'invalid_payment_event');
    assert(signatureVerified===true,'unverified_payment_event');
    assert(approvedMoney({currency:currencyCode,amountMinor}) &&
      (payloadDigest===null||isSha(payloadDigest)),'invalid_payment_payload');
    return head(await sql(`
      INSERT INTO public.travenexa_payment_events
        (tenant_key,booking_id,processor,external_event_ref,event_type,
         amount_minor,currency_code,signature_verified,payload_digest,payment_reference)
      SELECT b.tenant_key,b.id,$3,$4,$5,$6,$7,true,$8,$9
      FROM public.travenexa_booking_records b
      WHERE b.tenant_key=$1 AND b.id=$2 AND b.currency_code=$7
        AND ($5<>'authorised' OR b.gross_minor=$6)
        AND (($3='supplier' AND b.booking_mode='supplier_checkout')
          OR ($3<>'supplier' AND b.booking_mode<>'supplier_checkout'))
      ON CONFLICT(processor,external_event_ref) DO NOTHING
      RETURNING id,tenant_key,booking_id,event_type
    `,[tenantKey,bookingId,processor,eventRef,eventType,amountMinor,
       currencyCode,payloadDigest,paymentReference])) ||
       {status:'ignored',reason:'duplicate_or_invalid_payment_reference'};
  }
  async function recordSupplierProof({
    tenantKey,bookingId,supplierKey,eventRef,eventType,signatureVerified=false,
    payloadDigest=null,supplierReference=null,
  }={}) {
    assert(safeText(tenantKey,150)&&isUuid(bookingId)&&safeText(supplierKey,100),
      'invalid_supplier_event_scope');
    assert(safeText(eventRef,255)&&eventRef.length>=3&&supplierKinds.has(eventType),
      'invalid_supplier_event');
    assert(signatureVerified===true,'unverified_supplier_event');
    assert(payloadDigest===null||isSha(payloadDigest),'invalid_event_digest');
    return head(await sql(`
      INSERT INTO public.travenexa_supplier_events
        (tenant_key,booking_id,supplier_key,external_event_ref,event_type,
         signature_verified,payload_digest,supplier_reference)
      SELECT b.tenant_key,b.id,b.supplier_key,$4,$5,true,$6,$7
      FROM public.travenexa_booking_records b
      WHERE b.tenant_key=$1 AND b.id=$2 AND b.supplier_key=$3
      ON CONFLICT(supplier_key,external_event_ref) DO NOTHING
      RETURNING id,tenant_key,booking_id,event_type
    `,[tenantKey,bookingId,supplierKey,eventRef,eventType,
       payloadDigest,supplierReference])) ||
       {status:'ignored',reason:'duplicate_or_wrong_supplier'};
  }
  async function advanceBooking({
    tenantKey,bookingId,expectedStatus,toStatus,eventRef,
    source='supplier',operatorApproved=false,
  }={}) {
    assert(safeText(tenantKey,150)&&isUuid(bookingId),'invalid_transition_scope');
    assert(safeText(eventRef,255)&&eventRef.length>=3,'event_proof_required');
    assert(statuses[expectedStatus]?.includes(toStatus),'invalid_state_transition');
    const kind=proofKinds[toStatus];
    assert(kind && (kind.source===source || (toStatus==='refunded'&&source==='supplier')),
      'untrusted_transition_source');
    if(source==='operator')assert(operatorApproved===true,'operator_approval_required');
    // One atomic statement: compare old status, check matching signed supplier/payment
    // evidence and insert an immutable state event. Duplicate events cannot replay.
    // Lock booking, verify external proof, then INSERT event BEFORE updating status.
    // A reused event reference cannot change state without an audit entry.
    const result=await sql(`
      WITH locked AS MATERIALIZED (
        SELECT id,tenant_key,status,booking_mode,supplier_key,product_type,currency_code,gross_minor
        FROM public.travenexa_booking_records
        WHERE id=$2 AND tenant_key=$1 FOR UPDATE
      ),
      evidence AS MATERIALIZED (
        SELECT l.*
        FROM locked l
        WHERE l.status=$3
          AND (
            ($5='supplier' AND EXISTS (
              SELECT 1 FROM public.travenexa_supplier_events ev
              WHERE ev.tenant_key=$1 AND ev.booking_id=$2
                AND ev.external_event_ref=$6 AND ev.signature_verified=true
                AND ev.event_type=$7 AND ev.supplier_key=l.supplier_key
            ))
            OR ($5='payment' AND EXISTS (
              SELECT 1 FROM public.travenexa_payment_events ev
              WHERE ev.tenant_key=$1 AND ev.booking_id=$2
                AND ev.external_event_ref=$6 AND ev.signature_verified=true
                AND ev.event_type=$7 AND ev.currency_code=l.currency_code
                AND (ev.event_type<>'authorised' OR ev.amount_minor=l.gross_minor)
            ))
            OR ($5='operator' AND $4='manual_review' AND $8=true)
          )
          AND ($4<>'supplier_submitted' OR
             (l.booking_mode='supplier_checkout' OR l.status='payment_authorised'))
          AND ($4<>'ticketed' OR l.product_type IN ('flights','rail','coach','ferries'))
          AND ($4<>'refunded' OR
             ($5='supplier' AND l.booking_mode='supplier_checkout')
              OR ($5='payment' AND l.booking_mode<>'supplier_checkout'))
      ),
      recorded AS (
        INSERT INTO public.travenexa_booking_state_events
          (tenant_key,booking_id,from_status,to_status,source,proof_reference)
        SELECT tenant_key,id,status,$4,$5,$6 FROM evidence
        ON CONFLICT DO NOTHING
        RETURNING booking_id
      ),
      changed AS (
        UPDATE public.travenexa_booking_records b
        SET status=$4,updated_at=now()
        FROM recorded r
        WHERE b.id=r.booking_id AND b.tenant_key=$1 AND b.status=$3
        RETURNING b.id,b.status
      )
      SELECT id AS booking_id,status AS to_status FROM changed
    `,[tenantKey,bookingId,expectedStatus,toStatus,source,eventRef,
      toStatus==='refunded'&&source==='supplier'?'refund_confirmed':kind.kind,
      operatorApproved]);
    return head(result)||{status:'blocked',reason:'stale_state_or_unverified_event'};
  }
  async function recordCommissionStatement({
    tenantKey,bookingId,supplierKey,entryType,direction,amountMinor,
    currencyCode,sourceReference,verifiedStatement=false,
  }={}) {
    assert(safeText(tenantKey,150)&&isUuid(bookingId)&&safeText(supplierKey,100),
      'invalid_commission_scope');
    assert(ledgerKinds.has(entryType)&&['credit','debit'].includes(direction)&&
      safeText(sourceReference,255)&&sourceReference.length>=3,'invalid_commission_entry');
    assert(approvedMoney({currency:currencyCode,amountMinor}),'invalid_commission_amount');
    assert(verifiedStatement===true,'supplier_statement_not_verified');
    // GMV, supplier liability, commission receivable and actual platform revenue
    // are distinct. No automatic commission is recognised from a search/PNR.
    return head(await sql(`
      INSERT INTO public.travenexa_commission_ledger
        (tenant_key,booking_id,supplier_key,entry_type,direction,
         amount_minor,currency_code,source_reference,verification_status)
      SELECT b.tenant_key,b.id,b.supplier_key,$4,$5,$6,$7,$8,'verified'
      FROM public.travenexa_booking_records b
      WHERE b.tenant_key=$1 AND b.id=$2 AND b.supplier_key=$3
        AND b.currency_code=$7 AND b.status IN
          ('supplier_confirmed','ticketed','cancelled','refund_pending','refunded')
      ON CONFLICT(tenant_key,supplier_key,entry_type,source_reference)
      DO NOTHING
      RETURNING id,tenant_key,booking_id,entry_type,verification_status
    `,[tenantKey,bookingId,supplierKey,entryType,direction,
       amountMinor,currencyCode,sourceReference])) ||
       {status:'ignored',reason:'duplicate_or_booking_not_reconciliable'};
  }
  return {persistVerifiedQuote,createBookingDraft,getBooking,recordPaymentProof,
    recordSupplierProof,advanceBooking,recordCommissionStatement};
}
export const BOOKING_TRANSITIONS=statuses;
