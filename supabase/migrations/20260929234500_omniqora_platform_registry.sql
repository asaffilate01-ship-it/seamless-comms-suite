-- Omniqora platform registry, landlord/tenant, module entitlement and region/locale packs.
-- ADDITIVE ONLY. Committing this file does not apply it to any live Supabase project.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_products (
  product_key text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('platform','shared_engine','vertical_landlord','product_variant','standalone')),
  parent_product_key text REFERENCES public.platform_products(product_key) ON DELETE SET NULL,
  industry text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','incubating','migration_candidate','retired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_modules (
  module_key text PRIMARY KEY,
  name text NOT NULL,
  module_kind text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('active','preview','planned','retired')),
  ui_mode text NOT NULL DEFAULT 'api_only' CHECK (ui_mode IN ('api_only','embedded','workspace','hybrid')),
  dependencies text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_region_packs (
  region_key text PRIMARY KEY,
  country_code text NOT NULL,
  default_locale text NOT NULL,
  supported_locales text[] NOT NULL DEFAULT '{}',
  currency text NOT NULL,
  time_zones text[] NOT NULL DEFAULT '{}',
  data_region text,
  tax_profile text,
  legal_profile text,
  regulatory_packs text[] NOT NULL DEFAULT '{}',
  provider_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_locale_packs (
  locale_key text PRIMARY KEY,
  language_code text NOT NULL,
  country_code text,
  direction text NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr','rtl')),
  fallback_locale text,
  translations_ref text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','preview','retired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_module_defaults (
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE CASCADE,
  enabled_by_default boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (product_key, module_key)
);

CREATE TABLE IF NOT EXISTS public.tenant_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE RESTRICT,
  region_key text NOT NULL REFERENCES public.platform_region_packs(region_key) ON DELETE RESTRICT,
  plan_key text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('provisioning','active','suspended','cancelled')),
  brand_key text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  provisioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_products_scope_uq
  ON public.tenant_products (tenant_id, product_key, COALESCE(brand_key,''));
CREATE INDEX IF NOT EXISTS tenant_products_tenant_idx
  ON public.tenant_products (tenant_id, status, product_key);

CREATE TABLE IF NOT EXISTS public.tenant_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  parent_location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  location_key text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'location',
  country_code text,
  locale text,
  time_zone text,
  currency text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, location_key)
);
CREATE INDEX IF NOT EXISTS tenant_locations_product_idx
  ON public.tenant_locations (tenant_product_id, status, name);

CREATE TABLE IF NOT EXISTS public.tenant_module_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  source text NOT NULL DEFAULT 'plan',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_module_entitlements_scope_uq
  ON public.tenant_module_entitlements (tenant_id, COALESCE(tenant_product_id,'00000000-0000-0000-0000-000000000000'::uuid), module_key);
CREATE INDEX IF NOT EXISTS tenant_module_entitlements_lookup_idx
  ON public.tenant_module_entitlements (tenant_id, module_key, enabled);

CREATE TABLE IF NOT EXISTS public.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  purpose text NOT NULL DEFAULT 'app' CHECK (purpose IN ('marketing','app','api','tracking','assets','auth','other')),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','failed')),
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_integration_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  module_key text REFERENCES public.platform_modules(module_key) ON DELETE SET NULL,
  provider text NOT NULL,
  integration_kind text NOT NULL,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('development','staging','production')),
  secret_ref text,
  external_account_ref text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','active','degraded','disabled','missing_credentials')),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_integration_bindings_lookup_idx
  ON public.tenant_integration_bindings (tenant_id, tenant_product_id, integration_kind, status);

-- Shared product/module/region/locale catalogues are readable to signed-in users.
ALTER TABLE public.platform_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_region_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_locale_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_module_defaults ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.platform_products, public.platform_modules, public.platform_region_packs,
  public.platform_locale_packs, public.product_module_defaults TO authenticated;
GRANT ALL ON public.platform_products, public.platform_modules, public.platform_region_packs,
  public.platform_locale_packs, public.product_module_defaults TO service_role;

