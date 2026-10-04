BEGIN;

-- Dishbee+ is the consumer marketplace vertical. Its current frontend/runtime source
-- remains independently deployable while Omniqora owns shared marketplace, identity,
-- integration, engagement, geo, dispatch, analytics and governance capabilities.
INSERT INTO public.product_catalogue(
  product_key,name,description,category,deployment_mode,status,metadata
) VALUES (
  'dishbee-plus',
  'Dishbee+',
  'Multi-category local marketplace for food, grocery, pharmacy, convenience and additional merchant verticals.',
  'marketplace',
  'hybrid',
  'active',
  jsonb_build_object(
    'sourceRepository','asaffilate01-ship-it/onyn',
    'previousProductName','Onyn / OnynGo',
    'brandFamily','Dishbee',
    'consumerMarketplace',true,
    'categories',jsonb_build_array('food','grocery','pharmacy','convenience','retail','more'),
    'restaurantRuntime','dishbee',
    'controlPlane','omniqora'
  )
)
ON CONFLICT(product_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  category=EXCLUDED.category,
  deployment_mode=EXCLUDED.deployment_mode,
  status=EXCLUDED.status,
  metadata=public.product_catalogue.metadata||EXCLUDED.metadata,
  updated_at=now();

-- Reusable integration/commerce services. These deliberately sit in Omniqora so
-- Dishbee+, Dishbee, Hive and future verticals can share them.
INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,metadata
) VALUES
('omniqora.integration-hub','Integration Hub','Provider connectors, middleware routes, mapping, credentials, retries, health, certification and reconciliation.','integrations','omniqora',true,'automatic','active','{"directFirst":true}'::jsonb),
('omniqora.catalogue-syndication','Catalogue Syndication','Canonical catalogue, channel-specific pricing/availability, validation, publish, rollback and item mapping.','commerce','omniqora',true,'automatic','active','{}'::jsonb),
('omniqora.vendor-operations','Vendor Operations','Merchant/vendor onboarding, locations, trading state, commissions, payout configuration and operational controls.','marketplace','omniqora',true,'automatic','active','{}'::jsonb),
('omniqora.order-orchestration','Order Orchestration','Normalised order intake, idempotency, lifecycle, exceptions, routing and cross-product handoff.','commerce','omniqora',true,'automatic','active','{}'::jsonb),
('omniqora.profitability','Channel Profitability','Contribution margin, commissions, delivery cost, promotion cost and channel profitability analytics.','analytics','omniqora',true,'automatic','active','{}'::jsonb),
('omniqora.security-assurance','Security & Assurance','Audit evidence, provider certification, control checks, incident evidence and integration assurance.','compliance','omniqora',true,'automatic','active','{"qittGap":"security-audit-compliance"}'::jsonb),
('omniqora.data-governance','Data & Governance','Data contracts, lineage, retention, quality, export and governed analytics interfaces.','analytics','omniqora',true,'automatic','active','{"qittGap":"bi-data-governance"}'::jsonb),
('omniqora.enterprise-integration','Enterprise Integration','API and middleware catalogue for ERP, identity, ITSM, data and enterprise systems.','integrations','omniqora',true,'automatic','active','{"qittGap":"enterprise-systems-api-middleware"}'::jsonb),
('omniqora.ops-assurance','Operational Assurance','Operational health, jobs, release evidence, canaries, SLA alerts and service recovery.','operations','omniqora',true,'automatic','active','{"qittGap":"itsm-operations"}'::jsonb)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,
  description=EXCLUDED.description,
  family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,
  billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,
  status=EXCLUDED.status,
  metadata=public.service_catalogue.metadata||EXCLUDED.metadata,
  updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('omniqora.integration-hub','omniqora.identity',true),
