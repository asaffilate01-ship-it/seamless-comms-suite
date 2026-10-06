-- Omniqora Connector Hub and full ecosystem product registration.
BEGIN;

INSERT INTO public.platform_modules(
  module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities
) VALUES(
  'connectors.core','Omniqora Connector Hub','integration','1.0.0-preview','preview','workspace',
  ARRAY['platform.tenant','platform.entitlements','platform.events','platform.audit'],
  ARRAY['connector_catalogue','provider_bindings','actions','webhooks','polling','schedules','sync_state','retries','idempotency','reconciliation','health','secrets','field_mapping']
)
ON CONFLICT(module_key) DO UPDATE SET
  name=EXCLUDED.name,module_kind=EXCLUDED.module_kind,version=EXCLUDED.version,status=EXCLUDED.status,
  ui_mode=EXCLUDED.ui_mode,dependencies=EXCLUDED.dependencies,capabilities=EXCLUDED.capabilities,updated_at=now();

UPDATE public.platform_modules
SET dependencies=(
  SELECT ARRAY(
    SELECT DISTINCT value
    FROM unnest(COALESCE(dependencies,'{}'::text[]) || ARRAY['connectors.core']) AS value
  )
),updated_at=now()
WHERE module_key='connect.core';

INSERT INTO public.platform_products(product_key,name,kind,industry,status,parent_product_key) VALUES
 ('mealdeck','MealDeck','vertical_landlord','multi_brand_food_marketplace','migration_candidate',NULL),
 ('courier-connect-hub','Courier Connect Hub','vertical_landlord','courier_orchestration','migration_candidate',NULL),
 ('all-road-aid','All-Road-Aid','vertical_landlord','roadside_recovery','migration_candidate',NULL),
 ('sparesgrid','SparesGrid / SparesIQ','vertical_landlord','automotive_parts','migration_candidate',NULL),
 ('zivvo','Zivvo','vertical_landlord','uk_automotive_marketplace','migration_candidate',NULL),
 ('autohashi','Autohashi','vertical_landlord','jdm_auctions_imports','migration_candidate',NULL),
 ('formationgenie','FormationGenie','vertical_landlord','company_formation_secretarial','migration_candidate',NULL),
 ('lawquo','Lawquo','vertical_landlord','legal_triage_marketplace','migration_candidate',NULL),
 ('fastremit','FastRemit','vertical_landlord','remittance','migration_candidate',NULL),
 ('ahl-nikkah','Ahl-Nikkah','vertical_landlord','marriage_marketplace','migration_candidate',NULL),
 ('lessonahead','LessonAhead','vertical_landlord','driving_instructors','migration_candidate',NULL),
 ('veyumo','Veyumo','vertical_landlord','mvno_telecoms','migration_candidate',NULL),
 ('zoryn-pay','Zoryn Pay','shared_engine','payments_billing','incubating',NULL),
 ('omniqora-connectors','Omniqora Connector Hub','shared_engine','integration_platform','active',NULL),
 ('omniqora-comms','Omniqora Comms Hub','shared_engine','communications_platform','active',NULL)
ON CONFLICT(product_key) DO UPDATE SET
  name=EXCLUDED.name,kind=EXCLUDED.kind,industry=EXCLUDED.industry,status=EXCLUDED.status,
  parent_product_key=EXCLUDED.parent_product_key,updated_at=now();

