BEGIN;

CREATE TABLE IF NOT EXISTS public.automotive_addon_entitlements (
  tenant_id uuid NOT NULL,
  product text NOT NULL CHECK (product IN ('zivvo','autohashi','sparesgrid')),
  addon text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  plan text NOT NULL CHECK (plan IN ('core','addon','enterprise','trial')),
  usage_limit bigint,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, product, addon)
);

CREATE TABLE IF NOT EXISTS public.automotive_vehicles (
  tenant_id uuid NOT NULL,
  vehicle_id uuid NOT NULL DEFAULT gen_random_uuid(),
  origin text NOT NULL CHECK (origin IN ('uk','japan','other')),
  vrm text,
  vin text,
  chassis_number text,
  model_code text,
  make text NOT NULL,
  model text NOT NULL,
  derivative text,
  first_registration_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, vehicle_id),
  CHECK (vrm IS NOT NULL OR vin IS NOT NULL OR chassis_number IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS automotive_vehicle_vrm_idx ON public.automotive_vehicles(tenant_id, vrm) WHERE vrm IS NOT NULL;
CREATE INDEX IF NOT EXISTS automotive_vehicle_vin_idx ON public.automotive_vehicles(tenant_id, vin) WHERE vin IS NOT NULL;
CREATE INDEX IF NOT EXISTS automotive_vehicle_chassis_idx ON public.automotive_vehicles(tenant_id, chassis_number) WHERE chassis_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.automotive_evidence (
  tenant_id uuid NOT NULL,
  evidence_id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  appraisal_id uuid,
  kind text NOT NULL CHECK (kind IN ('photo','video','document')),
  capture_item text NOT NULL,
  original_object_key text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  capture_session_created_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  provider_timestamp timestamptz,
  mime_type text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  source text NOT NULL,
  location_captured boolean NOT NULL DEFAULT false CHECK (location_captured = false),
  metadata_sanitised boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, evidence_id),
  FOREIGN KEY (tenant_id, vehicle_id) REFERENCES public.automotive_vehicles(tenant_id, vehicle_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.automotive_appraisals (
  tenant_id uuid NOT NULL,
  appraisal_id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  product text NOT NULL CHECK (product IN ('zivvo','autohashi','sparesgrid')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','capture_requested','capturing','review','completed','expired','cancelled')),
  requested_items text[] NOT NULL DEFAULT '{}',
  require_fresh_capture boolean NOT NULL DEFAULT true,
  allow_library_upload boolean NOT NULL DEFAULT false,
  capture_geolocation boolean NOT NULL DEFAULT false CHECK (capture_geolocation = false),
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, appraisal_id),
  FOREIGN KEY (tenant_id, vehicle_id) REFERENCES public.automotive_vehicles(tenant_id, vehicle_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.automotive_passport_snapshots (
  tenant_id uuid NOT NULL,
  snapshot_id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  passport jsonb NOT NULL,
  source_manifest jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid,
  PRIMARY KEY (tenant_id, snapshot_id),
  UNIQUE (tenant_id, vehicle_id, revision),
  FOREIGN KEY (tenant_id, vehicle_id) REFERENCES public.automotive_vehicles(tenant_id, vehicle_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.automotive_provider_jobs (
  tenant_id uuid NOT NULL,
  job_id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid,
  appraisal_id uuid,
  provider text NOT NULL,
  capability text NOT NULL,
  external_job_id text,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','submitted','processing','completed','failed','cancelled')),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_payload jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, job_id),
  UNIQUE (tenant_id, provider, idempotency_key),
  FOREIGN KEY (tenant_id, vehicle_id) REFERENCES public.automotive_vehicles(tenant_id, vehicle_id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, appraisal_id) REFERENCES public.automotive_appraisals(tenant_id, appraisal_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.automotive_status_history (
  tenant_id uuid NOT NULL,
  history_id uuid NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id uuid,
  appraisal_id uuid,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor_type text NOT NULL CHECK (actor_type IN ('user','system','provider','webhook')),
  actor_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, history_id)
);

ALTER TABLE public.automotive_evidence
  ADD CONSTRAINT automotive_evidence_appraisal_fk
  FOREIGN KEY (tenant_id, appraisal_id)
  REFERENCES public.automotive_appraisals(tenant_id, appraisal_id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.automotive_webhook_endpoints (
  tenant_id uuid NOT NULL,
  endpoint_id uuid NOT NULL DEFAULT gen_random_uuid(),
  product text NOT NULL CHECK (product IN ('zivvo','autohashi','sparesgrid')),
  endpoint_url text NOT NULL,
  secret_ref text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  subscribed_events text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, endpoint_id),
  CHECK (endpoint_url LIKE 'https://%')
);

CREATE TABLE IF NOT EXISTS public.automotive_webhook_deliveries (
  tenant_id uuid NOT NULL,
  delivery_id uuid NOT NULL DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL,
  event_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','delivering','delivered','retry','dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_http_status integer,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  PRIMARY KEY (tenant_id, delivery_id),
  UNIQUE (tenant_id, endpoint_id, event_id),
  FOREIGN KEY (tenant_id, endpoint_id) REFERENCES public.automotive_webhook_endpoints(tenant_id, endpoint_id) ON DELETE CASCADE
);

ALTER TABLE public.automotive_addon_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_appraisals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_passport_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_provider_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY automotive_entitlements_member_read ON public.automotive_addon_entitlements
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_addon_entitlements.tenant_id AND tm.user_id = auth.uid())
);

CREATE POLICY automotive_vehicles_member_access ON public.automotive_vehicles
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_vehicles.tenant_id AND tm.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_vehicles.tenant_id AND tm.user_id = auth.uid())
);

CREATE POLICY automotive_evidence_member_read ON public.automotive_evidence
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_evidence.tenant_id AND tm.user_id = auth.uid())
);

CREATE POLICY automotive_evidence_member_insert ON public.automotive_evidence
FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_evidence.tenant_id AND tm.user_id = auth.uid())
);

