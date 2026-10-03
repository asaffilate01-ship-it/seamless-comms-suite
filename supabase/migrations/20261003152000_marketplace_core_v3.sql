BEGIN;

-- Marketplace Core v3. Extends the existing commerce_marketplace_v2 foundation.
-- This is intentionally domain-neutral: vertical systems keep regulated/domain-specific records.

ALTER TABLE public.marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_listing_type_check;
ALTER TABLE public.marketplace_listings ADD CONSTRAINT marketplace_listings_listing_type_check
CHECK(listing_type IN(
 'item','service','booking','subscription','job','provider','professional_service',
 'quote_request','project','vehicle','property','course','event','other'
));

ALTER TABLE public.marketplace_vendors
 ADD COLUMN IF NOT EXISTS vendor_type text NOT NULL DEFAULT 'business',
 ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'active',
 ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
 ADD COLUMN IF NOT EXISTS crm_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS primary_location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS public_slug text,
 ADD COLUMN IF NOT EXISTS rating_average numeric,
 ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS searchable boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_vendor_slug_uq
 ON public.marketplace_vendors(tenant_id,product_key,public_slug)
 WHERE public_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.marketplace_vendor_memberships(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'staff'
   CHECK(role IN('owner','admin','manager','staff','finance','support','viewer')),
 location_scope uuid[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN('invited','active','suspended','removed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(vendor_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_categories(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 parent_id uuid REFERENCES public.marketplace_categories(id) ON DELETE SET NULL,
 category_key text NOT NULL,
 name text NOT NULL,
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
CREATE TABLE IF NOT EXISTS public.marketplace_listing_availability(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
 resource_ref text,
 weekday smallint CHECK(weekday IS NULL OR weekday BETWEEN 0 AND 6),
 starts_at time,
 ends_at time,
 starts_on date,
 ends_on date,
 capacity numeric,
 status text NOT NULL DEFAULT 'available'
   CHECK(status IN('available','unavailable','limited','sold_out')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.marketplace_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 requester_ref text NOT NULL,
 request_type text NOT NULL DEFAULT 'enquiry'
   CHECK(request_type IN('enquiry','quote','application','booking_request','job_application','legal_triage','matching','project')),
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE SET NULL,
 title text NOT NULL,
 description text,
 budget_min_minor bigint,
 budget_max_minor bigint,
 currency text DEFAULT 'GBP',
 location jsonb NOT NULL DEFAULT '{}'::jsonb,
 requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'open'
   CHECK(status IN('draft','open','matching','shortlisted','accepted','declined','withdrawn','completed','cancelled')),
 due_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_requests_lookup_idx
 ON public.marketplace_requests(tenant_id,product_key,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_matches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 request_id uuid NOT NULL REFERENCES public.marketplace_requests(id) ON DELETE CASCADE,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 score numeric,
 rank integer,
 reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'suggested'
   CHECK(status IN('suggested','viewed','shortlisted','contacted','accepted','declined','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(vendor_id IS NOT NULL OR listing_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_match_vendor_uq
 ON public.marketplace_matches(request_id,vendor_id)
 WHERE vendor_id IS NOT NULL AND listing_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_match_listing_uq
 ON public.marketplace_matches(request_id,listing_id)
 WHERE listing_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.marketplace_quotes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 request_id uuid NOT NULL REFERENCES public.marketplace_requests(id) ON DELETE CASCADE,
 vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
 quote_ref text,
 amount_minor bigint,
 currency text NOT NULL DEFAULT 'GBP',
 pricing jsonb NOT NULL DEFAULT '{}'::jsonb,
 terms text,
 valid_until timestamptz,
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','submitted','viewed','accepted','declined','expired','withdrawn')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_offers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 buyer_ref text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>=0),
 currency text NOT NULL DEFAULT 'GBP',
 status text NOT NULL DEFAULT 'submitted'
   CHECK(status IN('submitted','countered','accepted','declined','withdrawn','expired')),
 counter_amount_minor bigint,
 expires_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_auctions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 seller_vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE SET NULL,
 auction_type text NOT NULL DEFAULT 'english'
   CHECK(auction_type IN('english','sealed','tender','buy_now')),
 currency text NOT NULL DEFAULT 'GBP',
 opening_minor bigint NOT NULL DEFAULT 0,
 reserve_minor bigint,
 buy_now_minor bigint,
 minimum_increment_minor bigint NOT NULL DEFAULT 100,
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 extension_seconds integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'scheduled'
   CHECK(status IN('draft','scheduled','live','ended','cancelled','settled')),
 winner_ref text,
 winning_bid_id uuid,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS public.marketplace_bids(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 auction_id uuid NOT NULL REFERENCES public.marketplace_auctions(id) ON DELETE CASCADE,
 bidder_ref text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>=0),
 currency text NOT NULL,
 status text NOT NULL DEFAULT 'valid'
   CHECK(status IN('valid','outbid','winning','withdrawn','rejected')),
 idempotency_key text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);
ALTER TABLE public.marketplace_auctions DROP CONSTRAINT IF EXISTS marketplace_auctions_winning_bid_id_fkey;
ALTER TABLE public.marketplace_auctions ADD CONSTRAINT marketplace_auctions_winning_bid_id_fkey
 FOREIGN KEY(winning_bid_id) REFERENCES public.marketplace_bids(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.marketplace_reviews(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
 reviewer_ref text NOT NULL,
 rating smallint NOT NULL CHECK(rating BETWEEN 1 AND 5),
 title text,
 body text,
 status text NOT NULL DEFAULT 'published'
   CHECK(status IN('pending','published','hidden','removed','disputed')),
 verified_purchase boolean NOT NULL DEFAULT false,
 vendor_reply text,
 vendor_replied_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.marketplace_favourites(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 customer_ref text NOT NULL,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(vendor_id IS NOT NULL OR listing_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_favourite_vendor_uq
 ON public.marketplace_favourites(tenant_id,product_key,customer_ref,vendor_id)
 WHERE vendor_id IS NOT NULL AND listing_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_favourite_listing_uq
 ON public.marketplace_favourites(tenant_id,product_key,customer_ref,listing_id)
 WHERE listing_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.marketplace_disputes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE SET NULL,
 opened_by_ref text NOT NULL,
 dispute_type text NOT NULL,
 status text NOT NULL DEFAULT 'open'
   CHECK(status IN('open','triage','awaiting_buyer','awaiting_vendor','review','resolved','rejected','closed')),
 priority text NOT NULL DEFAULT 'normal'
   CHECK(priority IN('low','normal','high','urgent')),
 summary text NOT NULL,
 detail text,
 resolution text,
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.marketplace_promotions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 code text,
 promotion_type text NOT NULL
   CHECK(promotion_type IN('percent','fixed','bundle','wallet_credit','free_delivery','featured')),
 value_minor bigint NOT NULL DEFAULT 0,
 currency text DEFAULT 'GBP',
 max_redemptions integer,
 max_per_customer integer,
 starts_at timestamptz,
 ends_at timestamptz,
 channels text[] NOT NULL DEFAULT '{}',
 rules jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN('draft','active','paused','expired','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_promotion_code_uq
 ON public.marketplace_promotions(tenant_id,product_key,code)
 WHERE code IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.marketplace_promotion_redemptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 promotion_id uuid NOT NULL REFERENCES public.marketplace_promotions(id) ON DELETE CASCADE,
 customer_ref text NOT NULL,
 order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
 amount_minor bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_saved_searches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 customer_ref text NOT NULL,
 name text NOT NULL,
 criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
 alert_channels text[] NOT NULL DEFAULT '{}',
 active boolean NOT NULL DEFAULT true,
 last_matched_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_listing_channels(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
 channel_key text NOT NULL,
 external_ref text,
 status text NOT NULL DEFAULT 'pending'
   CHECK(status IN('pending','syncing','active','paused','failed','retired')),
 last_synced_at timestamptz,
 last_error text,
 mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(listing_id,channel_key)
);

CREATE TABLE IF NOT EXISTS public.marketplace_vendor_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 plan_key text NOT NULL,
 name text NOT NULL,
 recurring_minor bigint NOT NULL DEFAULT 0,
 currency text NOT NULL DEFAULT 'GBP',
 billing_period text NOT NULL DEFAULT 'monthly'
   CHECK(billing_period IN('monthly','annual','one_off')),
 commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 10000),
 entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
 active boolean NOT NULL DEFAULT true,
 UNIQUE(tenant_id,product_key,plan_key)
);
CREATE TABLE IF NOT EXISTS public.marketplace_vendor_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 plan_id uuid NOT NULL REFERENCES public.marketplace_vendor_plans(id) ON DELETE RESTRICT,
 provider_ref text,
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN('trial','active','past_due','paused','cancelled','expired')),
 current_period_start timestamptz,
 current_period_end timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY[
  'marketplace_vendor_memberships','marketplace_categories','marketplace_listing_categories',
  'marketplace_listing_availability','marketplace_requests','marketplace_matches','marketplace_quotes',
  'marketplace_offers','marketplace_auctions','marketplace_bids','marketplace_reviews',
  'marketplace_favourites','marketplace_disputes','marketplace_promotions',
  'marketplace_promotion_redemptions','marketplace_saved_searches','marketplace_listing_channels',
  'marketplace_vendor_plans','marketplace_vendor_subscriptions'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','marketplace v3 read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','marketplace v3 write',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.marketplace_place_bid(
 _tenant uuid,_auction uuid,_bidder text,_amount bigint,_idempotency text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.marketplace_auctions%rowtype;current_max bigint;bid_id uuid;
BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Marketplace access denied';END IF;
 SELECT * INTO a FROM public.marketplace_auctions WHERE id=_auction AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND OR a.status<>'live' OR now()<a.starts_at OR now()>=a.ends_at THEN RAISE EXCEPTION 'Auction not live';END IF;
 SELECT coalesce(max(amount_minor),a.opening_minor-a.minimum_increment_minor) INTO current_max
 FROM public.marketplace_bids WHERE auction_id=a.id AND status IN('valid','winning');
 IF _amount<current_max+a.minimum_increment_minor THEN RAISE EXCEPTION 'Bid below minimum';END IF;
 UPDATE public.marketplace_bids SET status='outbid' WHERE auction_id=a.id AND status='winning';
 INSERT INTO public.marketplace_bids(tenant_id,auction_id,bidder_ref,amount_minor,currency,status,idempotency_key)
 VALUES(_tenant,a.id,_bidder,_amount,a.currency,'winning',_idempotency)
 ON CONFLICT(tenant_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
 RETURNING id INTO bid_id;
 UPDATE public.marketplace_auctions SET winning_bid_id=bid_id,winner_ref=_bidder,
  ends_at=CASE WHEN a.extension_seconds>0 AND a.ends_at-now()<make_interval(secs=>a.extension_seconds)
    THEN a.ends_at+make_interval(secs=>a.extension_seconds) ELSE a.ends_at END,
  updated_at=now()
 WHERE id=a.id;
 RETURN bid_id;
END;$$;
REVOKE ALL ON FUNCTION public.marketplace_place_bid(uuid,uuid,text,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketplace_place_bid(uuid,uuid,text,bigint,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.marketplace_refresh_vendor_rating(_vendor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE public.marketplace_vendors v
 SET rating_average=s.avg_rating,rating_count=s.review_count,updated_at=now()
 FROM(
  SELECT vendor_id,round(avg(rating)::numeric,2) avg_rating,count(*)::integer review_count
  FROM public.marketplace_reviews
  WHERE vendor_id=_vendor AND status='published'
  GROUP BY vendor_id
 )s
 WHERE v.id=s.vendor_id;
 IF NOT FOUND THEN UPDATE public.marketplace_vendors SET rating_average=NULL,rating_count=0,updated_at=now() WHERE id=_vendor;END IF;
END;$$;

CREATE OR REPLACE FUNCTION public.marketplace_review_rating_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.marketplace_refresh_vendor_rating(coalesce(NEW.vendor_id,OLD.vendor_id));
 RETURN coalesce(NEW,OLD);
END;$$;
DROP TRIGGER IF EXISTS marketplace_review_rating_rollup ON public.marketplace_reviews;
CREATE TRIGGER marketplace_review_rating_rollup
AFTER INSERT OR UPDATE OR DELETE ON public.marketplace_reviews
FOR EACH ROW EXECUTE FUNCTION public.marketplace_review_rating_trigger();

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.marketplace-matching','Marketplace Matching','Request, quote, application and provider/listing matching primitives.','marketplace','omniqora',true,'automatic','active','built_main'),
 ('omniqora.marketplace-trust','Marketplace Trust','Reviews, disputes, moderation, verification status and seller trust primitives.','marketplace','omniqora',true,'automatic','active','built_main'),
 ('omniqora.marketplace-auctions','Marketplace Auctions','Offers, auctions, bids, extensions and winning-bid primitives.','marketplace','omniqora',true,'automatic','active','built_main'),
 ('omniqora.marketplace-growth','Marketplace Growth','Promotions, favourites, saved searches, vendor plans and listing-channel sync.','marketplace','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET description=EXCLUDED.description,implementation_status='built_main',status='active',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.marketplace-matching','omniqora.marketplace'),
 ('omniqora.marketplace-trust','omniqora.marketplace'),
 ('omniqora.marketplace-auctions','omniqora.marketplace'),
 ('omniqora.marketplace-growth','omniqora.marketplace'),
 ('omniqora.marketplace-growth','omniqora.connect')
ON CONFLICT DO NOTHING;

COMMIT;