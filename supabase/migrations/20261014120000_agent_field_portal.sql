-- Authenticated and tenant-bound field agent pilot. No background GPS.
BEGIN;
DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY[
  'dispatch_agents','dispatch_vehicles','dispatch_jobs','dispatch_job_stops',
  'dispatch_agent_positions','dispatch_pod','tracking_snapshots','public_tracking_tokens'
 ] LOOP
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
   'dispatch tenant write',table_name);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY[''owner'',''admin'']::public.app_role[])) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY[''owner'',''admin'']::public.app_role[]))',
   'dispatch admin write '||table_name,table_name);
 END LOOP;
END $$;
-- Security-definer dispatcher RPCs must not let a tenant agent edit other drivers' jobs.
CREATE OR REPLACE FUNCTION public.dispatch_create_job(_tenant uuid,_product text,_location uuid,_job_type text,_priority text,_external_ref text,_metadata jsonb,_stops jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j uuid;item jsonb;pos integer:=0;BEGIN
 IF NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Dispatch access denied';END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.dispatch') AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Dispatch entitlement required';END IF;
 IF jsonb_typeof(_stops)<>'array' OR jsonb_array_length(_stops)<1 THEN RAISE EXCEPTION 'At least one stop required';END IF;
 INSERT INTO public.dispatch_jobs(tenant_id,product_key,location_id,job_type,priority,external_ref,metadata) VALUES(_tenant,_product,_location,_job_type,_priority,NULLIF(_external_ref,''),COALESCE(_metadata,'{}')) RETURNING id INTO j;
 FOR item IN SELECT value FROM jsonb_array_elements(_stops) LOOP
  INSERT INTO public.dispatch_job_stops(job_id,tenant_id,position,stop_kind,latitude,longitude,address,contact_name,contact_phone,instructions)
  VALUES(j,_tenant,pos,item->>'kind',(item->>'lat')::double precision,(item->>'lng')::double precision,item->>'address',item->>'contactName',item->>'contactPhone',item->>'instructions');pos:=pos+1;
 END LOOP;RETURN j;END;$$;

CREATE OR REPLACE FUNCTION public.dispatch_assign_job(_job uuid,_agent uuid,_vehicle uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dispatch_jobs%rowtype;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND OR (NOT public.has_tenant_role(j.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]) AND NOT public.is_platform_admin(auth.uid())) THEN
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

