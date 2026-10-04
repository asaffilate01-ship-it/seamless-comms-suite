BEGIN;

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES(
 'omniqora.creative','Voxentri Creative Studio',
 'Shared brand kits, creative briefs, governed AI assets, localisation, variants, approvals and asset library.',
 'creative','omniqora',true,'automatic','active','built_main'
)
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,status='active',
 implementation_status='built_main',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.creative','omniqora.ai'),
 ('omniqora.creative','omniqora.documents'),
 ('omniqora.creative','omniqora.campaigns')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status)
VALUES('voxentri','Voxentri','Creative, content and campaign production workspace powered by shared Omniqora creative services.','creative','external','active')
ON CONFLICT(product_key) DO UPDATE SET description=EXCLUDED.description,status='active';

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
 ('omniqora','omniqora.creative',false,false),
 ('voxentri','omniqora.creative',true,true),
 ('voxentri','omniqora.ai',true,false),
 ('voxentri','omniqora.campaigns',true,false),
 ('voxentri','omniqora.analytics',true,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
 default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required;

CREATE TABLE IF NOT EXISTS public.creative_brand_kits(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 brand_key text NOT NULL DEFAULT 'default',
 name text NOT NULL,
 region_key text,
 locale text,
 logos text[] NOT NULL DEFAULT '{}',
 colours text[] NOT NULL DEFAULT '{}',
 fonts text[] NOT NULL DEFAULT '{}',
 tone text[] NOT NULL DEFAULT '{}',
 banned_terms text[] NOT NULL DEFAULT '{}',
 required_disclaimers text[] NOT NULL DEFAULT '{}',
 asset_refs text[] NOT NULL DEFAULT '{}',
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','retired')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,brand_key,locale,revision)
);

CREATE TABLE IF NOT EXISTS public.creative_briefs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 brand_kit_id uuid REFERENCES public.creative_brand_kits(id) ON DELETE SET NULL,
 campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
 campaign_ref text,
 objective text NOT NULL,
 audience text NOT NULL,
 channels text[] NOT NULL DEFAULT '{}',
 asset_types text[] NOT NULL DEFAULT '{}',
 message text NOT NULL,
 offer text,
 call_to_action text,
 due_at timestamptz,
 status text NOT NULL DEFAULT 'draft'
  CHECK(status IN('draft','ready','generating','review','approved','published','cancelled')),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creative_assets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 brief_id uuid NOT NULL REFERENCES public.creative_briefs(id) ON DELETE CASCADE,
 asset_type text NOT NULL CHECK(asset_type IN('copy','image','video','audio','document','web_asset')),
 locale text NOT NULL,
 channel text NOT NULL,
 uri text NOT NULL,
 variant_key text,
 model_run_id text,
 source_asset_refs text[] NOT NULL DEFAULT '{}',
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft'
  CHECK(status IN('draft','review','approved','rejected','published')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.creative_localisation_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 source_asset_id uuid NOT NULL REFERENCES public.creative_assets(id) ON DELETE CASCADE,
 target_locale text NOT NULL,
 target_channel text,
 requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','review','approved','failed','cancelled')),
 output_asset_id uuid REFERENCES public.creative_assets(id) ON DELETE SET NULL,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_asset_id,target_locale,target_channel)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'creative_brand_kits','creative_briefs','creative_assets','creative_localisation_jobs'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
   'creative tenant read',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))',
   'creative tenant write',t);
 END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS creative_brand_scope_idx ON public.creative_brand_kits(tenant_id,product_key,brand_key,locale,status);
CREATE INDEX IF NOT EXISTS creative_brief_status_idx ON public.creative_briefs(tenant_id,product_key,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS creative_asset_brief_idx ON public.creative_assets(brief_id,status,revision DESC);

COMMIT;
