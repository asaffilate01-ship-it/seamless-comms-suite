-- AutoHashi bid execution v2: mixed-currency cost review, customer authorisation and provider event audit.
BEGIN;

CREATE TABLE IF NOT EXISTS public.automotive_bid_cost_models_v2(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid NOT NULL REFERENCES public.automotive_auction_lots(id) ON DELETE CASCADE,
 destination_country text NOT NULL DEFAULT 'GB',
 fx_jpy_per_gbp numeric NOT NULL CHECK(fx_jpy_per_gbp > 0),
 fx_source text,
 fx_as_of timestamptz,
 target_retail_gbp_minor bigint NOT NULL CHECK(target_retail_gbp_minor >= 0),
 target_margin_gbp_minor bigint NOT NULL DEFAULT 0 CHECK(target_margin_gbp_minor >= 0),
 auction_fees_jpy bigint NOT NULL DEFAULT 0 CHECK(auction_fees_jpy >= 0),
 inland_transport_jpy bigint NOT NULL DEFAULT 0 CHECK(inland_transport_jpy >= 0),
 freight_gbp_minor bigint NOT NULL DEFAULT 0 CHECK(freight_gbp_minor >= 0),
 insurance_gbp_minor bigint NOT NULL DEFAULT 0 CHECK(insurance_gbp_minor >= 0),
 clearance_gbp_minor bigint NOT NULL DEFAULT 0 CHECK(clearance_gbp_minor >= 0),
 compliance_gbp_minor bigint NOT NULL DEFAULT 0 CHECK(compliance_gbp_minor >= 0),
 registration_gbp_minor bigint NOT NULL DEFAULT 0 CHECK(registration_gbp_minor >= 0),
 delivery_gbp_minor bigint NOT NULL DEFAULT 0 CHECK(delivery_gbp_minor >= 0),
 other_gbp_minor bigint NOT NULL DEFAULT 0 CHECK(other_gbp_minor >= 0),
 duty_rate_bps integer NOT NULL DEFAULT 0 CHECK(duty_rate_bps BETWEEN 0 AND 10000),
 tax_rate_bps integer NOT NULL DEFAULT 0 CHECK(tax_rate_bps BETWEEN 0 AND 10000),
 proposed_hammer_jpy bigint CHECK(proposed_hammer_jpy IS NULL OR proposed_hammer_jpy >= 0),
 max_hammer_jpy bigint NOT NULL CHECK(max_hammer_jpy >= 0),
 estimated_landed_gbp_minor bigint,
 estimated_gross_margin_gbp_minor bigint,
 calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
 assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'review' CHECK(status IN('draft','review','approved','expired','superseded')),
 reviewed_actor_ref text,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automotive_bid_cost_models_v2_lot_idx
 ON public.automotive_bid_cost_models_v2(tenant_id,auction_lot_id,created_at DESC);

ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS cost_model_v2_id uuid REFERENCES public.automotive_bid_cost_models_v2(id) ON DELETE SET NULL;
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS external_reference text;
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS customer_actor_ref text;
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS customer_authorised_at timestamptz;
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS customer_authorisation jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS authorised_actor_ref text;
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS admin_approval_note text;
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS submission_attempts integer NOT NULL DEFAULT 0 CHECK(submission_attempts >= 0);
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS last_provider_status_at timestamptz;
ALTER TABLE public.automotive_bid_instructions
 ADD COLUMN IF NOT EXISTS limit_violation boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS automotive_bid_instructions_external_ref_idx
 ON public.automotive_bid_instructions(tenant_id,external_reference)
 WHERE external_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.automotive_bid_provider_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 bid_instruction_id uuid NOT NULL REFERENCES public.automotive_bid_instructions(id) ON DELETE CASCADE,
 provider_key text NOT NULL,
 provider_event_id text NOT NULL,
 idempotency_key text NOT NULL,
 event_type text NOT NULL,
 provider_reference text,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 signature_valid boolean NOT NULL DEFAULT false,
 received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 processing_status text NOT NULL DEFAULT 'received' CHECK(processing_status IN('received','processed','ignored','error')),
 processing_note text,
 UNIQUE(provider_key,provider_event_id),
 UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS automotive_bid_provider_events_instruction_idx
 ON public.automotive_bid_provider_events(tenant_id,bid_instruction_id,received_at DESC);

ALTER TABLE public.automotive_bid_cost_models_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_bid_provider_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.automotive_bid_cost_models_v2,public.automotive_bid_provider_events TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automotive_bid_cost_models_v2,public.automotive_bid_provider_events TO authenticated;

DROP POLICY IF EXISTS "automotive bid cost v2 read" ON public.automotive_bid_cost_models_v2;
CREATE POLICY "automotive bid cost v2 read" ON public.automotive_bid_cost_models_v2 FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "automotive bid cost v2 write" ON public.automotive_bid_cost_models_v2;
CREATE POLICY "automotive bid cost v2 write" ON public.automotive_bid_cost_models_v2 FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "automotive bid provider events read" ON public.automotive_bid_provider_events;
CREATE POLICY "automotive bid provider events read" ON public.automotive_bid_provider_events FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "automotive bid provider events write" ON public.automotive_bid_provider_events;
CREATE POLICY "automotive bid provider events write" ON public.automotive_bid_provider_events FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

COMMIT;
