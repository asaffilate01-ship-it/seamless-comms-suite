BEGIN;

-- Dishbee product-family packaging.
-- Internal service ownership remains with Omniqora/Dishbee/Haccora while customers
-- see Dishbee One, Dishbee Hive, Dishbee+, Dishbee Buzz and Haccora.

INSERT INTO public.product_catalogue(
  product_key,name,description,category,deployment_mode,status,metadata,
  product_role,parent_product_key,implementation_status
) VALUES (
  'dishbee-one',
  'Dishbee One',
  'All-in-one restaurant operating system built on the Dishbee runtime.',
  'hospitality',
  'external',
  'active',
  '{"brandFamily":"Dishbee","publicName":"Dishbee One","sourceRepository":"asaffilate01-ship-it/dishbee-helper","masterBrandProductKey":"dishbee"}'::jsonb,
  'experience',
  'dishbee',
  'external_product'
)
ON CONFLICT(product_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  category=EXCLUDED.category,
  deployment_mode=EXCLUDED.deployment_mode,
  status=EXCLUDED.status,
  metadata=public.product_catalogue.metadata||EXCLUDED.metadata,
  product_role=EXCLUDED.product_role,
  parent_product_key=EXCLUDED.parent_product_key,
  implementation_status=EXCLUDED.implementation_status,
  updated_at=now();

UPDATE public.product_catalogue
SET metadata=metadata||'{"masterBrand":true,"publicName":"Dishbee","family":["dishbee-one","dishbee-hive","dishbee-plus","dishbee-buzz"]}'::jsonb,
    updated_at=now()
WHERE product_key='dishbee';

UPDATE public.product_catalogue
SET parent_product_key='dishbee',
    product_role='experience',
    metadata=metadata||'{"brandFamily":"Dishbee","publicName":"Dishbee+"}'::jsonb,
    updated_at=now()
WHERE product_key='dishbee-plus';

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status,metadata
) VALUES
('dishbee.one','Dishbee One','Customer-facing package for Dishbee restaurant operations.','hospitality','dishbee-one',true,'external','active','external_product',
 '{"publicBrand":"Dishbee One","includesCoreRestaurantRuntime":true}'::jsonb),
('dishbee.hive-kiosk','Dishbee Hive Kiosk','Venue-wide self-service kiosk ordering across every enabled Hive kitchen and brand.','hospitality','dishbee',true,'external','active','external_product',
 '{"publicBrand":"Dishbee Hive","hardwareOwner":"venue","hardwareIncluded":false,"fulfilment":["pickup"],"multiKitchenBasket":true}'::jsonb),
('dishbee-plus.subscription','Dishbee+ Basic','Dishbee+ marketplace subscription with zero Dishbee marketplace commission.','marketplace','dishbee-plus',true,'automatic','active','built_main',
 '{"monthlyAmountMinor":9900,"currency":"GBP","billingBasis":"per_location","commissionBps":0,"deliveryChargeModel":"customer_pass_through","buzzIncluded":false}'::jsonb),
('dishbee.buzz','Dishbee Buzz Essentials','Dishbee-branded AI and intelligence powered by shared Omniqora services.','ai','dishbee',true,'automatic','active','built_main',
 '{"publicBrand":"Dishbee Buzz","omniqoraHiddenFromVerticalCustomer":true}'::jsonb),
('dishbee.buzz.growth','Dishbee Buzz Growth','CRM intelligence, segmentation, journeys, campaigns, reviews and growth automation.','ai','dishbee',true,'automatic','active','built_main',
 '{"publicBrand":"Dishbee Buzz","tier":"growth"}'::jsonb),
('dishbee.buzz.pro','Dishbee Buzz Pro','Advanced profitability, forecasting, marketplace, stock and delivery intelligence.','ai','dishbee',true,'automatic','active','built_main',
 '{"publicBrand":"Dishbee Buzz","tier":"pro"}'::jsonb),
('dishbee.buzz.voice','Dishbee Buzz Voice','AI receptionist, voice ordering and communications automation.','ai','dishbee',true,'external','active','external_product',
 '{"publicBrand":"Dishbee Buzz","tier":"voice","usageChargesMayApply":true}'::jsonb),
('haccora.compliance','Haccora Compliance','Food-safety, HACCP/SFBB-style controls, evidence, corrective actions and inspection readiness.','compliance','haccora',true,'external','active','external_product',
 '{"publicBrand":"Haccora","dishbeeAddon":true,"regulatoryPositioning":"management_and_evidence_not_regulator_approval"}'::jsonb)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,
  billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,
  status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,
  metadata=public.service_catalogue.metadata||EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('dishbee.one','dishbee.kds',true),
