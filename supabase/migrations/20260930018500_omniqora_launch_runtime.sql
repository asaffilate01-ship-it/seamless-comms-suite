-- White-label branding, runtime feature config, universal tracking, scheduled automation,
-- import/export jobs and plugin health history.
BEGIN;

INSERT INTO public.platform_products(product_key,name,kind,industry,status) VALUES
 ('business360','Business360','vertical_landlord','business_advisory_transformation','incubating')
ON CONFLICT(product_key) DO UPDATE SET
 name=EXCLUDED.name,kind=EXCLUDED.kind,industry=EXCLUDED.industry,status=EXCLUDED.status,updated_at=now();

INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default) VALUES
 ('business360','crm.core',true),
 ('business360','business360.core',true),
 ('business360','transactions.core',true),
 ('business360','documents.core',true),
 ('business360','analytics.core',true),
 ('business360','financials.core',true),
 ('business360','intelligence.core',true),
 ('business360','compliance.core',true),
 ('business360','connect.core',true)
ON CONFLICT(product_key,module_key) DO UPDATE SET enabled_by_default=EXCLUDED.enabled_by_default;

CREATE TABLE IF NOT EXISTS public.tenant_brand_profiles(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  brand_key text NOT NULL,
  name text NOT NULL,
  logo_url text,
  icon_url text,
  splash_url text,
  primary_colour text,
  secondary_colour text,
  accent_colour text,
  font_family text,
  support_email text,
  support_phone text,
  app_name text,
  legal_name text,
  website_url text,
  locale text,
  terminology jsonb NOT NULL DEFAULT '{}'::jsonb,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,brand_key)
);
CREATE INDEX IF NOT EXISTS tenant_brand_profiles_scope_idx
 ON public.tenant_brand_profiles(tenant_id,tenant_product_id,status);

CREATE TABLE IF NOT EXISTS public.tenant_runtime_config(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  config_key text NOT NULL,
  value jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'operator',
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_runtime_config_scope_uq
 ON public.tenant_runtime_config(
  tenant_id,
  COALESCE(tenant_product_id,'00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid),
  config_key
 );

CREATE TABLE IF NOT EXISTS public.public_tracking_tokens(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  public_fields text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS public_tracking_subject_idx
 ON public.public_tracking_tokens(tenant_id,subject_type,subject_id,expires_at);

CREATE TABLE IF NOT EXISTS public.tracking_snapshots(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  status text,
  eta_at timestamptz,
  latitude double precision,
  longitude double precision,
  heading numeric,
  progress numeric,
  public_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,subject_type,subject_id)
);

CREATE TABLE IF NOT EXISTS public.platform_schedules(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  module_key text REFERENCES public.platform_modules(module_key) ON DELETE CASCADE,
  schedule_key text NOT NULL,
  timezone text NOT NULL DEFAULT 'UTC',
  cron_expression text,
  interval_minutes integer CHECK(interval_minutes IS NULL OR interval_minutes>=60),
  action_key text NOT NULL,
  action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,tenant_product_id,schedule_key)
);
CREATE INDEX IF NOT EXISTS platform_schedules_due_idx
 ON public.platform_schedules(enabled,next_run_at);

CREATE TABLE IF NOT EXISTS public.platform_data_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  job_kind text NOT NULL CHECK(job_kind IN ('import','export')),
  resource_type text NOT NULL,
  format text NOT NULL CHECK(format IN ('csv','json','xlsx','pdf','zip')),
  storage_ref text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed','cancelled')),
  total_rows bigint,
  processed_rows bigint,
  error_rows bigint,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_data_jobs_queue_idx
 ON public.platform_data_jobs(status,created_at);

CREATE TABLE IF NOT EXISTS public.plugin_health_checks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  binding_id uuid NOT NULL REFERENCES public.tenant_integration_bindings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plugin_key text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  latency_ms integer CHECK(latency_ms IS NULL OR latency_ms>=0),
  status_code integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text
);
CREATE INDEX IF NOT EXISTS plugin_health_checks_binding_idx
 ON public.plugin_health_checks(binding_id,checked_at DESC);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'tenant_brand_profiles','tenant_runtime_config','platform_data_jobs'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','launch tenant read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))','launch tenant read',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','launch tenant admin write',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_tenant_role(tenant_id,auth.uid(),ARRAY[''owner'',''admin'']::public.app_role[])) WITH CHECK (public.has_tenant_role(tenant_id,auth.uid(),ARRAY[''owner'',''admin'']::public.app_role[]))','launch tenant admin write',t);
 END LOOP;
END $$;

ALTER TABLE public.public_tracking_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plugin_health_checks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.public_tracking_tokens,public.tracking_snapshots,public.plugin_health_checks FROM anon;
GRANT ALL ON public.public_tracking_tokens,public.tracking_snapshots,public.plugin_health_checks TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.public_tracking_tokens,public.tracking_snapshots TO authenticated;
GRANT SELECT ON public.plugin_health_checks TO authenticated;

DROP POLICY IF EXISTS "tracking token admin" ON public.public_tracking_tokens;
CREATE POLICY "tracking token admin" ON public.public_tracking_tokens FOR ALL TO authenticated
 USING(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin','agent']::public.app_role[]))
 WITH CHECK(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin','agent']::public.app_role[]));

DROP POLICY IF EXISTS "tracking snapshot tenant read" ON public.tracking_snapshots;
CREATE POLICY "tracking snapshot tenant read" ON public.tracking_snapshots FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "tracking snapshot tenant write" ON public.tracking_snapshots;
CREATE POLICY "tracking snapshot tenant write" ON public.tracking_snapshots FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

GRANT SELECT ON public.platform_schedules TO authenticated;
GRANT ALL ON public.platform_schedules TO service_role;
DROP POLICY IF EXISTS "schedule tenant read" ON public.platform_schedules;
CREATE POLICY "schedule tenant read" ON public.platform_schedules FOR SELECT TO authenticated
 USING(tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "plugin health tenant read" ON public.plugin_health_checks;
CREATE POLICY "plugin health tenant read" ON public.plugin_health_checks FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'tenant_brand_profiles','tenant_runtime_config','tracking_snapshots','platform_schedules','platform_data_jobs'
 ] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
  EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
 END LOOP;
END $$;

COMMIT;
