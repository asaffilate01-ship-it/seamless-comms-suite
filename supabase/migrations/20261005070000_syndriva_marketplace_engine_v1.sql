BEGIN;

-- Syndriva Marketplace Engine v1
-- Orchestration layer over the existing Omniqora marketplace/commerce primitives.
-- The goal is configuration-driven marketplace instantiation without duplicating vertical code.

CREATE TABLE IF NOT EXISTS public.syndriva_capability_catalogue(
 capability_key text PRIMARY KEY,
 name text NOT NULL,
 family text NOT NULL,
 description text NOT NULL,
 requires text[] NOT NULL DEFAULT '{}',
 default_config jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.syndriva_marketplace_templates(
 template_key text PRIMARY KEY,
 name text NOT NULL,
 description text NOT NULL,
 marketplace_modes text[] NOT NULL DEFAULT '{}',
 capabilities text[] NOT NULL DEFAULT '{}',
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.syndriva_marketplaces(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE SET NULL,
 template_key text REFERENCES public.syndriva_marketplace_templates(template_key) ON DELETE SET NULL,
 marketplace_key text NOT NULL,
 name text NOT NULL,
 slug text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','provisioning','active','paused','suspended','retired')),
 marketplace_modes text[] NOT NULL DEFAULT '{}',
 seller_model text NOT NULL DEFAULT 'multi_seller'
   CHECK(seller_model IN('single_brand','single_seller','multi_seller','peer_to_peer')),
 branch_model text NOT NULL DEFAULT 'multi_branch'
   CHECK(branch_model IN('single_branch','multi_branch','not_applicable')),
 default_currency text NOT NULL DEFAULT 'GBP' CHECK(default_currency ~ '^[A-Z]{3}$'),
 default_country text,
 default_timezone text,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,marketplace_key),
 UNIQUE(tenant_id,slug)
);

CREATE TABLE IF NOT EXISTS public.syndriva_marketplace_capabilities(
 marketplace_id uuid NOT NULL REFERENCES public.syndriva_marketplaces(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 capability_key text NOT NULL REFERENCES public.syndriva_capability_catalogue(capability_key) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT true,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 source text NOT NULL DEFAULT 'template' CHECK(source IN('template','operator','vertical','system')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(marketplace_id,capability_key)
);

CREATE TABLE IF NOT EXISTS public.syndriva_marketplace_connections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 marketplace_id uuid NOT NULL REFERENCES public.syndriva_marketplaces(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 connection_type text NOT NULL CHECK(connection_type IN(
   'omniqora','payments','dispatch','geo','crm','messaging','analytics','webhooks',
   'vertical','inventory','accounting','identity','other'
 )),
 provider_key text,
 external_ref text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','connected','degraded','failed','disabled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 health jsonb NOT NULL DEFAULT '{}'::jsonb,
 last_checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.syndriva_capability_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syndriva_marketplace_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syndriva_marketplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syndriva_marketplace_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.syndriva_marketplace_connections ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.syndriva_capability_catalogue, public.syndriva_marketplace_templates TO authenticated;
GRANT ALL ON public.syndriva_capability_catalogue, public.syndriva_marketplace_templates TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.syndriva_marketplaces, public.syndriva_marketplace_capabilities, public.syndriva_marketplace_connections TO authenticated;
GRANT ALL ON public.syndriva_marketplaces, public.syndriva_marketplace_capabilities, public.syndriva_marketplace_connections TO service_role;

CREATE POLICY "syndriva capability read" ON public.syndriva_capability_catalogue
 FOR SELECT TO authenticated USING(status<>'retired');
CREATE POLICY "syndriva template read" ON public.syndriva_marketplace_templates
 FOR SELECT TO authenticated USING(status<>'retired');
CREATE POLICY "syndriva marketplace read" ON public.syndriva_marketplaces
 FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "syndriva marketplace write" ON public.syndriva_marketplaces
 FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()));
CREATE POLICY "syndriva capability instance read" ON public.syndriva_marketplace_capabilities
 FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "syndriva capability instance write" ON public.syndriva_marketplace_capabilities
 FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()));
