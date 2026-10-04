BEGIN;

-- Extend the Dishbee product family with hotels and institutional/court catering.
-- Customer-facing products remain Dishbee branded; reusable intelligence,
-- marketplace, communications, delivery and integration capability stays in Omniqora.

INSERT INTO public.product_catalogue(
  product_key,name,description,category,deployment_mode,status,metadata,
  product_role,parent_product_key,implementation_status
) VALUES (
  'dishbee-stay',
  'Dishbee Stay',
  'Hotel guest QR ordering, room service, restaurant and guest-service experience.',
  'hospitality',
  'external',
  'active',
  '{"brandFamily":"Dishbee","publicName":"Dishbee Stay","sourceRepository":"asaffilate01-ship-it/dishbee-helper","masterBrandProductKey":"dishbee"}'::jsonb,
  'experience',
  'dishbee',
  'external_product'
)
ON CONFLICT(product_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,
  deployment_mode=EXCLUDED.deployment_mode,status=EXCLUDED.status,
  metadata=public.product_catalogue.metadata||EXCLUDED.metadata,
  product_role=EXCLUDED.product_role,parent_product_key=EXCLUDED.parent_product_key,
  implementation_status=EXCLUDED.implementation_status,updated_at=now();

UPDATE public.product_catalogue
SET metadata=metadata||'{"family":["dishbee-one","dishbee-hive","dishbee-plus","dishbee-buzz","dishbee-stay"]}'::jsonb,
    updated_at=now()
WHERE product_key='dishbee';

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,
  status,implementation_status,metadata
) VALUES
('dishbee.stay.connect','Dishbee Stay Connect',
 'Free room-QR guest portal for hotels without their own food operation; routes external commerce to MealDeck/Dishbee+.',
 'hospitality','dishbee-stay',false,'external','active','external_product',
 '{"publicBrand":"Dishbee Stay","tier":"connect","monthlyAmountMinor":0,"externalOrdersPayNow":true,"hotelFoodFacility":false}'::jsonb),
('dishbee.stay','Dishbee Stay',
 'Hotel-owned room service, restaurant, room QR ordering and guest-service platform.',
 'hospitality','dishbee-stay',true,'external','active','external_product',
 '{"publicBrand":"Dishbee Stay","tier":"standard","monthlyAmountMinor":24900,"currency":"GBP","billingBasis":"per_property","externalOrdersPayNow":true}'::jsonb),
('dishbee.court-pack','Dishbee Court Pack',
 'Institutional court catering: juror menus and allowance evidence, judges/chambers tabs and secure handoff contexts.',
 'hospitality','dishbee-one',true,'external','active','external_product',
 '{"publicBrand":"Dishbee","vertical":"courts","locationScoped":true,"singleTillCompatible":true}'::jsonb)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,
  metadata=public.service_catalogue.metadata||EXCLUDED.metadata,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('dishbee.stay.connect','omniqora.identity',false),
