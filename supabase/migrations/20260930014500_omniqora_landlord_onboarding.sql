-- Landlord-safe tenant discovery and invitation persistence.
BEGIN;

REVOKE ALL ON public.product_operator_tenants FROM authenticated;
GRANT ALL ON public.product_operator_tenants TO service_role;

CREATE OR REPLACE FUNCTION public.list_operator_tenants(_product text DEFAULT NULL)
RETURNS TABLE(
  product_key text,tenant_id uuid,tenant_product_id uuid,region_key text,plan_key text,status text,brand_key text,tenant_name text,tenant_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tp.product_key,tp.tenant_id,tp.id,tp.region_key,tp.plan_key,tp.status,tp.brand_key,t.name,t.slug
  FROM public.tenant_products tp
  JOIN public.tenants t ON t.id=tp.tenant_id
  WHERE (_product IS NULL OR tp.product_key=_product)
    AND (
      public.is_platform_operator(auth.uid(),ARRAY['platform_owner','platform_admin','platform_support','platform_billing','platform_auditor'])
      OR EXISTS(
        SELECT 1 FROM public.product_operators po
        WHERE po.product_key=tp.product_key
          AND po.user_id=auth.uid()
          AND po.status='active'
          AND (cardinality(po.region_keys)=0 OR tp.region_key=ANY(po.region_keys))
      )
    )
  ORDER BY tp.product_key,t.name;
$$;
REVOKE EXECUTE ON FUNCTION public.list_operator_tenants(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_operator_tenants(text) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text REFERENCES public.platform_products(product_key) ON DELETE SET NULL,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'viewer',
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email=lower(email)),
  CHECK (expires_at>created_at),
  CHECK (token_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS tenant_invitations_lookup_idx ON public.tenant_invitations(tenant_id,email,expires_at);
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_invitations FROM anon,authenticated;
GRANT ALL ON public.tenant_invitations TO service_role;

COMMIT;