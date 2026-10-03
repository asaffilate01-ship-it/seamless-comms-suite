BEGIN;

-- Shared SaaS Factory commerce/marketplace packages.
-- Product-specific workflow/data remains in the vertical product; these are reusable primitives.

INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status) VALUES
('onyngo','OnynGo','Multi-vertical consumer marketplace and local commerce aggregator.','marketplace','external','active'),
('stylesync','StyleSync','UK beauty and salon marketplace/SaaS.','beauty','external','active'),
('schonova','Schonova','Germany beauty, wellness and fitness marketplace/SaaS.','beauty','external','active'),
('merqano','Merqano','Multi-tenant direct commerce and storefront engine.','commerce','external','active'),
('dulcis','Dulcis','Patisserie and direct-commerce brand powered by Merqano with optional Dishbee hospitality operations.','commerce','external','active'),
('xpertjobs','XpertJobs','Jobs, recruitment and sponsor intelligence marketplace.','marketplace','external','active'),
('autohashi','Autohashi','Japanese auction, vehicle import and automotive marketplace workflow.','automotive','external','active')
ON CONFLICT(product_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,category=EXCLUDED.category,
 deployment_mode=EXCLUDED.deployment_mode,status=EXCLUDED.status,updated_at=now();

CREATE TABLE IF NOT EXISTS public.marketplace_vendor_profiles(
 vendor_id uuid PRIMARY KEY REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 vendor_type text NOT NULL DEFAULT 'merchant'
   CHECK(vendor_type IN('merchant','restaurant','retailer','professional','employer','agency','dealer','auction_house','supplier','service_provider')),
 public_slug text,
 legal_name text,
 verification_status text NOT NULL DEFAULT 'unverified'
   CHECK(verification_status IN('unverified','pending','verified','rejected','suspended')),
 service_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
 opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
 capabilities text[] NOT NULL DEFAULT '{}',
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_vendor_profile_slug_uq
 ON public.marketplace_vendor_profiles(tenant_id,public_slug) WHERE public_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.marketplace_categories(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 parent_id uuid REFERENCES public.marketplace_categories(id) ON DELETE SET NULL,
 category_key text NOT NULL,
 name text NOT NULL,
 listing_type text,
 sort_order integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(tenant_id,product_key,category_key)
);

CREATE TABLE IF NOT EXISTS public.marketplace_listing_categories(
 listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 category_id uuid NOT NULL REFERENCES public.marketplace_categories(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 PRIMARY KEY(listing_id,category_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_enquiries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE SET NULL,
 buyer_ref text NOT NULL,
 enquiry_type text NOT NULL DEFAULT 'general'
   CHECK(enquiry_type IN('general','quote','availability','finance','part_exchange','inspection','legal','recruitment','service_request')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','responded','qualified','won','lost','closed')),
 subject text,
 message text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_offers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 enquiry_id uuid REFERENCES public.marketplace_enquiries(id) ON DELETE SET NULL,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE SET NULL,
 buyer_ref text NOT NULL,
 offer_type text NOT NULL DEFAULT 'offer'
   CHECK(offer_type IN('offer','quote','counter','bid','proposal')),
 amount_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'open'
   CHECK(status IN('open','accepted','rejected','countered','withdrawn','expired','won','lost')),
 expires_at timestamptz,
 terms jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_auctions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE RESTRICT,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 reserve_minor bigint,
 starting_minor bigint NOT NULL DEFAULT 0,
 bid_increment_minor bigint NOT NULL DEFAULT 100,
 currency text NOT NULL DEFAULT 'GBP',
 status text NOT NULL DEFAULT 'scheduled'
   CHECK(status IN('scheduled','live','ended','cancelled','settled')),
 winner_offer_id uuid REFERENCES public.marketplace_offers(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at)
);

CREATE TABLE IF NOT EXISTS public.marketplace_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
 order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
 author_ref text NOT NULL,
 rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5),
 title text,
 body text,
 status text NOT NULL DEFAULT 'published' CHECK(status IN('pending','published','hidden','removed')),
 verified_purchase boolean NOT NULL DEFAULT false,
 response text,
 responded_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_disputes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE SET NULL,
 opened_by_ref text NOT NULL,
 dispute_type text NOT NULL,
 status text NOT NULL DEFAULT 'open'
   CHECK(status IN('open','investigating','awaiting_party','resolved','rejected','closed')),
 amount_minor bigint,
 currency text,
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 resolution jsonb NOT NULL DEFAULT '{}'::jsonb,
 opened_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.marketplace_saved_searches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 owner_ref text NOT NULL,
 name text NOT NULL,
 query jsonb NOT NULL,
 alert_channels text[] NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT true,
 last_matched_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_promotions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 promotion_type text NOT NULL CHECK(promotion_type IN('featured','boost','sponsored','discount','voucher','banner')),
 starts_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz,
 budget_minor bigint,
 currency text,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('draft','scheduled','active','paused','completed','cancelled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_vendor_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 plan_key text NOT NULL,
 name text NOT NULL,
 recurring_minor bigint NOT NULL DEFAULT 0,
 currency text NOT NULL DEFAULT 'GBP',
 interval text NOT NULL DEFAULT 'month' CHECK(interval IN('month','year')),
 commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 10000),
 listing_limit integer,
 features text[] NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,product_key,plan_key)
);

CREATE TABLE IF NOT EXISTS public.marketplace_vendor_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 plan_id uuid NOT NULL REFERENCES public.marketplace_vendor_plans(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('trial','active','past_due','suspended','cancelled')),
 starts_at timestamptz NOT NULL DEFAULT now(),
 renews_at timestamptz,
 external_billing_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Generic EPOS/commerce core shared by hospitality, beauty, retail and marketplace vendor apps.
CREATE TABLE IF NOT EXISTS public.commerce_registers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
 register_key text NOT NULL,
 name text NOT NULL,
 vertical_profile text NOT NULL DEFAULT 'retail'
   CHECK(vertical_profile IN('retail','hospitality','beauty','marketplace_vendor','automotive','services')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(tenant_id,product_key,register_key)
);

CREATE TABLE IF NOT EXISTS public.commerce_register_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 register_id uuid NOT NULL REFERENCES public.commerce_registers(id) ON DELETE CASCADE,
 opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 opened_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 opening_float_minor bigint NOT NULL DEFAULT 0,
 expected_cash_minor bigint,
 counted_cash_minor bigint,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closed','review')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_register_one_open_session_uq
 ON public.commerce_register_sessions(register_id) WHERE status='open';

CREATE TABLE IF NOT EXISTS public.commerce_sales(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 register_id uuid REFERENCES public.commerce_registers(id) ON DELETE SET NULL,
 session_id uuid REFERENCES public.commerce_register_sessions(id) ON DELETE SET NULL,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 external_ref text,
 customer_ref text,
 sale_type text NOT NULL DEFAULT 'sale' CHECK(sale_type IN('sale','refund','void','adjustment')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','payment_pending','paid','part_refunded','refunded','voided','failed')),
 currency text NOT NULL DEFAULT 'GBP',
 subtotal_minor bigint NOT NULL DEFAULT 0,
 tax_minor bigint NOT NULL DEFAULT 0,
 discount_minor bigint NOT NULL DEFAULT 0,
 tip_minor bigint NOT NULL DEFAULT 0,
 total_minor bigint NOT NULL DEFAULT 0,
 vertical_context jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 paid_at timestamptz,
 UNIQUE(tenant_id,product_key,external_ref)
);

CREATE TABLE IF NOT EXISTS public.commerce_sale_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 item_ref text NOT NULL,
 item_type text NOT NULL DEFAULT 'item'
   CHECK(item_type IN('item','service','booking','package','membership','vehicle','fee','discount')),
 title text NOT NULL,
 quantity numeric NOT NULL CHECK(quantity>0),
 unit_minor bigint NOT NULL,
 tax_minor bigint NOT NULL DEFAULT 0,
 discount_minor bigint NOT NULL DEFAULT 0,
 total_minor bigint NOT NULL,
 staff_ref text,
 modifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.commerce_tenders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 tender_type text NOT NULL CHECK(tender_type IN('cash','card','wallet','gift_card','bank','payment_link','other')),
 provider_key text,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','authorised','captured','failed','cancelled','refunded')),
 external_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_refunds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 reason text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','processing','succeeded','failed','cancelled')),
 authorised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 provider_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 receipt_number text NOT NULL,
 receipt_type text NOT NULL DEFAULT 'sale' CHECK(receipt_type IN('sale','refund','void','fiscal')),
 rendered jsonb NOT NULL DEFAULT '{}'::jsonb,
 issued_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,receipt_number)
);

CREATE TABLE IF NOT EXISTS public.commerce_devices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
 register_id uuid REFERENCES public.commerce_registers(id) ON DELETE SET NULL,
 device_type text NOT NULL CHECK(device_type IN('pos','payment_terminal','tap_to_pay','customer_display','printer','scanner','cash_drawer','kiosk')),
 provider_key text,
 external_ref text,
 name text,
 status text NOT NULL DEFAULT 'unknown' CHECK(status IN('unknown','online','degraded','offline','disabled')),
 offline_capable boolean NOT NULL DEFAULT false,
 last_seen_at timestamptz,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.commerce_offline_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 device_id uuid REFERENCES public.commerce_devices(id) ON DELETE SET NULL,
 client_event_id text NOT NULL,
 event_type text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'received' CHECK(status IN('received','processed','rejected')),
 received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 UNIQUE(tenant_id,product_key,client_event_id)
);

