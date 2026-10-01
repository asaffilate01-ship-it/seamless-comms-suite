BEGIN;

CREATE TABLE IF NOT EXISTS public.portfolio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_row integer NOT NULL CHECK (source_row > 0),
  name text NOT NULL,
  repository_url text,
  live_url text,
  links_to text,
  proposed_role text NOT NULL,
  architecture_role text NOT NULL CHECK (architecture_role IN (
    'platform_landlord','landlord','tenant','regional_variant',
    'shared_module','merge_candidate','vertical_product','standalone_candidate'
  )),
  parent_landlord text,
  migration_structure text,
  common_services text[] NOT NULL DEFAULT '{}',
  audit_status text,
  traits text[] NOT NULL DEFAULT '{}',
  target_mode text NOT NULL DEFAULT 'pending' CHECK (target_mode IN (
    'pending','retain_product','platform_landlord','landlord','tenant',
    'regional_variant','shared_module','marketplace','merge','site_native'
  )),
  migration_stage text NOT NULL DEFAULT 'inventory' CHECK (migration_stage IN (
    'inventory','repo_audit','decision','adapter','shadow_sync',
    'cutover_ready','cutover','complete','blocked'
  )),
  canonical_product_key text,
  canonical_repository_url text,
  stage_progress smallint NOT NULL DEFAULT 10 CHECK (stage_progress BETWEEN 0 AND 100),
  owner_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_row)
);

CREATE INDEX IF NOT EXISTS portfolio_assets_tenant_stage_idx
  ON public.portfolio_assets (tenant_id, migration_stage, source_row);
CREATE INDEX IF NOT EXISTS portfolio_assets_tenant_role_idx
  ON public.portfolio_assets (tenant_id, architecture_role, source_row);
CREATE INDEX IF NOT EXISTS portfolio_assets_traits_gin_idx
  ON public.portfolio_assets USING gin (traits);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_assets TO authenticated;
GRANT ALL ON public.portfolio_assets TO service_role;
ALTER TABLE public.portfolio_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio assets tenant read" ON public.portfolio_assets;
CREATE POLICY "portfolio assets tenant read"
ON public.portfolio_assets
FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "portfolio assets admin write" ON public.portfolio_assets;
CREATE POLICY "portfolio assets admin write"
ON public.portfolio_assets
FOR ALL TO authenticated
USING (
  public.has_tenant_role(
    tenant_id,
    auth.uid(),
    ARRAY['owner','admin']::public.app_role[]
  )
)
WITH CHECK (
  public.has_tenant_role(
    tenant_id,
    auth.uid(),
    ARRAY['owner','admin']::public.app_role[]
  )
);

CREATE TABLE IF NOT EXISTS public.portfolio_migration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.portfolio_assets(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_stage text,
  to_stage text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_migration_events_asset_idx
  ON public.portfolio_migration_events (tenant_id, asset_id, created_at DESC);

GRANT SELECT, INSERT ON public.portfolio_migration_events TO authenticated;
GRANT ALL ON public.portfolio_migration_events TO service_role;
ALTER TABLE public.portfolio_migration_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portfolio migration events tenant read"
  ON public.portfolio_migration_events;
CREATE POLICY "portfolio migration events tenant read"
ON public.portfolio_migration_events
FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "portfolio migration events admin insert"
  ON public.portfolio_migration_events;
CREATE POLICY "portfolio migration events admin insert"
ON public.portfolio_migration_events
FOR INSERT TO authenticated
WITH CHECK (
  public.has_tenant_role(
    tenant_id,
    auth.uid(),
    ARRAY['owner','admin']::public.app_role[]
  )
);

COMMIT;
