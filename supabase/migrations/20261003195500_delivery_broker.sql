BEGIN;

-- Shared last-mile broker for Dishbee+, Dishbee/Hive and other Omniqora products.
-- Provider credentials are referenced by opaque handles. Raw provider secrets must
-- remain in the approved server-side secret store / connector runtime.

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,metadata
) VALUES (
  'omniqora.delivery-broker',
  'Delivery Broker',
  'Shared own-fleet and third-party last-mile quoting, routing, booking and tracking.',
  'operations','omniqora',true,'automatic','active',
  '{"providers":["own_fleet","uber_direct","deliveroo_express","just_eat_go","stuart"],"routing":"policy-driven"}'::jsonb
)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,
  billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,
  status=EXCLUDED.status,
  metadata=public.service_catalogue.metadata||EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('omniqora.delivery-broker','omniqora.geo',true),
('omniqora.delivery-broker','omniqora.dispatch',true),
('omniqora.delivery-broker','omniqora.tracking',true),
('dishbee.delivery','omniqora.delivery-broker',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('dishbee-plus','omniqora.delivery-broker',true,false),
('dishbee','omniqora.delivery-broker',true,false),
('mealdeck','omniqora.delivery-broker',true,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,
  required=EXCLUDED.required;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
('dishbee-plus-uk','omniqora.delivery-broker',false,'{}'::jsonb),
('restaurant-uk','omniqora.delivery-broker',false,'{}'::jsonb),
('mealdeck-uk','omniqora.delivery-broker',true,'{}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.integration_provider_catalogue(
  provider_key,display_name,provider_family,integration_mode,status,countries,capabilities,metadata
) VALUES (
  'own_fleet','Own Fleet','delivery','hybrid','planned','{}',
  ARRAY['availability','quote','assign','tracking','proof_of_delivery'],
  '{"internal":true,"usesOmniqoraDispatch":true}'::jsonb
)
ON CONFLICT(provider_key) DO UPDATE SET
  display_name=EXCLUDED.display_name,
  provider_family=EXCLUDED.provider_family,
  integration_mode=EXCLUDED.integration_mode,
  capabilities=EXCLUDED.capabilities,
  metadata=public.integration_provider_catalogue.metadata||EXCLUDED.metadata,
  updated_at=now();

CREATE TABLE IF NOT EXISTS public.delivery_provider_accounts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  provider_key text NOT NULL REFERENCES public.integration_provider_catalogue(provider_key) ON DELETE RESTRICT,
  account_model text NOT NULL DEFAULT 'merchant_account'
    CHECK(account_model IN('merchant_account','platform_managed','own_fleet')),
  external_account_ref text,
  credential_handle text,
  enabled boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100 CHECK(priority BETWEEN 0 AND 10000),
  health_status text NOT NULL DEFAULT 'not_checked'
    CHECK(health_status IN('not_checked','testing','connected','degraded','disabled','blocked')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_health_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,location_id,provider_key,account_model)
);

CREATE TABLE IF NOT EXISTS public.delivery_routing_policies(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Default',
  enabled boolean NOT NULL DEFAULT true,
  own_fleet_preferred boolean NOT NULL DEFAULT true,
  own_fleet_effective_cost_minor bigint CHECK(own_fleet_effective_cost_minor IS NULL OR own_fleet_effective_cost_minor>=0),
  max_provider_cost_minor bigint CHECK(max_provider_cost_minor IS NULL OR max_provider_cost_minor>=0),
  max_delivery_eta_minutes integer CHECK(max_delivery_eta_minutes IS NULL OR max_delivery_eta_minutes>0),
  eta_value_minor_per_minute integer NOT NULL DEFAULT 5 CHECK(eta_value_minor_per_minute>=0),
  fastest_within_cost_delta_minor integer NOT NULL DEFAULT 50 CHECK(fastest_within_cost_delta_minor>=0),
  require_manager_above_minor bigint CHECK(require_manager_above_minor IS NULL OR require_manager_above_minor>=0),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,location_id,name)
);

CREATE TABLE IF NOT EXISTS public.delivery_quote_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  external_order_ref text NOT NULL,
  fulfilment_context text NOT NULL DEFAULT 'delivery',
  pickup jsonb NOT NULL,
  dropoff jsonb NOT NULL,
  ready_at timestamptz,
  order_value_minor bigint NOT NULL DEFAULT 0 CHECK(order_value_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN('pending','quoting','quoted','selected','booking','booked','cancelled','failed','expired')),
  selected_quote_id uuid,
  requested_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,external_order_ref)
);

