-- KinderStars landlord family: shared childcare marketplace with GB/DE country variants.
BEGIN;

INSERT INTO public.platform_products(
  product_key,name,kind,parent_product_key,industry,status,metadata
) VALUES
  (
    'kinderstars','KinderStars','vertical_landlord',NULL,
    'childcare_agency_marketplace','active',
    '{
      "familyRoot":"kinderstars",
      "tenantType":"childcare_agency_operator",
      "marketplaceVendorType":"childminder_or_provider",
      "marketplaceBuyerType":"parent_or_guardian",
      "providersAreTenantsByDefault":false,
      "parentsAreTenants":false,
      "childrenAreTenants":false
    }'::jsonb
  ),
  (
    'kinderstars-gb','KinderStars UK','product_variant','kinderstars',
    'childcare_agency_marketplace','active',
    '{
      "familyRoot":"kinderstars",
      "country":"GB",
      "currency":"GBP",
      "defaultLocale":"en-GB",
      "regulatoryProfile":"gb-childcare-agency",
      "inheritsLandlordBlueprint":true
    }'::jsonb
  ),
  (
    'kinderstars-de','KinderStars Germany','product_variant','kinderstars',
    'childcare_agency_marketplace','active',
    '{
      "familyRoot":"kinderstars",
      "country":"DE",
      "currency":"EUR",
      "defaultLocale":"de-DE",
      "regulatoryProfile":"de-childcare-configurable",
      "inheritsLandlordBlueprint":true
    }'::jsonb
  )
ON CONFLICT(product_key) DO UPDATE SET
  name=EXCLUDED.name,
  kind=EXCLUDED.kind,
  parent_product_key=EXCLUDED.parent_product_key,
  industry=EXCLUDED.industry,
  status=EXCLUDED.status,
  metadata=public.platform_products.metadata||EXCLUDED.metadata,
  updated_at=now();

-- Parent blueprint contains the reusable childcare/agency/marketplace operating model.
INSERT INTO public.platform_product_blueprints(
  product_key,version,status,industry,region_keys,locale_keys,module_keys,optional_module_keys,
  roles,navigation,domain_objects,workflows,mobile_capabilities,ui_schema,metadata
) VALUES(
  'kinderstars',1,'active','childcare_agency_marketplace',
  ARRAY['GB','DE'],ARRAY['en-GB','de-DE'],
  ARRAY[
    'crm.core','marketplace.core','bookings.core','payments.core','connect.core',
    'compliance.core','documents.core','forms.core','automation.core',
    'notifications.core','search.core','analytics.core','intelligence.core',
    'mobile.core','support.core'
  ],
  ARRAY[
    'reception.core','financials.core','marketing.core','sales.core','journeys.core',
    'feedback.core','loyalty.core','creative.core','geo.core'
  ],
  ARRAY[
    'owner','admin','agency_manager','compliance_manager','placement_coordinator',
    'finance','support','minder_manager','reviewer','viewer'
  ],
  '[
    "dashboard","parents","children","minders","marketplace","bookings","placements",
    "attendance","funding","compliance","documents","messages","reception","payments",
    "marketing","feedback","analytics","financials","settings"
  ]'::jsonb,
  ARRAY[
    'agency','parent','guardian','child','minder','provider_profile','service_listing',
    'availability','placement','booking','attendance','funding_case','funding_claim',
    'safeguarding_case','training_record','qualification','compliance_check',
    'document','invoice','payment','commission','payout','review','dispute'
  ],
  ARRAY[
    'parent_onboarding','child_onboarding','minder_onboarding','identity_and_compliance_checks',
    'matching','placement','booking','attendance','funding_validation','funding_claim',
    'payment_collection','provider_payout','incident','safeguarding','review_request',
    'renewal','inspection_readiness','ongoing_compliance'
  ],
  ARRAY[
    'push','deep_links','camera','photos','documents','qr','chat','voice',
    'gps','offline','biometrics'
  ],
  '{
    "workspace":"childcare_agency",
    "marketplace":{
      "vendorLabel":"Childminder / Provider",
      "buyerLabel":"Parent / Guardian",
      "listingLabel":"Care Service",
      "bookingLabel":"Care Booking"
    }
  }'::jsonb,
  '{
    "familyRoot":"kinderstars",
    "variantStrategy":"country_variant",
    "tenantType":"childcare_agency_operator",
    "providersAreTenantsByDefault":false,
    "parentsAreTenants":false,
    "childrenAreTenants":false
  }'::jsonb
)
ON CONFLICT(product_key,version) DO UPDATE SET
  status=EXCLUDED.status,
  industry=EXCLUDED.industry,
  region_keys=EXCLUDED.region_keys,
  locale_keys=EXCLUDED.locale_keys,
  module_keys=EXCLUDED.module_keys,
  optional_module_keys=EXCLUDED.optional_module_keys,
  roles=EXCLUDED.roles,
  navigation=EXCLUDED.navigation,
  domain_objects=EXCLUDED.domain_objects,
  workflows=EXCLUDED.workflows,
  mobile_capabilities=EXCLUDED.mobile_capabilities,
  ui_schema=EXCLUDED.ui_schema,
  metadata=EXCLUDED.metadata,
  updated_at=now();

