-- Road-matrix batching: 9..16 unique points in four <=8x8 matrix jobs.
-- Preserves existing eight-request/256-element daily quota per tenant/product.
BEGIN;
CREATE TABLE public.routing_road_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 optimisation_job_id uuid NOT NULL UNIQUE REFERENCES public.routing_optimisation_jobs(id) ON DELETE CASCADE,
 request_key uuid NOT NULL,
 nodes jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 UNIQUE(tenant_id,product_key,request_key)
);
CREATE TABLE public.routing_road_batch_tiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 batch_id uuid NOT NULL REFERENCES public.routing_road_batches(id) ON DELETE CASCADE,
 row_offset integer NOT NULL CHECK(row_offset IN(0,8)),
 column_offset integer NOT NULL CHECK(column_offset IN(0,8)),
 matrix_job_id uuid NOT NULL UNIQUE REFERENCES public.routing_matrix_jobs(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(batch_id,row_offset,column_offset)
);
ALTER TABLE public.routing_optimisation_jobs
 ADD COLUMN road_batch_id uuid REFERENCES public.routing_road_batches(id) ON DELETE SET NULL;
CREATE INDEX routing_road_batch_scope_idx
 ON public.routing_road_batches(tenant_id,product_key,created_at DESC);
CREATE INDEX routing_road_batch_tiles_scope_idx
 ON public.routing_road_batch_tiles(batch_id,row_offset,column_offset);

DO $$ DECLARE table_name text; BEGIN
 FOREACH table_name IN ARRAY ARRAY['routing_road_batches','routing_road_batch_tiles'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',table_name);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',table_name);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',table_name);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY[''owner'',''admin'']::public.app_role[]))',
   'road batch operator read '||table_name,table_name);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.routing_queue_matrix_batch(
 _optimisation uuid,_nodes jsonb,_request_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE opt public.routing_optimisation_jobs%rowtype;
 batch_id uuid; n integer; row_idx integer; col_idx integer;
 row_points jsonb;col_points jsonb; matrix_id uuid;
BEGIN
 IF auth.uid() IS NULL OR _request_key IS NULL THEN
  RAISE EXCEPTION 'Authenticated idempotent matrix batch required';
 END IF;
 SELECT * INTO opt FROM public.routing_optimisation_jobs
 WHERE id=_optimisation FOR UPDATE;
 IF NOT FOUND OR opt.status<>'queued' THEN
  RAISE EXCEPTION 'Queued route plan required';
 END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(
  opt.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])
 THEN RAISE EXCEPTION 'Road routing administrator required'; END IF;
 IF NOT public.has_tenant_entitlement(opt.tenant_id,'omniqora.routing-engine')
 THEN RAISE EXCEPTION 'Routing entitlement required'; END IF;
 IF opt.road_batch_id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.routing_road_batches b WHERE b.id=opt.road_batch_id
    AND b.request_key=_request_key AND b.nodes=_nodes)
  THEN RETURN opt.road_batch_id; END IF;
  RAISE EXCEPTION 'Routing plan already bound to a different batch';
 END IF;
 IF opt.matrix_job_id IS NOT NULL THEN
  RAISE EXCEPTION 'Routing plan already bound to a single matrix';
 END IF;
 IF jsonb_typeof(_nodes) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Batch nodes must be an array';
 END IF;
 n:=jsonb_array_length(_nodes);
 IF n<9 OR n>16 OR (SELECT count(DISTINCT x.value)
   FROM jsonb_array_elements(_nodes) x)<>n THEN
  RAISE EXCEPTION 'Batch requires 9 to 16 unique points';
 END IF;

 INSERT INTO public.routing_road_batches(
  tenant_id,product_key,optimisation_job_id,request_key,nodes,requested_by)
 VALUES(opt.tenant_id,opt.product_key,opt.id,_request_key,_nodes,auth.uid())
 RETURNING id INTO batch_id;

 FOR row_idx IN 0..((n-1)/8) LOOP
  SELECT jsonb_agg(x.value ORDER BY x.ordinality) INTO row_points
   FROM jsonb_array_elements(_nodes) WITH ORDINALITY x(value,ordinality)
   WHERE x.ordinality>row_idx*8 AND x.ordinality<=(row_idx+1)*8;
  FOR col_idx IN 0..((n-1)/8) LOOP
   SELECT jsonb_agg(x.value ORDER BY x.ordinality) INTO col_points
    FROM jsonb_array_elements(_nodes) WITH ORDINALITY x(value,ordinality)
    WHERE x.ordinality>col_idx*8 AND x.ordinality<=(col_idx+1)*8;
   -- All quotas are reserved atomically. Failure rolls back every tile.
   matrix_id:=public.routing_queue_matrix(
    opt.tenant_id,opt.product_key,'driving',row_points,col_points,false,gen_random_uuid());
   INSERT INTO public.routing_road_batch_tiles(
     tenant_id,product_key,batch_id,row_offset,column_offset,matrix_job_id)
   VALUES(opt.tenant_id,opt.product_key,batch_id,row_idx*8,col_idx*8,matrix_id);
  END LOOP;
 END LOOP;
 UPDATE public.routing_optimisation_jobs
 SET road_batch_id=batch_id,input_snapshot=COALESCE(opt.input_snapshot,'{}'::jsonb)||
  jsonb_build_object('matrixNodes',_nodes,'planningMode','batched_road_required',
   'matrixElementCount',n*n,'matrixTileCount',((n+7)/8)*((n+7)/8))
 WHERE id=opt.id;
 RETURN batch_id;
END $$;
REVOKE ALL ON FUNCTION public.routing_queue_matrix_batch(uuid,jsonb,uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.routing_queue_matrix_batch(uuid,jsonb,uuid)
 TO authenticated;
COMMIT;
