-- Make TraveNexa the unambiguous *sole travel-domain SaaS landlord*.
-- FlightLounge, BestFares BestRates, MarocWays, Route50 and local-market storefronts
-- are white-label/consumer tenants, never separate travel supplier-API landlords.
-- This registers a tenant blueprint, not a provisioned workspace or operational supplier.
BEGIN;

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product_catalogue
    WHERE product_key='travenexa'
      AND product_role='landlord'
  ) THEN
    RAISE EXCEPTION 'TraveNexa travel landlord must be registered before tenant alignment';
  END IF;
END
$check$;

UPDATE public.product_catalogue
SET metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
      'tenantBrands',jsonb_build_array('FlightLounge','BestFares BestRates','MarocWays','Route50'),
      'canonicalTravelLandlord',true,
      'tenantHierarchy','one travel landlord, many isolated branded tenants',
      'supplierApiAuthority','travenexa',
      'brandsHaveIndependentSupplierCredentials',false
    ),
    updated_at=now()
WHERE product_key='travenexa';

-- Route50 is confirmed to be a travel tenant, but its geographical/product
-- specialty and original domain/repository have not been established.
-- Define a generic reusable brand workspace rather than inventing a specialty.
INSERT INTO public.product_workspace_types
(product_key,workspace_type,name,description,system_workspace,allow_multiple,default_services,metadata)
VALUES
('travenexa','travel_brand','Branded Travel Tenant',
 'Generic white-label travel brand, with its own identity and storefront, sharing only approved TraveNexa supplier connector capabilities.',
 false,true,
 ARRAY['travenexa.core','travenexa.white-label'],
 '{"audience":"travellers-and-partners","parentLandlord":"travenexa","isolatedCustomerData":true,"supplierApis":"central-only","operatorType":"tenant"}'::jsonb)
ON CONFLICT(product_key,workspace_type) DO UPDATE SET
 name=excluded.name,description=excluded.description,
 system_workspace=excluded.system_workspace,
 allow_multiple=excluded.allow_multiple,
 default_services=excluded.default_services,
 metadata=excluded.metadata,
 updated_at=now();

INSERT INTO public.tenant_blueprints
(blueprint_key,name,description,country_code,category,status,metadata)
VALUES
('travenexa-route50','Route50',
 'Route50 is a branded travel tenant of TraveNexa, sharing approved supplier APIs and tenant-scoped travel functionality.',
 NULL,'travel','active',
 '{"productKey":"travenexa","landlordProductKey":"travenexa","workspaceType":"travel_brand","brandName":"Route50","tenantKind":"brand","sourceOfTruth":"travenexa","brandScope":"to-be-configured","domainStatus":"unverified","providerAccess":"approval-required","launchState":"awaiting-external-workspace","supplierApiAuthority":"travenexa"}'::jsonb)
ON CONFLICT(blueprint_key) DO UPDATE SET
 name=excluded.name,description=excluded.description,
 country_code=excluded.country_code,category=excluded.category,
 status=excluded.status,metadata=COALESCE(public.tenant_blueprints.metadata,'{}'::jsonb) || excluded.metadata;

INSERT INTO public.blueprint_products
(blueprint_key,product_key,required,config)
VALUES
('travenexa-route50','travenexa',true,
 '{"workspaceType":"travel_brand","brandName":"Route50","landlordProductKey":"travenexa","supplierApiAuthority":"travenexa","brandScope":"to-be-configured"}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET
 required=true,config=COALESCE(public.blueprint_products.config,'{}'::jsonb) || excluded.config;

INSERT INTO public.blueprint_services
(blueprint_key,service_key,required,config)
VALUES
('travenexa-route50','travenexa.core',true,'{}'::jsonb),
('travenexa-route50','travenexa.white-label',true,'{}'::jsonb),
('travenexa-route50','travenexa.flight-search',false,'{}'::jsonb),
('travenexa-route50','travenexa.flight-redirects',false,'{}'::jsonb),
('travenexa-route50','travenexa.hotel-search',false,'{}'::jsonb),
('travenexa-route50','travenexa.car-hire',false,'{}'::jsonb),
('travenexa-route50','travenexa.activities',false,'{}'::jsonb),
('travenexa-route50','travenexa.transfers',false,'{}'::jsonb),
('travenexa-route50','travenexa.rail-coach',false,'{}'::jsonb),
('travenexa-route50','travenexa.ai-concierge',false,'{}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET
 required=excluded.required,config=excluded.config;

-- Existing consumer-brand, white-label and inbound-country templates also
-- explicitly inherit the TraveNexa travel landlord. 'travenexa-platform'
-- remains the one operator/landlord template.
UPDATE public.tenant_blueprints
SET metadata=COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
  'landlordProductKey','travenexa',
  'tenantKind',CASE
    WHEN blueprint_key='travenexa-white-label' THEN 'partner-agency'
    WHEN blueprint_key LIKE 'travenexa.uk-inbound.%' THEN 'local-market-site'
    ELSE 'brand'
  END,
  'supplierApiAuthority','travenexa'
)
WHERE blueprint_key IN (
    'travenexa-flightlounge','travenexa-bestfares','travenexa-marocways',
    'travenexa-route50','travenexa-white-label'
  )
  OR blueprint_key LIKE 'travenexa.uk-inbound.%';

UPDATE public.blueprint_products
SET config=COALESCE(config,'{}'::jsonb) ||
    '{"landlordProductKey":"travenexa","supplierApiAuthority":"travenexa","isIndependentLandlord":false}'::jsonb
WHERE product_key='travenexa'
  AND blueprint_key<>'travenexa-platform'
  AND (
    blueprint_key LIKE 'travenexa-%'
    OR blueprint_key LIKE 'travenexa.uk-inbound.%'
  );

COMMIT;
