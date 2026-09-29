-- Omniqora scale controls: service identities, data planes, entitlement RPC and usage ledger.
-- ADDITIVE ONLY. Source commit does not apply this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_service_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id text NOT NULL UNIQUE,
  secret_hash text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','expired')),
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(key_id) BETWEEN 8 AND 80),
  CHECK (secret_hash ~ '^[0-9a-f]{64}$')
);
ALTER TABLE public.platform_service_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_service_credentials FROM anon, authenticated;
GRANT ALL ON public.platform_service_credentials TO service_role;
CREATE INDEX IF NOT EXISTS platform_service_credentials_status_idx
  ON public.platform_service_credentials (status, expires_at);

CREATE TABLE IF NOT EXISTS public.platform_data_planes (
  data_plane_key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('shared_postgres','regional_postgres','dedicated_postgres','external')),
  region text NOT NULL,
  residency_countries text[] NOT NULL DEFAULT '{}',
  connection_secret_ref text NOT NULL,
  storage_secret_ref text,
  vector_secret_ref text,
  graph_secret_ref text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draining','disabled')),
  capacity_class text CHECK (capacity_class IS NULL OR capacity_class IN ('small','medium','large','dedicated')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_data_planes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_data_planes FROM anon, authenticated;
GRANT ALL ON public.platform_data_planes TO service_role;

CREATE TABLE IF NOT EXISTS public.tenant_data_plane_bindings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  data_plane_key text NOT NULL REFERENCES public.platform_data_planes(data_plane_key) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','migrating','suspended')),
  migration_revision integer NOT NULL DEFAULT 1 CHECK (migration_revision > 0),
  bound_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_data_plane_bindings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tenant_data_plane_bindings TO authenticated;
GRANT ALL ON public.tenant_data_plane_bindings TO service_role;
DROP POLICY IF EXISTS "tenant data plane admin read" ON public.tenant_data_plane_bindings;
CREATE POLICY "tenant data plane admin read"
ON public.tenant_data_plane_bindings FOR SELECT TO authenticated
USING (public.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

CREATE TABLE IF NOT EXISTS public.platform_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  metric_key text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity >= 0),
  unit text NOT NULL,
  source_event_id text,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, module_key, metric_key, source_event_id)
);
CREATE INDEX IF NOT EXISTS platform_usage_events_lookup_idx
  ON public.platform_usage_events (tenant_id, module_key, metric_key, occurred_at DESC);
ALTER TABLE public.platform_usage_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_usage_events TO authenticated;
GRANT ALL ON public.platform_usage_events TO service_role;
DROP POLICY IF EXISTS "usage tenant read" ON public.platform_usage_events;
CREATE POLICY "usage tenant read"
ON public.platform_usage_events FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.has_module_entitlement(
  _tenant uuid,
  _tenant_product uuid,
  _module text,
  _at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_module_entitlements e
    WHERE e.tenant_id = _tenant
      AND e.module_key = _module
      AND e.enabled = true
      AND (e.tenant_product_id IS NULL OR e.tenant_product_id = _tenant_product)
      AND (e.starts_at IS NULL OR e.starts_at <= _at)
      AND (e.ends_at IS NULL OR e.ends_at > _at)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_module_entitlement(uuid,uuid,text,timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_module_entitlement(uuid,uuid,text,timestamptz)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.module_usage_total(
  _tenant uuid,
  _module text,
  _metric text,
  _since timestamptz,
  _until timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(quantity),0)
  FROM public.platform_usage_events
  WHERE tenant_id = _tenant
    AND module_key = _module
    AND metric_key = _metric
    AND occurred_at >= _since
    AND occurred_at < _until;
$$;

REVOKE EXECUTE ON FUNCTION public.module_usage_total(uuid,text,text,timestamptz,timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.module_usage_total(uuid,text,text,timestamptz,timestamptz)
  TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_service_credentials','platform_data_planes','tenant_data_plane_bindings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END $$;

COMMIT;
