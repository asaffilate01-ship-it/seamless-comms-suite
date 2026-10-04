BEGIN;

-- Dishbee Court Connect external catering package for courts without kitchens.
-- The court-facing experience remains Dishbee branded. Shared delivery/communications/
-- analytics stay in Omniqora; fulfilment can be a MealDeck/Dishbee kitchen.

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,
  status,implementation_status,metadata
) VALUES (
  'dishbee.court-connect',
  'Dishbee Court Connect',
  'Jury lounge/room QR ordering with anonymous juror allowance, secure top-up, owned Dishbee/MealDeck kitchen fulfilment and approved third-party last-mile delivery.',
  'hospitality','dishbee-one',true,'external','active','external_product',
  '{"publicBrand":"Dishbee Court Connect","externalCatering":true,"noJurorNamesRequired":true,"foodSupply":"owned_network","externalFoodMarketplace":false,"deliveryModel":"delivery_broker","thirdPartyLastMile":true}'::jsonb
)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,
  metadata=public.service_catalogue.metadata||EXCLUDED.metadata,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('dishbee.court-connect','dishbee.court-pack',true),
('dishbee.court-connect','dishbee.kds',true),
('dishbee.court-connect','omniqora.payments',true),
('dishbee.court-connect','omniqora.geo',true),
('dishbee.court-connect','omniqora.delivery-broker',true),
('dishbee.court-connect','omniqora.connect',false),
('dishbee.court-connect','omniqora.analytics',false)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('dishbee-one','dishbee.court-connect',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required;

INSERT INTO public.tenant_blueprints(
  blueprint_key,name,description,country_code,category,status,metadata
) VALUES (
  'dishbee-court-connect-uk',
  'Dishbee Court Connect · UK',
  'External jury catering for courts without kitchens, using only owned Dishbee/MealDeck food brands and the shared delivery broker for last-mile transport.',
  'GB','hospitality','active',
  '{"publicBrand":"Dishbee Court Connect","externalCatering":true,"foodSupply":"owned_network","externalFoodMarketplace":false,"deliveryModel":"delivery_broker","thirdPartyLastMile":true}'::jsonb
)
ON CONFLICT(blueprint_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,country_code=EXCLUDED.country_code,
  category=EXCLUDED.category,status=EXCLUDED.status,metadata=EXCLUDED.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config) VALUES
('dishbee-court-connect-uk','dishbee-one',true,'{"vertical":"courts","externalCatering":true}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
('dishbee-court-connect-uk','dishbee.one',true,'{}'::jsonb),
('dishbee-court-connect-uk','dishbee.court-pack',true,'{}'::jsonb),
('dishbee-court-connect-uk','dishbee.court-connect',true,'{}'::jsonb),
('dishbee-court-connect-uk','dishbee.kds',true,'{}'::jsonb),
('dishbee-court-connect-uk','omniqora.payments',true,'{}'::jsonb),
('dishbee-court-connect-uk','omniqora.geo',true,'{}'::jsonb),
('dishbee-court-connect-uk','omniqora.delivery-broker',true,'{}'::jsonb),
('dishbee-court-connect-uk','dishbee.buzz',false,'{}'::jsonb),
('dishbee-court-connect-uk','haccora.compliance',false,'{}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

UPDATE public.vertical_package_catalogue
SET description='Single-till in-court catering plus Court Connect external jury catering for courts without kitchens.',
    capabilities=ARRAY[
      'audience_menus','voucher_allowances','account_tabs','internal_handoff',
      'audit_reporting','jury_room_qr','owned_kitchen_fulfilment','delivery_broker'
    ],
    metadata=metadata||'{"courtConnect":"dishbee.court-connect","foodSupply":"owned_network","externalFoodMarketplace":false,"thirdPartyLastMile":true}'::jsonb,
    updated_at=now()
WHERE package_key='hospitality.court';

COMMIT;