('dishbee.stay.connect','omniqora.marketplace',true),
('dishbee.stay.connect','omniqora.geo',true),
('dishbee.stay.connect','omniqora.delivery-broker',false),
('dishbee.stay.connect','omniqora.connect',false),
('dishbee.stay','dishbee.one',true),
('dishbee.stay','omniqora.payments',true),
('dishbee.stay','omniqora.connect',false),
('dishbee.stay','omniqora.crm',false),
('dishbee.stay','omniqora.integration-hub',false),
('dishbee.stay','dishbee.buzz',false),
('dishbee.court-pack','dishbee.one',true),
('dishbee.court-pack','omniqora.payments',true),
('dishbee.court-pack','omniqora.documents',false),
('dishbee.court-pack','omniqora.analytics',false)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('dishbee-stay','dishbee.stay.connect',true,false),
('dishbee-stay','dishbee.stay',false,false),
('dishbee-stay','omniqora.marketplace',true,true),
('dishbee-stay','omniqora.geo',true,true),
('dishbee-stay','omniqora.delivery-broker',true,false),
('dishbee-stay','omniqora.connect',true,false),
('dishbee-stay','omniqora.crm',true,false),
('dishbee-stay','dishbee.buzz',false,false),
('dishbee-one','dishbee.court-pack',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
 default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required;

INSERT INTO public.tenant_blueprints(
  blueprint_key,name,description,country_code,category,status,metadata
) VALUES
('dishbee-stay-connect-uk','Dishbee Stay Connect · UK',
 'Free hotel guest QR portal for properties without their own food facility.',
 'GB','hospitality','active','{"publicBrand":"Dishbee Stay","tier":"connect","monthlyAmountMinor":0}'::jsonb),
('dishbee-stay-uk','Dishbee Stay · UK',
 'Hotel-owned room service/restaurant ordering plus external MealDeck/Dishbee+ access.',
 'GB','hospitality','active','{"publicBrand":"Dishbee Stay","tier":"standard","monthlyAmountMinor":24900}'::jsonb),
('dishbee-court-uk','Dishbee Court Pack · UK',
 'Dishbee One institutional court catering with juror allowance and judges/chambers account workflows.',
 'GB','hospitality','active','{"publicBrand":"Dishbee","vertical":"courts","locationScoped":true}'::jsonb)
ON CONFLICT(blueprint_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,country_code=EXCLUDED.country_code,
 category=EXCLUDED.category,status=EXCLUDED.status,metadata=EXCLUDED.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config) VALUES
('dishbee-stay-connect-uk','dishbee-stay',true,'{"tier":"connect"}'::jsonb),
('dishbee-stay-uk','dishbee-stay',true,'{"tier":"standard"}'::jsonb),
('dishbee-court-uk','dishbee-one',true,'{"vertical":"courts"}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
('dishbee-stay-connect-uk','dishbee.stay.connect',true,'{}'::jsonb),
('dishbee-stay-connect-uk','omniqora.marketplace',true,'{}'::jsonb),
('dishbee-stay-connect-uk','omniqora.geo',true,'{}'::jsonb),
('dishbee-stay-connect-uk','omniqora.delivery-broker',false,'{}'::jsonb),
('dishbee-stay-uk','dishbee.stay',true,'{}'::jsonb),
('dishbee-stay-uk','dishbee.one',true,'{}'::jsonb),
('dishbee-stay-uk','omniqora.payments',true,'{}'::jsonb),
('dishbee-stay-uk','omniqora.connect',false,'{}'::jsonb),
('dishbee-stay-uk','dishbee.buzz',false,'{}'::jsonb),
('dishbee-court-uk','dishbee.one',true,'{}'::jsonb),
('dishbee-court-uk','dishbee.court-pack',true,'{}'::jsonb),
('dishbee-court-uk','omniqora.payments',true,'{}'::jsonb),
('dishbee-court-uk','dishbee.buzz',false,'{}'::jsonb),
('dishbee-court-uk','haccora.compliance',false,'{}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.product_offer_catalogue(
  offer_key,product_key,service_key,name,status,billing_basis,monthly_amount_minor,
  currency,commission_bps,delivery_charge_model,hardware_model,metadata
) VALUES
('dishbee-stay.connect','dishbee-stay','dishbee.stay.connect','Dishbee Stay Connect','active','per_location',0,'GBP',0,'customer_pass_through','not_applicable',
 '{"hotelFoodFacility":false,"hotelSubscriptionFree":true,"externalMealDeckOrDishbeePlus":true}'::jsonb),
('dishbee-stay.standard','dishbee-stay','dishbee.stay','Dishbee Stay','active','per_location',24900,'GBP',0,'customer_pass_through','not_applicable',
 '{"hotelFoodFacility":true,"roomService":true,"restaurantOrdering":true,"roomChargeHotelOwnedOnly":true}'::jsonb)
ON CONFLICT(offer_key) DO UPDATE SET
 product_key=EXCLUDED.product_key,service_key=EXCLUDED.service_key,name=EXCLUDED.name,
 status=EXCLUDED.status,billing_basis=EXCLUDED.billing_basis,
 monthly_amount_minor=EXCLUDED.monthly_amount_minor,currency=EXCLUDED.currency,
 commission_bps=EXCLUDED.commission_bps,delivery_charge_model=EXCLUDED.delivery_charge_model,
 hardware_model=EXCLUDED.hardware_model,metadata=EXCLUDED.metadata,updated_at=now();

-- PMS providers are integration targets only. "evaluate" explicitly does not
-- represent a live commercial/API partnership.
INSERT INTO public.integration_provider_catalogue(
  provider_key,display_name,provider_family,integration_mode,status,countries,capabilities,metadata
) VALUES
('opera_cloud','Oracle OPERA Cloud','other','api','evaluate','{}',ARRAY['hotel_reservations','rooms','guest_folio','folio_posting'],
 '{"vertical":"hospitality","providerType":"pms","approvalRequired":true}'::jsonb),
('mews','Mews','other','api','evaluate','{}',ARRAY['hotel_reservations','rooms','guest_folio','folio_posting'],
 '{"vertical":"hospitality","providerType":"pms","approvalRequired":true}'::jsonb),
('cloudbeds','Cloudbeds','other','api','evaluate','{}',ARRAY['hotel_reservations','rooms','guest_folio','folio_posting'],
 '{"vertical":"hospitality","providerType":"pms","approvalRequired":true}'::jsonb),
('guestline','Guestline','other','api','evaluate','{}',ARRAY['hotel_reservations','rooms','guest_folio','folio_posting'],
 '{"vertical":"hospitality","providerType":"pms","approvalRequired":true}'::jsonb)
ON CONFLICT(provider_key) DO UPDATE SET
 display_name=EXCLUDED.display_name,provider_family=EXCLUDED.provider_family,
 integration_mode=EXCLUDED.integration_mode,countries=EXCLUDED.countries,
 capabilities=EXCLUDED.capabilities,
 metadata=public.integration_provider_catalogue.metadata||EXCLUDED.metadata,updated_at=now();

COMMIT;
