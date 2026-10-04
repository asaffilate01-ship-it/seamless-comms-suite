BEGIN;

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

  RETURN jsonb_build_object(
    'tenantId',_tenant,
    'tenantSlug',tenant_row.slug,
    'tenantName',tenant_row.name,
    'countryPack',tenant_row.country_code,
    'productStatus',COALESCE(product_row.status,'not_requested'),
    'mode',COALESCE(product_row.config->>'mode','unknown'),
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
    'ready',
      COALESCE(product_row.status='active',false)
      AND COALESCE(connection_row.status='connected',false)
      AND active_count >= cardinality(required_services),
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

CREATE OR REPLACE FUNCTION public.platform_haccora_pilot_readiness()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  tenant_slug text;
  tid uuid;
  row jsonb;
  rows jsonb:='[]'::jsonb;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;

  FOREACH tenant_slug IN ARRAY ARRAY['cafe1-luton','cafe1-st-albans','mealdeck']::text[] LOOP
    SELECT t.id INTO tid FROM public.tenants t WHERE t.slug=tenant_slug;
    IF tid IS NULL THEN
      rows:=rows||jsonb_build_array(jsonb_build_object(
        'tenantSlug',tenant_slug,'ready',false,'missing',true
      ));
    ELSE
      row:=public.platform_haccora_readiness(tid);
      rows:=rows||jsonb_build_array(row);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'pilot','313-brands-haccora',
    'generatedAt',now(),
    'allReady',NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(rows) e
      WHERE COALESCE((e->>'ready')::boolean,false)=false
    ),
    'tenants',rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_haccora_pilot_readiness() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_haccora_pilot_readiness() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_retry_haccora_provisioning(
  _tenant uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  job record;
  queued integer:=0;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=_tenant) THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  FOR job IN
    SELECT id,target_kind,target_key,payload
    FROM public.provisioning_jobs
    WHERE tenant_id=_tenant
      AND status IN ('failed','blocked')
      AND (
        (target_kind='product' AND target_key='haccora')
        OR (target_kind='service' AND target_key LIKE 'haccora.%')
      )
    ORDER BY created_at
  LOOP
    UPDATE public.provisioning_jobs
    SET status='cancelled',finished_at=COALESCE(finished_at,now())
    WHERE id=job.id;

    PERFORM public.queue_provisioning(
      _tenant,job.target_kind,job.target_key,'provision',
      COALESCE(job.payload,'{}'::jsonb)||jsonb_build_object('retryOf',job.id)
    );
    queued:=queued+1;
  END LOOP;

  RETURN queued;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_retry_haccora_provisioning(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_retry_haccora_provisioning(uuid) TO authenticated,service_role;

COMMIT;
