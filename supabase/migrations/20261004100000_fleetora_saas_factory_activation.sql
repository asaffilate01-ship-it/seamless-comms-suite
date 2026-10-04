-- Fleetora landlord + FleetPulse UAE experience activation.
-- Vertical operational data remains in FleetPulse; Omniqora owns the catalogue,
-- entitlements, white-label hierarchy, provider routing and migration evidence.
BEGIN;

INSERT INTO public.product_catalogue(
  product_key,name,description,category,deployment_mode,status,product_role,parent_product_key,implementation_status,metadata
) VALUES
  ('fleetora','Fleetora','Reusable fleet, 3PL and delivery operations landlord.','logistics','hybrid','active','landlord',NULL,'built_main',
    jsonb_build_object('dataPlane','external','controlPlane','omniqora','canonicalSourceProduct','fleetpulse')),
  ('fleetpulse-uae','FleetPulse UAE','UAE market and brand experience for the Fleetora landlord.','logistics','external','active','experience','fleetora','external_product',
    jsonb_build_object('countryCode','AE','currency','AED','locale','en-AE','timezone','Asia/Dubai'))
ON CONFLICT(product_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,
  deployment_mode=EXCLUDED.deployment_mode,status=EXCLUDED.status,
  product_role=EXCLUDED.product_role,parent_product_key=EXCLUDED.parent_product_key,
  implementation_status=EXCLUDED.implementation_status,metadata=EXCLUDED.metadata,updated_at=now();

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata) VALUES
  ('fleetora','omniqora.identity',true,true,'{}'),
  ('fleetora','omniqora.geo',true,true,'{}'),
  ('fleetora','omniqora.dispatch',true,true,'{}'),
  ('fleetora','omniqora.fleet',true,true,'{}'),
  ('fleetora','omniqora.tracking',true,true,'{}'),
  ('fleetora','omniqora.agent',true,false,'{}'),
  ('fleetora','omniqora.connect',true,false,'{}'),
  ('fleetora','omniqora.analytics',true,false,'{}'),
  ('fleetora','omniqora.ai',false,false,'{}'),
  ('fleetora','omniqora.crm',false,false,'{}'),
  ('fleetpulse-uae','omniqora.geo',true,true,'{}'),
  ('fleetpulse-uae','omniqora.dispatch',true,true,'{}'),
  ('fleetpulse-uae','omniqora.fleet',true,true,'{}'),
  ('fleetpulse-uae','omniqora.tracking',true,true,'{}'),
  ('fleetpulse-uae','omniqora.connect',true,false,'{}'),
  ('fleetpulse-uae','omniqora.analytics',true,false,'{}')
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required,metadata=EXCLUDED.metadata;

CREATE TABLE IF NOT EXISTS public.landlord_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_key text NOT NULL UNIQUE CHECK(instance_key ~ '^[a-z0-9][a-z0-9-]{1,99}$'),
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  owner_organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  region_key text NOT NULL REFERENCES public.region_packs(region_key) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','suspended','retired')),
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,product_key)
);

CREATE TABLE IF NOT EXISTS public.landlord_instance_tenants (
  landlord_instance_id uuid NOT NULL REFERENCES public.landlord_instances(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  variant_product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'provisioning' CHECK(status IN ('provisioning','active','suspended','migrating','failed')),
  migration_mode text NOT NULL DEFAULT 'shadow' CHECK(migration_mode IN ('disabled','shadow','read','write')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(landlord_instance_id,tenant_id),
  UNIQUE(tenant_id,variant_product_key)
);

CREATE TABLE IF NOT EXISTS public.routing_shadow_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  source_route_id text NOT NULL,
  candidate_engine text NOT NULL DEFAULT 'omniqora.native-routing.v1',
  source_distance_km numeric(12,3),
  candidate_distance_km numeric(12,3),
  stop_count integer NOT NULL CHECK(stop_count >= 0),
  sequence_match_ratio numeric(7,6) CHECK(sequence_match_ratio BETWEEN 0 AND 1),
  passed boolean NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,source_route_id,candidate_engine)
);

ALTER TABLE public.landlord_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landlord_instance_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_shadow_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.landlord_instances,public.landlord_instance_tenants,public.routing_shadow_evaluations FROM anon,authenticated;
GRANT ALL ON public.landlord_instances,public.landlord_instance_tenants,public.routing_shadow_evaluations TO service_role;
GRANT SELECT ON public.landlord_instances,public.landlord_instance_tenants,public.routing_shadow_evaluations TO authenticated;

