-- AutoHashi auction learning v4: human corrections, hammer outcomes/predictions and saved-search watches.
BEGIN;

CREATE TABLE IF NOT EXISTS public.automotive_auction_review_corrections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid NOT NULL REFERENCES public.automotive_auction_lots(id) ON DELETE CASCADE,
 extraction_id uuid REFERENCES public.automotive_auction_sheet_extractions(id) ON DELETE SET NULL,
 decision_id uuid REFERENCES public.automotive_auction_decisions(id) ON DELETE SET NULL,
 correction_type text NOT NULL DEFAULT 'sheet_extraction'
  CHECK(correction_type IN('sheet_extraction','decision_note')),
 context jsonb NOT NULL DEFAULT '{}'::jsonb,
 original_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 corrected_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 changed_fields text[] NOT NULL DEFAULT '{}',
 note text,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_actor_ref text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automotive_auction_corrections_lot_idx
 ON public.automotive_auction_review_corrections(tenant_id,auction_lot_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.automotive_auction_price_outcomes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid REFERENCES public.automotive_auction_lots(id) ON DELETE SET NULL,
 provider_key text,
 external_lot_id text,
 make text NOT NULL,
 model text NOT NULL,
 model_code text,
 model_year integer CHECK(model_year IS NULL OR model_year BETWEEN 1900 AND 2200),
 grade text,
 mileage_km integer CHECK(mileage_km IS NULL OR mileage_km >= 0),
 hammer_jpy bigint NOT NULL CHECK(hammer_jpy > 0),
 source text NOT NULL CHECK(source IN('provider_webhook','auction_result_feed','operator_verified')),
 outcome_at timestamptz NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source,provider_key,external_lot_id,outcome_at)
);
CREATE INDEX IF NOT EXISTS automotive_price_outcomes_lookup_idx
 ON public.automotive_auction_price_outcomes(tenant_id,make,model,model_code,model_year,outcome_at DESC);

CREATE TABLE IF NOT EXISTS public.automotive_auction_price_curves(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 make text NOT NULL,
 model text NOT NULL,
 model_code text,
 model_year integer,
 grade text,
 mileage_band_km integer,
 method text NOT NULL,
 sample_count integer NOT NULL CHECK(sample_count >= 0),
 p25_jpy bigint,
 median_jpy bigint,
 p75_jpy bigint,
 confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
 source_window_days integer NOT NULL DEFAULT 730 CHECK(source_window_days BETWEEN 30 AND 3650),
 as_of timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automotive_price_curves_lookup_idx
 ON public.automotive_auction_price_curves(tenant_id,make,model,model_code,model_year,as_of DESC);

CREATE TABLE IF NOT EXISTS public.automotive_auction_price_predictions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid NOT NULL REFERENCES public.automotive_auction_lots(id) ON DELETE CASCADE,
 prediction_version text NOT NULL DEFAULT 'hierarchical-median-v1',
 predicted_hammer_jpy bigint,
 low_jpy bigint,
 high_jpy bigint,
 sample_count integer NOT NULL DEFAULT 0 CHECK(sample_count >= 0),
 confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
 method text NOT NULL,
 context jsonb NOT NULL DEFAULT '{}'::jsonb,
 actual_hammer_jpy bigint,
 absolute_error_jpy bigint,
 error_pct numeric,
 status text NOT NULL DEFAULT 'predicted' CHECK(status IN('predicted','calibrated','superseded')),
 created_at timestamptz NOT NULL DEFAULT now(),
 calibrated_at timestamptz
);
CREATE INDEX IF NOT EXISTS automotive_price_predictions_lot_idx
 ON public.automotive_auction_price_predictions(tenant_id,auction_lot_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.automotive_auction_watch_rules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
 provider_preference text NOT NULL DEFAULT 'auto',
 max_results_per_run integer NOT NULL DEFAULT 50 CHECK(max_results_per_run BETWEEN 1 AND 200),
 cadence text NOT NULL DEFAULT 'hourly' CHECK(cadence IN('hourly','daily')),
 alert_channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
 last_run_at timestamptz,
 last_success_at timestamptz,
 last_error text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_actor_ref text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,name)
);
CREATE INDEX IF NOT EXISTS automotive_watch_rules_enabled_idx
 ON public.automotive_auction_watch_rules(tenant_id,enabled,cadence,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.automotive_auction_watch_matches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 watch_rule_id uuid NOT NULL REFERENCES public.automotive_auction_watch_rules(id) ON DELETE CASCADE,
 auction_lot_id uuid REFERENCES public.automotive_auction_lots(id) ON DELETE SET NULL,
 match_key text NOT NULL,
 provider_key text,
 external_lot_id text,
 stage text NOT NULL DEFAULT 'candidate'
  CHECK(stage IN('candidate','pending_intelligence','qualified','disqualified','expired')),
 score integer CHECK(score IS NULL OR score BETWEEN 0 AND 100),
 recommendation text CHECK(recommendation IS NULL OR recommendation IN('buy','review','do_not_bid')),
 predicted_hammer_jpy bigint,
 predicted_low_jpy bigint,
 predicted_high_jpy bigint,
 projected_margin_gbp_minor bigint,
 snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'new' CHECK(status IN('new','seen','dismissed')),
 UNIQUE(tenant_id,watch_rule_id,match_key)
);
CREATE INDEX IF NOT EXISTS automotive_watch_matches_recent_idx
 ON public.automotive_auction_watch_matches(tenant_id,status,stage,last_seen_at DESC);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY[
  'automotive_auction_review_corrections','automotive_auction_price_outcomes','automotive_auction_price_curves',
  'automotive_auction_price_predictions','automotive_auction_watch_rules','automotive_auction_watch_matches'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','automotive learning read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','automotive learning write',t);
 END LOOP;
END $$;

COMMIT;
