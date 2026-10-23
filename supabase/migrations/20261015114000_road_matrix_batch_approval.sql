-- Release-time guarantee: a multi-tile road plan cannot assign drivers until
-- every independently verified tile remains fresh, scoped, and complete.
BEGIN;
CREATE OR REPLACE FUNCTION public.routing_assert_batch_ready(_optimisation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE opt public.routing_optimisation_jobs%rowtype;
 batch public.routing_road_batches%rowtype;
 t record; n integer; expected_tiles integer;tile_count integer:=0;
 cells_seen integer:=0;cell_count integer;row_points jsonb;col_points jsonb;
 provider text:=NULL;quality text:=NULL;age interval;now_stamp timestamptz:=now();
BEGIN
 SELECT * INTO opt FROM public.routing_optimisation_jobs WHERE id=_optimisation FOR UPDATE;
 IF NOT FOUND OR opt.road_batch_id IS NULL THEN
  RAISE EXCEPTION 'Bound routing batch required'; END IF;
 SELECT * INTO batch FROM public.routing_road_batches WHERE id=opt.road_batch_id FOR SHARE;
 IF NOT FOUND OR batch.optimisation_job_id<>opt.id OR
    batch.tenant_id<>opt.tenant_id OR batch.product_key<>opt.product_key
 THEN RAISE EXCEPTION 'Road batch route ownership mismatch'; END IF;
 n:=jsonb_array_length(batch.nodes);
 IF n<9 OR n>16 OR opt.input_snapshot->'matrixNodes' IS DISTINCT FROM batch.nodes
 THEN RAISE EXCEPTION 'Road batch source topology changed'; END IF;
 IF COALESCE((opt.score->>'unassignedJobs')::integer,-1)<>0 OR
    COALESCE((opt.score->>'constraintBreaches')::integer,-1)<>0 OR
    opt.input_snapshot->>'routeQuality' NOT IN('road','traffic')
 THEN RAISE EXCEPTION 'Road batch route cannot be applied with unresolved work'; END IF;
 expected_tiles:=((n+7)/8)*((n+7)/8);
 FOR t IN
  SELECT rt.row_offset,rt.column_offset,rt.tenant_id,rt.product_key,
    m.id AS matrix_id,m.tenant_id AS matrix_tenant,m.product_key AS matrix_product,
    m.travel_mode,m.status,m.quality,m.provider_key,m.completed_at,
    m.origins,m.destinations
  FROM public.routing_road_batch_tiles rt
  JOIN public.routing_matrix_jobs m ON m.id=rt.matrix_job_id
  WHERE rt.batch_id=batch.id
  ORDER BY rt.row_offset,rt.column_offset
 LOOP
  tile_count:=tile_count+1;
  IF t.tenant_id<>batch.tenant_id OR t.product_key<>batch.product_key OR
     t.matrix_tenant<>batch.tenant_id OR t.matrix_product<>batch.product_key OR
     t.travel_mode<>'driving' OR t.status<>'completed' OR
     t.quality NOT IN('road','traffic') OR
     t.provider_key NOT IN('maps.google','maps.openrouteservice') OR
     t.completed_at IS NULL OR t.completed_at>now_stamp
  THEN RAISE EXCEPTION 'Batched road matrix contains unapproved tile'; END IF;
  IF t.quality='traffic' THEN age:=interval '10 minutes';
   ELSE age:=interval '24 hours'; END IF;
  IF t.completed_at<now_stamp-age THEN RAISE EXCEPTION 'Batched road matrix expired'; END IF;
  IF provider IS NOT NULL AND provider<>t.provider_key OR
     quality IS NOT NULL AND quality<>t.quality THEN
   RAISE EXCEPTION 'Mixed road matrix quality or providers'; END IF;
  provider:=t.provider_key;quality:=t.quality;
  SELECT jsonb_agg(x.value ORDER BY x.ordinality) INTO row_points
   FROM jsonb_array_elements(batch.nodes) WITH ORDINALITY x(value,ordinality)
   WHERE x.ordinality>t.row_offset AND x.ordinality<=t.row_offset+8;
  SELECT jsonb_agg(x.value ORDER BY x.ordinality) INTO col_points
   FROM jsonb_array_elements(batch.nodes) WITH ORDINALITY x(value,ordinality)
   WHERE x.ordinality>t.column_offset AND x.ordinality<=t.column_offset+8;
  IF t.origins IS DISTINCT FROM row_points OR t.destinations IS DISTINCT FROM col_points
  THEN RAISE EXCEPTION 'Road matrix tile coordinates differ from route topology'; END IF;
  SELECT count(*) INTO cell_count FROM public.routing_matrix_cells cell
   WHERE cell.matrix_job_id=t.matrix_id AND cell.tenant_id=batch.tenant_id
     AND cell.status IN('ok','unreachable');
  IF cell_count<>jsonb_array_length(row_points)*jsonb_array_length(col_points)
  THEN RAISE EXCEPTION 'Road matrix tile cells incomplete'; END IF;
  cells_seen:=cells_seen+cell_count;
 END LOOP;
 IF tile_count<>expected_tiles OR cells_seen<>n*n OR
    opt.input_snapshot->>'providerKey' IS DISTINCT FROM provider OR
    opt.input_snapshot->>'routeQuality' IS DISTINCT FROM quality
 THEN RAISE EXCEPTION 'Verified batched road route proof mismatch'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.routing_route_plan_stops p
  JOIN public.routing_route_plans rp ON rp.id=p.route_plan_id
  JOIN public.dispatch_job_stops live ON live.id=p.dispatch_stop_id
  WHERE rp.optimisation_job_id=opt.id AND
   (p.tenant_id<>live.tenant_id OR
    abs(p.latitude-live.latitude)>0.0000001 OR
    abs(p.longitude-live.longitude)>0.0000001)
 ) THEN RAISE EXCEPTION 'Dispatch stop coordinates changed after batching'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.routing_assert_batch_ready(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.routing_apply_optimisation(_optimisation uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE o public.routing_optimisation_jobs%rowtype; updated_jobs integer; expected_jobs integer;
BEGIN
 SELECT * INTO o FROM public.routing_optimisation_jobs WHERE id=_optimisation FOR UPDATE;
 IF NOT FOUND OR o.status NOT IN('review','approved') THEN
  RAISE EXCEPTION 'Reviewable routing optimisation required';
 END IF;
 IF NOT public.is_platform_admin(auth.uid())
    AND NOT public.has_tenant_role(o.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Routing plan approval denied';
 END IF;



 IF o.road_batch_id IS NOT NULL THEN
  IF o.matrix_job_id IS NOT NULL THEN RAISE EXCEPTION 'Mixed single and batch road source'; END IF;
  PERFORM public.routing_assert_batch_ready(o.id);
 END IF;

 -- Verified road plans remain bound to a fresh, complete provider receipt.
 IF o.matrix_job_id IS NOT NULL THEN
  DECLARE receipt public.routing_matrix_jobs%rowtype; cell_count integer;
  BEGIN
   SELECT * INTO receipt FROM public.routing_matrix_jobs
   WHERE id=o.matrix_job_id AND tenant_id=o.tenant_id
     AND product_key=o.product_key FOR SHARE;
   IF NOT FOUND OR receipt.status<>'completed' OR receipt.travel_mode<>'driving'
     OR receipt.quality NOT IN('road','traffic')
     OR receipt.provider_key NOT IN('maps.google','maps.openrouteservice')
     OR receipt.completed_at IS NULL OR receipt.completed_at>now()
     OR (receipt.quality='traffic' AND
         receipt.completed_at<now()-interval '10 minutes')
     OR (receipt.quality='road' AND
         receipt.completed_at<now()-interval '24 hours')
   THEN RAISE EXCEPTION 'Road matrix expired, estimated or outside product scope'; END IF;
   IF o.input_snapshot->>'routeQuality' IS DISTINCT FROM receipt.quality OR
      o.input_snapshot->>'providerKey' IS DISTINCT FROM receipt.provider_key
   THEN RAISE EXCEPTION 'Routing evidence no longer matches verified provider'; END IF;
   IF o.score->>'unassignedJobs' IS NULL OR
      (o.score->>'unassignedJobs')::integer<>0
   THEN RAISE EXCEPTION 'Road route leaves unassigned work'; END IF;
   IF receipt.origins IS DISTINCT FROM receipt.destinations OR
      jsonb_typeof(receipt.origins) IS DISTINCT FROM 'array' OR
      jsonb_array_length(receipt.origins)>8
   THEN RAISE EXCEPTION 'Road matrix axes are invalid'; END IF;
   SELECT count(*) INTO cell_count FROM public.routing_matrix_cells cells
   WHERE cells.matrix_job_id=receipt.id AND cells.tenant_id=o.tenant_id;
   IF cell_count<>jsonb_array_length(receipt.origins)*jsonb_array_length(receipt.destinations)
      OR EXISTS(
       SELECT 1 FROM public.routing_matrix_cells cells
       WHERE cells.matrix_job_id=receipt.id AND cells.status='estimated')
   THEN RAISE EXCEPTION 'Road matrix cell proof incomplete'; END IF;
   IF EXISTS(
    SELECT 1 FROM public.routing_route_plan_stops planned
    JOIN public.routing_route_plans plan ON plan.id=planned.route_plan_id
    JOIN public.dispatch_job_stops live ON live.id=planned.dispatch_stop_id
    WHERE plan.optimisation_job_id=o.id AND
     (abs(planned.latitude-live.latitude)>0.0000001 OR
      abs(planned.longitude-live.longitude)>0.0000001 OR
      planned.tenant_id<>live.tenant_id)
   ) THEN RAISE EXCEPTION 'Dispatch stop coordinates changed since road planning'; END IF;
  END;
 END IF;

 -- Atomically guard against stale jobs, forged stop IDs, cross-product resources
 -- and plans which exceed their capability or time-window constraints.
 IF COALESCE((o.score->>'constraintBreaches')::integer,0)>0 THEN
  RAISE EXCEPTION 'Cannot apply route with constraint breaches';
 END IF;
 IF NOT public.has_tenant_entitlement(o.tenant_id,'omniqora.routing-engine')
    AND NOT public.is_platform_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Routing entitlement required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.routing_route_plans rp WHERE rp.optimisation_job_id=o.id)
 THEN RAISE EXCEPTION 'No routes to apply'; END IF;
 PERFORM j.id FROM public.dispatch_jobs j WHERE j.id IN(
  SELECT DISTINCT s.job_id FROM public.routing_route_plan_stops s
  JOIN public.routing_route_plans rp ON rp.id=s.route_plan_id
  WHERE rp.optimisation_job_id=o.id AND s.job_id IS NOT NULL)
  ORDER BY j.id FOR UPDATE;
 PERFORM a.id FROM public.dispatch_agents a WHERE a.id IN(
  SELECT agent_id FROM public.routing_route_plans WHERE optimisation_job_id=o.id)
  ORDER BY a.id FOR UPDATE;
 PERFORM v.id FROM public.dispatch_vehicles v WHERE v.id IN(
  SELECT vehicle_id FROM public.routing_route_plans
  WHERE optimisation_job_id=o.id AND vehicle_id IS NOT NULL)
  ORDER BY v.id FOR UPDATE;
 IF EXISTS(
  SELECT 1 FROM public.routing_route_plans rp
  LEFT JOIN public.dispatch_agents a ON a.id=rp.agent_id
   AND a.tenant_id=o.tenant_id AND a.product_key=o.product_key AND a.status='available'
  LEFT JOIN public.dispatch_vehicles v ON v.id=rp.vehicle_id
   AND v.tenant_id=o.tenant_id AND v.product_key=o.product_key AND v.status='available'
  WHERE rp.optimisation_job_id=o.id AND
   (rp.tenant_id<>o.tenant_id OR rp.product_key<>o.product_key OR rp.status<>'review'
    OR a.id IS NULL OR (rp.vehicle_id IS NOT NULL AND v.id IS NULL)
    OR NOT EXISTS(SELECT 1 FROM public.routing_route_plan_stops s WHERE s.route_plan_id=rp.id))
 ) THEN RAISE EXCEPTION 'Unavailable or cross-tenant route resources'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.routing_route_plans rp
  WHERE rp.optimisation_job_id=o.id
  GROUP BY rp.agent_id HAVING count(*)>1
 ) OR EXISTS(
  SELECT 1 FROM public.routing_route_plans rp
  WHERE rp.optimisation_job_id=o.id AND rp.vehicle_id IS NOT NULL
  GROUP BY rp.vehicle_id HAVING count(*)>1
 ) THEN RAISE EXCEPTION 'Resource assigned more than once'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.routing_route_plan_stops s
  JOIN public.routing_route_plans rp ON rp.id=s.route_plan_id
  LEFT JOIN public.dispatch_jobs j ON j.id=s.job_id
   AND j.tenant_id=o.tenant_id AND j.product_key=o.product_key AND j.status='unassigned'
  LEFT JOIN public.dispatch_job_stops ds ON ds.id=s.dispatch_stop_id
   AND ds.tenant_id=o.tenant_id AND ds.job_id=s.job_id
  LEFT JOIN public.dispatch_agents a ON a.id=rp.agent_id
  LEFT JOIN public.dispatch_vehicles v ON v.id=rp.vehicle_id
  WHERE rp.optimisation_job_id=o.id AND
    (s.tenant_id<>o.tenant_id OR j.id IS NULL OR ds.id IS NULL OR s.constraint_state='breach'
     OR NOT (a.skills @> j.required_skills)
     OR (j.capacity_demand IS NOT NULL AND a.capacity IS NOT NULL
         AND a.capacity<j.capacity_demand)
     OR (cardinality(j.required_vehicle_types)>0 AND
         (v.id IS NULL OR NOT v.vehicle_type=ANY(j.required_vehicle_types)))
     OR (v.id IS NOT NULL AND j.capacity_demand IS NOT NULL
         AND v.capacity IS NOT NULL AND v.capacity<j.capacity_demand))
 ) THEN RAISE EXCEPTION 'Stale job or invalid planned stop'; END IF;
 IF EXISTS(
  SELECT 1 FROM (
    SELECT s.job_id,count(DISTINCT s.dispatch_stop_id) AS planned
    FROM public.routing_route_plan_stops s
    JOIN public.routing_route_plans rp ON rp.id=s.route_plan_id
    WHERE rp.optimisation_job_id=o.id AND s.job_id IS NOT NULL GROUP BY s.job_id
  ) planned
  WHERE planned.planned<>(SELECT count(*) FROM public.dispatch_job_stops ds
    WHERE ds.job_id=planned.job_id)
 ) THEN RAISE EXCEPTION 'Incomplete job stop plan'; END IF;

 IF EXISTS(
  SELECT s.job_id
  FROM public.routing_route_plan_stops s
  JOIN public.routing_route_plans p ON p.id=s.route_plan_id
  WHERE p.optimisation_job_id=o.id AND s.job_id IS NOT NULL
  GROUP BY s.job_id HAVING count(DISTINCT p.id)>1
 ) THEN RAISE EXCEPTION 'A job appears in multiple route plans'; END IF;

 UPDATE public.dispatch_jobs j
 SET assigned_agent_id=p.agent_id,assigned_vehicle_id=p.vehicle_id,status='assigned',updated_at=now()
 FROM (
  SELECT DISTINCT ON(s.job_id) s.job_id,rp.agent_id,rp.vehicle_id
  FROM public.routing_route_plan_stops s
  JOIN public.routing_route_plans rp ON rp.id=s.route_plan_id
  WHERE rp.optimisation_job_id=o.id AND s.job_id IS NOT NULL
  ORDER BY s.job_id,s.sequence
 ) p
 WHERE j.id=p.job_id AND j.tenant_id=o.tenant_id
  AND j.product_key=o.product_key AND j.status='unassigned';
 GET DIAGNOSTICS updated_jobs=ROW_COUNT;
 SELECT count(DISTINCT s.job_id) INTO expected_jobs
 FROM public.routing_route_plan_stops s JOIN public.routing_route_plans rp
 ON rp.id=s.route_plan_id WHERE rp.optimisation_job_id=o.id AND s.job_id IS NOT NULL;
 IF updated_jobs<>expected_jobs THEN RAISE EXCEPTION 'Concurrent route change'; END IF;

 UPDATE public.dispatch_agents a SET status='busy',updated_at=now()
 WHERE a.id IN(
  SELECT DISTINCT agent_id FROM public.routing_route_plans
  WHERE optimisation_job_id=o.id AND agent_id IS NOT NULL
 ) AND a.tenant_id=o.tenant_id AND a.product_key=o.product_key;
 UPDATE public.dispatch_vehicles v SET status='assigned',updated_at=now()
 WHERE v.id IN(
  SELECT DISTINCT vehicle_id FROM public.routing_route_plans
  WHERE optimisation_job_id=o.id AND vehicle_id IS NOT NULL
 ) AND v.tenant_id=o.tenant_id AND v.product_key=o.product_key;
 UPDATE public.routing_route_plans SET status='applied',updated_at=now()
 WHERE optimisation_job_id=o.id;
 UPDATE public.routing_optimisation_jobs
 SET status='applied',reviewed_by=auth.uid(),reviewed_at=COALESCE(reviewed_at,now()),completed_at=COALESCE(completed_at,now())
 WHERE id=o.id;
END $$;


REVOKE ALL ON FUNCTION public.routing_apply_optimisation(uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.routing_apply_optimisation(uuid)
 TO authenticated;
COMMIT;