CREATE POLICY "landlord instances scoped read" ON public.landlord_instances FOR SELECT TO authenticated USING(
  public.is_platform_admin(auth.uid()) OR public.is_organisation_member(owner_organisation_id,auth.uid())
);
CREATE POLICY "landlord tenant bindings scoped read" ON public.landlord_instance_tenants FOR SELECT TO authenticated USING(
  public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()) OR EXISTS(
    SELECT 1 FROM public.landlord_instances li
    WHERE li.id=landlord_instance_id AND public.is_organisation_member(li.owner_organisation_id,auth.uid())
  )
);
CREATE POLICY "routing shadow scoped read" ON public.routing_shadow_evaluations FOR SELECT TO authenticated USING(
  public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid())
);

INSERT INTO public.tenant_blueprints(blueprint_key,name,description,country_code,category,status,metadata) VALUES
  ('fleetpulse-ae-starter','FleetPulse UAE Starter','Fleet, dispatch, routing and customer tracking for a UAE tenant.','AE','logistics','active',
    jsonb_build_object('landlordProductKey','fleetora','variantProductKey','fleetpulse-uae','migrationMode','shadow')),
  ('fleetpulse-ae-growth','FleetPulse UAE Growth','Starter services plus agent, communications and analytics.','AE','logistics','active',
    jsonb_build_object('landlordProductKey','fleetora','variantProductKey','fleetpulse-uae','migrationMode','shadow')),
  ('fleetora-white-label-landlord','Fleetora White-label Landlord','Reusable partner landlord with tenant branding and domain isolation.',NULL,'logistics-landlord','active',
    jsonb_build_object('landlordProductKey','fleetora','allowsVariants',true,'defaultMigrationMode','shadow'))
ON CONFLICT(blueprint_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,country_code=EXCLUDED.country_code,
  category=EXCLUDED.category,status=EXCLUDED.status,metadata=EXCLUDED.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config) VALUES
  ('fleetpulse-ae-starter','fleetpulse-uae',true,jsonb_build_object('landlordProductKey','fleetora')),
  ('fleetpulse-ae-growth','fleetpulse-uae',true,jsonb_build_object('landlordProductKey','fleetora')),
  ('fleetora-white-label-landlord','fleetora',true,jsonb_build_object('whiteLabel',true))
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
  ('fleetpulse-ae-starter','omniqora.geo',true,'{}'),
  ('fleetpulse-ae-starter','omniqora.dispatch',true,jsonb_build_object('routingMode','shadow')),
  ('fleetpulse-ae-starter','omniqora.fleet',true,'{}'),
  ('fleetpulse-ae-starter','omniqora.tracking',true,'{}'),
  ('fleetpulse-ae-growth','omniqora.geo',true,'{}'),
  ('fleetpulse-ae-growth','omniqora.dispatch',true,jsonb_build_object('routingMode','shadow')),
  ('fleetpulse-ae-growth','omniqora.fleet',true,'{}'),
  ('fleetpulse-ae-growth','omniqora.tracking',true,'{}'),
  ('fleetpulse-ae-growth','omniqora.agent',false,'{}'),
  ('fleetpulse-ae-growth','omniqora.connect',false,'{}'),
  ('fleetpulse-ae-growth','omniqora.analytics',false,'{}'),
  ('fleetora-white-label-landlord','omniqora.identity',true,'{}'),
  ('fleetora-white-label-landlord','omniqora.geo',true,'{}'),
  ('fleetora-white-label-landlord','omniqora.dispatch',true,'{}'),
  ('fleetora-white-label-landlord','omniqora.fleet',true,'{}'),
  ('fleetora-white-label-landlord','omniqora.tracking',true,'{}')
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

