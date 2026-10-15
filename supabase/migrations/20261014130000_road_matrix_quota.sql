-- Omniqora road-matrix preview: atomic tenant budget and idempotent admission.
BEGIN;
ALTER TABLE public.routing_matrix_jobs
 ADD COLUMN IF NOT EXISTS request_key uuid,
 ADD COLUMN IF NOT EXISTS quality text NOT NULL DEFAULT 'pending'
 CHECK(quality IN('pending','road','traffic','straight_line_estimate'));
CREATE UNIQUE INDEX IF NOT EXISTS routing_matrix_request_uq
 ON public.routing_matrix_jobs(tenant_id,product_key,request_key)
 WHERE request_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.routing_matrix_daily_quota(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 day_utc date NOT NULL,
 requests integer NOT NULL DEFAULT 0 CHECK(requests BETWEEN 0 AND 8),
 elements integer NOT NULL DEFAULT 0 CHECK(elements BETWEEN 0 AND 256),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,day_utc)
);
ALTER TABLE public.routing_matrix_daily_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.routing_matrix_daily_quota FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.routing_matrix_daily_quota TO service_role;
GRANT SELECT ON public.routing_matrix_daily_quota TO authenticated;
CREATE POLICY "matrix quota admin read" ON public.routing_matrix_daily_quota FOR SELECT
 TO authenticated USING(public.is_platform_admin(auth.uid()) OR
 public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE OR REPLACE FUNCTION public.routing_queue_matrix(
 _tenant uuid,_product text,_mode text,_origins jsonb,_destinations jsonb,
 _traffic_aware boolean,_request_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.routing_matrix_jobs%rowtype;
 n integer;m integer;num integer;job_id uuid;reserved integer;p jsonb;
 opts jsonb:=jsonb_build_object('trafficAware',COALESCE(_traffic_aware,false));
BEGIN
 IF auth.uid() IS NULL OR (NOT public.is_platform_admin(auth.uid()) AND NOT
  public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 THEN RAISE EXCEPTION 'Routing administrator required'; END IF;
 IF _tenant IS NULL OR _request_key IS NULL OR length(COALESCE(_product,''))<2
 THEN RAISE EXCEPTION 'Invalid matrix identity'; END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.routing-engine')
 THEN RAISE EXCEPTION 'Routing entitlement required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products tp
  WHERE tp.tenant_id=_tenant AND tp.product_key=_product AND tp.status='active')
 THEN RAISE EXCEPTION 'Active tenant product required'; END IF;
 IF _mode NOT IN('driving','cycling','walking') OR
 (COALESCE(_traffic_aware,false) AND _mode<>'driving')
 THEN RAISE EXCEPTION 'Unsupported matrix travel mode'; END IF;
 IF jsonb_typeof(_origins) IS DISTINCT FROM 'array' OR
  jsonb_typeof(_destinations) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Matrix points must be arrays'; END IF;
 n:=jsonb_array_length(_origins);m:=jsonb_array_length(_destinations);num:=n*m;
 IF n<1 OR n>8 OR m<1 OR m>8 OR num>64
 THEN RAISE EXCEPTION 'Matrix limited to 8 by 8'; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(_origins || _destinations) LOOP
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR
     jsonb_typeof(p->'lat') IS DISTINCT FROM 'number' OR
     jsonb_typeof(p->'lng') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'Matrix requires numeric latitude/longitude'; END IF;
  IF (p->>'lat')::numeric NOT BETWEEN -90 AND 90 OR
     (p->>'lng')::numeric NOT BETWEEN -180 AND 180
  THEN RAISE EXCEPTION 'Invalid coordinate bounds'; END IF;
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  _tenant::text||':'||_product||':'||_request_key::text,0));
 SELECT * INTO old FROM public.routing_matrix_jobs
 WHERE tenant_id=_tenant AND product_key=_product AND request_key=_request_key;
 IF FOUND THEN
  IF old.origins<>_origins OR old.destinations<>_destinations OR
    old.travel_mode<>_mode OR old.options<>opts
  THEN RAISE EXCEPTION 'Idempotency key used with different matrix input'; END IF;
  RETURN old.id;
 END IF;
 INSERT INTO public.routing_matrix_daily_quota(
  tenant_id,product_key,day_utc,requests,elements)
 VALUES(_tenant,_product,(now() AT TIME ZONE 'UTC')::date,1,num)
 ON CONFLICT(tenant_id,product_key,day_utc) DO UPDATE
 SET requests=public.routing_matrix_daily_quota.requests+1,
     elements=public.routing_matrix_daily_quota.elements+EXCLUDED.elements,
     updated_at=now()
 WHERE public.routing_matrix_daily_quota.requests<8
 AND public.routing_matrix_daily_quota.elements+EXCLUDED.elements<=256
 RETURNING requests INTO reserved;
 IF reserved IS NULL THEN RAISE EXCEPTION 'Daily road matrix quota exceeded'; END IF;
 INSERT INTO public.routing_matrix_jobs(
  tenant_id,product_key,request_key,travel_mode,origins,destinations,
  options,status,quality,requested_by)
 VALUES(_tenant,_product,_request_key,_mode,_origins,_destinations,
  opts,'queued','pending',auth.uid()) RETURNING id INTO job_id;
 RETURN job_id;
END $$;
REVOKE ALL ON FUNCTION public.routing_queue_matrix(uuid,text,text,jsonb,jsonb,boolean,uuid)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.routing_queue_matrix(uuid,text,text,jsonb,jsonb,boolean,uuid)
 TO authenticated;
-- Source-ready adapter is not a live enabled provider.
UPDATE public.provider_catalogue SET status='preview',implementation_status='built_main',
 updated_at=now() WHERE provider_key='maps.openrouteservice'
 AND status='planned' AND implementation_status='catalogue_only';
COMMIT;