DROP POLICY IF EXISTS "platform products read" ON public.platform_products;
CREATE POLICY "platform products read" ON public.platform_products FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "platform modules read" ON public.platform_modules;
CREATE POLICY "platform modules read" ON public.platform_modules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "platform region packs read" ON public.platform_region_packs;
CREATE POLICY "platform region packs read" ON public.platform_region_packs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "platform locale packs read" ON public.platform_locale_packs;
CREATE POLICY "platform locale packs read" ON public.platform_locale_packs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "product module defaults read" ON public.product_module_defaults;
CREATE POLICY "product module defaults read" ON public.product_module_defaults FOR SELECT TO authenticated USING (true);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_products','tenant_locations','tenant_module_entitlements','tenant_domains','tenant_integration_bindings'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %L ON public.%I', 'platform tenant read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()))',
      'platform tenant read', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %L ON public.%I', 'platform tenant admin write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_tenant_role(tenant_id, auth.uid(), ARRAY[''owner'',''admin'']::public.app_role[])) WITH CHECK (public.has_tenant_role(tenant_id, auth.uid(), ARRAY[''owner'',''admin'']::public.app_role[]))',
      'platform tenant admin write', t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.platform_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_products','platform_modules','platform_region_packs','platform_locale_packs',
    'tenant_products','tenant_locations','tenant_module_entitlements','tenant_domains','tenant_integration_bindings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()', t);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_touch_updated_at() TO service_role;

INSERT INTO public.platform_products(product_key,name,kind,industry,status) VALUES
  ('omniqora','Omniqora','platform','platform','active'),
  ('dishbee','Dishbee','vertical_landlord','hospitality','active'),
  ('haccora','Haccora','vertical_landlord','compliance','active'),
  ('taxnuvia','TaxNuvia','vertical_landlord','professional_services','active'),
  ('xpertjobs','XpertJobs','vertical_landlord','recruitment','active'),
  ('fleetsora','Fleetora / FleetSora','vertical_landlord','fleet_logistics','active'),
  ('syndriva','Syndriva Marketplace Engine','shared_engine','marketplace','incubating'),
  ('affivon','Affivon','vertical_landlord','affiliate_commerce','migration_candidate'),
  ('tendryva','Tendryva','vertical_landlord','tenders_procurement','migration_candidate'),
  ('voxentri','Voxentri Creative Studio','shared_engine','creative_studio','incubating')
ON CONFLICT (product_key) DO UPDATE SET
  name=EXCLUDED.name, kind=EXCLUDED.kind, industry=EXCLUDED.industry, status=EXCLUDED.status;

