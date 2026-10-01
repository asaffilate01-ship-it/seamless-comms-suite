-- Backfill current Omniqora runtime usage into the universal entitlement engine.
BEGIN;

INSERT INTO public.omniqora_tenant_services(
  tenant_id,service_key,status,quantity,unit_amount_pence,config,activated_at
)
SELECT DISTINCT c.tenant_id,'omniqora.connect','active',1,0,
  jsonb_build_object('backfilledFrom','whatsapp_channels'),coalesce(min(c.created_at),now())
FROM public.whatsapp_channels c
GROUP BY c.tenant_id
ON CONFLICT(tenant_id,service_key) DO UPDATE SET
  status='active',config=public.omniqora_tenant_services.config||excluded.config,
  cancelled_at=null,updated_at=now();

INSERT INTO public.omniqora_tenant_services(
  tenant_id,service_key,status,quantity,unit_amount_pence,config,activated_at
)
SELECT DISTINCT c.tenant_id,'omniqora.whatsapp','active',1,0,
  jsonb_build_object('backfilledFrom','whatsapp_channels'),coalesce(min(c.created_at),now())
FROM public.whatsapp_channels c
GROUP BY c.tenant_id
ON CONFLICT(tenant_id,service_key) DO UPDATE SET
  status='active',config=public.omniqora_tenant_services.config||excluded.config,
  cancelled_at=null,updated_at=now();

-- Business360 project tenancy is stored as text; only valid UUID tenant keys are imported.
INSERT INTO public.omniqora_tenant_services(
  tenant_id,service_key,status,quantity,unit_amount_pence,config,activated_at
)
SELECT DISTINCT p.tenant::uuid,'omniqora.business360','active',1,0,
  jsonb_build_object('backfilledFrom','business360.projects'),now()
FROM business360.projects p
JOIN public.tenants t ON t.id=p.tenant::uuid
WHERE p.tenant ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
ON CONFLICT(tenant_id,service_key) DO UPDATE SET
  status='active',config=public.omniqora_tenant_services.config||excluded.config,
  cancelled_at=null,updated_at=now();

-- Every current workspace gets the foundation services that already underpin Omniqora.
INSERT INTO public.omniqora_tenant_services(
  tenant_id,service_key,status,quantity,unit_amount_pence,config,activated_at
)
SELECT t.id,s.service_key,'active',1,0,jsonb_build_object('backfilledFrom','omniqora-core'),t.created_at
FROM public.tenants t
CROSS JOIN (VALUES
  ('omniqora.identity'),('omniqora.tenant'),('omniqora.entitlements'),
  ('omniqora.audit-security'),('omniqora.data-events'),('omniqora.api-gateway')
) s(service_key)
ON CONFLICT(tenant_id,service_key) DO NOTHING;

COMMIT;
