BEGIN;

-- Separate Japanese auction inventory feeds from authorised bid execution.
UPDATE public.provider_catalogue
SET name='Japan Auction Router',
    provider_kind='vehicle-auction-router',
    capabilities=ARRAY['inventory.route','lot.normalise','identity.link','history.build','bid.route'],
    required_secret_names=ARRAY[]::text[],
    public_config_names=ARRAY[]::text[],
    status='preview',
    implementation_status='built_main',
    metadata=COALESCE(metadata,'{}'::jsonb)||jsonb_build_object(
      'virtual',true,
      'read_execution_separated',true,
      'notes','Concrete data feeds must never be treated as bid execution providers.'
    ),
    updated_at=now()
WHERE provider_key='vehicle.japan-auction';

INSERT INTO public.provider_catalogue(
 provider_key,name,provider_kind,capabilities,supported_countries,
 required_secret_names,public_config_names,status,implementation_status,metadata
) VALUES
('vehicle.japan.thecarapi','TheCarApi Japan','vehicle-auction-data',
 ARRAY['inventory.read','lot.detail','images.read','price_history.read','vin_history.read'],ARRAY['JP'],
 ARRAY['api_key'],ARRAY['base_url'],'preview','built_main',
 '{"read_only":true,"server_only_credentials":true,"default_base_url":"https://api.thecarapi.com","source_slug":"japan"}'::jsonb),
('vehicle.japan.carstack','CarStack Japan','vehicle-auction-data',
 ARRAY['inventory.read','lot.detail','images.read','makes.read','filters.read'],ARRAY['JP'],
 ARRAY['api_token'],ARRAY['base_url'],'preview','built_main',
 '{"read_only":true,"server_only_credentials":true,"default_base_url":"https://carstack.dev/v1"}'::jsonb),
('vehicle.japan.agent','Japan Auction Execution Partner','vehicle-auction-execution',
 ARRAY['bid.submit','bid.status','result.read','invoice.read','transport.status','export.status','documents.read'],ARRAY['JP'],
 ARRAY['credential'],ARRAY['base_url'],'planned','catalogue_only',
 '{"requires_contract":true,"human_or_api_execution":true}'::jsonb),
('vehicle.japan.aucnet','AUCNET authorised integration','vehicle-auction-execution',
 ARRAY['inventory.read','lot.detail','images.read','history.read','result.read','bid.submit','bid.status'],ARRAY['JP'],
 ARRAY['credential'],ARRAY['base_url'],'planned','catalogue_only',
 '{"requires_membership":true,"no_scraping":true}'::jsonb),
('vehicle.japan.iauc','i-AUC authorised integration','vehicle-auction-execution',
 ARRAY['inventory.read','lot.detail','images.read','history.read','result.read','bid.submit','bid.status'],ARRAY['JP'],
 ARRAY['credential'],ARRAY['base_url'],'planned','catalogue_only',
 '{"requires_membership":true,"no_scraping":true}'::jsonb),
('vehicle.japan.uss','USS authorised integration','vehicle-auction-execution',
 ARRAY['inventory.read','lot.detail','inspection.read','history.read','result.read','bid.submit','bid.status'],ARRAY['JP'],
 ARRAY['credential'],ARRAY['base_url'],'planned','catalogue_only',
 '{"requires_membership_and_authorised_system_access":true,"no_public_api_assumed":true,"no_scraping":true}'::jsonb)
ON CONFLICT(provider_key) DO UPDATE SET
 name=EXCLUDED.name,
 provider_kind=EXCLUDED.provider_kind,
 capabilities=EXCLUDED.capabilities,
 supported_countries=EXCLUDED.supported_countries,
 required_secret_names=EXCLUDED.required_secret_names,
 public_config_names=EXCLUDED.public_config_names,
 status=EXCLUDED.status,
 implementation_status=EXCLUDED.implementation_status,
 metadata=EXCLUDED.metadata,
 updated_at=now();

