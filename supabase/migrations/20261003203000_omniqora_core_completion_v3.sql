-- Omniqora v3 core completion: finance/practice/tax, governed intelligence,
-- identity/customer portal, connector operations and financial analytics.
-- This migration extends the current v2 SaaS Factory/kernel rather than
-- reintroducing the older parallel module-entitlement model.
BEGIN;

INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status) VALUES
('omniqora.practice','Practice Operations','Clients, engagements, deadlines, work queues and review controls.','accounting','omniqora',true,'automatic','active'),
('omniqora.accounting-ai','Accounting AI','Document intake, extraction review, posting, trial balance, fixed assets and accounts preparation.','accounting','omniqora',true,'automatic','active'),
('omniqora.tax-intelligence','Tax Intelligence','Authority-backed tax research, positions, review evidence and change-aware source records.','tax','omniqora',true,'automatic','active'),
('omniqora.payroll','Payroll Core','Payroll workspaces, draft runs, provider boundaries and reviewable calculation records.','payroll','omniqora',true,'automatic','active'),
('omniqora.company-secretarial','Company Secretarial Core','Entity register, obligations, evidence and filing-provider orchestration.','registry','omniqora',true,'automatic','active'),
('omniqora.intelligence-runtime','Intelligence Runtime','Typed AI job queue, bounded workers, approvals and usage-safe execution.','ai','omniqora',true,'automatic','active'),
('omniqora.ai-governance','Enterprise AI Governance','Use-case register, evidence, approvals, pilots, budgets and suspension controls.','ai','omniqora',true,'automatic','active'),
('omniqora.connectors','Connector Hub','Provider health, sync state, webhook inbox and reconciliation across products.','integration','omniqora',true,'automatic','active'),
('omniqora.graphrag','GraphRAG','Evidence-grounded RAG, graph retrieval and reviewed graph extraction orchestration.','ai','omniqora',true,'external','active')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
('omniqora.practice','omniqora.crm'),
('omniqora.accounting-ai','omniqora.practice'),
('omniqora.accounting-ai','omniqora.ai'),
('omniqora.tax-intelligence','omniqora.practice'),
('omniqora.tax-intelligence','omniqora.ai'),
('omniqora.payroll','omniqora.practice'),
('omniqora.company-secretarial','omniqora.crm'),
('omniqora.intelligence-runtime','omniqora.ai'),
('omniqora.ai-governance','omniqora.ai'),
('omniqora.graphrag','omniqora.ai'),
('omniqora.connectors','omniqora.identity')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
('omniqora','omniqora.intelligence-runtime',true,false),
('omniqora','omniqora.ai-governance',true,false),
('omniqora','omniqora.connectors',true,false),
('omniqora','omniqora.graphrag',true,false),
('omniqora-accounts','omniqora.practice',true,true),
('omniqora-accounts','omniqora.accounting-ai',true,false),
('omniqora-accounts','omniqora.tax-intelligence',true,false),
('omniqora-accounts','omniqora.payroll',false,false),
('formationgenie','omniqora.company-secretarial',true,false),
('taxcenda','omniqora.practice',true,true),
('taxcenda','omniqora.accounting-ai',true,false),
('taxcenda','omniqora.tax-intelligence',true,false)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.practice_clients(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
 display_name text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('prospect','onboarding','active','on_hold','former')),
 jurisdiction text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,client_ref)
);

CREATE TABLE IF NOT EXISTS public.practice_engagements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 engagement_type text NOT NULL,
 period_start date,
 period_end date,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','review','complete','closed','cancelled')),
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 scope jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_deadlines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
 deadline_type text NOT NULL,
 due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'due' CHECK(status IN('due','in_progress','filed','complete','waived','overdue')),
 authority_ref text,
 evidence_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_nominal_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 code text NOT NULL,
 name text NOT NULL,
 account_type text NOT NULL CHECK(account_type IN('asset','liability','equity','income','expense','cost_of_sales','tax','control')),
 active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,client_ref,code)
);

CREATE TABLE IF NOT EXISTS public.accounting_journals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 journal_date date NOT NULL,
 reference text,
 description text NOT NULL,
 source_type text NOT NULL DEFAULT 'manual',
 source_ref text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','posted','reversed','cancelled')),
 posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 posted_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,source_type,source_ref)
);

