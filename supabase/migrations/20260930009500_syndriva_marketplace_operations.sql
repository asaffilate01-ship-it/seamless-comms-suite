-- Syndriva Marketplace operational persistence and transaction-safe order flow.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_inventory (
  listing_id uuid PRIMARY KEY REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku text,
  quantity_on_hand numeric NOT NULL DEFAULT 0 CHECK (quantity_on_hand>=0),
  quantity_reserved numeric NOT NULL DEFAULT 0 CHECK (quantity_reserved>=0),
  reorder_level numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity_reserved<=quantity_on_hand)
);
CREATE INDEX IF NOT EXISTS marketplace_inventory_tenant_idx ON public.marketplace_inventory (tenant_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity numeric,
  available boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS marketplace_availability_lookup_idx ON public.marketplace_availability (tenant_id,listing_id,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS public.marketplace_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE RESTRICT,
  basis_minor bigint NOT NULL CHECK (basis_minor>=0),
  rate_bps integer CHECK (rate_bps IS NULL OR rate_bps BETWEEN 0 AND 10000),
  fixed_minor bigint CHECK (fixed_minor IS NULL OR fixed_minor>=0),
  commission_minor bigint NOT NULL CHECK (commission_minor>=0),
  status text NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated','locked','settled','reversed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketplace_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.marketplace_orders(id) ON DELETE SET NULL,
  listing_id uuid REFERENCES public.marketplace_listings(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.marketplace_vendors(id) ON DELETE SET NULL,
  reviewer_ref text NOT NULL,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('pending','published','hidden','removed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_reviews_listing_idx ON public.marketplace_reviews (tenant_id,listing_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.marketplace_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
  opened_by_ref text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','rejected','closed')),
  resolution text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_disputes_status_idx ON public.marketplace_disputes (tenant_id,status,created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketplace_inventory','marketplace_availability','marketplace_commissions','marketplace_reviews','marketplace_disputes']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','marketplace tenant read',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))','marketplace tenant read',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','marketplace tenant write',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))','marketplace tenant write',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_marketplace_order(
  _tenant uuid,_tenant_product uuid,_buyer_ref text,_vendor uuid,_items jsonb,_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tp public.tenant_products;
  v public.marketplace_vendors;
  item jsonb;
  l public.marketplace_listings;
  inv public.marketplace_inventory;
  oid uuid;
  qty numeric;
  subtotal bigint := 0;
  currency text := NULL;
  line_total bigint;
  event_id text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.can_write(_tenant,auth.uid()) THEN RAISE EXCEPTION 'Marketplace write access denied'; END IF;
  IF NOT public.has_module_entitlement(_tenant,_tenant_product,'marketplace.core',now()) THEN RAISE EXCEPTION 'Marketplace entitlement required'; END IF;
  SELECT * INTO tp FROM public.tenant_products WHERE id=_tenant_product AND tenant_id=_tenant AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant product scope invalid'; END IF;
  SELECT * INTO v FROM public.marketplace_vendors WHERE id=_vendor AND tenant_id=_tenant AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor is not active'; END IF;
  IF jsonb_typeof(COALESCE(_items,'[]'::jsonb))<>'array' OR jsonb_array_length(_items)<1 THEN RAISE EXCEPTION 'Order items required'; END IF;

  -- Validate and reserve inventory before creating the order.
  FOR item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    qty := (item->>'quantity')::numeric;
    IF qty<=0 THEN RAISE EXCEPTION 'Quantity must be positive'; END IF;
    SELECT * INTO l FROM public.marketplace_listings
      WHERE id=(item->>'listingId')::uuid AND tenant_id=_tenant AND vendor_id=_vendor AND status='active'
      FOR UPDATE;
    IF NOT FOUND OR l.price_minor IS NULL THEN RAISE EXCEPTION 'Listing unavailable'; END IF;
    IF currency IS NULL THEN currency:=l.currency; ELSIF currency<>l.currency THEN RAISE EXCEPTION 'Mixed currencies are not supported in one vendor order'; END IF;
    line_total := round(l.price_minor*qty);
    subtotal := subtotal + line_total;
    IF l.inventory_tracked THEN
      SELECT * INTO inv FROM public.marketplace_inventory WHERE listing_id=l.id AND tenant_id=_tenant FOR UPDATE;
      IF NOT FOUND OR inv.quantity_on_hand-inv.quantity_reserved<qty THEN RAISE EXCEPTION 'Insufficient inventory'; END IF;
      UPDATE public.marketplace_inventory SET quantity_reserved=quantity_reserved+qty,updated_at=now() WHERE listing_id=l.id;
    END IF;
  END LOOP;

  INSERT INTO public.marketplace_orders(tenant_id,buyer_ref,vendor_id,status,currency,subtotal_minor,discount_minor,tax_minor,fees_minor,total_minor,metadata)
  VALUES(_tenant,btrim(_buyer_ref),_vendor,'pending_payment',currency,subtotal,0,0,0,subtotal,COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO oid;

  FOR item IN SELECT value FROM jsonb_array_elements(_items)
  LOOP
    qty := (item->>'quantity')::numeric;
    SELECT * INTO l FROM public.marketplace_listings WHERE id=(item->>'listingId')::uuid;
    line_total := round(l.price_minor*qty);
    INSERT INTO public.marketplace_order_items(tenant_id,order_id,listing_id,quantity,unit_price_minor,total_minor,metadata)
    VALUES(_tenant,oid,l.id,qty,l.price_minor,line_total,COALESCE(item->'metadata','{}'::jsonb));
  END LOOP;

  event_id:=gen_random_uuid()::text;
  INSERT INTO public.platform_events(id,tenant_id,tenant_product_id,product_key,event_type,event_version,occurred_at,environment,subject_type,subject_id,idempotency_key,data_classification,payload)
  VALUES(event_id,_tenant,_tenant_product,tp.product_key,'marketplace.order.created',1,now(),'production','order',oid::text,'marketplace:order:'||oid::text||':created','confidential',jsonb_build_object('orderId',oid,'vendorId',_vendor,'currency',currency,'subtotalMinor',subtotal));
  RETURN oid;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_marketplace_order(_order uuid,_status text,_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o public.marketplace_orders; item public.marketplace_order_items; l public.marketplace_listings; tp uuid; product_key text; allowed boolean:=false;
BEGIN
  SELECT * INTO o FROM public.marketplace_orders WHERE id=_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.can_write(o.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'Marketplace write access denied'; END IF;
  SELECT t.id,t.product_key INTO tp,product_key FROM public.tenant_products t
    WHERE t.tenant_id=o.tenant_id AND public.has_module_entitlement(o.tenant_id,t.id,'marketplace.core',now()) AND t.status='active'
    ORDER BY t.created_at LIMIT 1;
  IF tp IS NULL THEN RAISE EXCEPTION 'Marketplace entitlement required'; END IF;

  allowed:=CASE o.status
    WHEN 'draft' THEN _status IN ('pending_payment','cancelled')
    WHEN 'pending_payment' THEN _status IN ('paid','cancelled')
    WHEN 'paid' THEN _status IN ('accepted','refunded','cancelled')
    WHEN 'accepted' THEN _status IN ('fulfilling','cancelled','refunded')
    WHEN 'fulfilling' THEN _status IN ('completed','refunded')
    WHEN 'completed' THEN _status IN ('refunded')
    ELSE false END;
  IF NOT allowed THEN RAISE EXCEPTION 'Invalid marketplace order transition: % -> %',o.status,_status; END IF;

  IF _status='cancelled' THEN
    FOR item IN SELECT * FROM public.marketplace_order_items WHERE order_id=o.id LOOP
      SELECT * INTO l FROM public.marketplace_listings WHERE id=item.listing_id;
      IF l.inventory_tracked THEN
        UPDATE public.marketplace_inventory SET quantity_reserved=GREATEST(0,quantity_reserved-item.quantity),updated_at=now() WHERE listing_id=l.id;
      END IF;
    END LOOP;
  ELSIF _status='completed' THEN
    FOR item IN SELECT * FROM public.marketplace_order_items WHERE order_id=o.id LOOP
      SELECT * INTO l FROM public.marketplace_listings WHERE id=item.listing_id;
      IF l.inventory_tracked THEN
        UPDATE public.marketplace_inventory SET quantity_on_hand=quantity_on_hand-item.quantity,quantity_reserved=quantity_reserved-item.quantity,updated_at=now() WHERE listing_id=l.id AND quantity_reserved>=item.quantity AND quantity_on_hand>=item.quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'Inventory reconciliation failed'; END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.marketplace_orders SET status=_status,metadata=metadata||COALESCE(_metadata,'{}'::jsonb),updated_at=now() WHERE id=o.id;
  INSERT INTO public.platform_events(id,tenant_id,tenant_product_id,product_key,event_type,event_version,occurred_at,environment,subject_type,subject_id,idempotency_key,data_classification,payload)
  VALUES(gen_random_uuid()::text,o.tenant_id,tp,product_key,'marketplace.order.'||_status,1,now(),'production','order',o.id::text,'marketplace:order:'||o.id::text||':'||_status,'confidential',jsonb_build_object('orderId',o.id,'vendorId',o.vendor_id,'status',_status,'totalMinor',o.total_minor,'currency',o.currency));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_marketplace_order(uuid,uuid,text,uuid,jsonb,jsonb) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.transition_marketplace_order(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(uuid,uuid,text,uuid,jsonb,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.transition_marketplace_order(uuid,text,jsonb) TO authenticated,service_role;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['marketplace_inventory','marketplace_availability','marketplace_commissions','marketplace_reviews','marketplace_disputes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
  END LOOP;
END $$;

COMMIT;