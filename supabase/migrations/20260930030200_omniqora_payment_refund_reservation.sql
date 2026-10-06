-- Concurrency-safe payment refund reservation.
BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_payment_refund(
 _tenant uuid,_payment uuid,_amount bigint,_idempotency_key text,_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE p public.payment_intents; existing_id uuid; refunded bigint; refund_id uuid;
BEGIN
 IF _amount<=0 THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;
 SELECT id INTO existing_id FROM public.payment_refunds
  WHERE tenant_id=_tenant AND idempotency_key=_idempotency_key;
 IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

 SELECT * INTO p FROM public.payment_intents WHERE id=_payment AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;
 IF p.status NOT IN ('captured','partially_refunded','refunded') THEN
  RAISE EXCEPTION 'captured_payment_required';
 END IF;

 SELECT COALESCE(sum(amount_minor),0)::bigint INTO refunded
 FROM public.payment_refunds
 WHERE tenant_id=_tenant AND payment_intent_id=p.id AND status IN ('pending','succeeded');

 IF refunded+_amount>p.amount_minor THEN RAISE EXCEPTION 'refund_exceeds_remaining_amount'; END IF;

 INSERT INTO public.payment_refunds(
  tenant_id,payment_intent_id,amount_minor,status,reason,idempotency_key,metadata
 ) VALUES(
  _tenant,p.id,_amount,'pending',_reason,_idempotency_key,'{}'::jsonb
 ) RETURNING id INTO refund_id;
 RETURN refund_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_payment_refund(uuid,uuid,bigint,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_payment_refund(uuid,uuid,bigint,text,text)
 TO service_role;

COMMIT;
