-- Durable, hash-only onboarding attempts. Never activate a Dishbee storefront here.
BEGIN;
CREATE TABLE public.dishbee_factory_binding_attempts (
 connection_id uuid PRIMARY KEY REFERENCES public.product_connections(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 external_tenant_id text NOT NULL,
 provisioning_job_id uuid NOT NULL REFERENCES public.provisioning_jobs(id),
 control_plane_hash text NOT NULL CHECK(control_plane_hash ~ '^[a-f0-9]{64}$'),
 control_plane_suffix text NOT NULL,
 runtime_key_id text NOT NULL UNIQUE,
 runtime_credential_id uuid NOT NULL REFERENCES public.platform_service_credentials(id),
 location_mappings jsonb NOT NULL CHECK(jsonb_typeof(location_mappings)='array'),
 state text NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','accepted')),
 receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 accepted_at timestamptz
);
ALTER TABLE public.dishbee_factory_binding_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dishbee_factory_binding_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.dishbee_factory_binding_attempts TO service_role;

CREATE FUNCTION public.server_prepare_dishbee_factory_binding(
 _connection uuid,_job uuid,_control_plane_hash text,_control_plane_suffix text,
 _runtime_key_id text,_runtime_hash text,_runtime_suffix text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.product_connections%rowtype; v_count integer; v_maps jsonb; v_locations uuid[]; v_runtime uuid;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
 SELECT * INTO c FROM public.product_connections WHERE id=_connection FOR UPDATE;
 IF NOT FOUND OR c.product_key<>'dishbee' OR c.status<>'configured'
  OR c.external_tenant_id IS NULL OR c.external_tenant_id !~ '^[0-9a-fA-F-]{36}$' THEN RAISE EXCEPTION 'configured_dishbee_connection_required'; END IF;
 PERFORM c.external_tenant_id::uuid;
 IF EXISTS(SELECT 1 FROM public.dishbee_factory_binding_attempts WHERE connection_id=c.id)
  THEN RAISE EXCEPTION 'existing_attempt_requires_reconciliation'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.provisioning_jobs WHERE id=_job AND tenant_id=c.tenant_id
  AND status='running' AND (
   (target_kind IN('product','service') AND action IN('provision','update','resume','verify'))
   OR (target_kind='integration' AND action='verify' AND target_key='dishbee:'||c.external_tenant_id)
  ))
  THEN RAISE EXCEPTION 'running_tenant_job_required'; END IF;
 IF _control_plane_hash IS NULL OR _control_plane_hash !~ '^[a-f0-9]{64}$'
  OR _runtime_hash IS NULL OR _runtime_hash !~ '^[a-f0-9]{64}$'
  OR _runtime_key_id IS NULL OR _runtime_key_id !~ '^oqsvc_[a-f0-9]{18}$'
  OR _control_plane_suffix IS NULL OR _control_plane_suffix !~ '^[a-f0-9]{8}$'
  OR _runtime_suffix IS NULL OR _runtime_suffix !~ '^[a-f0-9]{8}$' THEN RAISE EXCEPTION 'invalid_credential_material'; END IF;
 SELECT count(*) INTO v_count FROM public.tenant_locations WHERE tenant_id=c.tenant_id AND status='active';
 SELECT jsonb_agg(jsonb_build_object('dishbeeLocationId',m.external_location_id::uuid,'omniqoraLocationId',l.id) ORDER BY l.id),
  array_agg(l.id ORDER BY l.id) INTO v_maps,v_locations
 FROM public.tenant_locations l JOIN public.product_location_links m
  ON m.tenant_location_id=l.id AND m.tenant_id=l.tenant_id AND m.product_connection_id=c.id
  AND m.product_key='dishbee' AND m.status IN('configured','verified')
 WHERE l.tenant_id=c.tenant_id AND l.status='active';
 IF v_count<1 OR v_count>200 OR coalesce(jsonb_array_length(v_maps),0)<>v_count
  THEN RAISE EXCEPTION 'complete_active_locations_required'; END IF;
 IF (SELECT count(DISTINCT x->>'dishbeeLocationId') FROM jsonb_array_elements(v_maps) x)<>v_count
  THEN RAISE EXCEPTION 'duplicate_external_location'; END IF;
 INSERT INTO public.platform_service_credentials(key_id,secret_hash,secret_suffix,status,scopes,expires_at)
 VALUES(_runtime_key_id,_runtime_hash,_runtime_suffix,'active',jsonb_build_array(jsonb_build_object(
  'tenantId',c.tenant_id,'productKey','dishbee','locationIds',to_jsonb(v_locations),
  'capabilities',jsonb_build_array('orders.consume','orders.ack','events.write','usage.write','crm.write'))),now()+interval '365 days')
 RETURNING id INTO v_runtime;
 UPDATE public.product_connections SET credential_hash=_control_plane_hash,credential_suffix=_control_plane_suffix,
  credential_expires_at=now()+interval '365 days',last_verified_at=NULL,updated_at=now() WHERE id=c.id;
 INSERT INTO public.dishbee_factory_binding_attempts(connection_id,tenant_id,external_tenant_id,provisioning_job_id,
  control_plane_hash,control_plane_suffix,runtime_key_id,runtime_credential_id,location_mappings)
 VALUES(c.id,c.tenant_id,c.external_tenant_id,_job,_control_plane_hash,_control_plane_suffix,_runtime_key_id,v_runtime,v_maps);
 RETURN jsonb_build_object('connectionId',c.id,'tenantId',c.tenant_id,'externalTenantId',c.external_tenant_id,
  'controlPlaneKeySuffix',_control_plane_suffix,'runtimeKeyId',_runtime_key_id,'locationMappings',v_maps);
END $$;
REVOKE ALL ON FUNCTION public.server_prepare_dishbee_factory_binding(uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_prepare_dishbee_factory_binding(uuid,uuid,text,text,text,text,text) TO service_role;

CREATE FUNCTION public.server_complete_dishbee_factory_binding(_connection uuid,_receipt jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.product_connections%rowtype; a public.dishbee_factory_binding_attempts%rowtype;
 v_maps jsonb; v_current jsonb; v_active integer; v_receipt jsonb;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'service_role_required'; END IF;
 SELECT * INTO c FROM public.product_connections WHERE id=_connection FOR UPDATE;
 IF NOT FOUND OR c.product_key<>'dishbee' OR c.status NOT IN('configured','connected')
  THEN RAISE EXCEPTION 'dishbee_connection_unavailable'; END IF;
 SELECT * INTO a FROM public.dishbee_factory_binding_attempts WHERE connection_id=c.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'binding_attempt_missing'; END IF;
 IF jsonb_typeof(_receipt->'locationMappings') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_mapping_receipt'; END IF;
 SELECT jsonb_agg(jsonb_build_object('dishbeeLocationId',x."dishbeeLocationId",'omniqoraLocationId',x."omniqoraLocationId") ORDER BY x."omniqoraLocationId")
 INTO v_maps FROM jsonb_to_recordset(_receipt->'locationMappings') AS x("dishbeeLocationId" uuid,"omniqoraLocationId" uuid);
 IF _receipt->'bindingComplete' IS DISTINCT FROM 'true'::jsonb
  OR _receipt->'productionAccepted' IS DISTINCT FROM 'false'::jsonb
  OR _receipt->>'tenantId' IS DISTINCT FROM a.external_tenant_id
  OR _receipt->>'omniqoraTenantId' IS DISTINCT FROM a.tenant_id::text
  OR _receipt->>'controlPlaneKeySuffix' IS DISTINCT FROM a.control_plane_suffix
  OR _receipt->>'runtimeKeyId' IS DISTINCT FROM a.runtime_key_id
  OR v_maps IS DISTINCT FROM a.location_mappings
  OR _receipt->'activeLocations' IS DISTINCT FROM to_jsonb(jsonb_array_length(a.location_mappings))
  OR _receipt->'mappedLocations' IS DISTINCT FROM to_jsonb(jsonb_array_length(a.location_mappings))
  THEN RAISE EXCEPTION 'receipt_identity_or_mapping_mismatch'; END IF;
 IF c.tenant_id<>a.tenant_id OR c.external_tenant_id<>a.external_tenant_id
  OR c.credential_hash IS DISTINCT FROM a.control_plane_hash OR c.credential_suffix IS DISTINCT FROM a.control_plane_suffix
  OR c.credential_expires_at IS NULL OR c.credential_expires_at<=now()
  THEN RAISE EXCEPTION 'connection_changed_during_binding'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_service_credentials WHERE id=a.runtime_credential_id
  AND key_id=a.runtime_key_id AND status='active' AND expires_at>now()) THEN RAISE EXCEPTION 'runtime_credential_unavailable'; END IF;
 SELECT count(*) INTO v_active FROM public.tenant_locations WHERE tenant_id=c.tenant_id AND status='active';
 SELECT jsonb_agg(jsonb_build_object('dishbeeLocationId',m.external_location_id::uuid,'omniqoraLocationId',l.id) ORDER BY l.id)
 INTO v_current FROM public.tenant_locations l JOIN public.product_location_links m
  ON m.tenant_location_id=l.id AND m.tenant_id=l.tenant_id AND m.product_connection_id=c.id
  AND m.product_key='dishbee' AND m.status IN('configured','verified')
 WHERE l.tenant_id=c.tenant_id AND l.status='active';
 IF v_active<>jsonb_array_length(a.location_mappings) OR v_current IS DISTINCT FROM a.location_mappings
  THEN RAISE EXCEPTION 'locations_changed_during_binding'; END IF;
 v_receipt:=jsonb_build_object('tenantId',a.external_tenant_id,'omniqoraTenantId',a.tenant_id,
  'runtimeKeyId',a.runtime_key_id,'controlPlaneKeySuffix',a.control_plane_suffix,
  'bindingComplete',true,'productionAccepted',false,'locationMappings',v_maps,'observedAt',now());
 UPDATE public.product_location_links m SET status='verified',last_verified_at=now(),updated_at=now(),
  metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object('verificationBoundary','binding_receipt_only')
 WHERE m.product_connection_id=c.id AND m.tenant_id=c.tenant_id AND m.product_key='dishbee'
  AND EXISTS(SELECT 1 FROM public.tenant_locations l WHERE l.id=m.tenant_location_id AND l.tenant_id=c.tenant_id AND l.status='active');
 UPDATE public.product_connections SET status='connected',last_verified_at=now(),updated_at=now(),
  capabilities=ARRAY['tenant.snapshot','runtime.events','order.handoff'],
  metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('provisionedBy','omniqora','runtimeBound',true,
   'bindingStage','bound_awaiting_acceptance','productionAccepted',false,'runtimeKeyId',a.runtime_key_id)
 WHERE id=c.id;
 UPDATE public.dishbee_factory_binding_attempts SET state='accepted',receipt=v_receipt,accepted_at=coalesce(accepted_at,now()) WHERE connection_id=c.id;
 RETURN (SELECT jsonb_build_object('id',id,'product_key',product_key,'external_tenant_id',external_tenant_id,
  'base_url',base_url,'status',status,'capabilities',capabilities,'metadata',metadata) FROM public.product_connections WHERE id=c.id);
END $$;
REVOKE ALL ON FUNCTION public.server_complete_dishbee_factory_binding(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_complete_dishbee_factory_binding(uuid,jsonb) TO service_role;
COMMIT;