INSERT INTO public.platform_modules(module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities) VALUES
  ('platform.identity','Identity / SSO','core','1.0.0-preview','preview','api_only',ARRAY[]::text[],ARRAY['identity','membership','service_identity']),
  ('platform.tenant','Tenant Registry','core','1.0.0-preview','preview','workspace',ARRAY['platform.identity'],ARRAY['tenant','organisation','location','workspace']),
  ('platform.entitlements','Entitlements','core','1.0.0-preview','preview','api_only',ARRAY['platform.tenant'],ARRAY['plans','modules','limits','feature_flags']),
  ('platform.provisioning','Provisioning','core','1.0.0-planned','planned','workspace',ARRAY['platform.tenant','platform.entitlements'],ARRAY['tenant_create','defaults','domains','bindings']),
  ('platform.events','Event Backbone','core','1.0.0-preview','preview','api_only',ARRAY['platform.tenant'],ARRAY['events','webhooks','idempotency','dead_letters']),
  ('platform.audit','Audit / Observability','core','1.0.0-preview','preview','workspace',ARRAY['platform.tenant'],ARRAY['audit','health','usage','traces']),
  ('crm.core','Omniqora CRM','crm','1.0.0-preview','preview','hybrid',ARRAY['platform.tenant','platform.entitlements','platform.events','platform.audit'],ARRAY['companies','people','leads','opportunities','pipelines','tasks','timeline']),
  ('connect.core','Omniqora Connect','communications','1.0.0-preview','preview','hybrid',ARRAY['platform.tenant','platform.entitlements','platform.events','platform.audit'],ARRAY['whatsapp','sms','email','voice','push','numbers','masked_calls']),
  ('intelligence.core','Omniqora Intelligence','ai','1.0.0-preview','preview','workspace',ARRAY['platform.tenant','platform.entitlements','platform.audit'],ARRAY['genai','rag','graphrag','agents','approvals','business360','enterprise_ai']),
  ('compliance.core','Omniqora Compliance','compliance','1.0.0-preview','preview','workspace',ARRAY['intelligence.core','platform.audit'],ARRAY['applications','requirements','evidence','reviews','monitoring','inspections']),
  ('marketing.core','Omniqora Marketing','marketing','1.0.0-planned','planned','hybrid',ARRAY['crm.core','connect.core','analytics.core'],ARRAY['audiences','campaigns','content','offers','attribution','consent','channel_orchestration']),
  ('sales.core','Omniqora Sales','sales','1.0.0-planned','planned','hybrid',ARRAY['crm.core','connect.core','analytics.core'],ARRAY['sequences','tasks','callbacks','meetings','lead_scoring','pipeline_automation']),
  ('journeys.core','Omniqora Journeys','journeys','1.0.0-planned','planned','hybrid',ARRAY['crm.core','connect.core','platform.events'],ARRAY['journeys','segments','rfm','delays','branches','outcomes']),
  ('feedback.core','Omniqora Feedback','feedback','1.0.0-planned','planned','hybrid',ARRAY['crm.core','connect.core'],ARRAY['nps','csat','ces','reviews','sentiment','recovery']),
  ('analytics.core','Omniqora Analytics & Metrics','analytics','1.0.0-planned','planned','workspace',ARRAY['platform.events'],ARRAY['events','metrics','semantic_layer','funnels','cohorts','dashboards','warehouse']),
  ('financials.core','Omniqora Financials','financials','1.0.0-planned','planned','workspace',ARRAY['analytics.core','platform.audit'],ARRAY['revenue','costs','margin','budgets','forecast','unit_economics','variance','benefits']),
  ('geo.core','Omniqora Geo','geo','1.0.0-planned','planned','api_only',ARRAY['platform.tenant','platform.entitlements'],ARRAY['geocode','reverse','distance','eta','routes','optimise','geofence','live_track']),
  ('dispatch.core','Omniqora Dispatch','dispatch','1.0.0-planned','planned','hybrid',ARRAY['geo.core','connect.core','platform.events'],ARRAY['jobs','agents','auto_dispatch','manual_dispatch','fleet','pod','wallet','tracking']),
  ('marketplace.core','Syndriva Marketplace','marketplace','1.0.0-planned','planned','hybrid',ARRAY['crm.core','platform.events'],ARRAY['vendors','listings','catalogue','inventory','availability','orders','bookings','commissions','payouts','reviews','disputes']),
  ('payments.core','Omniqora Payments','payments','1.0.0-planned','planned','api_only',ARRAY['platform.tenant','platform.entitlements','platform.audit'],ARRAY['checkout','subscriptions','billing','split_payments','payouts','refunds']),
  ('mobile.core','Omniqora Mobile Core','mobile','1.0.0-planned','planned','embedded',ARRAY['platform.identity','platform.entitlements','connect.core'],ARRAY['push','deep_links','camera','documents','qr','gps','maps','chat','voice','offline','biometrics']),
  ('documents.core','Omniqora Documents','documents','1.0.0-planned','planned','hybrid',ARRAY['platform.tenant','platform.audit'],ARRAY['templates','versions','signatures','evidence_packs']),
  ('creative.core','Voxentri Creative Studio','creative','1.0.0-planned','planned','workspace',ARRAY['platform.tenant','platform.entitlements','intelligence.core','analytics.core'],ARRAY['brand_kits','briefs','copy','images','video','audio','social','ads','print','web_assets','localisation','approvals','asset_library','campaign_variants'])
