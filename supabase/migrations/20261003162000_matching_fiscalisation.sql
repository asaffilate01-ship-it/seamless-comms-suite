BEGIN;

INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status,metadata
) VALUES
('fiscal.de-tse','Germany TSE Fiscalisation','fiscal',
 ARRAY['tse_sign','receipt_fields','dsfinv_k_export','cash_register_registration'],
 ARRAY['DE'],ARRAY['api_key'],ARRAY['environment','client_id'],'planned','catalogue_only',
 '{"jurisdiction":"DE","regulatoryBoundary":"Provider/adapter must meet applicable KassenSichV/TSE requirements before production activation."}'::jsonb)
ON CONFLICT(provider_key) DO UPDATE SET
 name=EXCLUDED.name,provider_kind=EXCLUDED.provider_kind,capabilities=EXCLUDED.capabilities,
 supported_countries=EXCLUDED.supported_countries,required_secret_names=EXCLUDED.required_secret_names,
 public_config_names=EXCLUDED.public_config_names,status=EXCLUDED.status,
 implementation_status=EXCLUDED.implementation_status,metadata=EXCLUDED.metadata,updated_at=now();

INSERT INTO public.product_provider_requirements(product_key,provider_key,required,purpose) VALUES
('schonova','fiscal.de-tse',true,'German cash-register fiscalisation and DSFinV-K export')
ON CONFLICT(product_key,provider_key) DO UPDATE SET required=true,purpose=EXCLUDED.purpose;

-- Marketplace Core v3 already owns the canonical request-based match table.
-- Extend it with explainable model metadata instead of creating a competing schema.
ALTER TABLE public.marketplace_matches
 ADD COLUMN IF NOT EXISTS model_ref text,
 ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS marketplace_matches_request_score_idx
 ON public.marketplace_matches(tenant_id,request_id,score DESC);


INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status) VALUES
('omniqora.marketplace-matching','Marketplace Matching','Reusable deterministic/AI-assisted provider, listing and opportunity matching with explainable scores.','marketplace','omniqora',true,'automatic','active'),
('omniqora.fiscalisation','Fiscalisation Adapters','Jurisdiction-specific fiscal receipt/signing/export adapters layered over the shared EPOS core.','commerce','omniqora',true,'external','active')
ON CONFLICT(service_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,status='active',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
('omniqora.marketplace-matching','omniqora.marketplace'),
('omniqora.marketplace-matching','omniqora.ai'),
('omniqora.fiscalisation','omniqora.commerce-epos')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('taxnuvia','omniqora.marketplace-matching',true,true),
('lawquo','omniqora.marketplace-matching',true,false),
('xpertjobs','omniqora.marketplace-matching',true,true),
('zivvo','omniqora.marketplace-matching',true,false),
('autohashi','omniqora.marketplace-matching',true,false),
('onyngo','omniqora.marketplace-matching',true,false),
('schonova','omniqora.fiscalisation',true,true)
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required;

COMMIT;