CREATE OR REPLACE FUNCTION public.dispatch_update_status(_job uuid,_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dispatch_jobs%rowtype;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND OR (NOT public.has_tenant_role(j.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]) AND NOT public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Dispatch access denied';
  END IF;
  IF NOT public.dispatch_status_transition_allowed(j.status,_status) THEN
    RAISE EXCEPTION 'Invalid dispatch transition from % to %',j.status,_status;
  END IF;
  IF j.status=_status THEN RETURN; END IF;
  UPDATE public.dispatch_jobs SET status=_status,updated_at=now() WHERE id=_job;
  IF _status IN ('completed','failed','cancelled') THEN PERFORM public.dispatch_release_resources(j); END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.dispatch_auto_assign_job(_job uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.dispatch_jobs%rowtype; selected_agent uuid; target_lat double precision; target_lng double precision;
BEGIN
  SELECT * INTO job FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND OR (NOT public.has_tenant_role(job.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]) AND NOT public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Dispatch access denied';
  END IF;
  IF job.status<>'unassigned' THEN RAISE EXCEPTION 'Only unassigned jobs can be auto-assigned'; END IF;
  SELECT latitude,longitude INTO target_lat,target_lng FROM public.dispatch_job_stops WHERE job_id=_job ORDER BY position LIMIT 1;
  SELECT agent.id INTO selected_agent
  FROM public.dispatch_agents agent
  LEFT JOIN LATERAL (
    SELECT latitude,longitude FROM public.dispatch_agent_positions position
    WHERE position.agent_id=agent.id AND position.tenant_id=job.tenant_id
    ORDER BY observed_at DESC LIMIT 1
  ) latest ON true
  WHERE agent.tenant_id=job.tenant_id AND agent.product_key=job.product_key AND agent.status='available'
    AND (cardinality(job.required_skills)=0 OR agent.skills @> job.required_skills)
    AND (job.capacity_demand IS NULL OR agent.capacity IS NULL OR agent.capacity>=job.capacity_demand)
  ORDER BY public.geo_haversine_km(latest.latitude,latest.longitude,target_lat,target_lng) NULLS LAST,agent.created_at
  LIMIT 1;
  IF selected_agent IS NULL THEN RAISE EXCEPTION 'No eligible agent is available'; END IF;
  UPDATE public.dispatch_jobs SET assigned_agent_id=selected_agent,status='assigned',updated_at=now() WHERE id=_job;
  UPDATE public.dispatch_agents SET status='busy',updated_at=now() WHERE id=selected_agent;
  RETURN selected_agent;
END; $$;

CREATE OR REPLACE FUNCTION public.fleet_post_wallet_entry(
  _tenant uuid,_agent uuid,_currency text,_entry_type text,_amount_minor bigint,
  _idempotency_key text,_reference_type text DEFAULT NULL,_reference_id text DEFAULT NULL,_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE wallet uuid; result uuid;
BEGIN
  IF NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Fleet wallet access denied'; END IF;
  INSERT INTO public.fleet_wallet_accounts(tenant_id,agent_id,currency)
  VALUES(_tenant,_agent,_currency) ON CONFLICT(tenant_id,agent_id,currency) DO UPDATE SET updated_at=now()
  RETURNING id INTO wallet;
  INSERT INTO public.fleet_wallet_entries(tenant_id,wallet_id,entry_type,amount_minor,idempotency_key,reference_type,reference_id,metadata)
  VALUES(_tenant,wallet,_entry_type,_amount_minor,_idempotency_key,_reference_type,_reference_id,COALESCE(_metadata,'{}'))
  ON CONFLICT(tenant_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING id INTO result;
  RETURN result;
END; $$;


CREATE OR REPLACE FUNCTION public.agent_portal_bind_user(_agent uuid,_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.dispatch_agents%rowtype;
BEGIN
 SELECT * INTO a FROM public.dispatch_agents WHERE id=_agent FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR (
   NOT public.is_platform_admin(auth.uid()) AND
   NOT public.has_tenant_role(a.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 THEN RAISE EXCEPTION 'Agent mapping requires tenant admin'; END IF;
 IF _user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_members m
  WHERE m.tenant_id=a.tenant_id AND m.user_id=_user)
 THEN RAISE EXCEPTION 'Driver must already be a tenant member'; END IF;
 IF _user IS NOT NULL AND EXISTS(SELECT 1 FROM public.dispatch_agents other
  WHERE other.id<>a.id AND other.tenant_id=a.tenant_id
   AND other.product_key=a.product_key AND other.user_id=_user)
 THEN RAISE EXCEPTION 'Another agent already has this user login'; END IF;
 UPDATE public.dispatch_agents SET user_id=_user,updated_at=now() WHERE id=a.id;
END $$;
REVOKE ALL ON FUNCTION public.agent_portal_bind_user(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.agent_portal_bind_user(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_portal_scope(_job uuid)
RETURNS TABLE(tenant_id uuid,product_key text,agent_id uuid,current_status text,job_type text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 RETURN QUERY SELECT j.tenant_id,j.product_key,a.id,j.status,j.job_type
 FROM public.dispatch_jobs j JOIN public.dispatch_agents a
  ON a.id=j.assigned_agent_id AND a.tenant_id=j.tenant_id AND a.product_key=j.product_key
 WHERE j.id=_job AND a.user_id=auth.uid() AND a.status<>'suspended'
  AND public.is_tenant_member(j.tenant_id,auth.uid())
  AND public.has_tenant_entitlement(j.tenant_id,'omniqora.agent');
 IF NOT FOUND THEN RAISE EXCEPTION 'Assigned driver access denied'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.agent_portal_scope(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.agent_portal_status(_job uuid,_new_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE bound record; j public.dispatch_jobs%rowtype;
BEGIN
 SELECT * INTO bound FROM public.agent_portal_scope(_job);
 SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
 IF j.assigned_agent_id IS DISTINCT FROM bound.agent_id OR
  j.tenant_id<>bound.tenant_id OR j.product_key<>bound.product_key
 THEN RAISE EXCEPTION 'Driver assignment changed'; END IF;
 IF _new_status NOT IN ('accepted','en_route','arrived','in_progress','collected',
  'en_route_dropoff','arrived_dropoff','completed','failed')
  OR NOT public.dispatch_status_transition_allowed(j.status,_new_status)
 THEN RAISE EXCEPTION 'Invalid driver status change'; END IF;
 IF _new_status='completed' AND j.job_type ~* '(delivery|courier|food)' AND
  NOT EXISTS(SELECT 1 FROM public.dispatch_pod d
   WHERE d.tenant_id=j.tenant_id AND d.job_id=j.id)
 THEN RAISE EXCEPTION 'Driver attestation required before delivery completion'; END IF;
 IF j.status=_new_status THEN RETURN jsonb_build_object('status',j.status,'replay',true); END IF;
 UPDATE public.dispatch_jobs SET status=_new_status,updated_at=now() WHERE id=j.id;
 IF _new_status IN('completed','failed') THEN PERFORM public.dispatch_release_resources(j); END IF;
 INSERT INTO public.tracking_snapshots(tenant_id,subject_type,subject_id,status,revision,updated_at)
 VALUES(j.tenant_id,'dispatch_job',j.id::text,_new_status,
  (extract(epoch from clock_timestamp())*1000)::bigint,now())
 ON CONFLICT(tenant_id,subject_type,subject_id) DO UPDATE
 SET status=EXCLUDED.status,revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at
 WHERE public.tracking_snapshots.revision<=EXCLUDED.revision;
 RETURN jsonb_build_object('status',_new_status,'replay',false);
END $$;
REVOKE ALL ON FUNCTION public.agent_portal_status(uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.agent_portal_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_portal_position(
 _job uuid,_lat double precision,_lng double precision,
 _observed timestamptz,_accuracy numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE bound record; j public.dispatch_jobs%rowtype;
BEGIN
 SELECT * INTO bound FROM public.agent_portal_scope(_job);
 SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job;
 IF j.assigned_agent_id IS DISTINCT FROM bound.agent_id OR
  j.status IN('completed','failed','cancelled')
 THEN RAISE EXCEPTION 'Only current assigned driver may share GPS'; END IF;
 IF _lat IS NULL OR _lng IS NULL OR _lat NOT BETWEEN -90 AND 90
  OR _lng NOT BETWEEN -180 AND 180 OR _observed IS NULL
  OR _observed<now()-interval '3 minutes' OR _observed>now()+interval '30 seconds'
  OR (_accuracy IS NOT NULL AND (_accuracy<0 OR _accuracy>100000))
 THEN RAISE EXCEPTION 'Invalid GPS sample'; END IF;
 IF EXISTS(SELECT 1 FROM public.dispatch_agent_positions p
   WHERE p.tenant_id=j.tenant_id AND p.agent_id=bound.agent_id
     AND p.job_id=j.id AND p.observed_at>=_observed)
 THEN RETURN jsonb_build_object('ignoredStale',true); END IF;
 INSERT INTO public.dispatch_agent_positions(
  tenant_id,product_key,agent_id,job_id,latitude,longitude,accuracy_metres,observed_at)
 VALUES(j.tenant_id,j.product_key,bound.agent_id,j.id,_lat,_lng,_accuracy,_observed);
 INSERT INTO public.tracking_snapshots(
  tenant_id,subject_type,subject_id,status,latitude,longitude,revision,updated_at)
 VALUES(j.tenant_id,'dispatch_job',j.id::text,j.status,_lat,_lng,
   (extract(epoch from clock_timestamp())*1000)::bigint,now())
 ON CONFLICT(tenant_id,subject_type,subject_id) DO UPDATE
 SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,
  revision=EXCLUDED.revision,updated_at=EXCLUDED.updated_at
 WHERE public.tracking_snapshots.revision<=EXCLUDED.revision;
 RETURN jsonb_build_object('locationRecorded',true);
END $$;
REVOKE ALL ON FUNCTION public.agent_portal_position(uuid,double precision,double precision,timestamptz,numeric) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.agent_portal_position(uuid,double precision,double precision,timestamptz,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_portal_pod(_job uuid,_recipient text,_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE bound record; j public.dispatch_jobs%rowtype; attestation uuid;
BEGIN
 SELECT * INTO bound FROM public.agent_portal_scope(_job);
 SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
 IF j.assigned_agent_id IS DISTINCT FROM bound.agent_id OR
   j.status NOT IN('arrived','in_progress','arrived_dropoff')
 THEN RAISE EXCEPTION 'Driver is not at a recipient stop'; END IF;
 IF length(trim(COALESCE(_recipient,'')))<2 OR length(_recipient)>160 OR
  length(COALESCE(_note,''))>1000 THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
 INSERT INTO public.dispatch_pod(tenant_id,job_id,methods,recipient_name,note,metadata)
 VALUES(j.tenant_id,j.id,ARRAY['driver_attestation'],trim(_recipient),
   NULLIF(trim(COALESCE(_note,'')),''),
   jsonb_build_object('verifiedByRecipient',false))
 ON CONFLICT(job_id) DO NOTHING RETURNING id INTO attestation;
 IF attestation IS NULL THEN SELECT id INTO attestation
   FROM public.dispatch_pod WHERE tenant_id=j.tenant_id AND job_id=j.id; END IF;
 RETURN jsonb_build_object('attestationId',attestation,'verifiedByRecipient',false);
END $$;
REVOKE ALL ON FUNCTION public.agent_portal_pod(uuid,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.agent_portal_pod(uuid,text,text) TO authenticated;
COMMIT;
