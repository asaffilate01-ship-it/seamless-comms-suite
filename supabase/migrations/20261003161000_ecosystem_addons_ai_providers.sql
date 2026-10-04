BEGIN;

INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status) VALUES
('zoryn-rewards','Zoryn Rewards','Cross-product loyalty, rewards and incentives.','growth','external','active')
ON CONFLICT(product_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,status='active',updated_at=now();

CREATE TABLE IF NOT EXISTS public.ecosystem_addon_catalogue(
 addon_key text PRIMARY KEY CHECK(addon_key ~ '^[a-z0-9.-]{3,120}$'),
 host_product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 addon_product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 addon_service_key text REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
 name text NOT NULL,
 category text NOT NULL,
 description text NOT NULL DEFAULT '',
 integration_mode text NOT NULL DEFAULT 'deep_link'
   CHECK(integration_mode IN('embedded_summary','deep_link','background_sync','workflow','channel')),
 data_boundary text NOT NULL DEFAULT '',
 capabilities text[] NOT NULL DEFAULT '{}',
 default_enabled boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','planned','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((addon_product_key IS NOT NULL)::int + (addon_service_key IS NOT NULL)::int >= 1)
);

CREATE TABLE IF NOT EXISTS public.tenant_ecosystem_addons(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 host_product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 addon_key text NOT NULL REFERENCES public.ecosystem_addon_catalogue(addon_key) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','configuring','active','blocked','suspended','cancelled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 external_connection_ref text,
 activated_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,host_product_key,addon_key)
);

ALTER TABLE public.ecosystem_addon_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_ecosystem_addons ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ecosystem_addon_catalogue TO authenticated;
GRANT ALL ON public.ecosystem_addon_catalogue TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tenant_ecosystem_addons TO authenticated;
GRANT ALL ON public.tenant_ecosystem_addons TO service_role;
DROP POLICY IF EXISTS "ecosystem addon catalogue read" ON public.ecosystem_addon_catalogue;
CREATE POLICY "ecosystem addon catalogue read" ON public.ecosystem_addon_catalogue FOR SELECT TO authenticated USING(status<>'retired');
DROP POLICY IF EXISTS "ecosystem tenant addon read" ON public.tenant_ecosystem_addons;
CREATE POLICY "ecosystem tenant addon read" ON public.tenant_ecosystem_addons FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "ecosystem tenant addon write" ON public.tenant_ecosystem_addons;
CREATE POLICY "ecosystem tenant addon write" ON public.tenant_ecosystem_addons FOR ALL TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()));

