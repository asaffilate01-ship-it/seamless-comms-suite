-- Register Zivvo UK/DE draft dealer workspaces; no live activation.
BEGIN;

UPDATE public.product_catalogue
SET metadata = COALESCE(metadata, '{}'::jsonb) ||
  '{"editions":["GB","DE"],"dealer_tenant_binding":"<market>:<dealer_uuid>","runtime_owner":"zivvo","platform_control_plane":"omniqora","autoProvision":false,"activation":"verified_dealer_opt_in"}'::jsonb,
  updated_at = now()
WHERE product_key = 'zivvo';

INSERT INTO public.product_services
  (product_key,service_key,default_enabled,required,metadata)
VALUES
  ('zivvo','omniqora.crm',false,false,'{"dealer_opt_in":true}'::jsonb),
  ('zivvo','omniqora.connect',false,false,'{"dealer_opt_in":true}'::jsonb),
  ('zivvo','omniqora.ai',false,false,'{"dealer_opt_in":true,"human_review_required":true}'::jsonb),
  ('zivvo','omniqora.sales',false,false,'{"dealer_opt_in":true}'::jsonb),
  ('zivvo','omniqora.analytics',false,false,'{"dealer_opt_in":true}'::jsonb),
  ('zivvo','omniqora.journeys',false,false,'{"dealer_opt_in":true}'::jsonb)
ON CONFLICT (product_key,service_key) DO NOTHING;

INSERT INTO public.tenant_blueprints
  (blueprint_key,name,description,country_code,category,status,metadata)
VALUES
  ('zivvo.dealer.gb','Zivvo Dealer - UK',
   'Draft only; approved UK dealer must be bound to existing Zivvo UK dealer ID. No live providers.',
   'GB','automotive','draft','{"canonicalProductKey":"zivvo","market":"GB","sourceAuthority":"external_product","autoProvision":false}'::jsonb),
  ('zivvo.dealer.de','Zivvo Haendler - Deutschland',
   'Draft only; approved German dealer must be bound to existing Zivvo Germany dealer ID.',
   'DE','automotive','draft','{"canonicalProductKey":"zivvo","market":"DE","sourceAuthority":"external_product","autoProvision":false}'::jsonb)
ON CONFLICT (blueprint_key) DO NOTHING;

INSERT INTO public.blueprint_products (blueprint_key,product_key,required,config)
VALUES
  ('zivvo.dealer.gb','zivvo',true,'{"requiresSourceTenantBinding":true,"externalTenantIdPattern":"GB:<dealer_uuid>","allowPayments":false,"allowAutonomousExternalWrites":false,"enableProviderConnections":false}'::jsonb),
  ('zivvo.dealer.de','zivvo',true,'{"requiresSourceTenantBinding":true,"externalTenantIdPattern":"DE:<dealer_uuid>","allowPayments":false,"allowAutonomousExternalWrites":false,"enableProviderConnections":false}'::jsonb)
ON CONFLICT (blueprint_key,product_key) DO NOTHING;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
SELECT b.blueprint_key,s.service_key,false,'{"requiresOptIn":true,"autoActivate":false}'::jsonb
FROM (VALUES ('zivvo.dealer.gb'),('zivvo.dealer.de')) AS b(blueprint_key)
CROSS JOIN (VALUES
  ('omniqora.crm'),('omniqora.connect'),('omniqora.ai'),
  ('omniqora.sales'),('omniqora.analytics'),('omniqora.journeys')
) AS s(service_key)
ON CONFLICT (blueprint_key,service_key) DO NOTHING;

COMMIT;
