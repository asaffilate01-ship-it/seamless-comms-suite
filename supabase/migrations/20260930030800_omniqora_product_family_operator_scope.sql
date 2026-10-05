-- Family-aware landlord operator access for country/product variants.
BEGIN;

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
AS $family_operator$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_products target
    JOIN public.product_operators p
      ON p.product_key = target.product_key
      OR (target.parent_product_key IS NOT NULL AND p.product_key = target.parent_product_key)
    WHERE target.product_key = _product
      AND p.user_id = _user
      AND p.status = 'active'
      AND (_roles IS NULL OR p.role = ANY(_roles))
      AND (_region IS NULL OR cardinality(p.region_keys) = 0 OR _region = ANY(p.region_keys))
  );
$family_operator$;

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

CREATE OR REPLACE FUNCTION public.list_operator_tenants(_product text DEFAULT NULL)
RETURNS TABLE(
  product_key text,
  tenant_id uuid,
  tenant_product_id uuid,
  region_key text,
  plan_key text,
  status text,
  brand_key text,
  tenant_name text,
  tenant_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $family_tenants$
  SELECT tp.product_key,tp.tenant_id,tp.id,tp.region_key,tp.plan_key,tp.status,tp.brand_key,t.name,t.slug
  FROM public.tenant_products tp
  JOIN public.tenants t ON t.id=tp.tenant_id
  WHERE (
    _product IS NULL
    OR tp.product_key=_product
    OR EXISTS(
      SELECT 1
      FROM public.platform_products requested
      JOIN public.platform_products candidate
        ON candidate.product_key=tp.product_key
      WHERE requested.product_key=_product
        AND (
          candidate.parent_product_key=requested.product_key
          OR (
            requested.parent_product_key IS NOT NULL
            AND candidate.parent_product_key=requested.parent_product_key
          )
        )
    )
  )
  AND (
    public.is_platform_operator(
      auth.uid(),
      ARRAY['platform_owner','platform_admin','platform_support','platform_billing','platform_auditor']
    )
    OR public.is_product_operator(tp.product_key,auth.uid(),NULL,tp.region_key)
  )
  ORDER BY tp.product_key,t.name;
$family_tenants$;

REVOKE EXECUTE ON FUNCTION public.is_product_operator(text,uuid,text[],text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.list_operator_tenants(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_product_operator(text,uuid,text[],text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.list_operator_tenants(text) TO authenticated,service_role;

COMMIT;
