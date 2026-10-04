-- Register Nafsi as an external vertical product in the Omniqora SaaS Factory.
-- Nafsi remains authoritative for wellbeing, journal, plan and Islamic-content data.
BEGIN;

INSERT INTO public.product_catalogue(
  product_key,name,description,category,deployment_mode,status,
  product_role,parent_product_key,implementation_status,metadata
) VALUES (
  'nafsi',
  'Nafsi',
  'Islamic wellbeing, guided plans, verified dua and human-reviewed recitation.',
  'wellbeing',
  'external',
  'active',
  'landlord',
  NULL,
  'external_product',
  jsonb_build_object(
    'operatingModel','vertical_product',
    'dataAuthority','nafsi',
    'initialExternalTenantId','nafsi-gb',
    'privacyClass','special_category_and_religious_context',
    'aiPolicy',jsonb_build_object(
      'mode','reviewed_retrieval_and_low_risk_drafting',
      'prohibitFabricatedCitations',true,
      'prohibitFabricatedArabic',true,
      'prohibitFatwaOrMedicalClaims',true,
      'requireVerifiedEvidence',true,
      'requireHumanRecitation',true,
      'excludeSensitiveTextFromEvents',true
    )
  )
)
ON CONFLICT(product_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  category=EXCLUDED.category,
  deployment_mode=EXCLUDED.deployment_mode,
  status=EXCLUDED.status,
  product_role=EXCLUDED.product_role,
  parent_product_key=EXCLUDED.parent_product_key,
  implementation_status=EXCLUDED.implementation_status,
  metadata=public.product_catalogue.metadata || EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,
  provisioning_mode,status,implementation_status,metadata
) VALUES (
  'nafsi.core',
  'Nafsi Core',
  'Nafsi-owned wellbeing, plan, dua, recitation and content-review capabilities.',
  'wellbeing',
  'nafsi',
  true,
  'external',
  'active',
  'external_product',
  jsonb_build_object(
    'authority','nafsi',
    'containsRegulatedAdvice',false,
    'requiresContentReview',true,
    'requiresRightsClearedAudio',true
  )
)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,
  billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,
  status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,
  metadata=public.service_catalogue.metadata || EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata) VALUES
  ('nafsi','nafsi.core',true,true,'{"authority":"nafsi"}'::jsonb),
  ('nafsi','omniqora.ai',true,true,'{"mode":"shadow_then_cutover","safetyProfile":"nafsi-islamic-wellbeing-v1"}'::jsonb),
  ('nafsi','omniqora.analytics',true,false,'{"dataClass":"aggregate_and_operational_only"}'::jsonb),
  ('nafsi','omniqora.connect',false,false,'{"allowedChannels":["whatsapp","email"],"requiresConsent":true}'::jsonb),
  ('nafsi','omniqora.journeys',false,false,'{"requiresConsent":true}'::jsonb),
  ('nafsi','omniqora.payments',false,false,'{"authority":"omniqora"}'::jsonb)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,
  required=EXCLUDED.required,
  metadata=EXCLUDED.metadata;

INSERT INTO public.tenant_blueprints(
  blueprint_key,name,description,country_code,category,metadata
) VALUES (
  'nafsi-gb-consumer',
  'Nafsi Consumer · UK',
  'UK Nafsi consumer workspace with governed AI and aggregate operational analytics.',
  'GB',
  'wellbeing',
  jsonb_build_object(
    'externalTenantId','nafsi-gb',
    'requiresProductConnection',true,
    'rolloutMode','shadow_then_cutover'
  )
)
ON CONFLICT(blueprint_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  country_code=EXCLUDED.country_code,
  category=EXCLUDED.category,
  status='active',
  metadata=public.tenant_blueprints.metadata || EXCLUDED.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config) VALUES
  ('nafsi-gb-consumer','nafsi',true,'{"externalTenantId":"nafsi-gb","connectionRequired":true}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
  ('nafsi-gb-consumer','nafsi.core',true,'{"authority":"nafsi"}'::jsonb),
  ('nafsi-gb-consumer','omniqora.ai',true,'{"mode":"shadow","safetyProfile":"nafsi-islamic-wellbeing-v1"}'::jsonb),
  ('nafsi-gb-consumer','omniqora.analytics',false,'{"dataClass":"aggregate_and_operational_only"}'::jsonb),
  ('nafsi-gb-consumer','omniqora.connect',false,'{"requiresConsent":true}'::jsonb),
  ('nafsi-gb-consumer','omniqora.journeys',false,'{"requiresConsent":true}'::jsonb),
  ('nafsi-gb-consumer','omniqora.payments',false,'{}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

COMMIT;
