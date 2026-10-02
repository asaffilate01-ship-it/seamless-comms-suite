BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_vendors(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 brand_id uuid REFERENCES public.tenant_brands(id) ON DELETE SET NULL,
 name text NOT NULL,
 vendor_key text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','suspended','closed')),
 commission_bps integer NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 10000),
 payout_account_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,vendor_key)
);

CREATE TABLE IF NOT EXISTS public.inventory_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 external_ref text NOT NULL,
 sku text,
 name text NOT NULL,
 unit text NOT NULL DEFAULT 'each',
 track_stock boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,external_ref)
);
CREATE TABLE IF NOT EXISTS public.inventory_stock_locations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 external_ref text,
 name text NOT NULL,
 location_kind text NOT NULL CHECK(location_kind IN('store','warehouse','kitchen','vehicle','virtual','supplier')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.inventory_stock_balances(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
 stock_location_id uuid NOT NULL REFERENCES public.inventory_stock_locations(id) ON DELETE CASCADE,
 on_hand numeric NOT NULL DEFAULT 0,
 reserved numeric NOT NULL DEFAULT 0 CHECK(reserved>=0),
 reorder_point numeric,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(item_id,stock_location_id),
 CHECK(reserved<=GREATEST(on_hand,0))
);
CREATE TABLE IF NOT EXISTS public.inventory_stock_movements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
 stock_location_id uuid NOT NULL REFERENCES public.inventory_stock_locations(id) ON DELETE CASCADE,
 movement_type text NOT NULL CHECK(movement_type IN('receipt','sale','usage','waste','adjustment','transfer_in','transfer_out','return','reservation','release')),
 quantity numeric NOT NULL,
 source_ref text NOT NULL,
 unit_cost_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_ref)
);
CREATE TABLE IF NOT EXISTS public.inventory_stock_reservations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
 stock_location_id uuid NOT NULL REFERENCES public.inventory_stock_locations(id) ON DELETE CASCADE,
 quantity numeric NOT NULL CHECK(quantity>0),
 context_type text NOT NULL,
 context_id text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','consumed','released','expired')),
 expires_at timestamptz,
 idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.marketplace_listings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE CASCADE,
 inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
 stock_location_id uuid REFERENCES public.inventory_stock_locations(id) ON DELETE SET NULL,
 listing_type text NOT NULL DEFAULT 'item' CHECK(listing_type IN('item','service','booking','subscription')),
 external_ref text,
 sku text,
 title text NOT NULL,
 description text,
 price_minor bigint CHECK(price_minor IS NULL OR price_minor>=0),
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency ~ '^[A-Z]{3}$'),
 inventory_tracked boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','sold_out','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_listing_external_uq ON public.marketplace_listings(tenant_id,product_key,external_ref) WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.marketplace_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 buyer_ref text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','pending_payment','paid','accepted','fulfilling','completed','cancelled','refunded')),
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency ~ '^[A-Z]{3}$'),
 subtotal_minor bigint NOT NULL DEFAULT 0 CHECK(subtotal_minor>=0),
 discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0),
 tax_minor bigint NOT NULL DEFAULT 0 CHECK(tax_minor>=0),
 fees_minor bigint NOT NULL DEFAULT 0 CHECK(fees_minor>=0),
 total_minor bigint NOT NULL DEFAULT 0 CHECK(total_minor>=0),
 payment_intent_id uuid,
 idempotency_key text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,idempotency_key)
);
CREATE TABLE IF NOT EXISTS public.marketplace_order_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
 vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE RESTRICT,
 listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
 quantity numeric NOT NULL CHECK(quantity>0),
 unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),
 total_minor bigint NOT NULL CHECK(total_minor>=0),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.marketplace_vendor_settlements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
 vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE RESTRICT,
 gross_minor bigint NOT NULL CHECK(gross_minor>=0),
 commission_minor bigint NOT NULL DEFAULT 0 CHECK(commission_minor>=0),
 net_minor bigint NOT NULL CHECK(net_minor>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'calculated' CHECK(status IN('calculated','locked','payable','paid','reversed')),
 payout_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,vendor_id)
);

