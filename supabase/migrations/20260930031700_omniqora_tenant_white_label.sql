-- Tenant white-label identity, surfaces and communication identities.
BEGIN;

INSERT INTO public.platform_modules(
  module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities
) VALUES(
  'branding.white_label',
  'Omniqora Full White Label',
  'branding',
  '1.0.0-preview',
  'preview',
  'hybrid',
  ARRAY['platform.tenant','platform.audit'],
  ARRAY[
    'remove_powered_by','custom_portals','custom_email_identity',
    'custom_communications_branding','tenant_legal_identity'
  ]
)
ON CONFLICT(module_key) DO UPDATE SET
  name=EXCLUDED.name,
  module_kind=EXCLUDED.module_kind,
  version=EXCLUDED.version,
  status=EXCLUDED.status,
  ui_mode=EXCLUDED.ui_mode,
  dependencies=EXCLUDED.dependencies,
  capabilities=EXCLUDED.capabilities,
  updated_at=now();

INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
SELECT p.product_key,'branding.white_label',false
FROM public.platform_products p
WHERE p.kind IN ('vertical_landlord','standalone','product_variant')
ON CONFLICT(product_key,module_key) DO NOTHING;

ALTER TABLE public.tenant_brand_profiles
  ADD COLUMN IF NOT EXISTS branding_mode text NOT NULL DEFAULT 'co_branded'
    CHECK(branding_mode IN ('landlord','co_branded','white_label')),
  ADD COLUMN IF NOT EXISTS logo_light_url text,
  ADD COLUMN IF NOT EXISTS logo_dark_url text,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS og_image_url text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS legal_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_voice jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS powered_by_label text,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK(revision>0);

DROP INDEX IF EXISTS tenant_brand_profiles_scope_idx;
CREATE INDEX IF NOT EXISTS tenant_brand_profiles_scope_idx
  ON public.tenant_brand_profiles(tenant_id,tenant_product_id,status,brand_key);

ALTER TABLE public.tenant_domains
  DROP CONSTRAINT IF EXISTS tenant_domains_purpose_check;
ALTER TABLE public.tenant_domains
  ADD CONSTRAINT tenant_domains_purpose_check
  CHECK(purpose IN (
    'marketing','app','customer_portal','provider_portal','staff_portal',
    'api','tracking','assets','auth','email','other'
  ));

CREATE TABLE IF NOT EXISTS public.tenant_brand_surfaces(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  brand_key text NOT NULL,
  surface text NOT NULL CHECK(surface IN (
    'marketing','staff_portal','customer_portal','provider_portal',
    'auth','tracking','documents','email','invoices','mobile_app'
  )),
  domain_id uuid REFERENCES public.tenant_domains(id) ON DELETE SET NULL,
  display_name text,
  logo_url text,
  logo_light_url text,
  logo_dark_url text,
  favicon_url text,
  app_icon_url text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  navigation jsonb NOT NULL DEFAULT '[]'::jsonb,
  footer jsonb NOT NULL DEFAULT '{}'::jsonb,
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  terminology jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_product_id,brand_key,surface)
);
CREATE INDEX IF NOT EXISTS tenant_brand_surfaces_scope_idx
  ON public.tenant_brand_surfaces(tenant_id,tenant_product_id,surface,enabled);

CREATE TABLE IF NOT EXISTS public.tenant_communication_identities(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK(channel IN ('email','whatsapp','sms','voice')),
  purpose text NOT NULL DEFAULT 'transactional'
    CHECK(purpose IN ('transactional','marketing','support','bookings','billing','reception','general')),
  identity_value text NOT NULL,
  display_name text,
  reply_to text,
  provider_binding_id uuid REFERENCES public.tenant_integration_bindings(id) ON DELETE SET NULL,
  domain_id uuid REFERENCES public.tenant_domains(id) ON DELETE SET NULL,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK(verification_status IN ('pending','configured','verified','failed')),
  active boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_at timestamptz,
  verified_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_product_id,channel,purpose,identity_value)
);
CREATE INDEX IF NOT EXISTS tenant_communication_identities_scope_idx
  ON public.tenant_communication_identities(
    tenant_id,tenant_product_id,channel,purpose,verification_status,active
  );
CREATE UNIQUE INDEX IF NOT EXISTS tenant_communication_identity_primary_uq
  ON public.tenant_communication_identities(
    tenant_product_id,
    COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid),
    channel,purpose
  )
  WHERE active AND is_primary;

DO $white_label_rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_brand_surfaces','tenant_communication_identities'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','white label tenant read',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))',
      'white label tenant read',t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','white label admin write',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_tenant_role(tenant_id,auth.uid(),ARRAY[''owner'',''admin'']::public.app_role[])) WITH CHECK (public.has_tenant_role(tenant_id,auth.uid(),ARRAY[''owner'',''admin'']::public.app_role[]))',
      'white label admin write',t
    );
  END LOOP;
END
$white_label_rls$;

DO $white_label_touch$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_brand_surfaces','tenant_communication_identities'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END
$white_label_touch$;

COMMIT;
