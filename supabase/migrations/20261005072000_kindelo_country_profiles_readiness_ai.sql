-- Product/country defaults, launch templates and governed Intelligence use-cases.
-- Wires Kindelo UK/Germany into the SaaS Factory without forking the application.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_product_runtime_defaults(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  region_key text REFERENCES public.platform_region_packs(region_key) ON DELETE CASCADE,
  config_key text NOT NULL,
  value jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_key,region_key,config_key)
);

CREATE TABLE IF NOT EXISTS public.platform_product_launch_check_templates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  check_key text NOT NULL,
  category text NOT NULL CHECK(category IN (
    'identity','branding','domain','localisation','entitlements','payments','communications',
    'marketplace','mobile','compliance','data','security','observability','migration'
  )),
  required boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_key,check_key)
);

CREATE TABLE IF NOT EXISTS public.platform_product_intelligence_use_cases(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  use_case_key text NOT NULL,
  name text NOT NULL,
  job_type text NOT NULL,
  module_key text NOT NULL DEFAULT 'intelligence.core',
  mode text NOT NULL DEFAULT 'assistive' CHECK(mode IN ('assistive','recommendation','classification','forecast','anomaly','search','summary')),
  requires_human_approval boolean NOT NULL DEFAULT true,
  allowed_inputs text[] NOT NULL DEFAULT '{}',
  output_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
  governance jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','active','disabled','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_key,use_case_key)
);

ALTER TABLE public.platform_product_runtime_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_product_launch_check_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_product_intelligence_use_cases ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.platform_product_runtime_defaults,
 public.platform_product_launch_check_templates,
 public.platform_product_intelligence_use_cases TO authenticated;
GRANT ALL ON public.platform_product_runtime_defaults,
 public.platform_product_launch_check_templates,
 public.platform_product_intelligence_use_cases TO service_role;

DROP POLICY IF EXISTS "product runtime defaults read" ON public.platform_product_runtime_defaults;
CREATE POLICY "product runtime defaults read" ON public.platform_product_runtime_defaults
FOR SELECT TO authenticated USING(true);

DROP POLICY IF EXISTS "product launch templates read" ON public.platform_product_launch_check_templates;
CREATE POLICY "product launch templates read" ON public.platform_product_launch_check_templates
FOR SELECT TO authenticated USING(true);

DROP POLICY IF EXISTS "product intelligence catalogue read" ON public.platform_product_intelligence_use_cases;
CREATE POLICY "product intelligence catalogue read" ON public.platform_product_intelligence_use_cases
FOR SELECT TO authenticated USING(status<>'retired');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'platform_product_runtime_defaults',
    'platform_product_launch_check_templates',
    'platform_product_intelligence_use_cases'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format(
      'CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',
      t
    );
  END LOOP;
END $$;

-- Common Kindelo runtime settings are inherited through explicit country variants.
INSERT INTO public.platform_product_runtime_defaults(product_key,region_key,config_key,value,description) VALUES
('kindelo-gb','GB','country.code','"GB"'::jsonb,'Kindelo UK country'),
('kindelo-gb','GB','country.currency','"GBP"'::jsonb,'Kindelo UK currency'),
('kindelo-gb','GB','country.defaultLocale','"en-GB"'::jsonb,'Kindelo UK locale'),
('kindelo-gb','GB','childcare.providerLabel','"Childminder"'::jsonb,'UK marketplace provider terminology'),
('kindelo-gb','GB','childcare.authorityModel','"uk-configurable-local-authority"'::jsonb,'UK regulator/local authority adapter profile'),
('kindelo-gb','GB','childcare.fundingModel','"uk-configurable-funded-hours"'::jsonb,'UK funded childcare rules remain versioned/configurable'),
('kindelo-gb','GB','compliance.profile','"gb-childcare-agency"'::jsonb,'UK childcare compliance pack key'),
('kindelo-gb','GB','data.residency','"GB"'::jsonb,'Preferred data region'),