CREATE TABLE IF NOT EXISTS public.delivery_quotes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.delivery_quote_requests(id) ON DELETE CASCADE,
  provider_account_id uuid REFERENCES public.delivery_provider_accounts(id) ON DELETE SET NULL,
  provider_key text NOT NULL REFERENCES public.integration_provider_catalogue(provider_key) ON DELETE RESTRICT,
  provider_quote_ref text NOT NULL,
  price_minor bigint NOT NULL CHECK(price_minor>=0),
  pickup_eta_minutes integer CHECK(pickup_eta_minutes IS NULL OR pickup_eta_minutes>=0),
  delivery_eta_minutes integer CHECK(delivery_eta_minutes IS NULL OR delivery_eta_minutes>=0),
  expires_at timestamptz,
  available boolean NOT NULL DEFAULT true,
  selected boolean NOT NULL DEFAULT false,
  score numeric,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id,provider_key,provider_quote_ref)
);

ALTER TABLE public.delivery_quote_requests
  DROP CONSTRAINT IF EXISTS delivery_quote_requests_selected_quote_id_fkey;
ALTER TABLE public.delivery_quote_requests
  ADD CONSTRAINT delivery_quote_requests_selected_quote_id_fkey
  FOREIGN KEY(selected_quote_id) REFERENCES public.delivery_quotes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.delivery_broker_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  request_id uuid NOT NULL UNIQUE REFERENCES public.delivery_quote_requests(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.delivery_quotes(id) ON DELETE SET NULL,
  provider_account_id uuid REFERENCES public.delivery_provider_accounts(id) ON DELETE SET NULL,
  provider_key text NOT NULL REFERENCES public.integration_provider_catalogue(provider_key) ON DELETE RESTRICT,
  external_delivery_ref text,
  dispatch_job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK(status IN(
      'requested','accepted','driver_assigned','arriving_pickup','picked_up',
      'arriving_dropoff','delivered','cancelled','failed'
    )),
  price_minor bigint CHECK(price_minor IS NULL OR price_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  tracking_url text,
  courier jsonb NOT NULL DEFAULT '{}'::jsonb,
  proof_of_delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  booked_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_broker_events(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.delivery_broker_jobs(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  event_type text NOT NULL,
  external_event_ref text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_broker_event_dedupe_idx
  ON public.delivery_broker_events(provider_key,external_event_ref)
  WHERE external_event_ref IS NOT NULL;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'delivery_provider_accounts','delivery_routing_policies','delivery_quote_requests',
    'delivery_quotes','delivery_broker_jobs','delivery_broker_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
      'delivery broker tenant read',t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))',
      'delivery broker tenant write',t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.delivery_create_quote_request(
  _tenant uuid,
  _product text,
  _location uuid,
  _external_order_ref text,
  _pickup jsonb,
  _dropoff jsonb,
  _ready_at timestamptz DEFAULT NULL,
  _order_value_minor bigint DEFAULT 0,
  _currency text DEFAULT 'GBP',
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid;
BEGIN
  IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Delivery broker access denied';
  END IF;
  IF NOT public.has_tenant_entitlement(_tenant,'omniqora.delivery-broker') AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Delivery broker entitlement required';
  END IF;
  IF NULLIF(trim(_external_order_ref),'') IS NULL THEN RAISE EXCEPTION 'External order reference required'; END IF;
  IF jsonb_typeof(_pickup)<>'object' OR jsonb_typeof(_dropoff)<>'object' THEN RAISE EXCEPTION 'Pickup and dropoff are required'; END IF;

  INSERT INTO public.delivery_quote_requests(
    tenant_id,product_key,location_id,external_order_ref,pickup,dropoff,ready_at,
    order_value_minor,currency,status,metadata,updated_at
  ) VALUES(
    _tenant,_product,_location,trim(_external_order_ref),_pickup,_dropoff,_ready_at,
    greatest(coalesce(_order_value_minor,0),0),upper(coalesce(nullif(trim(_currency),''),'GBP')),
    'pending',coalesce(_metadata,'{}'::jsonb),now()
  )
  ON CONFLICT(tenant_id,product_key,external_order_ref) DO UPDATE SET
    pickup=EXCLUDED.pickup,dropoff=EXCLUDED.dropoff,ready_at=EXCLUDED.ready_at,
    order_value_minor=EXCLUDED.order_value_minor,currency=EXCLUDED.currency,
    metadata=public.delivery_quote_requests.metadata||EXCLUDED.metadata,
    status=CASE WHEN public.delivery_quote_requests.status IN('booked','booking') THEN public.delivery_quote_requests.status ELSE 'pending' END,
    updated_at=now()
  RETURNING id INTO rid;

  RETURN rid;
END $$;

REVOKE ALL ON FUNCTION public.delivery_create_quote_request(uuid,text,uuid,text,jsonb,jsonb,timestamptz,bigint,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delivery_create_quote_request(uuid,text,uuid,text,jsonb,jsonb,timestamptz,bigint,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.server_record_delivery_quote(
  _request uuid,
  _provider_account uuid,
  _provider text,
  _quote_ref text,
  _price bigint,
  _pickup_eta integer,
  _delivery_eta integer,
  _expires_at timestamptz DEFAULT NULL,
  _available boolean DEFAULT true,
  _raw jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.delivery_quote_requests%rowtype;qid uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  SELECT * INTO req FROM public.delivery_quote_requests WHERE id=_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery quote request not found'; END IF;
  IF _price<0 OR coalesce(_pickup_eta,0)<0 OR coalesce(_delivery_eta,0)<0 THEN RAISE EXCEPTION 'Invalid delivery quote'; END IF;

  INSERT INTO public.delivery_quotes(
    tenant_id,request_id,provider_account_id,provider_key,provider_quote_ref,price_minor,
    pickup_eta_minutes,delivery_eta_minutes,expires_at,available,raw
  ) VALUES(
    req.tenant_id,_request,_provider_account,_provider,_quote_ref,_price,_pickup_eta,_delivery_eta,
    _expires_at,_available,coalesce(_raw,'{}'::jsonb)
  )
  ON CONFLICT(request_id,provider_key,provider_quote_ref) DO UPDATE SET
    price_minor=EXCLUDED.price_minor,pickup_eta_minutes=EXCLUDED.pickup_eta_minutes,
    delivery_eta_minutes=EXCLUDED.delivery_eta_minutes,expires_at=EXCLUDED.expires_at,
    available=EXCLUDED.available,raw=EXCLUDED.raw
  RETURNING id INTO qid;

  UPDATE public.delivery_quote_requests
  SET status='quoted',updated_at=now()
  WHERE id=_request AND status IN('pending','quoting','quoted');

  RETURN qid;
END $$;

REVOKE ALL ON FUNCTION public.server_record_delivery_quote(uuid,uuid,text,text,bigint,integer,integer,timestamptz,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_record_delivery_quote(uuid,uuid,text,text,bigint,integer,integer,timestamptz,boolean,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.delivery_select_best_quote(_request uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  req public.delivery_quote_requests%rowtype;
  pol public.delivery_routing_policies%rowtype;
  chosen uuid;
BEGIN
  SELECT * INTO req FROM public.delivery_quote_requests WHERE id=_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery quote request not found'; END IF;
  IF NOT public.can_write(req.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())
     AND COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Delivery broker access denied';
  END IF;

  SELECT * INTO pol
  FROM public.delivery_routing_policies
  WHERE tenant_id=req.tenant_id
    AND product_key=req.product_key
    AND enabled
    AND (location_id=req.location_id OR location_id IS NULL)
  ORDER BY (location_id IS NOT NULL) DESC,updated_at DESC
  LIMIT 1;

  WITH candidates AS (
    SELECT q.id,
      q.price_minor
      + coalesce(q.delivery_eta_minutes,9999)*coalesce(pol.eta_value_minor_per_minute,5)
      + coalesce(a.priority,100)*10
      + CASE WHEN coalesce(pol.own_fleet_preferred,true) AND q.provider_key='own_fleet' THEN -250 ELSE 0 END
      AS route_score
    FROM public.delivery_quotes q
    LEFT JOIN public.delivery_provider_accounts a ON a.id=q.provider_account_id
    WHERE q.request_id=_request
      AND q.available
      AND (q.expires_at IS NULL OR q.expires_at>now())
      AND (pol.max_provider_cost_minor IS NULL OR q.price_minor<=pol.max_provider_cost_minor)
      AND (pol.max_delivery_eta_minutes IS NULL OR q.delivery_eta_minutes IS NULL OR q.delivery_eta_minutes<=pol.max_delivery_eta_minutes)
    ORDER BY route_score,q.delivery_eta_minutes NULLS LAST,q.price_minor
    LIMIT 1
  )
  SELECT id INTO chosen FROM candidates;

  IF chosen IS NULL THEN
    UPDATE public.delivery_quote_requests SET status='failed',updated_at=now() WHERE id=_request;
    RAISE EXCEPTION 'No eligible delivery quote';
  END IF;

  UPDATE public.delivery_quotes
  SET selected=(id=chosen),
      score=CASE WHEN id=chosen THEN (
        price_minor
        + coalesce(delivery_eta_minutes,9999)*coalesce(pol.eta_value_minor_per_minute,5)
        + coalesce((SELECT priority FROM public.delivery_provider_accounts a WHERE a.id=provider_account_id),100)*10
        + CASE WHEN coalesce(pol.own_fleet_preferred,true) AND provider_key='own_fleet' THEN -250 ELSE 0 END
      ) ELSE score END
  WHERE request_id=_request;

  UPDATE public.delivery_quote_requests
  SET selected_quote_id=chosen,status='selected',updated_at=now()
  WHERE id=_request;

  RETURN chosen;
END $$;

REVOKE ALL ON FUNCTION public.delivery_select_best_quote(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delivery_select_best_quote(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.server_upsert_delivery_broker_job(
  _request uuid,
  _quote uuid,
  _provider_account uuid,
  _provider text,
  _external_delivery_ref text,
  _dispatch_job uuid,
  _status text,
  _price bigint,
  _currency text,
  _tracking_url text DEFAULT NULL,
  _courier jsonb DEFAULT '{}'::jsonb,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req public.delivery_quote_requests%rowtype;jid uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
  IF _status NOT IN('requested','accepted','driver_assigned','arriving_pickup','picked_up','arriving_dropoff','delivered','cancelled','failed') THEN
    RAISE EXCEPTION 'Invalid delivery job status';
  END IF;
  SELECT * INTO req FROM public.delivery_quote_requests WHERE id=_request FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Delivery quote request not found'; END IF;

  INSERT INTO public.delivery_broker_jobs(
    tenant_id,product_key,location_id,request_id,quote_id,provider_account_id,provider_key,
    external_delivery_ref,dispatch_job_id,status,price_minor,currency,tracking_url,courier,
    booked_at,picked_up_at,delivered_at,metadata,updated_at
  ) VALUES(
    req.tenant_id,req.product_key,req.location_id,_request,_quote,_provider_account,_provider,
    nullif(trim(_external_delivery_ref),''),_dispatch_job,_status,_price,upper(coalesce(nullif(trim(_currency),''),req.currency)),
    nullif(trim(_tracking_url),''),coalesce(_courier,'{}'::jsonb),
    CASE WHEN _status NOT IN('requested','failed','cancelled') THEN now() ELSE NULL END,
    CASE WHEN _status='picked_up' THEN now() ELSE NULL END,
    CASE WHEN _status='delivered' THEN now() ELSE NULL END,
    coalesce(_metadata,'{}'::jsonb),now()
  )
  ON CONFLICT(request_id) DO UPDATE SET
    quote_id=EXCLUDED.quote_id,provider_account_id=EXCLUDED.provider_account_id,provider_key=EXCLUDED.provider_key,
    external_delivery_ref=coalesce(EXCLUDED.external_delivery_ref,public.delivery_broker_jobs.external_delivery_ref),
    dispatch_job_id=coalesce(EXCLUDED.dispatch_job_id,public.delivery_broker_jobs.dispatch_job_id),
    status=EXCLUDED.status,price_minor=coalesce(EXCLUDED.price_minor,public.delivery_broker_jobs.price_minor),
    currency=EXCLUDED.currency,tracking_url=coalesce(EXCLUDED.tracking_url,public.delivery_broker_jobs.tracking_url),
    courier=public.delivery_broker_jobs.courier||EXCLUDED.courier,
    booked_at=CASE WHEN EXCLUDED.status NOT IN('requested','failed','cancelled') THEN coalesce(public.delivery_broker_jobs.booked_at,now()) ELSE public.delivery_broker_jobs.booked_at END,
    picked_up_at=CASE WHEN EXCLUDED.status='picked_up' THEN coalesce(public.delivery_broker_jobs.picked_up_at,now()) ELSE public.delivery_broker_jobs.picked_up_at END,
    delivered_at=CASE WHEN EXCLUDED.status='delivered' THEN coalesce(public.delivery_broker_jobs.delivered_at,now()) ELSE public.delivery_broker_jobs.delivered_at END,
    metadata=public.delivery_broker_jobs.metadata||EXCLUDED.metadata,updated_at=now()
  RETURNING id INTO jid;

  INSERT INTO public.delivery_broker_events(tenant_id,job_id,provider_key,event_type,payload)
  VALUES(req.tenant_id,jid,_provider,'job.'||_status,coalesce(_metadata,'{}'::jsonb));

  UPDATE public.delivery_quote_requests
  SET status=CASE
    WHEN _status='delivered' THEN 'booked'
    WHEN _status IN('cancelled','failed') THEN _status
    ELSE 'booked'
  END,
  updated_at=now()
  WHERE id=_request;

  RETURN jid;
END $$;

REVOKE ALL ON FUNCTION public.server_upsert_delivery_broker_job(uuid,uuid,uuid,text,text,uuid,text,bigint,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_upsert_delivery_broker_job(uuid,uuid,uuid,text,text,uuid,text,bigint,text,text,jsonb,jsonb) TO service_role;

COMMIT;
