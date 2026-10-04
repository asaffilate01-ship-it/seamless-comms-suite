-- Fleetora pilot governance: auditable cutover approvals, fail-closed authority
-- transitions and deterministic operations intelligence. Routing remains a
-- proposal until a human approves the relevant operational action.
BEGIN;

CREATE TABLE IF NOT EXISTS public.fleetora_cutover_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  target_mode text NOT NULL CHECK(target_mode IN ('read','write')),
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','revoked','consumed')),
  reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 2000),
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleetora_cutover_scope_idx
  ON public.fleetora_cutover_approvals(tenant_id,product_key,target_mode,requested_at DESC);

ALTER TABLE public.fleetora_cutover_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fleetora_cutover_approvals FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.fleetora_cutover_approvals TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.fleetora_cutover_approvals TO authenticated;
CREATE POLICY "fleetora cutover scoped read" ON public.fleetora_cutover_approvals
FOR SELECT TO authenticated USING(
  public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid())
);
CREATE POLICY "fleetora cutover request" ON public.fleetora_cutover_approvals
FOR INSERT TO authenticated WITH CHECK(
  public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())
);
CREATE POLICY "fleetora cutover platform review" ON public.fleetora_cutover_approvals
FOR UPDATE TO authenticated USING(public.is_platform_admin(auth.uid()))
WITH CHECK(public.is_platform_admin(auth.uid()));

-- The signed control-plane snapshot is served with the service role. Preserve
-- normal tenant checks while allowing that server-only path to compute the
-- same readiness evidence.
CREATE OR REPLACE FUNCTION public.get_tenant_product_readiness(_tenant uuid,_product text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  tp public.tenant_products%rowtype;
  p public.product_catalogue%rowtype;
  blockers jsonb := '[]'::jsonb;
  warnings jsonb := '[]'::jsonb;
  required_service record;
  required_provider record;
  connected boolean;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    AND NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Tenant access denied';
  END IF;
  SELECT * INTO tp FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product;
  IF NOT FOUND THEN RETURN jsonb_build_object('ready',false,'blockers',jsonb_build_array('tenant_product_missing'),'warnings',warnings); END IF;
  SELECT * INTO p FROM public.product_catalogue WHERE product_key=_product;
  IF tp.status IN ('failed','cancelled','suspended') THEN blockers := blockers||jsonb_build_array('tenant_product_'||tp.status); END IF;
  IF tp.region_key IS NULL OR NOT EXISTS(SELECT 1 FROM public.region_packs WHERE region_key=tp.region_key AND status<>'retired') THEN
    blockers := blockers||jsonb_build_array('region_pack_missing');
  END IF;
  IF tp.locale IS NULL OR NOT EXISTS(SELECT 1 FROM public.locale_packs WHERE locale=tp.locale AND status<>'retired') THEN
    blockers := blockers||jsonb_build_array('locale_pack_missing');
  END IF;
  FOR required_service IN SELECT ps.service_key FROM public.product_services ps WHERE ps.product_key=_product AND ps.required LOOP
    IF NOT public.has_tenant_entitlement(_tenant,required_service.service_key) THEN
      blockers := blockers||jsonb_build_array('service:'||required_service.service_key);
    END IF;
  END LOOP;
  FOR required_provider IN SELECT provider_key FROM public.product_provider_requirements WHERE product_key=_product AND required LOOP
    IF NOT EXISTS(SELECT 1 FROM public.provider_bindings b WHERE b.tenant_id=_tenant AND b.product_key=_product
      AND b.provider_key=required_provider.provider_key AND b.environment='production' AND b.status='active' AND b.last_verified_at IS NOT NULL) THEN
      blockers := blockers||jsonb_build_array('provider:'||required_provider.provider_key);
    END IF;
  END LOOP;
  IF p.deployment_mode IN ('external','hybrid') THEN
    SELECT EXISTS(SELECT 1 FROM public.product_connections c WHERE c.tenant_id=_tenant AND c.product_key=_product AND c.status='connected') INTO connected;
    IF NOT connected THEN blockers := blockers||jsonb_build_array('product_connection_missing'); END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenant_domains d WHERE d.tenant_id=_tenant AND (d.product_key=_product OR d.product_key IS NULL)
    AND d.verification_status='verified') THEN warnings := warnings||jsonb_build_array('verified_domain_missing'); END IF;
  RETURN jsonb_build_object('ready',jsonb_array_length(blockers)=0,'blockers',blockers,'warnings',warnings,
    'regionKey',tp.region_key,'locale',tp.locale,'launchStatus',tp.launch_status);