CREATE TABLE IF NOT EXISTS public.commerce_fiscal_adapters(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
 jurisdiction text NOT NULL,
 adapter_key text NOT NULL,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','testing','active','disabled')),
 provider_ref text,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(tenant_id,product_key,location_id,jurisdiction)
);

-- AI provider/model routing and governed action approvals.
CREATE TABLE IF NOT EXISTS public.ai_model_catalogue(
 model_key text PRIMARY KEY,
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE CASCADE,
 model_name text NOT NULL,
 capabilities text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','retired')),
 pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.ai_routing_policies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 use_case text NOT NULL,
 preferred_models text[] NOT NULL DEFAULT '{}',
 fallback_models text[] NOT NULL DEFAULT '{}',
 max_cost_minor bigint,
 require_human_approval boolean NOT NULL DEFAULT false,
 data_classification text NOT NULL DEFAULT 'internal',
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(tenant_id,product_key,use_case)
);
CREATE TABLE IF NOT EXISTS public.ai_action_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 use_case text NOT NULL,
 subject_type text,
 subject_ref text,
 action_key text NOT NULL,
 proposed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 risk_level text NOT NULL DEFAULT 'low' CHECK(risk_level IN('low','medium','high')),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','approved','rejected','executed','failed','expired')),
 requested_by text,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 execution_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- General signed webhooks, retries and health.
