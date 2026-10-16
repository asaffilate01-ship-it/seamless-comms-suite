-- TraveNexa Phase 2: durable, service-role-only travel ledger.
-- Migration is schema-only. All payment/booking supplier integrations remain disabled.
-- Exactly one travel landlord; every record is scoped to a separately authorised tenant.
BEGIN;

CREATE TABLE public.travenexa_supplier_approvals (
  tenant_key text NOT NULL CHECK (length(tenant_key) BETWEEN 3 AND 150),
  supplier_key text NOT NULL CHECK (length(supplier_key) BETWEEN 2 AND 100),
  product_type text NOT NULL CHECK (product_type IN
    ('flights','hotels','rail','coach','chauffeur','transfers','car_hire',
     'activities','ferries','esim','third_party_packages')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sandbox','approved','suspended')),
  payment_mode text NOT NULL DEFAULT 'none'
    CHECK (payment_mode IN ('none','supplier_checkout','platform_checkout','platform_split')),
  merchant_of_record text NOT NULL DEFAULT 'unconfirmed'
    CHECK (merchant_of_record IN ('unconfirmed','supplier','travenexa','approved_platform_seller')),
  contract_approved boolean NOT NULL DEFAULT false,
  credentials_verified boolean NOT NULL DEFAULT false,
  travel_compliance_approved boolean NOT NULL DEFAULT false,
  payment_approved boolean NOT NULL DEFAULT false,
  ticketing_approved boolean NOT NULL DEFAULT false,
  servicing_approved boolean NOT NULL DEFAULT false,
  multi_brand_permission boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false,
  credential_reference text, -- Vault identifier only, NEVER a credential/token.
  approval_evidence_reference text,
  valid_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_key, supplier_key, product_type),
  CONSTRAINT travenexa_approval_not_autoactivated CHECK (
    NOT active OR (
      status = 'approved' AND contract_approved AND credentials_verified
      AND travel_compliance_approved AND payment_approved AND servicing_approved
      AND multi_brand_permission AND payment_mode <> 'none'
      AND merchant_of_record <> 'unconfirmed'
      AND (payment_mode <> 'platform_checkout' OR ticketing_approved)
      AND (payment_mode <> 'platform_split' OR ticketing_approved)
      AND (product_type <> 'third_party_packages' OR
           (payment_mode = 'supplier_checkout' AND merchant_of_record = 'supplier'))
    )
  )
);

CREATE TABLE public.travenexa_live_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL CHECK (length(tenant_key) BETWEEN 3 AND 150),
  supplier_key text NOT NULL CHECK (length(supplier_key) BETWEEN 2 AND 100),
  product_type text NOT NULL,
  supplier_offer_ref text NOT NULL CHECK (length(supplier_offer_ref) BETWEEN 1 AND 250),
  booking_mode text NOT NULL
    CHECK (booking_mode IN ('supplier_checkout','platform_checkout','platform_split')),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  supplier_minor bigint NOT NULL CHECK (supplier_minor >= 0 AND supplier_minor <= 100000000000),
  markup_minor bigint NOT NULL DEFAULT 0 CHECK (markup_minor >= 0 AND markup_minor <= 100000000),
  total_minor bigint GENERATED ALWAYS AS (supplier_minor + markup_minor) STORED,
  verified_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  supplier_terms_digest text CHECK (supplier_terms_digest IS NULL OR supplier_terms_digest ~ '^[a-f0-9]{64}$'),
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, tenant_key),
  FOREIGN KEY (tenant_key, supplier_key, product_type)
    REFERENCES public.travenexa_supplier_approvals(tenant_key, supplier_key, product_type)
    ON DELETE RESTRICT,
  CONSTRAINT travenexa_live_offer_freshness CHECK (expires_at > verified_at),
  CONSTRAINT travenexa_supplier_checkout_no_markup CHECK (
    booking_mode <> 'supplier_checkout' OR markup_minor = 0
  )
);
CREATE INDEX travenexa_offers_tenant_expiry_idx
  ON public.travenexa_live_offers(tenant_key,expires_at DESC);

CREATE TABLE public.travenexa_booking_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL CHECK (length(tenant_key) BETWEEN 3 AND 150),
  offer_id uuid NOT NULL,
  supplier_key text NOT NULL,
  product_type text NOT NULL,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 12 AND 128),
  booking_mode text NOT NULL
    CHECK (booking_mode IN ('supplier_checkout','platform_checkout','platform_split')),
  seller_of_record text NOT NULL
    CHECK (seller_of_record IN ('supplier','travenexa','approved_platform_seller')),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  gross_minor bigint NOT NULL CHECK (gross_minor >= 0),
  supplier_minor bigint NOT NULL CHECK (supplier_minor >= 0),
  markup_minor bigint NOT NULL DEFAULT 0 CHECK (markup_minor >= 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','price_revalidated','payment_authorised',
      'supplier_submitted','supplier_confirmed','ticketed','cancel_requested',
      'cancelled','refund_pending','refunded','failed','manual_review')),
  supplier_booking_ref text,
  supplier_pnr_ref text,
  supplier_ticket_ref text,
  traveller_reference text, -- Opaque PII-vault pointer; no passport or PAN.
  payment_reference text, -- Processor token/reference, NEVER card details.
  customer_contract_reference text, -- Jurisdiction/agent terms signed evidence.
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_key),
  UNIQUE (tenant_key, idempotency_key),
  FOREIGN KEY(offer_id, tenant_key) REFERENCES public.travenexa_live_offers(id, tenant_key)
    ON DELETE RESTRICT,
  CONSTRAINT travenexa_booking_total_match CHECK (gross_minor = supplier_minor + markup_minor),
  CONSTRAINT travenexa_package_is_supplier_organised CHECK (
    product_type <> 'third_party_packages' OR
      (seller_of_record = 'supplier' AND booking_mode = 'supplier_checkout')
  ),
  CONSTRAINT travenexa_no_supplier_checkout_markup CHECK (
    booking_mode <> 'supplier_checkout' OR markup_minor = 0
  )
);
CREATE INDEX travenexa_bookings_tenant_status_idx
  ON public.travenexa_booking_records(tenant_key,status,created_at DESC);

