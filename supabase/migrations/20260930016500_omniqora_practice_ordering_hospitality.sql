-- Omniqora Practice Operations, direct Ordering, EPOS/Hospitality Intelligence and transformation module registration.
-- ADDITIVE ONLY.
BEGIN;

INSERT INTO public.platform_products(product_key,name,kind,industry,status) VALUES
  ('taxcenda','TaxCenda','vertical_landlord','us_tax_practice','migration_candidate'),
  ('iq-practice-cloud','IQ Practice Cloud','vertical_landlord','uk_accountancy_practice','migration_candidate'),
  ('regulos','RegulaOS / Compliance-as-a-Service','vertical_landlord','regulatory_compliance','migration_candidate')
ON CONFLICT(product_key) DO UPDATE SET
  name=EXCLUDED.name,kind=EXCLUDED.kind,industry=EXCLUDED.industry,status=EXCLUDED.status,updated_at=now();

INSERT INTO public.platform_modules(module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities) VALUES
  ('practice.core','Omniqora Practice Operations','practice','1.0.0-preview','preview','hybrid',
    ARRAY['crm.core','documents.core','payments.core','connect.core','platform.audit'],
    ARRAY['clients','engagements','deadlines','document_requests','signatures','client_portal','time_wip','fees','submissions']),
  ('ordering.core','Omniqora Ordering','ordering','1.0.0-preview','preview','hybrid',
    ARRAY['crm.core','connect.core','payments.core','platform.events'],
    ARRAY['catalogue','cart','direct_orders','whatsapp_orders','phone_orders','source_handoff','tracking']),
  ('hospitality.intelligence','Omniqora EPOS & Hospitality Intelligence','hospitality','1.0.0-preview','preview','workspace',
    ARRAY['ordering.core','analytics.core','financials.core','intelligence.core','platform.events'],
    ARRAY['epos_intelligence','menu_engineering','margin_analysis','discount_leakage','refund_analysis','waste','inventory','demand_forecast','dayparts','ai_insights']),
  ('business360.core','Omniqora Business360','transformation','1.0.0-preview','preview','workspace',
    ARRAY['intelligence.core','documents.core','analytics.core','financials.core','platform.audit'],
    ARRAY['discovery','business_audit','assessment','improvement_plan','benefits','monitoring','evidence']),
  ('transactions.core','Omniqora Transactions & Transformation','transformation','1.0.0-preview','preview','workspace',
    ARRAY['business360.core','intelligence.core','documents.core','analytics.core','financials.core','platform.audit'],
    ARRAY['m_and_a','acquisition','merger','carve_out','separation','tsa','day1','hundred_day','imo','diligence','benefits'])
ON CONFLICT(module_key) DO UPDATE SET
  name=EXCLUDED.name,module_kind=EXCLUDED.module_kind,version=EXCLUDED.version,status=EXCLUDED.status,
  ui_mode=EXCLUDED.ui_mode,dependencies=EXCLUDED.dependencies,capabilities=EXCLUDED.capabilities,updated_at=now();

INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default) VALUES
  ('dishbee','ordering.core',true),
  ('dishbee','hospitality.intelligence',true),
  ('taxcenda','crm.core',true),
  ('taxcenda','practice.core',true),
  ('taxcenda','documents.core',true),
  ('taxcenda','payments.core',true),
  ('taxcenda','connect.core',true),
  ('taxcenda','analytics.core',true),
  ('taxcenda','financials.core',true),
  ('taxcenda','intelligence.core',true),
  ('taxcenda','compliance.core',true),
  ('iq-practice-cloud','crm.core',true),
  ('iq-practice-cloud','practice.core',true),
  ('iq-practice-cloud','documents.core',true),
  ('iq-practice-cloud','payments.core',true),
  ('iq-practice-cloud','connect.core',true),
  ('iq-practice-cloud','analytics.core',true),
  ('iq-practice-cloud','financials.core',true),
  ('iq-practice-cloud','intelligence.core',true),
  ('iq-practice-cloud','compliance.core',true),
  ('regulos','crm.core',true),
  ('regulos','compliance.core',true),
  ('regulos','documents.core',true),
  ('regulos','connect.core',true),
  ('regulos','analytics.core',true),
  ('regulos','financials.core',true),
  ('regulos','intelligence.core',true),
  ('regulos','practice.core',true)
ON CONFLICT(product_key,module_key) DO UPDATE SET enabled_by_default=EXCLUDED.enabled_by_default;

