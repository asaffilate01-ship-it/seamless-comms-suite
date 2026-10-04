BEGIN;

ALTER TABLE public.network_programmes
  ADD COLUMN IF NOT EXISTS managed_franchise_available boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS managed_profit_share_bps integer NOT NULL DEFAULT 0 CHECK(managed_profit_share_bps BETWEEN 0 AND 10000),
  ADD COLUMN IF NOT EXISTS managed_profit_basis text NOT NULL DEFAULT 'managed_operating_profit'
    CHECK(managed_profit_basis IN('managed_operating_profit','ebitda','net_profit'));

ALTER TABLE public.network_applications
  ADD COLUMN IF NOT EXISTS operator_model text NOT NULL DEFAULT 'owner_operator'
    CHECK(operator_model IN('owner_operator','managed_investor','multi_unit_operator'));

CREATE TABLE IF NOT EXISTS public.network_management_agreements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.network_programmes(id) ON DELETE CASCADE,
 territory_id uuid NOT NULL REFERENCES public.network_territories(id) ON DELETE CASCADE,
 investor_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
 operator_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
 management_provider text NOT NULL DEFAULT 'mealdeck-operations',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','proposed','active','suspended','terminated','expired')),
 profit_share_bps integer NOT NULL DEFAULT 2000 CHECK(profit_share_bps BETWEEN 0 AND 10000),
 minimum_monthly_fee_minor bigint NOT NULL DEFAULT 0,
 profit_basis text NOT NULL DEFAULT 'managed_operating_profit'
   CHECK(profit_basis IN('managed_operating_profit','ebitda','net_profit')),
 effective_from date,effective_until date,
 terms jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS network_one_active_management_agreement_uq
 ON public.network_management_agreements(territory_id)
 WHERE status='active';

CREATE TABLE IF NOT EXISTS public.network_management_periods(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 agreement_id uuid NOT NULL REFERENCES public.network_management_agreements(id) ON DELETE CASCADE,
 period_start date NOT NULL,period_end date NOT NULL,
 net_sales_minor bigint NOT NULL DEFAULT 0,
 food_packaging_minor bigint NOT NULL DEFAULT 0,
 payroll_minor bigint NOT NULL DEFAULT 0,
 premises_minor bigint NOT NULL DEFAULT 0,
 utilities_minor bigint NOT NULL DEFAULT 0,
 delivery_payment_minor bigint NOT NULL DEFAULT 0,
 local_marketing_minor bigint NOT NULL DEFAULT 0,
 other_site_opex_minor bigint NOT NULL DEFAULT 0,
 royalty_minor bigint NOT NULL DEFAULT 0,
 marketing_levy_minor bigint NOT NULL DEFAULT 0,
 technology_minor bigint NOT NULL DEFAULT 0,
 managed_operating_profit_minor bigint NOT NULL DEFAULT 0,
 management_fee_minor bigint NOT NULL DEFAULT 0,
 investor_distributable_minor bigint NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','paid','closed')),
 calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agreement_id,period_start,period_end),CHECK(period_end>=period_start)
);

