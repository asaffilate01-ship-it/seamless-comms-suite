-- Syndriva -> Omniqora Bookings bridge and resource-availability enforcement.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_booking_configs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  booking_service_id uuid NOT NULL REFERENCES public.booking_services(id) ON DELETE RESTRICT,
  default_resource_id uuid REFERENCES public.booking_resources(id) ON DELETE SET NULL,
  allow_customer_resource_choice boolean NOT NULL DEFAULT false,
  hold_minutes integer NOT NULL DEFAULT 15 CHECK(hold_minutes BETWEEN 1 AND 120),
  payment_mode text NOT NULL DEFAULT 'none'
    CHECK(payment_mode IN ('none','full','deposit','manual')),
  deposit_minor bigint CHECK(deposit_minor IS NULL OR deposit_minor>=0),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_product_id,listing_id)
);
CREATE INDEX IF NOT EXISTS marketplace_booking_configs_listing_idx
  ON public.marketplace_booking_configs(tenant_id,listing_id,active);

CREATE TABLE IF NOT EXISTS public.marketplace_booking_links(
  booking_id uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES public.marketplace_vendors(id) ON DELETE RESTRICT,
  buyer_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_booking_links_vendor_idx
  ON public.marketplace_booking_links(tenant_id,vendor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_booking_links_buyer_idx
  ON public.marketplace_booking_links(tenant_id,buyer_ref,created_at DESC);

ALTER TABLE public.marketplace_booking_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_booking_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketplace_booking_configs,public.marketplace_booking_links
  FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.marketplace_booking_configs TO authenticated;
GRANT SELECT ON public.marketplace_booking_links TO authenticated;
GRANT ALL ON public.marketplace_booking_configs,public.marketplace_booking_links TO service_role;

DROP POLICY IF EXISTS "marketplace booking config tenant read" ON public.marketplace_booking_configs;
CREATE POLICY "marketplace booking config tenant read"
ON public.marketplace_booking_configs FOR SELECT TO authenticated
USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "marketplace booking config tenant write" ON public.marketplace_booking_configs;
CREATE POLICY "marketplace booking config tenant write"
ON public.marketplace_booking_configs FOR ALL TO authenticated
USING(public.can_write(tenant_id,auth.uid()))
WITH CHECK(public.can_write(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "marketplace booking link tenant read" ON public.marketplace_booking_links;
CREATE POLICY "marketplace booking link tenant read"
ON public.marketplace_booking_links FOR SELECT TO authenticated
USING(public.is_tenant_member(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "marketplace booking link vendor read" ON public.marketplace_booking_links;
CREATE POLICY "marketplace booking link vendor read"
ON public.marketplace_booking_links FOR SELECT TO authenticated
USING(public.has_marketplace_vendor_access(
  tenant_id,vendor_id,auth.uid(),
  ARRAY['vendor_owner','vendor_admin','vendor_staff','vendor_viewer']
));

DROP POLICY IF EXISTS "marketplace booking link customer read" ON public.marketplace_booking_links;
CREATE POLICY "marketplace booking link customer read"
ON public.marketplace_booking_links FOR SELECT TO authenticated
USING(
  EXISTS(
    SELECT 1
    FROM public.customer_portal_users cu
    WHERE cu.tenant_id=marketplace_booking_links.tenant_id
      AND cu.tenant_product_id=marketplace_booking_links.tenant_product_id
      AND cu.user_id=auth.uid()
      AND cu.status='active'
      AND cu.crm_person_id::text=marketplace_booking_links.buyer_ref
  )
);

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.marketplace_booking_configs;
CREATE TRIGGER platform_touch_updated_at
BEFORE UPDATE ON public.marketplace_booking_configs
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

CREATE OR REPLACE FUNCTION public.create_booking_slot(
 _tenant uuid,_tenant_product uuid,_service uuid,_resource uuid,_location uuid,_customer_ref text,
 _starts_at timestamptz,_ends_at timestamptz,_timezone text,_party_size integer,_channel text,
 _idempotency_key text,_status text DEFAULT 'hold',_hold_expires_at timestamptz DEFAULT NULL,_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $booking_slot_v2$
DECLARE
  booking_id uuid;
  svc public.booking_services;
  res public.booking_resources;
  max_capacity integer;
  used_capacity integer;
  rule_count integer;
  matching_rule_capacity integer;
  resource_service_count integer;
BEGIN
  SELECT id INTO booking_id
  FROM public.bookings
  WHERE tenant_id=_tenant AND idempotency_key=_idempotency_key;
  IF booking_id IS NOT NULL THEN RETURN booking_id; END IF;

  IF _ends_at<=_starts_at OR _party_size<=0 OR _status NOT IN ('hold','confirmed') THEN
    RAISE EXCEPTION 'invalid_booking_request';
  END IF;

  SELECT * INTO svc
  FROM public.booking_services
  WHERE id=_service AND tenant_id=_tenant
    AND tenant_product_id=_tenant_product AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_service_not_found'; END IF;

  IF _resource IS NOT NULL THEN
    SELECT * INTO res
    FROM public.booking_resources
    WHERE id=_resource AND tenant_id=_tenant
      AND tenant_product_id=_tenant_product AND active=true;
    IF NOT FOUND THEN RAISE EXCEPTION 'booking_resource_not_found'; END IF;

    IF res.location_id IS NOT NULL AND _location IS NOT NULL AND res.location_id<>_location THEN
      RAISE EXCEPTION 'booking_resource_location_mismatch';
    END IF;

    SELECT count(*) INTO resource_service_count
    FROM public.booking_resource_services
    WHERE resource_id=_resource;
    IF resource_service_count>0 AND NOT EXISTS(
      SELECT 1 FROM public.booking_resource_services
      WHERE resource_id=_resource AND service_id=_service
    ) THEN
      RAISE EXCEPTION 'booking_resource_service_unavailable';
    END IF;

    SELECT count(*) INTO rule_count
    FROM public.booking_availability_rules ar
    WHERE ar.resource_id=_resource
      AND (ar.valid_from IS NULL OR ar.valid_from<=(_starts_at AT TIME ZONE ar.timezone)::date)
      AND (ar.valid_until IS NULL OR ar.valid_until>=(_starts_at AT TIME ZONE ar.timezone)::date);

    IF rule_count>0 THEN
      SELECT max(COALESCE(ar.capacity,res.capacity))::integer
      INTO matching_rule_capacity
      FROM public.booking_availability_rules ar
      WHERE ar.resource_id=_resource
        AND (ar.valid_from IS NULL OR ar.valid_from<=(_starts_at AT TIME ZONE ar.timezone)::date)
        AND (ar.valid_until IS NULL OR ar.valid_until>=(_starts_at AT TIME ZONE ar.timezone)::date)
        AND extract(dow FROM (_starts_at AT TIME ZONE ar.timezone))::integer=ar.weekday
        AND (_starts_at AT TIME ZONE ar.timezone)::date=(_ends_at AT TIME ZONE ar.timezone)::date
        AND (_starts_at AT TIME ZONE ar.timezone)::time>=ar.start_time
        AND (_ends_at AT TIME ZONE ar.timezone)::time<=ar.end_time;

      IF matching_rule_capacity IS NULL THEN
        RAISE EXCEPTION 'booking_resource_outside_availability';
      END IF;
      max_capacity:=LEAST(res.capacity,matching_rule_capacity);
    ELSE
      max_capacity:=res.capacity;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(_resource::text,0));
    SELECT COALESCE(sum(party_size),0)::integer
    INTO used_capacity
    FROM public.bookings
    WHERE tenant_id=_tenant
      AND resource_id=_resource
      AND status IN ('hold','confirmed','checked_in')
      AND (status<>'hold' OR hold_expires_at IS NULL OR hold_expires_at>now())
      AND starts_at<_ends_at
      AND ends_at>_starts_at;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(_service::text,0));
    max_capacity:=svc.capacity;
    SELECT COALESCE(sum(party_size),0)::integer
    INTO used_capacity
    FROM public.bookings
    WHERE tenant_id=_tenant
      AND service_id=_service
      AND resource_id IS NULL
      AND status IN ('hold','confirmed','checked_in')
      AND (status<>'hold' OR hold_expires_at IS NULL OR hold_expires_at>now())
      AND starts_at<_ends_at
      AND ends_at>_starts_at;
  END IF;

  IF used_capacity+_party_size>max_capacity THEN
    RAISE EXCEPTION 'booking_capacity_unavailable';
  END IF;

  INSERT INTO public.bookings(
    tenant_id,tenant_product_id,service_id,resource_id,location_id,customer_ref,
    starts_at,ends_at,timezone,party_size,status,channel,idempotency_key,
    hold_expires_at,metadata
  )
  VALUES(
    _tenant,_tenant_product,_service,_resource,_location,_customer_ref,
    _starts_at,_ends_at,_timezone,_party_size,_status,_channel,_idempotency_key,
    _hold_expires_at,COALESCE(_metadata,'{}'::jsonb)
  )
  RETURNING id INTO booking_id;

  RETURN booking_id;
END;
$booking_slot_v2$;

REVOKE EXECUTE ON FUNCTION public.create_booking_slot(
  uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,integer,text,text,text,timestamptz,jsonb
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_slot(
  uuid,uuid,uuid,uuid,uuid,text,timestamptz,timestamptz,text,integer,text,text,text,timestamptz,jsonb
) TO service_role;

COMMIT;
