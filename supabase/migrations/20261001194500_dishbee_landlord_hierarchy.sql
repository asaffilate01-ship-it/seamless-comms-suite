-- Dishbee landlord hierarchy + first real SaaS Factory pilot.
-- Adds explicit landlord/product-family semantics and reusable tenant brand/location records.
BEGIN;

ALTER TABLE public.product_catalogue
  ADD COLUMN IF NOT EXISTS product_role text NOT NULL DEFAULT 'product'
    CHECK (product_role IN ('platform','landlord','experience','product','utility')),
  ADD COLUMN IF NOT EXISTS parent_product_key text REFERENCES public.product_catalogue(product_key) ON DELETE SET NULL;

UPDATE public.product_catalogue SET product_role='platform', parent_product_key=NULL
WHERE product_key='omniqora';

UPDATE public.product_catalogue SET product_role='landlord', parent_product_key=NULL
WHERE product_key IN ('dishbee','kindelo','formationgenie','omniqora-accounts','taxcenda','taxnuvia','lawquo','sparesgrid','haccora','courier-connect','all-road-aid','zivvo','autohashi','fastremit');

UPDATE public.product_catalogue SET product_role='experience', parent_product_key='dishbee'
WHERE product_key='mealdeck';

CREATE TABLE IF NOT EXISTS public.tenant_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text REFERENCES public.product_catalogue(product_key) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9-]{1,100}$'),
  logo_url text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_one_primary_brand_idx
  ON public.tenant_brands(tenant_id)
  WHERE is_primary;

CREATE TABLE IF NOT EXISTS public.tenant_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  code text NOT NULL CHECK (code ~ '^[a-z0-9-]{1,100}$'),
  timezone text NOT NULL DEFAULT 'Europe/London',
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','opening','closed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS tenant_locations_tenant_status_idx
  ON public.tenant_locations(tenant_id,status);

DO $$ DECLARE n text; BEGIN
  FOREACH n IN ARRAY ARRAY['tenant_brands','tenant_locations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',n);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',n);
  END LOOP;
END $$;

GRANT SELECT ON public.tenant_brands, public.tenant_locations TO authenticated;

DROP POLICY IF EXISTS "tenant brands read" ON public.tenant_brands;
CREATE POLICY "tenant brands read" ON public.tenant_brands FOR SELECT TO authenticated
USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "tenant locations read" ON public.tenant_locations;
CREATE POLICY "tenant locations read" ON public.tenant_locations FOR SELECT TO authenticated
USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

