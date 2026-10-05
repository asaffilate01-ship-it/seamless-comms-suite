-- Omniqora growth, analytics/metrics and financials shared persistence.
-- ADDITIVE ONLY. Source commit does not apply this migration.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_size bigint,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text NOT NULL,
  audience_id uuid REFERENCES public.marketing_audiences(id) ON DELETE SET NULL,
  channels text[] NOT NULL DEFAULT '{}',
  creative_brief_id uuid REFERENCES public.creative_briefs(id) ON DELETE SET NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','running','paused','completed','cancelled')),
  attribution_window_days integer CHECK (attribution_window_days IS NULL OR attribution_window_days >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_campaigns_status_idx
  ON public.marketing_campaigns (tenant_id, status, starts_at);

CREATE TABLE IF NOT EXISTS public.sales_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journey_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  name text NOT NULL,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_rfm (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  crm_person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
  recency_days integer,
  frequency integer NOT NULL DEFAULT 0 CHECK (frequency >= 0),
  monetary_minor bigint NOT NULL DEFAULT 0,
  currency text NOT NULL,
  r_score integer CHECK (r_score IS NULL OR r_score BETWEEN 1 AND 5),
  f_score integer CHECK (f_score IS NULL OR f_score BETWEEN 1 AND 5),
  m_score integer CHECK (m_score IS NULL OR m_score BETWEEN 1 AND 5),
  segments text[] NOT NULL DEFAULT '{}',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, crm_person_id)
);

CREATE TABLE IF NOT EXISTS public.feedback_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  survey_type text NOT NULL CHECK (survey_type IN ('nps','csat','ces','custom')),
  name text NOT NULL,
  trigger_event text,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp','web','app')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  survey_id uuid NOT NULL REFERENCES public.feedback_surveys(id) ON DELETE CASCADE,
  crm_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  score numeric,
  comment text,
  sentiment text,
  source_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_responses_survey_idx
  ON public.feedback_responses (tenant_id, survey_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.analytics_metric_definitions (
  metric_key text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL,
  aggregation text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','preview','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_metric_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  metric_key text NOT NULL REFERENCES public.analytics_metric_definitions(metric_key) ON DELETE RESTRICT,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  value numeric NOT NULL,
  currency text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_metric_points_lookup_idx
  ON public.analytics_metric_points (tenant_id, product_key, metric_key, period_start DESC);

CREATE TABLE IF NOT EXISTS public.financial_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  category text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('revenue','cost','refund','discount','fee','payout','tax','other')),
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  source_ref text NOT NULL,
  source_event_id text,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_ref)
);
CREATE INDEX IF NOT EXISTS financial_actuals_period_idx
  ON public.financial_actuals (tenant_id, product_key, period_start, period_end, category);

CREATE TABLE IF NOT EXISTS public.financial_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  category text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text,
  location_id uuid REFERENCES public.tenant_locations(id) ON DELETE SET NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  category text NOT NULL,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  basis text NOT NULL CHECK (basis IN ('manual','run_rate','model','scenario')),
  assumptions text[] NOT NULL DEFAULT '{}',
  model_run_id text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('cash_saving','cost_avoidance','revenue','working_capital','productivity','risk')),
  baseline_ref text NOT NULL,
  actual_ref text,
  proposed_amount_minor bigint,
  reviewed_amount_minor bigint,
  currency text,
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','measuring','review_required','reviewed','rejected')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  finance_reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_audiences','marketing_campaigns','sales_sequences','journey_definitions',
    'customer_rfm','feedback_surveys','feedback_responses','analytics_metric_points',
    'financial_actuals','financial_budgets','financial_forecasts','financial_benefits'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'growth tenant read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()))',
      'growth tenant read', t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'growth tenant write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id, auth.uid())) WITH CHECK (public.can_write(tenant_id, auth.uid()))',
      'growth tenant write', t
    );
  END LOOP;
END $$;

ALTER TABLE public.analytics_metric_definitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.analytics_metric_definitions TO authenticated;
GRANT ALL ON public.analytics_metric_definitions TO service_role;
DROP POLICY IF EXISTS "metric definitions read" ON public.analytics_metric_definitions;
CREATE POLICY "metric definitions read" ON public.analytics_metric_definitions FOR SELECT TO authenticated USING (true);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_audiences','marketing_campaigns','sales_sequences','journey_definitions',
    'feedback_surveys','financial_budgets','financial_forecasts','financial_benefits',
    'analytics_metric_definitions'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()', t);
  END LOOP;
END $$;

COMMIT;
