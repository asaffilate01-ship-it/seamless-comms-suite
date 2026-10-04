BEGIN;

-- Reusable driver/rider and supplier operations promoted from the Onyn donor
-- marketplace so Dishbee+, Dishbee/Hive and other Omniqora products can share
-- the same operational primitives.

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status,metadata
) VALUES
('omniqora.driver-ops','Driver Operations','Driver onboarding/KYC evidence, shifts, breaks, earnings, vehicle inspections and payout-ready ledgers.','operations','omniqora',true,'automatic','active','built_main',
 '{"donor":"onyn","uses":["omniqora.dispatch","omniqora.fleet","omniqora.documents"]}'::jsonb),
('omniqora.supplier-ops','Supplier Operations','Supplier accounts, catalogue, purchase orders, invoices, returns and credit terms.','commerce','omniqora',true,'automatic','active','built_main',
 '{"donor":"onyn","scope":"b2b-supply"}'::jsonb)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,
  metadata=public.service_catalogue.metadata||EXCLUDED.metadata,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required) VALUES
('omniqora.driver-ops','omniqora.dispatch',true),
('omniqora.driver-ops','omniqora.fleet',true),
('omniqora.driver-ops','omniqora.documents',false),
('omniqora.supplier-ops','omniqora.inventory',false),
('omniqora.supplier-ops','omniqora.documents',false),
('omniqora.supplier-ops','omniqora.payments',false)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=EXCLUDED.required;

CREATE TABLE IF NOT EXISTS public.dispatch_agent_compliance(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  check_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN('pending','submitted','review','approved','rejected','expired','suspended')),
  reference text,
  issuer text,
  issued_at date,
  expires_at date,
  document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id,check_type)
);