END; $$;
REVOKE ALL ON FUNCTION public.get_tenant_product_readiness(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_product_readiness(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_fleetora_migration_readiness(
  _tenant uuid,_product text DEFAULT 'fleetpulse-uae'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  base jsonb;
  binding public.landlord_instance_tenants%rowtype;
  passed_count integer;
  failed_count integer;
  critical_count integer;
  read_approved boolean;
  write_approved boolean;
  service_request boolean;
BEGIN
  service_request := COALESCE(current_setting('request.jwt.claim.role',true),'')='service_role';
  IF NOT service_request AND NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Tenant access denied';
  END IF;
  SELECT public.get_tenant_product_readiness(_tenant,_product) INTO base;
  SELECT * INTO binding FROM public.landlord_instance_tenants
   WHERE tenant_id=_tenant AND variant_product_key=_product;
  SELECT count(*) FILTER(WHERE passed),count(*) FILTER(WHERE NOT passed)
    INTO passed_count,failed_count FROM public.routing_shadow_evaluations
   WHERE tenant_id=_tenant AND product_key=_product;
  SELECT count(*) INTO critical_count FROM public.dispatch_exceptions
   WHERE tenant_id=_tenant AND severity='critical' AND status IN ('open','acknowledged');
  SELECT EXISTS(
    SELECT 1 FROM public.fleetora_cutover_approvals
    WHERE tenant_id=_tenant AND product_key=_product AND target_mode='read' AND status='approved'
  ) INTO read_approved;
  SELECT EXISTS(
    SELECT 1 FROM public.fleetora_cutover_approvals
    WHERE tenant_id=_tenant AND product_key=_product AND target_mode='write' AND status='approved'
  ) INTO write_approved;
  RETURN base || jsonb_build_object(
    'landlordBound',binding.landlord_instance_id IS NOT NULL,
    'migrationMode',COALESCE(binding.migration_mode,'disabled'),
    'shadowPassed',COALESCE(passed_count,0),
    'shadowFailed',COALESCE(failed_count,0),
    'blockingCriticalExceptions',COALESCE(critical_count,0),
    'readApprovalGranted',COALESCE(read_approved,false),
    'writeApprovalGranted',COALESCE(write_approved,false),
    'readCutoverEligible',COALESCE((base->>'ready')::boolean,false)
      AND binding.landlord_instance_id IS NOT NULL
      AND COALESCE(passed_count,0)>=5 AND COALESCE(failed_count,0)=0
      AND COALESCE(critical_count,0)=0 AND COALESCE(read_approved,false),
    'writeCutoverEligible',COALESCE((base->>'ready')::boolean,false)
      AND binding.landlord_instance_id IS NOT NULL
      AND binding.migration_mode='read'
      AND COALESCE(passed_count,0)>=10 AND COALESCE(failed_count,0)=0
      AND COALESCE(critical_count,0)=0 AND COALESCE(write_approved,false)
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_fleetora_migration_readiness(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_fleetora_migration_readiness(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_request_fleetora_cutover(
  _tenant uuid,_product text,_target_mode text,_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; readiness jsonb; current_mode text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Tenant administrator required';
  END IF;
  IF _target_mode NOT IN ('read','write') THEN RAISE EXCEPTION 'Cutover target must be read or write'; END IF;
  IF length(trim(COALESCE(_reason,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Cutover reason is required'; END IF;
  SELECT migration_mode INTO current_mode FROM public.landlord_instance_tenants
   WHERE tenant_id=_tenant AND variant_product_key=_product;
  IF current_mode IS NULL THEN RAISE EXCEPTION 'Fleetora tenant binding required'; END IF;
  IF (_target_mode='read' AND current_mode<>'shadow') OR (_target_mode='write' AND current_mode<>'read') THEN
    RAISE EXCEPTION 'Cutover requests must follow shadow to read to write';
  END IF;
  SELECT public.get_fleetora_migration_readiness(_tenant,_product) INTO readiness;
  INSERT INTO public.fleetora_cutover_approvals(tenant_id,product_key,target_mode,reason,evidence_snapshot)
  VALUES(_tenant,_product,_target_mode,trim(_reason),readiness) RETURNING id INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_request_fleetora_cutover(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_request_fleetora_cutover(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_review_fleetora_cutover(
  _approval uuid,_decision text,_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Decision must be approved or rejected'; END IF;
  UPDATE public.fleetora_cutover_approvals SET status=_decision,reviewed_by=auth.uid(),reviewed_at=now(),
    review_note=NULLIF(trim(COALESCE(_note,'')),''),updated_at=now()
  WHERE id=_approval AND status='requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending cutover request not found'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.platform_review_fleetora_cutover(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_review_fleetora_cutover(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_fleetora_migration_mode(
  _tenant uuid,_product text,_mode text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE binding public.landlord_instance_tenants%rowtype; readiness jsonb; approval_id uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF _mode NOT IN ('disabled','shadow','read','write') THEN RAISE EXCEPTION 'Invalid migration mode'; END IF;
  SELECT * INTO binding FROM public.landlord_instance_tenants
   WHERE tenant_id=_tenant AND variant_product_key=_product FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fleetora tenant binding required'; END IF;
  IF _mode= binding.migration_mode THEN RETURN public.get_fleetora_migration_readiness(_tenant,_product); END IF;
  IF _mode IN ('disabled','shadow') THEN
    UPDATE public.landlord_instance_tenants SET migration_mode=_mode,
      status=CASE WHEN _mode='disabled' THEN 'suspended' ELSE 'migrating' END,updated_at=now()
    WHERE landlord_instance_id=binding.landlord_instance_id AND tenant_id=_tenant;
  ELSE
    IF (_mode='read' AND binding.migration_mode<>'shadow') OR (_mode='write' AND binding.migration_mode<>'read') THEN
      RAISE EXCEPTION 'Migration mode must advance from shadow to read to write';
    END IF;
    SELECT public.get_fleetora_migration_readiness(_tenant,_product) INTO readiness;
    IF (_mode='read' AND NOT COALESCE((readiness->>'readCutoverEligible')::boolean,false))
      OR (_mode='write' AND NOT COALESCE((readiness->>'writeCutoverEligible')::boolean,false)) THEN
      RAISE EXCEPTION 'Fleetora cutover readiness gate failed';
    END IF;
    SELECT id INTO approval_id FROM public.fleetora_cutover_approvals
     WHERE tenant_id=_tenant AND product_key=_product AND target_mode=_mode AND status='approved'
     ORDER BY reviewed_at DESC LIMIT 1 FOR UPDATE;
    IF approval_id IS NULL THEN RAISE EXCEPTION 'Approved cutover request required'; END IF;
    UPDATE public.landlord_instance_tenants SET migration_mode=_mode,
      status=CASE WHEN _mode='write' THEN 'active' ELSE 'migrating' END,updated_at=now()
    WHERE landlord_instance_id=binding.landlord_instance_id AND tenant_id=_tenant;
    UPDATE public.fleetora_cutover_approvals SET status='consumed',consumed_at=now(),updated_at=now()
     WHERE id=approval_id;
  END IF;
  UPDATE public.tenant_products SET config=COALESCE(config,'{}'::jsonb)||jsonb_build_object('migrationMode',_mode),updated_at=now()
   WHERE tenant_id=_tenant AND product_key=_product;
  RETURN public.get_fleetora_migration_readiness(_tenant,_product);
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_fleetora_migration_mode(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_set_fleetora_migration_mode(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_operations_recommendations(
  _tenant uuid,_product text DEFAULT 'fleetpulse-uae'
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted_count integer := 0; affected integer;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Operations intelligence access denied';
  END IF;

  INSERT INTO public.operations_recommendations(
    tenant_id,product_key,recommendation_type,subject_type,subject_id,source_kind,source_ref,confidence,evidence,recommendation,expires_at
  )
  SELECT _tenant,_product,'maintenance_due','vehicle',work.vehicle_id::text,'deterministic',work.id::text,0.99,
    jsonb_build_array(jsonb_build_object('workOrderId',work.id,'dueAt',work.due_at,'priority',work.priority)),
    jsonb_build_object('action','schedule_maintenance','requiresHumanApproval',true),now()+interval '7 days'
  FROM public.fleet_maintenance_work_orders work
  WHERE work.tenant_id=_tenant AND work.status IN ('open','scheduled') AND work.due_at<now()
    AND NOT EXISTS(SELECT 1 FROM public.operations_recommendations recommendation
      WHERE recommendation.tenant_id=_tenant AND recommendation.product_key=_product
        AND recommendation.recommendation_type='maintenance_due' AND recommendation.source_ref=work.id::text
        AND recommendation.status IN ('review','approved','applied'));
  GET DIAGNOSTICS affected = ROW_COUNT; inserted_count := inserted_count + affected;

  INSERT INTO public.operations_recommendations(
    tenant_id,product_key,recommendation_type,subject_type,subject_id,source_kind,source_ref,confidence,evidence,recommendation,expires_at
  )
  SELECT _tenant,_product,'critical_exception','dispatch_exception',exception.id::text,'deterministic',exception.id::text,1,
    jsonb_build_array(jsonb_build_object('exceptionType',exception.exception_type,'openedAt',exception.opened_at)),
    jsonb_build_object('action','review_dispatch_exception','requiresHumanApproval',true),now()+interval '24 hours'
  FROM public.dispatch_exceptions exception
  WHERE exception.tenant_id=_tenant AND exception.severity='critical' AND exception.status IN ('open','acknowledged')
    AND NOT EXISTS(SELECT 1 FROM public.operations_recommendations recommendation
      WHERE recommendation.tenant_id=_tenant AND recommendation.product_key=_product
        AND recommendation.recommendation_type='critical_exception' AND recommendation.source_ref=exception.id::text
        AND recommendation.status IN ('review','approved','applied'));
  GET DIAGNOSTICS affected = ROW_COUNT; inserted_count := inserted_count + affected;

  INSERT INTO public.operations_recommendations(
    tenant_id,product_key,recommendation_type,subject_type,subject_id,source_kind,source_ref,confidence,evidence,recommendation,expires_at
  )
  SELECT _tenant,_product,'route_shadow_failure','delivery_route',evaluation.source_route_id,'deterministic',evaluation.id::text,1,
    jsonb_build_array(jsonb_build_object('sourceDistanceKm',evaluation.source_distance_km,
      'candidateDistanceKm',evaluation.candidate_distance_km,'sequenceMatchRatio',evaluation.sequence_match_ratio)),
    jsonb_build_object('action','inspect_route_constraints','requiresHumanApproval',true),now()+interval '7 days'
  FROM public.routing_shadow_evaluations evaluation
  WHERE evaluation.tenant_id=_tenant AND evaluation.product_key=_product AND NOT evaluation.passed
    AND NOT EXISTS(SELECT 1 FROM public.operations_recommendations recommendation
      WHERE recommendation.tenant_id=_tenant AND recommendation.product_key=_product
        AND recommendation.recommendation_type='route_shadow_failure' AND recommendation.source_ref=evaluation.id::text
        AND recommendation.status IN ('review','approved','applied'));
  GET DIAGNOSTICS affected = ROW_COUNT; inserted_count := inserted_count + affected;

  RETURN inserted_count;
END; $$;
REVOKE ALL ON FUNCTION public.generate_operations_recommendations(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.generate_operations_recommendations(uuid,text) TO authenticated,service_role;

COMMIT;