CREATE OR REPLACE FUNCTION public.platform_upsert_tenant_brand(
  _tenant uuid,
  _product text,
  _name text,
  _slug text,
  _primary boolean DEFAULT false,
  _logo_url text DEFAULT NULL,
  _theme jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Brand access denied';
  END IF;
  IF _slug !~ '^[a-z0-9-]{1,100}$' OR length(COALESCE(_name,'')) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid brand';
  END IF;
  IF _primary THEN
    UPDATE public.tenant_brands SET is_primary=false,updated_at=now() WHERE tenant_id=_tenant;
  END IF;
  INSERT INTO public.tenant_brands(tenant_id,product_key,name,slug,logo_url,theme,is_primary)
  VALUES(_tenant,_product,_name,_slug,_logo_url,COALESCE(_theme,'{}'::jsonb),_primary)
  ON CONFLICT (tenant_id,slug)
  DO UPDATE SET product_key=EXCLUDED.product_key,name=EXCLUDED.name,logo_url=EXCLUDED.logo_url,
                theme=EXCLUDED.theme,is_primary=EXCLUDED.is_primary,updated_at=now()
  RETURNING id INTO result;
  PERFORM public.queue_provisioning(_tenant,'branding',_slug,'update',
    jsonb_build_object('brandId',result,'productKey',_product));
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_upsert_tenant_brand(uuid,text,text,text,boolean,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_upsert_tenant_brand(uuid,text,text,text,boolean,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_upsert_tenant_location(
  _tenant uuid,
  _brand uuid,
  _name text,
  _code text,
  _timezone text DEFAULT 'Europe/London',
  _address jsonb DEFAULT '{}'::jsonb,
  _status text DEFAULT 'active'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Location access denied';
  END IF;
  IF _code !~ '^[a-z0-9-]{1,100}$' OR length(COALESCE(_name,'')) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid location';
  END IF;
  IF _brand IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.tenant_brands WHERE id=_brand AND tenant_id=_tenant
  ) THEN RAISE EXCEPTION 'Brand does not belong to tenant'; END IF;

  INSERT INTO public.tenant_locations(tenant_id,brand_id,name,code,timezone,address,status)
  VALUES(_tenant,_brand,_name,_code,_timezone,COALESCE(_address,'{}'::jsonb),_status)
  ON CONFLICT (tenant_id,code)
  DO UPDATE SET brand_id=EXCLUDED.brand_id,name=EXCLUDED.name,timezone=EXCLUDED.timezone,
                address=EXCLUDED.address,status=EXCLUDED.status,updated_at=now()
  RETURNING id INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_upsert_tenant_location(uuid,uuid,text,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_upsert_tenant_location(uuid,uuid,text,text,text,jsonb,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_apply_blueprint(
  _tenant uuid,
  _blueprint text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p record; s record;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenant_blueprints WHERE blueprint_key=_blueprint AND status='active') THEN
    RAISE EXCEPTION 'Blueprint not found';
  END IF;

  FOR p IN SELECT product_key,config FROM public.blueprint_products WHERE blueprint_key=_blueprint LOOP
    INSERT INTO public.tenant_products(tenant_id,product_key,status,config)
    VALUES(_tenant,p.product_key,'requested',p.config)
    ON CONFLICT (tenant_id,product_key)
    DO UPDATE SET status=CASE WHEN public.tenant_products.status='active' THEN 'active' ELSE 'requested' END,
                  config=EXCLUDED.config,updated_at=now();
    PERFORM public.queue_provisioning(_tenant,'product',p.product_key,'provision',p.config);
  END LOOP;

  FOR s IN SELECT service_key,config FROM public.blueprint_services WHERE blueprint_key=_blueprint LOOP
    PERFORM public.apply_service_with_dependencies(_tenant,s.service_key,'blueprint');
    UPDATE public.tenant_services SET config=s.config,updated_at=now()
    WHERE tenant_id=_tenant AND service_key=s.service_key;
    PERFORM public.queue_provisioning(_tenant,'service',s.service_key,'provision',s.config);
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.platform_apply_blueprint(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_apply_blueprint(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_bootstrap_dishbee_pilot()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  org_id uuid;
  tenant_id uuid;
  brand_id uuid;
  item record;
  result jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;

  SELECT id INTO org_id FROM public.organisations WHERE slug='313-brands';
  IF org_id IS NULL THEN
    INSERT INTO public.organisations(name,slug,country_code,billing_currency)
    VALUES('313 Brands Ltd','313-brands','GB','GBP')
    RETURNING id INTO org_id;
  END IF;

  INSERT INTO public.organisation_members(organisation_id,user_id,role)
  VALUES(org_id,auth.uid(),'owner')
  ON CONFLICT (organisation_id,user_id) DO UPDATE SET role='owner';

  FOR item IN
    SELECT * FROM (VALUES
      ('Cafe 1 St Albans','cafe1-st-albans','restaurant-uk','cafe-1'),
      ('Cafe 1 Luton','cafe1-luton','restaurant-uk','cafe-1'),
      ('MealDeck','mealdeck','mealdeck-uk','mealdeck')
    ) AS x(tenant_name,tenant_slug,blueprint_key,brand_slug)
  LOOP
    SELECT id INTO tenant_id FROM public.tenants WHERE slug=item.tenant_slug;
    IF tenant_id IS NULL THEN
      INSERT INTO public.tenants(name,slug,organisation_id,country_code,currency,timezone,status)
      VALUES(item.tenant_name,item.tenant_slug,org_id,'GB','GBP','Europe/London','active')
      RETURNING id INTO tenant_id;
    ELSE
      IF (SELECT organisation_id FROM public.tenants WHERE id=tenant_id) <> org_id THEN
        RAISE EXCEPTION 'Tenant % already belongs to another organisation', item.tenant_slug;
      END IF;
    END IF;

    INSERT INTO public.tenant_members(tenant_id,user_id,role)
    VALUES(tenant_id,auth.uid(),'owner')
    ON CONFLICT (tenant_id,user_id) DO UPDATE SET role='owner';

    PERFORM public.platform_apply_blueprint(tenant_id,item.blueprint_key);

    SELECT public.platform_upsert_tenant_brand(
      tenant_id,
      CASE WHEN item.tenant_slug='mealdeck' THEN 'mealdeck' ELSE 'dishbee' END,
      item.tenant_name,
      item.brand_slug,
      true,
      NULL,
      '{}'::jsonb
    ) INTO brand_id;

    IF item.tenant_slug='cafe1-st-albans' THEN
      PERFORM public.platform_upsert_tenant_location(
        tenant_id,brand_id,'St Albans Crown Court','st-albans-crown-court','Europe/London',
        jsonb_build_object('city','St Albans','country','GB'),'active'
      );
    ELSIF item.tenant_slug='cafe1-luton' THEN
      PERFORM public.platform_upsert_tenant_location(
        tenant_id,brand_id,'Luton Crown Court','luton-crown-court','Europe/London',
        jsonb_build_object('city','Luton','country','GB'),'active'
      );
      PERFORM public.platform_upsert_tenant_location(
        tenant_id,brand_id,'Futures House','futures-house','Europe/London',
        jsonb_build_object('city','Luton','country','GB'),'active'
      );
    END IF;

    result := result || jsonb_build_array(jsonb_build_object(
      'tenantId',tenant_id,
      'tenantName',item.tenant_name,
      'tenantSlug',item.tenant_slug,
      'blueprint',item.blueprint_key
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'organisationId',org_id,
    'organisationSlug','313-brands',
    'landlordProductKey','dishbee',
    'tenants',result
  );
END; $$;
REVOKE ALL ON FUNCTION public.platform_bootstrap_dishbee_pilot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_bootstrap_dishbee_pilot() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_tenant_control_plane(_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN RAISE EXCEPTION 'Tenant access denied'; END IF;
 RETURN jsonb_build_object(
  'tenant',(SELECT to_jsonb(t) FROM public.tenants t WHERE t.id=_tenant),
  'organisation',(SELECT to_jsonb(o) FROM public.organisations o JOIN public.tenants t ON t.organisation_id=o.id WHERE t.id=_tenant),
  'products',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.product_key),'[]'::jsonb) FROM public.tenant_products p WHERE p.tenant_id=_tenant),
  'services',(SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.service_key),'[]'::jsonb) FROM public.tenant_services s WHERE s.tenant_id=_tenant),
  'branding',(SELECT to_jsonb(b) FROM public.tenant_branding b WHERE b.tenant_id=_tenant),
  'brands',(SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.is_primary DESC,b.name),'[]'::jsonb) FROM public.tenant_brands b WHERE b.tenant_id=_tenant),
  'locations',(SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.name),'[]'::jsonb) FROM public.tenant_locations l WHERE l.tenant_id=_tenant),
  'domains',(SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.is_primary DESC,d.domain),'[]'::jsonb) FROM public.tenant_domains d WHERE d.tenant_id=_tenant),
  'connections',(SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.product_key,c.external_tenant_id),'[]'::jsonb) FROM public.product_connections c WHERE c.tenant_id=_tenant),
  'provisioning',(SELECT COALESCE(jsonb_agg(to_jsonb(j) ORDER BY j.created_at DESC),'[]'::jsonb) FROM (SELECT * FROM public.provisioning_jobs WHERE tenant_id=_tenant ORDER BY created_at DESC LIMIT 50) j)
 );
END; $$;
REVOKE ALL ON FUNCTION public.get_tenant_control_plane(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_control_plane(uuid) TO authenticated,service_role;

COMMIT;