INSERT INTO public.product_provider_requirements(product_key,provider_key,required,purpose,config) VALUES
('autohashi','vehicle.japan.thecarapi',false,'Read-only Japanese auction inventory/detail candidate feed','{"route_role":"source"}'::jsonb),
('autohashi','vehicle.japan.carstack',false,'Read-only Japanese auction inventory/detail candidate feed','{"route_role":"source"}'::jsonb),
('autohashi','vehicle.japan.agent',false,'Authorised Japan-side bid execution and post-win operations','{"route_role":"destination"}'::jsonb),
('autohashi','vehicle.japan.aucnet',false,'Future direct authorised AUCNET execution/data route','{"route_role":"direct"}'::jsonb),
('autohashi','vehicle.japan.iauc',false,'Future direct authorised i-AUC execution/data route','{"route_role":"direct"}'::jsonb),
('autohashi','vehicle.japan.uss',false,'Future direct authorised USS route; no public API assumed','{"route_role":"direct"}'::jsonb)
ON CONFLICT(product_key,provider_key) DO UPDATE SET
 required=EXCLUDED.required,purpose=EXCLUDED.purpose,config=EXCLUDED.config;

ALTER TABLE public.automotive_bid_models
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS max_bid_source_minor bigint;

DO $do$
BEGIN
  ALTER TABLE public.automotive_bid_models
    ADD CONSTRAINT automotive_bid_models_source_currency_check
    CHECK(source_currency IS NULL OR source_currency ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END
$do$;

CREATE TABLE IF NOT EXISTS public.automotive_auction_provider_syncs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'running' CHECK(status IN('running','succeeded','failed')),
 filters jsonb NOT NULL DEFAULT '{}'::jsonb,
 fetched_count integer NOT NULL DEFAULT 0 CHECK(fetched_count>=0),
 upserted_count integer NOT NULL DEFAULT 0 CHECK(upserted_count>=0),
 provider_total integer,
 provider_request_id text,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 last_error text,
 initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS automotive_auction_provider_syncs_tenant_idx
 ON public.automotive_auction_provider_syncs(tenant_id,product_key,provider_key,started_at DESC);

CREATE INDEX IF NOT EXISTS automotive_auction_lots_vehicle_history_idx
 ON public.automotive_auction_lots(tenant_id,product_key,vehicle_id,auction_at DESC)
 WHERE vehicle_id IS NOT NULL;

ALTER TABLE public.automotive_auction_provider_syncs ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automotive_auction_provider_syncs TO authenticated;
GRANT ALL ON public.automotive_auction_provider_syncs TO service_role;

DROP POLICY IF EXISTS "automotive auction provider sync read" ON public.automotive_auction_provider_syncs;
CREATE POLICY "automotive auction provider sync read"
 ON public.automotive_auction_provider_syncs FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "automotive auction provider sync write" ON public.automotive_auction_provider_syncs;
CREATE POLICY "automotive auction provider sync write"
 ON public.automotive_auction_provider_syncs FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid()))
 WITH CHECK(public.can_write(tenant_id,auth.uid()));

CREATE TABLE IF NOT EXISTS public.automotive_auction_bid_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 auction_lot_id uuid NOT NULL REFERENCES public.automotive_auction_lots(id) ON DELETE CASCADE,
 source_system text NOT NULL DEFAULT 'autohashi',
 source_request_ref text NOT NULL,
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE RESTRICT,
 execution_mode text NOT NULL DEFAULT 'manual' CHECK(execution_mode IN('manual','api')),
 max_bid_minor bigint NOT NULL CHECK(max_bid_minor>0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'pending_partner'
  CHECK(status IN('pending_partner','submitted','accepted','won','lost','cancelled','failed')),
 external_bid_ref text,
 authorised_by_ref text,
 risk_review_status text NOT NULL DEFAULT 'review'
  CHECK(risk_review_status IN('low','review','high','specialist_review')),
 notes text,
 provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_system,source_request_ref)
);

CREATE INDEX IF NOT EXISTS automotive_auction_bid_requests_status_idx
 ON public.automotive_auction_bid_requests(tenant_id,product_key,status,created_at DESC);

ALTER TABLE public.automotive_auction_bid_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automotive_auction_bid_requests TO authenticated;
GRANT ALL ON public.automotive_auction_bid_requests TO service_role;

DROP POLICY IF EXISTS "automotive auction bid request read" ON public.automotive_auction_bid_requests;
CREATE POLICY "automotive auction bid request read"
 ON public.automotive_auction_bid_requests FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

DROP POLICY IF EXISTS "automotive auction bid request write" ON public.automotive_auction_bid_requests;
CREATE POLICY "automotive auction bid request write"
 ON public.automotive_auction_bid_requests FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid()))
 WITH CHECK(public.can_write(tenant_id,auth.uid()));

COMMIT;