CREATE POLICY "syndriva connection read" ON public.syndriva_marketplace_connections
 FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "syndriva connection write" ON public.syndriva_marketplace_connections
 FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()));

INSERT INTO public.syndriva_capability_catalogue(capability_key,name,family,description,requires) VALUES
('vendors','Vendors','supply','Seller/provider onboarding, profiles, verification and membership.','{}'),
('branches','Branches','supply','Multi-location seller/branch hierarchy.','{vendors}'),
('listings','Listings','catalogue','Reusable product, service and offer listings.','{vendors}'),
('catalogue','Catalogue','catalogue','Categories, shared catalogue and listing classification.','{listings}'),
('inventory','Inventory','supply','Stock locations, balances, reservations and movements.','{listings}'),
('availability','Availability','supply','Capacity, schedules and listing/resource availability.','{listings}'),
('search','Search & Filters','discovery','Marketplace search, facets, filters and saved discovery.','{listings}'),
('orders','Orders','transactions','Cart/order lifecycle and multi-vendor settlement calculation.','{listings}'),
('bookings','Bookings','transactions','Bookable services, resources, slots and reservations.','{availability}'),
('rfq','RFQ & Quotes','transactions','Requests, matching, quotes and acceptance workflows.','{vendors}'),
('auctions','Auctions & Offers','transactions','Offers, bids, auctions and tender-style selling.','{listings}'),
('rentals','Rentals','transactions','Rental-mode listing and transaction configuration.','{availability,payments}'),
('subscriptions','Subscriptions','commercial','Vendor/customer marketplace plans and recurring commercial models.','{}'),
('pricing','Pricing','commercial','Configurable price, fee and commercial rules.','{listings}'),
('commission','Commission','commercial','Marketplace/vendor commission calculation and settlement rules.','{orders}'),
('payments','Payments','money','Payment intents, refunds and provider abstraction.','{}'),
('payouts','Payouts','money','Vendor settlement and payout orchestration.','{payments,commission}'),
('delivery','Delivery','fulfilment','Delivery/collection fulfilment and broker/dispatch integration.','{orders}'),
('reviews','Reviews','trust','Ratings, verified reviews and seller replies.','{}'),
('disputes','Disputes','trust','Buyer/vendor dispute and evidence workflow.','{}'),
('promotions','Promotions','growth','Marketplace promotions, credits and campaign rules.','{pricing}'),
('messaging','Messaging','engagement','Buyer/vendor messaging and channel hooks.','{}'),
('omniqora_ai','Omniqora AI','intelligence','AI routing, recommendations and governed action hooks.','{}'),
('omniqora_automation','Omniqora Automation','intelligence','Event-driven journeys, notifications and operational automation.','{}'),
('geo','Geo','fulfilment','Coverage, routing, ETA, location and geospatial capabilities.','{}'),
('dispatch','Dispatch','fulfilment','Jobs, agents, vehicles, assignment and tracking.','{geo}'),
('white_label','White Label','experience','Brand, domain, theme and channel configuration.','{}'),
('vendor_app','Vendor App','experience','Capability-driven seller/operator workspace.','{vendors}'),
('customer_app','Customer App','experience','Capability-driven customer web/PWA/app experience.','{}'),
('webhooks','Webhooks','integrations','Signed event delivery, retry and integration hooks.','{}'),
('analytics','Analytics','intelligence','Marketplace operational, commercial and conversion analytics.','{}')
ON CONFLICT(capability_key) DO UPDATE SET
 name=EXCLUDED.name,family=EXCLUDED.family,description=EXCLUDED.description,requires=EXCLUDED.requires,status='active',updated_at=now();

