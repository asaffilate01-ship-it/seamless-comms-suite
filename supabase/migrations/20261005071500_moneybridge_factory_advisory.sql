-- Preserve the existing fastremit machine identity; MoneyBridge is the display brand.
BEGIN;
INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status,metadata)
VALUES('fastremit','MoneyBridge','Remittance operations with a separate operator data plane.','fintech','external','beta',
  '{"display_brand":"MoneyBridge","deployment_isolation":"one-operator-per-database","shared_database_multitenancy":false,"ai_authority":"advisory-only","repository":"asaffilate01-ship-it/screen-shot-magic-526"}'::jsonb)
ON CONFLICT(product_key) DO UPDATE SET name = excluded.name, description = excluded.description,
  metadata = public.product_catalogue.metadata || excluded.metadata, updated_at = now();

INSERT INTO public.product_services(product_key,service_key,default_enabled,required)
VALUES('fastremit','omniqora.ai',false,false),('fastremit','omniqora.analytics',false,false)
ON CONFLICT DO NOTHING;

INSERT INTO public.tenant_blueprints(blueprint_key,name,description,country_code,category,status,metadata)
VALUES('moneybridge-uk','MoneyBridge operator · UK','Separate remittance deployment per operator. Stage and verify provider, tenant and advisory connections before activation.','GB','fintech','draft',
  '{"automatic_launch":false,"requires_isolated_data_plane":true,"customers_are_tenants":false,"authority":"MoneyBridge retains funding, payment and compliance decisions"}'::jsonb)
ON CONFLICT DO NOTHING;
INSERT INTO public.blueprint_products(blueprint_key,product_key,required,config)
VALUES('moneybridge-uk','fastremit',true,'{"country":"GB","currency":"GBP","timezone":"Europe/London","omniqora_mode":"off","requires_isolated_data_plane":true}'::jsonb)
ON CONFLICT DO NOTHING;
-- No tenant, credential, service activation or customer data is provisioned by this migration.
COMMIT;