CREATE TABLE IF NOT EXISTS public.payment_intents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 provider_intent_ref text,
 idempotency_key text NOT NULL,
 purpose text NOT NULL,
 context_type text,
 context_id text,
 customer_ref text,
 amount_minor bigint NOT NULL CHECK(amount_minor>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 capture_mode text NOT NULL DEFAULT 'automatic' CHECK(capture_mode IN('automatic','manual')),
 status text NOT NULL DEFAULT 'created' CHECK(status IN('created','requires_action','pending','authorised','captured','failed','cancelled','partially_refunded','refunded')),
 payment_url text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,idempotency_key)
);
ALTER TABLE public.marketplace_orders DROP CONSTRAINT IF EXISTS marketplace_orders_payment_intent_id_fkey;
ALTER TABLE public.marketplace_orders ADD CONSTRAINT marketplace_orders_payment_intent_id_fkey FOREIGN KEY(payment_intent_id) REFERENCES public.payment_intents(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS public.payment_refunds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 payment_intent_id uuid NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
 provider_ref text,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','succeeded','failed','cancelled')),
 reason text,idempotency_key text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.booking_services(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 name text NOT NULL,duration_minutes integer NOT NULL CHECK(duration_minutes>0),capacity integer NOT NULL DEFAULT 1 CHECK(capacity>0),
 price_minor bigint CHECK(price_minor IS NULL OR price_minor>=0),currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 active boolean NOT NULL DEFAULT true,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.booking_resources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 name text NOT NULL,resource_type text NOT NULL,capacity integer NOT NULL DEFAULT 1 CHECK(capacity>0),active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bookings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES public.booking_services(id) ON DELETE RESTRICT,
 resource_id uuid REFERENCES public.booking_resources(id) ON DELETE SET NULL,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 customer_ref text NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,timezone text NOT NULL,
 party_size integer NOT NULL DEFAULT 1 CHECK(party_size>0),
 status text NOT NULL DEFAULT 'hold' CHECK(status IN('hold','confirmed','checked_in','completed','cancelled','no_show','expired')),
 channel text NOT NULL DEFAULT 'web',idempotency_key text NOT NULL,hold_expires_at timestamptz,
 payment_intent_id uuid REFERENCES public.payment_intents(id) ON DELETE SET NULL,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,idempotency_key),CHECK(ends_at>starts_at)
);

