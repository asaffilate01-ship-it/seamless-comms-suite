BEGIN;

-- Shared vertical engines for Omniqora SaaS Factory. These tables are reusable
-- platform capabilities; product-specific regulatory decisions remain inside
-- the relevant vertical product and compliance pack.

CREATE TABLE IF NOT EXISTS public.childcare_households(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 household_ref text NOT NULL,
 postcode text,
 latitude numeric,
 longitude numeric,
 care_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
 funding_context jsonb NOT NULL DEFAULT '{}'::jsonb,
 consent jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('lead','active','paused','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,household_ref)
);

CREATE TABLE IF NOT EXISTS public.childcare_providers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 provider_ref text NOT NULL,
 provider_type text NOT NULL DEFAULT 'childminder',
 postcode text,
 latitude numeric,
 longitude numeric,
 capacity jsonb NOT NULL DEFAULT '{}'::jsonb,
 availability jsonb NOT NULL DEFAULT '{}'::jsonb,
 qualifications jsonb NOT NULL DEFAULT '[]'::jsonb,
 regulatory_status jsonb NOT NULL DEFAULT '{}'::jsonb,
 vetting_status jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'onboarding' CHECK(status IN('lead','onboarding','active','paused','suspended','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,provider_ref)
);

CREATE TABLE IF NOT EXISTS public.childcare_matches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 household_id uuid NOT NULL REFERENCES public.childcare_households(id) ON DELETE CASCADE,
 provider_id uuid NOT NULL REFERENCES public.childcare_providers(id) ON DELETE CASCADE,
 score numeric NOT NULL DEFAULT 0 CHECK(score>=0 AND score<=100),
 distance_km numeric,
 reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
 blocking_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'proposed'
   CHECK(status IN('proposed','shortlisted','contacted','accepted','declined','expired','cancelled')),
 human_review_required boolean NOT NULL DEFAULT true,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(household_id,provider_id)
);

CREATE TABLE IF NOT EXISTS public.vehicle_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vehicle_ref text NOT NULL,
 vin text,
 registration text,
 make text,
 model text,
 derivative text,
 model_year integer,
 fuel_type text,
 transmission text,
 colour text,
 mileage bigint,
 identity_status text NOT NULL DEFAULT 'unverified'
   CHECK(identity_status IN('unverified','partially_verified','verified','conflict')),
 source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,vehicle_ref)
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_profile_vin_uq
 ON public.vehicle_profiles(tenant_id,product_key,vin) WHERE vin IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.vehicle_evidence_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.vehicle_profiles(id) ON DELETE CASCADE,
 evidence_type text NOT NULL,
 source_provider text,
 source_ref text,
 captured_at timestamptz NOT NULL DEFAULT now(),
 valid_until timestamptz,
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 confidence numeric CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1)),
 status text NOT NULL DEFAULT 'current' CHECK(status IN('current','superseded','expired','disputed')),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_market_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.vehicle_profiles(id) ON DELETE CASCADE,
 event_type text NOT NULL CHECK(event_type IN('listing','auction','sale','valuation','inspection','import','export')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 source_provider text,
 source_ref text,
 amount_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 odometer bigint,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicle_part_requirements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 vehicle_id uuid NOT NULL REFERENCES public.vehicle_profiles(id) ON DELETE CASCADE,
 requested_part text NOT NULL,
 oe_number text,
 normalized_part jsonb NOT NULL DEFAULT '{}'::jsonb,
 compatibility_status text NOT NULL DEFAULT 'unverified'
   CHECK(compatibility_status IN('unverified','candidate','verified','conflict')),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'childcare_households','childcare_providers','childcare_matches',
  'vehicle_profiles','vehicle_evidence_records','vehicle_market_events','vehicle_part_requirements'
 ] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
   EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
    'shared vertical tenant read',t);
   EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))',
    'shared vertical tenant write',t);
 END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS childcare_household_geo_idx ON public.childcare_households(tenant_id,postcode);
CREATE INDEX IF NOT EXISTS childcare_provider_geo_idx ON public.childcare_providers(tenant_id,status,postcode);
CREATE INDEX IF NOT EXISTS childcare_match_status_idx ON public.childcare_matches(tenant_id,status,score DESC);
CREATE INDEX IF NOT EXISTS vehicle_profile_lookup_idx ON public.vehicle_profiles(tenant_id,registration,vin);
CREATE INDEX IF NOT EXISTS vehicle_evidence_lookup_idx ON public.vehicle_evidence_records(vehicle_id,evidence_type,captured_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_market_lookup_idx ON public.vehicle_market_events(vehicle_id,event_type,occurred_at DESC);

UPDATE public.vertical_package_catalogue
SET status='active',implementation_status='live_main',updated_at=now()
WHERE package_key IN('kindelo.childcare','automotive.shared');

CREATE OR REPLACE FUNCTION public.childcare_propose_match(
 _tenant uuid,_product text,_household uuid,_provider uuid,_score numeric,_distance numeric,
 _reasons jsonb DEFAULT '[]'::jsonb,_blockers jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE h public.childcare_households%rowtype;
        p public.childcare_providers%rowtype;
        mid uuid;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(_tenant,auth.uid()) THEN
  RAISE EXCEPTION 'Childcare match access denied';
 END IF;
 IF _score<0 OR _score>100 THEN RAISE EXCEPTION 'Match score must be 0-100'; END IF;
 SELECT * INTO h FROM public.childcare_households WHERE id=_household AND tenant_id=_tenant AND product_key=_product;
 SELECT * INTO p FROM public.childcare_providers WHERE id=_provider AND tenant_id=_tenant AND product_key=_product;
 IF h.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'Household/provider scope mismatch'; END IF;
 IF p.status<>'active' THEN RAISE EXCEPTION 'Provider must be active before matching'; END IF;
 INSERT INTO public.childcare_matches(
  tenant_id,product_key,household_id,provider_id,score,distance_km,reasons,blocking_reasons,status,human_review_required
 ) VALUES(
  _tenant,_product,_household,_provider,_score,_distance,COALESCE(_reasons,'[]'::jsonb),
  COALESCE(_blockers,'[]'::jsonb),CASE WHEN jsonb_array_length(COALESCE(_blockers,'[]'::jsonb))=0 THEN 'proposed' ELSE 'proposed' END,true
 )
 ON CONFLICT(household_id,provider_id) DO UPDATE SET
  score=EXCLUDED.score,distance_km=EXCLUDED.distance_km,reasons=EXCLUDED.reasons,
  blocking_reasons=EXCLUDED.blocking_reasons,status='proposed',human_review_required=true,updated_at=now()
 RETURNING id INTO mid;
 RETURN mid;
END $$;
REVOKE ALL ON FUNCTION public.childcare_propose_match(uuid,text,uuid,uuid,numeric,numeric,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.childcare_propose_match(uuid,text,uuid,uuid,numeric,numeric,jsonb,jsonb) TO authenticated,service_role;

COMMIT;
