-- Omniqora portfolio migration control plane.
-- Keeps legacy repositories/sites auditable while products are merged, tenantised or migrated.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_portfolio_products(
  portfolio_key text PRIMARY KEY,
  display_name text NOT NULL,
  profile text NOT NULL,
  architecture_role text NOT NULL CHECK(architecture_role IN (
    'landlord','marketplace_landlord','product_variant','tenant',
    'shared_engine','shared_module','external_source','review_required'
  )),
  parent_portfolio_key text,
  source_strategy text NOT NULL CHECK(source_strategy IN (
    'separate_repo','omniqora_native','merge_sources','tenant_configuration',
    'shared_module','external_connector'
  )),
  migration_stage text NOT NULL DEFAULT 'inventoried' CHECK(migration_stage IN (
    'inventoried','repo_audit','canonical_selected','adapter_required','adapter_ready',
    'shadow_sync','dual_read','cutover_ready','migrated','retired'
  )),
  register_in_factory boolean NOT NULL DEFAULT true,
  needs_review boolean NOT NULL DEFAULT true,
  canonical_repository text,
  module_keys text[] NOT NULL DEFAULT '{}',
  region_keys text[] NOT NULL DEFAULT '{}',
  locale_keys text[] NOT NULL DEFAULT '{}',
  boundary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_portfolio_parent_not_self CHECK(parent_portfolio_key IS NULL OR parent_portfolio_key<>portfolio_key)
);
CREATE INDEX IF NOT EXISTS platform_portfolio_role_idx
  ON public.platform_portfolio_products(architecture_role,migration_stage,needs_review);

CREATE TABLE IF NOT EXISTS public.platform_portfolio_sources(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_key text NOT NULL REFERENCES public.platform_portfolio_products(portfolio_key) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_row integer,
  source_kind text NOT NULL CHECK(source_kind IN ('github_repo','site','deployment','legacy_alias','other')),
  repository text,
  url text,
  notes text,
  source_status text NOT NULL DEFAULT 'inventoried'
    CHECK(source_status IN ('inventoried','audit_pending','audited','canonical','legacy','superseded','retired')),
  is_canonical boolean NOT NULL DEFAULT false,
  git_default_branch text,
  git_pushed_at timestamptz,
  git_size_kb bigint,
  feature_score numeric,
  data_score numeric,
  integration_score numeric,
  test_score numeric,
  deployment_score numeric,
  audit_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_audited_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_portfolio_source_row_uq
  ON public.platform_portfolio_sources(source_row) WHERE source_row IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_portfolio_sources_product_idx
  ON public.platform_portfolio_sources(portfolio_key,is_canonical,source_status);

CREATE UNIQUE INDEX IF NOT EXISTS platform_portfolio_one_canonical_source_uq
  ON public.platform_portfolio_sources(portfolio_key)
  WHERE is_canonical;

CREATE TABLE IF NOT EXISTS public.platform_migration_checkpoints(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_key text NOT NULL REFERENCES public.platform_portfolio_products(portfolio_key) ON DELETE CASCADE,
  stage text NOT NULL CHECK(stage IN (
    'inventory','repo_audit','schema_map','adapter','identity','events','shadow_sync',
    'parity','dual_read','write_switch','cutover','retire_legacy'
  )),
  status text NOT NULL DEFAULT 'not_started'
    CHECK(status IN ('not_started','in_progress','blocked','passed','waived')),
  owner text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(portfolio_key,stage)
);
CREATE INDEX IF NOT EXISTS platform_migration_checkpoint_idx
  ON public.platform_migration_checkpoints(status,stage,changed_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_source_relationships(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_portfolio_key text NOT NULL REFERENCES public.platform_portfolio_products(portfolio_key) ON DELETE CASCADE,
  target_portfolio_key text NOT NULL REFERENCES public.platform_portfolio_products(portfolio_key) ON DELETE CASCADE,
  relationship text NOT NULL CHECK(relationship IN (
    'tenant_of','variant_of','merge_into','uses_engine','marketplace_vendor_of',
    'marketplace_buyer_of','supersedes','integrates_with'
  )),
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','active','retired')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_portfolio_key,target_portfolio_key,relationship)
);

DO $portfolio_rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_portfolio_products','platform_portfolio_sources',
    'platform_migration_checkpoints','platform_source_relationships'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  END LOOP;
END
$portfolio_rls$;

DO $portfolio_touch$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_portfolio_products','platform_portfolio_sources','platform_source_relationships'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END
$portfolio_touch$;

COMMIT;