CREATE TABLE IF NOT EXISTS public.loyalty_programmes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,loyalty_currency text NOT NULL CHECK(loyalty_currency IN('points','stamps','credit')),
 earn_rule jsonb NOT NULL DEFAULT '{}'::jsonb,expiry_days integer CHECK(expiry_days IS NULL OR expiry_days>0),
 active boolean NOT NULL DEFAULT true,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loyalty_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.loyalty_programmes(id) ON DELETE CASCADE,customer_ref text NOT NULL,tier_key text,balance numeric NOT NULL DEFAULT 0,
 lifetime_earned numeric NOT NULL DEFAULT 0,lifetime_redeemed numeric NOT NULL DEFAULT 0,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(programme_id,customer_ref)
);
CREATE TABLE IF NOT EXISTS public.loyalty_ledger(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.loyalty_programmes(id) ON DELETE CASCADE,account_id uuid NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
 entry_type text NOT NULL CHECK(entry_type IN('earn','redeem','adjust','expire','reverse')),quantity numeric NOT NULL,balance_after numeric NOT NULL,
 source_ref text NOT NULL,reason text,occurred_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,source_ref)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['marketplace_vendors','inventory_items','inventory_stock_locations','inventory_stock_balances','inventory_stock_movements','inventory_stock_reservations','marketplace_listings','marketplace_orders','marketplace_order_items','marketplace_vendor_settlements','payment_intents','payment_refunds','booking_services','booking_resources','bookings','loyalty_programmes','loyalty_accounts','loyalty_ledger'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','commerce tenant read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','commerce tenant write',t);
 END LOOP;END $$;

CREATE OR REPLACE FUNCTION public.inventory_record_movement(_tenant uuid,_item uuid,_location uuid,_type text,_quantity numeric,_source_ref text,_unit_cost bigint DEFAULT NULL,_currency text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE mid uuid;delta numeric;BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Inventory access denied';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_items WHERE id=_item AND tenant_id=_tenant) OR NOT EXISTS(SELECT 1 FROM public.inventory_stock_locations WHERE id=_location AND tenant_id=_tenant) THEN RAISE EXCEPTION 'Inventory scope invalid';END IF;
 delta:=CASE WHEN _type IN('receipt','return','transfer_in') THEN abs(_quantity) WHEN _type IN('sale','usage','waste','transfer_out') THEN -abs(_quantity) ELSE _quantity END;
 INSERT INTO public.inventory_stock_balances(tenant_id,item_id,stock_location_id,on_hand) VALUES(_tenant,_item,_location,0) ON CONFLICT(item_id,stock_location_id) DO NOTHING;
 UPDATE public.inventory_stock_balances SET on_hand=on_hand+delta,updated_at=now() WHERE item_id=_item AND stock_location_id=_location AND on_hand+delta>=reserved;
 IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock';END IF;
 INSERT INTO public.inventory_stock_movements(tenant_id,item_id,stock_location_id,movement_type,quantity,source_ref,unit_cost_minor,currency) VALUES(_tenant,_item,_location,_type,_quantity,_source_ref,_unit_cost,_currency) RETURNING id INTO mid;
 RETURN mid;END;$$;

CREATE OR REPLACE FUNCTION public.marketplace_create_order(_tenant uuid,_product text,_buyer text,_items jsonb,_idempotency text,_metadata jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE oid uuid;item jsonb;l public.marketplace_listings%rowtype;qty numeric;subtotal bigint:=0;curr text:=NULL;line bigint;v record;BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Marketplace access denied';END IF;
 SELECT id INTO oid FROM public.marketplace_orders WHERE tenant_id=_tenant AND product_key=_product AND idempotency_key=_idempotency;IF oid IS NOT NULL THEN RETURN oid;END IF;
 IF jsonb_typeof(_items)<>'array' OR jsonb_array_length(_items)<1 THEN RAISE EXCEPTION 'Order items required';END IF;
 INSERT INTO public.marketplace_orders(tenant_id,product_key,buyer_ref,status,idempotency_key,metadata) VALUES(_tenant,_product,_buyer,'draft',_idempotency,COALESCE(_metadata,'{}')) RETURNING id INTO oid;
 FOR item IN SELECT value FROM jsonb_array_elements(_items) LOOP
  qty:=(item->>'quantity')::numeric;SELECT * INTO l FROM public.marketplace_listings WHERE id=(item->>'listingId')::uuid AND tenant_id=_tenant AND product_key=_product AND status='active' FOR UPDATE;
  IF NOT FOUND OR qty<=0 OR l.price_minor IS NULL THEN RAISE EXCEPTION 'Listing unavailable';END IF;
  IF curr IS NULL THEN curr:=l.currency;ELSIF curr<>l.currency THEN RAISE EXCEPTION 'Mixed currencies not supported';END IF;line:=round(l.price_minor*qty);subtotal:=subtotal+line;
  IF l.inventory_tracked THEN
   UPDATE public.inventory_stock_balances SET reserved=reserved+qty,updated_at=now() WHERE item_id=l.inventory_item_id AND stock_location_id=l.stock_location_id AND on_hand-reserved>=qty;
   IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient inventory';END IF;
   INSERT INTO public.inventory_stock_reservations(tenant_id,item_id,stock_location_id,quantity,context_type,context_id,idempotency_key) VALUES(_tenant,l.inventory_item_id,l.stock_location_id,qty,'marketplace_order',oid::text,'marketplace:'||oid::text||':'||l.id::text);
  END IF;
  INSERT INTO public.marketplace_order_items(tenant_id,order_id,vendor_id,listing_id,quantity,unit_price_minor,total_minor) VALUES(_tenant,oid,l.vendor_id,l.id,qty,l.price_minor,line);
 END LOOP;
 UPDATE public.marketplace_orders SET currency=COALESCE(curr,'GBP'),subtotal_minor=subtotal,total_minor=subtotal,status='pending_payment',updated_at=now() WHERE id=oid;
 FOR v IN SELECT i.vendor_id,sum(i.total_minor)::bigint gross,mv.commission_bps FROM public.marketplace_order_items i JOIN public.marketplace_vendors mv ON mv.id=i.vendor_id WHERE i.order_id=oid GROUP BY i.vendor_id,mv.commission_bps LOOP
  INSERT INTO public.marketplace_vendor_settlements(tenant_id,order_id,vendor_id,gross_minor,commission_minor,net_minor,currency)
  VALUES(_tenant,oid,v.vendor_id,v.gross,round(v.gross*v.commission_bps/10000.0),v.gross-round(v.gross*v.commission_bps/10000.0),COALESCE(curr,'GBP'));
 END LOOP;RETURN oid;END;$$;

CREATE OR REPLACE FUNCTION public.booking_create(_tenant uuid,_product text,_service uuid,_resource uuid,_customer text,_start timestamptz,_end timestamptz,_timezone text,_party integer,_channel text,_idempotency text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE bid uuid;cap integer;used integer;BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Booking access denied';END IF;
 SELECT id INTO bid FROM public.bookings WHERE tenant_id=_tenant AND product_key=_product AND idempotency_key=_idempotency;IF bid IS NOT NULL THEN RETURN bid;END IF;
 IF _end<=_start OR _party<=0 THEN RAISE EXCEPTION 'Invalid booking';END IF;
 IF _resource IS NOT NULL THEN SELECT capacity INTO cap FROM public.booking_resources WHERE id=_resource AND tenant_id=_tenant AND active;ELSE SELECT capacity INTO cap FROM public.booking_services WHERE id=_service AND tenant_id=_tenant AND active;END IF;
 IF cap IS NULL THEN RAISE EXCEPTION 'Booking resource unavailable';END IF;
 SELECT COALESCE(sum(party_size),0)::integer INTO used FROM public.bookings WHERE tenant_id=_tenant AND service_id=_service AND (_resource IS NULL OR resource_id=_resource) AND status IN('hold','confirmed','checked_in') AND starts_at<_end AND ends_at>_start;
 IF used+_party>cap THEN RAISE EXCEPTION 'Booking capacity unavailable';END IF;
 INSERT INTO public.bookings(tenant_id,product_key,service_id,resource_id,customer_ref,starts_at,ends_at,timezone,party_size,status,channel,idempotency_key,hold_expires_at) VALUES(_tenant,_product,_service,_resource,_customer,_start,_end,_timezone,_party,'hold',_channel,_idempotency,now()+interval '15 minutes') RETURNING id INTO bid;RETURN bid;END;$$;

CREATE OR REPLACE FUNCTION public.loyalty_apply(_tenant uuid,_programme uuid,_customer text,_type text,_quantity numeric,_source text,_reason text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.loyalty_accounts%rowtype;lid uuid;delta numeric;BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) AND COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Loyalty access denied';END IF;
 SELECT id INTO lid FROM public.loyalty_ledger WHERE tenant_id=_tenant AND source_ref=_source;IF lid IS NOT NULL THEN RETURN lid;END IF;
 SELECT * INTO a FROM public.loyalty_accounts WHERE tenant_id=_tenant AND programme_id=_programme AND customer_ref=_customer FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO public.loyalty_accounts(tenant_id,programme_id,customer_ref) VALUES(_tenant,_programme,_customer) RETURNING * INTO a;END IF;
 delta:=CASE WHEN _type='earn' THEN abs(_quantity) WHEN _type IN('redeem','expire') THEN -abs(_quantity) ELSE _quantity END;IF a.balance+delta<0 THEN RAISE EXCEPTION 'Insufficient loyalty balance';END IF;
 UPDATE public.loyalty_accounts SET balance=balance+delta,lifetime_earned=lifetime_earned+CASE WHEN _type='earn' THEN abs(_quantity) ELSE 0 END,lifetime_redeemed=lifetime_redeemed+CASE WHEN _type='redeem' THEN abs(_quantity) ELSE 0 END,updated_at=now() WHERE id=a.id RETURNING * INTO a;
 INSERT INTO public.loyalty_ledger(tenant_id,programme_id,account_id,entry_type,quantity,balance_after,source_ref,reason) VALUES(_tenant,_programme,a.id,_type,delta,a.balance,_source,_reason) RETURNING id INTO lid;RETURN lid;END;$$;

UPDATE public.service_catalogue SET implementation_status='built_main',updated_at=now() WHERE service_key IN('omniqora.marketplace','omniqora.payments','zoryn.rewards');
INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status) VALUES
('omniqora.inventory','Inventory','Shared stock, reservations and movements.','commerce','omniqora',true,'automatic','active','built_main'),
('omniqora.bookings','Bookings','Shared services, resources, holds and bookings.','commerce','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET implementation_status='built_main',updated_at=now();
COMMIT;