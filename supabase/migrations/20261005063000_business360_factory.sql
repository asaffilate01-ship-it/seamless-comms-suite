-- Catalogue registration only: no tenant activation, billing price or live connection.
BEGIN;
INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status,product_role,parent_product_key,implementation_status,metadata)
VALUES('business360','Business360','Business discovery, financial analysis, improvement and transaction planning.','professional-services','hybrid','beta','landlord','omniqora','built_main',
 '{"systemOfRecord":"Transformation service","hostRoute":"/app/transformation","standalonePath":"apps/business360-standalone","liveVerified":false,"activation":"operator-reviewed","identityBoundary":"tenant and restricted engagement project"}')
ON CONFLICT(product_key) DO UPDATE SET name=excluded.name,description=excluded.description,category=excluded.category,deployment_mode=excluded.deployment_mode,product_role=excluded.product_role,parent_product_key=excluded.parent_product_key,implementation_status=excluded.implementation_status,metadata=public.product_catalogue.metadata||excluded.metadata,updated_at=now();

INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status,metadata)
VALUES('business360.core','Business360 Audit and Transformation','Standalone or add-on access to discovery, evidence, KPIs and reviewed plans.','intelligence','business360',true,'manual','beta','built_main',
 '{"activationRequires":["deployed_service","postgres_rls","identity_mapping","tenant_entitlement","controlled_smoke_test"],"aiPolicyRequired":true,"pricingDecisionRequired":true}')
ON CONFLICT(service_key) DO UPDATE SET name=excluded.name,description=excluded.description,family=excluded.family,owner_product_key=excluded.owner_product_key,provisioning_mode=excluded.provisioning_mode,implementation_status=excluded.implementation_status,metadata=public.service_catalogue.metadata||excluded.metadata,updated_at=now();

INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata) VALUES
 ('business360','business360.core',true,true,'{}'),
 ('omniqora','business360.core',false,false,'{"mode":"add-on","route":"/app/transformation"}')
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=excluded.default_enabled,required=excluded.required,metadata=excluded.metadata;

INSERT INTO public.tenant_blueprints(blueprint_key,name,description,category,status,metadata)
VALUES('business360-advisory','Business360 advisory workspace','Restricted business audit and transaction engagements; operator activation required.','professional-services','active','{"automaticActivation":false,"clientSeparation":"separate tenant or restricted project","commercialPricing":"not-set"}')
ON CONFLICT(blueprint_key) DO UPDATE SET name=excluded.name,description=excluded.description,metadata=public.tenant_blueprints.metadata||excluded.metadata;
INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config)
VALUES('business360-advisory','business360',true,'{"activation":"manual","deployment":"choose-hosted-or-standalone"}')
ON CONFLICT(blueprint_key,product_key) DO NOTHING;
INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
VALUES('business360-advisory','business360.core',true,'{"activation":"manual"}')
ON CONFLICT(blueprint_key,service_key) DO NOTHING;
COMMIT;
