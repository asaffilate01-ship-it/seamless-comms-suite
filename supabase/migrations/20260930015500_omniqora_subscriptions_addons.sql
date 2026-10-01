-- Omniqora plans, subscriptions, add-ons, module requests and operational bindings.
-- ADDITIVE ONLY.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_plans(
  plan_key text PRIMARY KEY,
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  name text NOT NULL,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  billing_interval text NOT NULL CHECK(billing_interval IN ('monthly','annual','usage','one_time')),
  price_minor bigint NOT NULL DEFAULT 0 CHECK(price_minor>=0),
  trial_days integer CHECK(trial_days IS NULL OR trial_days BETWEEN 0 AND 365),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_plans_product_idx ON public.platform_plans(product_key,active,name);

CREATE TABLE IF NOT EXISTS public.platform_plan_modules(
  plan_key text NOT NULL REFERENCES public.platform_plans(plan_key) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE CASCADE,
  included boolean NOT NULL DEFAULT true,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(plan_key,module_key)
);

CREATE TABLE IF NOT EXISTS public.platform_module_addons(
  addon_key text PRIMARY KEY,
  product_key text REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE CASCADE,
  name text NOT NULL,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  billing_interval text NOT NULL CHECK(billing_interval IN ('monthly','annual','usage','one_time')),
  price_minor bigint NOT NULL DEFAULT 0 CHECK(price_minor>=0),
  included_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_module_addons_lookup_idx ON public.platform_module_addons(product_key,module_key,active);

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  plan_key text NOT NULL REFERENCES public.platform_plans(plan_key) ON DELETE RESTRICT,
  provider text,
  provider_subscription_ref text,
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('trialing','active','past_due','paused','cancelled','ended')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  cancel_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_subscription_one_live_uq
  ON public.tenant_subscriptions(tenant_product_id)
  WHERE status IN ('trialing','active','past_due','paused');
CREATE INDEX IF NOT EXISTS tenant_subscriptions_tenant_idx ON public.tenant_subscriptions(tenant_id,status,current_period_end);

CREATE TABLE IF NOT EXISTS public.tenant_addon_subscriptions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  addon_key text NOT NULL REFERENCES public.platform_module_addons(addon_key) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','cancelled','ended')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  provider_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_addon_one_live_uq
  ON public.tenant_addon_subscriptions(tenant_product_id,addon_key)
  WHERE status IN ('active','paused');

CREATE TABLE IF NOT EXISTS public.tenant_module_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE RESTRICT,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  status text NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','approved','rejected','cancelled','completed')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_module_requests_queue_idx
  ON public.tenant_module_requests(status,created_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_subscriptions','tenant_addon_subscriptions','tenant_module_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','subscription tenant read',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))',
      'subscription tenant read',t
    );
  END LOOP;
END $$;

ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_plan_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_module_addons ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_plans,public.platform_plan_modules,public.platform_module_addons TO authenticated;
GRANT ALL ON public.platform_plans,public.platform_plan_modules,public.platform_module_addons TO service_role;
DROP POLICY IF EXISTS "plans read" ON public.platform_plans;
CREATE POLICY "plans read" ON public.platform_plans FOR SELECT TO authenticated USING(active);
DROP POLICY IF EXISTS "plan modules read" ON public.platform_plan_modules;
CREATE POLICY "plan modules read" ON public.platform_plan_modules FOR SELECT TO authenticated USING(true);
DROP POLICY IF EXISTS "module addons read" ON public.platform_module_addons;
CREATE POLICY "module addons read" ON public.platform_module_addons FOR SELECT TO authenticated USING(active);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['platform_plans','platform_module_addons','tenant_subscriptions','tenant_addon_subscriptions','tenant_module_requests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sync_subscription_entitlements(_subscription uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE s public.tenant_subscriptions; pm record;
BEGIN
  SELECT * INTO s FROM public.tenant_subscriptions WHERE id=_subscription FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

  IF s.status IN ('trialing','active') THEN
    FOR pm IN SELECT * FROM public.platform_plan_modules WHERE plan_key=s.plan_key AND included=true LOOP
      INSERT INTO public.tenant_module_entitlements(tenant_id,tenant_product_id,module_key,enabled,limits,config,starts_at,ends_at,source)
      VALUES(s.tenant_id,s.tenant_product_id,pm.module_key,true,pm.limits,pm.config,s.starts_at,s.current_period_end,'subscription')
      ON CONFLICT(tenant_id,(COALESCE(tenant_product_id,'00000000-0000-0000-0000-000000000000'::uuid)),module_key)
      DO UPDATE SET enabled=true,limits=EXCLUDED.limits,config=EXCLUDED.config,starts_at=EXCLUDED.starts_at,
        ends_at=EXCLUDED.ends_at,source='subscription',updated_at=now();
    END LOOP;
  ELSE
    UPDATE public.tenant_module_entitlements
      SET enabled=false,updated_at=now()
      WHERE tenant_id=s.tenant_id AND tenant_product_id=s.tenant_product_id AND source='subscription';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_subscription_entitlements(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_subscription_entitlements(uuid) TO service_role;

COMMIT;
