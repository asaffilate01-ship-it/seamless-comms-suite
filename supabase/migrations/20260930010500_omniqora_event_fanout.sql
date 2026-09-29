-- Durable event fan-out for enabled Omniqora modules and external subscribers.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_module_event_patterns (
  module_key text NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE CASCADE,
  event_pattern text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module_key,event_pattern),
  CHECK (length(event_pattern) BETWEEN 1 AND 160),
  CHECK (event_pattern='*' OR position('*' in event_pattern)=0 OR (right(event_pattern,1)='*' AND position('*' in left(event_pattern,length(event_pattern)-1))=0))
);
ALTER TABLE public.platform_module_event_patterns ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_module_event_patterns TO authenticated;
GRANT ALL ON public.platform_module_event_patterns TO service_role;
DROP POLICY IF EXISTS "module event patterns read" ON public.platform_module_event_patterns;
CREATE POLICY "module event patterns read" ON public.platform_module_event_patterns FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.platform_module_event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.platform_events(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','completed','dead','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts>=0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_module_event_queue_uq
  ON public.platform_module_event_queue(event_id,module_key,COALESCE(tenant_product_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS platform_module_event_queue_claim_idx
  ON public.platform_module_event_queue(state,next_attempt_at,created_at);
ALTER TABLE public.platform_module_event_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_module_event_queue FROM anon,authenticated;
GRANT ALL ON public.platform_module_event_queue TO service_role;

CREATE OR REPLACE FUNCTION public.platform_event_matches(_pattern text,_event text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _pattern='*' THEN true
    WHEN position('*' in _pattern)=0 THEN _pattern=_event
    WHEN right(_pattern,1)='*' AND position('*' in left(_pattern,length(_pattern)-1))=0
      THEN left(_event,length(_pattern)-1)=left(_pattern,length(_pattern)-1)
    ELSE false
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_event_matches(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_event_matches(text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fanout_platform_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.platform_event_deliveries(event_id,subscription_id)
  SELECT NEW.id,s.id
  FROM public.platform_event_subscriptions s
  WHERE s.enabled=true
    AND (s.tenant_id IS NULL OR s.tenant_id=NEW.tenant_id)
    AND (s.product_key IS NULL OR s.product_key=NEW.product_key)
    AND public.platform_event_matches(s.event_pattern,NEW.event_type)
  ON CONFLICT (event_id,subscription_id) DO NOTHING;

  INSERT INTO public.platform_module_event_queue(event_id,tenant_id,tenant_product_id,module_key)
  SELECT DISTINCT NEW.id,NEW.tenant_id,COALESCE(e.tenant_product_id,NEW.tenant_product_id),p.module_key
  FROM public.platform_module_event_patterns p
  JOIN public.platform_modules m ON m.module_key=p.module_key AND m.status<>'retired'
  JOIN public.tenant_module_entitlements e
    ON e.tenant_id=NEW.tenant_id
   AND e.module_key=p.module_key
   AND e.enabled=true
   AND (e.starts_at IS NULL OR e.starts_at<=NEW.occurred_at)
   AND (e.ends_at IS NULL OR e.ends_at>NEW.occurred_at)
   AND (NEW.tenant_product_id IS NULL OR e.tenant_product_id IS NULL OR e.tenant_product_id=NEW.tenant_product_id)
  WHERE p.enabled=true
    AND public.platform_event_matches(p.event_pattern,NEW.event_type)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_event_fanout ON public.platform_events;
CREATE TRIGGER platform_event_fanout
AFTER INSERT ON public.platform_events
FOR EACH ROW EXECUTE FUNCTION public.fanout_platform_event();

REVOKE EXECUTE ON FUNCTION public.fanout_platform_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fanout_platform_event() TO service_role;

CREATE OR REPLACE FUNCTION public.claim_platform_module_events(_limit integer DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH jobs AS (
    SELECT q.id
    FROM public.platform_module_event_queue q
    WHERE (q.state='pending' AND q.next_attempt_at<=now())
       OR (q.state='processing' AND q.locked_at<now()-interval '5 minutes')
    ORDER BY q.created_at
    LIMIT LEAST(GREATEST(_limit,1),100)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.platform_module_event_queue q
  SET state='processing',attempts=q.attempts+1,locked_at=now(),updated_at=now()
  FROM jobs j
  WHERE q.id=j.id
  RETURNING jsonb_build_object(
    'queueId',q.id,
    'moduleKey',q.module_key,
    'tenantId',q.tenant_id,
    'tenantProductId',q.tenant_product_id,
    'event',(SELECT to_jsonb(e) FROM public.platform_events e WHERE e.id=q.event_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_platform_module_event(_queue uuid,_success boolean,_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE q public.platform_module_event_queue;
BEGIN
  SELECT * INTO q FROM public.platform_module_event_queue WHERE id=_queue FOR UPDATE;
  IF NOT FOUND OR q.state<>'processing' THEN RAISE EXCEPTION 'module_event_not_processing'; END IF;
  IF _success THEN
    UPDATE public.platform_module_event_queue
    SET state='completed',completed_at=now(),last_error=NULL,updated_at=now()
    WHERE id=_queue;
  ELSIF q.attempts>=5 THEN
    UPDATE public.platform_module_event_queue
    SET state='dead',last_error=left(COALESCE(_error,'module processor failed'),2000),updated_at=now()
    WHERE id=_queue;
  ELSE
    UPDATE public.platform_module_event_queue
    SET state='pending',next_attempt_at=now()+(power(2,LEAST(q.attempts,8))::text||' minutes')::interval,
        last_error=left(COALESCE(_error,'module processor failed'),2000),locked_at=NULL,updated_at=now()
    WHERE id=_queue;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_platform_module_events(integer) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_platform_module_event(uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_platform_module_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_platform_module_event(uuid,boolean,text) TO service_role;

INSERT INTO public.platform_module_event_patterns(module_key,event_pattern) VALUES
  ('crm.core','customer.*'),('crm.core','lead.*'),('crm.core','order.*'),('crm.core','booking.*'),('crm.core','case.*'),('crm.core','dispatch.job.*'),
  ('analytics.core','crm.*'),('analytics.core','order.*'),('analytics.core','booking.*'),('analytics.core','dispatch.*'),('analytics.core','marketing.*'),('analytics.core','sales.*'),('analytics.core','feedback.*'),('analytics.core','marketplace.*'),('analytics.core','financial.*'),
  ('financials.core','order.completed'),('financials.core','invoice.paid'),('financials.core','refund.*'),('financials.core','payment.*'),('financials.core','marketplace.order.completed'),('financials.core','marketplace.refund.*'),('financials.core','dispatch.job.completed'),
  ('journeys.core','crm.*'),('journeys.core','order.*'),('journeys.core','booking.*'),('journeys.core','feedback.*'),('journeys.core','marketing.*'),
  ('feedback.core','order.completed'),('feedback.core','booking.completed'),('feedback.core','dispatch.job.completed'),('feedback.core','case.closed'),
  ('marketing.core','crm.*'),('marketing.core','customer.rfm.*'),('marketing.core','feedback.*'),
  ('sales.core','crm.lead.*'),('sales.core','crm.opportunity.*'),('sales.core','connect.*'),
  ('creative.core','marketing.campaign.*'),('creative.core','creative.brief.*'),
  ('dispatch.core','order.ready'),('dispatch.core','delivery.requested'),('dispatch.core','service.job_requested'),('dispatch.core','marketplace.order.accepted'),
  ('marketplace.core','payment.*'),('marketplace.core','dispatch.job.*'),('marketplace.core','feedback.*'),
  ('compliance.core','document.*'),('compliance.core','compliance.*'),('compliance.core','business360.*'),('compliance.core','regulatory.*')
ON CONFLICT (module_key,event_pattern) DO UPDATE SET enabled=true;

DO $$ BEGIN
  EXECUTE 'DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.platform_module_event_queue';
  EXECUTE 'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.platform_module_event_queue FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()';
END $$;

COMMIT;