-- Country variants narrow region/locale and carry country-specific configuration;
-- modules/add-ons are inherited from the parent landlord.
INSERT INTO public.platform_product_blueprints(
  product_key,version,status,industry,region_keys,locale_keys,module_keys,optional_module_keys,
  roles,navigation,domain_objects,workflows,mobile_capabilities,ui_schema,metadata
) VALUES
(
  'kinderstars-gb',1,'active','childcare_agency_marketplace',
  ARRAY['GB'],ARRAY['en-GB'],ARRAY[]::text[],ARRAY[]::text[],
  ARRAY[]::text[],'[]'::jsonb,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],
  '{
    "terminology":{
      "provider":"Childminder",
      "regulator":"Configured UK childcare authority",
      "currency":"GBP"
    }
  }'::jsonb,
  '{
    "parentProductKey":"kinderstars",
    "inheritModules":true,
    "inheritRoles":true,
    "inheritNavigation":true,
    "country":"GB",
    "regulatoryProfile":"gb-childcare-agency"
  }'::jsonb
),
(
  'kinderstars-de',1,'active','childcare_agency_marketplace',
  ARRAY['DE'],ARRAY['de-DE','en-GB'],ARRAY[]::text[],ARRAY[]::text[],
  ARRAY[]::text[],'[]'::jsonb,ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],
  '{
    "terminology":{
      "provider":"Kindertagespflegeperson / Betreuungsperson",
      "regulator":"Configured local German childcare authority",
      "currency":"EUR"
    }
  }'::jsonb,
  '{
    "parentProductKey":"kinderstars",
    "inheritModules":true,
    "inheritRoles":true,
    "inheritNavigation":true,
    "country":"DE",
    "regulatoryProfile":"de-childcare-configurable"
  }'::jsonb
)
ON CONFLICT(product_key,version) DO UPDATE SET
  status=EXCLUDED.status,
  industry=EXCLUDED.industry,
  region_keys=EXCLUDED.region_keys,
  locale_keys=EXCLUDED.locale_keys,
  module_keys=EXCLUDED.module_keys,
  optional_module_keys=EXCLUDED.optional_module_keys,
  ui_schema=EXCLUDED.ui_schema,
  metadata=EXCLUDED.metadata,
  updated_at=now();

-- Ensure only version 1 is active for this initial family seed.
UPDATE public.platform_product_blueprints
SET status='retired',updated_at=now()
WHERE product_key IN ('kinderstars','kinderstars-gb','kinderstars-de')
  AND version<>1
  AND status='active';

DELETE FROM public.product_module_defaults WHERE product_key='kinderstars';

INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
SELECT 'kinderstars',m,true
FROM unnest(ARRAY[
  'crm.core','marketplace.core','bookings.core','payments.core','connect.core',
  'compliance.core','documents.core','forms.core','automation.core',
  'notifications.core','search.core','analytics.core','intelligence.core',
  'mobile.core','support.core'
]::text[]) m
ON CONFLICT(product_key,module_key) DO UPDATE SET enabled_by_default=true;

INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
SELECT 'kinderstars',m,false
FROM unnest(ARRAY[
  'reception.core','financials.core','marketing.core','sales.core','journeys.core',
  'feedback.core','loyalty.core','creative.core','geo.core'
]::text[]) m
ON CONFLICT(product_key,module_key) DO UPDATE SET enabled_by_default=false;

COMMIT;