CREATE TABLE IF NOT EXISTS public.geo_demographic_cells(
 geography_code text PRIMARY KEY,
 geography_type text NOT NULL DEFAULT 'LSOA21',
 name text,
 centroid_lat double precision NOT NULL,centroid_lng double precision NOT NULL,
 population integer NOT NULL DEFAULT 0,households integer NOT NULL DEFAULT 0,
 daytime_population integer,students integer,
 boundary_geojson jsonb,
 population_source text,household_source text,source_year integer,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS geo_demographic_cells_centroid_idx ON public.geo_demographic_cells(centroid_lat,centroid_lng);
CREATE INDEX IF NOT EXISTS geo_demographic_cells_type_idx ON public.geo_demographic_cells(geography_type);

CREATE TABLE IF NOT EXISTS public.network_territory_designs(
 territory_id uuid PRIMARY KEY REFERENCES public.network_territories(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 centre_postcode text,centre_lat double precision NOT NULL,centre_lng double precision NOT NULL,
 core_drive_minutes integer NOT NULL DEFAULT 25 CHECK(core_drive_minutes BETWEEN 5 AND 60),
 shared_drive_minutes integer NOT NULL DEFAULT 30 CHECK(shared_drive_minutes BETWEEN 5 AND 75),
 overflow_drive_minutes integer NOT NULL DEFAULT 35 CHECK(overflow_drive_minutes BETWEEN 5 AND 90),
 core_min_minutes integer NOT NULL DEFAULT 18 CHECK(core_min_minutes BETWEEN 5 AND 60),
 core_max_minutes integer NOT NULL DEFAULT 28 CHECK(core_max_minutes BETWEEN 5 AND 60),
 target_population_min integer,target_population_max integer,
 max_sample_radius_km numeric NOT NULL DEFAULT 15 CHECK(max_sample_radius_km BETWEEN 2 AND 60),
 bearings integer NOT NULL DEFAULT 30 CHECK(bearings BETWEEN 12 AND 72),
 max_neighbours integer NOT NULL DEFAULT 4 CHECK(max_neighbours BETWEEN 0 AND 12),
 routing_provider text NOT NULL DEFAULT 'google-routes',
 routing_preference text NOT NULL DEFAULT 'TRAFFIC_UNAWARE',
 demographic_geography text NOT NULL DEFAULT 'LSOA21',
 rules jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','ready','calculating','review','approved','error')),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.network_territory_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 territory_id uuid NOT NULL REFERENCES public.network_territories(id) ON DELETE CASCADE,
 version integer NOT NULL,
 algorithm_version text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','superseded','rejected')),
 route_provider text NOT NULL,
 route_calculated_at timestamptz,
 core_drive_minutes numeric NOT NULL,
 shared_drive_minutes numeric NOT NULL,
 overflow_drive_minutes numeric NOT NULL,
 protected_geojson jsonb NOT NULL,shared_geojson jsonb NOT NULL,overflow_geojson jsonb NOT NULL,
 protected_population integer,protected_households integer,protected_daytime_population integer,protected_students integer,
 shared_population integer,shared_households integer,
 neighbour_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
 demographic_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
 calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
 contract_reference text,polygon_sha256 text,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(territory_id,version)
);

CREATE TABLE IF NOT EXISTS public.network_territory_version_cells(
 version_id uuid NOT NULL REFERENCES public.network_territory_versions(id) ON DELETE CASCADE,
 geography_code text NOT NULL REFERENCES public.geo_demographic_cells(geography_code) ON DELETE CASCADE,
 zone text NOT NULL CHECK(zone IN('protected','shared','overflow')),
 assignment_weight numeric NOT NULL DEFAULT 1 CHECK(assignment_weight>=0 AND assignment_weight<=1),
 PRIMARY KEY(version_id,geography_code,zone)
);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['network_management_agreements','network_management_periods','network_territory_designs','network_territory_versions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','network extension read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','network extension write',t);
 END LOOP;
END $$;

ALTER TABLE public.geo_demographic_cells ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.geo_demographic_cells TO authenticated;
GRANT ALL ON public.geo_demographic_cells TO service_role;
CREATE POLICY "demographics read" ON public.geo_demographic_cells FOR SELECT TO authenticated USING(true);

ALTER TABLE public.network_territory_version_cells ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.network_territory_version_cells TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.network_territory_version_cells TO authenticated;
CREATE POLICY "territory version cells read" ON public.network_territory_version_cells FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.network_territory_versions v WHERE v.id=version_id AND (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(v.tenant_id,auth.uid()))));
CREATE POLICY "territory version cells write" ON public.network_territory_version_cells FOR ALL TO authenticated
USING(EXISTS(SELECT 1 FROM public.network_territory_versions v WHERE v.id=version_id AND (public.is_platform_admin(auth.uid()) OR public.can_write(v.tenant_id,auth.uid()))))
WITH CHECK(EXISTS(SELECT 1 FROM public.network_territory_versions v WHERE v.id=version_id AND (public.is_platform_admin(auth.uid()) OR public.can_write(v.tenant_id,auth.uid()))));