CREATE TABLE IF NOT EXISTS public.accounting_journal_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 journal_id uuid NOT NULL REFERENCES public.accounting_journals(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES public.accounting_nominal_accounts(id) ON DELETE RESTRICT,
 description text,
 debit_minor bigint NOT NULL DEFAULT 0 CHECK(debit_minor>=0),
 credit_minor bigint NOT NULL DEFAULT 0 CHECK(credit_minor>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 tax_code text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((debit_minor=0)<>(credit_minor=0))
);
CREATE INDEX IF NOT EXISTS accounting_journal_lines_journal_idx ON public.accounting_journal_lines(journal_id);

CREATE TABLE IF NOT EXISTS public.accounting_assets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 asset_ref text NOT NULL,
 description text NOT NULL,
 category text NOT NULL,
 acquired_on date,
 disposed_on date,
 cost_minor bigint NOT NULL DEFAULT 0 CHECK(cost_minor>=0),
 residual_minor bigint NOT NULL DEFAULT 0 CHECK(residual_minor>=0),
 depreciation_method text NOT NULL DEFAULT 'straight_line',
 useful_life_months integer CHECK(useful_life_months IS NULL OR useful_life_months>0),
 accumulated_depreciation_minor bigint NOT NULL DEFAULT 0 CHECK(accumulated_depreciation_minor>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','disposed','written_off')),
 source_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,client_ref,asset_ref)
);

CREATE TABLE IF NOT EXISTS public.accounting_accounts_prep_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 prior_period_end date,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','queued','running','review','approved','complete','failed')),
 input_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
 model_run_id text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end>=period_start)
);

CREATE TABLE IF NOT EXISTS public.accounting_accounts_prep_adjustments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 prep_run_id uuid NOT NULL REFERENCES public.accounting_accounts_prep_runs(id) ON DELETE CASCADE,
 client_ref text NOT NULL,
 title text NOT NULL,
 description text NOT NULL,
 reason text NOT NULL,
 journal_date date NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 proposed_journal_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence_refs text[] NOT NULL DEFAULT '{}',
 confidence numeric(5,4) CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
 risk text NOT NULL DEFAULT 'normal' CHECK(risk IN('low','normal','high','specialist_review')),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','approved','rejected','posted')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 posted_journal_id uuid REFERENCES public.accounting_journals(id) ON DELETE SET NULL,
 model_run_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_knowledge_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 jurisdiction text NOT NULL,
 authority text NOT NULL,
 source_type text NOT NULL,
 authority_level text NOT NULL CHECK(authority_level IN('legislation','regulation','binding_case_law','persuasive_case_law','official_ruling','official_guidance','administrative_manual','secondary')),
 title text NOT NULL,
 citation text,
 source_url text NOT NULL,
 effective_from date,
 effective_until date,
 published_at date,
 checked_at timestamptz NOT NULL DEFAULT now(),
 content_hash text,
 supersedes_source_id uuid REFERENCES public.tax_knowledge_sources(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tax_knowledge_sources_source_uq ON public.tax_knowledge_sources(jurisdiction,source_url,COALESCE(content_hash,''));

CREATE TABLE IF NOT EXISTS public.tax_research_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 research_case_id uuid NOT NULL REFERENCES public.tax_research_cases(id) ON DELETE CASCADE,
 query text NOT NULL,
 source_hierarchy text[] NOT NULL DEFAULT '{}',
 retrieved_source_ids uuid[] NOT NULL DEFAULT '{}',
 answer_draft text NOT NULL DEFAULT '',
 uncertainties text[] NOT NULL DEFAULT '{}',
 contrary_authorities text[] NOT NULL DEFAULT '{}',
 model_run_id text,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','completed','failed')),
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.tax_position_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 research_case_id uuid NOT NULL REFERENCES public.tax_research_cases(id) ON DELETE CASCADE,
 title text NOT NULL,
 position_type text NOT NULL,
 proposed_treatment text NOT NULL,
 legal_basis text NOT NULL,
 source_ids uuid[] NOT NULL DEFAULT '{}',
 fact_dependencies text[] NOT NULL DEFAULT '{}',
 evidence_refs text[] NOT NULL DEFAULT '{}',
 estimated_tax_impact_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 confidence numeric(5,4) CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
 risk text NOT NULL DEFAULT 'specialist_review' CHECK(risk IN('low','medium','high','specialist_review')),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','changes_required','approved','rejected')),
 model_run_id text,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intelligence_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 job_type text NOT NULL,
 subject_type text NOT NULL,
 subject_id text NOT NULL,
 source_event_id uuid REFERENCES public.platform_events(id) ON DELETE SET NULL,
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','waiting_review','completed','failed','cancelled')),
 input jsonb NOT NULL DEFAULT '{}'::jsonb,
 requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
 provider_key text,
 model text,
 worker_key_id text,
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz,
 started_at timestamptz,
 completed_at timestamptz,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS intelligence_jobs_event_type_uq ON public.intelligence_jobs(tenant_id,product_key,job_type,source_event_id) WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS intelligence_jobs_claim_idx ON public.intelligence_jobs(status,next_attempt_at,priority,created_at);

CREATE TABLE IF NOT EXISTS public.ai_use_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 use_case_key text NOT NULL,
 name text NOT NULL,
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 purpose text NOT NULL,
 data_classes text[] NOT NULL DEFAULT '{}',
 allowed_tools text[] NOT NULL DEFAULT '{}',
 provider_route jsonb NOT NULL DEFAULT '{}'::jsonb,
 monthly_budget_minor bigint,
 budget_currency text CHECK(budget_currency IS NULL OR budget_currency ~ '^[A-Z]{3}$'),
 risk_level text NOT NULL DEFAULT 'review' CHECK(risk_level IN('low','review','high','prohibited')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','assessed','approved','pilot','suspended','retired')),
 revision integer NOT NULL DEFAULT 1,
 assessment jsonb NOT NULL DEFAULT '{}'::jsonb,
 evidence_refs text[] NOT NULL DEFAULT '{}',
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,use_case_key)
);

