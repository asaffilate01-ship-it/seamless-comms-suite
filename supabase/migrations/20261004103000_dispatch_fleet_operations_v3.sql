-- Native reusable fleet and dispatch operations benchmarked against mature last-mile suites.
-- These are Omniqora-owned services; no external fleet/dispatch platform is required.
BEGIN;

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status,metadata
) VALUES
  ('omniqora.sla','Dispatch SLA & Exceptions','SLA policies, breach detection and operational exception queues.','operations','omniqora',true,'automatic','active','built_main','{}'),
  ('omniqora.pricing','Dispatch Pricing','Tenant rate cards, delivery fees and configurable pricing rules.','commerce','omniqora',true,'automatic','active','built_main','{}'),
  ('omniqora.wallet','Fleet Wallet & Earnings','Double-entry-ready agent wallet and earning ledger foundation.','finance','omniqora',true,'automatic','active','built_main','{}'),
  ('omniqora.carrier','Carrier Gateway','Provider-neutral carrier handoff, status and reconciliation contract.','operations','omniqora',true,'external','active','built_main','{}'),
  ('omniqora.ops-intelligence','Operations Intelligence','Evidence-backed fleet and dispatch recommendations with human approval.','ai','omniqora',true,'automatic','active','built_main',
   jsonb_build_object('humanApprovalRequired',true,'autonomousDispatch',false))
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,metadata=EXCLUDED.metadata,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
  ('omniqora.sla','omniqora.dispatch',true),
  ('omniqora.pricing','omniqora.dispatch',true),
  ('omniqora.wallet','omniqora.fleet',true),
  ('omniqora.carrier','omniqora.dispatch',true),
  ('omniqora.carrier','omniqora.tracking',true),
  ('omniqora.ops-intelligence','omniqora.dispatch',true),
  ('omniqora.ops-intelligence','omniqora.analytics',true),
  ('omniqora.ops-intelligence','omniqora.ai',false)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata) VALUES
  ('fleetora','omniqora.sla',true,false,'{}'),
  ('fleetora','omniqora.pricing',true,false,'{}'),
  ('fleetora','omniqora.wallet',true,false,'{}'),
  ('fleetora','omniqora.carrier',false,false,'{}'),
  ('fleetora','omniqora.ops-intelligence',false,false,jsonb_build_object('humanApprovalRequired',true)),
  ('fleetpulse-uae','omniqora.sla',true,false,'{}'),
  ('fleetpulse-uae','omniqora.pricing',true,false,'{}'),
  ('fleetpulse-uae','omniqora.wallet',true,false,'{}'),
  ('fleetpulse-uae','omniqora.carrier',false,false,'{}')
  ,('fleetpulse-uae','omniqora.ops-intelligence',false,false,jsonb_build_object('humanApprovalRequired',true))
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required,metadata=EXCLUDED.metadata;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
  ('fleetpulse-ae-starter','omniqora.sla',false,'{}'),
  ('fleetpulse-ae-growth','omniqora.sla',false,'{}'),
  ('fleetpulse-ae-growth','omniqora.pricing',false,'{}'),
  ('fleetpulse-ae-growth','omniqora.wallet',false,'{}'),
  ('fleetpulse-ae-growth','omniqora.ai',false,jsonb_build_object('policy','tenant-governed')),
  ('fleetpulse-ae-growth','omniqora.ops-intelligence',false,jsonb_build_object('humanApprovalRequired',true)),
  ('fleetora-white-label-landlord','omniqora.sla',false,'{}'),
  ('fleetora-white-label-landlord','omniqora.pricing',false,'{}'),
  ('fleetora-white-label-landlord','omniqora.wallet',false,'{}'),
  ('fleetora-white-label-landlord','omniqora.carrier',false,'{}')
  ,('fleetora-white-label-landlord','omniqora.ops-intelligence',false,jsonb_build_object('humanApprovalRequired',true))
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

CREATE TABLE IF NOT EXISTS public.fleet_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity numeric,
  status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','completed','missed','cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS fleet_shifts_scope_idx ON public.fleet_shifts(tenant_id,agent_id,starts_at);

