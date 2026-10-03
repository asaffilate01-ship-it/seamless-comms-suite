BEGIN;

-- Suite product registration, reusable vertical packages and cross-product add-on catalogue.

INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status) VALUES
 ('onyngo','OnýnGo','Consumer/vendor marketplace, merchant, delivery and local-commerce platform.','marketplace','external','active'),
 ('merqano','Merqano','Commerce and brand landlord for retail, supplier and direct-to-consumer businesses.','commerce','external','active'),
 ('stylesync','StyleSync','UK beauty, salon and wellness marketplace and business SaaS.','beauty','external','active'),
 ('schonova','Schonova','Germany beauty, wellness and fitness marketplace and business SaaS.','beauty','external','active'),
 ('xpertjobs','XpertJobs','Recruitment, jobs and sponsor-intelligence marketplace.','marketplace','external','active'),
 ('iq-practice-cloud','IQ Practice Cloud','Accountancy practice, bookkeeping, payroll and tax operations.','accounting','external','active'),
 ('zoryn-rewards','Zoryn Rewards','Cross-product loyalty, rewards and stored-value experience.','growth','external','active')
ON CONFLICT(product_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,
 deployment_mode=EXCLUDED.deployment_mode,status='active',updated_at=now();

CREATE TABLE IF NOT EXISTS public.ecosystem_addon_offers(
 addon_key text PRIMARY KEY CHECK(addon_key ~ '^[a-z0-9.-]{3,120}$'),
 name text NOT NULL,
 category text NOT NULL,
 target_product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 target_service_key text REFERENCES public.service_catalogue(service_key) ON DELETE CASCADE,
 description text NOT NULL DEFAULT '',
 countries text[] NOT NULL DEFAULT '{}',
 launch_mode text NOT NULL DEFAULT 'product'
   CHECK(launch_mode IN('product','service','external_link','request')),
 default_recommended boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN('active','preview','planned','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((target_product_key IS NOT NULL)::integer+(target_service_key IS NOT NULL)::integer>=1)
);

CREATE TABLE IF NOT EXISTS public.ecosystem_product_addons(
 source_product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 addon_key text NOT NULL REFERENCES public.ecosystem_addon_offers(addon_key) ON DELETE CASCADE,
 sort_order integer NOT NULL DEFAULT 100,
 required boolean NOT NULL DEFAULT false,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(source_product_key,addon_key)
);

CREATE TABLE IF NOT EXISTS public.tenant_product_relationships(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 parent_product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 child_product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 relation_type text NOT NULL
   CHECK(relation_type IN('landlord','addon','channel','vertical_adapter','managed_service','integration')),
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN('requested','configuring','active','suspended','cancelled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,parent_product_key,child_product_key,relation_type)
);

ALTER TABLE public.ecosystem_addon_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecosystem_product_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_product_relationships ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ecosystem_addon_offers,public.ecosystem_product_addons TO authenticated;
GRANT ALL ON public.ecosystem_addon_offers,public.ecosystem_product_addons TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tenant_product_relationships TO authenticated;
GRANT ALL ON public.tenant_product_relationships TO service_role;
CREATE POLICY "ecosystem addon catalogue read" ON public.ecosystem_addon_offers
 FOR SELECT TO authenticated USING(status<>'retired');
CREATE POLICY "ecosystem product addon read" ON public.ecosystem_product_addons
 FOR SELECT TO authenticated USING(true);
CREATE POLICY "tenant product relationship read" ON public.tenant_product_relationships
 FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "tenant product relationship write" ON public.tenant_product_relationships
 FOR ALL TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()));

INSERT INTO public.vertical_package_catalogue(
 package_key,name,family,description,status,implementation_status,required_services,provider_requirements,capabilities
) VALUES
 ('marketplace.full','Marketplace Full','marketplace','Full reusable marketplace with matching, trust, auctions/offers, growth and payments.','preview','built_main',
  ARRAY['omniqora.marketplace','omniqora.marketplace-matching','omniqora.marketplace-trust','omniqora.marketplace-auctions','omniqora.marketplace-growth','omniqora.payments','omniqora.crm','omniqora.connect','omniqora.analytics'],
  ARRAY[]::text[],ARRAY['vendors','listings','matching','quotes','offers','auctions','reviews','disputes','promotions','settlements']),
 ('retail.brand-commerce','Brand Commerce','commerce','Retail/DTC brand commerce with marketplace, EPOS, payments, CRM, loyalty and analytics.','preview','built_main',
  ARRAY['omniqora.marketplace','omniqora.commerce','omniqora.payments','omniqora.crm','omniqora.connect','omniqora.analytics','zoryn.rewards'],
  ARRAY[]::text[],ARRAY['catalogue','stores','orders','epos','payments','loyalty','suppliers']),
 ('beauty.salon','Beauty & Salon','beauty','Salon/wellness package using shared bookings, commerce, CRM, loyalty and analytics with product-owned treatment workflows.','preview','built_main',
  ARRAY['omniqora.bookings','omniqora.commerce','omniqora.payments','omniqora.crm','omniqora.connect','omniqora.analytics','zoryn.rewards'],
  ARRAY[]::text[],ARRAY['appointments','epos','deposits','refunds','display','loyalty','staff_attribution']),
 ('automotive.marketplace','Automotive Marketplace','automotive','Vehicle marketplace package with listings, auctions/offers, bookings, payments, documents, CRM and geo.','preview','built_main',
  ARRAY['omniqora.marketplace','omniqora.marketplace-auctions','omniqora.marketplace-trust','omniqora.marketplace-growth','omniqora.bookings','omniqora.payments','omniqora.documents','omniqora.crm','omniqora.connect','omniqora.analytics','omniqora.geo'],
  ARRAY['vehicle.uk-data'],ARRAY['vehicle_listing','dealer','enquiry','offer','auction','reservation','inspection','syndication']),
 ('professional.marketplace','Professional Marketplace','professional-services','Provider discovery/matching, enquiries, quotes, bookings, reviews and CRM.','preview','built_main',
  ARRAY['omniqora.marketplace','omniqora.marketplace-matching','omniqora.marketplace-trust','omniqora.bookings','omniqora.crm','omniqora.connect','omniqora.documents','omniqora.analytics'],
  ARRAY[]::text[],ARRAY['providers','matching','enquiries','quotes','bookings','reviews'])
ON CONFLICT(package_key) DO UPDATE SET
 implementation_status=EXCLUDED.implementation_status,required_services=EXCLUDED.required_services,
 provider_requirements=EXCLUDED.provider_requirements,capabilities=EXCLUDED.capabilities,updated_at=now();

-- Product -> shared service defaults.
INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
 ('onyngo','omniqora.marketplace',true,true),
 ('onyngo','omniqora.marketplace-matching',true,false),
 ('onyngo','omniqora.marketplace-trust',true,false),
 ('onyngo','omniqora.marketplace-growth',true,false),
 ('onyngo','omniqora.commerce',true,false),
 ('onyngo','omniqora.bookings',true,false),
 ('onyngo','omniqora.payments',true,true),
 ('onyngo','omniqora.crm',true,false),
 ('onyngo','omniqora.connect',true,false),
 ('onyngo','omniqora.geo',true,false),
 ('onyngo','omniqora.dispatch',true,false),
 ('onyngo','omniqora.tracking',true,false),
 ('onyngo','omniqora.analytics',true,false),
 ('onyngo','omniqora.ai-router',true,false),
 ('onyngo','omniqora.webhooks',true,false),
 ('merqano','omniqora.marketplace',true,true),
 ('merqano','omniqora.commerce',true,true),
 ('merqano','omniqora.payments',true,true),
 ('merqano','omniqora.crm',true,false),
 ('merqano','omniqora.connect',true,false),
 ('merqano','omniqora.analytics',true,false),
 ('merqano','omniqora.ai-router',true,false),
 ('merqano','omniqora.webhooks',true,false),
 ('stylesync','omniqora.bookings',true,true),
 ('stylesync','omniqora.commerce',true,true),
 ('stylesync','omniqora.payments',true,true),
 ('stylesync','omniqora.crm',true,false),
 ('stylesync','omniqora.connect',true,false),
 ('stylesync','omniqora.analytics',true,false),
 ('stylesync','omniqora.device-observability',true,false),
 ('stylesync','omniqora.ai-router',true,false),
 ('stylesync','omniqora.webhooks',true,false),
 ('schonova','omniqora.bookings',true,true),
 ('schonova','omniqora.commerce',true,true),
 ('schonova','omniqora.commerce-fiscal',true,true),
 ('schonova','omniqora.payments',true,true),
 ('schonova','omniqora.crm',true,false),
 ('schonova','omniqora.connect',true,false),
 ('schonova','omniqora.analytics',true,false),
 ('schonova','omniqora.device-observability',true,false),
 ('schonova','omniqora.ai-router',true,false),
 ('schonova','omniqora.webhooks',true,false),
 ('zivvo','omniqora.marketplace',true,true),
 ('zivvo','omniqora.marketplace-auctions',true,false),
 ('zivvo','omniqora.marketplace-trust',true,false),
 ('zivvo','omniqora.marketplace-growth',true,false),
 ('zivvo','omniqora.bookings',true,false),
 ('zivvo','omniqora.payments',true,false),
 ('zivvo','omniqora.documents',true,false),
 ('zivvo','omniqora.crm',true,false),
 ('zivvo','omniqora.connect',true,false),
 ('zivvo','omniqora.geo',true,false),
 ('zivvo','omniqora.analytics',true,false),
 ('zivvo','omniqora.ai-router',true,false),
 ('zivvo','omniqora.webhooks',true,false),
 ('autohashi','omniqora.marketplace',true,true),
 ('autohashi','omniqora.marketplace-auctions',true,true),
 ('autohashi','omniqora.marketplace-trust',true,false),
 ('autohashi','omniqora.payments',true,false),
 ('autohashi','omniqora.documents',true,false),
 ('autohashi','omniqora.crm',true,false),
 ('autohashi','omniqora.connect',true,false),
 ('autohashi','omniqora.analytics',true,false),
 ('autohashi','omniqora.ai-router',true,false),
 ('autohashi','omniqora.webhooks',true,false),
 ('xpertjobs','omniqora.marketplace',true,true),
 ('xpertjobs','omniqora.marketplace-matching',true,true),
 ('xpertjobs','omniqora.marketplace-trust',true,false),
 ('xpertjobs','omniqora.crm',true,false),
 ('xpertjobs','omniqora.connect',true,false),
 ('xpertjobs','omniqora.sales',true,false),
 ('xpertjobs','omniqora.documents',true,false),
 ('xpertjobs','omniqora.ai-router',true,false),
 ('xpertjobs','omniqora.webhooks',true,false),
 ('lawquo','omniqora.marketplace',true,true),
 ('lawquo','omniqora.marketplace-matching',true,true),
 ('lawquo','omniqora.marketplace-trust',true,false),
 ('lawquo','omniqora.crm',true,false),
 ('lawquo','omniqora.connect',true,false),
 ('lawquo','omniqora.documents',true,false),
 ('lawquo','omniqora.ai-router',true,false),
 ('lawquo','omniqora.ai-actions',true,false),
 ('taxnuvia','omniqora.marketplace',true,true),
 ('taxnuvia','omniqora.marketplace-matching',true,true),
 ('taxnuvia','omniqora.marketplace-trust',true,false),
 ('taxnuvia','omniqora.bookings',true,false),
 ('taxnuvia','omniqora.crm',true,false),
 ('taxnuvia','omniqora.connect',true,false),
 ('haccora','omniqora.documents',true,false),
 ('haccora','omniqora.automation',true,false),
 ('haccora','omniqora.ai-router',true,false),
 ('haccora','omniqora.webhooks',true,false),
 ('iq-practice-cloud','omniqora.crm',true,false),
 ('iq-practice-cloud','omniqora.documents',true,false),
 ('iq-practice-cloud','omniqora.automation',true,false),
 ('iq-practice-cloud','omniqora.ai-router',true,false),
 ('iq-practice-cloud','omniqora.webhooks',true,false),
 ('dishbee','omniqora.commerce',false,false),
 ('dishbee','omniqora.ai-router',true,false),
 ('dishbee','omniqora.webhooks',true,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
 default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required;

-- Germany fiscal requirement for Schonova is explicit and remains provider-boundary until configured.
INSERT INTO public.product_provider_requirements(product_key,provider_key,required,purpose) VALUES
 ('schonova','fiscal.de-tse',true,'German EPOS fiscalisation adapter')
ON CONFLICT(product_key,provider_key) DO UPDATE SET required=true,purpose=EXCLUDED.purpose;

-- Blueprints.
INSERT INTO public.tenant_blueprints(blueprint_key,name,description,country_code,category) VALUES
 ('onyn-uk','OnýnGo · UK','Onýn marketplace with commerce, payments, customer/vendor CRM, communications and delivery-ready services.','GB','marketplace'),
 ('merqano-uk','Merqano Commerce · UK','Merqano commerce landlord for brands, suppliers and retail/DTC businesses.','GB','commerce'),
 ('dulcis-hybrid-uk','Dulcis · UK','Dulcis brand commerce through Merqano with Dishbee hospitality operations enabled where required.','GB','commerce'),
 ('stylesync-uk','StyleSync · UK','UK beauty/salon SaaS with bookings, shared EPOS, payments, CRM, loyalty and analytics.','GB','beauty'),
 ('schonova-de','Schonova · Germany','German beauty/wellness SaaS with bookings, shared EPOS, fiscal adapter, payments, CRM and analytics.','DE','beauty'),
 ('zivvo-uk','Zivvo · UK','UK automotive marketplace, dealer, auction/offer and booking foundation.','GB','automotive'),
 ('autohashi-global','Autohashi','Vehicle sourcing/import and auction marketplace foundation.','GB','automotive')
ON CONFLICT(blueprint_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,country_code=EXCLUDED.country_code,
 category=EXCLUDED.category,status='active';

INSERT INTO public.blueprint_products(blueprint_key,product_key,required) VALUES
 ('onyn-uk','onyngo',true),
 ('merqano-uk','merqano',true),
 ('dulcis-hybrid-uk','merqano',true),
 ('stylesync-uk','stylesync',true),
 ('schonova-de','schonova',true),
 ('zivvo-uk','zivvo',true),
 ('autohashi-global','autohashi',true)
ON CONFLICT DO NOTHING;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required) VALUES
 ('onyn-uk','omniqora.marketplace',true),('onyn-uk','omniqora.commerce',false),('onyn-uk','omniqora.payments',true),('onyn-uk','omniqora.crm',false),('onyn-uk','omniqora.connect',false),('onyn-uk','omniqora.analytics',false),('onyn-uk','omniqora.webhooks',false),
 ('merqano-uk','omniqora.marketplace',true),('merqano-uk','omniqora.commerce',true),('merqano-uk','omniqora.payments',true),('merqano-uk','omniqora.crm',false),('merqano-uk','omniqora.connect',false),('merqano-uk','omniqora.analytics',false),
 ('dulcis-hybrid-uk','omniqora.marketplace',true),('dulcis-hybrid-uk','omniqora.commerce',true),('dulcis-hybrid-uk','omniqora.payments',true),('dulcis-hybrid-uk','omniqora.crm',false),('dulcis-hybrid-uk','omniqora.connect',false),('dulcis-hybrid-uk','dishbee.epos',false),('dulcis-hybrid-uk','dishbee.kds',false),('dulcis-hybrid-uk','dishbee.delivery',false),('dulcis-hybrid-uk','zoryn.rewards',false),
 ('stylesync-uk','omniqora.bookings',true),('stylesync-uk','omniqora.commerce',true),('stylesync-uk','omniqora.payments',true),('stylesync-uk','omniqora.crm',false),('stylesync-uk','omniqora.connect',false),('stylesync-uk','omniqora.analytics',false),('stylesync-uk','zoryn.rewards',false),
 ('schonova-de','omniqora.bookings',true),('schonova-de','omniqora.commerce',true),('schonova-de','omniqora.commerce-fiscal',true),('schonova-de','omniqora.payments',true),('schonova-de','omniqora.crm',false),('schonova-de','omniqora.connect',false),('schonova-de','omniqora.analytics',false),
 ('zivvo-uk','omniqora.marketplace',true),('zivvo-uk','omniqora.marketplace-auctions',false),('zivvo-uk','omniqora.marketplace-trust',false),('zivvo-uk','omniqora.bookings',false),('zivvo-uk','omniqora.documents',false),('zivvo-uk','omniqora.crm',false),('zivvo-uk','omniqora.analytics',false),
 ('autohashi-global','omniqora.marketplace',true),('autohashi-global','omniqora.marketplace-auctions',true),('autohashi-global','omniqora.documents',false),('autohashi-global','omniqora.crm',false),('autohashi-global','omniqora.ai-router',false)
ON CONFLICT DO NOTHING;

-- Add-on offers surfaced by SaaS Factory. Enabling an offer never copies another product database.
INSERT INTO public.ecosystem_addon_offers(
 addon_key,name,category,target_product_key,target_service_key,description,countries,launch_mode,default_recommended,status
) VALUES
 ('haccora','Haccora Compliance','compliance','haccora',NULL,'Food-safety, evidence and compliance operations.',ARRAY['GB','DE'],'product',true,'active'),
 ('accounts','Accounts / IQ Practice Cloud','accounting','iq-practice-cloud',NULL,'Bookkeeping, accounting, payroll and finance operations.',ARRAY['GB','DE'],'product',true,'active'),
 ('xpertjobs','XpertJobs','workforce','xpertjobs',NULL,'Recruitment, job marketplace and workforce acquisition.',ARRAY['GB','DE'],'product',true,'active'),
 ('lawquo','Lawquo','legal','lawquo',NULL,'Legal triage and professional-services marketplace.',ARRAY['GB'],'product',false,'active'),
 ('onyngo','OnýnGo Marketplace','marketplace','onyngo',NULL,'Consumer marketplace/channel presence and local-commerce acquisition.',ARRAY['GB'],'product',false,'active'),
 ('zoryn-rewards','Zoryn Rewards','loyalty','zoryn-rewards',NULL,'Shared loyalty, rewards and customer incentives.',ARRAY['GB','DE'],'product',true,'active'),
 ('courier-connect','Courier Connect','delivery','courier-connect',NULL,'Courier aggregation and delivery operations.',ARRAY['GB'],'product',false,'active'),
 ('taxnuvia','TaxNuvia','accounting','taxnuvia',NULL,'Accountant discovery and matching marketplace.',ARRAY['GB'],'product',false,'active'),
 ('dishbee','Dishbee Hospitality','hospitality','dishbee',NULL,'Restaurant, kitchen, EPOS, KDS, ordering and hospitality operations.',ARRAY['GB','DE'],'product',false,'active'),
 ('marketplace-full','Marketplace Core','marketplace',NULL,'omniqora.marketplace','Reusable marketplace foundation.',ARRAY[]::text[],'service',false,'active'),
 ('commerce-epos','Commerce / EPOS Core','commerce',NULL,'omniqora.commerce','Reusable EPOS/commerce transaction core.',ARRAY[]::text[],'service',false,'active')
ON CONFLICT(addon_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,status='active',updated_at=now();

INSERT INTO public.ecosystem_product_addons(source_product_key,addon_key,sort_order) VALUES
 ('dishbee','haccora',10),('dishbee','accounts',20),('dishbee','xpertjobs',30),('dishbee','lawquo',40),('dishbee','onyngo',50),('dishbee','zoryn-rewards',60),('dishbee','courier-connect',70),
 ('merqano','accounts',10),('merqano','xpertjobs',20),('merqano','lawquo',30),('merqano','zoryn-rewards',40),('merqano','courier-connect',50),('merqano','haccora',60),('merqano','dishbee',70),
 ('stylesync','accounts',10),('stylesync','xpertjobs',20),('stylesync','lawquo',30),('stylesync','zoryn-rewards',40),
 ('schonova','accounts',10),('schonova','xpertjobs',20),('schonova','zoryn-rewards',30),
 ('onyngo','dishbee',10),('onyngo','haccora',20),('onyngo','accounts',30),('onyngo','xpertjobs',40),('onyngo','zoryn-rewards',50),
 ('zivvo','accounts',10),('zivvo','lawquo',20),('zivvo','xpertjobs',30),
 ('autohashi','accounts',10),('autohashi','lawquo',20),('autohashi','courier-connect',30),
 ('taxnuvia','accounts',10),('lawquo','accounts',10),('xpertjobs','accounts',10)
ON CONFLICT(source_product_key,addon_key) DO UPDATE SET sort_order=EXCLUDED.sort_order;


-- Every active product may opt into the governed AI router and signed webhook hub without bespoke wiring.
INSERT INTO public.product_services(product_key,service_key,default_enabled,required)
SELECT p.product_key,s.service_key,false,false
FROM public.product_catalogue p
CROSS JOIN (VALUES('omniqora.ai-router'),('omniqora.webhooks')) s(service_key)
WHERE p.status='active' AND p.product_key<>'omniqora'
ON CONFLICT(product_key,service_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ecosystem_enable_addon(
 _tenant uuid,_source_product text,_addon text,_config jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.ecosystem_addon_offers%rowtype;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Ecosystem add-on access denied';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_source_product AND status<>'cancelled') THEN
  RAISE EXCEPTION 'Source product is not enabled';
 END IF;
 SELECT * INTO a FROM public.ecosystem_addon_offers WHERE addon_key=_addon AND status IN('active','preview');
 IF NOT FOUND THEN RAISE EXCEPTION 'Add-on not found';END IF;

 IF a.target_product_key IS NOT NULL THEN
  INSERT INTO public.tenant_products(tenant_id,product_key,status,config)
  VALUES(_tenant,a.target_product_key,'requested',coalesce(_config,'{}'::jsonb))
  ON CONFLICT(tenant_id,product_key) DO UPDATE SET
    status=CASE WHEN public.tenant_products.status='active' THEN 'active' ELSE 'requested' END,
    config=public.tenant_products.config||EXCLUDED.config,updated_at=now();
  INSERT INTO public.tenant_product_relationships(tenant_id,parent_product_key,child_product_key,relation_type,status,config)
  VALUES(_tenant,_source_product,a.target_product_key,'addon','requested',coalesce(_config,'{}'::jsonb))
  ON CONFLICT(tenant_id,parent_product_key,child_product_key,relation_type) DO UPDATE SET
    status='requested',config=EXCLUDED.config,updated_at=now();
  PERFORM public.queue_provisioning(_tenant,'product',a.target_product_key,'provision',coalesce(_config,'{}'::jsonb));
 END IF;

 IF a.target_service_key IS NOT NULL THEN
  INSERT INTO public.tenant_services(tenant_id,service_key,status,source,config)
  VALUES(_tenant,a.target_service_key,'requested','ecosystem-addon',coalesce(_config,'{}'::jsonb))
  ON CONFLICT(tenant_id,service_key) DO UPDATE SET
    status=CASE WHEN public.tenant_services.status IN('active','trial') THEN public.tenant_services.status ELSE 'requested' END,
    source='ecosystem-addon',config=public.tenant_services.config||EXCLUDED.config,updated_at=now();
  PERFORM public.queue_provisioning(_tenant,'service',a.target_service_key,'provision',coalesce(_config,'{}'::jsonb));
 END IF;
END;$$;
REVOKE ALL ON FUNCTION public.ecosystem_enable_addon(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ecosystem_enable_addon(uuid,text,text,jsonb) TO authenticated,service_role;

COMMIT;