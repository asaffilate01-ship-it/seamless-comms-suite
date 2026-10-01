-- Syndriva vendor portal identities: marketplace providers are not SaaS tenants by default.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_vendor_users(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'vendor_staff'
    CHECK(role IN ('vendor_owner','vendor_admin','vendor_staff','vendor_viewer')),
  status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('invited','active','suspended','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vendor_id,user_id)
);
CREATE INDEX IF NOT EXISTS marketplace_vendor_users_user_idx
  ON public.marketplace_vendor_users(user_id,tenant_id,status);

CREATE TABLE IF NOT EXISTS public.marketplace_vendor_invitations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'vendor_staff'
    CHECK(role IN ('vendor_owner','vendor_admin','vendor_staff','vendor_viewer')),
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
CREATE INDEX IF NOT EXISTS marketplace_vendor_invites_lookup_idx
  ON public.marketplace_vendor_invitations(vendor_id,email,expires_at);

ALTER TABLE public.marketplace_vendor_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_vendor_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketplace_vendor_users,public.marketplace_vendor_invitations
  FROM anon,authenticated;
GRANT SELECT ON public.marketplace_vendor_users TO authenticated;
GRANT ALL ON public.marketplace_vendor_users,public.marketplace_vendor_invitations TO service_role;

DROP POLICY IF EXISTS "vendor portal self read" ON public.marketplace_vendor_users;
CREATE POLICY "vendor portal self read"
ON public.marketplace_vendor_users FOR SELECT TO authenticated
USING(
  user_id=auth.uid()
  OR public.is_tenant_member(tenant_id,auth.uid())
);

CREATE OR REPLACE FUNCTION public.has_marketplace_vendor_access(
  _tenant uuid,
  _vendor uuid,
  _user uuid,
  _roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $vendor_access$
  SELECT
    public.is_tenant_member(_tenant,_user)
    OR EXISTS(
      SELECT 1
      FROM public.marketplace_vendor_users vu
      JOIN public.marketplace_vendors v
        ON v.id=vu.vendor_id AND v.tenant_id=vu.tenant_id
      WHERE vu.tenant_id=_tenant
        AND vu.vendor_id=_vendor
        AND vu.user_id=_user
        AND vu.status='active'
        AND (_roles IS NULL OR vu.role=ANY(_roles))
    );
$vendor_access$;

REVOKE EXECUTE ON FUNCTION public.has_marketplace_vendor_access(uuid,uuid,uuid,text[])
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_marketplace_vendor_access(uuid,uuid,uuid,text[])
  TO authenticated,service_role;

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.marketplace_vendor_users;
CREATE TRIGGER platform_touch_updated_at
BEFORE UPDATE ON public.marketplace_vendor_users
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

COMMIT;
