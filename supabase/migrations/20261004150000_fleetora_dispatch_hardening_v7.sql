-- Fleetora pilot hardening: strict product isolation, governed lifecycle
-- transitions, narrow service-agent authority and retry-safe projections.
BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_status_transition_allowed(_from text,_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT _from=_to OR EXISTS(
    SELECT 1 FROM (VALUES
      ('unassigned','offered'),('unassigned','assigned'),('unassigned','cancelled'),
      ('offered','unassigned'),('offered','assigned'),('offered','cancelled'),
      ('assigned','accepted'),('assigned','unassigned'),('assigned','cancelled'),
      ('accepted','en_route'),('accepted','failed'),('accepted','cancelled'),
      ('en_route','arrived'),('en_route','failed'),('en_route','cancelled'),
      ('arrived','in_progress'),('arrived','collected'),('arrived','failed'),('arrived','cancelled'),
      ('in_progress','collected'),('in_progress','completed'),('in_progress','failed'),('in_progress','cancelled'),
      ('collected','en_route_dropoff'),('collected','completed'),('collected','failed'),('collected','cancelled'),
      ('en_route_dropoff','arrived_dropoff'),('en_route_dropoff','failed'),('en_route_dropoff','cancelled'),
      ('arrived_dropoff','completed'),('arrived_dropoff','failed'),('arrived_dropoff','cancelled')
    ) AS transition(from_status,to_status)
    WHERE transition.from_status=_from AND transition.to_status=_to
  );
$$;
REVOKE ALL ON FUNCTION public.dispatch_status_transition_allowed(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_release_resources(_job public.dispatch_jobs)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF _job.assigned_agent_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.dispatch_jobs other
    WHERE other.assigned_agent_id=_job.assigned_agent_id AND other.id<>_job.id
      AND other.status NOT IN ('completed','failed','cancelled')
  ) THEN
    UPDATE public.dispatch_agents SET status='available',updated_at=now()
    WHERE id=_job.assigned_agent_id AND tenant_id=_job.tenant_id AND product_key=_job.product_key;
  END IF;
  IF _job.assigned_vehicle_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.dispatch_jobs other
    WHERE other.assigned_vehicle_id=_job.assigned_vehicle_id AND other.id<>_job.id
      AND other.status NOT IN ('completed','failed','cancelled')
  ) THEN
    UPDATE public.dispatch_vehicles SET status='available',updated_at=now()
    WHERE id=_job.assigned_vehicle_id AND tenant_id=_job.tenant_id AND product_key=_job.product_key;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_release_resources(public.dispatch_jobs) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_assign_job(_job uuid,_agent uuid,_vehicle uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dispatch_jobs%rowtype;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND OR (NOT public.can_write(j.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Dispatch access denied';
  END IF;
  IF j.status NOT IN ('unassigned','offered') THEN RAISE EXCEPTION 'Job cannot be assigned from status %',j.status; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.dispatch_agents agent
    WHERE agent.id=_agent AND agent.tenant_id=j.tenant_id AND agent.product_key=j.product_key
      AND agent.status='available'
      AND (cardinality(j.required_skills)=0 OR agent.skills @> j.required_skills)
      AND (j.capacity_demand IS NULL OR agent.capacity IS NULL OR agent.capacity>=j.capacity_demand)
  ) THEN RAISE EXCEPTION 'Agent is unavailable or outside the job product scope'; END IF;
  IF _vehicle IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.dispatch_vehicles vehicle
    WHERE vehicle.id=_vehicle AND vehicle.tenant_id=j.tenant_id AND vehicle.product_key=j.product_key
      AND vehicle.status='available'
      AND (cardinality(j.required_vehicle_types)=0 OR vehicle.vehicle_type=ANY(j.required_vehicle_types))
      AND (j.capacity_demand IS NULL OR vehicle.capacity IS NULL OR vehicle.capacity>=j.capacity_demand)
  ) THEN RAISE EXCEPTION 'Vehicle is unavailable or outside the job product scope'; END IF;
  UPDATE public.dispatch_jobs SET assigned_agent_id=_agent,assigned_vehicle_id=_vehicle,status='assigned',updated_at=now()
  WHERE id=_job;
  UPDATE public.dispatch_agents SET status='busy',updated_at=now() WHERE id=_agent;
  IF _vehicle IS NOT NULL THEN
    UPDATE public.dispatch_vehicles SET status='assigned',updated_at=now() WHERE id=_vehicle;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_assign_job(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_assign_job(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_update_status(_job uuid,_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dispatch_jobs%rowtype;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND OR (NOT public.can_write(j.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Dispatch access denied';
  END IF;
  IF NOT public.dispatch_status_transition_allowed(j.status,_status) THEN
    RAISE EXCEPTION 'Invalid dispatch transition from % to %',j.status,_status;
  END IF;
  IF j.status=_status THEN RETURN; END IF;
  UPDATE public.dispatch_jobs SET status=_status,updated_at=now() WHERE id=_job;
  IF _status IN ('completed','failed','cancelled') THEN PERFORM public.dispatch_release_resources(j); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_update_status(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_update_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.service_dispatch_update_status(
  _tenant uuid,_product text,_agent uuid,_job uuid,_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dispatch_jobs%rowtype;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Platform service required';
  END IF;
  SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND OR j.tenant_id<>_tenant OR j.product_key<>_product OR j.assigned_agent_id IS DISTINCT FROM _agent THEN
    RAISE EXCEPTION 'Assigned agent job scope refused';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.dispatch_agents agent
    WHERE agent.id=_agent AND agent.tenant_id=_tenant AND agent.product_key=_product
  ) THEN RAISE EXCEPTION 'Agent scope refused'; END IF;
  IF _status IN ('unassigned','offered','assigned','cancelled') THEN
    RAISE EXCEPTION 'Agent cannot set dispatch status %',_status;
  END IF;
  IF NOT public.dispatch_status_transition_allowed(j.status,_status) THEN
    RAISE EXCEPTION 'Invalid dispatch transition from % to %',j.status,_status;
  END IF;
  IF j.status=_status THEN RETURN; END IF;
  UPDATE public.dispatch_jobs SET status=_status,updated_at=now() WHERE id=_job;
  IF _status IN ('completed','failed') THEN PERFORM public.dispatch_release_resources(j); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.service_dispatch_update_status(uuid,text,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_dispatch_update_status(uuid,text,uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.project_routing_proposal_applied(
  _tenant uuid,_product text,_proposal uuid,_external_route text,_plan_hash text,_applied_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proposal public.routing_plan_proposals%rowtype;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Platform service required';
  END IF;
  SELECT * INTO proposal FROM public.routing_plan_proposals WHERE id=_proposal FOR UPDATE;
  IF NOT FOUND OR proposal.tenant_id<>_tenant OR proposal.product_key<>_product
    OR proposal.external_route_id<>_external_route OR proposal.plan_hash<>_plan_hash THEN
    RAISE EXCEPTION 'Routing proposal scope or integrity check failed';
  END IF;
  IF proposal.status='applied' THEN
    RETURN jsonb_build_object('proposalId',proposal.id,'status','applied','idempotent',true);
  END IF;
  IF proposal.status<>'approved' THEN RAISE EXCEPTION 'Routing proposal is not approved'; END IF;
  UPDATE public.routing_plan_proposals SET status='applied',applied_at=_applied_at,updated_at=now()
  WHERE id=proposal.id;
  RETURN jsonb_build_object('proposalId',proposal.id,'status','applied','idempotent',false);
END; $$;
REVOKE ALL ON FUNCTION public.project_routing_proposal_applied(uuid,text,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_routing_proposal_applied(uuid,text,uuid,text,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.get_fleetora_migration_readiness(
  _tenant uuid,_product text DEFAULT 'fleetpulse-uae'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  base jsonb; binding public.landlord_instance_tenants%rowtype;
  passed_count integer; failed_count integer; critical_count integer;
  read_approved boolean; write_approved boolean; service_request boolean;
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
   WHERE tenant_id=_tenant AND product_key=_product AND severity='critical' AND status IN ('open','acknowledged');
  SELECT EXISTS(SELECT 1 FROM public.fleetora_cutover_approvals
    WHERE tenant_id=_tenant AND product_key=_product AND target_mode='read' AND status='approved') INTO read_approved;
  SELECT EXISTS(SELECT 1 FROM public.fleetora_cutover_approvals
    WHERE tenant_id=_tenant AND product_key=_product AND target_mode='write' AND status='approved') INTO write_approved;
  RETURN base || jsonb_build_object(
    'landlordBound',binding.landlord_instance_id IS NOT NULL,
    'migrationMode',COALESCE(binding.migration_mode,'disabled'),
    'shadowPassed',COALESCE(passed_count,0),'shadowFailed',COALESCE(failed_count,0),
    'requiredShadowPasses',10,'blockingCriticalExceptions',COALESCE(critical_count,0),
    'readApprovalGranted',COALESCE(read_approved,false),'writeApprovalGranted',COALESCE(write_approved,false),
    'readCutoverEligible',COALESCE((base->>'ready')::boolean,false)
      AND binding.landlord_instance_id IS NOT NULL AND COALESCE(passed_count,0)>=10
      AND COALESCE(failed_count,0)=0 AND COALESCE(critical_count,0)=0 AND COALESCE(read_approved,false),
    'writeCutoverEligible',COALESCE((base->>'ready')::boolean,false)
      AND binding.landlord_instance_id IS NOT NULL AND binding.migration_mode='read'
      AND COALESCE(passed_count,0)>=10 AND COALESCE(failed_count,0)=0
      AND COALESCE(critical_count,0)=0 AND COALESCE(write_approved,false)
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_fleetora_migration_readiness(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_fleetora_migration_readiness(uuid,text) TO authenticated,service_role;

COMMIT;