INSERT INTO public.ecosystem_addon_catalogue(
 addon_key,host_product_key,addon_product_key,addon_service_key,name,category,description,integration_mode,data_boundary,capabilities
) VALUES
('dishbee.haccora','dishbee','haccora',NULL,'Haccora Compliance','compliance','Food safety, HACCP, checks, corrective actions and audit readiness.','embedded_summary','Haccora remains authoritative; Dishbee receives status, tasks and evidence references only.',ARRAY['status','tasks','deep_link','alerts']),
('dishbee.accounts','dishbee','omniqora-accounts',NULL,'Accounts','accounting','Post restaurant sales, VAT, COGS, supplier, settlement and payroll summaries into the accounting workflow.','background_sync','Dishbee emits accounting/subledger events; accounting records remain in Accounts.',ARRAY['subledger','vat','cogs','settlements','expenses']),
('dishbee.xpertjobs','dishbee','xpertjobs',NULL,'XpertJobs Recruitment','workforce','Create vacancies from workforce gaps and receive application status.','workflow','Candidate records remain in XpertJobs; Dishbee stores vacancy and hire references only.',ARRAY['vacancy','application_status','hire']),
('dishbee.lawquo','dishbee','lawquo',NULL,'Lawquo Legal','business-services','Create scoped legal matters for employment, supplier, lease, franchise and customer disputes.','workflow','Legal matter content and privileged documents remain in Lawquo.',ARRAY['matter_create','status','deep_link']),
('dishbee.onyngo','dishbee','onyngo',NULL,'OnynGo Channel','marketplace','Publish approved restaurant/menu availability to the OnynGo consumer marketplace channel.','channel','Dishbee remains authoritative for restaurant menu/order operations; OnynGo owns marketplace discovery.',ARRAY['listing','menu_publish','order_intake']),
('dishbee.rewards','dishbee','zoryn-rewards',NULL,'Zoryn Rewards','growth','Shared loyalty, rewards and incentives.','background_sync','Rewards ledger remains in Zoryn Rewards; Dishbee sends eligible commerce events.',ARRAY['earn','redeem','offers']),
('dishbee.courier','dishbee','courier-connect',NULL,'Courier Connect','delivery','External last-mile provider aggregation alongside Dishbee Go own-rider operations.','workflow','Delivery provider jobs remain provider-bound; Dishbee stores dispatch/tracking references.',ARRAY['quote','dispatch','tracking']),
('mealdeck.haccora','mealdeck','haccora',NULL,'Haccora Compliance','compliance','Franchise/location compliance status and alerts.','embedded_summary','Haccora remains authoritative.',ARRAY['status','alerts','tasks']),
('mealdeck.accounts','mealdeck','omniqora-accounts',NULL,'Accounts','accounting','Location/franchise accounting event feed.','background_sync','Accounting records remain in Accounts.',ARRAY['subledger','settlement']),
('mealdeck.xpertjobs','mealdeck','xpertjobs',NULL,'XpertJobs Recruitment','workforce','Recruitment from franchise/workforce needs.','workflow','Candidates remain in XpertJobs.',ARRAY['vacancy','hire']),
('mealdeck.lawquo','mealdeck','lawquo',NULL,'Lawquo Legal','business-services','Franchise/lease/employment/legal workflow.','workflow','Matters remain in Lawquo.',ARRAY['matter_create','status']),
('mealdeck.rewards','mealdeck','zoryn-rewards',NULL,'Zoryn Rewards','growth','MealDeck-wide loyalty and wallet rewards.','background_sync','Rewards ledger remains in Zoryn.',ARRAY['earn','redeem','campaigns']),
('onyngo.accounts','onyngo','omniqora-accounts',NULL,'Accounts','accounting','Marketplace merchant/platform accounting feeds.','background_sync','Accounting remains in Accounts.',ARRAY['settlements','fees','vat']),
('onyngo.xpertjobs','onyngo','xpertjobs',NULL,'XpertJobs','workforce','Merchant/rider/platform recruitment workflows.','workflow','Candidates remain in XpertJobs.',ARRAY['vacancy','applications']),
('onyngo.lawquo','onyngo','lawquo',NULL,'Lawquo Legal','business-services','Vendor, rider, customer and commercial legal workflow.','workflow','Matters remain in Lawquo.',ARRAY['matter_create','status']),
('onyngo.rewards','onyngo','zoryn-rewards',NULL,'Zoryn Rewards','growth','Cross-vertical marketplace loyalty.','background_sync','Rewards remain in Zoryn.',ARRAY['earn','redeem']),
('stylesync.accounts','stylesync','omniqora-accounts',NULL,'Accounts','accounting','Salon sales, VAT, payroll and expense feeds.','background_sync','Accounts remains authoritative.',ARRAY['sales','vat','payroll','expenses']),
('stylesync.xpertjobs','stylesync','xpertjobs',NULL,'XpertJobs','workforce','Recruit stylists/therapists from rota demand.','workflow','Candidate records remain in XpertJobs.',ARRAY['vacancy','hire']),
('stylesync.lawquo','stylesync','lawquo',NULL,'Lawquo Legal','business-services','Employment, tenancy and client-claim legal workflow.','workflow','Legal records remain in Lawquo.',ARRAY['matter_create','status']),
('schonova.accounts','schonova','omniqora-accounts',NULL,'Accounts','accounting','Salon financial event feed with German localisation boundary.','background_sync','Accounting records remain in the selected accounting product/provider.',ARRAY['sales','tax','payroll']),
('schonova.xpertjobs','schonova','xpertjobs',NULL,'XpertJobs','workforce','Recruitment workflow.','workflow','Candidates remain in XpertJobs.',ARRAY['vacancy','hire']),
('schonova.lawquo','schonova','lawquo',NULL,'Lawquo Legal','business-services','Legal workflow/deep link where jurisdiction/service is supported.','workflow','Legal records remain in Lawquo.',ARRAY['matter_create','status']),
('dulcis.haccora','dulcis','haccora',NULL,'Haccora Compliance','compliance','Food compliance for physical production/studio locations.','embedded_summary','Haccora remains authoritative.',ARRAY['status','tasks']),
('dulcis.dishbee','dulcis','dishbee',NULL,'Dishbee Hospitality','hospitality','Optional physical-store/kitchen operations for Dulcis.','workflow','Merqano remains commerce/storefront authority; Dishbee owns EPOS/KDS/kitchen operations.',ARRAY['epos','kds','display','inventory']),
('dulcis.accounts','dulcis','omniqora-accounts',NULL,'Accounts','accounting','Commerce and hospitality accounting feed.','background_sync','Accounts remains authoritative.',ARRAY['sales','cogs','settlements']),
('zivvo.accounts','zivvo','omniqora-accounts',NULL,'Accounts','accounting','Dealer/marketplace financial event feed.','background_sync','Accounts remains authoritative.',ARRAY['fees','deposits','settlements']),
('zivvo.lawquo','zivvo','lawquo',NULL,'Lawquo Legal','business-services','Dealer/seller/buyer dispute and contract workflow.','workflow','Legal records remain in Lawquo.',ARRAY['matter_create','status']),
('zivvo.xpertjobs','zivvo','xpertjobs',NULL,'XpertJobs','workforce','Dealer/inspection/recruitment workflow.','workflow','Candidates remain in XpertJobs.',ARRAY['vacancy','hire']),
('autohashi.accounts','autohashi','omniqora-accounts',NULL,'Accounts','accounting','Auction/import fees, deposits and landed-cost accounting feed.','background_sync','Accounts remains authoritative.',ARRAY['fees','landed_cost','settlement']),
('autohashi.lawquo','autohashi','lawquo',NULL,'Lawquo Legal','business-services','Import/auction/dispute legal workflow.','workflow','Legal records remain in Lawquo.',ARRAY['matter_create','status'])
ON CONFLICT(addon_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,integration_mode=EXCLUDED.integration_mode,
 data_boundary=EXCLUDED.data_boundary,capabilities=EXCLUDED.capabilities,status='active',updated_at=now();

-- Additional AI/media/provider catalogue entries; availability still requires an active tenant binding.
INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status
) VALUES
('ai.runway','Runway','ai',ARRAY['image','video','generation'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
('ai.fal','fal.ai','ai',ARRAY['image','video','audio','generation'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
('ai.elevenlabs','ElevenLabs','ai',ARRAY['speech','voice'],ARRAY[]::text[],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.dvla','DVLA Vehicle Enquiry','vehicle-data',ARRAY['vehicle_lookup'],ARRAY['GB'],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.mot','DVSA MOT History','vehicle-data',ARRAY['mot_history'],ARRAY['GB'],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.hpi','Vehicle History Provider','vehicle-data',ARRAY['history','finance','writeoff','stolen'],ARRAY['GB'],ARRAY['api_key'],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.japan-auction','Japan Auction Feed','vehicle-auction',ARRAY['auction_listings','bids','images','grades'],ARRAY['JP'],ARRAY['api_key'],ARRAY['base_url'],'planned','catalogue_only')
ON CONFLICT(provider_key) DO UPDATE SET
 name=EXCLUDED.name,provider_kind=EXCLUDED.provider_kind,capabilities=EXCLUDED.capabilities,
 supported_countries=EXCLUDED.supported_countries,required_secret_names=EXCLUDED.required_secret_names,
 public_config_names=EXCLUDED.public_config_names,status=EXCLUDED.status,implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.product_provider_requirements(product_key,provider_key,required,purpose) VALUES
('zivvo','vehicle.dvla',false,'Vehicle identity/autofill'),
('zivvo','vehicle.mot',false,'MOT history'),
('zivvo','vehicle.hpi',false,'Vehicle provenance/history'),
('autohashi','vehicle.japan-auction',true,'Japanese auction listing and bidding feed'),
('autohashi','ai.openai',false,'Listing/auction intelligence'),
('onyngo','ai.openai',false,'Marketplace assistance and enrichment'),
('dishbee','ai.openai',false,'Operator copilot'),
('merqano','ai.openai',false,'Commerce content and merchant assistance')
ON CONFLICT(product_key,provider_key) DO UPDATE SET required=EXCLUDED.required,purpose=EXCLUDED.purpose;

COMMIT;