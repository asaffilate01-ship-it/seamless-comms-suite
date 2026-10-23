-- Craftvaro keeps domain data and billing authority until a verified capability cutover.
BEGIN;
INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,default_base_url,status,metadata)
VALUES('craftvaro','Craftvaro','Trades marketplace, property projects, subcontractors, materials and delivery.','marketplace','external','https://jobflow-tradehub.lovable.app','internal','{}')
ON CONFLICT(product_key) DO UPDATE SET name=excluded.name,description=excluded.description,category=excluded.category,default_base_url=excluded.default_base_url,updated_at=now();
UPDATE public.product_catalogue SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
 'source_repository','https://github.com/asaffilate01-ship-it/jobflow-tradehub',
 'source_project_id','27b4c132-3281-4ca4-a913-7ce0f7915510',
 'source_audit_status','source_and_schema_reviewed_2026_10_23',
 'systemOfRecord','external','authority_mode','local','migration_stage','readiness',
 'tenant_provisioning_enabled',false,'provider_activation_verified',false,
 'countries',jsonb_build_array('GB','DE'),
 'activation_blockers',jsonb_build_array('source_schema_reconciliation','core_workflow_acceptance','verified_tenant_mapping','signed_adapter_and_replay_tests','country_readiness'),
 'data_boundary','Craftvaro retains customer identities, addresses, KYC documents, evidence, jobs, orders and payment records. Factory receives only scoped tenant references and approved operational events.',
 'cutover_sequence',jsonb_build_array('local','shadow','parity_verified','approved_capability_switch')),
 updated_at=now() WHERE product_key='craftvaro';
INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,metadata)
VALUES('craftvaro.core','Craftvaro operations','External trades marketplace and project operations.','marketplace','craftvaro',false,'external','internal','{"authority":"craftvaro","activation":"readiness_only","automaticBilling":false}')
ON CONFLICT(service_key) DO NOTHING;
INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata)
VALUES('craftvaro','craftvaro.core',false,true,'{"activation":"explicit_verified_mapping_required"}') ON CONFLICT(product_key,service_key) DO NOTHING;
INSERT INTO public.tenant_blueprints(blueprint_key,name,description,country_code,category,status,metadata)
VALUES
('craftvaro-gb','Craftvaro UK','UK edition template; no tenant or billing activation.','GB','trades','draft','{"product":"craftvaro","locale":"en-GB","currency":"GBP","authority":"local","autoProvision":false,"activation":"readiness_required"}'),
('craftvaro-de','Craftvaro Germany','German edition template; translation and country workflows require verification.','DE','trades','draft','{"product":"craftvaro","locale":"de-DE","currency":"EUR","authority":"local","autoProvision":false,"activation":"country_readiness_required"}')
ON CONFLICT(blueprint_key) DO NOTHING;
INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config)
VALUES('craftvaro-gb','craftvaro',true,'{"authority":"local","activation":"manual"}'),('craftvaro-de','craftvaro',true,'{"authority":"local","activation":"manual"}') ON CONFLICT(blueprint_key,product_key) DO NOTHING;
INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
VALUES('craftvaro-gb','craftvaro.core',true,'{"enabled":false}'),('craftvaro-de','craftvaro.core',true,'{"enabled":false}') ON CONFLICT(blueprint_key,service_key) DO NOTHING;
COMMIT;