CREATE OR REPLACE FUNCTION public.network_apply_mealdeck_managed_defaults()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.programme_key='mealdeck-england-wales' THEN
  NEW.managed_franchise_available:=true;
  NEW.managed_profit_share_bps:=CASE WHEN NEW.managed_profit_share_bps=0 THEN 2000 ELSE NEW.managed_profit_share_bps END;
  NEW.managed_profit_basis:='managed_operating_profit';
  NEW.offer:=COALESCE(NEW.offer,'{}'::jsonb)||jsonb_build_object('managedFranchise',jsonb_build_object(
    'available',true,'defaultProfitSharePercent',20,'basis','Managed Operating Profit after site operating costs and standard franchise charges, before the management fee, financing, corporation tax, depreciation and investor distributions.','publicName','MealDeck Managed Franchise'
  ));
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS network_mealdeck_managed_defaults ON public.network_programmes;
CREATE TRIGGER network_mealdeck_managed_defaults
BEFORE INSERT OR UPDATE ON public.network_programmes
FOR EACH ROW EXECUTE FUNCTION public.network_apply_mealdeck_managed_defaults();

CREATE OR REPLACE FUNCTION public.network_seed_mealdeck_design_on_territory()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE pkey text;
BEGIN
 SELECT programme_key INTO pkey FROM public.network_programmes WHERE id=NEW.programme_id;
 IF pkey='mealdeck-england-wales' AND NEW.name='Islington / Camden' THEN
  INSERT INTO public.network_territory_designs(
   territory_id,tenant_id,centre_postcode,centre_lat,centre_lng,core_drive_minutes,shared_drive_minutes,overflow_drive_minutes,
   core_min_minutes,core_max_minutes,target_population_min,target_population_max,max_sample_radius_km,bearings,max_neighbours,rules,status
  ) VALUES(
   NEW.id,NEW.tenant_id,'N7 8XH',51.54323,-0.114474,25,30,35,18,28,150000,200000,12,30,4,
   jsonb_build_object('protectedRule','Use stable road-time baseline, population target and neighbouring territory competition. Approved polygon is the contractual territory.','neighbourRule','Candidate point remains protected only when this kitchen is not slower than competing approved/taken neighbour anchors by the configured tolerance.','demographicRule','Population and households are estimated from imported ONS small-area cells whose centroids fall inside the polygon.'),'ready'
  ) ON CONFLICT(territory_id) DO NOTHING;
 END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS network_mealdeck_default_design ON public.network_territories;
CREATE TRIGGER network_mealdeck_default_design
AFTER INSERT ON public.network_territories
FOR EACH ROW EXECUTE FUNCTION public.network_seed_mealdeck_design_on_territory();

UPDATE public.network_programmes
SET managed_franchise_available=true,managed_profit_share_bps=2000,managed_profit_basis='managed_operating_profit',
    offer=offer||jsonb_build_object('managedFranchise',jsonb_build_object(
      'available',true,'defaultProfitSharePercent',20,
      'basis','Managed Operating Profit after site operating costs and standard franchise charges, before the management fee, financing, corporation tax, depreciation and investor distributions.',
      'publicName','MealDeck Managed Franchise'
    )),updated_at=now()
WHERE programme_key='mealdeck-england-wales';

