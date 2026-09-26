-- Omniqora Connect: multi-number SaaS/tenant communications layer
BEGIN;

ALTER TABLE public.whatsapp_channels
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS product_key text NOT NULL DEFAULT 'omniqora',
  ADD COLUMN IF NOT EXISTS external_tenant_id text,
  ADD COLUMN IF NOT EXISTS scope_kind text NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS scope_id text,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_handoff_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inbound_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS outbound_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.whatsapp_channels
  DROP CONSTRAINT IF EXISTS whatsapp_channels_scope_kind_check;
ALTER TABLE public.whatsapp_channels
  ADD CONSTRAINT whatsapp_channels_scope_kind_check
  CHECK (scope_kind IN ('platform','tenant','location','department'));

CREATE INDEX IF NOT EXISTS whatsapp_channels_product_scope_idx
  ON public.whatsapp_channels (tenant_id, product_key, external_tenant_id, scope_kind, scope_id);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_channels_one_primary_scope
  ON public.whatsapp_channels (
    tenant_id,
    product_key,
    COALESCE(external_tenant_id, ''),
    scope_kind,
    COALESCE(scope_id, '')
  )
  WHERE is_primary;

CREATE TABLE IF NOT EXISTS public.communication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  external_tenant_id text NOT NULL,
  scope_id text NOT NULL,
  source_event_id text NOT NULL,
  event_type text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('source_to_connect','connect_to_source')),
  recipient jsonb,
  message jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','delivered','failed','skipped','blocked')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_key, source_event_id)
);

CREATE INDEX IF NOT EXISTS communication_events_queue_idx
  ON public.communication_events (status, created_at);
CREATE INDEX IF NOT EXISTS communication_events_scope_idx
  ON public.communication_events (tenant_id, product_key, external_tenant_id, scope_id, created_at DESC);

GRANT SELECT ON public.communication_events TO authenticated;
GRANT ALL ON public.communication_events TO service_role;
ALTER TABLE public.communication_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "communication events tenant read" ON public.communication_events;
CREATE POLICY "communication events tenant read"
ON public.communication_events
FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id, auth.uid()));

DROP POLICY IF EXISTS "communication events admin write" ON public.communication_events;
CREATE POLICY "communication events admin write"
ON public.communication_events
FOR ALL TO authenticated
USING (public.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
WITH CHECK (public.has_tenant_role(tenant_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

DROP VIEW IF EXISTS public.whatsapp_channel_status;
CREATE VIEW public.whatsapp_channel_status
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.tenant_id,
  c.display_phone,
  c.status,
  c.updated_at,
  c.label,
  c.product_key,
  c.external_tenant_id,
  c.scope_kind,
  c.scope_id,
  c.is_primary,
  c.ai_enabled,
  c.human_handoff_enabled,
  c.inbound_enabled,
  c.outbound_enabled
FROM public.whatsapp_channels c;

GRANT SELECT ON public.whatsapp_channel_status TO authenticated;
GRANT ALL ON public.whatsapp_channel_status TO service_role;

COMMIT;
