BEGIN;

CREATE OR REPLACE FUNCTION public.platform_enable_haccora_for_dishbee(
  _tenant uuid,
  _enable_ai boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  tenant_row public.tenants%rowtype;
  service_key text;
  requested_services text[] := ARRAY[
    'haccora.core',
    'haccora.haccp',
    'haccora.allergens',
    'haccora.evidence',
    'haccora.traceability',
    'haccora.training',
    'haccora.inspections',
    'haccora.analytics',
    'haccora.dishbee-sync'
  ]::text[];
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;

  SELECT * INTO tenant_row
  FROM public.tenants
  WHERE id=_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF tenant_row.country_code NOT IN ('GB','DE') THEN
    RAISE EXCEPTION 'Haccora country pack unavailable for tenant country %', tenant_row.country_code;
  END IF;

  IF NOT EXISTS(
    SELECT 1
    FROM public.tenant_products
    WHERE tenant_id=_tenant
      AND product_key='dishbee'
      AND status NOT IN ('failed','cancelled')
  ) THEN
    RAISE EXCEPTION 'Dishbee product required before enabling Haccora add-on';
  END IF;

  INSERT INTO public.tenant_products(
    tenant_id,product_key,status,config
  ) VALUES(
    _tenant,
    'haccora',
    'requested',
    jsonb_build_object(
      'mode','dishbee-addon',
      'countryPack',tenant_row.country_code,
      'locale',CASE WHEN tenant_row.country_code='DE' THEN 'de-DE' ELSE 'en-GB' END
    )
  )
  ON CONFLICT(tenant_id,product_key) DO UPDATE SET
    status=CASE
      WHEN public.tenant_products.status IN ('active','provisioning') THEN public.tenant_products.status
      ELSE 'requested'
    END,
    config=public.tenant_products.config || EXCLUDED.config,
    updated_at=now();

  PERFORM public.queue_provisioning(
    _tenant,
    'product',
    'haccora',
    'provision',
    jsonb_build_object(
      'mode','dishbee-addon',
      'countryPack',tenant_row.country_code,
      'requiredByService','haccora.dishbee-sync'
    )
  );

  IF _enable_ai THEN
    requested_services := requested_services || ARRAY[
      'haccora.ai-copilot',
      'haccora.document-ai',
      'haccora.rag',
      'haccora.graphrag',
      'haccora.regulatory-intelligence'
    ]::text[];
  END IF;

  FOREACH service_key IN ARRAY requested_services LOOP
    PERFORM public.apply_service_with_dependencies(_tenant,service_key,'manual');

    PERFORM public.queue_provisioning(
      _tenant,
      'service',
      service_key,
      'provision',
      jsonb_build_object(
        'surface','dishbee',
        'countryPack',tenant_row.country_code,
        'mode','dishbee-addon'
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'tenantId',_tenant,
    'tenantSlug',tenant_row.slug,
    'countryPack',tenant_row.country_code,
    'product','haccora',
    'mode','dishbee-addon',
    'aiEnabled',_enable_ai,
    'requestedServices',requested_services
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_enable_haccora_for_dishbee(uuid,boolean)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_enable_haccora_for_dishbee(uuid,boolean)
TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_enable_haccora_dishbee_pilot(
  _enable_ai boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  tenant_slug text;
  tenant_id uuid;
  tenant_result jsonb;
  results jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;

  FOREACH tenant_slug IN ARRAY ARRAY[
    'cafe1-luton',
    'cafe1-st-albans',
    'mealdeck'
  ]::text[] LOOP
    SELECT id INTO tenant_id
    FROM public.tenants
    WHERE slug=tenant_slug;

    IF tenant_id IS NULL THEN
      RAISE EXCEPTION 'Pilot tenant % is missing; run platform_bootstrap_dishbee_pilot first', tenant_slug;
    END IF;

    tenant_result := public.platform_enable_haccora_for_dishbee(tenant_id,_enable_ai);
    results := results || jsonb_build_array(tenant_result);
  END LOOP;

  RETURN jsonb_build_object(
    'pilot','313-brands-haccora',
    'aiEnabled',_enable_ai,
    'tenants',results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_enable_haccora_dishbee_pilot(boolean)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_enable_haccora_dishbee_pilot(boolean)
TO authenticated,service_role;

COMMIT;
