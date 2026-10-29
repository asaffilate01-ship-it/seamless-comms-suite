BEGIN;
-- Operator-provisioned request allowances; no browser can enable or replenish them.
CREATE TABLE public.research_allowances (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 period_start date NOT NULL, period_end date NOT NULL,
 request_limit integer NOT NULL CHECK(request_limit BETWEEN 0 AND 10000),
 requests_used integer NOT NULL DEFAULT 0 CHECK(requests_used>=0),
 enabled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,product_key), CHECK(period_end>period_start)
);
CREATE TABLE public.research_requests (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 actor_id uuid NOT NULL REFERENCES auth.users(id), query_hash text NOT NULL,
 preset text NOT NULL CHECK(preset IN('general','uk-childcare','uk-food')),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','completed','failed')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days'
);
CREATE INDEX research_requests_scope ON public.research_requests(tenant_id,product_key,created_at DESC);
ALTER TABLE public.research_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_allowances,public.research_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.research_allowances,public.research_requests TO service_role;
GRANT SELECT ON public.research_allowances,public.research_requests TO authenticated;
CREATE POLICY research_allowance_read ON public.research_allowances FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=research_allowances.tenant_id AND m.user_id=(select auth.uid()))
 AND public.has_tenant_entitlement(tenant_id,'omniqora.intelligence-runtime')
 AND EXISTS(SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=research_allowances.tenant_id AND p.product_key=research_allowances.product_key AND p.status='active')
);
CREATE POLICY research_request_read ON public.research_requests FOR SELECT TO authenticated USING(
 expires_at>now() AND
 EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=research_requests.tenant_id AND m.user_id=(select auth.uid()))
 AND public.has_tenant_entitlement(tenant_id,'omniqora.intelligence-runtime')
 AND EXISTS(SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=research_requests.tenant_id AND p.product_key=research_requests.product_key AND p.status='active')
);
-- Service-only invoker: authenticated actor is supplied exclusively by server middleware.
CREATE FUNCTION public.reserve_research_request(_tenant uuid,_product text,_actor uuid,_request uuid,_hash text,_preset text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE a public.research_allowances; prior public.research_requests;
BEGIN
 IF _actor IS NULL OR _request IS NULL OR _hash IS NULL OR _hash !~ '^[a-f0-9]{64}$' OR _preset IS NULL OR _preset NOT IN('general','uk-childcare','uk-food') THEN RAISE EXCEPTION 'Invalid research request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_members WHERE tenant_id=_tenant AND user_id=_actor AND role IN('owner','admin','agent'))
 OR NOT EXISTS(SELECT 1 FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product AND status='active')
 OR public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime') IS NOT TRUE THEN RAISE EXCEPTION 'Research access denied'; END IF;
 SELECT * INTO a FROM public.research_allowances WHERE tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF NOT FOUND OR NOT a.enabled OR current_date<a.period_start OR current_date>=a.period_end THEN RAISE EXCEPTION 'Research allowance unavailable'; END IF;
 SELECT * INTO prior FROM public.research_requests WHERE id=_request;
 IF FOUND THEN
  IF prior.tenant_id<>_tenant OR prior.product_key<>_product OR prior.actor_id<>_actor OR prior.query_hash<>_hash OR prior.preset<>_preset THEN RAISE EXCEPTION 'Request identity conflict'; END IF;
  RETURN false;
 END IF;
 IF a.requests_used>=a.request_limit THEN RAISE EXCEPTION 'Research allowance exhausted'; END IF;
 INSERT INTO public.research_requests(id,tenant_id,product_key,actor_id,query_hash,preset) VALUES(_request,_tenant,_product,_actor,_hash,_preset);
 UPDATE public.research_allowances SET requests_used=requests_used+1 WHERE tenant_id=_tenant AND product_key=_product;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_research_request(uuid,text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_research_request(uuid,text,uuid,uuid,text,text) TO service_role;
COMMIT;
