-- Tenant/product identity policy and verified method references.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_identity_policies(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  enabled_methods text[] NOT NULL DEFAULT ARRAY['password']::text[],
  primary_method text NOT NULL DEFAULT 'password',
  require_mfa boolean NOT NULL DEFAULT false,
  allowed_mfa_methods text[] NOT NULL DEFAULT '{}',
  session_minutes integer NOT NULL DEFAULT 720 CHECK(session_minutes BETWEEN 5 AND 10080),
  remember_device_days integer NOT NULL DEFAULT 30 CHECK(remember_device_days BETWEEN 0 AND 365),
  allowed_email_domains text[] NOT NULL DEFAULT '{}',
  block_disposable_email boolean NOT NULL DEFAULT true,
  invite_only boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_identity_policy_scope_uq
 ON public.tenant_identity_policies(
  tenant_id,
  COALESCE(tenant_product_id,'00000000-0000-0000-0000-000000000000'::uuid)
 );

CREATE TABLE IF NOT EXISTS public.user_identity_bindings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method text NOT NULL,
  provider text NOT NULL,
  provider_subject_ref text,
  verified_at timestamptz,
  last_used_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,user_id,method,provider)
);
CREATE INDEX IF NOT EXISTS user_identity_bindings_user_idx
 ON public.user_identity_bindings(user_id,tenant_id);

ALTER TABLE public.tenant_identity_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_identity_bindings ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tenant_identity_policies TO authenticated;
GRANT SELECT ON public.user_identity_bindings TO authenticated;
GRANT ALL ON public.tenant_identity_policies,public.user_identity_bindings TO service_role;

DROP POLICY IF EXISTS "identity policy tenant read" ON public.tenant_identity_policies;
CREATE POLICY "identity policy tenant read" ON public.tenant_identity_policies FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "identity policy admin write" ON public.tenant_identity_policies;
CREATE POLICY "identity policy admin write" ON public.tenant_identity_policies FOR ALL TO authenticated
 USING(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "identity binding tenant read" ON public.user_identity_bindings;
CREATE POLICY "identity binding tenant read" ON public.user_identity_bindings FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['tenant_identity_policies','user_identity_bindings'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
  EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
 END LOOP;
END $$;

COMMIT;