INSERT INTO public.syndriva_marketplace_templates(template_key,name,description,marketplace_modes,capabilities,config) VALUES
('products','Product Marketplace','Multi-seller product marketplace with catalogue, stock, checkout and fulfilment.',
 '{products}','{vendors,branches,listings,catalogue,inventory,search,orders,pricing,commission,payments,payouts,delivery,reviews,disputes,promotions,messaging,white_label,vendor_app,customer_app,webhooks,analytics,omniqora_ai,omniqora_automation}','{}'),
('services','Service Marketplace','Provider marketplace for services, requests, bookings and payments.',
 '{services}','{vendors,branches,listings,catalogue,availability,search,bookings,pricing,commission,payments,payouts,reviews,disputes,messaging,white_label,vendor_app,customer_app,webhooks,analytics,omniqora_ai,omniqora_automation}','{}'),
('bookings','Booking Marketplace','Availability-first marketplace for appointments, capacity and reservations.',
 '{bookings}','{vendors,listings,catalogue,availability,search,bookings,pricing,payments,reviews,messaging,white_label,vendor_app,customer_app,analytics,omniqora_automation}','{}'),
('delivery','Delivery Marketplace','Marketplace with ordering, geo, dispatch, tracking and fulfilment.',
 '{products,delivery}','{vendors,branches,listings,catalogue,inventory,search,orders,pricing,commission,payments,payouts,delivery,geo,dispatch,reviews,messaging,white_label,vendor_app,customer_app,webhooks,analytics,omniqora_ai,omniqora_automation}','{}'),
('consultations','Consultation Marketplace','Professional consultation discovery, availability and booking.',
 '{consultations}','{vendors,listings,catalogue,availability,search,bookings,pricing,payments,reviews,messaging,white_label,vendor_app,customer_app,analytics,omniqora_ai}','{}'),
('freelancer','Freelancer Marketplace','Project/RFQ marketplace for professionals and service providers.',
 '{freelancer,services}','{vendors,listings,catalogue,search,rfq,pricing,commission,payments,payouts,reviews,disputes,messaging,white_label,vendor_app,customer_app,webhooks,analytics,omniqora_ai,omniqora_automation}','{}'),
('rental','Rental Marketplace','Inventory/availability-led rentals with booking, payment and fulfilment.',
 '{rental}','{vendors,branches,listings,catalogue,inventory,availability,search,bookings,rentals,pricing,commission,payments,payouts,delivery,reviews,disputes,messaging,white_label,vendor_app,customer_app,analytics}','{}'),
('peer-to-peer','Peer-to-Peer Marketplace','P2P listings, transactions, payments, reviews and disputes.',
 '{peer_to_peer}','{vendors,listings,catalogue,search,orders,pricing,commission,payments,payouts,reviews,disputes,messaging,white_label,customer_app,webhooks,analytics}','{}'),
('rfq','RFQ Marketplace','Buyer request, matching, supplier quote and conversion workflow.',
 '{rfq,services}','{vendors,branches,listings,catalogue,search,rfq,pricing,commission,payments,payouts,delivery,reviews,disputes,messaging,white_label,vendor_app,customer_app,webhooks,analytics,omniqora_ai,omniqora_automation}','{}'),
('hybrid','Hybrid Marketplace','Composable marketplace starter with common marketplace primitives enabled.',
 '{products,services,bookings}','{vendors,branches,listings,catalogue,inventory,availability,search,orders,bookings,rfq,pricing,commission,payments,payouts,delivery,reviews,disputes,promotions,messaging,white_label,vendor_app,customer_app,webhooks,analytics,omniqora_ai,omniqora_automation}','{}')