CREATE TABLE IF NOT EXISTS public.ai_agent_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 use_case_id uuid REFERENCES public.ai_use_cases(id) ON DELETE SET NULL,
 profile text NOT NULL,
 goal text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','waiting_review','completed','failed','cancelled','stale')),
 input_version text,
 provider_key text,
 model text,
 max_steps integer NOT NULL DEFAULT 8 CHECK(max_steps BETWEEN 1 AND 32),
 current_step integer NOT NULL DEFAULT 0,
 token_usage jsonb NOT NULL DEFAULT '{}'::jsonb,
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 initiated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ai_agent_steps(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES public.ai_agent_runs(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 step_no integer NOT NULL,
 step_type text NOT NULL CHECK(step_type IN('model','tool','observation','proposal','final')),
 tool_key text,
 request jsonb NOT NULL DEFAULT '{}'::jsonb,
 response jsonb NOT NULL DEFAULT '{}'::jsonb,
 source_refs text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'complete' CHECK(status IN('queued','running','complete','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,step_no)
);

CREATE TABLE IF NOT EXISTS public.ai_action_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 run_id uuid REFERENCES public.ai_agent_runs(id) ON DELETE SET NULL,
 action_key text NOT NULL,
 target_type text NOT NULL,
 target_id text,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 rationale text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','executed','failed','cancelled')),
 proposed_by text NOT NULL DEFAULT 'ai',
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 executed_at timestamptz,
 execution_result jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_identity_policies(
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
 allowed_methods text[] NOT NULL DEFAULT ARRAY['password','magic_link']::text[],
 mfa_required boolean NOT NULL DEFAULT false,
 customer_portal_enabled boolean NOT NULL DEFAULT true,
 passkeys_enabled boolean NOT NULL DEFAULT false,
 whatsapp_otp_enabled boolean NOT NULL DEFAULT false,
 sso_config jsonb NOT NULL DEFAULT '{}'::jsonb,
 session_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_portal_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE CASCADE,
 email text,
 phone_e164 text,
 token_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','expired','revoked')),
 expires_at timestamptz NOT NULL,
 invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_portal_users(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended','revoked')),
 permissions text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,user_id)
);

CREATE TABLE IF NOT EXISTS public.analytics_metric_points(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 metric_key text NOT NULL,
 dimension_key text,
 dimension_value text,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 value numeric NOT NULL,
 unit text NOT NULL DEFAULT 'count',
 source text NOT NULL DEFAULT 'system',
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_metric_lookup_idx ON public.analytics_metric_points(tenant_id,metric_key,period_start DESC);

CREATE TABLE IF NOT EXISTS public.financial_budgets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 lines jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','locked','superseded')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.financial_forecasts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 budget_id uuid REFERENCES public.financial_budgets(id) ON DELETE SET NULL,
 scenario text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 lines jsonb NOT NULL DEFAULT '[]'::jsonb,
 assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.financial_actuals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 period_start date NOT NULL,
 period_end date NOT NULL,
 category text NOT NULL,
 amount_minor bigint NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 source_ref text,
 evidence_ref text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.financial_benefits(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 benefit_key text NOT NULL,
 title text NOT NULL,
 baseline_minor bigint NOT NULL,
 actual_minor bigint NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 period_start date NOT NULL,
 period_end date NOT NULL,
 methodology text NOT NULL,
 evidence_refs text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','accepted','rejected')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,benefit_key)
);

CREATE TABLE IF NOT EXISTS public.connector_health_checks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE CASCADE,
 binding_id uuid REFERENCES public.provider_bindings(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN('healthy','degraded','failed','unverified')),
 latency_ms integer CHECK(latency_ms IS NULL OR latency_ms>=0),
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.connector_sync_state(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE CASCADE,
 cursor text,
 watermark timestamptz,
 status text NOT NULL DEFAULT 'idle' CHECK(status IN('idle','running','degraded','failed','paused')),
 last_started_at timestamptz,
 last_completed_at timestamptz,
 last_error text,
 metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,provider_key)
);
CREATE TABLE IF NOT EXISTS public.connector_webhook_inbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE CASCADE,
 external_event_id text,
 event_type text NOT NULL,
 signature_valid boolean NOT NULL DEFAULT false,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'received' CHECK(status IN('received','accepted','processed','ignored','failed','dead_letter')),
 attempts integer NOT NULL DEFAULT 0,
 received_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 last_error text
);
CREATE UNIQUE INDEX IF NOT EXISTS connector_webhook_dedupe_idx ON public.connector_webhook_inbox(tenant_id,product_key,provider_key,external_event_id) WHERE external_event_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.connector_reconciliations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key) ON DELETE CASCADE,
 reconciliation_type text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','matched','warning','failed','accepted')),
 source_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 target_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 differences jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence_refs text[] NOT NULL DEFAULT '{}',
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.communication_identities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN('whatsapp','sms','email','voice','push')),
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 address text NOT NULL,
 display_name text,
 status text NOT NULL DEFAULT 'configured' CHECK(status IN('configured','verified','active','degraded','disabled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,channel,address)
);
CREATE TABLE IF NOT EXISTS public.communication_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 channel text NOT NULL,
 direction text NOT NULL CHECK(direction IN('inbound','outbound')),
 event_type text NOT NULL,
 external_ref text,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 subject_type text,
 subject_id text,
 status text NOT NULL DEFAULT 'received',
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reception_settings(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 greeting text,
 business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
 escalation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
 allowed_actions text[] NOT NULL DEFAULT '{}',
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key)
);
CREATE TABLE IF NOT EXISTS public.reception_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 channel text NOT NULL,
 caller_ref text,
 intent text,
 summary text,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','triaged','escalated','resolved','closed')),
 requested_action text,
 action_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'practice_clients','practice_engagements','practice_deadlines','accounting_nominal_accounts','accounting_journals',
  'accounting_journal_lines','accounting_assets','accounting_accounts_prep_runs','accounting_accounts_prep_adjustments',
  'tax_research_runs','tax_position_proposals','intelligence_jobs','ai_use_cases','ai_agent_runs','ai_agent_steps',
  'ai_action_proposals','customer_portal_invitations','customer_portal_users','analytics_metric_points',
  'financial_budgets','financial_forecasts','financial_actuals','financial_benefits','connector_health_checks',
  'connector_sync_state','connector_webhook_inbox','connector_reconciliations','communication_identities',
  'communication_events','reception_settings','reception_requests'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  IF t NOT IN ('ai_agent_steps') THEN
   EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','v3 tenant read '||t,t);
   EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','v3 tenant write '||t,t);
  ELSE
   EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','v3 tenant read '||t,t);
   EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','v3 tenant write '||t,t);
  END IF;
 END LOOP;
