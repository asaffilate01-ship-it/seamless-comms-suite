-- Product-family / country-variant support for SaaS Factory.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_platform_product_draft(
  _product_key text,
  _name text,
  _kind text,
  _industry text,
  _blueprint jsonb,
  _parent_product_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $factory_variant$
DECLARE
  v integer;
  b uuid;
  regions text[];
  locales text[];
  modules text[];
  parent_row public.platform_products;
BEGIN
  IF NOT public.is_platform_operator(auth.uid(),ARRAY['platform_owner','platform_admin']) THEN
    RAISE EXCEPTION 'Platform admin access required';
  END IF;
  IF _product_key !~ '^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$' THEN
    RAISE EXCEPTION 'Invalid product key';
  END IF;
  IF _kind NOT IN ('shared_engine','vertical_landlord','product_variant','standalone') THEN
    RAISE EXCEPTION 'Invalid product kind';
  END IF;

  IF _kind='product_variant' THEN
    IF _parent_product_key IS NULL THEN
      RAISE EXCEPTION 'Product variant requires parent product';
    END IF;
    SELECT * INTO parent_row
    FROM public.platform_products
    WHERE product_key=_parent_product_key
      AND kind IN ('vertical_landlord','standalone')
      AND status<>'retired';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Valid active parent landlord product required';
    END IF;
  ELSIF _parent_product_key IS NOT NULL THEN
    RAISE EXCEPTION 'Only product variants may declare a parent product';
  END IF;

  regions:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'regions','[]'::jsonb)));
  locales:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'locales','[]'::jsonb)));
  modules:=ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'modules','[]'::jsonb)));

  IF cardinality(regions)=0 OR cardinality(locales)=0 THEN
    RAISE EXCEPTION 'At least one region and locale are required';
  END IF;
  IF EXISTS(
    SELECT 1 FROM unnest(regions) r
    WHERE NOT EXISTS(SELECT 1 FROM public.platform_region_packs p WHERE p.region_key=r)
  ) THEN
    RAISE EXCEPTION 'Unknown region in blueprint';
  END IF;
  IF EXISTS(
    SELECT 1 FROM unnest(locales) l
    WHERE NOT EXISTS(SELECT 1 FROM public.platform_locale_packs p WHERE p.locale_key=l)
  ) THEN
    RAISE EXCEPTION 'Unknown locale in blueprint';
  END IF;
  IF EXISTS(
    SELECT 1 FROM unnest(modules) m
    WHERE NOT EXISTS(SELECT 1 FROM public.platform_modules p WHERE p.module_key=m)
  ) THEN
    RAISE EXCEPTION 'Unknown module in blueprint';
  END IF;

  INSERT INTO public.platform_products(
    product_key,name,kind,parent_product_key,industry,status,metadata
  )
  VALUES(
    _product_key,btrim(_name),_kind,_parent_product_key,btrim(_industry),'incubating',
    jsonb_build_object('familyRoot',COALESCE(_parent_product_key,_product_key))
  )
  ON CONFLICT (product_key) DO UPDATE SET
    name=EXCLUDED.name,
    kind=EXCLUDED.kind,
    parent_product_key=EXCLUDED.parent_product_key,
    industry=EXCLUDED.industry,
    updated_at=now();

  SELECT COALESCE(max(version),0)+1 INTO v
  FROM public.platform_product_blueprints
  WHERE product_key=_product_key;

  INSERT INTO public.platform_product_blueprints(
    product_key,version,status,industry,region_keys,locale_keys,module_keys,roles,
    navigation,domain_objects,workflows,mobile_capabilities,ui_schema,metadata,created_by
  )
  VALUES(
    _product_key,v,'draft',btrim(_industry),regions,locales,modules,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'roles','[]'::jsonb))),
    COALESCE(_blueprint->'navigation','[]'::jsonb),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'domainObjects','[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'workflows','[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(_blueprint->'mobileCapabilities','[]'::jsonb))),
    COALESCE(_blueprint->'uiSchema','{}'::jsonb),
    COALESCE(_blueprint->'metadata','{}'::jsonb)
      || jsonb_build_object('parentProductKey',_parent_product_key),
    auth.uid()
  )
  RETURNING id INTO b;

  RETURN jsonb_build_object(
    'id',b,
    'productKey',_product_key,
    'version',v,
    'status','draft',
    'parentProductKey',_parent_product_key
  );
END;
$factory_variant$;

DROP FUNCTION IF EXISTS public.create_platform_product_draft(text,text,text,text,jsonb);
REVOKE EXECUTE
  ON FUNCTION public.create_platform_product_draft(text,text,text,text,jsonb,text)
  FROM PUBLIC,anon;
GRANT EXECUTE
  ON FUNCTION public.create_platform_product_draft(text,text,text,text,jsonb,text)
  TO authenticated,service_role;

COMMIT;