ON CONFLICT(template_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,marketplace_modes=EXCLUDED.marketplace_modes,
 capabilities=EXCLUDED.capabilities,config=EXCLUDED.config,status='active',updated_at=now();

CREATE OR REPLACE FUNCTION public.syndriva_create_marketplace(
 _tenant uuid,
 _product text,
 _name text,
 _slug text,
 _template text DEFAULT 'hybrid',
 _marketplace_key text DEFAULT NULL,
 _brand uuid DEFAULT NULL,
 _config jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  mid uuid;
  tmpl public.syndriva_marketplace_templates%rowtype;
  cap text;
  key_value text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(_tenant,auth.uid()) THEN
    RAISE EXCEPTION 'Syndriva marketplace access denied';
  END IF;
  SELECT * INTO tmpl FROM public.syndriva_marketplace_templates WHERE template_key=_template AND status<>'retired';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Syndriva marketplace template: %',_template; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key=_product) THEN
    RAISE EXCEPTION 'Unknown product: %',_product;
  END IF;
  key_value:=COALESCE(NULLIF(_marketplace_key,''),_product||':'||_slug);
  INSERT INTO public.syndriva_marketplaces(
    tenant_id,product_key,brand_id,template_key,marketplace_key,name,slug,status,marketplace_modes,
    seller_model,branch_model,default_currency,default_country,default_timezone,config
  )
  SELECT _tenant,_product,_brand,_template,key_value,_name,_slug,'provisioning',tmpl.marketplace_modes,
         COALESCE(_config->>'seller_model','multi_seller'),
         COALESCE(_config->>'branch_model','multi_branch'),
         COALESCE(_config->>'currency',t.currency),
         COALESCE(_config->>'country',t.country_code),
         COALESCE(_config->>'timezone',t.timezone),
         _config
  FROM public.tenants t WHERE t.id=_tenant
  ON CONFLICT(tenant_id,marketplace_key) DO UPDATE SET
    name=EXCLUDED.name,slug=EXCLUDED.slug,template_key=EXCLUDED.template_key,
    marketplace_modes=EXCLUDED.marketplace_modes,config=EXCLUDED.config,updated_at=now()
  RETURNING id INTO mid;

  FOREACH cap IN ARRAY tmpl.capabilities LOOP
    INSERT INTO public.syndriva_marketplace_capabilities(marketplace_id,tenant_id,capability_key,enabled,source)
    VALUES(mid,_tenant,cap,true,'template')
    ON CONFLICT(marketplace_id,capability_key) DO UPDATE SET enabled=true,source='template',updated_at=now();
  END LOOP;

  INSERT INTO public.syndriva_marketplace_connections(marketplace_id,tenant_id,connection_type,provider_key,status,config)
  VALUES(mid,_tenant,'omniqora','omniqora','connected',jsonb_build_object('eventDriven',true))
  ON CONFLICT DO NOTHING;

  UPDATE public.syndriva_marketplaces SET status='active',updated_at=now() WHERE id=mid;
  RETURN mid;
END;$$;

CREATE OR REPLACE FUNCTION public.syndriva_set_capability(
 _marketplace uuid,
 _capability text,
 _enabled boolean,
 _config jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tid uuid;
BEGIN
 SELECT tenant_id INTO tid FROM public.syndriva_marketplaces WHERE id=_marketplace;
 IF tid IS NULL THEN RAISE EXCEPTION 'Marketplace not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(tid,auth.uid()) THEN
   RAISE EXCEPTION 'Syndriva marketplace access denied';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.syndriva_capability_catalogue WHERE capability_key=_capability AND status<>'retired') THEN
   RAISE EXCEPTION 'Unknown Syndriva capability: %',_capability;
 END IF;
 INSERT INTO public.syndriva_marketplace_capabilities(marketplace_id,tenant_id,capability_key,enabled,config,source)
 VALUES(_marketplace,tid,_capability,_enabled,_config,'operator')
 ON CONFLICT(marketplace_id,capability_key) DO UPDATE SET
   enabled=EXCLUDED.enabled,config=EXCLUDED.config,source='operator',updated_at=now();
END;$$;

GRANT EXECUTE ON FUNCTION public.syndriva_create_marketplace(uuid,text,text,text,text,text,uuid,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.syndriva_set_capability(uuid,text,boolean,jsonb) TO authenticated,service_role;

COMMIT;
