-- Localisation, runtime branding and shared mobile app/device foundations.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_translation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  module_key text REFERENCES public.platform_modules(module_key) ON DELETE CASCADE,
  locale_key text NOT NULL REFERENCES public.platform_locale_packs(locale_key) ON DELETE CASCADE,
  translation_key text NOT NULL,
  value text NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft','review','approved','retired')),
  source text NOT NULL DEFAULT 'human' CHECK (source IN ('human','ai_draft','import','system')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_key,module_key,locale_key,translation_key)
);
CREATE INDEX IF NOT EXISTS platform_translation_locale_idx
  ON public.platform_translation_entries (locale_key,product_key,module_key,status);
ALTER TABLE public.platform_translation_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_translation_entries TO authenticated;
GRANT ALL ON public.platform_translation_entries TO service_role;
DROP POLICY IF EXISTS "translations approved read" ON public.platform_translation_entries;
CREATE POLICY "translations approved read" ON public.platform_translation_entries
FOR SELECT TO authenticated USING (status='approved');

CREATE TABLE IF NOT EXISTS public.tenant_translation_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  locale_key text NOT NULL REFERENCES public.platform_locale_packs(locale_key) ON DELETE CASCADE,
  translation_key text NOT NULL,
  value text NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft','review','approved','retired')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,tenant_product_id,locale_key,translation_key)
);
ALTER TABLE public.tenant_translation_overrides ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tenant_translation_overrides TO authenticated;
GRANT ALL ON public.tenant_translation_overrides TO service_role;
DROP POLICY IF EXISTS "tenant translations read" ON public.tenant_translation_overrides;
CREATE POLICY "tenant translations read" ON public.tenant_translation_overrides FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id,auth.uid()) AND status='approved');
DROP POLICY IF EXISTS "tenant translations admin write" ON public.tenant_translation_overrides;
CREATE POLICY "tenant translations admin write" ON public.tenant_translation_overrides FOR ALL TO authenticated
USING (public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
WITH CHECK (public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE TABLE IF NOT EXISTS public.tenant_brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  brand_key text NOT NULL DEFAULT 'default',
  display_name text NOT NULL,
  logo_url text,
  icon_url text,
  splash_url text,
  theme_tokens jsonb NOT NULL DEFAULT '{}'::jsonb,
  terminology jsonb NOT NULL DEFAULT '{}'::jsonb,
  support jsonb NOT NULL DEFAULT '{}'::jsonb,
  legal_identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_product_id,brand_key)
);
ALTER TABLE public.tenant_brand_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tenant_brand_profiles TO authenticated;
GRANT ALL ON public.tenant_brand_profiles TO service_role;
DROP POLICY IF EXISTS "brand profiles tenant read" ON public.tenant_brand_profiles;
CREATE POLICY "brand profiles tenant read" ON public.tenant_brand_profiles FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "brand profiles tenant admin write" ON public.tenant_brand_profiles;
CREATE POLICY "brand profiles tenant admin write" ON public.tenant_brand_profiles FOR ALL TO authenticated
USING (public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
WITH CHECK (public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE TABLE IF NOT EXISTS public.mobile_app_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  brand_key text,
  app_key text NOT NULL,
  display_name text NOT NULL,
  ios_bundle_id text NOT NULL,
  android_package text NOT NULL,
  locales text[] NOT NULL DEFAULT '{}',
  region_keys text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  modules text[] NOT NULL DEFAULT '{}',
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_key),
  UNIQUE (ios_bundle_id),
  UNIQUE (android_package)
);
ALTER TABLE public.mobile_app_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_app_profiles FROM anon,authenticated;
GRANT ALL ON public.mobile_app_profiles TO service_role;

CREATE TABLE IF NOT EXISTS public.mobile_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_profile_id uuid NOT NULL REFERENCES public.mobile_app_profiles(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios','android','web')),
  device_ref text NOT NULL,
  app_version text,
  locale text,
  time_zone text,
  push_provider text,
  push_token text,
  push_enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_profile_id,device_ref)
);
CREATE INDEX IF NOT EXISTS mobile_devices_user_idx ON public.mobile_devices (tenant_id,user_id,last_seen_at DESC);
ALTER TABLE public.mobile_devices ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.mobile_devices TO authenticated;
GRANT ALL ON public.mobile_devices TO service_role;
DROP POLICY IF EXISTS "mobile device self read" ON public.mobile_devices;
CREATE POLICY "mobile device self read" ON public.mobile_devices FOR SELECT TO authenticated
USING (user_id=auth.uid() AND public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "mobile device self write" ON public.mobile_devices;
CREATE POLICY "mobile device self write" ON public.mobile_devices FOR ALL TO authenticated
USING (user_id=auth.uid() AND public.is_tenant_member(tenant_id,auth.uid()))
WITH CHECK (user_id=auth.uid() AND public.is_tenant_member(tenant_id,auth.uid()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform_translation_entries','tenant_translation_overrides','tenant_brand_profiles','mobile_app_profiles','mobile_devices']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
  END LOOP;
END $$;

COMMIT;