-- Universal Connect + AI Reception + assisted ordering v2.
-- Omniqora owns channel/intake/payment state; vertical products remain order-authoritative.
BEGIN;

CREATE TABLE IF NOT EXISTS public.order_intake_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('voice','whatsapp','sms','manual','webchat')),
  provider text NOT NULL DEFAULT 'twilio',
  address text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  ai_reception_enabled boolean NOT NULL DEFAULT false,
  human_handoff_enabled boolean NOT NULL DEFAULT true,
  greeting text,
  routing jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,channel,address)
);

CREATE TABLE IF NOT EXISTS public.reception_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.order_intake_channels(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('voice','whatsapp','sms','webchat')),
  provider text NOT NULL,
  provider_session_id text,
  customer_phone text,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'human' CHECK (mode IN ('human','ai','hybrid')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ai_active','human_active','handoff','completed','abandoned','failed')),
  intent text,
  summary text,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reception_provider_session_uq
 ON public.reception_sessions(provider,provider_session_id)
 WHERE provider_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_intake_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  channel_id uuid REFERENCES public.order_intake_channels(id) ON DELETE SET NULL,
  reception_session_id uuid REFERENCES public.reception_sessions(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('voice','whatsapp','sms','manual','webchat')),
  provider text NOT NULL DEFAULT 'omniqora',
  provider_session_id text,
  idempotency_key text NOT NULL,
  customer_phone text,
  customer_name text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','awaiting_payment','paid','handoff_ready','claimed','submitted','cancelled','expired','failed')),
  order_draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_minor integer CHECK (total_minor IS NULL OR total_minor >= 0),
  currency text NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
  claimed_at timestamptz,
  claimed_by_key_id text,
  target_order_id text,
  submitted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '2 hours'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS order_intake_provider_session_uq
 ON public.order_intake_sessions(provider,provider_session_id)
 WHERE provider_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_intake_handoff_idx
 ON public.order_intake_sessions(tenant_id,product_key,status,created_at)
 WHERE status IN ('paid','handoff_ready','claimed');

CREATE TABLE IF NOT EXISTS public.order_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.order_intake_sessions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
  provider_reference text,
  idempotency_key text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'GBP' CHECK (currency ~ '^[A-Z]{3}$'),
  payment_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','paid','expired','cancelled','failed','refunded')),
  expires_at timestamptz,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS order_payment_provider_ref_uq
 ON public.order_payment_requests(provider_key,provider_reference)
 WHERE provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_intake_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.order_intake_sessions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.order_intake_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['order_intake_channels','reception_sessions','order_intake_sessions','order_payment_requests']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS order_intake_touch ON public.%I',t);
    EXECUTE format('CREATE TRIGGER order_intake_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.order_intake_touch()',t);
  END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['order_intake_channels','reception_sessions','order_intake_sessions','order_payment_requests','order_intake_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  END LOOP;
END $$;
GRANT INSERT,UPDATE ON public.order_intake_sessions,public.order_payment_requests TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.order_intake_channels TO authenticated;

CREATE POLICY "order channels tenant read" ON public.order_intake_channels FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "order channels tenant write" ON public.order_intake_channels FOR ALL TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "reception tenant read" ON public.reception_sessions FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "order sessions tenant read" ON public.order_intake_sessions FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "order sessions tenant write" ON public.order_intake_sessions FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));
CREATE POLICY "payment requests tenant read" ON public.order_payment_requests FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "payment requests tenant write" ON public.order_payment_requests FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));
CREATE POLICY "order events tenant read" ON public.order_intake_events FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

