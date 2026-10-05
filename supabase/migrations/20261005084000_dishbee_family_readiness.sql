BEGIN;

CREATE OR REPLACE FUNCTION public.platform_dishbee_family_readiness(_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  v_tenant public.tenants%rowtype;
  v_dishbee public.product_connections%rowtype;
  v_haccora public.product_connections%rowtype;
  v_plus public.product_connections%rowtype;
  v_locations integer:=0;
  v_dishbee_mapped integer:=0;
  v_haccora_mapped integer:=0;
  v_plus_mapped integer:=0;
  v_pending integer:=0;
  v_blocked integer:=0;
  v_failed integer:=0;
  v_blockers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_requested_dishbee boolean:=false;
  v_requested_haccora boolean:=false;
  v_requested_plus boolean:=false;
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Tenant access denied';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id=_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  SELECT * INTO v_dishbee FROM public.product_connections
  WHERE tenant_id=_tenant AND product_key='dishbee'
  ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,updated_at DESC LIMIT 1;

  SELECT * INTO v_haccora FROM public.product_connections
  WHERE tenant_id=_tenant AND product_key='haccora'
  ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,updated_at DESC LIMIT 1;

  SELECT * INTO v_plus FROM public.product_connections
  WHERE tenant_id=_tenant AND product_key='dishbee-plus'
  ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,updated_at DESC LIMIT 1;

  SELECT count(*) INTO v_locations
  FROM public.tenant_locations WHERE tenant_id=_tenant AND status='active';

  IF v_dishbee.id IS NOT NULL THEN
    SELECT count(*) INTO v_dishbee_mapped
    FROM public.product_location_links
    WHERE tenant_id=_tenant AND product_connection_id=v_dishbee.id
      AND status IN('configured','verified');
  END IF;
  IF v_haccora.id IS NOT NULL THEN
    SELECT count(*) INTO v_haccora_mapped
    FROM public.product_location_links
    WHERE tenant_id=_tenant AND product_connection_id=v_haccora.id
      AND status IN('configured','verified');
  END IF;
  IF v_plus.id IS NOT NULL THEN
    SELECT count(*) INTO v_plus_mapped
    FROM public.product_location_links
    WHERE tenant_id=_tenant AND product_connection_id=v_plus.id
      AND status IN('configured','verified');
  END IF;

  SELECT
    count(*) FILTER(WHERE status IN('queued','running')),
    count(*) FILTER(WHERE status='blocked'),
    count(*) FILTER(WHERE status='failed')
  INTO v_pending,v_blocked,v_failed
  FROM public.provisioning_jobs
  WHERE tenant_id=_tenant;

  SELECT EXISTS(
    SELECT 1 FROM public.tenant_products
    WHERE tenant_id=_tenant
      AND product_key IN('dishbee','dishbee-one','dishbee-stay')
      AND status IN('requested','provisioning','active')
  ) OR EXISTS(
    SELECT 1 FROM public.tenant_services
    WHERE tenant_id=_tenant
      AND (
        service_key LIKE 'dishbee.%'
        OR service_key='dishbee.one'
      )
      AND service_key NOT LIKE 'dishbee-plus.%'
      AND status IN('requested','provisioning','trial','active')
  ) INTO v_requested_dishbee;

  SELECT EXISTS(
    SELECT 1 FROM public.tenant_products
    WHERE tenant_id=_tenant AND product_key='haccora'
      AND status IN('requested','provisioning','active')
  ) OR EXISTS(
    SELECT 1 FROM public.tenant_services
    WHERE tenant_id=_tenant AND service_key LIKE 'haccora.%'
      AND status IN('requested','provisioning','trial','active')
  ) INTO v_requested_haccora;

  SELECT EXISTS(
    SELECT 1 FROM public.tenant_products
    WHERE tenant_id=_tenant AND product_key='dishbee-plus'
      AND status IN('requested','provisioning','active')
  ) OR EXISTS(
    SELECT 1 FROM public.tenant_services
    WHERE tenant_id=_tenant AND service_key LIKE 'dishbee-plus.%'
      AND status IN('requested','provisioning','trial','active')
  ) INTO v_requested_plus;

  IF v_requested_dishbee AND COALESCE(v_dishbee.status,'')<>'connected' THEN
    v_blockers:=v_blockers||jsonb_build_array('dishbee_workspace_not_connected');
  END IF;
  IF v_requested_dishbee AND v_locations>0 AND v_dishbee_mapped<v_locations THEN
    v_blockers:=v_blockers||jsonb_build_array('dishbee_location_mapping_incomplete');
  END IF;
  IF v_requested_haccora AND COALESCE(v_haccora.status,'')<>'connected' THEN
    v_blockers:=v_blockers||jsonb_build_array('haccora_workspace_not_connected');
  END IF;
  IF v_requested_haccora AND v_locations>0 AND v_haccora_mapped<v_locations THEN
    v_blockers:=v_blockers||jsonb_build_array('haccora_location_mapping_incomplete');
  END IF;
  IF v_requested_plus AND COALESCE(v_plus.status,'')<>'connected' THEN
    v_blockers:=v_blockers||jsonb_build_array('dishbee_plus_workspace_not_connected');
  END IF;
  IF v_requested_plus AND v_locations>0 AND v_plus.id IS NOT NULL AND v_plus_mapped<v_locations THEN
    v_warnings:=v_warnings||jsonb_build_array('dishbee_plus_location_mapping_incomplete');
  END IF;
  IF v_blocked>0 THEN v_blockers:=v_blockers||jsonb_build_array('provisioning_jobs_blocked'); END IF;
  IF v_failed>0 THEN v_blockers:=v_blockers||jsonb_build_array('provisioning_jobs_failed'); END IF;
  IF v_pending>0 THEN v_warnings:=v_warnings||jsonb_build_array('provisioning_jobs_pending'); END IF;

  RETURN jsonb_build_object(
    'tenant',jsonb_build_object(
      'id',v_tenant.id,'name',v_tenant.name,'slug',v_tenant.slug,
      'countryCode',v_tenant.country_code,'status',v_tenant.status
    ),
    'factoryReady',jsonb_array_length(v_blockers)=0,
    'productionAccepted',false,
    'productionAcceptanceNote',
      'Factory readiness proves product/service wiring only. Live provider credentials, external approvals, payment/PMS acceptance and product release gates remain separate.',
    'blockers',v_blockers,
    'warnings',v_warnings,
    'locations',jsonb_build_object(
      'active',v_locations,
      'dishbeeMapped',v_dishbee_mapped,
      'haccoraMapped',v_haccora_mapped,
      'dishbeePlusMapped',v_plus_mapped
    ),
    'connections',jsonb_build_object(
      'dishbee',case when v_dishbee.id is null then null else jsonb_build_object(
        'id',v_dishbee.id,'status',v_dishbee.status,'externalTenantId',v_dishbee.external_tenant_id,
        'baseUrl',v_dishbee.base_url,'lastVerifiedAt',v_dishbee.last_verified_at
      ) end,
      'haccora',case when v_haccora.id is null then null else jsonb_build_object(
        'id',v_haccora.id,'status',v_haccora.status,'externalTenantId',v_haccora.external_tenant_id,
        'baseUrl',v_haccora.base_url,'lastVerifiedAt',v_haccora.last_verified_at,
        'runtimeBound',coalesce((v_haccora.metadata->>'dishbeeRuntimeBound')::boolean,false)
      ) end,
      'dishbeePlus',case when v_plus.id is null then null else jsonb_build_object(
        'id',v_plus.id,'status',v_plus.status,'externalTenantId',v_plus.external_tenant_id,
        'baseUrl',v_plus.base_url,'lastVerifiedAt',v_plus.last_verified_at
      ) end
    ),
    'products',coalesce((
      select jsonb_object_agg(product_key,jsonb_build_object(
        'status',status,'externalTenantId',external_tenant_id,'baseUrl',base_url,
        'planKey',plan_key,'config',config
      ))
      from public.tenant_products
      where tenant_id=_tenant
        and product_key in('dishbee','dishbee-one','dishbee-plus','dishbee-stay','haccora','mealdeck')
    ),'{}'::jsonb),
    'modules',jsonb_build_object(
      'one',jsonb_build_object(
        'one',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.one'),'not_requested'),
        'epos',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.epos'),'not_requested'),
        'kds',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.kds'),'not_requested')
      ),
      'hive',jsonb_build_object(
        'core',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.hive'),'not_requested'),
        'kiosk',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.hive-kiosk'),'not_requested')
      ),
      'plus',jsonb_build_object(
        'subscription',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee-plus.subscription'),'not_requested')
      ),
      'buzz',jsonb_build_object(
        'essentials',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.buzz'),'not_requested'),
        'growth',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.buzz.growth'),'not_requested'),
        'pro',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.buzz.pro'),'not_requested'),
        'voice',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.buzz.voice'),'not_requested')
      ),
      'stay',jsonb_build_object(
        'connect',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.stay.connect'),'not_requested'),
        'standard',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.stay'),'not_requested')
      ),
      'court',jsonb_build_object(
        'pack',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.court-pack'),'not_requested'),
        'connect',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='dishbee.court-connect'),'not_requested')
      ),
      'haccora',jsonb_build_object(
        'core',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='haccora.core'),'not_requested'),
        'dishbeeSync',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='haccora.dishbee-sync'),'not_requested'),
        'aiCopilot',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='haccora.ai-copilot'),'not_requested')
      ),
      'shared',jsonb_build_object(
        'payments',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='omniqora.payments'),'not_requested'),
        'marketplace',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='omniqora.marketplace'),'not_requested'),
        'deliveryBroker',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='omniqora.delivery-broker'),'not_requested'),
        'integrationHub',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='omniqora.integration-hub'),'not_requested'),
        'ai',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='omniqora.ai'),'not_requested'),
        'analytics',coalesce((select status from public.tenant_services where tenant_id=_tenant and service_key='omniqora.analytics'),'not_requested')
      )
    ),
    'provisioning',jsonb_build_object(
      'pending',v_pending,'blocked',v_blocked,'failed',v_failed,
      'recent',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',id,'targetKind',target_kind,'targetKey',target_key,
          'action',action,'status',status,'lastError',last_error,'createdAt',created_at
        ) order by created_at desc)
        from(
          select * from public.provisioning_jobs
          where tenant_id=_tenant order by created_at desc limit 20
        ) j
      ),'[]'::jsonb)
    ),
    'externalProviders',coalesce((
      select jsonb_agg(jsonb_build_object(
        'providerKey',provider_key,'name',display_name,'family',provider_family,
        'status',status,'mode',integration_mode,'countries',countries
      ) order by provider_family,provider_key)
      from public.integration_provider_catalogue
      where provider_key in(
        'uber_eats','deliveroo','just_eat',
        'uber_direct','deliveroo_express','jet_go','stuart',
        'deliverect','otter','urbanpiper',
        'opera_cloud','mews','cloudbeds','guestline'
      )
    ),'[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_dishbee_family_readiness(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_dishbee_family_readiness(uuid)
TO authenticated,service_role;

COMMIT;
