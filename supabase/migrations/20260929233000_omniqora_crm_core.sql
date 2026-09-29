-- Omniqora CRM core v1
-- ADDITIVE ONLY. This migration is committed on a feature branch and is not applied by source creation.
-- Existing contacts/conversations/cases remain authoritative for their current communication workflows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  legal_name text,
  website text,
  industry text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','prospect','customer','partner','supplier')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_product_key text,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_companies_tenant_name_idx
  ON public.crm_companies (tenant_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_external_ref_uq
  ON public.crm_companies (tenant_id, source_product_key, external_ref)
  WHERE source_product_key IS NOT NULL AND external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  whatsapp_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  first_name text,
  last_name text,
  email text,
  phone_e164 text,
  locale text,
  lifecycle_stage text NOT NULL DEFAULT 'contact'
    CHECK (lifecycle_stage IN ('subscriber','lead','contact','prospect','customer','former_customer','partner','supplier')),
  marketing_consent boolean NOT NULL DEFAULT false,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_product_key text,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_people_tenant_name_idx
  ON public.crm_people (tenant_id, lower(display_name));
CREATE INDEX IF NOT EXISTS crm_people_tenant_email_idx
  ON public.crm_people (tenant_id, lower(email))
  WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_people_tenant_phone_idx
  ON public.crm_people (tenant_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_people_external_ref_uq
  ON public.crm_people (tenant_id, source_product_key, external_ref)
  WHERE source_product_key IS NOT NULL AND external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  pipeline_key text NOT NULL,
  kind text NOT NULL DEFAULT 'sales' CHECK (kind IN ('sales','recruitment','partnership','onboarding','custom')),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, pipeline_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_one_default_pipeline_per_kind_uq
  ON public.crm_pipelines (tenant_id, kind)
  WHERE is_default AND is_active;

CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  stage_key text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  probability_percent integer NOT NULL DEFAULT 0 CHECK (probability_percent BETWEEN 0 AND 100),
  is_closed_won boolean NOT NULL DEFAULT false,
  is_closed_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, stage_key),
  CHECK (NOT (is_closed_won AND is_closed_lost))
);

CREATE INDEX IF NOT EXISTS crm_pipeline_stages_order_idx
  ON public.crm_pipeline_stages (pipeline_id, position, name);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  title text NOT NULL,
  source text,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','working','qualified','unqualified','converted','closed')),
  score numeric(8,2),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_product_key text,
  external_ref text,
  converted_opportunity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_leads_tenant_status_idx
  ON public.crm_leads (tenant_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_external_ref_uq
  ON public.crm_leads (tenant_id, source_product_key, external_ref)
  WHERE source_product_key IS NOT NULL AND external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE RESTRICT,
  stage_id uuid NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  title text NOT NULL,
  amount numeric(18,2),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  probability_percent integer CHECK (probability_percent IS NULL OR probability_percent BETWEEN 0 AND 100),
  expected_close_at timestamptz,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','cancelled')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_product_key text,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_leads
  DROP CONSTRAINT IF EXISTS crm_leads_converted_opportunity_id_fkey;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_converted_opportunity_id_fkey
  FOREIGN KEY (converted_opportunity_id) REFERENCES public.crm_opportunities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS crm_opportunities_tenant_stage_idx
  ON public.crm_opportunities (tenant_id, pipeline_id, stage_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_opportunities_owner_idx
  ON public.crm_opportunities (tenant_id, owner_user_id, status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS crm_opportunities_external_ref_uq
  ON public.crm_opportunities (tenant_id, source_product_key, external_ref)
  WHERE source_product_key IS NOT NULL AND external_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_at timestamptz,
  assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  related_type text CHECK (related_type IS NULL OR related_type IN ('person','company','lead','opportunity','case','conversation','external')),
  related_id text,
  source_product_key text,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_tasks_tenant_due_idx
  ON public.crm_tasks (tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS crm_tasks_assignee_idx
  ON public.crm_tasks (tenant_id, assignee_user_id, status, due_at);

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN (
    'note','call','email','sms','whatsapp','meeting','task','status_change',
    'lead_event','opportunity_event','case_event','system_event'
  )),
  summary text NOT NULL,
  person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_product_key text,
  external_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_activities_tenant_time_idx
  ON public.crm_activities (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_activities_person_time_idx
  ON public.crm_activities (person_id, occurred_at DESC)
  WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_activities_company_time_idx
  ON public.crm_activities (company_id, occurred_at DESC)
  WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_companies','crm_people','crm_pipelines','crm_pipeline_stages',
    'crm_leads','crm_opportunities','crm_tasks'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS crm_touch_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER crm_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at()',
      t
    );
  END LOOP;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_companies','crm_people','crm_pipelines','crm_pipeline_stages',
    'crm_leads','crm_opportunities','crm_tasks','crm_activities'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm tenant read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id, auth.uid()))',
      'crm tenant read', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'crm tenant write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id, auth.uid())) WITH CHECK (public.can_write(tenant_id, auth.uid()))',
      'crm tenant write', t
    );
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.crm_touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_touch_updated_at() TO service_role;

COMMIT;
