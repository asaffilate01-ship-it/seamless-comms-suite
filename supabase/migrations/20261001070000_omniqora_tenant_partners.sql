-- Real tenant partner / third-party registry replacing UI mock data.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_partners(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  partner_type text NOT NULL,
  legal_name text,
  country_code text,
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','pending_review','active','suspended','closed')),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK(verification_status IN ('unverified','pending','verified','failed')),
  sla_target_percent numeric CHECK(sla_target_percent IS NULL OR (sla_target_percent>=0 AND sla_target_percent<=100)),
  data_scope text[] NOT NULL DEFAULT '{}',
  service_scope text[] NOT NULL DEFAULT '{}',
  commission_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_partners_scope_idx
  ON public.tenant_partners(tenant_id,tenant_product_id,status,name);

CREATE TABLE IF NOT EXISTS public.tenant_partner_assignments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.tenant_partners(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  status text NOT NULL DEFAULT 'offered'
    CHECK(status IN ('offered','accepted','declined','in_progress','completed','cancelled','breached')),
  offered_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  sla_met boolean,
  data_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_partner_assignments_lookup_idx
  ON public.tenant_partner_assignments(tenant_id,partner_id,status,due_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant_partners','tenant_partner_assignments']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','partner tenant read',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))',
      'partner tenant read',t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','partner tenant write',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))',
      'partner tenant write',t
    );
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END $$;

COMMIT;
