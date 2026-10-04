BEGIN;

-- Native Omniqora routing/VRP gap closure.
-- No Jungleworks dependency. External map providers are optional matrix/geocode adapters;
-- optimisation, assignment scoring, fallback and audit remain Omniqora-owned.

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.routing-engine','Native Routing Engine',
  'Provider-neutral matrix/geocode abstraction, native VRP heuristics, automatic assignment, re-optimisation, batching, SLA constraints and provider scoring.',
  'operations','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,status='active',
 implementation_status='built_main',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.routing-engine','omniqora.geo'),
 ('omniqora.routing-engine','omniqora.dispatch'),
 ('omniqora.routing-engine','omniqora.fleet')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required)
SELECT 'omniqora','omniqora.routing-engine',true,false
WHERE EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key='omniqora')
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=true;

INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status,metadata
) VALUES
 ('routing.native','Omniqora Native Routing','routing',
  ARRAY['vrp','assignment','batching','reoptimisation','time_windows','skills','capacity','sla','provider_scoring','haversine_fallback'],
  ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],'active','live_main',
  '{"externalDependency":false,"engine":"omniqora"}'::jsonb),
 ('maps.openrouteservice','openrouteservice','maps',
  ARRAY['geocode','routes','matrix'],ARRAY[]::text[],ARRAY['api_key'],ARRAY['base_url'],'planned','catalogue_only',
  '{"optionalFallbackProvider":true}'::jsonb)
ON CONFLICT(provider_key) DO UPDATE SET
 name=EXCLUDED.name,provider_kind=EXCLUDED.provider_kind,capabilities=EXCLUDED.capabilities,
 required_secret_names=EXCLUDED.required_secret_names,public_config_names=EXCLUDED.public_config_names,
 status=EXCLUDED.status,implementation_status=EXCLUDED.implementation_status,
 metadata=EXCLUDED.metadata,updated_at=now();

CREATE TABLE IF NOT EXISTS public.routing_policies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 policy_key text NOT NULL DEFAULT 'default',
 objective text NOT NULL DEFAULT 'balanced'
   CHECK(objective IN('distance','duration','cost','balanced','sla')),
 provider_order text[] NOT NULL DEFAULT ARRAY['maps.google','maps.mapbox','maps.openrouteservice']::text[],
 provider_weights jsonb NOT NULL DEFAULT '{"success":0.45,"latency":0.2,"cost":0.2,"freshness":0.15}'::jsonb,
 allow_haversine_fallback boolean NOT NULL DEFAULT true,
 max_stops_per_route integer NOT NULL DEFAULT 100 CHECK(max_stops_per_route BETWEEN 1 AND 500),
 max_routes integer NOT NULL DEFAULT 100 CHECK(max_routes BETWEEN 1 AND 500),
 reoptimise_triggers text[] NOT NULL DEFAULT ARRAY['job_added','job_cancelled','agent_unavailable','vehicle_unavailable','sla_risk','traffic_change']::text[],
 constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,policy_key)
);

CREATE TABLE IF NOT EXISTS public.routing_geocode_cache(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 query_hash text NOT NULL CHECK(query_hash ~ '^[0-9a-f]{64}$'),
 query_text text NOT NULL,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 precision text,
 provider_ref text,
 raw_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 observed_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz,
 UNIQUE(tenant_id,provider_key,query_hash)
);

CREATE TABLE IF NOT EXISTS public.routing_matrix_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 travel_mode text NOT NULL DEFAULT 'driving'
   CHECK(travel_mode IN('driving','cycling','walking','truck','motorcycle')),
 origins jsonb NOT NULL,
 destinations jsonb NOT NULL,
 options jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'queued'
   CHECK(status IN('queued','running','completed','failed','cancelled','fallback')),
 provider_ref text,
 fallback_used boolean NOT NULL DEFAULT false,
 error text,
 requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS routing_matrix_queue_idx
 ON public.routing_matrix_jobs(status,created_at);

