-- Omniqora canonical SaaS Factory UK finance connector registry.
-- Catalogue and applicability ONLY: all providers remain uncontracted and disabled.
-- Preserve existing tenant/product/brand authority; never manufacture product or tenant records.
BEGIN;
INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,
 required_secret_names,public_config_names,status,implementation_status,metadata
) VALUES
 ('finance.youlend','YouLend','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('finance.liberis','Liberis','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('finance.wayflyer','Wayflyer','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('finance.iwoca','iwoca','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('finance.365-finance','365 Finance','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('finance.capify','Capify','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('finance.funding-circle','Funding Circle','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('finance.capitalise','Capitalise','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('finance.swoop','Swoop Funding','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('finance.funding-options','Funding Options by Tide','merchant_capital',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_or_marketplace","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('checkout.klarna','Klarna','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"adyen","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":"payments.adyen"}'::jsonb),
 ('checkout.paypal-paylater','PayPal Pay Later','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"adyen","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":"payments.adyen"}'::jsonb),
 ('checkout.paypal-credit','PayPal Credit','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"adyen","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":"payments.adyen"}'::jsonb),
 ('checkout.clearpay','Clearpay','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"adyen","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":"payments.adyen"}'::jsonb),
 ('checkout.affirm','Affirm','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"adyen","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":"payments.adyen"}'::jsonb),
 ('checkout.zopa','Zopa Retail Finance','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_partner","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('checkout.snap','Snap Finance','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_partner","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('checkout.v12','V12 Retail Finance','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_partner","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('checkout.novuna','Novuna Consumer Finance','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_partner","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('checkout.newpay','Newpay (NewDay)','consumer_checkout',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_partner","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('trade.kriya','Kriya','b2b_terms',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_partner","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('trade.billie','Billie','b2b_terms',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_partner","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb),
 ('trade.mondu','Mondu','b2b_terms',ARRAY['discovery','application_status']::text[],ARRAY['GB']::text[],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only','{"rail":"direct_partner","contractRequired":true,"merchantApprovalRequired":true,"liveIntegration":false,"financialPromotionReview":true,"supportedMarket":"GB","upstream":null}'::jsonb)
ON CONFLICT (provider_key) DO NOTHING;

-- Finance applicability is separate from supplier/payment provider REQUIREMENTS.
-- Existing product_provider_requirements counts and launch readiness remain unchanged.
CREATE TABLE IF NOT EXISTS public.finance_product_applicability (
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 finance_family text NOT NULL CHECK(finance_family IN ('merchant_capital','consumer_checkout','b2b_terms')),
 country_code text NOT NULL DEFAULT 'GB' CHECK(country_code='GB'),
 candidate_only boolean NOT NULL DEFAULT true CHECK(candidate_only=true),
 enabled_by_default boolean NOT NULL DEFAULT false CHECK(enabled_by_default=false),
 restrictions jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(product_key,finance_family)
);
ALTER TABLE public.finance_product_applicability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_product_applicability FROM anon,authenticated;
GRANT SELECT ON public.finance_product_applicability TO authenticated;
GRANT ALL ON public.finance_product_applicability TO service_role;
CREATE POLICY finance_product_candidate_read ON public.finance_product_applicability
 FOR SELECT TO authenticated USING(true);

WITH placements(product_key, family) AS (VALUES
 ('dishbee','merchant_capital'),
 ('dishbee','consumer_checkout'),
 ('dishbee-plus','consumer_checkout'),
 ('dishbee-plus','b2b_terms'),
 ('mealdeck','merchant_capital'),
 ('merqano','consumer_checkout'),
 ('merqano','merchant_capital'),
 ('merqano','b2b_terms'),
 ('merqora','consumer_checkout'),
 ('merqora','merchant_capital'),
 ('merqora','b2b_terms'),
 ('craftvaro','consumer_checkout'),
 ('craftvaro','merchant_capital'),
 ('craftvaro','b2b_terms'),
 ('travenexa','consumer_checkout'),
 ('travenexa','merchant_capital'),
 ('eventplanr','consumer_checkout'),
 ('eventplanr','merchant_capital'),
 ('formation-genie','merchant_capital'),
 ('formationgenie','merchant_capital'),
 ('taxnuvia','merchant_capital'),
 ('lawquo','merchant_capital'),
 ('kinderstars','merchant_capital'),
 ('kindelo','merchant_capital'),
 ('zoryn','consumer_checkout'),
 ('zoryn','merchant_capital'),
 ('zoryn','b2b_terms')
)
INSERT INTO public.finance_product_applicability(product_key,finance_family,country_code,candidate_only,enabled_by_default,restrictions)
SELECT p.product_key,placement.family,'GB',true,false,
 jsonb_build_object('merchantApproval',true,'legalReview',true,'fundsFlow',true,'sourceDataAuthority','external')
FROM placements placement
JOIN public.product_catalogue p ON p.product_key=placement.product_key
ON CONFLICT(product_key,finance_family) DO NOTHING;

-- Finance-specific approval proof is ADDITIONAL to provider_bindings.
-- Never infer a finance programme is active from a general provider binding.
CREATE TABLE IF NOT EXISTS public.finance_programme_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE RESTRICT,
 brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE CASCADE,
 programme_key text NOT NULL CHECK(length(programme_key) BETWEEN 3 AND 120),
 market text NOT NULL DEFAULT 'GB' CHECK(market='GB'),
 status text NOT NULL DEFAULT 'disabled' CHECK(status IN ('disabled','onboarding','sandbox','production','suspended')),
 merchant_legal_entity_ref text,
 merchant_account_ref text,
 commercial_agreement_ref text,
 compliance_evidence_ref text,
 provider_approval_ref text,
 funds_flow_approval_ref text,
 externally_verified_at timestamptz,
 last_reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status <> 'production' OR (
   merchant_legal_entity_ref IS NOT NULL AND merchant_account_ref IS NOT NULL
   AND commercial_agreement_ref IS NOT NULL AND compliance_evidence_ref IS NOT NULL
   AND provider_approval_ref IS NOT NULL AND funds_flow_approval_ref IS NOT NULL
   AND externally_verified_at IS NOT NULL
 )),
 UNIQUE(tenant_id,product_key,provider_key,brand_id,programme_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_programme_scope_uniq ON public.finance_programme_approvals(
 tenant_id,product_key,provider_key,COALESCE(brand_id,'00000000-0000-0000-0000-000000000000'::uuid),programme_key);
CREATE INDEX IF NOT EXISTS finance_programme_tenant_idx ON public.finance_programme_approvals(tenant_id,product_key,provider_key);
ALTER TABLE public.finance_programme_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_programme_approvals FROM anon,authenticated;
GRANT ALL ON public.finance_programme_approvals TO service_role;
GRANT SELECT ON public.finance_programme_approvals TO authenticated;
DROP POLICY IF EXISTS finance_programme_scope_read ON public.finance_programme_approvals;
CREATE POLICY finance_programme_scope_read ON public.finance_programme_approvals FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
-- No end-user or tenant-admin INSERT/UPDATE policies. The trusted back office must
-- verify evidence independently; the catalogue and binding UIs cannot switch lending on.
COMMIT;
