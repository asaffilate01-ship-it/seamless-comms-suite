BEGIN;

ALTER TABLE public.commerce_refunds
 ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_refund_idempotency_uq
 ON public.commerce_refunds(tenant_id,idempotency_key)
 WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.project_commerce_shadow_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 p jsonb:=NEW.payload;
 sale_id uuid;
 source_tx text;
 line jsonb;
 tender_type text;
 refund_amount bigint;
 total_paid bigint;
 total_refunded bigint;
 sale_total bigint;
BEGIN
 IF NEW.event_type LIKE '%.commerce.sale.paid' THEN
  source_tx:=coalesce(nullif(p->>'sourceTransactionId',''),NEW.subject_id);
  INSERT INTO public.commerce_sales(
   tenant_id,product_key,location_id,external_context_type,external_context_id,customer_ref,staff_ref,source,status,currency,
   subtotal_minor,discount_minor,tax_minor,service_charge_minor,tip_minor,total_minor,paid_minor,idempotency_key,notes,metadata,paid_at
  ) VALUES(
   NEW.tenant_id,NEW.product_key,NEW.location_id,
   coalesce(p->>'contextType','beauty_pos'),source_tx,p->>'customerRef',p->>'staffRef','epos','paid',
   upper(coalesce(p->>'currency','GBP')),
   greatest(coalesce((p->>'subtotalMinor')::bigint,0),0),
   greatest(coalesce((p->>'discountMinor')::bigint,0),0),
   greatest(coalesce((p->>'taxMinor')::bigint,0),0),
   greatest(coalesce((p->>'serviceChargeMinor')::bigint,0),0),
   greatest(coalesce((p->>'tipMinor')::bigint,0),0),
   greatest(coalesce((p->>'totalMinor')::bigint,0),0),
   greatest(coalesce((p->>'totalMinor')::bigint,0),0),
   'shadow:'||NEW.product_key||':'||source_tx,
   p->>'notes',
   jsonb_build_object(
    'shadow',true,'sourceEventId',NEW.id,'sourceSubjectId',NEW.subject_id,
    'sourceLocationRef',p->>'sourceLocationRef','bookingId',p->>'bookingId'
   )||coalesce(p->'metadata','{}'::jsonb),
   NEW.occurred_at
  )
  ON CONFLICT(tenant_id,product_key,idempotency_key) DO UPDATE SET
   location_id=coalesce(EXCLUDED.location_id,public.commerce_sales.location_id),
   customer_ref=coalesce(EXCLUDED.customer_ref,public.commerce_sales.customer_ref),
   staff_ref=coalesce(EXCLUDED.staff_ref,public.commerce_sales.staff_ref),
   subtotal_minor=EXCLUDED.subtotal_minor,discount_minor=EXCLUDED.discount_minor,
   tax_minor=EXCLUDED.tax_minor,service_charge_minor=EXCLUDED.service_charge_minor,
   tip_minor=EXCLUDED.tip_minor,total_minor=EXCLUDED.total_minor,paid_minor=EXCLUDED.paid_minor,
   status='paid',metadata=public.commerce_sales.metadata||EXCLUDED.metadata,updated_at=now()
  RETURNING id INTO sale_id;

  DELETE FROM public.commerce_sale_lines WHERE sale_id=sale_id;
  IF jsonb_typeof(p->'items')='array' THEN
   FOR line IN SELECT value FROM jsonb_array_elements(p->'items') LOOP
    INSERT INTO public.commerce_sale_lines(
     tenant_id,sale_id,line_type,external_ref,sku,name,quantity,unit_price_minor,discount_minor,tax_minor,line_total_minor,
     staff_ref,modifiers,metadata
    ) VALUES(
     NEW.tenant_id,sale_id,
     coalesce(nullif(line->>'lineType',''),'service'),
     line->>'externalRef',line->>'sku',coalesce(line->>'name','Item'),
     greatest(coalesce((line->>'quantity')::numeric,1),0.0001),
     coalesce((line->>'unitPriceMinor')::bigint,0),
     greatest(coalesce((line->>'discountMinor')::bigint,0),0),
     greatest(coalesce((line->>'taxMinor')::bigint,0),0),
     coalesce((line->>'lineTotalMinor')::bigint,
       round(coalesce((line->>'unitPriceMinor')::numeric,0)*greatest(coalesce((line->>'quantity')::numeric,1),0.0001))::bigint),
     line->>'staffRef',coalesce(line->'modifiers','[]'::jsonb),coalesce(line->'metadata','{}'::jsonb)
    );
   END LOOP;
  END IF;

  tender_type:=case lower(coalesce(p->>'paymentMethod','other'))
   when 'cash' then 'cash'
   when 'card' then 'card'
   when 'split' then 'other'
   when 'wallet' then 'wallet'
   when 'gift_card' then 'gift_card'
   else 'other' end;

  INSERT INTO public.commerce_tenders(
   tenant_id,sale_id,tender_type,amount_minor,currency,status,idempotency_key,provider_ref,metadata
  ) VALUES(
   NEW.tenant_id,sale_id,tender_type,greatest(coalesce((p->>'totalMinor')::bigint,0),0),
   upper(coalesce(p->>'currency','GBP')),'captured',
   'shadow:'||NEW.product_key||':'||source_tx||':tender',
   p->>'paymentReference',jsonb_build_object('shadow',true,'sourceEventId',NEW.id)
  )
  ON CONFLICT(tenant_id,idempotency_key) DO UPDATE SET
   amount_minor=EXCLUDED.amount_minor,provider_ref=coalesce(EXCLUDED.provider_ref,public.commerce_tenders.provider_ref),
   status='captured',updated_at=now();

 ELSIF NEW.event_type LIKE '%.commerce.refund.succeeded' THEN
  source_tx:=coalesce(nullif(p->>'sourceTransactionId',''),nullif(p->>'originalTransactionId',''),p->>'bookingId');
  SELECT id,total_minor INTO sale_id,sale_total
  FROM public.commerce_sales
  WHERE tenant_id=NEW.tenant_id AND product_key=NEW.product_key
    AND (
      external_context_id=source_tx
      OR metadata->>'bookingId'=source_tx
    )
  ORDER BY created_at DESC LIMIT 1;

  IF sale_id IS NOT NULL THEN
   refund_amount:=greatest(coalesce((p->>'amountMinor')::bigint,0),0);
   INSERT INTO public.commerce_refunds(
    tenant_id,sale_id,refund_type,amount_minor,currency,reason,status,provider_ref,customer_signature_ref,metadata,completed_at,idempotency_key
   ) VALUES(
    NEW.tenant_id,sale_id,coalesce(p->>'refundType','refund'),refund_amount,
    upper(coalesce(p->>'currency','GBP')),p->>'reason','succeeded',p->>'paymentReference',
    p->>'signatureRef',jsonb_build_object('shadow',true,'sourceEventId',NEW.id)||coalesce(p->'metadata','{}'::jsonb),
    NEW.occurred_at,'shadow:'||NEW.product_key||':refund:'||NEW.subject_id
   )
   ON CONFLICT(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET
    amount_minor=EXCLUDED.amount_minor,status='succeeded',reason=EXCLUDED.reason,completed_at=EXCLUDED.completed_at;

   SELECT coalesce(sum(amount_minor),0) INTO total_paid
   FROM public.commerce_tenders WHERE sale_id=project_commerce_shadow_event.sale_id AND status='captured';
   SELECT coalesce(sum(amount_minor),0) INTO total_refunded
   FROM public.commerce_refunds WHERE sale_id=project_commerce_shadow_event.sale_id AND status='succeeded';

   UPDATE public.commerce_sales SET
    paid_minor=total_paid,refunded_minor=total_refunded,
    status=case when total_refunded>=sale_total and sale_total>0 then 'refunded' else 'partially_refunded' end,
    updated_at=now()
   WHERE id=project_commerce_shadow_event.sale_id;
  END IF;
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN
 RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS platform_project_commerce_shadow ON public.platform_events;
CREATE TRIGGER platform_project_commerce_shadow
AFTER INSERT ON public.platform_events
FOR EACH ROW
WHEN (
 NEW.event_type LIKE '%.commerce.sale.paid'
 OR NEW.event_type LIKE '%.commerce.refund.succeeded'
)
EXECUTE FUNCTION public.project_commerce_shadow_event();

REVOKE ALL ON FUNCTION public.project_commerce_shadow_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_commerce_shadow_event() TO service_role;

COMMIT;