CREATE TABLE IF NOT EXISTS public.platform_connector_catalogue(
  connector_key text PRIMARY KEY,
  name text NOT NULL,
  connector_kind text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned' CHECK(status IN ('active','preview','planned','retired')),
  capabilities text[] NOT NULL DEFAULT '{}',
  supported_countries text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_connector_requirements(
  product_key text NOT NULL REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
  connector_key text NOT NULL REFERENCES public.platform_connector_catalogue(connector_key) ON DELETE RESTRICT,
  required boolean NOT NULL DEFAULT false,
  purpose text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(product_key,connector_key)
);

CREATE TABLE IF NOT EXISTS public.connector_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  binding_id uuid REFERENCES public.tenant_integration_bindings(id) ON DELETE SET NULL,
  connector_key text NOT NULL,
  operation_key text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound' CHECK(direction IN ('outbound','inbound','sync')),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','partial','cancelled')),
  idempotency_key text,
  request_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_runs_idempotency_uq
 ON public.connector_runs(tenant_id,tenant_product_id,connector_key,operation_key,idempotency_key)
 WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS connector_runs_scope_idx
 ON public.connector_runs(tenant_id,tenant_product_id,connector_key,created_at DESC);

CREATE TABLE IF NOT EXISTS public.connector_sync_state(
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  connector_key text NOT NULL,
  stream_key text NOT NULL,
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  watermark timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,tenant_product_id,connector_key,stream_key)
);

CREATE TABLE IF NOT EXISTS public.connector_webhook_inbox(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  connector_key text NOT NULL,
  external_event_id text,
  event_type text NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','processed','ignored','failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_webhook_external_uq
 ON public.connector_webhook_inbox(connector_key,external_event_id)
 WHERE external_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS connector_webhook_scope_idx
 ON public.connector_webhook_inbox(tenant_id,tenant_product_id,status,received_at DESC);

CREATE TABLE IF NOT EXISTS public.connector_reconciliations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  connector_key text NOT NULL,
  resource_type text NOT NULL,
  local_ref text,
  external_ref text,
  status text NOT NULL DEFAULT 'matched' CHECK(status IN ('matched','missing_local','missing_external','mismatch','resolved')),
  differences jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connector_reconciliation_scope_idx
 ON public.connector_reconciliations(tenant_id,tenant_product_id,connector_key,status,created_at DESC);

ALTER TABLE public.platform_connector_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_connector_requirements ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_connector_catalogue,public.product_connector_requirements TO authenticated;
GRANT ALL ON public.platform_connector_catalogue,public.product_connector_requirements TO service_role;
DROP POLICY IF EXISTS "connector catalogue read" ON public.platform_connector_catalogue;
CREATE POLICY "connector catalogue read" ON public.platform_connector_catalogue FOR SELECT TO authenticated USING(status<>'retired');
DROP POLICY IF EXISTS "product connector requirements read" ON public.product_connector_requirements;
CREATE POLICY "product connector requirements read" ON public.product_connector_requirements FOR SELECT TO authenticated USING(true);

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['connector_runs','connector_sync_state','connector_webhook_inbox','connector_reconciliations']
 LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','connector tenant read',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id IS NOT NULL AND public.is_tenant_member(tenant_id,auth.uid()))',
   'connector tenant read',t
  );
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','connector tenant write',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (tenant_id IS NOT NULL AND public.can_write(tenant_id,auth.uid())) WITH CHECK (tenant_id IS NOT NULL AND public.can_write(tenant_id,auth.uid()))',
   'connector tenant write',t
  );
 END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['platform_connector_catalogue','connector_runs','connector_reconciliations']
 LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
  EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
 END LOOP;
END $$;

