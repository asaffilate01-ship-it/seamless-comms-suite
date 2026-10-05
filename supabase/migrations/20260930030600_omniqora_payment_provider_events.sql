-- Idempotent provider-status reconciliation for shared Payments.
BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_provider_events(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payment_intent_id uuid REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  refund_id uuid REFERENCES public.payment_refunds(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_event_id)
);
CREATE INDEX IF NOT EXISTS payment_provider_events_payment_idx
 ON public.payment_provider_events(tenant_id,payment_intent_id,created_at DESC);

ALTER TABLE public.payment_provider_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.payment_provider_events TO authenticated;
GRANT ALL ON public.payment_provider_events TO service_role;
DROP POLICY IF EXISTS "payment provider events tenant read" ON public.payment_provider_events;
CREATE POLICY "payment provider events tenant read" ON public.payment_provider_events FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));

COMMIT;