END $$;

ALTER TABLE public.tenant_identity_policies ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tenant_identity_policies TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.tenant_identity_policies TO authenticated;
CREATE POLICY "v3 identity policy read" ON public.tenant_identity_policies FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "v3 identity policy write" ON public.tenant_identity_policies FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

ALTER TABLE public.tax_knowledge_sources ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tax_knowledge_sources TO authenticated;
GRANT ALL ON public.tax_knowledge_sources TO service_role;
CREATE POLICY "v3 tax knowledge read" ON public.tax_knowledge_sources FOR SELECT TO authenticated USING(true);

CREATE OR REPLACE FUNCTION public.accounting_post_ingestion_job(_tenant uuid,_job uuid,_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
 j public.accounting_ingestion_jobs%rowtype;
 line jsonb;
 v_journal_id uuid;
 account_id uuid;
 debit_value bigint;
 credit_value bigint;
 total_debit bigint:=0;
 total_credit bigint:=0;
 currency_code text;
 account_code text;
BEGIN
 IF NOT public.is_platform_admin(_actor) AND NOT public.can_write(_tenant,_actor) THEN
  RAISE EXCEPTION 'accounting write access required';
 END IF;
 SELECT * INTO j FROM public.accounting_ingestion_jobs WHERE id=_job AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'accounting ingestion job not found'; END IF;
 IF j.status NOT IN('review','extracting','classifying') THEN
  RAISE EXCEPTION 'accounting ingestion job must be in review pipeline';
 END IF;
 IF jsonb_typeof(j.proposed_entries)<>'array' OR jsonb_array_length(j.proposed_entries)<2 THEN
  RAISE EXCEPTION 'reviewed balanced proposal required';
 END IF;
 currency_code:=COALESCE(NULLIF(j.extracted->>'currency',''),'GBP');
 FOR line IN SELECT * FROM jsonb_array_elements(j.proposed_entries) LOOP
  account_code:=btrim(COALESCE(line->>'accountCode',''));
  debit_value:=COALESCE((line->>'debitMinor')::bigint,0);
  credit_value:=COALESCE((line->>'creditMinor')::bigint,0);
  IF account_code='' OR debit_value<0 OR credit_value<0 OR ((debit_value=0)=(credit_value=0)) THEN
   RAISE EXCEPTION 'invalid proposed journal line';
  END IF;
  SELECT id INTO account_id FROM public.accounting_nominal_accounts
   WHERE tenant_id=_tenant AND product_key=j.product_key AND client_ref=j.client_ref AND code=account_code AND active=true;
  IF account_id IS NULL THEN RAISE EXCEPTION 'unknown nominal account %',account_code; END IF;
  total_debit:=total_debit+debit_value; total_credit:=total_credit+credit_value;
 END LOOP;
 IF total_debit<=0 OR total_debit<>total_credit THEN RAISE EXCEPTION 'journal proposal is not balanced'; END IF;

 INSERT INTO public.accounting_journals(tenant_id,product_key,client_ref,journal_date,reference,description,source_type,source_ref,status,posted_by,posted_at,metadata)
 VALUES(_tenant,j.product_key,j.client_ref,COALESCE((j.extracted->>'date')::date,current_date),j.extracted->>'reference',
        COALESCE(j.extracted->>'description',initcap(j.source_kind)||' ingestion'),'ingestion_job',j.id::text,'posted',_actor,now(),
        jsonb_build_object('documentId',j.document_id))
 ON CONFLICT(tenant_id,product_key,source_type,source_ref) DO UPDATE SET updated_at=now()
 RETURNING id INTO v_journal_id;

 IF NOT EXISTS(SELECT 1 FROM public.accounting_journal_lines l0 WHERE l0.journal_id=v_journal_id) THEN
  FOR line IN SELECT * FROM jsonb_array_elements(j.proposed_entries) LOOP
   account_code:=btrim(line->>'accountCode');
   SELECT id INTO account_id FROM public.accounting_nominal_accounts
    WHERE tenant_id=_tenant AND product_key=j.product_key AND client_ref=j.client_ref AND code=account_code AND active=true;
   INSERT INTO public.accounting_journal_lines(tenant_id,journal_id,account_id,description,debit_minor,credit_minor,currency,tax_code,metadata)
   VALUES(_tenant,v_journal_id,account_id,NULLIF(line->>'description',''),COALESCE((line->>'debitMinor')::bigint,0),
          COALESCE((line->>'creditMinor')::bigint,0),currency_code,NULLIF(line->>'taxCode',''),COALESCE(line->'metadata','{}'::jsonb));
  END LOOP;
 END IF;
 UPDATE public.accounting_ingestion_jobs SET status='posted',updated_at=now() WHERE id=j.id;
 RETURN v_journal_id;
END; $$;
REVOKE ALL ON FUNCTION public.accounting_post_ingestion_job(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accounting_post_ingestion_job(uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.accounting_trial_balance_v3(_tenant uuid,_product text,_client_ref text,_period_end date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
 SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.code),'[]'::jsonb)
 FROM (
  SELECT a.code,a.name,a.account_type,
    COALESCE(sum(l.debit_minor),0)::bigint AS debit_minor,
    COALESCE(sum(l.credit_minor),0)::bigint AS credit_minor,
    (COALESCE(sum(l.debit_minor),0)-COALESCE(sum(l.credit_minor),0))::bigint AS balance_minor
  FROM public.accounting_nominal_accounts a
  LEFT JOIN public.accounting_journals j ON j.tenant_id=a.tenant_id AND j.product_key=a.product_key
    AND j.client_ref=a.client_ref AND j.status='posted' AND j.journal_date<=_period_end
  LEFT JOIN public.accounting_journal_lines l ON l.journal_id=j.id AND l.account_id=a.id
  WHERE a.tenant_id=_tenant AND a.product_key=_product AND a.client_ref=_client_ref AND a.active
  GROUP BY a.code,a.name,a.account_type
 ) x;
$$;
REVOKE ALL ON FUNCTION public.accounting_trial_balance_v3(uuid,text,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accounting_trial_balance_v3(uuid,text,text,date) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.claim_intelligence_jobs_for_scope(
 _tenant uuid,_product text,_limit integer DEFAULT 10,_job_types text[] DEFAULT NULL,_worker_key text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
 RETURN QUERY
 WITH jobs AS(
  SELECT j.id FROM public.intelligence_jobs j
  WHERE j.tenant_id=_tenant AND j.product_key=_product
    AND ((j.status='queued' AND j.next_attempt_at<=now()) OR (j.status='processing' AND j.locked_at<now()-interval '10 minutes'))
    AND (_job_types IS NULL OR j.job_type=ANY(_job_types))
  ORDER BY CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,j.created_at
  LIMIT LEAST(GREATEST(_limit,1),50)
  FOR UPDATE SKIP LOCKED
 )
 UPDATE public.intelligence_jobs j
 SET status='processing',attempts=j.attempts+1,locked_at=now(),started_at=COALESCE(j.started_at,now()),worker_key_id=_worker_key,updated_at=now()
 FROM jobs x WHERE j.id=x.id
 RETURNING jsonb_build_object('id',j.id,'tenantId',j.tenant_id,'productKey',j.product_key,'jobType',j.job_type,
  'subjectType',j.subject_type,'subjectId',j.subject_id,'priority',j.priority,'input',j.input,'requirements',j.requirements,'attempts',j.attempts);
END; $$;
REVOKE ALL ON FUNCTION public.claim_intelligence_jobs_for_scope(uuid,text,integer,text[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_intelligence_jobs_for_scope(uuid,text,integer,text[],text) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_intelligence_job(
 _job uuid,_success boolean,_result jsonb DEFAULT '{}'::jsonb,_provider_key text DEFAULT NULL,_model text DEFAULT NULL,_error text DEFAULT NULL,_waiting_review boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE j public.intelligence_jobs%rowtype;
BEGIN
 SELECT * INTO j FROM public.intelligence_jobs WHERE id=_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'processing' THEN RAISE EXCEPTION 'intelligence job not processing'; END IF;
 IF _success THEN
  UPDATE public.intelligence_jobs SET status=CASE WHEN _waiting_review THEN 'waiting_review' ELSE 'completed' END,
    result=COALESCE(_result,'{}'::jsonb),provider_key=_provider_key,model=_model,completed_at=CASE WHEN _waiting_review THEN NULL ELSE now() END,
    locked_at=NULL,last_error=NULL,updated_at=now() WHERE id=_job;
 ELSIF j.attempts>=5 THEN
  UPDATE public.intelligence_jobs SET status='failed',last_error=left(COALESCE(_error,'intelligence job failed'),2000),completed_at=now(),locked_at=NULL,updated_at=now() WHERE id=_job;
 ELSE
  UPDATE public.intelligence_jobs SET status='queued',next_attempt_at=now()+(power(2,LEAST(j.attempts,8))::text||' minutes')::interval,
    last_error=left(COALESCE(_error,'intelligence job failed'),2000),locked_at=NULL,updated_at=now() WHERE id=_job;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.finish_intelligence_job(uuid,boolean,jsonb,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_intelligence_job(uuid,boolean,jsonb,text,text,text,boolean) TO service_role;

COMMIT;
