-- Portfolio migration control plane for the 100+ SaaS/site inventory.
BEGIN;

CREATE TABLE IF NOT EXISTS public.portfolio_migration_assets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_row_number integer NOT NULL UNIQUE,
  intake_key text NOT NULL UNIQUE,
  intake_name text NOT NULL,
  source_repo_url text,
  source_site_url text,
  source_hint text,
  source_kind text NOT NULL DEFAULT 'unknown'
    CHECK(source_kind IN ('repository','site_only','mixed','unknown')),
  proposed_role text,
  proposed_parent text,
  proposed_structure text,
  audit_status text NOT NULL DEFAULT 'repo_audit_pending',
  target_role text NOT NULL DEFAULT 'review'
    CHECK(target_role IN (
      'platform','shared_engine','shared_addon','landlord','product_variant',
      'tenant','brand_tenant','marketplace_tenant','tenant_review','merge_source',
      'external_connector','review'
    )),
  target_product_key text,
  target_parent_key text,
  migration_action text NOT NULL DEFAULT 'repo_audit',
  migration_wave integer NOT NULL DEFAULT 4 CHECK(migration_wave BETWEEN 0 AND 20),
  migration_status text NOT NULL DEFAULT 'intake'
    CHECK(migration_status IN (
      'intake','repo_audit','classified','ready','in_progress',
      'shadow_sync','parity','cutover','complete','retired','blocked'
    )),
  canonical_repo_url text,
  canonical_repo_reason text,
  needs_repo boolean NOT NULL DEFAULT false,
  build_in_omniqora boolean NOT NULL DEFAULT false,
  confidence text NOT NULL DEFAULT 'provisional'
    CHECK(confidence IN ('provisional','medium','high','verified')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_assets_role_idx
  ON public.portfolio_migration_assets(target_role,migration_wave,migration_status);
CREATE INDEX IF NOT EXISTS portfolio_assets_target_idx
  ON public.portfolio_migration_assets(target_product_key,target_parent_key);

CREATE TABLE IF NOT EXISTS public.portfolio_repo_candidates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.portfolio_migration_assets(id) ON DELETE CASCADE,
  repository_full_name text NOT NULL,
  repo_url text NOT NULL,
  candidate_kind text NOT NULL DEFAULT 'source'
    CHECK(candidate_kind IN ('source','alternate','merge_source','canonical','archive_after_merge')),
  accessible boolean,
  archived boolean,
  visibility text,
  default_branch text,
  latest_commit_sha text,
  latest_commit_at timestamptz,
  file_count integer,
  src_file_count integer,
  route_count integer,
  supabase_file_count integer,
  migration_count integer,
  function_count integer,
  test_count integer,
  completeness_score numeric,
  audit_notes text,
  is_canonical boolean NOT NULL DEFAULT false,
  audited_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asset_id,repository_full_name)
);
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_repo_one_canonical_uq
  ON public.portfolio_repo_candidates(asset_id) WHERE is_canonical;

CREATE TABLE IF NOT EXISTS public.portfolio_relationships(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_asset_id uuid NOT NULL REFERENCES public.portfolio_migration_assets(id) ON DELETE CASCADE,
  target_asset_id uuid REFERENCES public.portfolio_migration_assets(id) ON DELETE CASCADE,
  target_product_key text,
  relationship_kind text NOT NULL
    CHECK(relationship_kind IN (
      'landlord_of','variant_of','tenant_of','brand_tenant_of','marketplace_member_of',
      'merge_into','supersedes','uses_shared_engine','depends_on','connector_to'
    )),
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','confirmed','migrated','retired')),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(target_asset_id IS NOT NULL OR target_product_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS portfolio_relationships_source_idx
  ON public.portfolio_relationships(source_asset_id,relationship_kind,status);

CREATE TABLE IF NOT EXISTS public.portfolio_migration_checks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.portfolio_migration_assets(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','pass','warning','fail','not_applicable')),
  detail text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz,
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asset_id,check_key)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'portfolio_migration_assets','portfolio_repo_candidates',
    'portfolio_relationships','portfolio_migration_checks'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','portfolio platform read',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_platform_operator(auth.uid(),NULL))',
      'portfolio platform read',t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','portfolio platform write',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_platform_operator(auth.uid(),ARRAY[''platform_owner'',''platform_admin''])) WITH CHECK (public.is_platform_operator(auth.uid(),ARRAY[''platform_owner'',''platform_admin'']))',
      'portfolio platform write',t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END $$;

COMMIT;
