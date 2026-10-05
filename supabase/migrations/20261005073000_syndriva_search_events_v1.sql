BEGIN;

-- Syndriva Marketplace Engine v1.1
-- Standard search and event contracts over the shared marketplace/platform primitives.

CREATE TABLE IF NOT EXISTS public.syndriva_event_catalogue(
 event_type text PRIMARY KEY CHECK(event_type ~ '^marketplace\.[a-z0-9]+([._-][a-z0-9]+)*$'),
 name text NOT NULL,
 family text NOT NULL,
 subject_type text,
 description text NOT NULL,
 event_version integer NOT NULL DEFAULT 1 CHECK(event_version>0),
 data_classification text NOT NULL DEFAULT 'internal'
   CHECK(data_classification IN('public','internal','confidential','restricted')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.syndriva_event_catalogue ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.syndriva_event_catalogue TO authenticated;
GRANT ALL ON public.syndriva_event_catalogue TO service_role;
CREATE POLICY "syndriva event catalogue read" ON public.syndriva_event_catalogue
 FOR SELECT TO authenticated USING(status<>'retired');

INSERT INTO public.syndriva_event_catalogue(event_type,name,family,subject_type,description,data_classification) VALUES
('marketplace.vendor.created','Vendor created','vendor','vendor','A marketplace vendor/provider was created.','internal'),
('marketplace.vendor.approved','Vendor approved','vendor','vendor','A vendor/provider completed approval or verification.','internal'),
('marketplace.listing.created','Listing created','catalogue','listing','A listing was created.','internal'),
('marketplace.listing.published','Listing published','catalogue','listing','A listing became customer-visible.','public'),
('marketplace.inventory.low','Inventory low','inventory','inventory_item','Available stock crossed a configured low-stock threshold.','internal'),
('marketplace.inventory.changed','Inventory changed','inventory','inventory_item','Available stock or reservation state changed.','internal'),
('marketplace.order.created','Order created','order','order','A marketplace order was created.','confidential'),
('marketplace.order.accepted','Order accepted','order','order','A vendor/operator accepted an order.','confidential'),
('marketplace.order.completed','Order completed','order','order','An order completed fulfilment.','confidential'),
('marketplace.booking.created','Booking created','booking','booking','A booking/hold was created.','confidential'),
('marketplace.booking.confirmed','Booking confirmed','booking','booking','A booking was confirmed.','confidential'),
('marketplace.rfq.created','RFQ created','rfq','request','A buyer request/RFQ was opened.','confidential'),
('marketplace.quote.submitted','Quote submitted','rfq','quote','A vendor submitted a quote.','confidential'),
('marketplace.quote.accepted','Quote accepted','rfq','quote','A buyer accepted a vendor quote.','confidential'),
('marketplace.payment.authorised','Payment authorised','payment','payment','A payment was authorised.','restricted'),
('marketplace.payment.captured','Payment captured','payment','payment','A payment was captured.','restricted'),
('marketplace.payment.refunded','Payment refunded','payment','payment','A payment was refunded.','restricted'),
('marketplace.payout.payable','Vendor payout payable','payout','settlement','A vendor settlement became payable.','restricted'),
('marketplace.delivery.dispatched','Delivery dispatched','fulfilment','delivery','A delivery/dispatch job was assigned or dispatched.','confidential'),
('marketplace.review.created','Review created','trust','review','A customer/vendor review was submitted.','internal'),
('marketplace.dispute.opened','Dispute opened','trust','dispute','A marketplace dispute was opened.','confidential')
ON CONFLICT(event_type) DO UPDATE SET
 name=EXCLUDED.name,family=EXCLUDED.family,subject_type=EXCLUDED.subject_type,
 description=EXCLUDED.description,event_version=EXCLUDED.event_version,
 data_classification=EXCLUDED.data_classification,status='active',updated_at=now();

CREATE OR REPLACE FUNCTION public.syndriva_emit_marketplace_event(
 _marketplace uuid,
 _event_type text,
 _subject_id text,
 _payload jsonb DEFAULT '{}'::jsonb,
 _idempotency_key text DEFAULT NULL,
 _correlation_id text DEFAULT NULL,
 _causation_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  m public.syndriva_marketplaces%rowtype;
  e public.syndriva_event_catalogue%rowtype;
  result uuid;
  event_key text;
BEGIN
  SELECT * INTO m FROM public.syndriva_marketplaces WHERE id=_marketplace;
  IF NOT FOUND THEN RAISE EXCEPTION 'Syndriva marketplace not found'; END IF;

  IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(m.tenant_id,auth.uid()) THEN
    RAISE EXCEPTION 'Syndriva event access denied';
  END IF;

  SELECT * INTO e FROM public.syndriva_event_catalogue
  WHERE event_type=_event_type AND status<>'retired';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Syndriva event type: %',_event_type; END IF;

  event_key:=COALESCE(NULLIF(_idempotency_key,''),_event_type||':'||COALESCE(_subject_id,'none')||':'||gen_random_uuid()::text);

  INSERT INTO public.platform_events(
    tenant_id,product_key,brand_id,event_type,event_version,source_service,
    subject_type,subject_id,correlation_id,causation_id,idempotency_key,
    data_classification,payload
  ) VALUES(
    m.tenant_id,m.product_key,m.brand_id,e.event_type,e.event_version,'syndriva.marketplace-engine',
    e.subject_type,_subject_id,_correlation_id,_causation_id,event_key,
    e.data_classification,
    COALESCE(_payload,'{}'::jsonb) || jsonb_build_object(
      'marketplaceId',m.id,
      'marketplaceKey',m.marketplace_key,
      'marketplaceSlug',m.slug
    )
  )
  ON CONFLICT(tenant_id,product_key,idempotency_key) DO UPDATE SET
    payload=public.platform_events.payload || EXCLUDED.payload
  RETURNING id INTO result;

  RETURN result;
END;$$;

REVOKE ALL ON FUNCTION public.syndriva_emit_marketplace_event(uuid,text,text,jsonb,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.syndriva_emit_marketplace_event(uuid,text,text,jsonb,text,text,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.syndriva_search_listings(
 _marketplace uuid,
 _query text DEFAULT NULL,
 _category text DEFAULT NULL,
 _vendor uuid DEFAULT NULL,
 _min_price bigint DEFAULT NULL,
 _max_price bigint DEFAULT NULL,
 _limit integer DEFAULT 50,
 _offset integer DEFAULT 0
) RETURNS TABLE(
 listing_id uuid,
 vendor_id uuid,
 vendor_name text,
 vendor_slug text,
 vendor_rating numeric,
 title text,
 description text,
 listing_type text,
 price_minor bigint,
 currency text,
 inventory_tracked boolean,
 available_stock numeric,
 category_keys text[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  m public.syndriva_marketplaces%rowtype;
  lim integer:=LEAST(GREATEST(COALESCE(_limit,50),1),100);
  off integer:=GREATEST(COALESCE(_offset,0),0);
BEGIN
  SELECT * INTO m FROM public.syndriva_marketplaces WHERE id=_marketplace AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Syndriva marketplace not found or inactive'; END IF;

  RETURN QUERY
  SELECT
    l.id,
    v.id,
    v.name,
    v.public_slug,
    v.rating_average,
    l.title,
    l.description,
    l.listing_type,
    l.price_minor,
    l.currency,
    l.inventory_tracked,
    CASE
      WHEN l.inventory_tracked THEN COALESCE(stock.available,0)
      ELSE NULL
    END AS available_stock,
    COALESCE(cats.keys,'{}'::text[]) AS category_keys
  FROM public.marketplace_listings l
  JOIN public.marketplace_vendors v
    ON v.id=l.vendor_id AND v.tenant_id=l.tenant_id
  LEFT JOIN LATERAL (
    SELECT SUM(GREATEST(b.on_hand-b.reserved,0)) AS available
    FROM public.inventory_stock_balances b
    WHERE b.tenant_id=l.tenant_id
      AND l.inventory_item_id IS NOT NULL
      AND b.item_id=l.inventory_item_id
      AND (l.stock_location_id IS NULL OR b.stock_location_id=l.stock_location_id)
  ) stock ON true
  LEFT JOIN LATERAL (
    SELECT ARRAY_AGG(DISTINCT c.category_key ORDER BY c.category_key) AS keys
    FROM public.marketplace_listing_categories lc
    JOIN public.marketplace_categories c ON c.id=lc.category_id
    WHERE lc.listing_id=l.id
  ) cats ON true
  WHERE l.tenant_id=m.tenant_id
    AND l.product_key=m.product_key
    AND l.status='active'
    AND v.status='active'
    AND v.searchable=true
    AND (_vendor IS NULL OR v.id=_vendor)
    AND (_min_price IS NULL OR l.price_minor IS NOT NULL AND l.price_minor>=_min_price)
    AND (_max_price IS NULL OR l.price_minor IS NOT NULL AND l.price_minor<=_max_price)
    AND (
      NULLIF(trim(COALESCE(_query,'')),'') IS NULL
      OR l.title ILIKE '%'||trim(_query)||'%'
      OR COALESCE(l.description,'') ILIKE '%'||trim(_query)||'%'
      OR v.name ILIKE '%'||trim(_query)||'%'
      OR COALESCE(l.sku,'') ILIKE '%'||trim(_query)||'%'
    )
    AND (
      NULLIF(trim(COALESCE(_category,'')),'') IS NULL
      OR _category = ANY(COALESCE(cats.keys,'{}'::text[]))
    )
  ORDER BY
    COALESCE(v.rating_average,0) DESC,
    l.updated_at DESC,
    l.id
  LIMIT lim OFFSET off;
END;$$;

REVOKE ALL ON FUNCTION public.syndriva_search_listings(uuid,text,text,uuid,bigint,bigint,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.syndriva_search_listings(uuid,text,text,uuid,bigint,bigint,integer,integer) TO anon,authenticated,service_role;

COMMIT;
