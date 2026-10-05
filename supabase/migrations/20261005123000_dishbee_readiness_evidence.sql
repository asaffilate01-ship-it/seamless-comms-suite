-- Additive correction: a configured connector is not a completed Factory handover.
-- This read-only report never grants production acceptance or activates a tenant.
BEGIN;
CREATE OR REPLACE FUNCTION public.platform_dishbee_family_readiness(_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_tenant public.tenants%rowtype;
  v_dishbee public.product_connections%rowtype;
  v_haccora public.product_connections%rowtype;
  v_plus public.product_connections%rowtype;
  v_attempt public.dishbee_factory_binding_attempts%rowtype;
  v_locations integer:=0;
  v_dishbee_mapped integer:=0;
  v_haccora_mapped integer:=0;
  v_plus_mapped integer:=0;
  v_pending integer:=0;
  v_blocked integer:=0;
  v_failed integer:=0;
  v_blockers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_services jsonb:='{}'::jsonb;
  v_maps jsonb:='[]'::jsonb;
  v_location_ids jsonb:='[]'::jsonb;
  v_binding_ready boolean:=false;
  v_requested_dishbee boolean:=false;
  v_requested_haccora boolean:=false;
  v_requested_plus boolean:=false;
BEGIN
  -- Fail closed even if a membership helper returns NULL for an anonymous JWT.
  IF NOT (coalesce(public.is_platform_admin(auth.uid()),false)
          OR coalesce(public.is_tenant_member(_tenant,auth.uid()),false)) THEN
    RAISE EXCEPTION 'Tenant access denied';
  END IF;
  SELECT * INTO v_tenant FROM public.tenants WHERE id=_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  SELECT * INTO v_dishbee FROM public.product_connections
    WHERE tenant_id=_tenant AND product_key='dishbee'
    ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,updated_at DESC,id LIMIT 1;
  SELECT * INTO v_haccora FROM public.product_connections
    WHERE tenant_id=_tenant AND product_key='haccora'
    ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,updated_at DESC,id LIMIT 1;
  SELECT * INTO v_plus FROM public.product_connections
    WHERE tenant_id=_tenant AND product_key='dishbee-plus'
    ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,updated_at DESC,id LIMIT 1;

  SELECT count(*),coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb)
    INTO v_locations,v_location_ids FROM public.tenant_locations
    WHERE tenant_id=_tenant AND status='active';
  -- Count actual active-location identities, never arbitrary rows or configured links.
  SELECT count(DISTINCT l.id),coalesce(jsonb_agg(jsonb_build_object(
      'dishbeeLocationId',lower(m.external_location_id),'omniqoraLocationId',l.id
    ) ORDER BY l.id),'[]'::jsonb)
    INTO v_dishbee_mapped,v_maps
    FROM public.tenant_locations l JOIN public.product_location_links m
      ON m.tenant_location_id=l.id AND m.tenant_id=l.tenant_id
      AND m.product_connection_id=v_dishbee.id AND m.product_key='dishbee'
      AND m.status='verified'
    WHERE l.tenant_id=_tenant AND l.status='active';
  SELECT count(DISTINCT l.id) INTO v_haccora_mapped
    FROM public.tenant_locations l JOIN public.product_location_links m
      ON m.tenant_location_id=l.id AND m.tenant_id=l.tenant_id
      AND m.product_connection_id=v_haccora.id AND m.product_key='haccora'
      AND m.status='verified'
    WHERE l.tenant_id=_tenant AND l.status='active';
  SELECT count(DISTINCT l.id) INTO v_plus_mapped
    FROM public.tenant_locations l JOIN public.product_location_links m
      ON m.tenant_location_id=l.id AND m.tenant_id=l.tenant_id
      AND m.product_connection_id=v_plus.id AND m.product_key='dishbee-plus'
      AND m.status='verified'
    WHERE l.tenant_id=_tenant AND l.status='active';

  SELECT count(*) FILTER(WHERE status IN('queued','running')),
    count(*) FILTER(WHERE status='blocked'),count(*) FILTER(WHERE status='failed')
    INTO v_pending,v_blocked,v_failed FROM public.provisioning_jobs WHERE tenant_id=_tenant;
  SELECT coalesce(jsonb_object_agg(service_key,status),'{}'::jsonb)
    INTO v_services FROM public.tenant_services WHERE tenant_id=_tenant;
  SELECT EXISTS(SELECT 1 FROM public.tenant_products WHERE tenant_id=_tenant
      AND product_key IN('dishbee','dishbee-one','dishbee-stay','dishbee-hive','dishbee-court-connect','mealdeck')
      AND status IN('requested','provisioning','trial','active'))
    OR EXISTS(SELECT 1 FROM public.tenant_services WHERE tenant_id=_tenant
      AND service_key LIKE 'dishbee.%' AND status IN('requested','provisioning','trial','active'))
    INTO v_requested_dishbee;
  SELECT EXISTS(SELECT 1 FROM public.tenant_products WHERE tenant_id=_tenant AND product_key='haccora'
      AND status IN('requested','provisioning','trial','active'))
    OR EXISTS(SELECT 1 FROM public.tenant_services WHERE tenant_id=_tenant AND service_key LIKE 'haccora.%'
      AND status IN('requested','provisioning','trial','active')) INTO v_requested_haccora;
  SELECT EXISTS(SELECT 1 FROM public.tenant_products WHERE tenant_id=_tenant AND product_key='dishbee-plus'
      AND status IN('requested','provisioning','trial','active'))
    OR EXISTS(SELECT 1 FROM public.tenant_services WHERE tenant_id=_tenant AND service_key LIKE 'dishbee-plus.%'
      AND status IN('requested','provisioning','trial','active')) INTO v_requested_plus;

  IF NOT (v_requested_dishbee OR v_requested_haccora OR v_requested_plus) THEN
    v_blockers:=v_blockers||jsonb_build_array('dishbee_family_not_requested');
  ELSIF v_locations=0 THEN
    v_blockers:=v_blockers||jsonb_build_array('active_tenant_location_required');
  END IF;

  IF v_requested_dishbee THEN
    IF coalesce(v_dishbee.status,'')<>'connected' THEN
      v_blockers:=v_blockers||jsonb_build_array('dishbee_workspace_not_connected');
    END IF;
    IF v_dishbee_mapped<>v_locations OR v_locations=0 THEN
      v_blockers:=v_blockers||jsonb_build_array('dishbee_location_mapping_incomplete');
    END IF;
    IF (SELECT count(*) FROM public.product_connections WHERE tenant_id=_tenant
        AND product_key='dishbee' AND status IN('configured','connected'))>1 THEN
      v_blockers:=v_blockers||jsonb_build_array('dishbee_workspace_selection_ambiguous');
    END IF;
    SELECT * INTO v_attempt FROM public.dishbee_factory_binding_attempts
      WHERE connection_id=v_dishbee.id AND tenant_id=_tenant;
    IF v_attempt.connection_id IS NULL OR v_attempt.state<>'accepted' OR v_attempt.accepted_at IS NULL
       OR v_attempt.external_tenant_id IS DISTINCT FROM v_dishbee.external_tenant_id
       OR v_attempt.receipt->'bindingComplete' IS DISTINCT FROM 'true'::jsonb
       OR v_attempt.receipt->'productionAccepted' IS DISTINCT FROM 'false'::jsonb THEN
      v_blockers:=v_blockers||jsonb_build_array('dishbee_binding_receipt_required');
    ELSE
      IF v_attempt.location_mappings IS DISTINCT FROM v_maps
         OR jsonb_array_length(v_maps)<>v_locations OR v_locations=0 THEN
        v_blockers:=v_blockers||jsonb_build_array('dishbee_binding_locations_changed');
      END IF;
      IF v_dishbee.credential_hash IS DISTINCT FROM v_attempt.control_plane_hash
         OR v_dishbee.credential_suffix IS DISTINCT FROM v_attempt.control_plane_suffix
         OR v_dishbee.credential_expires_at IS NULL OR v_dishbee.credential_expires_at<=now() THEN
        v_blockers:=v_blockers||jsonb_build_array('dishbee_control_plane_credential_invalid');
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.platform_service_credentials c
          WHERE c.id=v_attempt.runtime_credential_id AND c.key_id=v_attempt.runtime_key_id
          AND c.status='active' AND c.expires_at>now()
          AND c.scopes=jsonb_build_array(jsonb_build_object(
            'tenantId',_tenant,'productKey','dishbee','locationIds',v_location_ids,
            'capabilities',jsonb_build_array('orders.consume','orders.ack','events.write','usage.write','crm.write')
          ))) THEN
        v_blockers:=v_blockers||jsonb_build_array('dishbee_runtime_credential_or_scope_invalid');
      END IF;
      v_binding_ready:=NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_blockers) b
        WHERE b LIKE 'dishbee_%');
    END IF;
  END IF;
  IF v_requested_haccora THEN
    IF coalesce(v_haccora.status,'')<>'connected' THEN
      v_blockers:=v_blockers||jsonb_build_array('haccora_workspace_not_connected');
    END IF;
    IF v_haccora_mapped<>v_locations OR v_locations=0 THEN
      v_blockers:=v_blockers||jsonb_build_array('haccora_location_mapping_incomplete');
    END IF;
  END IF;
  IF v_requested_plus THEN
    IF coalesce(v_plus.status,'')<>'connected' THEN
      v_blockers:=v_blockers||jsonb_build_array('dishbee_plus_workspace_not_connected');
    END IF;
    IF v_plus_mapped<>v_locations OR v_locations=0 THEN
      v_blockers:=v_blockers||jsonb_build_array('dishbee_plus_location_mapping_incomplete');
    END IF;
  END IF;
  IF v_blocked>0 THEN v_blockers:=v_blockers||jsonb_build_array('provisioning_jobs_blocked'); END IF;
  IF v_failed>0 THEN v_blockers:=v_blockers||jsonb_build_array('provisioning_jobs_failed'); END IF;
  IF v_pending>0 THEN
    v_blockers:=v_blockers||jsonb_build_array('provisioning_jobs_pending');
    v_warnings:=v_warnings||jsonb_build_array('provisioning_jobs_pending');
  END IF;

  RETURN jsonb_build_object(
    'tenant',jsonb_build_object('id',v_tenant.id,'name',v_tenant.name,'slug',v_tenant.slug,
      'countryCode',v_tenant.country_code,'status',v_tenant.status),
    'factoryReady',jsonb_array_length(v_blockers)=0,
    'productionAccepted',false,
    'productionAcceptanceNote','Factory readiness verifies registration, current scoped credentials and active location bindings only. Source import, authenticated isolation, payments, KDS, enabled connectors and rollback still require deployed acceptance.',
    'blockers',v_blockers,'warnings',v_warnings,
    'locations',jsonb_build_object('active',v_locations,'dishbeeMapped',v_dishbee_mapped,
      'haccoraMapped',v_haccora_mapped,'dishbeePlusMapped',v_plus_mapped),
    'connections',jsonb_build_object(
      'dishbee',CASE WHEN v_dishbee.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',v_dishbee.id,'status',v_dishbee.status,'externalTenantId',v_dishbee.external_tenant_id,
        'baseUrl',v_dishbee.base_url,'lastVerifiedAt',v_dishbee.last_verified_at,
        'bindingReady',v_binding_ready,'bindingStage',CASE WHEN v_binding_ready THEN 'bound_awaiting_acceptance' ELSE 'blocked' END,
        'bindingAcceptedAt',v_attempt.accepted_at) END,
      'haccora',CASE WHEN v_haccora.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',v_haccora.id,'status',v_haccora.status,'externalTenantId',v_haccora.external_tenant_id,
        'baseUrl',v_haccora.base_url,'lastVerifiedAt',v_haccora.last_verified_at,
        'runtimeBound',coalesce(v_haccora.metadata->'dishbeeRuntimeBound'='true'::jsonb,false)) END,
      'dishbeePlus',CASE WHEN v_plus.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id',v_plus.id,'status',v_plus.status,'externalTenantId',v_plus.external_tenant_id,
        'baseUrl',v_plus.base_url,'lastVerifiedAt',v_plus.last_verified_at) END),
    'products',coalesce((SELECT jsonb_object_agg(product_key,jsonb_build_object(
        'status',status,'externalTenantId',external_tenant_id,'baseUrl',base_url,'planKey',plan_key,'config',config))
      FROM public.tenant_products WHERE tenant_id=_tenant
      AND product_key IN('dishbee','dishbee-one','dishbee-plus','dishbee-stay','dishbee-hive','dishbee-court-connect','haccora','mealdeck')),'{}'::jsonb),
    'modules',jsonb_build_object(
      'one',jsonb_build_object('one',coalesce(v_services->>'dishbee.one','not_requested'),'epos',coalesce(v_services->>'dishbee.epos','not_requested'),'kds',coalesce(v_services->>'dishbee.kds','not_requested')),
      'hive',jsonb_build_object('core',coalesce(v_services->>'dishbee.hive','not_requested'),'kiosk',coalesce(v_services->>'dishbee.hive-kiosk','not_requested')),
      'plus',jsonb_build_object('subscription',coalesce(v_services->>'dishbee-plus.subscription','not_requested')),
      'buzz',jsonb_build_object('essentials',coalesce(v_services->>'dishbee.buzz','not_requested'),'growth',coalesce(v_services->>'dishbee.buzz.growth','not_requested'),'pro',coalesce(v_services->>'dishbee.buzz.pro','not_requested'),'voice',coalesce(v_services->>'dishbee.buzz.voice','not_requested')),
      'stay',jsonb_build_object('connect',coalesce(v_services->>'dishbee.stay.connect','not_requested'),'standard',coalesce(v_services->>'dishbee.stay','not_requested')),
      'court',jsonb_build_object('pack',coalesce(v_services->>'dishbee.court-pack','not_requested'),'connect',coalesce(v_services->>'dishbee.court-connect','not_requested')),
      'haccora',jsonb_build_object('core',coalesce(v_services->>'haccora.core','not_requested'),'dishbeeSync',coalesce(v_services->>'haccora.dishbee-sync','not_requested'),'aiCopilot',coalesce(v_services->>'haccora.ai-copilot','not_requested')),
      'shared',jsonb_build_object('payments',coalesce(v_services->>'omniqora.payments','not_requested'),'marketplace',coalesce(v_services->>'omniqora.marketplace','not_requested'),'deliveryBroker',coalesce(v_services->>'omniqora.delivery-broker','not_requested'),'integrationHub',coalesce(v_services->>'omniqora.integration-hub','not_requested'),'ai',coalesce(v_services->>'omniqora.ai','not_requested'),'analytics',coalesce(v_services->>'omniqora.analytics','not_requested'))),
    'provisioning',jsonb_build_object('pending',v_pending,'blocked',v_blocked,'failed',v_failed,
      'recent',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'targetKind',target_kind,'targetKey',target_key,
        'action',action,'status',status,'lastError',last_error,'createdAt',created_at) ORDER BY created_at DESC)
        FROM (SELECT * FROM public.provisioning_jobs WHERE tenant_id=_tenant ORDER BY created_at DESC LIMIT 20) j),'[]'::jsonb)),
    'externalProviders',coalesce((SELECT jsonb_agg(jsonb_build_object('providerKey',provider_key,'name',display_name,
      'family',provider_family,'status',status,'mode',integration_mode,'countries',countries) ORDER BY provider_family,provider_key)
      FROM public.integration_provider_catalogue WHERE provider_key IN('uber_eats','deliveroo','just_eat','uber_direct','deliveroo_express','jet_go','stuart','deliverect','otter','urbanpiper','opera_cloud','mews','cloudbeds','guestline')),'[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_dishbee_family_readiness(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_dishbee_family_readiness(uuid) TO authenticated,service_role;
COMMIT;
