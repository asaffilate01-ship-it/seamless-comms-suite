BEGIN;

-- Private, strict counts/status validator. Does not accept raw evidence, names,
-- secrets or location details; bad JSON fails closed rather than throwing in UI.
CREATE OR REPLACE FUNCTION public.haccora_counts_evidence_valid(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE k text; n numeric;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) AS keys(key) WHERE key NOT IN
  ('enabled','configured','ready','activeLocations','passedLocations','failedLocations',
   'unprobedLocations','deadEvents','pendingEvents','lastVerifiedAt')) THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['enabled','configured','ready'] LOOP
  IF jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['activeLocations','passedLocations','failedLocations','unprobedLocations','deadEvents','pendingEvents'] LOOP
  IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  n:=(p->>k)::numeric;
  IF n<0 OR n>2147483647 OR n<>trunc(n) THEN RETURN false; END IF;
 END LOOP;
 IF (p->>'passedLocations')::numeric+(p->>'failedLocations')::numeric+(p->>'unprobedLocations')::numeric
    <> (p->>'activeLocations')::numeric THEN RETURN false; END IF;
 IF p ? 'lastVerifiedAt' AND p->'lastVerifiedAt'<>'null'::jsonb THEN
  IF jsonb_typeof(p->'lastVerifiedAt')<>'string' OR length(p->>'lastVerifiedAt')>40
     OR (p->>'lastVerifiedAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
   THEN RETURN false; END IF;
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.haccora_counts_evidence_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_haccora_readiness(
  _tenant uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  tenant_row public.tenants%rowtype;
  product_row public.tenant_products%rowtype;
  connection_row public.product_connections%rowtype;
  requested_count integer:=0;
  active_count integer:=0;
  required_active_count integer:=0;
  v_control_ready boolean:=false;
  v_dishbee_workspace text;
  v_dishbee_connections integer:=0;
  failed_count integer:=0;
  pending_jobs integer:=0;
  blocked_jobs integer:=0;
  failed_jobs integer:=0;
  required_services text[]:=ARRAY[
    'haccora.core','haccora.haccp','haccora.allergens','haccora.evidence',
    'haccora.traceability','haccora.training','haccora.inspections',
    'haccora.analytics','haccora.dishbee-sync'
  ]::text[];
  ai_services text[]:=ARRAY[
    'haccora.ai-copilot','haccora.document-ai','haccora.rag',
    'haccora.graphrag','haccora.regulatory-intelligence'
  ]::text[];
  ai_requested boolean:=false;
  v_mode text:='unknown';
  v_runtime_event_at timestamptz;
  v_runtime_payload jsonb:='{}'::jsonb;
  v_haccora_runtime jsonb:='{}'::jsonb;
  v_runtime_fresh boolean:=false;
  v_operational_ready boolean:=false;
  v_evidence_valid boolean:=false;
BEGIN
  IF public.is_platform_admin(auth.uid()) IS NOT TRUE
     AND public.is_tenant_member(_tenant,auth.uid()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Tenant access denied';
  END IF;

  SELECT * INTO tenant_row FROM public.tenants WHERE id=_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found'; END IF;

  SELECT * INTO product_row
  FROM public.tenant_products
  WHERE tenant_id=_tenant AND product_key='haccora';

  SELECT * INTO connection_row
  FROM public.product_connections
  WHERE tenant_id=_tenant AND product_key='haccora'
  ORDER BY updated_at DESC
  LIMIT 1;

  v_mode:=COALESCE(product_row.config->>'mode','unknown');

  SELECT count(*)::integer,
         count(*) FILTER (WHERE status IN ('active','trial') AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()))::integer,
         count(*) FILTER (WHERE status='failed')::integer
  INTO requested_count,active_count,failed_count
  FROM public.tenant_services
  WHERE tenant_id=_tenant
    AND service_key = ANY(required_services || ai_services);

  SELECT count(*)::integer INTO required_active_count
  FROM public.tenant_services
  WHERE tenant_id=_tenant AND service_key=ANY(required_services)
    AND status IN ('active','trial') AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now());

  SELECT EXISTS(
    SELECT 1 FROM public.tenant_services
    WHERE tenant_id=_tenant
      AND service_key = ANY(ai_services)
      AND status NOT IN ('cancelled','failed')
  ) INTO ai_requested;

  SELECT count(*) FILTER (WHERE status IN ('queued','running'))::integer,
         count(*) FILTER (WHERE status='blocked')::integer,
         count(*) FILTER (WHERE status='failed')::integer
  INTO pending_jobs,blocked_jobs,failed_jobs
  FROM public.provisioning_jobs
  WHERE tenant_id=_tenant
    AND (
      (target_kind='product' AND target_key='haccora')
      OR (target_kind='service' AND target_key LIKE 'haccora.%')
    );

  v_control_ready:=COALESCE(product_row.status='active',false)
    AND COALESCE(connection_row.status='connected',false)
    AND (connection_row.credential_expires_at IS NULL OR connection_row.credential_expires_at>now())
    AND required_active_count=cardinality(required_services)
    AND pending_jobs=0 AND blocked_jobs=0 AND failed_jobs=0;

  -- Bind telemetry to one explicit current Dishbee workspace, not a matching tenant count.
  SELECT count(*)::integer,min(external_tenant_id)
  INTO v_dishbee_connections,v_dishbee_workspace
  FROM public.product_connections
  WHERE tenant_id=_tenant AND product_key='dishbee' AND status='connected'
    AND nullif(external_tenant_id,'') IS NOT NULL
    AND (credential_expires_at IS NULL OR credential_expires_at>now());

  -- Dishbee emits this every five minutes through the already scoped platform runtime.
  SELECT occurred_at,payload
  INTO v_runtime_event_at,v_runtime_payload
  FROM public.platform_events
  WHERE tenant_id=_tenant
    AND product_key='dishbee'
    AND event_type='dishbee.runtime.readiness'
    AND source_service='dishbee.runtime' AND subject_type='tenant'
    AND v_dishbee_connections=1 AND subject_id=v_dishbee_workspace
    AND payload->>'dishbeeTenantId'=v_dishbee_workspace
  ORDER BY occurred_at DESC
  LIMIT 1;

  v_runtime_fresh:=v_runtime_event_at IS NOT NULL
    AND v_runtime_event_at>now()-interval '15 minutes'
    AND v_runtime_event_at<=now();
  v_haccora_runtime:=COALESCE(v_runtime_payload->'haccora','{}'::jsonb);
  v_evidence_valid:=public.haccora_counts_evidence_valid(v_haccora_runtime);
  -- Malformed or private summaries never reach casts, readiness, or the UI.
  IF NOT v_evidence_valid THEN v_haccora_runtime:='{}'::jsonb; END IF;

  v_operational_ready:=CASE
    WHEN v_mode='standalone' THEN true
    WHEN v_mode='dishbee-addon' THEN
      v_runtime_fresh AND v_evidence_valid
      AND COALESCE((v_haccora_runtime->>'enabled')::boolean,false)
      AND COALESCE((v_haccora_runtime->>'configured')::boolean,false)
      AND COALESCE((v_haccora_runtime->>'ready')::boolean,false)
      AND COALESCE((v_haccora_runtime->>'activeLocations')::integer,0)>0
      AND COALESCE((v_haccora_runtime->>'passedLocations')::integer,0)
          =COALESCE((v_haccora_runtime->>'activeLocations')::integer,0)
      AND COALESCE((v_haccora_runtime->>'failedLocations')::integer,0)=0
      AND COALESCE((v_haccora_runtime->>'deadEvents')::integer,0)=0
      AND COALESCE((v_haccora_runtime->>'unprobedLocations')::integer,0)=0
    ELSE false
  END;

  RETURN jsonb_build_object(
    'tenantId',_tenant,
    'tenantSlug',tenant_row.slug,
    'tenantName',tenant_row.name,
    'countryPack',tenant_row.country_code,
    'productStatus',COALESCE(product_row.status,'not_requested'),
    'mode',v_mode,
    'connectionStatus',COALESCE(connection_row.status,'not_connected'),
    'externalTenantId',connection_row.external_tenant_id,
    'baseUrl',connection_row.base_url,
    'lastVerifiedAt',connection_row.last_verified_at,
    'services',jsonb_build_object(
      'requested',requested_count,
      'active',active_count,
      'failed',failed_count,
      'requiredTotal',cardinality(required_services),
      'requiredActive',required_active_count,
      'aiRequested',ai_requested,
      'aiTotal',cardinality(ai_services)
    ),
    'jobs',jsonb_build_object(
      'pending',pending_jobs,
      'blocked',blocked_jobs,
      'failed',failed_jobs
    ),
    'controlPlaneReady',v_control_ready,
    'operationalRuntime',jsonb_build_object(
      'required',v_mode<>'standalone',
      'fresh',v_runtime_fresh,
      'evidenceValid',v_evidence_valid,
      'eventAt',v_runtime_event_at,
      'ready',v_operational_ready,
      'enabled',COALESCE((v_haccora_runtime->>'enabled')::boolean,false),
      'configured',COALESCE((v_haccora_runtime->>'configured')::boolean,false),
      'activeLocations',COALESCE((v_haccora_runtime->>'activeLocations')::integer,0),
      'passedLocations',COALESCE((v_haccora_runtime->>'passedLocations')::integer,0),
      'failedLocations',COALESCE((v_haccora_runtime->>'failedLocations')::integer,0),
      'unprobedLocations',COALESCE((v_haccora_runtime->>'unprobedLocations')::integer,0),
      'deadEvents',COALESCE((v_haccora_runtime->>'deadEvents')::integer,0),
      'pendingEvents',COALESCE((v_haccora_runtime->>'pendingEvents')::integer,0),
      'lastVerifiedAt',v_haccora_runtime->>'lastVerifiedAt'
    ),
    'ready',v_control_ready AND v_operational_ready,
    'aiReady',
      ai_requested AND v_control_ready
      AND (
        SELECT count(*) FROM public.tenant_services
        WHERE tenant_id=_tenant
          AND service_key = ANY(ai_services)
          AND status IN ('active','trial') AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())
      ) = cardinality(ai_services)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_haccora_readiness(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_haccora_readiness(uuid) TO authenticated,service_role;


COMMIT;
