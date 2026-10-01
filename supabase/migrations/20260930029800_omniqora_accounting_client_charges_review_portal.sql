-- Client resale charging and client-answerable accounting review items.
BEGIN;

CREATE TABLE IF NOT EXISTS public.practice_client_service_charges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 service_id uuid NOT NULL REFERENCES public.practice_client_services(id) ON DELETE CASCADE,
 period_start date NOT NULL,
 period_end date NOT NULL,
 quantity numeric NOT NULL DEFAULT 1 CHECK(quantity>=0),
 unit_price_minor bigint NOT NULL DEFAULT 0 CHECK(unit_price_minor>=0),
 total_minor bigint NOT NULL DEFAULT 0 CHECK(total_minor>=0),
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 charge_mode text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','waived','invoiced','paid','cancelled')),
 invoice_ref text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end>=period_start),
 UNIQUE(service_id,period_start,period_end)
);
CREATE INDEX IF NOT EXISTS practice_client_service_charges_client_idx
 ON public.practice_client_service_charges(tenant_id,practice_client_id,status,period_start DESC);

ALTER TABLE public.accounting_review_items
 ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'staff'
 CHECK(audience IN ('staff','client','both'));

ALTER TABLE public.practice_client_service_charges ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.practice_client_service_charges TO authenticated;
GRANT ALL ON public.practice_client_service_charges TO service_role;
DROP POLICY IF EXISTS "client service charges staff read" ON public.practice_client_service_charges;
CREATE POLICY "client service charges staff read" ON public.practice_client_service_charges FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "client service charges staff write" ON public.practice_client_service_charges;
CREATE POLICY "client service charges staff write" ON public.practice_client_service_charges FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

-- Replace staff-only accounting review read/write with staff + limited client-answer access.
DROP POLICY IF EXISTS "accounting staff read" ON public.accounting_review_items;
DROP POLICY IF EXISTS "accounting staff write" ON public.accounting_review_items;
CREATE POLICY "accounting review staff read" ON public.accounting_review_items FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "accounting review staff write" ON public.accounting_review_items FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));
CREATE POLICY "accounting review client read" ON public.accounting_review_items FOR SELECT TO authenticated
 USING(
  audience IN ('client','both')
  AND EXISTS(
   SELECT 1 FROM public.accounting_staging_entries p
   WHERE p.id=proposal_id AND p.tenant_id=accounting_review_items.tenant_id
     AND public.has_practice_client_access(p.practice_client_id,auth.uid())
  )
 );
CREATE POLICY "accounting review client answer" ON public.accounting_review_items FOR UPDATE TO authenticated
 USING(
  audience IN ('client','both') AND status='open'
  AND EXISTS(
   SELECT 1 FROM public.accounting_staging_entries p
   WHERE p.id=proposal_id AND p.tenant_id=accounting_review_items.tenant_id
     AND public.has_practice_client_access(p.practice_client_id,auth.uid())
  )
 )
 WITH CHECK(
  audience IN ('client','both') AND status IN ('open','answered')
  AND EXISTS(
   SELECT 1 FROM public.accounting_staging_entries p
   WHERE p.id=proposal_id AND p.tenant_id=accounting_review_items.tenant_id
     AND public.has_practice_client_access(p.practice_client_id,auth.uid())
  )
 );

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.practice_client_service_charges;
CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.practice_client_service_charges
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

CREATE OR REPLACE FUNCTION public.create_practice_client_service_charge(
 _tenant uuid,_service uuid,_period_start date,_period_end date,_quantity numeric,_custom_total bigint,_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE s public.practice_client_services; charge_id uuid; unit_price bigint; total bigint; charge_status text; charge_currency text;
BEGIN
 SELECT * INTO s FROM public.practice_client_services WHERE id=_service AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND OR NOT s.enabled THEN RAISE EXCEPTION 'active_client_service_required'; END IF;
 IF _period_end<_period_start OR _quantity<0 THEN RAISE EXCEPTION 'invalid_charge_period_or_quantity'; END IF;
 charge_currency:=s.currency;
 IF s.commercial_mode IN ('included','free') THEN
  unit_price:=0;total:=0;charge_status:='waived';
 ELSIF s.commercial_mode IN ('fixed_monthly','fixed_annual') THEN
  IF s.price_minor IS NULL OR s.currency IS NULL THEN RAISE EXCEPTION 'client_service_price_required'; END IF;
  unit_price:=s.price_minor;total:=s.price_minor;charge_status:='pending';
 ELSIF s.commercial_mode='usage' THEN
  IF s.price_minor IS NULL OR s.currency IS NULL THEN RAISE EXCEPTION 'client_service_price_required'; END IF;
  unit_price:=s.price_minor;total:=round(s.price_minor*_quantity)::bigint;charge_status:='pending';
 ELSE
  IF _custom_total IS NULL OR _custom_total<0 THEN RAISE EXCEPTION 'custom_total_required'; END IF;
  unit_price:=CASE WHEN _quantity>0 THEN round(_custom_total/_quantity)::bigint ELSE _custom_total END;
  total:=_custom_total;charge_status:=CASE WHEN _custom_total=0 THEN 'waived' ELSE 'pending' END;
 END IF;

 INSERT INTO public.practice_client_service_charges(
  tenant_id,tenant_product_id,practice_client_id,service_id,period_start,period_end,quantity,
  unit_price_minor,total_minor,currency,charge_mode,status,created_by
 ) VALUES(
  s.tenant_id,s.tenant_product_id,s.practice_client_id,s.id,_period_start,_period_end,_quantity,
  unit_price,total,charge_currency,s.commercial_mode,charge_status,_actor
 )
 ON CONFLICT(service_id,period_start,period_end) DO UPDATE SET
  quantity=EXCLUDED.quantity,unit_price_minor=EXCLUDED.unit_price_minor,total_minor=EXCLUDED.total_minor,
  currency=EXCLUDED.currency,charge_mode=EXCLUDED.charge_mode,
  status=CASE WHEN public.practice_client_service_charges.status IN ('invoiced','paid') THEN public.practice_client_service_charges.status ELSE EXCLUDED.status END,
  updated_at=now()
 RETURNING id INTO charge_id;
 RETURN charge_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_practice_client_service_charge(uuid,uuid,date,date,numeric,bigint,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_practice_client_service_charge(uuid,uuid,date,date,numeric,bigint,uuid)
 TO service_role;

COMMIT;