CREATE TABLE IF NOT EXISTS public.webhook_endpoints(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 url text NOT NULL,
 secret_ref text NOT NULL,
 event_patterns text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','disabled')),
 timeout_ms integer NOT NULL DEFAULT 10000,
 max_attempts integer NOT NULL DEFAULT 8,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 health jsonb NOT NULL DEFAULT '{}'::jsonb,
 last_success_at timestamptz,
 last_failure_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.webhook_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 event_id uuid REFERENCES public.platform_events(id) ON DELETE SET NULL,
 event_type text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','succeeded','failed','dead_letter')),
 attempts integer NOT NULL DEFAULT 0,
 response_status integer,
 response_body text,
 last_error text,
 available_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_delivery_queue_idx ON public.webhook_deliveries(status,available_at,created_at);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY[
  'marketplace_vendor_profiles','marketplace_categories','marketplace_listing_categories','marketplace_enquiries',
  'marketplace_offers','marketplace_auctions','marketplace_reviews','marketplace_disputes','marketplace_saved_searches',
  'marketplace_promotions','marketplace_vendor_plans','marketplace_vendor_subscriptions',
  'commerce_registers','commerce_register_sessions','commerce_sales','commerce_sale_lines','commerce_tenders',
  'commerce_refunds','commerce_receipts','commerce_devices','commerce_offline_events','commerce_fiscal_adapters',
  'ai_routing_policies','ai_action_requests','webhook_endpoints','webhook_deliveries'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','suite core read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','suite core write',t);
 END LOOP;
END $$;
ALTER TABLE public.ai_model_catalogue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ai_model_catalogue TO authenticated;
GRANT ALL ON public.ai_model_catalogue TO service_role;
CREATE POLICY "ai model catalogue read" ON public.ai_model_catalogue FOR SELECT TO authenticated USING(status<>'retired');

INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status) VALUES
('omniqora.commerce-epos','Commerce & EPOS Core','Shared register, sale, tender, refund, receipt, device and offline-sync primitives for vertical SaaS products.','commerce','omniqora',true,'automatic','active'),
('omniqora.marketplace-auctions','Marketplace Auctions & Offers','Reusable enquiries, quotes, offers, bids, auctions and settlement hooks.','marketplace','omniqora',true,'automatic','active'),
('omniqora.marketplace-trust','Marketplace Trust','Reusable reviews, disputes and vendor verification primitives.','marketplace','omniqora',true,'automatic','active'),
('omniqora.marketplace-growth','Marketplace Growth','Vendor subscriptions, promoted listings, saved searches and alerts.','marketplace','omniqora',true,'automatic','active'),
('omniqora.ai-routing','AI Routing & Approvals','Provider/model routing, cost policy and governed action approvals across products.','ai','omniqora',true,'automatic','active'),
('omniqora.webhooks','Webhook Hub','Signed event webhooks, retries, dead-letter handling and connector health.','integrations','omniqora',true,'automatic','active'),
('merqano.commerce','Merqano Commerce','Multi-tenant direct-commerce/storefront capability for D2C and retail brands.','commerce','merqano',true,'external','active')
ON CONFLICT(service_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,owner_product_key=EXCLUDED.owner_product_key,status='active',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
('omniqora.commerce-epos','omniqora.payments'),
('omniqora.marketplace-auctions','omniqora.marketplace'),
('omniqora.marketplace-trust','omniqora.marketplace'),
('omniqora.marketplace-growth','omniqora.marketplace'),
('omniqora.ai-routing','omniqora.ai'),
('omniqora.webhooks','omniqora.analytics'),
('merqano.commerce','omniqora.payments')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('onyngo','omniqora.marketplace',true,true),('onyngo','omniqora.payments',true,true),('onyngo','omniqora.geo',true,false),('onyngo','omniqora.dispatch',true,false),('onyngo','omniqora.tracking',true,false),('onyngo','omniqora.marketplace-growth',true,false),
('stylesync','omniqora.commerce-epos',true,false),('stylesync','omniqora.payments',true,true),('stylesync','omniqora.crm',true,false),
('schonova','omniqora.commerce-epos',true,false),('schonova','omniqora.payments',true,true),('schonova','omniqora.crm',true,false),
('merqano','merqano.commerce',true,true),('merqano','omniqora.crm',true,false),('merqano','omniqora.connect',true,false),
('dulcis','merqano.commerce',true,true),('dulcis','dishbee.epos',false,false),('dulcis','dishbee.kds',false,false),('dulcis','omniqora.crm',true,false),
('zivvo','omniqora.marketplace',true,true),('zivvo','omniqora.marketplace-auctions',true,false),('zivvo','omniqora.marketplace-trust',true,false),('zivvo','omniqora.marketplace-growth',true,false),
('autohashi','omniqora.marketplace',true,true),('autohashi','omniqora.marketplace-auctions',true,true),('autohashi','omniqora.marketplace-trust',true,false),
('xpertjobs','omniqora.marketplace',true,true),('xpertjobs','omniqora.marketplace-growth',true,false),
('lawquo','omniqora.marketplace',true,true),('taxnuvia','omniqora.marketplace',true,true),
('dishbee','omniqora.commerce-epos',true,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required;

INSERT INTO public.tenant_blueprints(blueprint_key,name,description,country_code,category) VALUES
('stylesync-uk','StyleSync · UK','Beauty SaaS with shared commerce/EPOS, payments, CRM and marketplace services.','GB','beauty'),
('schonova-de','Schonova · Germany','German beauty SaaS with shared commerce/EPOS, payments and German fiscal adapter requirement.','DE','beauty'),
('onyngo-uk','OnynGo · UK','Multi-vertical marketplace using the shared Marketplace Core.','GB','marketplace'),
('merqano-commerce','Merqano Commerce','Reusable D2C commerce/storefront tenant.','GB','commerce'),
('dulcis-uk','Dulcis · UK','Dulcis on Merqano Commerce with optional Dishbee hospitality capabilities.','GB','commerce'),
('zivvo-uk','Zivvo · UK','Automotive marketplace with offers, auctions, inspections and growth services.','GB','automotive'),
('autohashi-jp','Autohashi','Japanese auction/import marketplace with vehicle auction and offer primitives.',NULL,'automotive')
ON CONFLICT(blueprint_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,country_code=EXCLUDED.country_code,category=EXCLUDED.category,status='active';

INSERT INTO public.blueprint_products(blueprint_key,product_key,required) VALUES
('stylesync-uk','stylesync',true),('schonova-de','schonova',true),('onyngo-uk','onyngo',true),
('merqano-commerce','merqano',true),('dulcis-uk','dulcis',true),('zivvo-uk','zivvo',true),('autohashi-jp','autohashi',true)
ON CONFLICT DO NOTHING;

INSERT INTO public.blueprint_services(blueprint_key,service_key,required) VALUES
('stylesync-uk','omniqora.commerce-epos',true),('stylesync-uk','omniqora.payments',true),('stylesync-uk','omniqora.crm',false),('stylesync-uk','omniqora.connect',false),
('schonova-de','omniqora.commerce-epos',true),('schonova-de','omniqora.payments',true),('schonova-de','omniqora.crm',false),
('onyngo-uk','omniqora.marketplace',true),('onyngo-uk','omniqora.payments',true),('onyngo-uk','omniqora.geo',false),('onyngo-uk','omniqora.dispatch',false),('onyngo-uk','omniqora.tracking',false),
('merqano-commerce','merqano.commerce',true),('merqano-commerce','omniqora.payments',true),('merqano-commerce','omniqora.crm',false),
('dulcis-uk','merqano.commerce',true),('dulcis-uk','omniqora.payments',true),('dulcis-uk','omniqora.crm',false),('dulcis-uk','dishbee.epos',false),('dulcis-uk','dishbee.kds',false),
('zivvo-uk','omniqora.marketplace',true),('zivvo-uk','omniqora.marketplace-auctions',false),('zivvo-uk','omniqora.marketplace-trust',false),
('autohashi-jp','omniqora.marketplace',true),('autohashi-jp','omniqora.marketplace-auctions',true)
ON CONFLICT DO NOTHING;

-- German beauty EPOS must be explicitly fiscalised before production use.
INSERT INTO public.product_provider_requirements(product_key,provider_key,required,purpose)
SELECT 'schonova',provider_key,false,'German EPOS fiscalisation/TSE adapter'
FROM public.provider_catalogue WHERE provider_key IN('payments.adyen','payments.stripe')
ON CONFLICT(product_key,provider_key) DO UPDATE SET purpose=EXCLUDED.purpose;

COMMIT;