ON CONFLICT (module_key) DO UPDATE SET
  name=EXCLUDED.name,module_kind=EXCLUDED.module_kind,version=EXCLUDED.version,status=EXCLUDED.status,
  ui_mode=EXCLUDED.ui_mode,dependencies=EXCLUDED.dependencies,capabilities=EXCLUDED.capabilities;

INSERT INTO public.platform_region_packs(region_key,country_code,default_locale,supported_locales,currency,time_zones,data_region,tax_profile,legal_profile,regulatory_packs,provider_preferences) VALUES
  ('GB','GB','en-GB',ARRAY['en-GB'],'GBP',ARRAY['Europe/London'],'UK','uk-vat','uk',ARRAY['fca','cqc','ofsted'],'{"telephony":["twilio","sip"],"payments":["adyen","stripe","sumup"]}'::jsonb),
  ('DE','DE','de-DE',ARRAY['de-DE','en-GB'],'EUR',ARRAY['Europe/Berlin'],'EU','de-ust','de',ARRAY[]::text[],'{"telephony":["twilio","sip"],"payments":["adyen","stripe"]}'::jsonb),
  ('AE','AE','en-GB',ARRAY['en-GB','ar-AE'],'AED',ARRAY['Asia/Dubai'],'UAE','ae-vat','ae',ARRAY[]::text[],'{"telephony":["sip","twilio"],"payments":["adyen","stripe"]}'::jsonb),
  ('SA','SA','ar-SA',ARRAY['ar-SA','en-GB'],'SAR',ARRAY['Asia/Riyadh'],'KSA','sa-vat','sa',ARRAY['aramco','nca','sama'],'{"telephony":["sip","twilio"],"payments":["adyen","stripe"]}'::jsonb),
  ('US','US','en-US',ARRAY['en-US'],'USD',ARRAY['America/New_York','America/Chicago','America/Denver','America/Los_Angeles'],'US','us','us',ARRAY[]::text[],'{"telephony":["twilio","telnyx"],"payments":["stripe","adyen"]}'::jsonb),
  ('PK','PK','en-GB',ARRAY['en-GB','ur-PK'],'PKR',ARRAY['Asia/Karachi'],'PK','pk','pk',ARRAY[]::text[],'{"telephony":["sip"],"payments":[]}'::jsonb)
ON CONFLICT (region_key) DO UPDATE SET
  country_code=EXCLUDED.country_code,default_locale=EXCLUDED.default_locale,supported_locales=EXCLUDED.supported_locales,
  currency=EXCLUDED.currency,time_zones=EXCLUDED.time_zones,data_region=EXCLUDED.data_region,tax_profile=EXCLUDED.tax_profile,
  legal_profile=EXCLUDED.legal_profile,regulatory_packs=EXCLUDED.regulatory_packs,provider_preferences=EXCLUDED.provider_preferences;

INSERT INTO public.platform_locale_packs(locale_key,language_code,country_code,direction,fallback_locale,status) VALUES
  ('en-GB','en','GB','ltr',NULL,'active'),
  ('de-DE','de','DE','ltr','en-GB','active'),
  ('ar-SA','ar','SA','rtl','en-GB','active'),
  ('ar-AE','ar','AE','rtl','en-GB','active'),
  ('en-US','en','US','ltr','en-GB','active'),
  ('ur-PK','ur','PK','rtl','en-GB','preview'),
  ('fr-FR','fr','FR','ltr','en-GB','preview'),
  ('tr-TR','tr','TR','ltr','en-GB','preview')
ON CONFLICT (locale_key) DO UPDATE SET
  language_code=EXCLUDED.language_code,country_code=EXCLUDED.country_code,direction=EXCLUDED.direction,
  fallback_locale=EXCLUDED.fallback_locale,status=EXCLUDED.status;

COMMIT;
