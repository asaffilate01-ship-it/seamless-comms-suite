BEGIN;

-- Shared Commerce / EPOS Core for products that need tills, mobile POS, kiosk or in-person settlement.
-- Vertical products keep domain objects (restaurant orders, salon bookings, vehicle deposits) and reference them.

CREATE TABLE IF NOT EXISTS public.commerce_terminals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
 external_ref text,
 name text NOT NULL,
 terminal_type text NOT NULL DEFAULT 'epos'
   CHECK(terminal_type IN('epos','mpos','kiosk','counter','self_checkout','virtual')),
 payment_binding_id uuid REFERENCES public.provider_bindings(id) ON DELETE SET NULL,
 fiscal_profile_id uuid,
 status text NOT NULL DEFAULT 'active'
   CHECK(status IN('planned','active','degraded','offline','disabled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 last_seen_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_terminal_external_uq
 ON public.commerce_terminals(tenant_id,product_key,external_ref)
 WHERE external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commerce_till_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 terminal_id uuid NOT NULL REFERENCES public.commerce_terminals(id) ON DELETE RESTRICT,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 opened_at timestamptz NOT NULL DEFAULT now(),
 closed_at timestamptz,
 opening_cash_minor bigint NOT NULL DEFAULT 0,
 expected_cash_minor bigint,
 counted_cash_minor bigint,
 currency text NOT NULL DEFAULT 'GBP',
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closing','closed','cancelled')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_one_open_till_uq
 ON public.commerce_till_sessions(terminal_id)
 WHERE status IN('open','closing');

CREATE TABLE IF NOT EXISTS public.commerce_sales(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 terminal_id uuid REFERENCES public.commerce_terminals(id) ON DELETE SET NULL,
 till_session_id uuid REFERENCES public.commerce_till_sessions(id) ON DELETE SET NULL,
 external_context_type text,
 external_context_id text,
 customer_ref text,
 staff_ref text,
 source text NOT NULL DEFAULT 'epos'
   CHECK(source IN('epos','mpos','kiosk','web','qr','phone','marketplace','other')),
 status text NOT NULL DEFAULT 'open'
   CHECK(status IN('open','payment_pending','authorised','paid','void','partially_refunded','refunded','cancelled')),
 currency text NOT NULL DEFAULT 'GBP',
 subtotal_minor bigint NOT NULL DEFAULT 0,
 discount_minor bigint NOT NULL DEFAULT 0,
 tax_minor bigint NOT NULL DEFAULT 0,
 service_charge_minor bigint NOT NULL DEFAULT 0,
 tip_minor bigint NOT NULL DEFAULT 0,
 total_minor bigint NOT NULL DEFAULT 0,
 paid_minor bigint NOT NULL DEFAULT 0,
 refunded_minor bigint NOT NULL DEFAULT 0,
 idempotency_key text NOT NULL,
 notes text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 paid_at timestamptz,
 UNIQUE(tenant_id,product_key,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.commerce_sale_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 line_type text NOT NULL DEFAULT 'item'
   CHECK(line_type IN('item','service','package','membership','deposit','fee','discount','gift_card','other')),
 external_ref text,
 sku text,
 name text NOT NULL,
 quantity numeric NOT NULL CHECK(quantity>0),
 unit_price_minor bigint NOT NULL,
 discount_minor bigint NOT NULL DEFAULT 0,
 tax_minor bigint NOT NULL DEFAULT 0,
 line_total_minor bigint NOT NULL,
 staff_ref text,
 commission_ref text,
 modifiers jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.commerce_tenders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 tender_type text NOT NULL
   CHECK(tender_type IN('cash','card','wallet','gift_card','bank','payment_link','voucher','credit_account','other')),
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 provider_binding_id uuid REFERENCES public.provider_bindings(id) ON DELETE SET NULL,
 provider_ref text,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency text NOT NULL,
 status text NOT NULL DEFAULT 'pending'
   CHECK(status IN('pending','requires_action','authorised','captured','failed','cancelled','refunded')),
 idempotency_key text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.commerce_refunds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 tender_id uuid REFERENCES public.commerce_tenders(id) ON DELETE SET NULL,
 refund_type text NOT NULL DEFAULT 'refund'
   CHECK(refund_type IN('refund','void','adjustment','goodwill')),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency text NOT NULL,
 reason text,
 status text NOT NULL DEFAULT 'pending'
   CHECK(status IN('pending','processing','succeeded','failed','cancelled')),
 provider_ref text,
 authorised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 customer_signature_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.commerce_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 receipt_number text NOT NULL,
 receipt_type text NOT NULL DEFAULT 'sale'
   CHECK(receipt_type IN('sale','refund','void','proforma','duplicate')),
 rendered jsonb NOT NULL DEFAULT '{}'::jsonb,
 email_to text,
 sms_to text,
 printed boolean NOT NULL DEFAULT false,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commerce_receipts ADD COLUMN IF NOT EXISTS product_key text;
UPDATE public.commerce_receipts r
SET product_key=s.product_key
FROM public.commerce_sales s
WHERE r.sale_id=s.id AND r.product_key IS NULL;
ALTER TABLE public.commerce_receipts ALTER COLUMN product_key SET NOT NULL;
ALTER TABLE public.commerce_receipts
 ADD CONSTRAINT commerce_receipts_product_key_fkey
 FOREIGN KEY(product_key) REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_receipt_number_uq
 ON public.commerce_receipts(tenant_id,product_key,receipt_number);

CREATE TABLE IF NOT EXISTS public.commerce_cash_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 till_session_id uuid NOT NULL REFERENCES public.commerce_till_sessions(id) ON DELETE CASCADE,
 event_type text NOT NULL
   CHECK(event_type IN('opening_float','cash_sale','refund','cash_in','cash_out','safe_drop','correction','closing_count')),
 amount_minor bigint NOT NULL,
 reference text,
 note text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_staff_attribution(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 sale_line_id uuid REFERENCES public.commerce_sale_lines(id) ON DELETE CASCADE,
 staff_ref text NOT NULL,
 attribution_type text NOT NULL DEFAULT 'service'
   CHECK(attribution_type IN('service','sale','upsell','commission','tip')),
 amount_minor bigint NOT NULL DEFAULT 0,
 rate_bps integer,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.commerce_display_state(
 terminal_id uuid PRIMARY KEY REFERENCES public.commerce_terminals(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 state_type text NOT NULL DEFAULT 'idle'
   CHECK(state_type IN('idle','basket','consent','payment_pending','paid','message')),
 state jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_offline_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 terminal_id uuid REFERENCES public.commerce_terminals(id) ON DELETE SET NULL,
 client_event_id uuid NOT NULL,
 event_type text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'received'
   CHECK(status IN('received','processed','rejected')),
 error_message text,
 received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 UNIQUE(tenant_id,product_key,client_event_id)
);

CREATE TABLE IF NOT EXISTS public.commerce_fiscal_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
 jurisdiction text NOT NULL,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'planned'
   CHECK(status IN('planned','testing','active','degraded','disabled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commerce_terminals
 ADD CONSTRAINT commerce_terminals_fiscal_profile_id_fkey
 FOREIGN KEY(fiscal_profile_id) REFERENCES public.commerce_fiscal_profiles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.commerce_fiscal_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 fiscal_profile_id uuid NOT NULL REFERENCES public.commerce_fiscal_profiles(id) ON DELETE CASCADE,
 sale_id uuid NOT NULL REFERENCES public.commerce_sales(id) ON DELETE CASCADE,
 receipt_id uuid REFERENCES public.commerce_receipts(id) ON DELETE SET NULL,
 provider_transaction_ref text,
 fiscal_sequence text,
 fiscal_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 signature text,
 status text NOT NULL DEFAULT 'pending'
   CHECK(status IN('pending','signed','failed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY[
  'commerce_terminals','commerce_till_sessions','commerce_sales','commerce_sale_lines',
  'commerce_tenders','commerce_refunds','commerce_receipts','commerce_cash_events',
  'commerce_staff_attribution','commerce_display_state','commerce_offline_events',
  'commerce_fiscal_profiles','commerce_fiscal_records'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','commerce core read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','commerce core write',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.commerce_recalculate_sale(_tenant uuid,_sale uuid)
RETURNS public.commerce_sales
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.commerce_sales%rowtype;sub bigint;disc bigint;tax bigint;total bigint;paid bigint;refund bigint;
BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Commerce access denied';END IF;
 SELECT * INTO s FROM public.commerce_sales WHERE id=_sale AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found';END IF;
 SELECT coalesce(sum(greatest(line_total_minor,0)),0),coalesce(sum(greatest(discount_minor,0)),0),coalesce(sum(greatest(tax_minor,0)),0)
 INTO sub,disc,tax
 FROM public.commerce_sale_lines WHERE sale_id=s.id;
 total:=greatest(sub-disc+s.service_charge_minor+s.tip_minor,0);
 SELECT coalesce(sum(amount_minor),0) INTO paid FROM public.commerce_tenders
 WHERE sale_id=s.id AND status='captured';
 SELECT coalesce(sum(amount_minor),0) INTO refund FROM public.commerce_refunds
 WHERE sale_id=s.id AND status='succeeded';
 UPDATE public.commerce_sales
 SET subtotal_minor=sub,discount_minor=disc,tax_minor=tax,total_minor=total,
     paid_minor=paid,refunded_minor=refund,
     status=CASE
       WHEN refund>=total AND total>0 THEN 'refunded'
       WHEN refund>0 THEN 'partially_refunded'
       WHEN paid>=total AND total>0 THEN 'paid'
       WHEN paid>0 THEN 'payment_pending'
       ELSE status END,
     paid_at=CASE WHEN paid>=total AND total>0 THEN coalesce(paid_at,now()) ELSE paid_at END,
     updated_at=now()
 WHERE id=s.id RETURNING * INTO s;
 RETURN s;
END;$$;
REVOKE ALL ON FUNCTION public.commerce_recalculate_sale(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commerce_recalculate_sale(uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.commerce_capture_tender(
 _tenant uuid,_sale uuid,_tender_type text,_amount bigint,_currency text,_idempotency text,
 _provider text DEFAULT NULL,_provider_ref text DEFAULT NULL,_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tid uuid;
BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Commerce access denied';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.commerce_sales WHERE id=_sale AND tenant_id=_tenant) THEN RAISE EXCEPTION 'Sale not found';END IF;
 INSERT INTO public.commerce_tenders(
  tenant_id,sale_id,tender_type,provider_key,provider_ref,amount_minor,currency,status,idempotency_key,metadata
 ) VALUES(_tenant,_sale,_tender_type,_provider,_provider_ref,_amount,upper(_currency),'captured',_idempotency,coalesce(_metadata,'{}'::jsonb))
 ON CONFLICT(tenant_id,idempotency_key) DO UPDATE SET provider_ref=coalesce(EXCLUDED.provider_ref,public.commerce_tenders.provider_ref)
 RETURNING id INTO tid;
 PERFORM public.commerce_recalculate_sale(_tenant,_sale);
 RETURN tid;
END;$$;
REVOKE ALL ON FUNCTION public.commerce_capture_tender(uuid,uuid,text,bigint,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commerce_capture_tender(uuid,uuid,text,bigint,text,text,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.commerce_ingest_offline_event(
 _tenant uuid,_product text,_terminal uuid,_client_event uuid,_event_type text,_payload jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result bigint;
BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Commerce access denied';END IF;
 INSERT INTO public.commerce_offline_events(tenant_id,product_key,terminal_id,client_event_id,event_type,payload)
 VALUES(_tenant,_product,_terminal,_client_event,_event_type,coalesce(_payload,'{}'::jsonb))
 ON CONFLICT(tenant_id,product_key,client_event_id) DO UPDATE SET payload=EXCLUDED.payload
 RETURNING id INTO result;
 RETURN result;
END;$$;
REVOKE ALL ON FUNCTION public.commerce_ingest_offline_event(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.commerce_ingest_offline_event(uuid,text,uuid,uuid,text,jsonb) TO authenticated,service_role;

INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status
) VALUES
 ('fiscal.de-tse','Germany Fiscalisation / TSE Adapter','fiscal',ARRAY['tse','receipt_signing','export'],ARRAY['DE'],ARRAY[]::text[],ARRAY['provider'],'planned','catalogue_only')
ON CONFLICT(provider_key) DO UPDATE SET capabilities=EXCLUDED.capabilities,supported_countries=EXCLUDED.supported_countries,updated_at=now();

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.commerce','Commerce / EPOS Core','Reusable till, sale, tender, refund, receipt, device, display and offline transaction primitives.','commerce','omniqora',true,'automatic','active','built_main'),
 ('omniqora.commerce-fiscal','Commerce Fiscal Adapters','Jurisdiction-specific fiscalisation boundary for shared EPOS products.','commerce','omniqora',true,'external','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET description=EXCLUDED.description,implementation_status='built_main',status='active',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.commerce','omniqora.payments'),
 ('omniqora.commerce-fiscal','omniqora.commerce')
ON CONFLICT DO NOTHING;

COMMIT;