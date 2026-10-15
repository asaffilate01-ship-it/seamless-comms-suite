-- Road-aware routing Phase 5: atomic four-tile 16-node matrix admission.
-- The 8x8 provider limits, idempotency and existing 8-request/256-cell daily
-- tenant quota remain untouched. Nothing activates external providers.
BEGIN;

CREATE TABLE public.routing_matrix_batches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 optimisation_job_id uuid NOT NULL UNIQUE REFERENCES public.routing_optimisation_jobs(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 nodes jsonb NOT NULL,
 tile_count integer NOT NULL DEFAULT 4 CHECK(tile_count=4),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','completed','failed')),
 assembled_matrix_job_id uuid UNIQUE REFERENCES public.routing_matrix_jobs(id) ON DELETE SET NULL,
 requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(tenant_id,product_key,request_key)
);
CREATE INDEX routing_matrix_batches_scope_idx
 ON public.routing_matrix_batches(tenant_id,product_key,status,created_at DESC);

CREATE TABLE public.routing_matrix_batch_tiles(
 batch_id uuid NOT NULL REFERENCES public.routing_matrix_batches(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 row_start integer NOT NULL CHECK(row_start IN(0,8)),
 col_start integer NOT NULL CHECK(col_start IN(0,8)),
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 8),
 col_count integer NOT NULL CHECK(col_count BETWEEN 1 AND 8),
 matrix_job_id uuid NOT NULL UNIQUE REFERENCES public.routing_matrix_jobs(id) ON DELETE RESTRICT,
 PRIMARY KEY(batch_id,row_start,col_start)
);

