BEGIN;

-- Distinguish the two Haccora integration planes:
-- 1) Omniqora <-> Haccora control-plane/AI connection (oqcp service credential)
-- 2) Dishbee <-> Haccora operational compliance runtime (hcr token + premises mapping)
-- Embedded Haccora is not launch-ready until both are proven.

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,
  provisioning_mode,status,implementation_status,metadata
) VALUES (
  'haccora.dishbee-runtime',
  'Haccora Dishbee Operational Runtime',
  'Direct Dishbee-to-Haccora compliance event delivery using Haccora-scoped tenant and premises mappings. Separate from the Omniqora control-plane/AI bridge.',
  'integration','haccora',false,'manual','active','built_main',
  '{
    "hostProduct":"dishbee",
    "credentialPrefix":"hcr_",
    "credentialAuthority":"haccora",
    "credentialStorage":"dishbee-vault",
    "requiresPerLocationProbe":true,
    "controlPlaneCredential":"separate",
    "dataBoundary":"compliance-operational-events-only"
  }'::jsonb
)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,
  billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,
  status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,
  metadata=EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('haccora.dishbee-runtime','haccora.dishbee-sync',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata) VALUES
('dishbee','haccora.dishbee-runtime',false,false,'{"surface":"dishbee","activation":"owner-plus-landlord-handshake"}'::jsonb),
('haccora','haccora.dishbee-runtime',false,false,'{"surface":"haccora","activation":"owner-plus-landlord-handshake"}'::jsonb)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,
  required=EXCLUDED.required,
  metadata=EXCLUDED.metadata;

UPDATE public.service_catalogue
SET metadata=COALESCE(metadata,'{}'::jsonb) || '{
  "controlPlaneCredentialPrefix":"oqcp_",
  "operationalRuntimeService":"haccora.dishbee-runtime",
  "operationalCredentialPrefix":"hcr_",
  "operationalCredentialAuthority":"haccora",
  "operationalCredentialStorage":"dishbee-vault"
}'::jsonb,
updated_at=now()
WHERE service_key='haccora.dishbee-sync';

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
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
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
         count(*) FILTER (WHERE status IN ('active','trial'))::integer,
         count(*) FILTER (WHERE status='failed')::integer
  INTO requested_count,active_count,failed_count
  FROM public.tenant_services
  WHERE tenant_id=_tenant
    AND service_key = ANY(required_services || ai_services);

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

  -- Dishbee emits this every five minutes through the already scoped platform runtime.
  SELECT occurred_at,payload
  INTO v_runtime_event_at,v_runtime_payload
  FROM public.platform_events
  WHERE tenant_id=_tenant
    AND product_key='dishbee'
    AND event_type='dishbee.runtime.readiness'
  ORDER BY occurred_at DESC
  LIMIT 1;

  v_runtime_fresh:=v_runtime_event_at IS NOT NULL
    AND v_runtime_event_at>now()-interval '15 minutes';
  v_haccora_runtime:=COALESCE(v_runtime_payload->'haccora','{}'::jsonb);

  v_operational_ready:=CASE
    WHEN v_mode<>'dishbee-addon' THEN true
    ELSE
      v_runtime_fresh
      AND COALESCE((v_haccora_runtime->>'enabled')::boolean,false)
      AND COALESCE((v_haccora_runtime->>'configured')::boolean,false)
      AND COALESCE((v_haccora_runtime->>'ready')::boolean,false)
      AND COALESCE((v_haccora_runtime->>'activeLocations')::integer,0)>0
      AND COALESCE((v_haccora_runtime->>'passedLocations')::integer,0)
          =COALESCE((v_haccora_runtime->>'activeLocations')::integer,0)
      AND COALESCE((v_haccora_runtime->>'failedLocations')::integer,0)=0
      AND COALESCE((v_haccora_runtime->>'deadEvents')::integer,0)=0
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
      'aiRequested',ai_requested,
      'aiTotal',cardinality(ai_services)
    ),
    'jobs',jsonb_build_object(
      'pending',pending_jobs,
      'blocked',blocked_jobs,
      'failed',failed_jobs
    ),
    'controlPlaneReady',
      COALESCE(product_row.status='active',false)
      AND COALESCE(connection_row.status='connected',false)
      AND active_count>=cardinality(required_services),
    'operationalRuntime',jsonb_build_object(
      'required',v_mode='dishbee-addon',
      'fresh',v_runtime_fresh,
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
    'ready',
      COALESCE(product_row.status='active',false)
      AND COALESCE(connection_row.status='connected',false)
      AND active_count>=cardinality(required_services)
      AND v_operational_ready,
    'aiReady',
      ai_requested
      AND COALESCE(connection_row.status='connected',false)
      AND (
        SELECT count(*) FROM public.tenant_services
        WHERE tenant_id=_tenant
          AND service_key = ANY(ai_services)
          AND status IN ('active','trial')
      ) = cardinality(ai_services)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_haccora_readiness(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_haccora_readiness(uuid) TO authenticated,service_role;

COMMIT;
