BEGIN;
-- Forward correction: required modules cannot be substituted by optional AI services.
-- Operational evidence must belong to the currently connected Dishbee workspace.
CREATE OR REPLACE FUNCTION public.platform_haccora_readiness(_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  tenant_row public.tenants%rowtype;
  product_row public.tenant_products%rowtype;
  connection_row public.product_connections%rowtype;
  requested_count integer:=0;
  active_count integer:=0;
  failed_count integer:=0;
  required_active integer:=0;
  pending_jobs integer:=0;
  blocked_jobs integer:=0;
  failed_jobs integer:=0;
  required_services text[]:=ARRAY[
    'haccora.core','haccora.haccp','haccora.allergens','haccora.evidence',
    'haccora.traceability','haccora.training','haccora.inspections',
    'haccora.analytics','haccora.dishbee-sync'
  ];
  ai_services text[]:=ARRAY[
    'haccora.ai-copilot','haccora.document-ai','haccora.rag',
    'haccora.graphrag','haccora.regulatory-intelligence'
  ];
  ai_requested boolean:=false;
  v_mode text:='unknown';
  v_dishbee_workspace text;
  v_runtime_event_at timestamptz;
  v_runtime_payload jsonb:='{}'::jsonb;
  v_haccora_runtime jsonb:='{}'::jsonb;
  v_runtime_fresh boolean:=false;
  v_operational_ready boolean:=false;
  v_control_ready boolean:=false;
BEGIN
  IF auth.uid() IS NULL OR (public.is_platform_admin(auth.uid()) IS NOT TRUE
     AND public.is_tenant_member(_tenant,auth.uid()) IS NOT TRUE) THEN
    RAISE EXCEPTION 'Tenant access denied';
  END IF;
  SELECT * INTO tenant_row FROM public.tenants WHERE id=_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;
  SELECT * INTO product_row FROM public.tenant_products
  WHERE tenant_id=_tenant AND product_key='haccora';
  SELECT * INTO connection_row FROM public.product_connections
  WHERE tenant_id=_tenant AND product_key='haccora' ORDER BY updated_at DESC LIMIT 1;
  v_mode:=COALESCE(product_row.config->>'mode','unknown');
  SELECT count(*)::integer,
    count(*) FILTER (WHERE status IN ('active','trial'))::integer,
    count(*) FILTER (WHERE status='failed')::integer,
    count(DISTINCT service_key) FILTER (WHERE service_key=ANY(required_services) AND status IN ('active','trial'))::integer
  INTO requested_count,active_count,failed_count,required_active
  FROM public.tenant_services
  WHERE tenant_id=_tenant AND service_key=ANY(required_services || ai_services);
  SELECT EXISTS(SELECT 1 FROM public.tenant_services WHERE tenant_id=_tenant
    AND service_key=ANY(ai_services) AND status NOT IN ('cancelled','failed')) INTO ai_requested;
  SELECT count(*) FILTER (WHERE status IN ('queued','running'))::integer,
    count(*) FILTER (WHERE status='blocked')::integer,
    count(*) FILTER (WHERE status='failed')::integer
  INTO pending_jobs,blocked_jobs,failed_jobs
  FROM public.provisioning_jobs WHERE tenant_id=_tenant AND (
    (target_kind='product' AND target_key='haccora') OR
    (target_kind='service' AND target_key LIKE 'haccora.%'));
  -- An event from another workspace, a stale connection or a future clock cannot pass.
  SELECT CASE WHEN count(*)=1 THEN min(external_tenant_id) ELSE NULL END
  INTO v_dishbee_workspace FROM public.product_connections
  WHERE tenant_id=_tenant AND product_key='dishbee' AND status='connected';
  SELECT occurred_at,payload INTO v_runtime_event_at,v_runtime_payload
  FROM public.platform_events WHERE tenant_id=_tenant AND product_key='dishbee'
    AND event_type='dishbee.runtime.readiness'
    AND source_service='dishbee.runtime'
    AND nullif(v_dishbee_workspace,'') IS NOT NULL
    AND subject_id=v_dishbee_workspace
    AND payload->>'dishbeeTenantId'=v_dishbee_workspace
    AND occurred_at<=now()
  ORDER BY occurred_at DESC LIMIT 1;
  v_runtime_fresh:=v_runtime_event_at IS NOT NULL
    AND v_runtime_event_at>now()-interval '15 minutes' AND v_runtime_event_at<=now();
  v_haccora_runtime:=COALESCE(v_runtime_payload->'haccora','{}'::jsonb);
  v_operational_ready:=CASE WHEN v_mode<>'dishbee-addon' THEN true ELSE
    v_runtime_fresh
    AND COALESCE((v_haccora_runtime->>'enabled')::boolean,false)
    AND COALESCE((v_haccora_runtime->>'configured')::boolean,false)
    AND COALESCE((v_haccora_runtime->>'ready')::boolean,false)
    AND COALESCE((v_haccora_runtime->>'activeLocations')::integer,0)>0
    AND COALESCE((v_haccora_runtime->>'passedLocations')::integer,0)
      =COALESCE((v_haccora_runtime->>'activeLocations')::integer,0)
    AND COALESCE((v_haccora_runtime->>'failedLocations')::integer,0)=0
    AND COALESCE((v_haccora_runtime->>'deadEvents')::integer,0)=0 END;
  v_control_ready:=COALESCE(product_row.status='active',false)
    AND COALESCE(connection_row.status='connected',false)
    AND required_active=cardinality(required_services)
    AND pending_jobs=0 AND blocked_jobs=0 AND failed_jobs=0;
  RETURN jsonb_build_object(
    'tenantId',_tenant,'tenantSlug',tenant_row.slug,'tenantName',tenant_row.name,
    'countryPack',tenant_row.country_code,'productStatus',COALESCE(product_row.status,'not_requested'),
    'mode',v_mode,'connectionStatus',COALESCE(connection_row.status,'not_connected'),
    'externalTenantId',connection_row.external_tenant_id,'baseUrl',connection_row.base_url,
    'lastVerifiedAt',connection_row.last_verified_at,
    'services',jsonb_build_object('requested',requested_count,'active',active_count,'failed',failed_count,
      'requiredTotal',cardinality(required_services),'requiredActive',required_active,
      'aiRequested',ai_requested,'aiTotal',cardinality(ai_services)),
    'jobs',jsonb_build_object('pending',pending_jobs,'blocked',blocked_jobs,'failed',failed_jobs),
    'controlPlaneReady',v_control_ready,
    'operationalRuntime',jsonb_build_object(
      'required',v_mode='dishbee-addon','fresh',v_runtime_fresh,'eventAt',v_runtime_event_at,
      'ready',v_operational_ready,
      'enabled',COALESCE((v_haccora_runtime->>'enabled')::boolean,false),
      'configured',COALESCE((v_haccora_runtime->>'configured')::boolean,false),
      'activeLocations',COALESCE((v_haccora_runtime->>'activeLocations')::integer,0),
      'passedLocations',COALESCE((v_haccora_runtime->>'passedLocations')::integer,0),
      'failedLocations',COALESCE((v_haccora_runtime->>'failedLocations')::integer,0),
      'unprobedLocations',COALESCE((v_haccora_runtime->>'unprobedLocations')::integer,0),
      'deadEvents',COALESCE((v_haccora_runtime->>'deadEvents')::integer,0),
      'pendingEvents',COALESCE((v_haccora_runtime->>'pendingEvents')::integer,0),
      'lastVerifiedAt',v_haccora_runtime->>'lastVerifiedAt'),
    'ready',v_control_ready AND v_operational_ready,
    'aiReady',v_control_ready AND ai_requested AND (
      SELECT count(DISTINCT service_key) FROM public.tenant_services WHERE tenant_id=_tenant
      AND service_key=ANY(ai_services) AND status IN ('active','trial'))=cardinality(ai_services)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.platform_haccora_readiness(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_haccora_readiness(uuid) TO authenticated,service_role;
COMMIT;