CREATE TABLE IF NOT EXISTS public.practice_clients(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  crm_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  legal_name text NOT NULL,
  client_kind text NOT NULL CHECK(client_kind IN ('individual','sole_trader','partnership','company','trust','charity','other')),
  country_code text NOT NULL,
  status text NOT NULL DEFAULT 'prospect' CHECK(status IN ('prospect','onboarding','active','dormant','closed')),
  primary_contact_ref text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_clients_lookup_idx ON public.practice_clients(tenant_id,tenant_product_id,status,legal_name);

CREATE TABLE IF NOT EXISTS public.practice_engagements(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  period_key text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','collecting','processing','client_action','review','approval','submission','completed','cancelled')),
  assigned_user_ids uuid[] NOT NULL DEFAULT '{}',
  reviewer_user_ids uuid[] NOT NULL DEFAULT '{}',
  due_at timestamptz,
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_engagements_queue_idx ON public.practice_engagements(tenant_id,status,due_at);

CREATE TABLE IF NOT EXISTS public.practice_deadlines(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
  deadline_kind text NOT NULL,
  title text NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','filed','completed','missed','not_applicable')),
  source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','regulator','provider','workflow','import')),
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_deadlines_due_idx ON public.practice_deadlines(tenant_id,status,due_at);

CREATE TABLE IF NOT EXISTS public.practice_document_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  document_types text[] NOT NULL DEFAULT '{}',
  due_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','part_received','fulfilled','cancelled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_signature_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
  document_ref text NOT NULL,
  signer_refs text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','viewed','signed','declined','expired')),
  consent_version text,
  provider text,
  provider_ref text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_time_entries(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  minutes integer NOT NULL CHECK(minutes>=0),
  billable boolean NOT NULL DEFAULT true,
  rate_minor bigint CHECK(rate_minor IS NULL OR rate_minor>=0),
  currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_time_entries_period_idx ON public.practice_time_entries(tenant_id,user_id,started_at DESC);

CREATE TABLE IF NOT EXISTS public.practice_submissions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE SET NULL,
  jurisdiction text NOT NULL,
  authority text NOT NULL,
  submission_type text NOT NULL,
  period_key text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','approved','queued','submitted','accepted','rejected','withdrawn','superseded')),
  provider text,
  provider_ref text,
  submitted_at timestamptz,
  receipt_ref text,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_submissions_status_idx ON public.practice_submissions(tenant_id,status,authority,submission_type);

CREATE TABLE IF NOT EXISTS public.ordering_intents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  product_key text NOT NULL,
  channel text NOT NULL CHECK(channel IN ('web','app','whatsapp','phone','kiosk','pos','marketplace','api')),
  customer_ref text,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  fulfilment text NOT NULL CHECK(fulfilment IN ('collection','delivery','dine_in','service')),
  requested_at timestamptz,
  delivery_address jsonb,
  table_ref text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','awaiting_confirmation','awaiting_payment','submitted','accepted','rejected','in_progress','ready','completed','cancelled','refunded')),
  source_order_ref text,
  source_revision text,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,idempotency_key)
);
CREATE INDEX IF NOT EXISTS ordering_intents_queue_idx ON public.ordering_intents(tenant_id,tenant_product_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.ordering_validation_receipts(
  intent_id uuid PRIMARY KEY REFERENCES public.ordering_intents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  catalogue_revision text NOT NULL,
  price_validated boolean NOT NULL,
  availability_validated boolean NOT NULL,
  fulfilment_validated boolean NOT NULL,
  subtotal_minor bigint NOT NULL,
  discount_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  fees_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL,
  currency text NOT NULL,
  warnings text[] NOT NULL DEFAULT '{}',
  valid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ordering_acceptance_receipts(
  intent_id uuid PRIMARY KEY REFERENCES public.ordering_intents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_order_ref text NOT NULL,
  accepted boolean NOT NULL,
  payment_state text NOT NULL CHECK(payment_state IN ('not_required','pending','paid','pay_later_authorized')),
  kds_acknowledged boolean,
  accepted_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.epos_transaction_facts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  source_transaction_ref text NOT NULL,
  business_date date NOT NULL,
  occurred_at timestamptz NOT NULL,
  channel text NOT NULL,
  order_type text,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  gross_minor bigint NOT NULL,
  discount_minor bigint NOT NULL DEFAULT 0,
  refund_minor bigint NOT NULL DEFAULT 0,
  net_minor bigint NOT NULL,
  tax_minor bigint,
  cogs_minor bigint,
  item_count integer NOT NULL DEFAULT 0 CHECK(item_count>=0),
  customer_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,source_transaction_ref)
);
CREATE INDEX IF NOT EXISTS epos_transaction_facts_period_idx ON public.epos_transaction_facts(tenant_id,location_id,business_date,occurred_at);

CREATE TABLE IF NOT EXISTS public.epos_item_facts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.epos_transaction_facts(id) ON DELETE CASCADE,
  item_ref text NOT NULL,
  item_name text NOT NULL,
  category_ref text,
  quantity numeric NOT NULL,
  gross_minor bigint NOT NULL,
  discount_minor bigint NOT NULL DEFAULT 0,
  refund_minor bigint NOT NULL DEFAULT 0,
  net_minor bigint NOT NULL,
  estimated_cogs_minor bigint,
  modifier_refs text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS epos_item_facts_item_idx ON public.epos_item_facts(tenant_id,item_ref);

CREATE TABLE IF NOT EXISTS public.inventory_movement_facts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  item_ref text NOT NULL,
  movement_type text NOT NULL CHECK(movement_type IN ('purchase','sale','waste','adjustment','transfer_in','transfer_out','return')),
  quantity numeric NOT NULL,
  unit text,
  cost_minor bigint,
  currency text,
  occurred_at timestamptz NOT NULL,
  source_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,source_ref)
);
CREATE INDEX IF NOT EXISTS inventory_movement_facts_item_idx ON public.inventory_movement_facts(tenant_id,location_id,item_ref,occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.hospitality_insights(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  insight_kind text NOT NULL CHECK(insight_kind IN ('sales','margin','discount','refund','waste','stock','menu','daypart','forecast','anomaly')),
  title text NOT NULL,
  summary text NOT NULL,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_run_id text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hospitality_insights_period_idx ON public.hospitality_insights(tenant_id,location_id,period_start DESC);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'practice_clients','practice_engagements','practice_deadlines','practice_document_requests',
    'practice_signature_requests','practice_time_entries','practice_submissions',
    'ordering_intents','ordering_validation_receipts','ordering_acceptance_receipts',
    'epos_transaction_facts','epos_item_facts','inventory_movement_facts','hospitality_insights'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','module tenant read',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))','module tenant read',t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','module tenant write',t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))','module tenant write',t);
  END LOOP;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'practice_clients','practice_engagements','practice_deadlines','practice_document_requests',
    'practice_signature_requests','practice_submissions','ordering_intents',
    'ordering_acceptance_receipts','hospitality_insights'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
  END LOOP;
END $$;

COMMIT;
