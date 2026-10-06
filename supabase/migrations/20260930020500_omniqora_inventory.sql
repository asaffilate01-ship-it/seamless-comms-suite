-- Shared inventory engine.
BEGIN;

INSERT INTO public.platform_modules(module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities) VALUES
 ('inventory.core','Omniqora Inventory','inventory','1.0.0-preview','preview','hybrid',
  ARRAY['platform.tenant','platform.events','platform.audit'],
  ARRAY['items','balances','movements','reservations','transfers','low_stock','valuation'])
ON CONFLICT(module_key) DO UPDATE SET
 name=EXCLUDED.name,module_kind=EXCLUDED.module_kind,version=EXCLUDED.version,status=EXCLUDED.status,
 ui_mode=EXCLUDED.ui_mode,dependencies=EXCLUDED.dependencies,capabilities=EXCLUDED.capabilities,updated_at=now();

UPDATE public.platform_modules
SET dependencies=ARRAY['crm.core','inventory.core','platform.events'],updated_at=now()
WHERE module_key='marketplace.core';

CREATE TABLE IF NOT EXISTS public.inventory_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 product_key text NOT NULL,
 external_ref text NOT NULL,
 sku text,
 name text NOT NULL,
 unit text NOT NULL DEFAULT 'each',
 track_stock boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,external_ref)
);
CREATE INDEX IF NOT EXISTS inventory_items_sku_idx ON public.inventory_items(tenant_id,sku);

CREATE TABLE IF NOT EXISTS public.inventory_stock_locations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
 external_ref text,
 name text NOT NULL,
 location_kind text NOT NULL CHECK(location_kind IN ('store','warehouse','kitchen','vehicle','virtual','supplier')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS inventory_stock_locations_external_uq
 ON public.inventory_stock_locations(tenant_id,COALESCE(tenant_product_id,'00000000-0000-0000-0000-000000000000'::uuid),COALESCE(external_ref,id::text));

CREATE TABLE IF NOT EXISTS public.inventory_stock_balances(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
 stock_location_id uuid NOT NULL REFERENCES public.inventory_stock_locations(id) ON DELETE CASCADE,
 on_hand numeric NOT NULL DEFAULT 0,
 reserved numeric NOT NULL DEFAULT 0 CHECK(reserved>=0),
 reorder_point numeric,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(item_id,stock_location_id)
);
CREATE INDEX IF NOT EXISTS inventory_stock_balances_tenant_idx ON public.inventory_stock_balances(tenant_id,stock_location_id);

CREATE TABLE IF NOT EXISTS public.inventory_stock_movements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
 stock_location_id uuid NOT NULL REFERENCES public.inventory_stock_locations(id) ON DELETE CASCADE,
 movement_type text NOT NULL CHECK(movement_type IN ('receipt','sale','usage','waste','adjustment','transfer_in','transfer_out','return','reservation','release')),
 quantity numeric NOT NULL,
 source_ref text NOT NULL,
 unit_cost_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 occurred_at timestamptz NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_ref)
);
CREATE INDEX IF NOT EXISTS inventory_stock_movements_item_idx ON public.inventory_stock_movements(tenant_id,item_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.inventory_stock_reservations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
 stock_location_id uuid NOT NULL REFERENCES public.inventory_stock_locations(id) ON DELETE CASCADE,
 quantity numeric NOT NULL CHECK(quantity>0),
 context_type text NOT NULL,
 context_id text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','consumed','released','expired')),
 expires_at timestamptz,
 idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS inventory_stock_reservations_active_idx
 ON public.inventory_stock_reservations(tenant_id,stock_location_id,item_id,status,expires_at);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['inventory_items','inventory_stock_locations','inventory_stock_balances','inventory_stock_movements','inventory_stock_reservations'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','inventory tenant read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))','inventory tenant read',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','inventory tenant write',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))','inventory tenant write',t);
 END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['inventory_items','inventory_stock_locations','inventory_stock_reservations'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
  EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.record_inventory_movement(
 _tenant uuid,_item uuid,_location uuid,_type text,_quantity numeric,_source_ref text,
 _occurred_at timestamptz,_unit_cost_minor bigint DEFAULT NULL,_currency text DEFAULT NULL,_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE movement_id uuid; delta numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.inventory_items WHERE id=_item AND tenant_id=_tenant) THEN RAISE EXCEPTION 'inventory_item_not_found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_stock_locations WHERE id=_location AND tenant_id=_tenant) THEN RAISE EXCEPTION 'stock_location_not_found'; END IF;
 SELECT id INTO movement_id FROM public.inventory_stock_movements WHERE tenant_id=_tenant AND source_ref=_source_ref;
 IF movement_id IS NOT NULL THEN RETURN movement_id; END IF;
 delta:=CASE
  WHEN _type IN ('receipt','transfer_in','return') THEN abs(_quantity)
  WHEN _type IN ('sale','usage','waste','transfer_out') THEN -abs(_quantity)
  WHEN _type='adjustment' THEN _quantity
  ELSE 0
 END;
 INSERT INTO public.inventory_stock_movements(tenant_id,item_id,stock_location_id,movement_type,quantity,source_ref,unit_cost_minor,currency,occurred_at,metadata)
 VALUES(_tenant,_item,_location,_type,_quantity,_source_ref,_unit_cost_minor,_currency,_occurred_at,COALESCE(_metadata,'{}'::jsonb))
 RETURNING id INTO movement_id;
 INSERT INTO public.inventory_stock_balances(tenant_id,item_id,stock_location_id,on_hand,reserved)
 VALUES(_tenant,_item,_location,delta,0)
 ON CONFLICT(item_id,stock_location_id) DO UPDATE SET on_hand=public.inventory_stock_balances.on_hand+delta,updated_at=now();
 RETURN movement_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_inventory_movement(uuid,uuid,uuid,text,numeric,text,timestamptz,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement(uuid,uuid,uuid,text,numeric,text,timestamptz,bigint,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_inventory(
 _tenant uuid,_item uuid,_location uuid,_quantity numeric,_context_type text,_context_id text,_idempotency_key text,_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE reservation_id uuid; balance public.inventory_stock_balances;
BEGIN
 IF _quantity<=0 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
 SELECT id INTO reservation_id FROM public.inventory_stock_reservations WHERE tenant_id=_tenant AND idempotency_key=_idempotency_key;
 IF reservation_id IS NOT NULL THEN RETURN reservation_id; END IF;
 SELECT * INTO balance FROM public.inventory_stock_balances WHERE item_id=_item AND stock_location_id=_location FOR UPDATE;
 IF NOT FOUND OR balance.on_hand-balance.reserved<_quantity THEN RAISE EXCEPTION 'insufficient_available_stock'; END IF;
 INSERT INTO public.inventory_stock_reservations(tenant_id,item_id,stock_location_id,quantity,context_type,context_id,status,expires_at,idempotency_key)
 VALUES(_tenant,_item,_location,_quantity,_context_type,_context_id,'active',_expires_at,_idempotency_key)
 RETURNING id INTO reservation_id;
 UPDATE public.inventory_stock_balances SET reserved=reserved+_quantity,updated_at=now() WHERE item_id=_item AND stock_location_id=_location;
 RETURN reservation_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reserve_inventory(uuid,uuid,uuid,numeric,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_inventory(uuid,uuid,uuid,numeric,text,text,text,timestamptz) TO service_role;

COMMIT;
