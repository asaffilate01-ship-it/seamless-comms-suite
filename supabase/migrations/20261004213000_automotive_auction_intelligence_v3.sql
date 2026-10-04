-- AutoHashi auction intelligence v3: structured sheet extraction, market evidence and reviewed decisions.
BEGIN;

CREATE TABLE IF NOT EXISTS public.automotive_auction_sheet_extractions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid NOT NULL REFERENCES public.automotive_auction_lots(id) ON DELETE CASCADE,
 vehicle_id uuid REFERENCES public.automotive_vehicles(id) ON DELETE SET NULL,
 intelligence_job_id uuid REFERENCES public.intelligence_jobs(id) ON DELETE SET NULL,
 source_kind text NOT NULL CHECK(source_kind IN('provider_structured','ai_vision','human')),
 source_ref text,
 schema_version text NOT NULL DEFAULT 'autohashi-auction-sheet-v1',
 raw_text text,
 extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
 confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','reviewed','approved','rejected','superseded')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automotive_sheet_extractions_lot_idx
 ON public.automotive_auction_sheet_extractions(tenant_id,auction_lot_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.automotive_auction_comparables(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid NOT NULL REFERENCES public.automotive_auction_lots(id) ON DELETE CASCADE,
 market_country text NOT NULL DEFAULT 'GB',
 evidence_type text NOT NULL CHECK(evidence_type IN('asking','sold','auction_result')),
 source text NOT NULL,
 external_ref text,
 make text,
 model text,
 model_year integer CHECK(model_year IS NULL OR model_year BETWEEN 1900 AND 2200),
 mileage_km integer CHECK(mileage_km IS NULL OR mileage_km >= 0),
 price_minor bigint NOT NULL CHECK(price_minor >= 0),
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency ~ '^[A-Z]{3}$'),
 observed_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,auction_lot_id,evidence_type,source,external_ref)
);
CREATE INDEX IF NOT EXISTS automotive_auction_comparables_lot_idx
 ON public.automotive_auction_comparables(tenant_id,auction_lot_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS public.automotive_auction_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid NOT NULL REFERENCES public.automotive_auction_lots(id) ON DELETE CASCADE,
 vehicle_id uuid REFERENCES public.automotive_vehicles(id) ON DELETE SET NULL,
 extraction_id uuid REFERENCES public.automotive_auction_sheet_extractions(id) ON DELETE SET NULL,
 cost_model_v2_id uuid REFERENCES public.automotive_bid_cost_models_v2(id) ON DELETE SET NULL,
 score integer NOT NULL CHECK(score BETWEEN 0 AND 100),
 recommendation text NOT NULL CHECK(recommendation IN('buy','review','do_not_bid')),
 confidence numeric(5,4) NOT NULL CHECK(confidence BETWEEN 0 AND 1),
 blockers text[] NOT NULL DEFAULT '{}',
 warnings text[] NOT NULL DEFAULT '{}',
 reasons text[] NOT NULL DEFAULT '{}',
 subscores jsonb NOT NULL DEFAULT '{}'::jsonb,
 market jsonb NOT NULL DEFAULT '{}'::jsonb,
 history jsonb NOT NULL DEFAULT '{}'::jsonb,
 calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','reviewed','approved','rejected','superseded')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_actor_ref text,
 reviewed_at timestamptz,
 review_note text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automotive_auction_decisions_lot_idx
 ON public.automotive_auction_decisions(tenant_id,auction_lot_id,created_at DESC);

ALTER TABLE public.automotive_auction_sheet_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_auction_comparables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_auction_decisions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.automotive_auction_sheet_extractions,public.automotive_auction_comparables,public.automotive_auction_decisions TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automotive_auction_sheet_extractions,public.automotive_auction_comparables,public.automotive_auction_decisions TO authenticated;

DROP POLICY IF EXISTS "automotive sheet extraction read" ON public.automotive_auction_sheet_extractions;
CREATE POLICY "automotive sheet extraction read" ON public.automotive_auction_sheet_extractions FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "automotive sheet extraction write" ON public.automotive_auction_sheet_extractions;
CREATE POLICY "automotive sheet extraction write" ON public.automotive_auction_sheet_extractions FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "automotive comparable read" ON public.automotive_auction_comparables;
CREATE POLICY "automotive comparable read" ON public.automotive_auction_comparables FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "automotive comparable write" ON public.automotive_auction_comparables;
CREATE POLICY "automotive comparable write" ON public.automotive_auction_comparables FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "automotive decision read" ON public.automotive_auction_decisions;
CREATE POLICY "automotive decision read" ON public.automotive_auction_decisions FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "automotive decision write" ON public.automotive_auction_decisions;
CREATE POLICY "automotive decision write" ON public.automotive_auction_decisions FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

CREATE OR REPLACE FUNCTION public.automotive_claim_auction_intelligence_job(_worker_key text)
RETURNS public.intelligence_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.intelligence_jobs%rowtype;
BEGIN
 IF current_user NOT IN ('service_role','postgres') THEN RAISE EXCEPTION 'Service role required';END IF;
 WITH candidate AS (
   SELECT id FROM public.intelligence_jobs
   WHERE job_type='automotive.auction_assessment'
     AND status='queued'
     AND next_attempt_at<=now()
   ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,created_at
   FOR UPDATE SKIP LOCKED
   LIMIT 1
 )
 UPDATE public.intelligence_jobs i
 SET status='processing',worker_key_id=_worker_key,locked_at=now(),started_at=COALESCE(started_at,now()),
     attempts=attempts+1,updated_at=now()
 FROM candidate c
 WHERE i.id=c.id
 RETURNING i.* INTO j;
 RETURN j;
END;$$;
REVOKE ALL ON FUNCTION public.automotive_claim_auction_intelligence_job(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.automotive_claim_auction_intelligence_job(text) TO service_role;

COMMIT;
