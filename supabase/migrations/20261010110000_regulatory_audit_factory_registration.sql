-- Reusable regulatory evidence audit service; registration only, never live-activate.
BEGIN;
INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,metadata)
VALUES ('omniqora.regulatory-audit','Regulatory Audit & Evidence','Tenant-scoped draft evidence packs, daily/on-demand schedules and reviewed regulator-specific exports.','compliance',NULL,false,'manual','beta',
'{"authority":"review-only","submissions_enabled":false,"model_authority":"advisory","needs_isolated_financial_data":true,"implementation":"registration-only","liveVerified":false}'::jsonb)
ON CONFLICT(service_key) DO UPDATE SET description=EXCLUDED.description,metadata=public.service_catalogue.metadata||EXCLUDED.metadata,updated_at=now();
INSERT INTO public.product_services(product_key,service_key,default_enabled,required,metadata)
VALUES('fastremit','omniqora.regulatory-audit',false,false,'{"operator_data_plane":"isolated","regulators":["HMRC","FCA"],"review_required":true}'::jsonb)
ON CONFLICT(product_key,service_key) DO NOTHING;
INSERT INTO public.blueprint_services(blueprint_key,service_key,required,config)
VALUES('moneybridge-uk','omniqora.regulatory-audit',false,'{"initial_mode":"disabled","schedule":"daily-or-manual","exports":"draft","submission":"human-reviewed-only"}'::jsonb)
ON CONFLICT(blueprint_key,service_key) DO NOTHING;
COMMIT;