INSERT INTO public.platform_connector_catalogue(connector_key,name,connector_kind,description,status,capabilities,supported_countries) VALUES
 ('communications.meta-whatsapp','Meta WhatsApp Cloud API','communications','WhatsApp business messaging and templates','active',ARRAY['messages','templates','webhooks'],ARRAY[]::text[]),
 ('communications.twilio','Twilio','communications','Voice, SMS, WhatsApp and masked calling','preview',ARRAY['voice','sms','whatsapp','masked_calls','webhooks'],ARRAY[]::text[]),
 ('communications.resend','Resend','communications','Transactional email provider','planned',ARRAY['email','transactional','webhooks'],ARRAY[]::text[]),
 ('communications.sendgrid','Twilio SendGrid','communications','Transactional and marketing email provider','planned',ARRAY['email','transactional','marketing','webhooks'],ARRAY[]::text[]),
 ('communications.aws-ses','Amazon SES','communications','Transactional email provider','planned',ARRAY['email','transactional','webhooks'],ARRAY[]::text[]),
 ('communications.firebase','Firebase Cloud Messaging','communications','Mobile and web push notifications','planned',ARRAY['push','mobile','web'],ARRAY[]::text[]),
 ('payments.adyen','Adyen','payments','Checkout, platform splits and payouts','preview',ARRAY['checkout','splits','payouts','refunds','webhooks'],ARRAY[]::text[]),
 ('payments.stripe','Stripe','payments','Checkout, subscriptions and refunds','preview',ARRAY['checkout','subscriptions','refunds','webhooks'],ARRAY[]::text[]),
 ('payments.sumup','SumUp','payments','POS and checkout','preview',ARRAY['pos','checkout'],ARRAY['GB','DE']),
 ('registry.companies-house','Companies House','registry','UK company lookup, filing status and submissions','planned',ARRAY['lookup','filings','submissions'],ARRAY['GB']),
 ('tax.hmrc','HMRC','tax','HMRC obligations and submissions','planned',ARRAY['oauth','obligations','submissions'],ARRAY['GB']),
 ('tax.us-efile','US e-file provider','tax','US electronic filing adapter','planned',ARRAY['submission','acknowledgement','rejection'],ARRAY['US']),
 ('banking.open-banking','Open Banking','banking','Bank accounts, balances and transaction feeds','planned',ARRAY['accounts','balances','transactions','consent'],ARRAY['GB']),
 ('banking.clearbank','ClearBank','banking','UK banking and payment rail','planned',ARRAY['accounts','payments','webhooks'],ARRAY['GB']),
 ('remittance.thunes','Thunes','remittance','Cross-border payout and remittance rail','planned',ARRAY['quote','transfer','status','webhooks'],ARRAY[]::text[]),
 ('telecom.gigs','Gigs','telecom','Mobile plan, subscription, SIM/eSIM and usage supplier','planned',ARRAY['plans','subscriptions','sims','esims','usage','webhooks'],ARRAY['GB']),
 ('delivery.uber-direct','Uber Direct','delivery','On-demand last-mile delivery','planned',ARRAY['quote','delivery','tracking','webhooks'],ARRAY['GB','DE']),
 ('delivery.deliveroo-express','Deliveroo Express','delivery','On-demand restaurant delivery','planned',ARRAY['delivery','tracking','webhooks'],ARRAY['GB']),
 ('delivery.just-eat-go','Just Eat Go','delivery','On-demand restaurant delivery','planned',ARRAY['delivery','tracking','webhooks'],ARRAY['GB']),
 ('delivery.stuart','Stuart','delivery','Courier and last-mile delivery','planned',ARRAY['quote','delivery','tracking','webhooks'],ARRAY['GB']),
 ('delivery.gophr','Gophr','delivery','Courier quote and job connector','planned',ARRAY['quote','job','tracking','webhooks'],ARRAY['GB']),
 ('delivery.lalamove','Lalamove','delivery','Courier quote and job connector','planned',ARRAY['quote','job','tracking','webhooks'],ARRAY['GB','AE']),
 ('delivery.shiply','Shiply','delivery','Transport marketplace connector','planned',ARRAY['quote','job','status'],ARRAY['GB']),
 ('delivery.anyvan','AnyVan','delivery','Transport marketplace connector','planned',ARRAY['quote','job','status'],ARRAY['GB']),
 ('delivery.uship','uShip','delivery','Transport marketplace connector','planned',ARRAY['quote','job','status'],ARRAY['GB','US']),
 ('delivery.cx','Courier Exchange','delivery','Carrier exchange connector','planned',ARRAY['jobs','quotes','status'],ARRAY['GB']),
 ('commerce.ebay','eBay','commerce','Marketplace listings and orders','planned',ARRAY['listings','orders','inventory'],ARRAY['GB','DE','US']),
 ('commerce.amazon','Amazon','commerce','Marketplace listings and orders','planned',ARRAY['listings','orders','inventory'],ARRAY['GB','DE','US']),
 ('vehicle.uk-data','UK Vehicle Data','vehicle','UK vehicle identity and history data','planned',ARRAY['vehicle_lookup','history'],ARRAY['GB']),
 ('vehicle.jp-auctions','Japanese Auction Feeds','vehicle','Japanese auction vehicle and bid feeds','planned',ARRAY['vehicles','auctions','bids','images'],ARRAY['JP'])