CREATE OR REPLACE FUNCTION public.order_create_manual_session(
  _tenant uuid,_product text,_brand uuid,_location uuid,_channel text,
  _customer_phone text,_customer_name text,_order jsonb,_idempotency text,_expires_minutes integer DEFAULT 120
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; total integer; curr text;
BEGIN
  IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Order intake write access denied';
  END IF;
  IF NOT public.has_tenant_entitlement(_tenant,'dishbee.assisted-ordering')
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Assisted ordering entitlement required';
  END IF;
  IF _brand IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_brands WHERE id=_brand AND tenant_id=_tenant) THEN
    RAISE EXCEPTION 'Brand does not belong to tenant';
  END IF;
  IF _location IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_locations WHERE id=_location AND tenant_id=_tenant) THEN
    RAISE EXCEPTION 'Location does not belong to tenant';
  END IF;
  total:=NULLIF((_order->>'total_minor'),'')::integer;
  curr:=COALESCE(NULLIF(_order->>'currency',''),'GBP');
  INSERT INTO public.order_intake_sessions(
    tenant_id,product_key,brand_id,location_id,channel,provider,idempotency_key,
    customer_phone,customer_name,status,order_draft,total_minor,currency,expires_at,created_by
  ) VALUES(
    _tenant,_product,_brand,_location,_channel,'omniqora',_idempotency,
    _customer_phone,_customer_name,'draft',COALESCE(_order,'{}'::jsonb),total,curr,
    now()+make_interval(mins=>GREATEST(5,LEAST(_expires_minutes,1440))),auth.uid()
  )
  ON CONFLICT(tenant_id,product_key,idempotency_key)
  DO UPDATE SET order_draft=EXCLUDED.order_draft,total_minor=EXCLUDED.total_minor,currency=EXCLUDED.currency,
    customer_phone=EXCLUDED.customer_phone,customer_name=EXCLUDED.customer_name,updated_at=now()
  RETURNING id INTO result;
  INSERT INTO public.order_intake_events(session_id,tenant_id,event_type,detail)
  VALUES(result,_tenant,'draft.saved',jsonb_build_object('productKey',_product,'channel',_channel));
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.order_create_manual_session(uuid,text,uuid,uuid,text,text,text,jsonb,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.order_create_manual_session(uuid,text,uuid,uuid,text,text,text,jsonb,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.order_mark_payment_requested(
  _session uuid,_provider_key text,_provider_reference text,_payment_url text,
  _idempotency text,_expires_at timestamptz,_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.order_intake_sessions%rowtype; result uuid;
BEGIN
  SELECT * INTO s FROM public.order_intake_sessions WHERE id=_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order intake session not found'; END IF;
  IF NOT public.can_write(s.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())
     AND COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Payment request access denied';
  END IF;
  IF s.total_minor IS NULL THEN RAISE EXCEPTION 'Order total required'; END IF;
  INSERT INTO public.order_payment_requests(
    session_id,tenant_id,product_key,provider_key,provider_reference,idempotency_key,
    amount_minor,currency,payment_url,status,expires_at,metadata
  ) VALUES(
    s.id,s.tenant_id,s.product_key,_provider_key,_provider_reference,_idempotency,
    s.total_minor,s.currency,_payment_url,'sent',_expires_at,COALESCE(_metadata,'{}'::jsonb)
  )
  ON CONFLICT(tenant_id,product_key,idempotency_key)
  DO UPDATE SET provider_reference=EXCLUDED.provider_reference,payment_url=EXCLUDED.payment_url,
    status='sent',expires_at=EXCLUDED.expires_at,metadata=EXCLUDED.metadata,updated_at=now()
  RETURNING id INTO result;
  UPDATE public.order_intake_sessions SET status='awaiting_payment' WHERE id=s.id;
  INSERT INTO public.order_intake_events(session_id,tenant_id,event_type,detail)
  VALUES(s.id,s.tenant_id,'payment.link_sent',jsonb_build_object('paymentRequestId',result,'providerKey',_provider_key));
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.order_mark_payment_requested(uuid,text,text,text,text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.order_mark_payment_requested(uuid,text,text,text,text,timestamptz,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.server_order_payment_status(
  _provider_key text,_provider_reference text,_status text,_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.order_payment_requests%rowtype; newstatus text; sess_status text;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT * INTO p FROM public.order_payment_requests
  WHERE provider_key=_provider_key AND provider_reference=_provider_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment request not found'; END IF;
  newstatus:=CASE _status WHEN 'paid' THEN 'paid' WHEN 'expired' THEN 'expired'
    WHEN 'cancelled' THEN 'cancelled' WHEN 'failed' THEN 'failed' WHEN 'refunded' THEN 'refunded'
    ELSE 'pending' END;
  UPDATE public.order_payment_requests SET status=newstatus,metadata=COALESCE(_metadata,'{}'::jsonb),
    paid_at=CASE WHEN newstatus='paid' THEN COALESCE(paid_at,now()) ELSE paid_at END
  WHERE id=p.id;
  sess_status:=CASE WHEN newstatus='paid' THEN 'handoff_ready'
    WHEN newstatus IN ('expired','cancelled') THEN 'expired'
    WHEN newstatus='failed' THEN 'failed' ELSE NULL END;
  IF sess_status IS NOT NULL THEN UPDATE public.order_intake_sessions SET status=sess_status WHERE id=p.session_id; END IF;
  INSERT INTO public.order_intake_events(session_id,tenant_id,event_type,detail)
  VALUES(p.session_id,p.tenant_id,'payment.'||newstatus,jsonb_build_object('providerKey',_provider_key,'reference',_provider_reference));
  RETURN p.session_id;
END; $$;
REVOKE ALL ON FUNCTION public.server_order_payment_status(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_order_payment_status(text,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.server_claim_order_handoff(
  _tenant uuid,_product text,_key_id text,_limit integer DEFAULT 20
) RETURNS SETOF public.order_intake_sessions
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  RETURN QUERY
  WITH claim AS (
    SELECT s.id FROM public.order_intake_sessions s
    WHERE s.tenant_id=_tenant AND s.product_key=_product AND s.status='handoff_ready'
      AND s.expires_at>now()
    ORDER BY s.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1,LEAST(_limit,50))
  )
  UPDATE public.order_intake_sessions s
  SET status='claimed',claimed_at=now(),claimed_by_key_id=_key_id,updated_at=now()
  FROM claim WHERE s.id=claim.id
  RETURNING s.*;
END; $$;
REVOKE ALL ON FUNCTION public.server_claim_order_handoff(uuid,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_claim_order_handoff(uuid,text,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.server_ack_order_handoff(
  _session uuid,_key_id text,_target_order_id text,_ok boolean,_detail jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.order_intake_sessions%rowtype;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT * INTO s FROM public.order_intake_sessions WHERE id=_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order intake session not found'; END IF;
  IF s.status<>'claimed' OR s.claimed_by_key_id IS DISTINCT FROM _key_id THEN RAISE EXCEPTION 'Order handoff claim mismatch'; END IF;
  UPDATE public.order_intake_sessions SET
    status=CASE WHEN _ok THEN 'submitted' ELSE 'handoff_ready' END,
    target_order_id=CASE WHEN _ok THEN _target_order_id ELSE target_order_id END,
    submitted_at=CASE WHEN _ok THEN now() ELSE submitted_at END,
    claimed_at=CASE WHEN _ok THEN claimed_at ELSE NULL END,
    claimed_by_key_id=CASE WHEN _ok THEN claimed_by_key_id ELSE NULL END,
    metadata=metadata||COALESCE(_detail,'{}'::jsonb)
  WHERE id=s.id;
  INSERT INTO public.order_intake_events(session_id,tenant_id,event_type,detail)
  VALUES(s.id,s.tenant_id,CASE WHEN _ok THEN 'handoff.submitted' ELSE 'handoff.released' END,
    COALESCE(_detail,'{}'::jsonb)||jsonb_build_object('targetOrderId',_target_order_id));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.server_ack_order_handoff(uuid,text,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_ack_order_handoff(uuid,text,text,boolean,jsonb) TO service_role;

UPDATE public.service_catalogue SET implementation_status='built_main',provisioning_mode='automatic',updated_at=now()
WHERE service_key IN ('omniqora.voice','dishbee.assisted-ordering');

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
 ('dishbee','dishbee.assisted-ordering',true,false),
 ('dishbee','omniqora.connect',true,false),
 ('dishbee','omniqora.crm',true,false),
 ('dishbee','omniqora.voice',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=EXCLUDED.default_enabled;

COMMIT;
