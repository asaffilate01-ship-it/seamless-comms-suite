-- Shared end-customer portal identities linked to CRM, without tenant membership.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_portal_users(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  crm_person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'customer_member'
    CHECK(role IN ('customer_owner','customer_member','customer_viewer')),
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('invited','active','suspended','revoked')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_product_id,user_id),
  UNIQUE(crm_person_id,user_id)
);
CREATE INDEX IF NOT EXISTS customer_portal_users_lookup_idx
  ON public.customer_portal_users(user_id,tenant_id,tenant_product_id,status);

CREATE TABLE IF NOT EXISTS public.customer_portal_invitations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  crm_person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'customer_member'
    CHECK(role IN ('customer_owner','customer_member','customer_viewer')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(email=lower(email)),
  CHECK(token_hash ~ '^[0-9a-f]{64}$'),
  CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS customer_portal_invitations_lookup_idx
  ON public.customer_portal_invitations(tenant_product_id,email,expires_at);

ALTER TABLE public.customer_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_portal_users,public.customer_portal_invitations FROM anon,authenticated;
GRANT SELECT ON public.customer_portal_users TO authenticated;
GRANT ALL ON public.customer_portal_users,public.customer_portal_invitations TO service_role;

DROP POLICY IF EXISTS "customer portal self read" ON public.customer_portal_users;
CREATE POLICY "customer portal self read"
ON public.customer_portal_users FOR SELECT TO authenticated
USING(user_id=auth.uid() OR public.is_tenant_member(tenant_id,auth.uid()));

CREATE OR REPLACE FUNCTION public.has_customer_portal_access(
  _tenant uuid,
  _tenant_product uuid,
  _user uuid,
  _roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $customer_portal_access$
  SELECT EXISTS(
    SELECT 1
    FROM public.customer_portal_users cu
    JOIN public.crm_people p ON p.id=cu.crm_person_id AND p.tenant_id=cu.tenant_id
    JOIN public.tenant_products tp
      ON tp.id=cu.tenant_product_id AND tp.tenant_id=cu.tenant_id
    WHERE cu.tenant_id=_tenant
      AND cu.tenant_product_id=_tenant_product
      AND cu.user_id=_user
      AND cu.status='active'
      AND tp.status='active'
      AND (_roles IS NULL OR cu.role=ANY(_roles))
  );
$customer_portal_access$;

REVOKE EXECUTE ON FUNCTION public.has_customer_portal_access(uuid,uuid,uuid,text[])
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_customer_portal_access(uuid,uuid,uuid,text[])
  TO authenticated,service_role;

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.customer_portal_users;
CREATE TRIGGER platform_touch_updated_at
BEFORE UPDATE ON public.customer_portal_users
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

COMMIT;
