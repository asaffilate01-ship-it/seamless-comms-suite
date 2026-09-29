-- Dynamic, versioned SaaS Factory product blueprints.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_product_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version>0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  industry text NOT NULL,
  region_keys text[] NOT NULL DEFAULT '{}',
  locale_keys text[] NOT NULL DEFAULT '{}',
  module_keys text[] NOT NULL DEFAULT '{}',
  roles text[] NOT NULL DEFAULT '{}',
  navigation jsonb NOT NULL DEFAULT '[]'::jsonb,
  domain_objects text[] NOT NULL DEFAULT '{}',
  workflows text[] NOT NULL DEFAULT '{}',
  mobile_capabilities text[] NOT NULL DEFAULT '{}',
  ui_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_key,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_product_blueprints_one_active
  ON public.platform_product_blueprints(product_key) WHERE status='active';
CREATE INDEX IF NOT EXISTS platform_product_blueprints_status_idx
  ON public.platform_product_blueprints(status,product_key,version DESC);

ALTER TABLE public.platform_product_blueprints ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.platform_product_blueprints TO authenticated;
GRANT ALL ON public.platform_product_blueprints TO service_role;
DROP POLICY IF EXISTS "published blueprints read" ON public.platform_product_blueprints;
CREATE POLICY "published blueprints read" ON public.platform_product_blueprints FOR SELECT TO authenticated
USING (status='active' OR public.is_platform_operator(auth.uid(),ARRAY['platform_owner','platform_admin']));
DROP POLICY IF EXISTS "platform admins manage blueprints" ON public.platform_product_blueprints;
CREATE POLICY "platform admins manage blueprints" ON public.platform_product_blueprints FOR ALL TO authenticated
USING (public.is_platform_operator(auth.uid(),ARRAY['platform_owner','platform_admin']))
WITH CHECK (public.is_platform_operator(auth.uid(),ARRAY['platform_owner','platform_admin']));

DROP POLICY IF EXISTS "platform products admin write" ON public.platform_products;
CREATE POLICY "platform products admin write" ON public.platform_products FOR ALL TO authenticated
USING (public.is_platform_operator(auth.uid(),ARRAY['platform_owner','platform_admin']))
WITH CHECK (public.is_platform_operator(auth.uid(),ARRAY['platform_owner','platform_admin']));

CREATE OR REPLACE FUNCTION public.create_platform_product_draft(
  _product_key text,_name text,_kind text,_industry text,_blueprint jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v integer; b uuid; regions text[]; locales text[]; modules text[];
BEGIN
  IF NOT public.is_platform_operator(auth.uid(),ARRAY['platform_owner','platform_admin']) THEN RAISE EXCEPTION 'Platform admin access required'; END IF;
  IF _product_key !~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$' THEN RAISE EXCEPTION 'Invalid product key'; END IF;
  IF _kind NOT IN ('shared_engine','vertical_landlord','product_variant','standalone') THEN RAISE EXCEPTION 'Invalid product kind'; END IF;
  regions:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'regions','[]'::jsonb)));
  locales:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'locales','[]'::jsonb)));
  modules:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'modules','[]'::jsonb)));
  IF cardinality(regions)=0 OR cardinality(locales)=0 THEN RAISE EXCEPTION 'At least one region and locale are required'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(regions) r WHERE NOT EXISTS(SELECT 1 FROM public.platform_region_packs p WHERE p.region_key=r)) THEN RAISE EXCEPTION 'Unknown region in blueprint'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(locales) l WHERE NOT EXISTS(SELECT 1 FROM public.platform_locale_packs p WHERE p.locale_key=l)) THEN RAISE EXCEPTION 'Unknown locale in blueprint'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(modules) m WHERE NOT EXISTS(SELECT 1 FROM public.platform_modules p WHERE p.module_key=m)) THEN RAISE EXCEPTION 'Unknown module in blueprint'; END IF;

  INSERT INTO public.platform_products(product_key,name,kind,industry,status,metadata)
  VALUES(_product_key,btrim(_name),_kind,btrim(_industry),'incubating','{}'::jsonb)
  ON CONFLICT (product_key) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,industry=EXCLUDED.industry,updated_at=now();

  SELECT COALESCE(max(version),0)+1 INTO v FROM public.platform_product_blueprints WHERE product_key=_product_key;
  INSERT INTO public.platform_product_blueprints(
    product_key,version,status,industry,region_keys,locale_keys,module_keys,roles,navigation,domain_objects,workflows,mobile_capabilities,ui_schema,metadata,created_by
  ) VALUES (
    _product_key,v,'draft',btrim(_industry),regions,locales,modules,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'roles','[]'::jsonb))),
    COALESCE(_blueprint->'navigation','[]'::jsonb),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'domainObjects','[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'workflows','[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'mobileCapabilities','[]'::jsonb))),
    COALESCE(_blueprint->'uiSchema','{}'::jsonb),COALESCE(_blueprint->'metadata','{}'::jsonb),auth.uid()
  ) RETURNING id INTO b;
  RETURN jsonb_build_object('id',b,'productKey',_product_key,'version',v,'status','draft');
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_platform_product_blueprint(_product_key text,_version integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE b public.platform_product_blueprints; m text;
BEGIN
  IF NOT public.is_platform_operator(auth.uid(),ARRAY['platform_owner','platform_admin']) THEN RAISE EXCEPTION 'Platform admin access required'; END IF;
  SELECT * INTO b FROM public.platform_product_blueprints WHERE product_key=_product_key AND version=_version FOR UPDATE;
  IF NOT FOUND OR b.status<>'draft' THEN RAISE EXCEPTION 'Draft blueprint not found'; END IF;
  UPDATE public.platform_product_blueprints SET status='retired',updated_at=now() WHERE product_key=_product_key AND status='active';
  UPDATE public.platform_product_blueprints SET status='active',approved_by=auth.uid(),approved_at=now(),updated_at=now() WHERE id=b.id;
  UPDATE public.platform_products SET status='active',updated_at=now() WHERE product_key=_product_key;
  DELETE FROM public.product_module_defaults WHERE product_key=_product_key;
  FOREACH m IN ARRAY b.module_keys LOOP
    INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
    VALUES(_product_key,m,true) ON CONFLICT (product_key,module_key) DO UPDATE SET enabled_by_default=true;
  END LOOP;
  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
  VALUES(NULL,auth.uid(),'platform.product.published','platform_product',_product_key,jsonb_build_object('version',_version));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_platform_product_draft(text,text,text,text,jsonb) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.publish_platform_product_blueprint(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_platform_product_draft(text,text,text,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_platform_product_blueprint(text,integer) TO authenticated,service_role;

CREATE OR REPLACE VIEW public.active_platform_product_blueprints
WITH (security_invoker = true)
AS SELECT * FROM public.platform_product_blueprints WHERE status='active';
GRANT SELECT ON public.active_platform_product_blueprints TO authenticated;
GRANT ALL ON public.active_platform_product_blueprints TO service_role;

DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.platform_product_blueprints';
  EXECUTE 'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.platform_product_blueprints FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()';
END $$;

COMMIT;