CREATE TABLE IF NOT EXISTS public.dispatch_agent_shifts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK(status IN('draft','scheduled','confirmed','active','completed','cancelled','missed')),
  zone_ids uuid[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS dispatch_agent_shifts_agent_idx
  ON public.dispatch_agent_shifts(tenant_id,agent_id,starts_at);

CREATE TABLE IF NOT EXISTS public.dispatch_agent_breaks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shift_id uuid REFERENCES public.dispatch_agent_shifts(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(ended_at IS NULL OR ended_at>=started_at)
);

CREATE TABLE IF NOT EXISTS public.dispatch_agent_earnings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.dispatch_agents(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.dispatch_jobs(id) ON DELETE SET NULL,
  earning_type text NOT NULL CHECK(earning_type IN('delivery','wait_time','bonus','tip','adjustment','deduction')),
  amount_minor bigint NOT NULL,
  currency text NOT NULL DEFAULT 'GBP',
  status text NOT NULL DEFAULT 'earned' CHECK(status IN('pending','earned','approved','paid','reversed')),
  source_ref text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(tenant_id,source_ref)
);
CREATE INDEX IF NOT EXISTS dispatch_agent_earnings_agent_idx
  ON public.dispatch_agent_earnings(tenant_id,agent_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_vehicle_inspections(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.dispatch_vehicles(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.dispatch_agents(id) ON DELETE SET NULL,
  inspection_type text NOT NULL DEFAULT 'pre_shift',
  status text NOT NULL DEFAULT 'submitted'
    CHECK(status IN('draft','submitted','passed','failed','remedial','closed')),
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  odometer numeric,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  notes text,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.supply_partners(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  partner_key text NOT NULL,
  legal_name text NOT NULL,
  trading_name text,
  status text NOT NULL DEFAULT 'onboarding'
    CHECK(status IN('onboarding','active','paused','suspended','closed')),
  contact jsonb NOT NULL DEFAULT '{}'::jsonb,
  tax_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  payment_terms_days integer NOT NULL DEFAULT 0 CHECK(payment_terms_days BETWEEN 0 AND 365),
  credit_limit_minor bigint CHECK(credit_limit_minor IS NULL OR credit_limit_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  external_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,partner_key)
);

CREATE TABLE IF NOT EXISTS public.supply_catalogue_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.supply_partners(id) ON DELETE CASCADE,
  sku text NOT NULL,
  name text NOT NULL,
  description text,
  unit text NOT NULL DEFAULT 'each',
  pack_size numeric,
  price_minor bigint CHECK(price_minor IS NULL OR price_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  tax_rate numeric,
  lead_time_days integer CHECK(lead_time_days IS NULL OR lead_time_days>=0),
  minimum_order_quantity numeric,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(partner_id,sku)
);

CREATE TABLE IF NOT EXISTS public.supply_orders(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.supply_partners(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK(status IN('draft','submitted','accepted','partially_fulfilled','fulfilled','cancelled','disputed')),
  subtotal_minor bigint NOT NULL DEFAULT 0 CHECK(subtotal_minor>=0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK(tax_minor>=0),
  total_minor bigint NOT NULL DEFAULT 0 CHECK(total_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  expected_at timestamptz,
  submitted_at timestamptz,
  fulfilled_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,order_number)
);

CREATE TABLE IF NOT EXISTS public.supply_order_lines(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.supply_orders(id) ON DELETE CASCADE,
  catalogue_item_id uuid REFERENCES public.supply_catalogue_items(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  ordered_quantity numeric NOT NULL CHECK(ordered_quantity>0),
  received_quantity numeric NOT NULL DEFAULT 0 CHECK(received_quantity>=0),
  unit_price_minor bigint NOT NULL DEFAULT 0 CHECK(unit_price_minor>=0),
  line_total_minor bigint NOT NULL DEFAULT 0 CHECK(line_total_minor>=0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.supply_invoices(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.supply_partners(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.supply_orders(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL,
  due_date date,
  subtotal_minor bigint NOT NULL DEFAULT 0 CHECK(subtotal_minor>=0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK(tax_minor>=0),
  total_minor bigint NOT NULL DEFAULT 0 CHECK(total_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  status text NOT NULL DEFAULT 'received'
    CHECK(status IN('received','matched','approved','part_paid','paid','disputed','void')),
  document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
  provider_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(partner_id,invoice_number)
);

CREATE TABLE IF NOT EXISTS public.supply_returns(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.supply_partners(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.supply_orders(id) ON DELETE SET NULL,
  return_number text NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK(status IN('requested','authorised','collected','received','credited','rejected','cancelled')),
  reason text,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  credit_minor bigint CHECK(credit_minor IS NULL OR credit_minor>=0),
  currency text NOT NULL DEFAULT 'GBP',
  provider_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,return_number)
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dispatch_agent_compliance','dispatch_agent_shifts','dispatch_agent_breaks',
    'dispatch_agent_earnings','dispatch_vehicle_inspections','supply_partners',
    'supply_catalogue_items','supply_orders','supply_order_lines','supply_invoices','supply_returns'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
      'driver supplier tenant read',t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))',
      'driver supplier tenant write',t
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.driver_record_earning(
  _tenant uuid,_product text,_agent uuid,_job uuid,_type text,_amount bigint,
  _currency text,_source text,_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role'
     AND NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Driver earnings access denied';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.dispatch_agents
    WHERE id=_agent AND tenant_id=_tenant AND product_key=_product
  ) THEN RAISE EXCEPTION 'Driver not found'; END IF;
  INSERT INTO public.dispatch_agent_earnings(
    tenant_id,product_key,agent_id,job_id,earning_type,amount_minor,currency,status,
    source_ref,metadata
  ) VALUES(
    _tenant,_product,_agent,_job,_type,_amount,upper(coalesce(nullif(trim(_currency),''),'GBP')),
    'earned',_source,coalesce(_metadata,'{}'::jsonb)
  )
  ON CONFLICT(tenant_id,source_ref) DO UPDATE SET metadata=EXCLUDED.metadata
  RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.driver_record_earning(uuid,text,uuid,uuid,text,bigint,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.driver_record_earning(uuid,text,uuid,uuid,text,bigint,text,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.supply_recalculate_order(_order uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.supply_orders%rowtype;sub bigint;tax bigint;total bigint;
BEGIN
  SELECT * INTO o FROM public.supply_orders WHERE id=_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supply order not found'; END IF;
  IF NOT public.can_write(o.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())
     AND COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Supply order access denied';
  END IF;
  SELECT COALESCE(sum(line_total_minor),0)::bigint INTO sub FROM public.supply_order_lines WHERE order_id=_order;
  tax:=COALESCE((o.metadata->>'taxMinor')::bigint,0);
  total:=sub+greatest(tax,0);
  UPDATE public.supply_orders SET subtotal_minor=sub,tax_minor=greatest(tax,0),total_minor=total,updated_at=now() WHERE id=_order;
  RETURN jsonb_build_object('subtotalMinor',sub,'taxMinor',greatest(tax,0),'totalMinor',total,'currency',o.currency);
END $$;
REVOKE ALL ON FUNCTION public.supply_recalculate_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.supply_recalculate_order(uuid) TO authenticated,service_role;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('dishbee-plus','omniqora.driver-ops',false,false),
('dishbee-plus','omniqora.supplier-ops',false,false),
('dishbee-one','omniqora.driver-ops',false,false),
('dishbee-one','omniqora.supplier-ops',false,false),
('mealdeck','omniqora.driver-ops',false,false),
('mealdeck','omniqora.supplier-ops',false,false)
ON CONFLICT(product_key,service_key) DO UPDATE SET
  default_enabled=EXCLUDED.default_enabled,required=EXCLUDED.required;

COMMIT;