-- Islington / Caledonian Road: seed the territory design around N7 8XH.
INSERT INTO public.network_territory_designs(
 territory_id,tenant_id,centre_postcode,centre_lat,centre_lng,core_drive_minutes,shared_drive_minutes,overflow_drive_minutes,
 core_min_minutes,core_max_minutes,target_population_min,target_population_max,max_sample_radius_km,bearings,max_neighbours,rules,status
)
SELECT t.id,t.tenant_id,'N7 8XH',51.54323,-0.114474,25,30,35,18,28,150000,200000,12,30,4,
 jsonb_build_object(
  'protectedRule','Use stable road-time baseline, population target and neighbouring territory competition. Approved polygon is the contractual territory.',
  'neighbourRule','Candidate point remains protected only when this kitchen is not slower than competing approved/taken neighbour anchors by the configured tolerance.',
  'demographicRule','Population and households are estimated from imported ONS small-area cells whose centroids fall inside the polygon.'
 ),'ready'
FROM public.network_territories t JOIN public.network_programmes p ON p.id=t.programme_id
WHERE p.programme_key='mealdeck-england-wales' AND t.name='Islington / Camden'
ON CONFLICT(territory_id) DO UPDATE SET centre_postcode=EXCLUDED.centre_postcode,centre_lat=EXCLUDED.centre_lat,centre_lng=EXCLUDED.centre_lng,
 core_drive_minutes=EXCLUDED.core_drive_minutes,shared_drive_minutes=EXCLUDED.shared_drive_minutes,overflow_drive_minutes=EXCLUDED.overflow_drive_minutes,
 target_population_min=EXCLUDED.target_population_min,target_population_max=EXCLUDED.target_population_max,rules=EXCLUDED.rules,status='ready',updated_at=now();


CREATE OR REPLACE FUNCTION public.network_seed_default_territory_designs(_tenant uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer:=0;tid uuid;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    AND NOT public.is_platform_admin(auth.uid())
    AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
   RAISE EXCEPTION 'Network expansion access denied';
 END IF;
 SELECT t.id INTO tid
 FROM public.network_territories t JOIN public.network_programmes p ON p.id=t.programme_id
 WHERE t.tenant_id=_tenant AND p.programme_key='mealdeck-england-wales' AND t.name='Islington / Camden' LIMIT 1;
 IF tid IS NOT NULL THEN
  INSERT INTO public.network_territory_designs(
   territory_id,tenant_id,centre_postcode,centre_lat,centre_lng,core_drive_minutes,shared_drive_minutes,overflow_drive_minutes,
   core_min_minutes,core_max_minutes,target_population_min,target_population_max,max_sample_radius_km,bearings,max_neighbours,rules,status
  ) VALUES(
   tid,_tenant,'N7 8XH',51.54323,-0.114474,25,30,35,18,28,150000,200000,12,30,4,
   jsonb_build_object(
    'protectedRule','Use stable road-time baseline, population target and neighbouring territory competition. Approved polygon is the contractual territory.',
    'neighbourRule','Candidate point remains protected only when this kitchen is not slower than competing approved/taken neighbour anchors by the configured tolerance.',
    'demographicRule','Population and households are estimated from imported ONS small-area cells whose centroids fall inside the polygon.'
   ),'ready'
  )
  ON CONFLICT(territory_id) DO UPDATE SET centre_postcode=EXCLUDED.centre_postcode,centre_lat=EXCLUDED.centre_lat,centre_lng=EXCLUDED.centre_lng,
   core_drive_minutes=EXCLUDED.core_drive_minutes,shared_drive_minutes=EXCLUDED.shared_drive_minutes,overflow_drive_minutes=EXCLUDED.overflow_drive_minutes,
   target_population_min=EXCLUDED.target_population_min,target_population_max=EXCLUDED.target_population_max,rules=EXCLUDED.rules,status='ready',updated_at=now();
  n:=n+1;
 END IF;
 RETURN n;
END;$$;
REVOKE ALL ON FUNCTION public.network_seed_default_territory_designs(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.network_seed_default_territory_designs(uuid) TO authenticated,service_role;

COMMIT;