CREATE OR REPLACE FUNCTION public.platform_create_landlord_instance(
  _instance_key text,_product text,_organisation uuid,_name text,_region text,
  _branding jsonb DEFAULT '{}'::jsonb,_policy jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) AND NOT EXISTS(
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id=_organisation AND user_id=auth.uid() AND role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'Landlord instance access denied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key=_product AND product_role='landlord') THEN
    RAISE EXCEPTION 'Landlord product required';
  END IF;
  INSERT INTO public.landlord_instances(instance_key,product_key,owner_organisation_id,name,region_key,status,branding,policy)
  VALUES(_instance_key,_product,_organisation,_name,_region,'draft',COALESCE(_branding,'{}'),COALESCE(_policy,'{}'))
  ON CONFLICT(instance_key) DO UPDATE SET
    name=EXCLUDED.name,branding=EXCLUDED.branding,policy=EXCLUDED.policy,updated_at=now()
  WHERE public.landlord_instances.product_key=EXCLUDED.product_key
    AND public.landlord_instances.owner_organisation_id=EXCLUDED.owner_organisation_id
  RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Landlord instance key belongs to another owner or product'; END IF;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_create_landlord_instance(text,text,uuid,text,text,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_create_landlord_instance(text,text,uuid,text,text,jsonb,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_bind_fleetora_tenant(
  _landlord_instance uuid,_tenant uuid,_variant text,_external_tenant_id text,
  _base_url text,_brand_name text,_brand_slug text,_blueprint text DEFAULT 'fleetpulse-ae-starter'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE instance public.landlord_instances%rowtype; connection_id uuid; brand_id uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  SELECT * INTO instance FROM public.landlord_instances WHERE id=_landlord_instance;
  IF NOT FOUND OR instance.product_key<>'fleetora' THEN RAISE EXCEPTION 'Fleetora landlord instance required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key=_variant AND parent_product_key='fleetora') THEN
    RAISE EXCEPTION 'Fleetora experience variant required';
  END IF;
  PERFORM public.platform_apply_blueprint(_tenant,_blueprint);
  PERFORM public.platform_set_tenant_product_runtime(_tenant,_variant,'ae','en-AE',
    jsonb_build_object('landlordInstanceId',_landlord_instance,'migrationMode','shadow'));
  SELECT public.platform_link_product(_tenant,_variant,_external_tenant_id,_base_url,
    ARRAY['tenant.snapshot','events.write','usage.write','routing.shadow']) INTO connection_id;
  SELECT public.platform_upsert_tenant_brand(_tenant,_variant,_brand_name,_brand_slug,true,NULL,
    COALESCE(instance.branding,'{}')) INTO brand_id;
  PERFORM public.platform_set_branding(_tenant,
    COALESCE(instance.branding,'{}') || jsonb_build_object('brandName',_brand_name,
      'metadata',jsonb_build_object('landlordInstanceId',_landlord_instance,'variantProductKey',_variant)));
  INSERT INTO public.landlord_instance_tenants(landlord_instance_id,tenant_id,variant_product_key,status,migration_mode,config)
  VALUES(_landlord_instance,_tenant,_variant,'migrating','shadow',jsonb_build_object('externalTenantId',_external_tenant_id))
  ON CONFLICT(landlord_instance_id,tenant_id) DO UPDATE SET
    variant_product_key=EXCLUDED.variant_product_key,status='migrating',migration_mode='shadow',
    config=EXCLUDED.config,updated_at=now();
  RETURN jsonb_build_object('landlordInstanceId',_landlord_instance,'tenantId',_tenant,
    'variantProductKey',_variant,'connectionId',connection_id,'brandId',brand_id,'migrationMode','shadow');
END; $$;
REVOKE ALL ON FUNCTION public.platform_bind_fleetora_tenant(uuid,uuid,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_bind_fleetora_tenant(uuid,uuid,text,text,text,text,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_fleetora_migration_readiness(_tenant uuid,_product text DEFAULT 'fleetpulse-uae')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE base jsonb; binding public.landlord_instance_tenants%rowtype; passed_count integer; failed_count integer;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Tenant access denied';
  END IF;
  SELECT public.get_tenant_product_readiness(_tenant,_product) INTO base;
  SELECT * INTO binding FROM public.landlord_instance_tenants
   WHERE tenant_id=_tenant AND variant_product_key=_product;
  SELECT count(*) FILTER(WHERE passed),count(*) FILTER(WHERE NOT passed)
    INTO passed_count,failed_count FROM public.routing_shadow_evaluations
   WHERE tenant_id=_tenant AND product_key=_product;
  RETURN base || jsonb_build_object(
    'landlordBound',binding.landlord_instance_id IS NOT NULL,
    'migrationMode',COALESCE(binding.migration_mode,'disabled'),
    'shadowPassed',COALESCE(passed_count,0),
    'shadowFailed',COALESCE(failed_count,0),
    'writeCutoverEligible',COALESCE((base->>'ready')::boolean,false)
      AND binding.landlord_instance_id IS NOT NULL AND COALESCE(passed_count,0)>=10 AND COALESCE(failed_count,0)=0
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_fleetora_migration_readiness(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_fleetora_migration_readiness(uuid,text) TO authenticated,service_role;

COMMIT;