('dishbee.one','omniqora.payments',true),
('dishbee.hive-kiosk','dishbee.hive',true),
('dishbee.hive-kiosk','omniqora.payments',true),
('dishbee-plus.subscription','omniqora.marketplace',true),
('dishbee-plus.subscription','omniqora.integration-hub',true),
('dishbee-plus.subscription','omniqora.order-orchestration',true),
('dishbee-plus.subscription','omniqora.delivery-broker',false),
('dishbee.buzz','omniqora.ai',true),
('dishbee.buzz','omniqora.analytics',true),
('dishbee.buzz.growth','dishbee.buzz',true),
('dishbee.buzz.growth','omniqora.crm',true),
('dishbee.buzz.growth','omniqora.rfm',true),
('dishbee.buzz.growth','omniqora.journeys',true),
('dishbee.buzz.growth','omniqora.campaigns',true),
('dishbee.buzz.growth','omniqora.feedback',true),
('dishbee.buzz.pro','dishbee.buzz.growth',true),
('dishbee.buzz.pro','omniqora.profitability',true),
('dishbee.buzz.pro','omniqora.marketplace',true),
('dishbee.buzz.pro','omniqora.delivery-broker',true),
('dishbee.buzz.pro','omniqora.inventory',true),
('dishbee.buzz.voice','dishbee.buzz',true),
('dishbee.buzz.voice','omniqora.voice',true),
('dishbee.buzz.voice','omniqora.connect',true),
('haccora.compliance','omniqora.documents',false),
('haccora.compliance','omniqora.forms',false),
('haccora.compliance','omniqora.notifications',false)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('dishbee-one','dishbee.one',true,true),
('dishbee-one','dishbee.kds',true,true),
('dishbee-one','dishbee.epos',true,false),
('dishbee-one','omniqora.payments',true,true),
('dishbee-one','dishbee.delivery',true,false),
('dishbee-one','dishbee.assisted-ordering',false,false),
('dishbee-one','dishbee.groups',false,false),
('dishbee-one','dishbee.buzz',false,false),
('dishbee-one','dishbee.buzz.growth',false,false),
('dishbee-one','dishbee.buzz.pro',false,false),
('dishbee-one','dishbee.buzz.voice',false,false),
('dishbee-one','haccora.compliance',false,false),
('dishbee-plus','dishbee-plus.subscription',true,true),
('dishbee-plus','dishbee.buzz',false,false),
('dishbee-plus','dishbee.buzz.growth',false,false),
('dishbee-plus','dishbee.buzz.pro',false,false),
('mealdeck','dishbee.buzz',false,false),
('mealdeck','dishbee.buzz.growth',false,false),
('mealdeck','dishbee.buzz.pro',false,false),
('mealdeck','haccora.compliance',false,false),
('mealdeck','dishbee.hive-kiosk',false,false),
('dishbee','dishbee.hive-kiosk',false,false),
('dishbee','dishbee.buzz',false,false),
('dishbee','dishbee.buzz.growth',false,false),
('dishbee','dishbee.buzz.pro',false,false),
('dishbee','dishbee.buzz.voice',false,false),
('dishbee','haccora.compliance',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,
  required=EXCLUDED.required;

INSERT INTO public.tenant_blueprints(
  blueprint_key,name,description,country_code,category,status,metadata
) VALUES
('dishbee-one-uk','Dishbee One · UK','Dishbee One restaurant operating system with optional Buzz, delivery and Haccora add-ons.','GB','hospitality','active',
 '{"publicBrand":"Dishbee One","masterBrand":"Dishbee"}'::jsonb),
('dishbee-hive-uk','Dishbee Hive · UK','Dark-kitchen/food-hall workspace with independent vendors, central pass and optional venue kiosks.','GB','hospitality','active',
 '{"publicBrand":"Dishbee Hive","hardwarePolicy":{"kiosk":"venue_owned"}}'::jsonb)
ON CONFLICT(blueprint_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,country_code=EXCLUDED.country_code,
  category=EXCLUDED.category,status=EXCLUDED.status,metadata=EXCLUDED.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config) VALUES
('dishbee-one-uk','dishbee-one',true,'{"publicBrand":"Dishbee One"}'::jsonb),
('dishbee-hive-uk','dishbee',true,'{"publicBrand":"Dishbee Hive"}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config) VALUES
('dishbee-one-uk','dishbee.one',true,'{}'::jsonb),
('dishbee-one-uk','dishbee.kds',true,'{}'::jsonb),
('dishbee-one-uk','omniqora.payments',true,'{}'::jsonb),
('dishbee-one-uk','dishbee.epos',false,'{}'::jsonb),
('dishbee-one-uk','dishbee.delivery',false,'{}'::jsonb),
('dishbee-one-uk','dishbee.buzz',false,'{}'::jsonb),
('dishbee-one-uk','haccora.compliance',false,'{}'::jsonb),
('dishbee-hive-uk','dishbee.hive',true,'{}'::jsonb),
('dishbee-hive-uk','dishbee.kds',true,'{}'::jsonb),
('dishbee-hive-uk','omniqora.payments',true,'{}'::jsonb),
('dishbee-hive-uk','dishbee.delivery',false,'{}'::jsonb),
('dishbee-hive-uk','dishbee.hive-kiosk',false,'{"hardwareOwner":"venue"}'::jsonb),
('dishbee-hive-uk','dishbee.buzz',false,'{}'::jsonb),
('dishbee-hive-uk','haccora.compliance',false,'{}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

-- Central commercial offer registry. Only the explicit Dishbee+ decision is activated.
-- Other rows are packaging anchors and remain draft until the operator confirms billing.
CREATE TABLE IF NOT EXISTS public.product_offer_catalogue(
  offer_key text PRIMARY KEY CHECK(offer_key ~ '^[a-z0-9][a-z0-9.-]{2,120}$'),
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  service_key text REFERENCES public.service_catalogue(service_key) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','retired')),
  billing_basis text NOT NULL CHECK(billing_basis IN('per_location','per_venue','per_kitchen','flat','usage','custom')),
  monthly_amount_minor bigint CHECK(monthly_amount_minor IS NULL OR monthly_amount_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 10000),
  included_units integer CHECK(included_units IS NULL OR included_units>=0),
  overage_amount_minor bigint CHECK(overage_amount_minor IS NULL OR overage_amount_minor>=0),
  delivery_charge_model text CHECK(delivery_charge_model IS NULL OR delivery_charge_model IN('customer_pass_through','merchant_subsidised','fixed_customer','not_applicable')),
  hardware_model text CHECK(hardware_model IS NULL OR hardware_model IN('venue_owned','merchant_owned','platform_supplied','not_applicable')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_offer_catalogue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.product_offer_catalogue TO authenticated;
GRANT ALL ON public.product_offer_catalogue TO service_role;
DROP POLICY IF EXISTS "product offer read" ON public.product_offer_catalogue;
CREATE POLICY "product offer read" ON public.product_offer_catalogue
  FOR SELECT TO authenticated USING(status<>'retired');
DROP POLICY IF EXISTS "product offer admin" ON public.product_offer_catalogue;
CREATE POLICY "product offer admin" ON public.product_offer_catalogue
  FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()));

INSERT INTO public.product_offer_catalogue(
  offer_key,product_key,service_key,name,status,billing_basis,monthly_amount_minor,currency,
  commission_bps,delivery_charge_model,hardware_model,metadata
) VALUES
('dishbee-plus.basic','dishbee-plus','dishbee-plus.subscription','Dishbee+ Basic','active','per_location',9900,'GBP',0,'customer_pass_through','not_applicable',
 '{"buzzIncluded":false,"unlimitedMarketplaceOrders":true,"physicalLocationNotBrandBilling":true,"paymentProcessingSeparate":true,"thirdPartyDeliverySeparate":true}'::jsonb),
('dishbee-hive.kiosk','dishbee','dishbee.hive-kiosk','Dishbee Hive Kiosk','active','per_venue',NULL,'GBP',0,'not_applicable','venue_owned',
 '{"hardwareIncluded":false,"softwarePricing":"configured_with_hive_plan","pickupOnlyByDefault":true}'::jsonb)
ON CONFLICT(offer_key) DO UPDATE SET
  product_key=EXCLUDED.product_key,
  service_key=EXCLUDED.service_key,
  name=EXCLUDED.name,
  status=EXCLUDED.status,
  billing_basis=EXCLUDED.billing_basis,
  monthly_amount_minor=EXCLUDED.monthly_amount_minor,
  currency=EXCLUDED.currency,
  commission_bps=EXCLUDED.commission_bps,
  delivery_charge_model=EXCLUDED.delivery_charge_model,
  hardware_model=EXCLUDED.hardware_model,
  metadata=EXCLUDED.metadata,
  updated_at=now();

COMMIT;
