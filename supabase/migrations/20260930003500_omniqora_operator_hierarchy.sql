-- Omniqora platform/product operator hierarchy.
-- Separates iTechLounge platform operators from SaaS landlord operators and tenant members.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_operators (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('platform_owner','platform_admin','platform_support','platform_billing','platform_auditor')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_operators ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_operators TO authenticated;
GRANT ALL ON public.platform_operators TO service_role;
DROP POLICY IF EXISTS "platform operator self read" ON public.platform_operators;
CREATE POLICY "platform operator self read"
ON public.platform_operators FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.product_operators (
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('landlord_owner','landlord_admin','landlord_support','landlord_billing','landlord_auditor')),
  region_keys text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_key, user_id)
);
ALTER TABLE public.product_operators ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.product_operators TO authenticated;
GRANT ALL ON public.product_operators TO service_role;
DROP POLICY IF EXISTS "product operator self read" ON public.product_operators;
CREATE POLICY "product operator self read"
ON public.product_operators FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_operator(
  _user uuid,
  _roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_operators p
    WHERE p.user_id = _user
      AND p.status = 'active'
      AND (_roles IS NULL OR p.role = ANY(_roles))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_product_operator(
  _product text,
  _user uuid,
  _roles text[] DEFAULT NULL,
  _region text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.product_operators p
    WHERE p.product_key = _product
      AND p.user_id = _user
      AND p.status = 'active'
      AND (_roles IS NULL OR p.role = ANY(_roles))
      AND (_region IS NULL OR cardinality(p.region_keys) = 0 OR _region = ANY(p.region_keys))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_operator(uuid,text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_product_operator(text,uuid,text[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_operator(uuid,text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_product_operator(text,uuid,text[],text) TO authenticated, service_role;

CREATE OR REPLACE VIEW public.product_operator_tenants
WITH (security_invoker = true)
AS
SELECT
  tp.product_key,
  tp.tenant_id,
  tp.id AS tenant_product_id,
  tp.region_key,
  tp.plan_key,
  tp.status,
  tp.brand_key,
  t.name AS tenant_name,
  t.slug AS tenant_slug
FROM public.tenant_products tp
JOIN public.tenants t ON t.id = tp.tenant_id
WHERE public.is_product_operator(tp.product_key, auth.uid(), NULL, tp.region_key)
   OR public.is_platform_operator(auth.uid(), NULL);

GRANT SELECT ON public.product_operator_tenants TO authenticated;
GRANT ALL ON public.product_operator_tenants TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_operators','product_operators']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END $$;

COMMIT;