('omniqora.catalogue-syndication','omniqora.marketplace',true),
('omniqora.vendor-operations','omniqora.marketplace',true),
('omniqora.order-orchestration','omniqora.marketplace',true),
('omniqora.order-orchestration','omniqora.payments',true),
('omniqora.profitability','omniqora.analytics',true),
('omniqora.profitability','omniqora.marketplace',true),
('omniqora.security-assurance','omniqora.integration-hub',true),
('omniqora.data-governance','omniqora.analytics',true),
('omniqora.enterprise-integration','omniqora.integration-hub',true),
('omniqora.ops-assurance','omniqora.integration-hub',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

-- Dishbee+ defaults. Restaurant-specific Dishbee services are optional because
-- non-food vendors use the generic Omniqora marketplace runtime.
INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('dishbee-plus','omniqora.identity',true,true),
('dishbee-plus','omniqora.marketplace',true,true),
('dishbee-plus','omniqora.integration-hub',true,true),
('dishbee-plus','omniqora.catalogue-syndication',true,true),
('dishbee-plus','omniqora.vendor-operations',true,true),
('dishbee-plus','omniqora.order-orchestration',true,true),
('dishbee-plus','omniqora.payments',true,true),
('dishbee-plus','omniqora.geo',true,true),
('dishbee-plus','omniqora.dispatch',true,false),
('dishbee-plus','omniqora.tracking',true,false),
('dishbee-plus','omniqora.inventory',true,false),
('dishbee-plus','omniqora.crm',true,false),
('dishbee-plus','omniqora.connect',true,false),
('dishbee-plus','omniqora.journeys',true,false),
('dishbee-plus','omniqora.rfm',true,false),
('dishbee-plus','omniqora.feedback',true,false),
('dishbee-plus','omniqora.analytics',true,false),
('dishbee-plus','omniqora.profitability',true,false),
('dishbee-plus','zoryn.rewards',true,false),
('dishbee-plus','omniqora.security-assurance',true,false),
('dishbee-plus','omniqora.data-governance',true,false),
('dishbee-plus','omniqora.ops-assurance',true,false),
('dishbee-plus','dishbee.kds',false,false),
('dishbee-plus','dishbee.delivery',false,false),
('dishbee-plus','dishbee.hive',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,
  required=EXCLUDED.required;

INSERT INTO public.tenant_blueprints(
  blueprint_key,name,description,country_code,category,status,metadata
) VALUES (
  'dishbee-plus-uk',
  'Dishbee+ · UK',
  'Multi-category local marketplace with Omniqora shared services and optional Dishbee/Hive restaurant operations.',
  'GB','marketplace','active',
  '{"sourceRepository":"asaffilate01-ship-it/onyn","multiCategory":true}'::jsonb
)
ON CONFLICT(blueprint_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,country_code=EXCLUDED.country_code,
  category=EXCLUDED.category,status=EXCLUDED.status,metadata=EXCLUDED.metadata;

INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config) VALUES
('dishbee-plus-uk','dishbee-plus',true,'{"brand":"dishbee+","country":"GB"}'::jsonb)
ON CONFLICT(blueprint_key,product_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
SELECT 'dishbee-plus-uk',v.service_key,v.required,'{}'::jsonb
FROM (VALUES
 ('omniqora.identity',true),
 ('omniqora.marketplace',true),
 ('omniqora.integration-hub',true),
 ('omniqora.catalogue-syndication',true),
 ('omniqora.vendor-operations',true),
 ('omniqora.order-orchestration',true),
 ('omniqora.payments',true),
 ('omniqora.geo',true),
 ('omniqora.dispatch',false),
 ('omniqora.tracking',false),
 ('omniqora.inventory',false),
 ('omniqora.crm',false),
 ('omniqora.connect',false),
 ('omniqora.journeys',false),
 ('omniqora.rfm',false),
 ('omniqora.feedback',false),
 ('omniqora.analytics',false),
 ('omniqora.profitability',false),
 ('zoryn.rewards',false),
 ('omniqora.security-assurance',false),
 ('omniqora.data-governance',false),
 ('omniqora.ops-assurance',false)
) AS v(service_key,required)
ON CONFLICT(blueprint_key,service_key) DO UPDATE SET required=EXCLUDED.required,config=EXCLUDED.config;

-- Provider registry: capability metadata only. Entries do not imply a commercial
-- partnership, certified API access or production credentials.
CREATE TABLE IF NOT EXISTS public.integration_provider_catalogue(
  provider_key text PRIMARY KEY CHECK(provider_key ~ '^[a-z0-9][a-z0-9._-]{1,80}$'),
  display_name text NOT NULL,
  provider_family text NOT NULL CHECK(provider_family IN(
    'marketplace','marketplace_middleware','pos','delivery','payments',
    'identity','erp','itsm','data','communications','other'
  )),
  integration_mode text NOT NULL DEFAULT 'api' CHECK(integration_mode IN('api','webhook','oauth','middleware','file','manual','hybrid')),
  status text NOT NULL DEFAULT 'evaluate' CHECK(status IN('evaluate','planned','sandbox','certifying','approved','live','paused','retired')),
  countries text[] NOT NULL DEFAULT '{}',
  capabilities text[] NOT NULL DEFAULT '{}',
  documentation_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_provider_routes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  provider_key text NOT NULL REFERENCES public.integration_provider_catalogue(provider_key) ON DELETE RESTRICT,
  route_role text NOT NULL CHECK(route_role IN('direct','bridge','source','destination','fallback')),
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT false,
  country_code text,
  capability_scope text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_key,provider_key,route_role,country_code)
);

ALTER TABLE public.integration_provider_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_provider_routes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.integration_provider_catalogue TO authenticated;
GRANT SELECT ON public.product_provider_routes TO authenticated;
GRANT ALL ON public.integration_provider_catalogue TO service_role;
GRANT ALL ON public.product_provider_routes TO service_role;

DROP POLICY IF EXISTS "provider catalogue read" ON public.integration_provider_catalogue;
CREATE POLICY "provider catalogue read" ON public.integration_provider_catalogue
  FOR SELECT TO authenticated USING(true);
DROP POLICY IF EXISTS "provider catalogue admin" ON public.integration_provider_catalogue;
CREATE POLICY "provider catalogue admin" ON public.integration_provider_catalogue
  FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "product provider route read" ON public.product_provider_routes;
CREATE POLICY "product provider route read" ON public.product_provider_routes
  FOR SELECT TO authenticated USING(true);
DROP POLICY IF EXISTS "product provider route admin" ON public.product_provider_routes;
CREATE POLICY "product provider route admin" ON public.product_provider_routes
  FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()));

