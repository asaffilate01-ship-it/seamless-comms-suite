BEGIN;

-- Vendor-scoped runtime contract for Syndriva.
-- Vendor application users can be marketplace_vendor_members without becoming broad tenant members.

CREATE OR REPLACE FUNCTION public.syndriva_can_access_vendor(
 _vendor uuid,
 _user uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT
   public.is_platform_admin(_user)
   OR EXISTS(
     SELECT 1
     FROM public.marketplace_vendors v
     WHERE v.id=_vendor
       AND public.can_write(v.tenant_id,_user)
   )
   OR EXISTS(
     SELECT 1
     FROM public.marketplace_vendor_memberships vm
     WHERE vm.vendor_id=_vendor
       AND vm.user_id=_user
       AND vm.status='active'
       AND vm.role IN('owner','admin','manager','staff','finance','support','viewer')
   );
$$;

REVOKE ALL ON FUNCTION public.syndriva_can_access_vendor(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.syndriva_can_access_vendor(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.syndriva_vendor_workspace(
 _marketplace uuid,
 _vendor uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  m public.syndriva_marketplaces%rowtype;
  v public.marketplace_vendors%rowtype;
  membership jsonb;
  listings jsonb;
  orders jsonb;
  quotes jsonb;
  settlements jsonb;
  disputes jsonb;
  metrics jsonb;
BEGIN
  SELECT * INTO m FROM public.syndriva_marketplaces WHERE id=_marketplace AND status<>'retired';
  IF NOT FOUND THEN RAISE EXCEPTION 'Syndriva marketplace not found'; END IF;

  SELECT * INTO v
  FROM public.marketplace_vendors
  WHERE id=_vendor AND tenant_id=m.tenant_id AND product_key=m.product_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vendor is not part of this marketplace'; END IF;

  IF NOT public.syndriva_can_access_vendor(_vendor,auth.uid()) THEN
    RAISE EXCEPTION 'Syndriva vendor access denied';
  END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'role',vm.role,
      'status',vm.status,
      'locationScope',vm.location_scope
    )),
    '[]'::jsonb
  ) INTO membership
  FROM public.marketplace_vendor_memberships vm
  WHERE vm.vendor_id=_vendor AND vm.user_id=auth.uid() AND vm.status='active';

  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC),
    '[]'::jsonb
  ) INTO listings
  FROM (
    SELECT l.id,l.title,l.listing_type,l.price_minor,l.currency,l.status,l.inventory_tracked,l.updated_at
    FROM public.marketplace_listings l
    WHERE l.vendor_id=_vendor AND l.tenant_id=m.tenant_id AND l.product_key=m.product_key
    ORDER BY l.updated_at DESC
    LIMIT 100
  ) x;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),
    '[]'::jsonb
  ) INTO orders
  FROM (
    SELECT DISTINCT o.id,o.status,o.currency,o.total_minor,o.created_at,o.updated_at
    FROM public.marketplace_orders o
    JOIN public.marketplace_order_items oi ON oi.order_id=o.id
    WHERE oi.vendor_id=_vendor AND o.tenant_id=m.tenant_id AND o.product_key=m.product_key
    ORDER BY o.created_at DESC
    LIMIT 100
  ) x;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),
    '[]'::jsonb
  ) INTO quotes
  FROM (
    SELECT q.id,q.request_id,q.listing_id,q.amount_minor,q.currency,q.status,q.valid_until,q.created_at,q.updated_at
    FROM public.marketplace_quotes q
    WHERE q.vendor_id=_vendor AND q.tenant_id=m.tenant_id
    ORDER BY q.created_at DESC
    LIMIT 100
  ) x;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),
    '[]'::jsonb
  ) INTO settlements
  FROM (
    SELECT s.id,s.order_id,s.gross_minor,s.commission_minor,s.net_minor,s.currency,s.status,s.payout_ref,s.created_at,s.updated_at
    FROM public.marketplace_vendor_settlements s
    WHERE s.vendor_id=_vendor AND s.tenant_id=m.tenant_id
    ORDER BY s.created_at DESC
    LIMIT 100
  ) x;

  SELECT COALESCE(
    jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),
    '[]'::jsonb
  ) INTO disputes
  FROM (
    SELECT d.id,d.order_id,d.dispute_type,d.status,d.priority,d.summary,d.created_at,d.updated_at
    FROM public.marketplace_disputes d
    WHERE d.vendor_id=_vendor AND d.tenant_id=m.tenant_id AND d.product_key=m.product_key
    ORDER BY d.created_at DESC
    LIMIT 100
  ) x;

  SELECT jsonb_build_object(
    'listingCount',(SELECT count(*) FROM public.marketplace_listings l WHERE l.vendor_id=_vendor),
    'activeListingCount',(SELECT count(*) FROM public.marketplace_listings l WHERE l.vendor_id=_vendor AND l.status='active'),
    'openOrderCount',(
      SELECT count(DISTINCT o.id)
      FROM public.marketplace_orders o
      JOIN public.marketplace_order_items oi ON oi.order_id=o.id
      WHERE oi.vendor_id=_vendor
        AND o.status NOT IN('completed','cancelled','refunded')
    ),
    'openQuoteCount',(SELECT count(*) FROM public.marketplace_quotes q WHERE q.vendor_id=_vendor AND q.status IN('draft','submitted','viewed')),
    'payableMinor',COALESCE((
      SELECT sum(s.net_minor)
      FROM public.marketplace_vendor_settlements s
      WHERE s.vendor_id=_vendor AND s.status IN('locked','payable')
    ),0),
    'openDisputeCount',(SELECT count(*) FROM public.marketplace_disputes d WHERE d.vendor_id=_vendor AND d.status NOT IN('resolved','rejected','closed'))
  ) INTO metrics;

  RETURN jsonb_build_object(
    'marketplace',jsonb_build_object(
      'id',m.id,
      'name',m.name,
      'slug',m.slug,
      'marketplaceKey',m.marketplace_key,
      'modes',m.marketplace_modes
    ),
    'vendor',jsonb_build_object(
      'id',v.id,
      'name',v.name,
      'slug',v.public_slug,
      'status',v.status,
      'onboardingStatus',v.onboarding_status,
      'verificationStatus',v.verification_status,
      'ratingAverage',v.rating_average,
      'ratingCount',v.rating_count,
      'commissionBps',v.commission_bps
    ),
    'membership',membership,
    'metrics',metrics,
    'listings',listings,
    'orders',orders,
    'quotes',quotes,
    'settlements',settlements,
    'disputes',disputes
  );
END;$$;

REVOKE ALL ON FUNCTION public.syndriva_vendor_workspace(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.syndriva_vendor_workspace(uuid,uuid) TO authenticated,service_role;

COMMIT;
