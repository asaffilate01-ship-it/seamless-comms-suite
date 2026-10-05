-- Deterministic booking lifecycle for paid marketplace bookings.
BEGIN;

CREATE OR REPLACE FUNCTION public.transition_booking(
  _booking uuid,
  _status text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $booking_transition$
DECLARE
  b public.bookings;
  tp public.tenant_products;
  allowed boolean:=false;
BEGIN
  SELECT * INTO b
  FROM public.bookings
  WHERE id=_booking
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found'; END IF;

  SELECT * INTO tp
  FROM public.tenant_products
  WHERE id=b.tenant_product_id
    AND tenant_id=b.tenant_id
    AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'active_tenant_product_required'; END IF;

  allowed:=CASE b.status
    WHEN 'hold' THEN _status IN ('confirmed','cancelled','expired')
    WHEN 'confirmed' THEN _status IN ('checked_in','cancelled','no_show')
    WHEN 'checked_in' THEN _status IN ('completed','cancelled')
    ELSE false
  END;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid_booking_transition:%->%',b.status,_status;
  END IF;

  IF b.status='hold' AND _status='confirmed'
     AND b.hold_expires_at IS NOT NULL
     AND b.hold_expires_at<=now() THEN
    RAISE EXCEPTION 'booking_hold_expired';
  END IF;

  UPDATE public.bookings
  SET status=_status,
      metadata=metadata||COALESCE(_metadata,'{}'::jsonb),
      hold_expires_at=CASE WHEN _status='confirmed' THEN NULL ELSE hold_expires_at END,
      updated_at=now()
  WHERE id=b.id;

  INSERT INTO public.platform_events(
    id,tenant_id,tenant_product_id,product_key,event_type,event_version,
    occurred_at,environment,subject_type,subject_id,correlation_id,
    causation_id,idempotency_key,data_classification,payload
  ) VALUES(
    gen_random_uuid()::text,b.tenant_id,b.tenant_product_id,tp.product_key,
    'booking.'||_status,1,now(),'production','booking',b.id::text,b.id::text,NULL,
    'booking:'||b.id::text||':'||_status,'confidential',
    jsonb_build_object(
      'bookingId',b.id,'status',_status,'customerRef',b.customer_ref,
      'serviceId',b.service_id,'resourceId',b.resource_id,'locationId',b.location_id
    )
  )
  ON CONFLICT DO NOTHING;
END;
$booking_transition$;

REVOKE EXECUTE ON FUNCTION public.transition_booking(uuid,text,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_booking(uuid,text,jsonb)
  TO service_role;

INSERT INTO public.platform_module_event_patterns(module_key,event_pattern) VALUES
  ('bookings.core','payment.captured'),
  ('bookings.core','payment.failed'),
  ('bookings.core','payment.cancelled')
ON CONFLICT(module_key,event_pattern) DO UPDATE SET enabled=true;

COMMIT;
