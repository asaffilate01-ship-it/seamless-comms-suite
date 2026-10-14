-- Matrix execution receipts are server-only and atomic. Restrict client table mutation.
BEGIN;
REVOKE INSERT,UPDATE,DELETE ON public.routing_matrix_jobs,public.routing_matrix_cells
 FROM authenticated;
DROP POLICY IF EXISTS "routing tenant write routing_matrix_jobs" ON public.routing_matrix_jobs;
DROP POLICY IF EXISTS "routing tenant read routing_matrix_jobs" ON public.routing_matrix_jobs;
DROP POLICY IF EXISTS "routing tenant write routing_matrix_cells" ON public.routing_matrix_cells;
DROP POLICY IF EXISTS "routing tenant read routing_matrix_cells" ON public.routing_matrix_cells;
CREATE POLICY "matrix jobs admin read" ON public.routing_matrix_jobs FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR
 public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "matrix cells admin read" ON public.routing_matrix_cells FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR
 public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE OR REPLACE FUNCTION public.service_complete_road_matrix(
 _tenant uuid,_product text,_job uuid,_provider text,_quality text,_cells jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.routing_matrix_jobs%rowtype; v jsonb;
 n integer;m integer;cnt integer:=0;orig integer;dest integer;state text;
 metres bigint;seconds bigint;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role'
 THEN RAISE EXCEPTION 'Platform worker required'; END IF;
 SELECT * INTO j FROM public.routing_matrix_jobs
 WHERE id=_job AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF NOT FOUND OR j.status<>'running' THEN
  RAISE EXCEPTION 'Claimed scoped road matrix required'; END IF;
 IF _provider NOT IN('maps.google','maps.openrouteservice','routing.native') OR
  _quality NOT IN('road','traffic','straight_line_estimate') OR
  (_quality='traffic' AND _provider<>'maps.google') OR
  (_quality='straight_line_estimate' AND _provider<>'routing.native')
 THEN RAISE EXCEPTION 'Invalid matrix origin or quality'; END IF;
 n:=jsonb_array_length(j.origins);m:=jsonb_array_length(j.destinations);
 IF jsonb_typeof(_cells) IS DISTINCT FROM 'array' OR
  jsonb_array_length(_cells)<>n*m OR n>8 OR m>8 OR n<1 OR m<1
 THEN RAISE EXCEPTION 'Matrix cell count mismatch'; END IF;
 FOR v IN SELECT value FROM jsonb_array_elements(_cells) LOOP
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR
   jsonb_typeof(v->'originIndex') IS DISTINCT FROM 'number' OR
   jsonb_typeof(v->'destinationIndex') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'Invalid matrix cell'; END IF;
  orig:=(v->>'originIndex')::integer;dest:=(v->>'destinationIndex')::integer;
  state:=v->>'status';
  IF orig<0 OR orig>=n OR dest<0 OR dest>=m OR
    state NOT IN('ok','estimated','unreachable') OR
    (state='estimated' AND _quality<>'straight_line_estimate') OR
    (_quality='straight_line_estimate' AND state<>'estimated')
  THEN RAISE EXCEPTION 'Matrix cell scope or quality mismatch'; END IF;
  metres:=NULL;seconds:=NULL;
  IF v->'distanceMetres' IS NOT NULL AND v->'distanceMetres'<>'null'::jsonb THEN
   IF jsonb_typeof(v->'distanceMetres') IS DISTINCT FROM 'number'
   THEN RAISE EXCEPTION 'Invalid distance'; END IF;
   metres:=(v->>'distanceMetres')::bigint;
  END IF;
  IF v->'durationSeconds' IS NOT NULL AND v->'durationSeconds'<>'null'::jsonb THEN
   IF jsonb_typeof(v->'durationSeconds') IS DISTINCT FROM 'number'
   THEN RAISE EXCEPTION 'Invalid duration'; END IF;
   seconds:=(v->>'durationSeconds')::bigint;
  END IF;
  IF (metres IS NOT NULL AND (metres<0 OR metres>1000000000)) OR
    (seconds IS NOT NULL AND (seconds<0 OR seconds>1000000000)) OR
    (state='ok' AND (metres IS NULL OR seconds IS NULL)) OR
    (state='unreachable' AND (metres IS NOT NULL OR seconds IS NOT NULL)) OR
    (state='estimated' AND (metres IS NULL OR seconds IS NOT NULL))
  THEN RAISE EXCEPTION 'Invalid distance/duration/quality combination'; END IF;
  INSERT INTO public.routing_matrix_cells(matrix_job_id,tenant_id,origin_index,
   destination_index,distance_metres,duration_seconds,status,metadata)
  VALUES(j.id,j.tenant_id,orig,dest,metres,seconds,state,
   jsonb_build_object('quality',_quality,'provider',_provider));
  cnt:=cnt+1;
 END LOOP;
 UPDATE public.routing_matrix_jobs
 SET status=CASE WHEN _quality='straight_line_estimate' THEN 'fallback' ELSE 'completed' END,
     provider_key=_provider,quality=_quality,
     provider_ref=NULL,fallback_used=(_quality='straight_line_estimate'),
     error=NULL,completed_at=now()
 WHERE id=j.id;
 IF _provider<>'routing.native' THEN
  INSERT INTO public.routing_provider_observations(
   tenant_id,product_key,provider_key,operation,succeeded,metadata)
  VALUES(_tenant,_product,_provider,'matrix',true,
    jsonb_build_object('matrixJobId',j.id,'quality',_quality,'elements',cnt));
 END IF;
 RETURN cnt;
END $$;
REVOKE ALL ON FUNCTION public.service_complete_road_matrix(uuid,text,uuid,text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_complete_road_matrix(uuid,text,uuid,text,text,jsonb)
 TO service_role;
COMMIT;