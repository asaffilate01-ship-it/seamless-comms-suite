-- Deeper reusable Dispatch/Fleet operations: shifts, attendance, wallet, maintenance,
-- behaviour, historical tracking, geofences, idle periods and utilisation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.dispatch_agent_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  clocked_in_at timestamptz,
  clocked_out_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','active','completed','missed','cancelled')),
  attendance_status text NOT NULL DEFAULT 'expected'
    CHECK (attendance_status IN ('expected','present','late','absent','excused')),
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (clocked_out_at IS NULL OR clocked_in_at IS NOT NULL),
  CHECK (clocked_out_at IS NULL OR clocked_out_at >= clocked_in_at)
);
CREATE INDEX IF NOT EXISTS dispatch_agent_shifts_lookup_idx
  ON public.dispatch_agent_shifts (tenant_id,tenant_product_id,agent_id,starts_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.dispatch_agent_shifts(id) ON DELETE SET NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('clock_in','clock_out','break_start','break_end','absence','late','override')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'app' CHECK (source IN ('app','admin','import','system')),
  latitude double precision,
  longitude double precision,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS dispatch_attendance_events_lookup_idx
  ON public.dispatch_attendance_events (tenant_id,tenant_product_id,agent_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_agent_wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE SET NULL,
  entry_kind text NOT NULL CHECK (entry_kind IN ('credit','debit','adjustment')),
  category text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('pending','posted','reversed')),
  source_ref text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (entry_kind='adjustment' OR amount_minor >= 0)
);
CREATE INDEX IF NOT EXISTS dispatch_agent_wallet_lookup_idx
  ON public.dispatch_agent_wallet_entries (tenant_id,tenant_product_id,agent_id,occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_agent_wallet_source_uq
  ON public.dispatch_agent_wallet_entries (tenant_id,source_ref)
  WHERE source_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.dispatch_vehicle_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.dispatch_vehicles(id) ON DELETE CASCADE,
  maintenance_kind text NOT NULL,
  title text NOT NULL,
  due_at timestamptz,
  due_odometer numeric,
  completed_at timestamptz,
  completed_odometer numeric,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','due','overdue','in_progress','completed','cancelled')),
  cost_minor bigint CHECK (cost_minor IS NULL OR cost_minor >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  provider text,
  notes text,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_vehicle_maintenance_lookup_idx
  ON public.dispatch_vehicle_maintenance (tenant_id,tenant_product_id,vehicle_id,status,due_at);

CREATE TABLE IF NOT EXISTS public.dispatch_agent_positions (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE SET NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_metres numeric,
  speed_kph numeric,
  heading_degrees numeric,
  source text NOT NULL DEFAULT 'agent_app' CHECK (source IN ('agent_app','vehicle_telematics','provider','import')),
  observed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (accuracy_metres IS NULL OR accuracy_metres >= 0),
  CHECK (speed_kph IS NULL OR speed_kph >= 0),
  CHECK (heading_degrees IS NULL OR (heading_degrees >= 0 AND heading_degrees < 360))
);
CREATE INDEX IF NOT EXISTS dispatch_agent_positions_history_idx
  ON public.dispatch_agent_positions (tenant_id,tenant_product_id,agent_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS dispatch_agent_positions_job_idx
  ON public.dispatch_agent_positions (tenant_id,job_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_driver_behaviour_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.dispatch_vehicles(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE SET NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('speeding','harsh_acceleration','harsh_braking','harsh_cornering','excessive_idle','route_deviation','other')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  value numeric,
  threshold numeric,
  latitude double precision,
  longitude double precision,
  observed_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS dispatch_driver_behaviour_lookup_idx
  ON public.dispatch_driver_behaviour_events (tenant_id,tenant_product_id,agent_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_idle_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.dispatch_vehicles(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  latitude double precision,
  longitude double precision,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (agent_id IS NOT NULL OR vehicle_id IS NOT NULL),
  CHECK (ends_at IS NULL OR ends_at >= starts_at),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS dispatch_idle_periods_lookup_idx
  ON public.dispatch_idle_periods (tenant_id,tenant_product_id,starts_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  name text NOT NULL,
  geofence_kind text NOT NULL CHECK (geofence_kind IN ('circle','polygon')),
  shape jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  event_rules text[] NOT NULL DEFAULT ARRAY['enter','exit']::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_geofences_scope_idx
  ON public.dispatch_geofences (tenant_id,tenant_product_id,active);

CREATE TABLE IF NOT EXISTS public.dispatch_geofence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  geofence_id uuid NOT NULL REFERENCES public.dispatch_geofences(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.dispatch_agents(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.dispatch_vehicles(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE SET NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('enter','exit','dwell')),
  observed_at timestamptz NOT NULL,
  latitude double precision,
  longitude double precision,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS dispatch_geofence_events_lookup_idx
  ON public.dispatch_geofence_events (tenant_id,tenant_product_id,geofence_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_fleet_utilisation_daily (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  day date NOT NULL,
  vehicle_id uuid NOT NULL REFERENCES public.dispatch_vehicles(id) ON DELETE CASCADE,
  available_minutes integer NOT NULL DEFAULT 0 CHECK (available_minutes >= 0),
  assigned_minutes integer NOT NULL DEFAULT 0 CHECK (assigned_minutes >= 0),
  moving_minutes integer NOT NULL DEFAULT 0 CHECK (moving_minutes >= 0),
  idle_minutes integer NOT NULL DEFAULT 0 CHECK (idle_minutes >= 0),
  jobs_assigned integer NOT NULL DEFAULT 0 CHECK (jobs_assigned >= 0),
  jobs_completed integer NOT NULL DEFAULT 0 CHECK (jobs_completed >= 0),
  distance_metres numeric NOT NULL DEFAULT 0 CHECK (distance_metres >= 0),
  utilisation_pct numeric NOT NULL DEFAULT 0 CHECK (utilisation_pct BETWEEN 0 AND 100),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (tenant_id,tenant_product_id,day,vehicle_id)
);
CREATE INDEX IF NOT EXISTS dispatch_fleet_utilisation_lookup_idx
  ON public.dispatch_fleet_utilisation_daily (tenant_id,tenant_product_id,day DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dispatch_agent_shifts','dispatch_attendance_events','dispatch_agent_wallet_entries',
    'dispatch_vehicle_maintenance','dispatch_agent_positions','dispatch_driver_behaviour_events',
    'dispatch_idle_periods','dispatch_geofences','dispatch_geofence_events','dispatch_fleet_utilisation_daily'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','dispatch fleet tenant read',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))',
      'dispatch fleet tenant read',t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','dispatch fleet tenant write',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))',
      'dispatch fleet tenant write',t
    );
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dispatch_agent_shifts','dispatch_vehicle_maintenance','dispatch_geofences'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END $$;

COMMIT;
