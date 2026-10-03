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

CREATE TABLE IF NOT EXISTS public.marketplace_matches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 request_type text NOT NULL,
 request_ref text NOT NULL,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
 score numeric NOT NULL DEFAULT 0,
 rank integer,
 reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'candidate' CHECK(status IN('candidate','shortlisted','contacted','accepted','rejected','expired')),
 model_ref text,
 generated_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS marketplace_matches_request_idx
 ON public.marketplace_matches(tenant_id,product_key,request_type,request_ref,score DESC);

ALTER TABLE public.marketplace_matches ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.marketplace_matches TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.marketplace_matches TO authenticated;
DROP POLICY IF EXISTS "marketplace matches read" ON public.marketplace_matches;
CREATE POLICY "marketplace matches read" ON public.marketplace_matches FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "marketplace matches write" ON public.marketplace_matches;
CREATE POLICY "marketplace matches write" ON public.marketplace_matches FOR ALL TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()));

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