ALTER TABLE public.routing_matrix_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_matrix_batch_tiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.routing_matrix_batches,public.routing_matrix_batch_tiles FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.routing_matrix_batches,public.routing_matrix_batch_tiles TO service_role;
GRANT SELECT ON public.routing_matrix_batches,public.routing_matrix_batch_tiles TO authenticated;
CREATE POLICY "road batch admin read" ON public.routing_matrix_batches FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR
 public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "road batch tiles admin read" ON public.routing_matrix_batch_tiles FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR
 public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.routing_queue_optimisation_tiles(
 _optimisation uuid,_nodes jsonb,_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.routing_optimisation_jobs%rowtype;
 existing public.routing_matrix_batches%rowtype;
 b uuid;n integer;i integer;k integer;row_start integer;col_start integer;
 from_nodes jsonb;to_nodes jsonb;job uuid;pt jsonb;
BEGIN
 SELECT * INTO o FROM public.routing_optimisation_jobs
 WHERE id=_optimisation FOR UPDATE;
 IF NOT FOUND OR o.status<>'queued' OR o.matrix_job_id IS NOT NULL OR _request_key IS NULL
 THEN RAISE EXCEPTION 'Unbound queued optimisation and request key required'; END IF;
 IF auth.uid() IS NULL OR
   (NOT public.is_platform_admin(auth.uid()) AND
    NOT public.has_tenant_role(o.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 THEN RAISE EXCEPTION 'Routing administrator required'; END IF;
 IF NOT public.has_tenant_entitlement(o.tenant_id,'omniqora.routing-engine')
 THEN RAISE EXCEPTION 'Routing entitlement required'; END IF;
 IF jsonb_typeof(_nodes) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Road topology must be a coordinate array'; END IF;
 n:=jsonb_array_length(_nodes);
 IF n<9 OR n>16 OR (
  SELECT count(DISTINCT point.value) FROM jsonb_array_elements(_nodes) AS point(value)
 )<>n THEN RAISE EXCEPTION 'Tiled route requires nine to sixteen unique coordinates'; END IF;
 FOR pt IN SELECT value FROM jsonb_array_elements(_nodes) LOOP
  IF jsonb_typeof(pt) IS DISTINCT FROM 'object'
   OR jsonb_typeof(pt->'lat') IS DISTINCT FROM 'number'
   OR jsonb_typeof(pt->'lng') IS DISTINCT FROM 'number'
   OR (pt->>'lat')::numeric NOT BETWEEN -90 AND 90
   OR (pt->>'lng')::numeric NOT BETWEEN -180 AND 180
  THEN RAISE EXCEPTION 'Invalid road topology coordinate'; END IF;
 END LOOP;
 SELECT * INTO existing FROM public.routing_matrix_batches
 WHERE optimisation_job_id=o.id FOR UPDATE;
 IF FOUND THEN
  IF existing.nodes IS DISTINCT FROM _nodes
   THEN RAISE EXCEPTION 'Queued route topology changed; new optimisation required'; END IF;
  RETURN jsonb_build_object('batchId',existing.id,'tileCount',4,
   'reused',true,'status',existing.status);
 END IF;
 INSERT INTO public.routing_matrix_batches(
  tenant_id,product_key,optimisation_job_id,request_key,nodes,tile_count,requested_by)
 VALUES(o.tenant_id,o.product_key,o.id,_request_key,_nodes,4,auth.uid())
 RETURNING id INTO b;
 FOR i IN 0..1 LOOP
  row_start:=i*8;
  SELECT jsonb_agg(value ORDER BY ordinality) INTO from_nodes
  FROM jsonb_array_elements(_nodes) WITH ORDINALITY AS item(value,ordinality)
  WHERE ordinality BETWEEN row_start+1 AND LEAST(n,row_start+8);
  FOR k IN 0..1 LOOP
   col_start:=k*8;
   SELECT jsonb_agg(value ORDER BY ordinality) INTO to_nodes
   FROM jsonb_array_elements(_nodes) WITH ORDINALITY AS item(value,ordinality)
   WHERE ordinality BETWEEN col_start+1 AND LEAST(n,col_start+8);
   job:=public.routing_queue_matrix(o.tenant_id,o.product_key,'driving',
    from_nodes,to_nodes,false,gen_random_uuid());
   INSERT INTO public.routing_matrix_batch_tiles(
    batch_id,tenant_id,product_key,row_start,col_start,row_count,col_count,matrix_job_id)
   VALUES(b,o.tenant_id,o.product_key,row_start,col_start,
    jsonb_array_length(from_nodes),jsonb_array_length(to_nodes),job);
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('batchId',b,'tileCount',4,'reused',false,
  'requestedElements',n*n,'status','queued');
END $$;
REVOKE ALL ON FUNCTION public.routing_queue_optimisation_tiles(uuid,jsonb,uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.routing_queue_optimisation_tiles(uuid,jsonb,uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.routing_finalize_optimisation_tiles(_optimisation uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.routing_optimisation_jobs%rowtype;
 b public.routing_matrix_batches%rowtype;
 t record; n integer;tile_count integer;cell_count integer;
 inserted_count integer;aggregate_id uuid;
 first_provider text;oldest timestamptz;
 axis_origins jsonb;axis_destinations jsonb;
 active_binding boolean;
BEGIN
 SELECT * INTO o FROM public.routing_optimisation_jobs
 WHERE id=_optimisation FOR UPDATE;
 IF NOT FOUND OR o.status<>'queued' THEN
  RAISE EXCEPTION 'Queued routing optimisation required'; END IF;
 IF auth.uid() IS NULL OR
   (NOT public.is_platform_admin(auth.uid()) AND
    NOT public.has_tenant_role(o.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 THEN RAISE EXCEPTION 'Routing administrator required'; END IF;
 IF NOT public.has_tenant_entitlement(o.tenant_id,'omniqora.routing-engine')
 THEN RAISE EXCEPTION 'Routing entitlement required'; END IF;
 SELECT * INTO b FROM public.routing_matrix_batches
 WHERE optimisation_job_id=o.id AND tenant_id=o.tenant_id
  AND product_key=o.product_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No batch for routing optimisation'; END IF;
 IF b.status='completed' AND b.assembled_matrix_job_id IS NOT NULL
   AND o.matrix_job_id=b.assembled_matrix_job_id THEN
  RETURN b.assembled_matrix_job_id;
 END IF;
 IF b.status<>'queued' OR o.matrix_job_id IS NOT NULL
 THEN RAISE EXCEPTION 'Batch no longer available for finalisation'; END IF;
 n:=jsonb_array_length(b.nodes);
 IF n NOT BETWEEN 9 AND 16 THEN RAISE EXCEPTION 'Invalid batch topology'; END IF;
 SELECT count(*) INTO tile_count FROM public.routing_matrix_batch_tiles
 WHERE batch_id=b.id AND tenant_id=o.tenant_id AND product_key=o.product_key;
 IF tile_count<>4 THEN RAISE EXCEPTION 'Four source tiles required'; END IF;
 FOR t IN
  SELECT tiles.*,job.status AS job_status,job.quality,job.provider_key,
    job.completed_at,job.origins,job.destinations,job.travel_mode,job.fallback_used
  FROM public.routing_matrix_batch_tiles tiles
  JOIN public.routing_matrix_jobs job ON job.id=tiles.matrix_job_id
  WHERE tiles.batch_id=b.id AND tiles.tenant_id=o.tenant_id
    AND tiles.product_key=o.product_key AND job.tenant_id=o.tenant_id
    AND job.product_key=o.product_key ORDER BY tiles.row_start,tiles.col_start
 LOOP
  IF t.job_status<>'completed' OR t.quality<>'road'
   OR t.provider_key<>'maps.openrouteservice'
   OR t.travel_mode<>'driving' OR t.fallback_used OR t.completed_at IS NULL
   OR t.completed_at>now() OR t.completed_at<now()-interval '24 hours'
  THEN RAISE EXCEPTION 'Four fresh approved road tiles required'; END IF;
  SELECT jsonb_agg(value ORDER BY ordinality) INTO axis_origins
  FROM jsonb_array_elements(b.nodes) WITH ORDINALITY AS item(value,ordinality)
  WHERE ordinality BETWEEN t.row_start+1 AND LEAST(n,t.row_start+8);
  SELECT jsonb_agg(value ORDER BY ordinality) INTO axis_destinations
  FROM jsonb_array_elements(b.nodes) WITH ORDINALITY AS item(value,ordinality)
  WHERE ordinality BETWEEN t.col_start+1 AND LEAST(n,t.col_start+8);
  IF t.origins IS DISTINCT FROM axis_origins OR
     t.destinations IS DISTINCT FROM axis_destinations OR
     t.row_count<>jsonb_array_length(axis_origins) OR
     t.col_count<>jsonb_array_length(axis_destinations)
  THEN RAISE EXCEPTION 'Matrix tile coordinates or dimensions have changed'; END IF;
  SELECT count(*) INTO cell_count FROM public.routing_matrix_cells c
  WHERE c.matrix_job_id=t.matrix_job_id AND c.tenant_id=o.tenant_id
   AND c.status IN('ok','unreachable');
  IF cell_count<>t.row_count*t.col_count
  THEN RAISE EXCEPTION 'Matrix tile is incomplete or estimated'; END IF;
  first_provider:=COALESCE(first_provider,t.provider_key);
  IF first_provider<>t.provider_key THEN
   RAISE EXCEPTION 'Road provider changed between tiles'; END IF;
  oldest:=LEAST(COALESCE(oldest,t.completed_at),t.completed_at);
 END LOOP;
 SELECT EXISTS(
  SELECT 1 FROM public.provider_bindings p
  WHERE p.tenant_id=o.tenant_id AND p.product_key=o.product_key
   AND p.provider_key='maps.openrouteservice' AND p.environment='production'
   AND p.brand_id IS NULL AND p.location_id IS NULL AND p.status='active'
   AND p.last_verified_at BETWEEN now()-interval '7 days' AND now()
   AND p.health->>'matrixReady'='true'
   AND p.health->>'independentlyVerified'='true'
   AND length(COALESCE(p.secret_refs->>'api_key',''))>0
 ) INTO active_binding;
 IF NOT active_binding THEN
  RAISE EXCEPTION 'Verified production road provider binding required'; END IF;
 INSERT INTO public.routing_matrix_jobs(
  tenant_id,product_key,travel_mode,provider_key,origins,destinations,
  options,status,quality,requested_by,completed_at,fallback_used)
 VALUES(o.tenant_id,o.product_key,'driving',first_provider,b.nodes,b.nodes,
   jsonb_build_object('aggregateBatchId',b.id),'completed','road',auth.uid(),
   oldest,false) RETURNING id INTO aggregate_id;
 INSERT INTO public.routing_matrix_cells(
  matrix_job_id,tenant_id,origin_index,destination_index,
  distance_metres,duration_seconds,status,metadata)
 SELECT aggregate_id,o.tenant_id,t.row_start+c.origin_index,
  t.col_start+c.destination_index,c.distance_metres,c.duration_seconds,
  c.status,c.metadata||jsonb_build_object('sourceTile',t.matrix_job_id)
 FROM public.routing_matrix_batch_tiles t
 JOIN public.routing_matrix_cells c ON c.matrix_job_id=t.matrix_job_id
 WHERE t.batch_id=b.id AND t.tenant_id=o.tenant_id
  AND c.tenant_id=o.tenant_id;
 GET DIAGNOSTICS inserted_count=ROW_COUNT;
 IF inserted_count<>n*n THEN RAISE EXCEPTION 'Road batch assembly incomplete'; END IF;
 UPDATE public.routing_matrix_batches
 SET status='completed',assembled_matrix_job_id=aggregate_id,completed_at=now()
 WHERE id=b.id;
 UPDATE public.routing_optimisation_jobs
 SET matrix_job_id=aggregate_id,
  input_snapshot=COALESCE(input_snapshot,'{}'::jsonb)||
    jsonb_build_object('matrixBatchId',b.id,'matrixNodes',b.nodes,
     'matrixTileCount',4,'planningMode','tiled_road_required')
 WHERE id=o.id;
 RETURN aggregate_id;
END $$;
REVOKE ALL ON FUNCTION public.routing_finalize_optimisation_tiles(uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.routing_finalize_optimisation_tiles(uuid)
 TO authenticated;
COMMIT;