('kindelo-de','DE','country.code','"DE"'::jsonb,'Kindelo Germany country'),
('kindelo-de','DE','country.currency','"EUR"'::jsonb,'Kindelo Germany currency'),
('kindelo-de','DE','country.defaultLocale','"de-DE"'::jsonb,'Kindelo Germany default locale'),
('kindelo-de','DE','childcare.providerLabel','"Kindertagespflegeperson / Betreuungsperson"'::jsonb,'German provider terminology'),
('kindelo-de','DE','childcare.authorityModel','"de-jugendamt-configurable"'::jsonb,'German Jugendamt/local authority adapter profile'),
('kindelo-de','DE','childcare.partnerModel','"de-kita-partner"'::jsonb,'German Kita partner/referral extension'),
('kindelo-de','DE','compliance.profile','"de-childcare-configurable"'::jsonb,'German childcare compliance pack key'),
('kindelo-de','DE','data.residency','"EU"'::jsonb,'Preferred EU data region')
ON CONFLICT(product_key,region_key,config_key) DO UPDATE SET
 value=EXCLUDED.value,description=EXCLUDED.description,enabled=true,updated_at=now();

INSERT INTO public.platform_product_launch_check_templates(product_key,check_key,category,required,description)
SELECT p.product_key,x.check_key,x.category,x.required,x.description
FROM (VALUES
 ('identity.owner','identity',true,'Tenant owner/admin identity is configured'),
 ('branding.profile','branding',true,'Active tenant brand profile exists'),
 ('domain.app','domain',false,'Verified app or portal domain exists; platform host may be used initially'),
 ('localisation.country','localisation',true,'Country and locale defaults have been applied'),
 ('entitlements.core','entitlements',true,'Required inherited modules are enabled'),
 ('payments.provider','payments',true,'Production payment provider is configured and verified'),
 ('communications.primary','communications',false,'Primary communication identity/provider is configured'),
 ('marketplace.vendor_model','marketplace',true,'Marketplace vendor/provider model is enabled'),
 ('mobile.profile','mobile',false,'Tenant mobile/PWA profile is configured when required'),
 ('compliance.pack','compliance',true,'Country compliance profile is selected'),
 ('data.authority','data',true,'Source-of-truth and migration authority are recorded'),
 ('security.rls','security',true,'Tenant isolation/RLS verification passed'),
 ('observability.audit','observability',true,'Audit/health telemetry is enabled'),
 ('migration.parity','migration',false,'Legacy parity check is passed before authority cutover')
) AS x(check_key,category,required,description)
JOIN public.platform_products p ON p.product_key IN ('kindelo-gb','kindelo-de')
ON CONFLICT(product_key,check_key) DO UPDATE SET
 category=EXCLUDED.category,required=EXCLUDED.required,description=EXCLUDED.description,updated_at=now();

INSERT INTO public.platform_product_intelligence_use_cases(
 product_key,use_case_key,name,job_type,mode,requires_human_approval,allowed_inputs,output_contract,governance,status
)
SELECT p.product_key,u.use_case_key,u.name,u.job_type,u.mode,u.requires_human_approval,u.allowed_inputs,u.output_contract,u.governance,'preview'
FROM (VALUES
 ('provider-match','Provider matching','childcare.provider_match','recommendation',true,
   ARRAY['guardian_preferences','child_age','location','availability','provider_profile','compliance_status']::text[],
   '{"rankedProviderRefs":"string[]","reasons":"object[]","constraintsApplied":"string[]"}'::jsonb,
   '{"noAutonomousPlacement":true,"excludeProtectedTraitScoring":true,"explainRanking":true}'::jsonb),
 ('compliance-risk','Provider compliance risk triage','childcare.compliance_risk','classification',true,
   ARRAY['compliance_evidence','expiry_dates','training_records','verification_status']::text[],
   '{"risk":"low|medium|high","reasons":"string[]","recommendedActions":"string[]"}'::jsonb,
   '{"humanReviewRequiredForAdverseAction":true,"evidenceGrounded":true}'::jsonb),
 ('funding-anomaly','Funding claim anomaly detection','childcare.funding_anomaly','anomaly',true,
   ARRAY['funding_case','funding_claims','attendance','placement']::text[],
   '{"anomalies":"object[]","confidence":"number","reviewItems":"string[]"}'::jsonb,
   '{"noAutomaticRejection":true,"financialHumanReview":true}'::jsonb),
 ('capacity-demand','Care capacity and demand forecast','childcare.capacity_demand','forecast',false,
   ARRAY['availability','bookings','placements','search_demand','region']::text[],
   '{"periods":"object[]","capacityGap":"number","recommendations":"string[]"}'::jsonb,
   '{"aggregatedDataPreferred":true}'::jsonb),
 ('parent-engagement','Parent engagement next-best-action','childcare.parent_engagement','recommendation',true,
   ARRAY['crm_activity','bookings','feedback','journey_state','communication_preferences']::text[],
   '{"actions":"object[]","reason":"string","channel":"string"}'::jsonb,
   '{"respectConsent":true,"humanApprovalForSensitiveOutreach":true}'::jsonb),
 ('case-summary','Childcare case/evidence summary','childcare.case_summary','summary',false,
   ARRAY['case_records','documents','crm_activity','compliance_evidence']::text[],
   '{"summary":"string","openQuestions":"string[]","evidenceRefs":"string[]"}'::jsonb,
   '{"noUnsupportedClaims":true,"retainEvidenceRefs":true}'::jsonb)
) AS u(use_case_key,name,job_type,mode,requires_human_approval,allowed_inputs,output_contract,governance)
JOIN public.platform_products p ON p.product_key IN ('kindelo','kindelo-gb','kindelo-de')
ON CONFLICT(product_key,use_case_key) DO UPDATE SET
 name=EXCLUDED.name,job_type=EXCLUDED.job_type,mode=EXCLUDED.mode,
 requires_human_approval=EXCLUDED.requires_human_approval,allowed_inputs=EXCLUDED.allowed_inputs,
 output_contract=EXCLUDED.output_contract,governance=EXCLUDED.governance,status='preview',updated_at=now();