INSERT INTO public.integration_provider_catalogue(
  provider_key,display_name,provider_family,integration_mode,status,countries,capabilities,metadata
) VALUES
('uber_eats','Uber Eats','marketplace','api','planned',ARRAY['GB'],ARRAY['orders','menu','availability','store','status','settlement'],'{"approvalRequired":true}'::jsonb),
('deliveroo','Deliveroo','marketplace','api','planned',ARRAY['GB'],ARRAY['orders','menu','availability','site','status','rider_events','settlement'],'{"approvalRequired":true}'::jsonb),
('just_eat','Just Eat','marketplace','api','planned',ARRAY['GB'],ARRAY['orders','menu','availability','store','status','settlement'],'{"approvalRequired":true}'::jsonb),
('wolt','Wolt','marketplace','api','evaluate','{}',ARRAY['orders','menu','delivery'],'{}'::jsonb),
('talabat','Talabat','marketplace','api','evaluate','{}',ARRAY['orders','menu','status'],'{}'::jsonb),
('careem','Careem','marketplace','api','evaluate','{}',ARRAY['orders','menu','delivery'],'{}'::jsonb),
('noon_food','noon Food','marketplace','api','evaluate','{}',ARRAY['orders','menu','delivery'],'{}'::jsonb),
('foodpanda','foodpanda','marketplace','api','evaluate','{}',ARRAY['orders','menu','delivery'],'{}'::jsonb),
('glovo','Glovo','marketplace','api','evaluate','{}',ARRAY['orders','menu','delivery'],'{}'::jsonb),
('grubhub_seamless','Grubhub / Seamless','marketplace','api','evaluate',ARRAY['US'],ARRAY['orders','menu','delivery'],'{}'::jsonb),
('deliverect','Deliverect','marketplace_middleware','middleware','planned','{}',ARRAY['orders','menu','availability','status','mapping'],'{"role":"optionalBridge"}'::jsonb),
('otter','Otter','marketplace_middleware','middleware','planned','{}',ARRAY['orders','menu','availability','status','mapping'],'{"role":"optionalBridge"}'::jsonb),
('urbanpiper','UrbanPiper','marketplace_middleware','middleware','planned','{}',ARRAY['orders','menu','availability','status','mapping'],'{"role":"optionalBridge"}'::jsonb),
('sumup','SumUp','payments','api','planned',ARRAY['GB'],ARRAY['card_payments','terminal','checkout'],'{"role":"payment_provider_not_pos"}'::jsonb),
('uber_direct','Uber Direct','delivery','api','planned',ARRAY['GB'],ARRAY['quote','create','cancel','tracking'],'{"approvalRequired":true}'::jsonb),
('deliveroo_express','Deliveroo Express','delivery','api','planned',ARRAY['GB'],ARRAY['quote','create','cancel','tracking'],'{"approvalRequired":true}'::jsonb),
('just_eat_go','Just Eat Go','delivery','api','planned',ARRAY['GB'],ARRAY['quote','create','cancel','tracking'],'{"approvalRequired":true}'::jsonb),
('stuart','Stuart','delivery','api','planned',ARRAY['GB'],ARRAY['quote','create','cancel','tracking'],'{"approvalRequired":true}'::jsonb),
('microsoft_entra','Microsoft Entra ID','identity','oauth','evaluate','{}',ARRAY['sso','identity','provisioning'],'{"qittDomain":"identity-workplace"}'::jsonb),
('okta','Okta','identity','oauth','evaluate','{}',ARRAY['sso','identity','provisioning'],'{"qittDomain":"identity-workplace"}'::jsonb),
('oracle','Oracle','erp','api','evaluate','{}',ARRAY['erp','finance','procurement'],'{"qittDomain":"enterprise-systems"}'::jsonb),
('sap','SAP','erp','api','evaluate','{}',ARRAY['erp','finance','procurement'],'{"qittDomain":"enterprise-systems"}'::jsonb),
('workday','Workday','erp','api','evaluate','{}',ARRAY['hcm','finance'],'{"qittDomain":"enterprise-systems"}'::jsonb),
('servicenow','ServiceNow','itsm','api','evaluate','{}',ARRAY['itsm','cases','incidents','changes'],'{"qittDomain":"itsm-ops"}'::jsonb),
('freshservice','Freshservice','itsm','api','evaluate','{}',ARRAY['itsm','cases','incidents'],'{"qittDomain":"itsm-ops"}'::jsonb),
('power_bi','Power BI','data','api','evaluate','{}',ARRAY['analytics','bi'],'{"qittDomain":"bi-data-governance"}'::jsonb),
('microsoft_fabric','Microsoft Fabric','data','api','evaluate','{}',ARRAY['lakehouse','analytics','governance'],'{"qittDomain":"bi-data-governance"}'::jsonb),
('databricks','Databricks','data','api','evaluate','{}',ARRAY['lakehouse','analytics','ai'],'{"qittDomain":"bi-data-governance"}'::jsonb)
ON CONFLICT(provider_key) DO UPDATE SET
 display_name=EXCLUDED.display_name,
 provider_family=EXCLUDED.provider_family,
 integration_mode=EXCLUDED.integration_mode,
 countries=EXCLUDED.countries,
 capabilities=EXCLUDED.capabilities,
 metadata=public.integration_provider_catalogue.metadata||EXCLUDED.metadata,
 updated_at=now();

