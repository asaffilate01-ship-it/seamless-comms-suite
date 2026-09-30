-- Main-host Omniqora AI Reception.
BEGIN;

CREATE TABLE IF NOT EXISTS public.reception_settings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  instructions text NOT NULL DEFAULT '',
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  escalation_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  escalation_phone text,
  default_locale text,
  allow_ai_drafting boolean NOT NULL DEFAULT true,
  allow_order_intake boolean NOT NULL DEFAULT false,
  allow_booking_intake boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reception_settings_scope_uq
 ON public.reception_settings(
  tenant_product_id,
  COALESCE(location_id,'00000000-0000-0000-0000-000000000000'::uuid)
 );

CREATE TABLE IF NOT EXISTS public.reception_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK(kind IN ('message','order','booking')),
  channel text NOT NULL CHECK(channel IN ('phone','whatsapp','web','app','manual','api')),
  crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  caller_number text,
  customer_name text NOT NULL,
  contact text,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK(status IN ('new','queued','accepted','confirmed','delivered','failed','handled','cancelled')),
  source_ref text,
  ordering_intent_id uuid REFERENCES public.ordering_intents(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  human_handler_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  preferred_handler_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  handoff_note text,
  receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_key text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,tenant_product_id,external_key)
);
CREATE INDEX IF NOT EXISTS reception_requests_queue_idx
 ON public.reception_requests(tenant_id,tenant_product_id,status,kind,created_at);
CREATE INDEX IF NOT EXISTS reception_requests_person_idx
 ON public.reception_requests(tenant_id,crm_person_id,created_at DESC);

ALTER TABLE public.reception_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reception_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.reception_settings,public.reception_requests TO authenticated;
GRANT ALL ON public.reception_settings,public.reception_requests TO service_role;

DROP POLICY IF EXISTS "reception settings read" ON public.reception_settings;
CREATE POLICY "reception settings read" ON public.reception_settings FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "reception settings admin write" ON public.reception_settings;
CREATE POLICY "reception settings admin write" ON public.reception_settings FOR ALL TO authenticated
 USING(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "reception requests read" ON public.reception_requests;
CREATE POLICY "reception requests read" ON public.reception_requests FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "reception requests write" ON public.reception_requests;
CREATE POLICY "reception requests write" ON public.reception_requests FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.reception_settings;
CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.reception_settings
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();
DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.reception_requests;
CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.reception_requests
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

INSERT INTO public.platform_module_event_patterns(module_key,event_pattern) VALUES
 ('reception.core','connect.*'),
 ('reception.core','crm.*'),
 ('reception.core','ordering.*'),
 ('reception.core','booking.*')
ON CONFLICT(module_key,event_pattern) DO UPDATE SET enabled=true;

COMMIT;
