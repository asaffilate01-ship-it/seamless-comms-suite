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
