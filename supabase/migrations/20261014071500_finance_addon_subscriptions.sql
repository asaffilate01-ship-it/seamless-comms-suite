-- Commercial ownership: Omniqora earns only connector software/hosting subscriptions.
-- Zoryn Pay earns separately contracted external lender/payment-finance commissions.
-- This is an add-on quote/entitlement registry, NOT a billing engine or ledger of lender commissions.
BEGIN;
CREATE TABLE IF NOT EXISTS public.finance_connector_addon_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 plan_key text NOT NULL CHECK(plan_key IN('finance_connect_access','finance_connect_pro','finance_connect_enterprise')),
 payee text NOT NULL DEFAULT 'omniqora' CHECK(payee='omniqora'),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','quoted','contracted','active','cancelled')),
 pricing_status text NOT NULL DEFAULT 'quote_required' CHECK(pricing_status IN('quote_required','agreed')),
 monthly_fee_minor bigint CHECK(monthly_fee_minor IS NULL OR monthly_fee_minor >= 0),
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
 billing_legal_entity_ref text, billing_contract_ref text, billing_subscription_ref text,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key),
 CHECK(status<>'active' OR (pricing_status='agreed' AND monthly_fee_minor IS NOT NULL
  AND billing_legal_entity_ref IS NOT NULL AND billing_contract_ref IS NOT NULL AND billing_subscription_ref IS NOT NULL)),
 CHECK(status<>'requested' OR pricing_status='quote_required')
);
CREATE INDEX IF NOT EXISTS finance_addon_tenant_idx ON public.finance_connector_addon_subscriptions(tenant_id,product_key,status);
ALTER TABLE public.finance_connector_addon_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_connector_addon_subscriptions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.finance_connector_addon_subscriptions TO authenticated;
GRANT ALL ON public.finance_connector_addon_subscriptions TO service_role;
DROP POLICY IF EXISTS finance_addon_tenant_read ON public.finance_connector_addon_subscriptions;
CREATE POLICY finance_addon_tenant_read ON public.finance_connector_addon_subscriptions FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

CREATE OR REPLACE FUNCTION public.finance_request_connector_addon(
 _tenant uuid, _product text, _plan text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT (
  public.is_platform_admin(auth.uid()) OR
  public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[])
 ) THEN RAISE EXCEPTION 'Tenant owner or administrator required'; END IF;
 IF _plan NOT IN('finance_connect_access','finance_connect_pro','finance_connect_enterprise')
 THEN RAISE EXCEPTION 'Invalid finance connector plan'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products tp WHERE tp.tenant_id=_tenant
 AND tp.product_key=_product AND tp.status='active')
 THEN RAISE EXCEPTION 'Active SaaS tenant product required'; END IF;
 INSERT INTO public.finance_connector_addon_subscriptions(tenant_id,product_key,plan_key,created_by)
 VALUES(_tenant,_product,_plan,auth.uid())
 ON CONFLICT(tenant_id,product_key) DO UPDATE
 SET plan_key=EXCLUDED.plan_key,updated_at=now()
 WHERE finance_connector_addon_subscriptions.status='requested'
 RETURNING id INTO v_id;
 IF v_id IS NULL THEN
  RAISE EXCEPTION 'A quoted or contracted add-on must be changed through approved billing operations';
 END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.finance_request_connector_addon(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_request_connector_addon(uuid,text,text) TO authenticated;
COMMIT;
