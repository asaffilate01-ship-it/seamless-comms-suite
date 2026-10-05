-- Multi-secret integration bindings and shared Payments persistence.
BEGIN;

ALTER TABLE public.tenant_integration_bindings
  ADD COLUMN IF NOT EXISTS plugin_key text,
  ADD COLUMN IF NOT EXISTS secret_refs jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_intent_ref text,
  idempotency_key text NOT NULL,
  purpose text NOT NULL,
  context_type text,
  context_id text,
  customer_ref text,
  amount_minor bigint NOT NULL CHECK (amount_minor>=0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  capture_mode text NOT NULL DEFAULT 'automatic' CHECK (capture_mode IN ('automatic','manual')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','requires_action','pending','authorised','captured','failed','cancelled','partially_refunded','refunded')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS payment_intents_status_idx ON public.payment_intents (tenant_id,tenant_product_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_intent_id uuid NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  provider_ref text,
  amount_minor bigint NOT NULL CHECK (amount_minor>0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','cancelled')),
  reason text,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.payment_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_ref text,
  recipient_ref text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor>=0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed','cancelled','reversed')),
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['payment_intents','payment_refunds','payment_payouts'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','payments tenant read',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))','payments tenant read',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','payments admin write',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_tenant_role(tenant_id,auth.uid(),ARRAY[''owner'',''admin'']::public.app_role[])) WITH CHECK (public.has_tenant_role(tenant_id,auth.uid(),ARRAY[''owner'',''admin'']::public.app_role[]))','payments admin write',t);
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
  END LOOP;
END $$;

COMMIT;