-- Competitor POS products such as Foodics, Dines, Toast, Square, Lightspeed,
-- Epos Now and Grafterr are intentionally NOT provider routes. They are product
-- benchmarks/gap inputs. Optional migration tooling may import their exports,
-- but Dishbee remains the operating system after cut-over.
-- Default routes are deliberately disabled until approval/certification is complete.
INSERT INTO public.product_provider_routes(
 product_key,provider_key,route_role,priority,enabled,country_code,capability_scope,metadata
)
SELECT 'dishbee-plus',v.provider,v.role,v.priority,false,'GB',v.capabilities,'{"activation":"certification-gated"}'::jsonb
FROM (VALUES
 ('uber_eats','direct',10,ARRAY['orders','menu','availability','status']),
 ('deliveroo','direct',10,ARRAY['orders','menu','availability','status']),
 ('just_eat','direct',10,ARRAY['orders','menu','availability','status']),
 ('deliverect','bridge',50,ARRAY['orders','menu','availability','status']),
 ('otter','bridge',60,ARRAY['orders','menu','availability','status']),
 ('urbanpiper','bridge',70,ARRAY['orders','menu','availability','status']),
 ('uber_direct','destination',10,ARRAY['quote','create','tracking']),
 ('deliveroo_express','destination',20,ARRAY['quote','create','tracking']),
 ('just_eat_go','destination',30,ARRAY['quote','create','tracking']),
 ('stuart','destination',40,ARRAY['quote','create','tracking'])
) AS v(provider,role,priority,capabilities)
ON CONFLICT(product_key,provider_key,route_role,country_code) DO UPDATE SET
 priority=EXCLUDED.priority,
 capability_scope=EXCLUDED.capability_scope,
 metadata=EXCLUDED.metadata,
 updated_at=now();

COMMIT;