CREATE POLICY automotive_appraisals_member_access ON public.automotive_appraisals
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_appraisals.tenant_id AND tm.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_appraisals.tenant_id AND tm.user_id = auth.uid())
);

CREATE POLICY automotive_passport_member_read ON public.automotive_passport_snapshots
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_passport_snapshots.tenant_id AND tm.user_id = auth.uid())
);

CREATE POLICY automotive_provider_jobs_member_read ON public.automotive_provider_jobs
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_provider_jobs.tenant_id AND tm.user_id = auth.uid())
);

CREATE POLICY automotive_status_history_member_read ON public.automotive_status_history
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_status_history.tenant_id AND tm.user_id = auth.uid())
);

CREATE POLICY automotive_webhooks_admin_access ON public.automotive_webhook_endpoints
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_webhook_endpoints.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_webhook_endpoints.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin'))
);

CREATE POLICY automotive_webhook_deliveries_admin_read ON public.automotive_webhook_deliveries
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_webhook_deliveries.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin'))
);

CREATE TABLE IF NOT EXISTS public.automotive_api_requests (
  tenant_id uuid NOT NULL,
  connection_id text NOT NULL,
  idempotency_key text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing','completed','failed')),
  response_payload jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, connection_id, idempotency_key)
);

ALTER TABLE public.automotive_api_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY automotive_api_requests_admin_read ON public.automotive_api_requests
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_api_requests.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin'))
);

CREATE TABLE IF NOT EXISTS public.automotive_inbound_events (
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  connection_id text NOT NULL,
  product text NOT NULL CHECK (product IN ('zivvo','autohashi','sparesgrid')),
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processing','processed','failed')),
  last_error text,
  PRIMARY KEY (tenant_id, event_id)
);

ALTER TABLE public.automotive_inbound_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY automotive_inbound_events_admin_read ON public.automotive_inbound_events
FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = automotive_inbound_events.tenant_id AND tm.user_id = auth.uid() AND tm.role IN ('owner','admin'))
);

COMMIT;
