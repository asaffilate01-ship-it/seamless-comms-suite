-- Transaction-safe Dispatch/Fleet operations.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_dispatch_job(
  _tenant uuid,
  _tenant_product uuid,
  _product_key text,
  _location uuid,
  _job_type text,
  _priority text,
  _required_skills text[],
  _required_vehicle_types text[],
  _capacity numeric,
  _scheduled_at timestamptz,
  _external_ref text,
  _metadata jsonb,
  _stops jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j uuid;
  item jsonb;
  pos integer := 0;
BEGIN
  IF NOT public.can_write(_tenant,auth.uid()) THEN RAISE EXCEPTION 'Dispatch write access denied'; END IF;
  IF NOT public.has_module_entitlement(_tenant,_tenant_product,'dispatch.core',now()) THEN RAISE EXCEPTION 'Dispatch entitlement required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_products WHERE id=_tenant_product AND tenant_id=_tenant AND product_key=_product_key AND status='active') THEN
    RAISE EXCEPTION 'Tenant product scope invalid';
  END IF;
  IF _location IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenant_locations WHERE id=_location AND tenant_id=_tenant AND tenant_product_id=_tenant_product AND status='active') THEN
    RAISE EXCEPTION 'Dispatch location scope invalid';
  END IF;
  IF _priority NOT IN ('low','normal','high','urgent') THEN RAISE EXCEPTION 'Invalid priority'; END IF;
  IF jsonb_typeof(COALESCE(_stops,'[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(_stops,'[]'::jsonb)) < 1 THEN
    RAISE EXCEPTION 'At least one dispatch stop is required';
  END IF;

  INSERT INTO public.dispatch_jobs(
    tenant_id,tenant_product_id,location_id,product_key,job_type,status,priority,required_skills,required_vehicle_types,capacity_demand,scheduled_at,external_ref,metadata
  ) VALUES (
    _tenant,_tenant_product,_location,_product_key,btrim(_job_type),'unassigned',_priority,COALESCE(_required_skills,ARRAY[]::text[]),COALESCE(_required_vehicle_types,ARRAY[]::text[]),_capacity,_scheduled_at,NULLIF(btrim(_external_ref),''),COALESCE(_metadata,'{}'::jsonb)
  ) RETURNING id INTO j;

  FOR item IN SELECT value FROM jsonb_array_elements(_stops)
  LOOP
    IF COALESCE(item->>'kind','') NOT IN ('pickup','dropoff','service','return') THEN RAISE EXCEPTION 'Invalid dispatch stop kind'; END IF;
    IF (item->>'lat') IS NULL OR (item->>'lng') IS NULL THEN RAISE EXCEPTION 'Dispatch stop coordinates required'; END IF;
    INSERT INTO public.dispatch_job_stops(
      job_id,tenant_id,position,stop_kind,latitude,longitude,address,contact_name,contact_phone,instructions,window_start,window_end,service_seconds,metadata
    ) VALUES (
      j,_tenant,pos,item->>'kind',(item->>'lat')::double precision,(item->>'lng')::double precision,
      NULLIF(item->>'address',''),NULLIF(item->>'contactName',''),NULLIF(item->>'contactPhone',''),NULLIF(item->>'instructions',''),
      NULLIF(item->>'windowStart','')::timestamptz,NULLIF(item->>'windowEnd','')::timestamptz,COALESCE((item->>'serviceSeconds')::integer,0),COALESCE(item->'metadata','{}'::jsonb)
    );
    pos := pos + 1;
  END LOOP;

  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
  VALUES(_tenant,auth.uid(),'dispatch.job.created','dispatch_job',j::text,jsonb_build_object('product_key',_product_key,'job_type',_job_type));
  RETURN j;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_dispatch_job_status(_job uuid,_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE j public.dispatch_jobs; allowed boolean := false;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND OR NOT public.can_write(j.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'Dispatch job access denied'; END IF;
  IF NOT public.has_module_entitlement(j.tenant_id,j.tenant_product_id,'dispatch.core',now()) THEN RAISE EXCEPTION 'Dispatch entitlement required'; END IF;

  allowed := CASE j.status
    WHEN 'draft' THEN _status IN ('unassigned','cancelled')
    WHEN 'unassigned' THEN _status IN ('offered','assigned','cancelled')
    WHEN 'offered' THEN _status IN ('assigned','accepted','unassigned','cancelled')
    WHEN 'assigned' THEN _status IN ('accepted','unassigned','cancelled')
    WHEN 'accepted' THEN _status IN ('en_route','en_route_pickup','cancelled')
    WHEN 'en_route' THEN _status IN ('arrived','failed')
    WHEN 'arrived' THEN _status IN ('in_progress','completed','failed')
    WHEN 'in_progress' THEN _status IN ('completed','failed')
    WHEN 'en_route_pickup' THEN _status IN ('arrived_pickup','failed')
    WHEN 'arrived_pickup' THEN _status IN ('collected','failed')
    WHEN 'collected' THEN _status IN ('en_route_dropoff','failed')
    WHEN 'en_route_dropoff' THEN _status IN ('arrived_dropoff','failed')
    WHEN 'arrived_dropoff' THEN _status IN ('completed','failed')
    ELSE false
  END;
  IF NOT allowed THEN RAISE EXCEPTION 'Invalid dispatch status transition: % -> %',j.status,_status; END IF;

  UPDATE public.dispatch_jobs SET status=_status,updated_at=now() WHERE id=_job;
  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
  VALUES(j.tenant_id,auth.uid(),'dispatch.job.status_changed','dispatch_job',j.id::text,jsonb_build_object('from',j.status,'to',_status));
END;
$$;

CREATE OR REPLACE FUNCTION public.record_dispatch_pod(
  _job uuid,_methods text[],_evidence_refs text[],_recipient_name text,_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE j public.dispatch_jobs; p uuid;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND OR NOT public.can_write(j.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'Dispatch job access denied'; END IF;
  IF j.status NOT IN ('arrived','in_progress','arrived_dropoff') THEN RAISE EXCEPTION 'Job is not ready for proof of delivery/service'; END IF;
  IF cardinality(COALESCE(_methods,ARRAY[]::text[]))=0 THEN RAISE EXCEPTION 'POD method required'; END IF;
  INSERT INTO public.dispatch_pod(tenant_id,job_id,completed_at,methods,evidence_refs,recipient_name,note)
  VALUES(j.tenant_id,j.id,now(),_methods,COALESCE(_evidence_refs,ARRAY[]::text[]),NULLIF(btrim(_recipient_name),''),NULLIF(btrim(_note),''))
  ON CONFLICT (job_id) DO UPDATE SET completed_at=EXCLUDED.completed_at,methods=EXCLUDED.methods,evidence_refs=EXCLUDED.evidence_refs,recipient_name=EXCLUDED.recipient_name,note=EXCLUDED.note
  RETURNING id INTO p;
  UPDATE public.dispatch_jobs SET status='completed',updated_at=now() WHERE id=j.id;
  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
  VALUES(j.tenant_id,auth.uid(),'dispatch.pod.recorded','dispatch_job',j.id::text,jsonb_build_object('pod_id',p,'methods',_methods));
  RETURN p;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_dispatch_job(uuid,uuid,text,uuid,text,text,text[],text[],numeric,timestamptz,text,jsonb,jsonb) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.update_dispatch_job_status(uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.record_dispatch_pod(uuid,text[],text[],text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_dispatch_job(uuid,uuid,text,uuid,text,text,text[],text[],numeric,timestamptz,text,jsonb,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.update_dispatch_job_status(uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_dispatch_pod(uuid,text[],text[],text,text) TO authenticated,service_role;

COMMIT;