CREATE TABLE IF NOT EXISTS public.routing_matrix_cells(
 matrix_job_id uuid NOT NULL REFERENCES public.routing_matrix_jobs(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 origin_index integer NOT NULL CHECK(origin_index>=0),
 destination_index integer NOT NULL CHECK(destination_index>=0),
 distance_metres bigint CHECK(distance_metres IS NULL OR distance_metres>=0),
 duration_seconds bigint CHECK(duration_seconds IS NULL OR duration_seconds>=0),
 status text NOT NULL DEFAULT 'ok' CHECK(status IN('ok','unreachable','estimated','failed')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(matrix_job_id,origin_index,destination_index)
);

CREATE TABLE IF NOT EXISTS public.routing_provider_observations(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE CASCADE,
 operation text NOT NULL CHECK(operation IN('geocode','matrix','route','traffic')),
 succeeded boolean NOT NULL,
 latency_ms integer CHECK(latency_ms IS NULL OR latency_ms>=0),
 estimated_cost_minor bigint CHECK(estimated_cost_minor IS NULL OR estimated_cost_minor>=0),
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 distance_metres bigint,
 duration_seconds bigint,
 error_class text,
 observed_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS routing_provider_obs_idx
 ON public.routing_provider_observations(tenant_id,product_key,provider_key,operation,observed_at DESC);

CREATE TABLE IF NOT EXISTS public.routing_optimisation_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 policy_id uuid REFERENCES public.routing_policies(id) ON DELETE SET NULL,
 algorithm text NOT NULL DEFAULT 'native_greedy_2opt'
   CHECK(algorithm IN('native_greedy','native_greedy_2opt','native_balanced','external_solver')),
 objective text NOT NULL DEFAULT 'balanced'
   CHECK(objective IN('distance','duration','cost','balanced','sla')),
 reason text NOT NULL DEFAULT 'manual'
   CHECK(reason IN('manual','scheduled','job_added','job_cancelled','agent_unavailable','vehicle_unavailable','sla_risk','traffic_change')),
 input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 matrix_job_id uuid REFERENCES public.routing_matrix_jobs(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'queued'
   CHECK(status IN('queued','running','review','approved','applied','failed','cancelled','superseded')),
 score jsonb NOT NULL DEFAULT '{}'::jsonb,
 warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
 requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS routing_optimisation_queue_idx
 ON public.routing_optimisation_jobs(tenant_id,product_key,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.routing_route_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 optimisation_job_id uuid NOT NULL REFERENCES public.routing_optimisation_jobs(id) ON DELETE CASCADE,
 route_no integer NOT NULL CHECK(route_no>=0),
 agent_id uuid REFERENCES public.dispatch_agents(id) ON DELETE SET NULL,
 vehicle_id uuid REFERENCES public.dispatch_vehicles(id) ON DELETE SET NULL,
 planned_distance_metres bigint NOT NULL DEFAULT 0 CHECK(planned_distance_metres>=0),
 planned_duration_seconds bigint NOT NULL DEFAULT 0 CHECK(planned_duration_seconds>=0),
 planned_load numeric NOT NULL DEFAULT 0,
 capacity numeric,
 started_at timestamptz,
 planned_finish_at timestamptz,
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','review','approved','applied','active','completed','cancelled')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(optimisation_job_id,route_no)
);

CREATE TABLE IF NOT EXISTS public.routing_route_plan_stops(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 route_plan_id uuid NOT NULL REFERENCES public.routing_route_plans(id) ON DELETE CASCADE,
 sequence integer NOT NULL CHECK(sequence>=0),
 job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
 dispatch_stop_id uuid REFERENCES public.dispatch_job_stops(id) ON DELETE CASCADE,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 planned_arrival_at timestamptz,
 planned_departure_at timestamptz,
 distance_from_previous_metres bigint NOT NULL DEFAULT 0,
 duration_from_previous_seconds bigint NOT NULL DEFAULT 0,
 service_seconds integer NOT NULL DEFAULT 0,
 load_after numeric,
 constraint_state text NOT NULL DEFAULT 'ok' CHECK(constraint_state IN('ok','warning','breach')),
 constraint_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(route_plan_id,sequence)
);

CREATE TABLE IF NOT EXISTS public.routing_assignment_recommendations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
 agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
 vehicle_id uuid REFERENCES public.dispatch_vehicles(id) ON DELETE SET NULL,
 score numeric NOT NULL,
 distance_metres bigint,
 estimated_seconds bigint,
 reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
 constraints jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'candidate'
   CHECK(status IN('candidate','selected','rejected','expired','applied')),
 generated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS routing_assignment_job_idx
 ON public.routing_assignment_recommendations(job_id,status,score DESC);

CREATE TABLE IF NOT EXISTS public.routing_reoptimisation_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 optimisation_job_id uuid REFERENCES public.routing_optimisation_jobs(id) ON DELETE SET NULL,
 trigger_type text NOT NULL,
 trigger_ref text,
 previous_plan_refs uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY[
  'routing_policies','routing_geocode_cache','routing_matrix_jobs','routing_matrix_cells',
  'routing_provider_observations','routing_optimisation_jobs','routing_route_plans',
  'routing_route_plan_stops','routing_assignment_recommendations','routing_reoptimisation_events'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
    'routing tenant read '||t,t);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))',
    'routing tenant write '||t,t);
 END LOOP;
END $$;

-- Provider observations are integration evidence: tenant users may read but not fabricate them.
REVOKE INSERT,UPDATE,DELETE ON public.routing_provider_observations FROM authenticated;

CREATE OR REPLACE FUNCTION public.routing_rank_providers(
 _tenant uuid,_product text,_operation text DEFAULT 'matrix',_lookback_hours integer DEFAULT 168
) RETURNS TABLE(
 provider_key text,success_rate numeric,avg_latency_ms numeric,avg_cost_minor numeric,observation_count bigint,score numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 WITH candidates AS(
  SELECT unnest(COALESCE(
    (SELECT p.provider_order FROM public.routing_policies p
     WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.status='active'
     ORDER BY CASE WHEN p.policy_key='default' THEN 0 ELSE 1 END LIMIT 1),
    ARRAY['maps.google','maps.mapbox','maps.openrouteservice']::text[]
  )) provider_key
 ), stats AS(
  SELECT o.provider_key,
         avg(CASE WHEN o.succeeded THEN 1.0 ELSE 0.0 END) success_rate,
         avg(o.latency_ms)::numeric avg_latency_ms,
         avg(o.estimated_cost_minor)::numeric avg_cost_minor,
         count(*) observation_count
  FROM public.routing_provider_observations o
  WHERE o.tenant_id=_tenant AND o.product_key=_product AND o.operation=_operation
    AND o.observed_at>=now()-make_interval(hours=>GREATEST(1,_lookback_hours))
  GROUP BY o.provider_key
 ), maxes AS(
  SELECT GREATEST(COALESCE(max(avg_latency_ms),1),1) max_latency,
         GREATEST(COALESCE(max(avg_cost_minor),1),1) max_cost
  FROM stats
 )
 SELECT c.provider_key,
        COALESCE(s.success_rate,0.75)::numeric,
        COALESCE(s.avg_latency_ms,1000)::numeric,
        COALESCE(s.avg_cost_minor,0)::numeric,
        COALESCE(s.observation_count,0)::bigint,
        round((
          COALESCE(s.success_rate,0.75)*60
          + (1-LEAST(COALESCE(s.avg_latency_ms,1000)/m.max_latency,1))*20
          + (1-LEAST(COALESCE(s.avg_cost_minor,0)/m.max_cost,1))*20
        )::numeric,4) score
 FROM candidates c
 LEFT JOIN stats s USING(provider_key)
 CROSS JOIN maxes m
 WHERE EXISTS(
   SELECT 1 FROM public.provider_catalogue pc
   WHERE pc.provider_key=c.provider_key AND pc.status<>'retired'
 )
 ORDER BY score DESC,c.provider_key
$$;
REVOKE ALL ON FUNCTION public.routing_rank_providers(uuid,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.routing_rank_providers(uuid,text,text,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.routing_create_optimisation(
 _tenant uuid,_product text,_reason text DEFAULT 'manual',_objective text DEFAULT 'balanced'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE oid uuid;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(_tenant,auth.uid()) THEN
  RAISE EXCEPTION 'Routing write access denied';
 END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.routing-engine')
    AND NOT public.is_platform_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Routing engine entitlement required';
 END IF;
 INSERT INTO public.routing_optimisation_jobs(
  tenant_id,product_key,policy_id,algorithm,objective,reason,input_snapshot,status,requested_by
 )
 SELECT _tenant,_product,p.id,'native_greedy_2opt',_objective,_reason,
        jsonb_build_object(
          'unassignedJobs',(SELECT count(*) FROM public.dispatch_jobs j WHERE j.tenant_id=_tenant AND j.product_key=_product AND j.status='unassigned'),
          'availableAgents',(SELECT count(*) FROM public.dispatch_agents a WHERE a.tenant_id=_tenant AND a.product_key=_product AND a.status='available'),
          'availableVehicles',(SELECT count(*) FROM public.dispatch_vehicles v WHERE v.tenant_id=_tenant AND v.product_key=_product AND v.status='available')
        ),
        'queued',auth.uid()
 FROM (SELECT id FROM public.routing_policies
       WHERE tenant_id=_tenant AND product_key=_product AND status='active'
       ORDER BY CASE WHEN policy_key='default' THEN 0 ELSE 1 END LIMIT 1) p
 RIGHT JOIN (SELECT 1) x ON true
 RETURNING id INTO oid;
 RETURN oid;
END $$;
REVOKE ALL ON FUNCTION public.routing_create_optimisation(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.routing_create_optimisation(uuid,text,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.dispatch_generate_assignment_recommendations(
 _tenant uuid,_product text,_job uuid,_limit integer DEFAULT 5
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE j public.dispatch_jobs%rowtype;first_stop public.dispatch_job_stops%rowtype;n integer:=0;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(_tenant,auth.uid()) THEN
  RAISE EXCEPTION 'Dispatch recommendation access denied';
 END IF;
 SELECT * INTO j FROM public.dispatch_jobs
 WHERE id=_job AND tenant_id=_tenant AND product_key=_product;
 IF NOT FOUND OR j.status<>'unassigned' THEN RAISE EXCEPTION 'Unassigned job required'; END IF;
 SELECT * INTO first_stop FROM public.dispatch_job_stops WHERE job_id=j.id ORDER BY position LIMIT 1;
 DELETE FROM public.routing_assignment_recommendations
 WHERE job_id=j.id AND status='candidate';

 INSERT INTO public.routing_assignment_recommendations(
  tenant_id,product_key,job_id,agent_id,vehicle_id,score,distance_metres,estimated_seconds,reasons,constraints,status,expires_at
 )
 SELECT _tenant,_product,j.id,a.id,v.id,
        round((
          1000
          - COALESCE(d.distance_metres,25000)/100.0
          + CASE WHEN sh.active_shift THEN 100 ELSE 0 END
          + cardinality(j.required_skills)*10
          + CASE WHEN v.id IS NOT NULL THEN 20 ELSE 0 END
        )::numeric,3),
        d.distance_metres,
        CASE WHEN d.distance_metres IS NULL THEN NULL ELSE GREATEST(60,(d.distance_metres/11.11)::bigint) END,
        jsonb_build_array(
          'skills_match',
          CASE WHEN sh.active_shift THEN 'active_shift' ELSE 'no_shift_constraint' END,
          CASE WHEN d.distance_metres IS NULL THEN 'distance_unknown' ELSE 'distance_estimated' END
        ),
        jsonb_build_object(
          'requiredSkills',j.required_skills,
          'requiredVehicleTypes',j.required_vehicle_types,
          'capacityDemand',j.capacity_demand
        ),
        'candidate',now()+interval '15 minutes'
 FROM public.dispatch_agents a
 LEFT JOIN LATERAL(
  SELECT EXISTS(
    SELECT 1 FROM public.dispatch_shifts s
    WHERE s.tenant_id=_tenant AND s.product_key=_product AND s.agent_id=a.id
      AND s.planned_status IN('scheduled','confirmed')
      AND now() BETWEEN s.starts_at AND s.ends_at
  ) active_shift,
  EXISTS(
    SELECT 1 FROM public.dispatch_shifts s2
    WHERE s2.tenant_id=_tenant AND s2.product_key=_product AND s2.agent_id=a.id
      AND s2.planned_status IN('scheduled','confirmed')
  ) has_any_shift
 ) sh ON true
 LEFT JOIN LATERAL(
  SELECT p.latitude,p.longitude,
         CASE WHEN first_stop.id IS NULL THEN NULL ELSE
          (6371000*2*asin(sqrt(
            power(sin(radians(first_stop.latitude-p.latitude)/2),2)
            + cos(radians(p.latitude))*cos(radians(first_stop.latitude))
              *power(sin(radians(first_stop.longitude-p.longitude)/2),2)
          )))::bigint END distance_metres
  FROM public.dispatch_agent_positions p
  WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.agent_id=a.id
  ORDER BY p.observed_at DESC LIMIT 1
 ) d ON true
 LEFT JOIN LATERAL(
  SELECT v0.*
  FROM public.dispatch_vehicles v0
  WHERE v0.tenant_id=_tenant AND v0.product_key=_product AND v0.status='available'
    AND (cardinality(j.required_vehicle_types)=0 OR v0.vehicle_type=ANY(j.required_vehicle_types))
    AND (j.capacity_demand IS NULL OR v0.capacity IS NULL OR v0.capacity>=j.capacity_demand)
  ORDER BY
    CASE WHEN cardinality(j.required_vehicle_types)>0 AND v0.vehicle_type=ANY(j.required_vehicle_types) THEN 0 ELSE 1 END,
    COALESCE(v0.capacity,999999)
  LIMIT 1
 ) v ON true
 WHERE a.tenant_id=_tenant AND a.product_key=_product AND a.status='available'
   AND a.skills @> j.required_skills
   AND (NOT sh.has_any_shift OR sh.active_shift)
   AND (
      (cardinality(j.required_vehicle_types)=0 AND j.capacity_demand IS NULL)
      OR v.id IS NOT NULL
   )
 ORDER BY
   COALESCE(d.distance_metres,25000),
   a.updated_at
 LIMIT LEAST(GREATEST(_limit,1),20);

 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_generate_assignment_recommendations(uuid,text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dispatch_generate_assignment_recommendations(uuid,text,uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.dispatch_apply_assignment_recommendation(_recommendation uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE r public.routing_assignment_recommendations%rowtype;
BEGIN
 SELECT * INTO r FROM public.routing_assignment_recommendations WHERE id=_recommendation FOR UPDATE;
 IF NOT FOUND OR r.status<>'candidate' OR (r.expires_at IS NOT NULL AND r.expires_at<=now()) THEN
  RAISE EXCEPTION 'Active assignment recommendation required';
 END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(r.tenant_id,auth.uid()) THEN
  RAISE EXCEPTION 'Dispatch assignment access denied';
 END IF;
 PERFORM public.dispatch_assign_job(r.job_id,r.agent_id,r.vehicle_id);
 UPDATE public.routing_assignment_recommendations
 SET status=CASE WHEN id=r.id THEN 'applied' ELSE 'rejected' END
 WHERE job_id=r.job_id AND status='candidate';
END $$;
REVOKE ALL ON FUNCTION public.dispatch_apply_assignment_recommendation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dispatch_apply_assignment_recommendation(uuid) TO authenticated,service_role;

COMMIT;