CREATE OR REPLACE FUNCTION public.apply_product_variant_defaults(_tenant uuid,_tenant_product uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
 tp public.tenant_products;
 runtime_count integer:=0;
 check_count integer:=0;
 parent_key text;
BEGIN
 SELECT * INTO tp FROM public.tenant_products
 WHERE id=_tenant_product AND tenant_id=_tenant
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant product not found'; END IF;

 SELECT parent_product_key INTO parent_key
 FROM public.platform_products WHERE product_key=tp.product_key;

 INSERT INTO public.tenant_runtime_config(
   tenant_id,tenant_product_id,location_id,config_key,value,enabled,source,revision
 )
 SELECT _tenant,_tenant_product,NULL,d.config_key,d.value,d.enabled,'product_default',1
 FROM public.platform_product_runtime_defaults d
 WHERE d.product_key IN (tp.product_key,parent_key)
   AND d.enabled
   AND (d.region_key IS NULL OR d.region_key=tp.region_key)
   AND NOT EXISTS(
     SELECT 1 FROM public.tenant_runtime_config c
     WHERE c.tenant_id=_tenant AND c.tenant_product_id=_tenant_product
       AND c.location_id IS NULL AND c.config_key=d.config_key
   );
 GET DIAGNOSTICS runtime_count = ROW_COUNT;

 INSERT INTO public.saas_factory_launch_checks(
   tenant_id,tenant_product_id,check_key,category,required,status,detail,evidence
 )
 SELECT _tenant,_tenant_product,t.check_key,t.category,t.required,'pending',t.description,'{}'::jsonb
 FROM public.platform_product_launch_check_templates t
 WHERE t.product_key IN (tp.product_key,parent_key)
 ON CONFLICT(tenant_product_id,check_key) DO NOTHING;
 GET DIAGNOSTICS check_count = ROW_COUNT;

 -- Configuration applied by this function satisfies localisation automatically.
 UPDATE public.saas_factory_launch_checks c
 SET status='pass',checked_at=now(),
     detail=COALESCE(c.detail,'')||' · product defaults applied',
     evidence=jsonb_build_object('productKey',tp.product_key,'regionKey',tp.region_key)
 WHERE c.tenant_product_id=_tenant_product
   AND c.check_key='localisation.country';

 RETURN jsonb_build_object(
   'productKey',tp.product_key,'regionKey',tp.region_key,
   'runtimeDefaultsInserted',runtime_count,'launchChecksInserted',check_count
 );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.apply_product_variant_defaults(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_product_variant_defaults(uuid,uuid) TO service_role;

-- Keep the parent product defaults complete even if the active blueprint is unavailable.
INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
VALUES ('kindelo','childcare.core',true)
ON CONFLICT(product_key,module_key) DO UPDATE SET enabled_by_default=true;

COMMIT;
