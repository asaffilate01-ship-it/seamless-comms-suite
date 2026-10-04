-- AutoHashi / Omniqora Japanese auction provider runtime.
-- Read providers and bid execution are deliberately separated. Inventory data can be enabled
-- without granting any provider permission to submit money-bearing auction instructions.
BEGIN;

INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,public_config_names,status,implementation_status
) VALUES
('vehicle.auction.thecarapi','TheCarAPI Japan','vehicle-auction-data',
 ARRAY['inventory.read','lot.detail','auction_sheet.read','images.read','history.read','results.read'],ARRAY['JP'],ARRAY['THECARAPI_API_KEY'],ARRAY[]::text[],'preview','built_main'),
('vehicle.auction.carstack','CarStack Japan','vehicle-auction-data',
 ARRAY['inventory.read','lot.detail','images.read'],ARRAY['JP'],ARRAY['CARSTACK_API_TOKEN'],ARRAY[]::text[],'preview','built_main'),
('vehicle.auction.agent','Licensed Japan Auction Agent','vehicle-auction-execution',
 ARRAY['bid.submit','bid.amend','bid.cancel','bid.status','results.read','invoice.read','payment.status','transport.status','export.status','shipping.status','documents.read'],
 ARRAY['JP'],ARRAY['AUTOHASHI_AUCTION_AGENT_URL','AUTOHASHI_AUCTION_AGENT_TOKEN'],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.auction.aucnet','AUCNET','vehicle-auction-member',ARRAY['inventory.read','lot.detail','auction_sheet.read','images.read','history.read','bid.submit','bid.status','results.read'],ARRAY['JP'],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.auction.iauc','i-AUC','vehicle-auction-member',ARRAY['inventory.read','lot.detail','auction_sheet.read','images.read','bid.submit','bid.status','results.read'],ARRAY['JP'],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.auction.uss','USS / CIS','vehicle-auction-member',ARRAY['inventory.read','lot.detail','auction_sheet.read','images.read','history.read','bid.submit','bid.status','results.read'],ARRAY['JP'],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.auction.taa','TAA','vehicle-auction-member',ARRAY['inventory.read','lot.detail','auction_sheet.read','images.read','bid.submit','bid.status','results.read'],ARRAY['JP'],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.auction.caa','CAA','vehicle-auction-member',ARRAY['inventory.read','lot.detail','auction_sheet.read','images.read','bid.submit','bid.status','results.read'],ARRAY['JP'],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.auction.ju','JU','vehicle-auction-member',ARRAY['inventory.read','lot.detail','auction_sheet.read','images.read','bid.submit','bid.status','results.read'],ARRAY['JP'],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only'),
('vehicle.auction.arai','ARAI','vehicle-auction-member',ARRAY['inventory.read','lot.detail','auction_sheet.read','images.read','bid.submit','bid.status','results.read'],ARRAY['JP'],ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only')
ON CONFLICT(provider_key) DO UPDATE SET
 name=EXCLUDED.name,provider_kind=EXCLUDED.provider_kind,capabilities=EXCLUDED.capabilities,
 supported_countries=EXCLUDED.supported_countries,required_secret_names=EXCLUDED.required_secret_names,
 public_config_names=EXCLUDED.public_config_names,status=EXCLUDED.status,
 implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.product_provider_requirements(product_key,provider_key,required,purpose) VALUES
('autohashi','vehicle.auction.thecarapi',false,'Primary/alternate Japanese auction inventory read feed'),
('autohashi','vehicle.auction.carstack',false,'Primary/alternate Japanese auction inventory read feed'),
('autohashi','vehicle.auction.agent',false,'Licensed Japan-side auction execution after contract and certification')
ON CONFLICT(product_key,provider_key) DO UPDATE SET required=EXCLUDED.required,purpose=EXCLUDED.purpose;

CREATE TABLE IF NOT EXISTS public.automotive_auction_observations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid REFERENCES public.automotive_auction_lots(id) ON DELETE SET NULL,
 vehicle_id uuid REFERENCES public.automotive_vehicles(id) ON DELETE SET NULL,
 provider_key text NOT NULL,
 external_lot_id text NOT NULL,
 source_site text,
 source_vehicle_id text,
 chassis_number text,
 model_code text,
 make text NOT NULL,
 model text NOT NULL,
 model_year integer CHECK(model_year IS NULL OR model_year BETWEEN 1900 AND 2200),
 auction_house text,
 auction_at timestamptz,
 status text NOT NULL DEFAULT 'open',
 grade text,
 odometer_km integer CHECK(odometer_km IS NULL OR odometer_km >= 0),
 starting_price_minor bigint,
 current_price_minor bigint,
 final_price_minor bigint,
 currency text NOT NULL DEFAULT 'JPY' CHECK(currency ~ '^[A-Z]{3}$'),
 price_semantics text NOT NULL DEFAULT 'unknown'
   CHECK(price_semantics IN('opening_bid','asking_price','provider_current','reported_result','unknown')),
 payload_hash text,
 source_ref text,
 observed_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automotive_auction_observations_identity_idx
 ON public.automotive_auction_observations(tenant_id,chassis_number,observed_at DESC)
 WHERE chassis_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS automotive_auction_observations_provider_idx
 ON public.automotive_auction_observations(tenant_id,provider_key,external_lot_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS public.automotive_provider_sync_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text NOT NULL,
 operation text NOT NULL CHECK(operation IN('search','detail','history','result_sync')),
 status text NOT NULL DEFAULT 'started' CHECK(status IN('started','succeeded','failed','partial')),
 request_id text,
 query jsonb NOT NULL DEFAULT '{}'::jsonb,
 items_seen integer NOT NULL DEFAULT 0 CHECK(items_seen >= 0),
 items_imported integer NOT NULL DEFAULT 0 CHECK(items_imported >= 0),
 error_code text,
 error_message text,
 started_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS automotive_provider_sync_runs_recent_idx
 ON public.automotive_provider_sync_runs(tenant_id,provider_key,started_at DESC);

CREATE TABLE IF NOT EXISTS public.automotive_bid_instructions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid NOT NULL REFERENCES public.automotive_auction_lots(id) ON DELETE RESTRICT,
 bid_model_id uuid REFERENCES public.automotive_bid_models(id) ON DELETE SET NULL,
 execution_provider_key text,
 max_bid_minor bigint NOT NULL CHECK(max_bid_minor >= 0),
 currency text NOT NULL DEFAULT 'JPY' CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'draft'
  CHECK(status IN('draft','authorised','submitted','accepted','won','lost','cancelled','rejected','error')),
 provider_reference text,
 idempotency_key text NOT NULL,
 authorised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 authorised_at timestamptz,
 submitted_at timestamptz,
 result_at timestamptz,
 hammer_price_minor bigint,
 result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 last_error text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS automotive_bid_instructions_lot_idx
 ON public.automotive_bid_instructions(tenant_id,auction_lot_id,created_at DESC);

ALTER TABLE public.automotive_auction_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_provider_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automotive_bid_instructions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.automotive_auction_observations,public.automotive_provider_sync_runs,public.automotive_bid_instructions TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automotive_auction_observations,public.automotive_provider_sync_runs,public.automotive_bid_instructions TO authenticated;

DROP POLICY IF EXISTS "automotive auction observations read" ON public.automotive_auction_observations;
CREATE POLICY "automotive auction observations read" ON public.automotive_auction_observations FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "automotive auction observations write" ON public.automotive_auction_observations;
CREATE POLICY "automotive auction observations write" ON public.automotive_auction_observations FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "automotive provider sync read" ON public.automotive_provider_sync_runs;
CREATE POLICY "automotive provider sync read" ON public.automotive_provider_sync_runs FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "automotive provider sync write" ON public.automotive_provider_sync_runs;
CREATE POLICY "automotive provider sync write" ON public.automotive_provider_sync_runs FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "automotive bid instructions read" ON public.automotive_bid_instructions;
CREATE POLICY "automotive bid instructions read" ON public.automotive_bid_instructions FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "automotive bid instructions write" ON public.automotive_bid_instructions;
CREATE POLICY "automotive bid instructions write" ON public.automotive_bid_instructions FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

COMMIT;
