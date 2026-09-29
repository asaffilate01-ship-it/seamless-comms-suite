-- Shared operational engine persistence for Omniqora.
-- ADDITIVE ONLY. These tables are not activated until the migration is reviewed/applied.
BEGIN;

CREATE TABLE IF NOT EXISTS public.connect_masked_call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_session_ref text,
  proxy_number text NOT NULL,
  caller_hash text NOT NULL,
  recipient_hash text NOT NULL,
  context_type text,
  context_id text,
  recording_policy text NOT NULL DEFAULT 'disabled'
    CHECK (recording_policy IN ('disabled','provider_default','tenant_policy')),
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved','active','completed','expired','failed')),
  expires_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connect_masked_call_sessions_scope_idx
  ON public.connect_masked_call_sessions (tenant_id, state, expires_at);

CREATE TABLE IF NOT EXISTS public.dispatch_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'offline'
    CHECK (status IN ('offline','available','busy','break','suspended')),
  skills text[] NOT NULL DEFAULT '{}',
  vehicle_id uuid,
  latitude double precision,
  longitude double precision,
  position_observed_at timestamptz,
  shift_ends_at timestamptz,
  capacity_available numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_agents_availability_idx
  ON public.dispatch_agents (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  registration text,
  vehicle_type text NOT NULL,
  capacity numeric,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','assigned','maintenance','inactive')),
  odometer numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_vehicles_status_idx
  ON public.dispatch_vehicles (tenant_id, status, vehicle_type);

ALTER TABLE public.dispatch_agents
  DROP CONSTRAINT IF EXISTS dispatch_agents_vehicle_id_fkey;
ALTER TABLE public.dispatch_agents
  ADD CONSTRAINT dispatch_agents_vehicle_id_fkey
  FOREIGN KEY (vehicle_id) REFERENCES public.dispatch_vehicles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  product_key text NOT NULL,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  required_skills text[] NOT NULL DEFAULT '{}',
  required_vehicle_types text[] NOT NULL DEFAULT '{}',
  capacity_demand numeric,
  scheduled_at timestamptz,
  assigned_agent_id uuid REFERENCES public.dispatch_agents(id) ON DELETE SET NULL,
  assigned_vehicle_id uuid REFERENCES public.dispatch_vehicles(id) ON DELETE SET NULL,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_jobs_queue_idx
  ON public.dispatch_jobs (tenant_id, status, priority, scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_jobs_external_uq
  ON public.dispatch_jobs (tenant_id, product_key, external_ref)
  WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.dispatch_job_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  stop_kind text NOT NULL CHECK (stop_kind IN ('pickup','dropoff','service','return')),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  address text,
  contact_name text,
  contact_phone text,
  instructions text,
  window_start timestamptz,
  window_end timestamptz,
  service_seconds integer NOT NULL DEFAULT 0 CHECK (service_seconds >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (job_id, position)
);

CREATE TABLE IF NOT EXISTS public.dispatch_pod (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL UNIQUE REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL,
  methods text[] NOT NULL DEFAULT '{}',
  evidence_refs text[] NOT NULL DEFAULT '{}',
  recipient_name text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','active','suspended','closed')),
  country_code text NOT NULL,
  currency text NOT NULL,
  commission_profile text,
  payout_profile text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_vendors_status_idx
  ON public.marketplace_vendors (tenant_id, status, name);

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  listing_type text NOT NULL CHECK (listing_type IN ('product','service','rental','consultation','auction')),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_review','active','paused','archived')),
  category_keys text[] NOT NULL DEFAULT '{}',
  currency text NOT NULL,
  price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  inventory_tracked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_listings_search_idx
  ON public.marketplace_listings (tenant_id, status, vendor_id);

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  buyer_ref text NOT NULL,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft',
  currency text NOT NULL,
  subtotal_minor bigint NOT NULL DEFAULT 0,
  discount_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  fees_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_orders_status_idx
  ON public.marketplace_orders (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.creative_brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  brand_key text,
  name text NOT NULL,
  region_key text,
  locale text,
  logos text[] NOT NULL DEFAULT '{}',
  colours text[] NOT NULL DEFAULT '{}',
  fonts text[] NOT NULL DEFAULT '{}',
  tone text[] NOT NULL DEFAULT '{}',
  banned_terms text[] NOT NULL DEFAULT '{}',
  required_disclaimers text[] NOT NULL DEFAULT '{}',
  asset_refs text[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creative_brand_kits_scope_idx
  ON public.creative_brand_kits (tenant_id, tenant_product_id, brand_key, locale);

CREATE TABLE IF NOT EXISTS public.creative_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  brand_kit_id uuid REFERENCES public.creative_brand_kits(id) ON DELETE SET NULL,
  campaign_ref text,
  objective text NOT NULL,
  audience text NOT NULL,
  channels text[] NOT NULL DEFAULT '{}',
  asset_types text[] NOT NULL DEFAULT '{}',
  message text NOT NULL,
  offer text,
  call_to_action text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ready','generating','review','approved','published','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creative_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brief_id uuid NOT NULL REFERENCES public.creative_briefs(id) ON DELETE CASCADE,
  asset_type text NOT NULL CHECK (asset_type IN ('copy','image','video','audio','document','web_asset')),
  locale text NOT NULL,
  channel text NOT NULL,
  uri text NOT NULL,
  variant_key text,
  model_run_id text,
  source_asset_refs text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','approved','rejected','published')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'connect_masked_call_sessions','dispatch_agents','dispatch_vehicles','dispatch_jobs',
    'dispatch_job_stops','dispatch_pod','marketplace_vendors','marketplace_listings',
    'marketplace_orders','marketplace_order_items','creative_brand_kits','creative_briefs','creative_assets'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'engine tenant read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()))',
      'engine tenant read', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'engine tenant write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id, auth.uid())) WITH CHECK (public.can_write(tenant_id, auth.uid()))',
      'engine tenant write', t
    );
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'connect_masked_call_sessions','dispatch_agents','dispatch_vehicles','dispatch_jobs',
    'marketplace_vendors','marketplace_listings','marketplace_orders',
    'creative_brand_kits','creative_briefs','creative_assets'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()', t);
  END LOOP;
END $$;

COMMIT;