CREATE TABLE IF NOT EXISTS public.fleet_attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.fleet_shifts(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK(event_type IN ('check_in','check_out','break_start','break_end')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision CHECK(latitude BETWEEN -90 AND 90),
  longitude double precision CHECK(longitude BETWEEN -180 AND 180),
  source text NOT NULL DEFAULT 'agent_app' CHECK(source IN ('agent_app','dispatcher','import','system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_maintenance_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.dispatch_vehicles(id) ON DELETE CASCADE,
  work_type text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','scheduled','in_progress','completed','cancelled')),
  due_at timestamptz,
  odometer_due_km numeric,
  completed_at timestamptz,
  cost_minor bigint CHECK(cost_minor IS NULL OR cost_minor>=0),
  currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fleet_behaviour_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.dispatch_agents(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.dispatch_vehicles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK(event_type IN ('harsh_acceleration','harsh_braking','speeding','cornering','idle','geofence_enter','geofence_exit','device_offline')),
  severity text NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','critical')),
  occurred_at timestamptz NOT NULL,
  latitude double precision CHECK(latitude BETWEEN -90 AND 90),
  longitude double precision CHECK(longitude BETWEEN -180 AND 180),
  value numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(agent_id IS NOT NULL OR vehicle_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS fleet_behaviour_scope_idx ON public.fleet_behaviour_events(tenant_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.fleet_wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','held','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,agent_id,currency)
);

CREATE TABLE IF NOT EXISTS public.fleet_wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES public.fleet_wallet_accounts(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK(entry_type IN ('earning','bonus','adjustment','payout','cash_collection','deduction','reversal')),
  amount_minor bigint NOT NULL CHECK(amount_minor<>0),
  status text NOT NULL DEFAULT 'posted' CHECK(status IN ('pending','posted','void')),
  reference_type text,
  reference_id text,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.dispatch_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  name text NOT NULL,
  job_type text,
  priority text,
  accept_within_seconds integer CHECK(accept_within_seconds IS NULL OR accept_within_seconds>0),
  arrive_within_seconds integer CHECK(arrive_within_seconds IS NULL OR arrive_within_seconds>0),
  complete_within_seconds integer CHECK(complete_within_seconds IS NULL OR complete_within_seconds>0),
  active boolean NOT NULL DEFAULT true,
  escalation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  exception_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','dismissed')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dispatch_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  name text NOT NULL,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  active boolean NOT NULL DEFAULT true,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(effective_until IS NULL OR effective_until>effective_from)
);

CREATE TABLE IF NOT EXISTS public.carrier_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  carrier_key text NOT NULL,
  status text NOT NULL DEFAULT 'configured' CHECK(status IN ('configured','active','degraded','disabled','failed')),
  secret_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities text[] NOT NULL DEFAULT '{}',
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,carrier_key)
);

CREATE TABLE IF NOT EXISTS public.operations_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  recommendation_type text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  source_kind text NOT NULL CHECK(source_kind IN ('deterministic','ai_assisted')),
  source_ref text,
  confidence numeric(7,6) CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendation jsonb NOT NULL,
  status text NOT NULL DEFAULT 'review' CHECK(status IN ('draft','review','approved','dismissed','applied','expired')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'fleet_shifts','fleet_attendance_events','fleet_maintenance_work_orders','fleet_behaviour_events',
    'fleet_wallet_accounts','fleet_wallet_entries','dispatch_sla_policies','dispatch_exceptions',
    'dispatch_rate_cards','carrier_connections','operations_recommendations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','fleet ops tenant read',table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','fleet ops tenant write',table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.geo_haversine_km(_lat1 double precision,_lng1 double precision,_lat2 double precision,_lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN _lat1 IS NULL OR _lng1 IS NULL OR _lat2 IS NULL OR _lng2 IS NULL THEN NULL ELSE
    6371 * 2 * asin(sqrt(
      power(sin(radians(_lat2-_lat1)/2),2)
      + cos(radians(_lat1))*cos(radians(_lat2))*power(sin(radians(_lng2-_lng1)/2),2)
    )) END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_auto_assign_job(_job uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job public.dispatch_jobs%rowtype; selected_agent uuid; target_lat double precision; target_lng double precision;
BEGIN
  SELECT * INTO job FROM public.dispatch_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND OR (NOT public.can_write(job.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Dispatch access denied';
  END IF;
  IF job.status<>'unassigned' THEN RAISE EXCEPTION 'Only unassigned jobs can be auto-assigned'; END IF;
  SELECT latitude,longitude INTO target_lat,target_lng FROM public.dispatch_job_stops WHERE job_id=_job ORDER BY position LIMIT 1;
  SELECT agent.id INTO selected_agent
  FROM public.dispatch_agents agent
  LEFT JOIN LATERAL (
    SELECT latitude,longitude FROM public.dispatch_agent_positions position
    WHERE position.agent_id=agent.id AND position.tenant_id=job.tenant_id
    ORDER BY observed_at DESC LIMIT 1
  ) latest ON true
  WHERE agent.tenant_id=job.tenant_id AND agent.product_key=job.product_key AND agent.status='available'
    AND (cardinality(job.required_skills)=0 OR agent.skills @> job.required_skills)
    AND (job.capacity_demand IS NULL OR agent.capacity IS NULL OR agent.capacity>=job.capacity_demand)
  ORDER BY public.geo_haversine_km(latest.latitude,latest.longitude,target_lat,target_lng) NULLS LAST,agent.created_at
  LIMIT 1;
  IF selected_agent IS NULL THEN RAISE EXCEPTION 'No eligible agent is available'; END IF;
  UPDATE public.dispatch_jobs SET assigned_agent_id=selected_agent,status='assigned',updated_at=now() WHERE id=_job;
  UPDATE public.dispatch_agents SET status='busy',updated_at=now() WHERE id=selected_agent;
  RETURN selected_agent;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_auto_assign_job(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dispatch_auto_assign_job(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fleet_post_wallet_entry(
  _tenant uuid,_agent uuid,_currency text,_entry_type text,_amount_minor bigint,
  _idempotency_key text,_reference_type text DEFAULT NULL,_reference_id text DEFAULT NULL,_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE wallet uuid; result uuid;
BEGIN
  IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Fleet wallet access denied'; END IF;
  INSERT INTO public.fleet_wallet_accounts(tenant_id,agent_id,currency)
  VALUES(_tenant,_agent,_currency) ON CONFLICT(tenant_id,agent_id,currency) DO UPDATE SET updated_at=now()
  RETURNING id INTO wallet;
  INSERT INTO public.fleet_wallet_entries(tenant_id,wallet_id,entry_type,amount_minor,idempotency_key,reference_type,reference_id,metadata)
  VALUES(_tenant,wallet,_entry_type,_amount_minor,_idempotency_key,_reference_type,_reference_id,COALESCE(_metadata,'{}'))
  ON CONFLICT(tenant_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
  RETURNING id INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.fleet_post_wallet_entry(uuid,uuid,text,text,bigint,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_post_wallet_entry(uuid,uuid,text,text,bigint,text,text,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.review_operations_recommendation(_recommendation uuid,_decision text,_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row public.operations_recommendations%rowtype;
BEGIN
  SELECT * INTO row FROM public.operations_recommendations WHERE id=_recommendation FOR UPDATE;
  IF NOT FOUND OR (NOT public.can_write(row.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Operations recommendation access denied';
  END IF;
  IF _decision NOT IN ('approved','dismissed') THEN RAISE EXCEPTION 'Review decision must be approved or dismissed'; END IF;
  UPDATE public.operations_recommendations SET status=_decision,reviewed_by=auth.uid(),reviewed_at=now(),
    review_note=NULLIF(trim(COALESCE(_note,'')),''),updated_at=now() WHERE id=_recommendation;
END; $$;
REVOKE ALL ON FUNCTION public.review_operations_recommendation(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_operations_recommendation(uuid,text,text) TO authenticated,service_role;

COMMIT;
