BEGIN;
INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status) VALUES
('omniqora.network-expansion','Network Expansion','Reusable franchise, dealer, agency, operator and partner territory expansion engine.','growth','omniqora',true,'automatic','active'),
('omniqora.attribution','Growth Attribution','Cross-channel acquisition, content and network attribution.','growth','omniqora',true,'automatic','active')
ON CONFLICT(service_key) DO UPDATE SET description=EXCLUDED.description,status='active',updated_at=now();
INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
('omniqora.network-expansion','omniqora.crm'),('omniqora.network-expansion','omniqora.geo'),
('omniqora.attribution','omniqora.analytics'),('omniqora.attribution','omniqora.crm')
ON CONFLICT DO NOTHING;
INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('omniqora','omniqora.network-expansion',false,false),('omniqora','omniqora.attribution',false,false),
('mealdeck','omniqora.network-expansion',true,false),('mealdeck','omniqora.attribution',true,false)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.network_programmes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,programme_key text NOT NULL,
 name text NOT NULL,model_type text NOT NULL CHECK(model_type IN('franchise','dealer','agency','operator','partner','managed_investor')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','closed')),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),fee_min_minor bigint NOT NULL DEFAULT 0,fee_max_minor bigint NOT NULL DEFAULT 0,
 royalty_bps integer NOT NULL DEFAULT 0 CHECK(royalty_bps BETWEEN 0 AND 10000),marketing_bps integer NOT NULL DEFAULT 0 CHECK(marketing_bps BETWEEN 0 AND 10000),
 tech_fee_minor_per_order bigint NOT NULL DEFAULT 0,supply_markup_bps integer NOT NULL DEFAULT 0 CHECK(supply_markup_bps BETWEEN 0 AND 10000),
 managed_franchise_available boolean NOT NULL DEFAULT false,managed_profit_share_bps integer NOT NULL DEFAULT 0 CHECK(managed_profit_share_bps BETWEEN 0 AND 10000),
 managed_profit_basis text NOT NULL DEFAULT 'managed_operating_profit',offer jsonb NOT NULL DEFAULT '{}'::jsonb,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,programme_key)
);
CREATE TABLE IF NOT EXISTS public.network_territories(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.network_programmes(id) ON DELETE CASCADE,territory_code text NOT NULL,name text NOT NULL,region text,
 status text NOT NULL DEFAULT 'available' CHECK(status IN('available','coming_soon','held','reserved','taken','onboarding','operating','paused','retired')),
 fee_minor bigint NOT NULL DEFAULT 0,currency text NOT NULL DEFAULT 'GBP',is_sellable boolean NOT NULL DEFAULT true,is_public boolean NOT NULL DEFAULT true,
 public_note text,territory_score numeric,protected_geojson jsonb,shared_geojson jsonb,overflow_geojson jsonb,
 resident_population bigint,households bigint,daytime_population bigint,students bigint,metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(programme_id,territory_code)
);
CREATE TABLE IF NOT EXISTS public.network_applications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.network_programmes(id) ON DELETE CASCADE,territory_id uuid REFERENCES public.network_territories(id) ON DELETE SET NULL,
 crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,crm_lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
 applicant_name text NOT NULL,email text NOT NULL,phone_e164 text,preferred_area text,existing_kitchen boolean NOT NULL DEFAULT false,
 existing_business text,available_capital_minor bigint,launch_timing text,multi_unit_interest boolean NOT NULL DEFAULT false,
 operator_model text NOT NULL DEFAULT 'owner_operator',stage text NOT NULL DEFAULT 'new',
 score integer,source text,utm jsonb NOT NULL DEFAULT '{}'::jsonb,answers jsonb NOT NULL DEFAULT '{}'::jsonb,consent boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.network_application_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 application_id uuid NOT NULL REFERENCES public.network_applications(id) ON DELETE CASCADE,event_type text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.growth_channel_catalogue(
 channel_key text PRIMARY KEY,name text NOT NULL,
 ownership text NOT NULL CHECK(ownership IN('paid','owned','earned','mixed')),
 medium text NOT NULL CHECK(medium IN('digital','direct','referral','media','offline')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
INSERT INTO public.growth_channel_catalogue(channel_key,name,ownership,medium) VALUES
('google-search','Google Search Ads','paid','digital'),('google-pmax','Google Performance Max','paid','digital'),
('meta','Meta','paid','social'),('tiktok','TikTok','paid','social'),('seo','SEO','owned','digital'),
('email','Email','owned','crm'),('whatsapp','WhatsApp','owned','crm'),('referral','Referral','earned','network'),
('events','Events','earned','offline'),('outdoor','Outdoor','paid','offline')
ON CONFLICT(channel_key) DO UPDATE SET name=EXCLUDED.name,status='active';
CREATE TABLE IF NOT EXISTS public.growth_acquisition_campaigns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid REFERENCES public.network_programmes(id) ON DELETE CASCADE,territory_id uuid REFERENCES public.network_territories(id) ON DELETE SET NULL,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,channel_key text NOT NULL REFERENCES public.growth_channel_catalogue(channel_key),
 name text NOT NULL,objective text,budget_minor bigint NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'planned',metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.growth_content_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid REFERENCES public.network_programmes(id) ON DELETE CASCADE,territory_id uuid REFERENCES public.network_territories(id) ON DELETE SET NULL,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,channel_key text REFERENCES public.growth_channel_catalogue(channel_key),
 content_type text NOT NULL,title text NOT NULL,target_url text,brief jsonb NOT NULL DEFAULT '{}'::jsonb,status text NOT NULL DEFAULT 'idea',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.growth_attribution_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,programme_id uuid REFERENCES public.network_programmes(id) ON DELETE SET NULL,
 territory_id uuid REFERENCES public.network_territories(id) ON DELETE SET NULL,application_id uuid REFERENCES public.network_applications(id) ON DELETE SET NULL,
 event_type text NOT NULL,channel_key text REFERENCES public.growth_channel_catalogue(channel_key),utm jsonb NOT NULL DEFAULT '{}'::jsonb,
 value_minor bigint,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.network_management_agreements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.network_programmes(id) ON DELETE CASCADE,territory_id uuid NOT NULL REFERENCES public.network_territories(id) ON DELETE CASCADE,
 management_provider text NOT NULL,status text NOT NULL DEFAULT 'proposed',profit_share_bps integer NOT NULL DEFAULT 0 CHECK(profit_share_bps BETWEEN 0 AND 10000),
 minimum_monthly_fee_minor bigint NOT NULL DEFAULT 0,profit_basis text NOT NULL DEFAULT 'managed_operating_profit',effective_from date,effective_until date,
 terms jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.network_management_periods(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 agreement_id uuid NOT NULL REFERENCES public.network_management_agreements(id) ON DELETE CASCADE,period_start date NOT NULL,period_end date NOT NULL,
 net_sales_minor bigint NOT NULL DEFAULT 0,food_packaging_minor bigint NOT NULL DEFAULT 0,payroll_minor bigint NOT NULL DEFAULT 0,premises_minor bigint NOT NULL DEFAULT 0,
 utilities_minor bigint NOT NULL DEFAULT 0,delivery_payment_minor bigint NOT NULL DEFAULT 0,local_marketing_minor bigint NOT NULL DEFAULT 0,
 other_site_opex_minor bigint NOT NULL DEFAULT 0,royalty_minor bigint NOT NULL DEFAULT 0,marketing_levy_minor bigint NOT NULL DEFAULT 0,
 technology_minor bigint NOT NULL DEFAULT 0,managed_operating_profit_minor bigint NOT NULL DEFAULT 0,management_fee_minor bigint NOT NULL DEFAULT 0,
 investor_distributable_minor bigint NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'review',calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(agreement_id,period_start,period_end)
);
CREATE TABLE IF NOT EXISTS public.geo_demographic_cells(
 geography_code text PRIMARY KEY,geography_type text NOT NULL,name text,centroid_lat numeric NOT NULL,centroid_lng numeric NOT NULL,
 population bigint NOT NULL DEFAULT 0,households bigint NOT NULL DEFAULT 0,daytime_population bigint,students bigint,boundary_geojson jsonb,
 population_source text,household_source text,source_year integer,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.network_territory_designs(
 territory_id uuid PRIMARY KEY REFERENCES public.network_territories(id) ON DELETE CASCADE,tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 centre_postcode text,centre_lat numeric NOT NULL,centre_lng numeric NOT NULL,core_drive_minutes integer NOT NULL DEFAULT 25,shared_drive_minutes integer NOT NULL DEFAULT 30,
 overflow_drive_minutes integer NOT NULL DEFAULT 35,core_min_minutes integer NOT NULL DEFAULT 18,core_max_minutes integer NOT NULL DEFAULT 28,
 target_population_min bigint,target_population_max bigint,max_sample_radius_km numeric NOT NULL DEFAULT 15,bearings integer NOT NULL DEFAULT 30,max_neighbours integer NOT NULL DEFAULT 4,
 routing_provider text NOT NULL DEFAULT 'google-routes',routing_preference text NOT NULL DEFAULT 'TRAFFIC_UNAWARE',demographic_geography text NOT NULL DEFAULT 'LSOA21',
 rules jsonb NOT NULL DEFAULT '{}'::jsonb,status text NOT NULL DEFAULT 'ready',updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.network_territory_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 territory_id uuid NOT NULL REFERENCES public.network_territories(id) ON DELETE CASCADE,version integer NOT NULL,algorithm_version text NOT NULL,
 status text NOT NULL DEFAULT 'review' CHECK(status IN('review','approved','superseded','rejected')),route_provider text NOT NULL,route_calculated_at timestamptz,
 core_drive_minutes integer,shared_drive_minutes integer,overflow_drive_minutes integer,protected_geojson jsonb,shared_geojson jsonb,overflow_geojson jsonb,
 protected_population bigint,protected_households bigint,protected_daytime_population bigint,protected_students bigint,shared_population bigint,shared_households bigint,
 neighbour_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,demographic_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
 contract_reference text,polygon_sha256 text,approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(territory_id,version)
);
CREATE TABLE IF NOT EXISTS public.network_territory_version_cells(
 version_id uuid NOT NULL REFERENCES public.network_territory_versions(id) ON DELETE CASCADE,geography_code text NOT NULL REFERENCES public.geo_demographic_cells(geography_code) ON DELETE CASCADE,
 zone text NOT NULL CHECK(zone IN('protected','shared','overflow')),assignment_weight numeric NOT NULL DEFAULT 1,PRIMARY KEY(version_id,geography_code,zone)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['network_programmes','network_territories','network_applications','network_application_events','growth_acquisition_campaigns',
 'growth_content_items','growth_attribution_events','network_management_agreements','network_management_periods','network_territory_designs','network_territory_versions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','network read '||t,t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','network write '||t,t);
 END LOOP;
END $$;
ALTER TABLE public.growth_channel_catalogue ENABLE ROW LEVEL SECURITY;ALTER TABLE public.geo_demographic_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_territory_version_cells ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.growth_channel_catalogue,public.geo_demographic_cells TO authenticated;
GRANT ALL ON public.growth_channel_catalogue,public.geo_demographic_cells,public.network_territory_version_cells TO service_role;
CREATE POLICY "network channel read" ON public.growth_channel_catalogue FOR SELECT TO authenticated USING(status='active');
CREATE POLICY "network demo read" ON public.geo_demographic_cells FOR SELECT TO authenticated USING(true);
CREATE POLICY "network version cell read" ON public.network_territory_version_cells FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.network_territory_versions v WHERE v.id=version_id AND (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(v.tenant_id,auth.uid())))
);
CREATE POLICY "network version cell write" ON public.network_territory_version_cells FOR ALL TO authenticated USING(
 EXISTS(SELECT 1 FROM public.network_territory_versions v WHERE v.id=version_id AND public.can_write(v.tenant_id,auth.uid()))
) WITH CHECK(EXISTS(SELECT 1 FROM public.network_territory_versions v WHERE v.id=version_id AND public.can_write(v.tenant_id,auth.uid())));
COMMIT;