-- Omniqora event backbone + provisioning execution records.
-- ADDITIVE ONLY. Source commit does not apply this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_events (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE RESTRICT,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1 CHECK (event_version > 0),
  occurred_at timestamptz NOT NULL,
  environment text NOT NULL CHECK (environment IN ('development','staging','production')),
  subject_type text,
  subject_id text,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  workspace_id text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  correlation_id text,
  causation_id text,
  idempotency_key text NOT NULL,
  data_classification text NOT NULL DEFAULT 'internal'
    CHECK (data_classification IN ('public','internal','confidential','restricted')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_key, idempotency_key)
);
CREATE INDEX IF NOT EXISTS platform_events_stream_idx
  ON public.platform_events (tenant_id, product_key, event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS platform_events_subject_idx
  ON public.platform_events (tenant_id, subject_type, subject_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_event_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_key text NOT NULL,
  event_pattern text NOT NULL,
  destination_kind text NOT NULL CHECK (destination_kind IN ('internal','webhook','queue')),
  destination_ref text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_event_subscriptions_match_idx
  ON public.platform_event_subscriptions (enabled, subscriber_key, product_key);

CREATE TABLE IF NOT EXISTS public.platform_event_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.platform_events(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.platform_event_subscriptions(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','delivered','dead','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS platform_event_deliveries_queue_idx
  ON public.platform_event_deliveries (state, next_attempt_at, created_at);

CREATE TABLE IF NOT EXISTS public.platform_provisioning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE RESTRICT,
  region_key text NOT NULL REFERENCES public.platform_region_packs(region_key) ON DELETE RESTRICT,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  plan jsonb NOT NULL,
  state text NOT NULL DEFAULT 'planned'
    CHECK (state IN ('planned','approved','running','completed','failed','cancelled','rolled_back')),
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_provisioning_runs_tenant_idx
  ON public.platform_provisioning_runs (tenant_id, state, created_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_provisioning_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.platform_provisioning_runs(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','running','completed','failed','skipped','rolled_back')),
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, position)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_events','platform_provisioning_runs','platform_provisioning_steps'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

ALTER TABLE public.platform_event_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_event_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_event_subscriptions, public.platform_event_deliveries FROM anon, authenticated;
GRANT ALL ON public.platform_event_subscriptions, public.platform_event_deliveries TO service_role;

DROP POLICY IF EXISTS "platform events tenant read" ON public.platform_events;
CREATE POLICY "platform events tenant read" ON public.platform_events FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
DROP POLICY IF EXISTS "platform events tenant write" ON public.platform_events;
CREATE POLICY "platform events tenant write" ON public.platform_events FOR INSERT TO authenticated
  WITH CHECK (public.can_write(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "provisioning runs admin read" ON public.platform_provisioning_runs;
CREATE POLICY "provisioning runs admin read" ON public.platform_provisioning_runs FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "provisioning runs admin write" ON public.platform_provisioning_runs;
CREATE POLICY "provisioning runs admin write" ON public.platform_provisioning_runs FOR ALL TO authenticated
  USING (public.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "provisioning steps admin read" ON public.platform_provisioning_steps;
CREATE POLICY "provisioning steps admin read" ON public.platform_provisioning_steps FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_provisioning_runs r
    WHERE r.id = run_id
      AND public.has_tenant_role(r.tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
  ));
DROP POLICY IF EXISTS "provisioning steps admin write" ON public.platform_provisioning_steps;
CREATE POLICY "provisioning steps admin write" ON public.platform_provisioning_steps FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_provisioning_runs r
    WHERE r.id = run_id
      AND public.has_tenant_role(r.tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.platform_provisioning_runs r
    WHERE r.id = run_id
      AND public.has_tenant_role(r.tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
  ));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_event_subscriptions','platform_event_deliveries',
    'platform_provisioning_runs','platform_provisioning_steps'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()', t);
  END LOOP;
END $$;

COMMIT;