ON CONFLICT(connector_key) DO UPDATE SET
 name=EXCLUDED.name,connector_kind=EXCLUDED.connector_kind,description=EXCLUDED.description,
 status=EXCLUDED.status,capabilities=EXCLUDED.capabilities,supported_countries=EXCLUDED.supported_countries,updated_at=now();

INSERT INTO public.product_connector_requirements(product_key,connector_key,required,purpose) VALUES
 ('dishbee','communications.meta-whatsapp',false,'WhatsApp ordering and support'),
 ('dishbee','communications.twilio',false,'Phone and SMS assisted ordering'),
 ('dishbee','payments.adyen',false,'Online and split payments'),
 ('dishbee','payments.sumup',false,'POS and payment links'),
 ('mealdeck','payments.adyen',true,'Split payments across participating companies'),
 ('mealdeck','delivery.uber-direct',false,'Last-mile delivery'),
 ('mealdeck','delivery.deliveroo-express',false,'Last-mile delivery'),
 ('mealdeck','delivery.just-eat-go',false,'Last-mile delivery'),
 ('mealdeck','delivery.stuart',false,'Last-mile delivery'),
 ('formationgenie','registry.companies-house',true,'UK company formation and company-secretarial filings'),
 ('iq-practice-cloud','tax.hmrc',false,'HMRC obligations and submissions'),
 ('iq-practice-cloud','banking.open-banking',false,'Bank feeds'),
 ('taxcenda','tax.us-efile',false,'US electronic filing'),
 ('fastremit','banking.clearbank',true,'UK banking and payment rail'),
 ('fastremit','remittance.thunes',true,'Cross-border payout rail'),
 ('courier-connect-hub','delivery.gophr',false,'Courier jobs and quotes'),
 ('courier-connect-hub','delivery.stuart',false,'Courier jobs and quotes'),
 ('courier-connect-hub','delivery.lalamove',false,'Courier jobs and quotes'),
 ('courier-connect-hub','delivery.shiply',false,'Transport marketplace'),
 ('courier-connect-hub','delivery.anyvan',false,'Transport marketplace'),
 ('courier-connect-hub','delivery.uship',false,'Transport marketplace'),
 ('courier-connect-hub','delivery.cx',false,'Carrier exchange'),
 ('sparesgrid','commerce.ebay',false,'Parts marketplace'),
 ('sparesgrid','commerce.amazon',false,'Parts marketplace'),
 ('zivvo','vehicle.uk-data',false,'UK vehicle data'),
 ('autohashi','vehicle.jp-auctions',false,'Japanese auction feed'),
 ('veyumo','telecom.gigs',true,'Mobile supplier core')
ON CONFLICT(product_key,connector_key) DO UPDATE SET required=EXCLUDED.required,purpose=EXCLUDED.purpose;

INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
SELECT p.product_key,'connectors.core',true
FROM public.platform_products p
WHERE p.product_key IN(
 'courier-connect-hub','all-road-aid','sparesgrid','zivvo','autohashi','formationgenie',
 'lawquo','fastremit','ahl-nikkah','lessonahead','veyumo','omniqora-connectors'
)
ON CONFLICT(product_key,module_key) DO UPDATE SET enabled_by_default=true;

COMMIT;