CREATE TABLE public.travenexa_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL,
  booking_id uuid NOT NULL,
  processor text NOT NULL CHECK (processor IN ('adyen','supplier','other_approved')),
  external_event_ref text NOT NULL CHECK (length(external_event_ref) BETWEEN 3 AND 255),
  payment_reference text,
  event_type text NOT NULL CHECK (event_type IN
    ('authorised','refused','captured','capture_failed','refunded','refund_failed','chargeback','cancelled')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  signature_verified boolean NOT NULL DEFAULT false,
  payload_digest text CHECK (payload_digest IS NULL OR payload_digest ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(processor, external_event_ref),
  FOREIGN KEY(booking_id, tenant_key) REFERENCES public.travenexa_booking_records(id,tenant_key)
    ON DELETE RESTRICT
);
CREATE INDEX travenexa_payments_booking_idx ON public.travenexa_payment_events(tenant_key,booking_id);

CREATE TABLE public.travenexa_supplier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL,
  booking_id uuid NOT NULL,
  supplier_key text NOT NULL,
  external_event_ref text NOT NULL CHECK (length(external_event_ref) BETWEEN 3 AND 255),
  event_type text NOT NULL CHECK (event_type IN
    ('submitted','confirmed','ticketed','supplier_failed','schedule_changed',
     'cancelled','refund_confirmed')),
  signature_verified boolean NOT NULL DEFAULT false,
  payload_digest text CHECK (payload_digest IS NULL OR payload_digest ~ '^[a-f0-9]{64}$'),
  supplier_reference text,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supplier_key,external_event_ref),
  FOREIGN KEY(booking_id, tenant_key) REFERENCES public.travenexa_booking_records(id,tenant_key)
    ON DELETE RESTRICT
);
CREATE INDEX travenexa_supplier_events_booking_idx
  ON public.travenexa_supplier_events(tenant_key,booking_id);

CREATE TABLE public.travenexa_booking_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL,
  booking_id uuid NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  source text NOT NULL CHECK (source IN ('internal','payment','supplier','operator')),
  proof_reference text NOT NULL CHECK (length(proof_reference) BETWEEN 3 AND 255),
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_key,booking_id,source,proof_reference),
  FOREIGN KEY(booking_id,tenant_key) REFERENCES public.travenexa_booking_records(id,tenant_key)
    ON DELETE RESTRICT
);
CREATE INDEX travenexa_state_events_booking_idx
  ON public.travenexa_booking_state_events(tenant_key,booking_id,applied_at);

CREATE TABLE public.travenexa_commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL,
  booking_id uuid NOT NULL,
  supplier_key text NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN
    ('gross_booking','supplier_payable','markup_revenue','commission_receivable',
     'commission_paid','payment_fee','fx_fee','refund','chargeback','supplier_credit')),
  direction text NOT NULL CHECK (direction IN ('debit','credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  source_reference text NOT NULL CHECK (length(source_reference) BETWEEN 3 AND 255),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','verified','settled','reversed')),
  effective_at timestamptz NOT NULL DEFAULT now(),
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_key,supplier_key,entry_type,source_reference),
  FOREIGN KEY(booking_id,tenant_key) REFERENCES public.travenexa_booking_records(id,tenant_key)
    ON DELETE RESTRICT,
  CONSTRAINT travenexa_commission_not_automatically_recognised CHECK (
    entry_type NOT IN ('commission_receivable','commission_paid','markup_revenue')
    OR verification_status IN ('unverified','verified','settled','reversed')
  )
);
CREATE INDEX travenexa_commission_tenant_idx
  ON public.travenexa_commission_ledger(tenant_key,verification_status,created_at DESC);

-- Supplier webhook inbox is append-only from the application perspective;
-- provider-specific signatures must be verified before ingestion.
CREATE TABLE public.travenexa_supplier_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_key text NOT NULL,
  external_event_ref text NOT NULL CHECK (length(external_event_ref) BETWEEN 3 AND 255),
  tenant_key text NOT NULL,
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  signature_verified boolean NOT NULL DEFAULT false,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','review_required')),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_key,external_event_ref)
);

-- Deny direct browser/guest access. Trusted server only via service_role.
-- The service-role key must NEVER be sent to a browser or a tenant.
ALTER TABLE public.travenexa_supplier_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travenexa_live_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travenexa_booking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travenexa_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travenexa_supplier_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travenexa_booking_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travenexa_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travenexa_supplier_webhook_inbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.travenexa_supplier_approvals FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.travenexa_live_offers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.travenexa_booking_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.travenexa_payment_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.travenexa_supplier_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.travenexa_booking_state_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.travenexa_commission_ledger FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.travenexa_supplier_webhook_inbox FROM PUBLIC, anon, authenticated;

GRANT SELECT,INSERT,UPDATE,DELETE ON public.travenexa_supplier_approvals TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.travenexa_live_offers TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.travenexa_booking_records TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.travenexa_payment_events TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.travenexa_supplier_events TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.travenexa_booking_state_events TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.travenexa_commission_ledger TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.travenexa_supplier_webhook_inbox TO service_role;

COMMIT;
