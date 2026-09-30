-- AI Bookkeeping & Tax Intelligence add-ons for accounting-practice landlords.
-- ADDITIVE ONLY. Tax/accounting outputs remain reviewable drafts until authorised.
BEGIN;

INSERT INTO public.platform_modules(module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities) VALUES
 ('accounting_ai.core','Omniqora AI Bookkeeping & Accounts Prep','accounting_ai','1.0.0-preview','preview','workspace',
  ARRAY['practice.core','documents.core','intelligence.core','forms.core','automation.core','platform.audit'],
  ARRAY['intake','extraction','classification','review_queue','nominal_ledger','journals','trial_balance','assets','accounts_prep','bank_matching','duplicate_detection']),
 ('tax_intelligence.core','Omniqora Tax Intelligence','tax_intelligence','1.0.0-preview','preview','workspace',
  ARRAY['accounting_ai.core','intelligence.core','documents.core','platform.audit'],
  ARRAY['research','legislation','case_law','official_guidance','positions','relief_search','planning','review','change_monitoring'])
ON CONFLICT(module_key) DO UPDATE SET
 name=EXCLUDED.name,module_kind=EXCLUDED.module_kind,version=EXCLUDED.version,status=EXCLUDED.status,
 ui_mode=EXCLUDED.ui_mode,dependencies=EXCLUDED.dependencies,capabilities=EXCLUDED.capabilities,updated_at=now();

INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default) VALUES
 ('taxcenda','accounting_ai.core',false),('taxcenda','tax_intelligence.core',false),
 ('iq-practice-cloud','accounting_ai.core',false),('iq-practice-cloud','tax_intelligence.core',false)
ON CONFLICT(product_key,module_key) DO UPDATE SET enabled_by_default=EXCLUDED.enabled_by_default;

CREATE TABLE IF NOT EXISTS public.practice_client_users(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 portal_role text NOT NULL DEFAULT 'client_user' CHECK(portal_role IN ('client_owner','client_user','client_viewer')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('invited','active','suspended','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(practice_client_id,user_id)
);
CREATE INDEX IF NOT EXISTS practice_client_users_user_idx ON public.practice_client_users(user_id,tenant_id,status);

ALTER TABLE public.practice_client_users ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.practice_client_users TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.practice_client_users TO authenticated;
GRANT ALL ON public.practice_client_users TO service_role;
DROP POLICY IF EXISTS "practice client user self read" ON public.practice_client_users;
CREATE POLICY "practice client user self read" ON public.practice_client_users FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "practice client user admin write" ON public.practice_client_users;
CREATE POLICY "practice client user admin write" ON public.practice_client_users FOR ALL TO authenticated
 USING(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.has_practice_client_access(_client uuid,_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
 SELECT EXISTS(
  SELECT 1
  FROM public.practice_clients c
  WHERE c.id=_client
    AND (
      public.is_tenant_member(c.tenant_id,_user)
      OR EXISTS(
        SELECT 1 FROM public.practice_client_users u
        WHERE u.practice_client_id=c.id AND u.tenant_id=c.tenant_id
          AND u.user_id=_user AND u.status='active'
      )
    )
 );
$$;
REVOKE EXECUTE ON FUNCTION public.has_practice_client_access(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.has_practice_client_access(uuid,uuid) TO authenticated,service_role;

CREATE TABLE IF NOT EXISTS public.practice_client_services(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 module_key text NOT NULL REFERENCES public.platform_modules(module_key) ON DELETE RESTRICT,
 enabled boolean NOT NULL DEFAULT true,
 commercial_mode text NOT NULL DEFAULT 'included'
  CHECK(commercial_mode IN ('included','free','fixed_monthly','fixed_annual','usage','custom')),
 price_minor bigint CHECK(price_minor IS NULL OR price_minor>=0),
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 billing_reference text,
 starts_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz,
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(practice_client_id,module_key)
);
CREATE INDEX IF NOT EXISTS practice_client_services_lookup_idx
 ON public.practice_client_services(tenant_id,tenant_product_id,practice_client_id,enabled);

CREATE TABLE IF NOT EXISTS public.accounting_intake_batches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE SET NULL,
 phase text NOT NULL CHECK(phase IN ('opening_file','ongoing_file')),
 source text NOT NULL CHECK(source IN ('mobile_camera','scanner','pdf','csv','email','upload','bank_feed','import')),
 status text NOT NULL DEFAULT 'draft'
  CHECK(status IN ('draft','uploaded','extracting','review','approved','posted','failed')),
 period_start date,
 period_end date,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end IS NULL OR period_start IS NULL OR period_end>=period_start)
);
CREATE INDEX IF NOT EXISTS accounting_intake_batches_client_idx
 ON public.accounting_intake_batches(tenant_id,practice_client_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.accounting_intake_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 batch_id uuid NOT NULL REFERENCES public.accounting_intake_batches(id) ON DELETE CASCADE,
 document_id uuid REFERENCES public.platform_documents(id) ON DELETE SET NULL,
 source_type text NOT NULL
  CHECK(source_type IN ('receipt','purchase_invoice','sales_invoice','bank_statement','credit_card_statement','opening_accounts','opening_trial_balance','journal','other')),
 original_reference text,
 extraction_status text NOT NULL DEFAULT 'not_started'
  CHECK(extraction_status IN ('not_started','queued','processing','completed','needs_review','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounting_intake_items_batch_idx ON public.accounting_intake_items(batch_id,extraction_status);

CREATE TABLE IF NOT EXISTS public.accounting_extraction_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 batch_id uuid NOT NULL REFERENCES public.accounting_intake_batches(id) ON DELETE CASCADE,
 provider text,
 model text,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','completed','failed','cancelled')),
 model_run_id text,
 started_at timestamptz,
 completed_at timestamptz,
 error text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounting_extraction_runs_queue_idx ON public.accounting_extraction_runs(status,created_at);

CREATE TABLE IF NOT EXISTS public.accounting_nominal_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 code text NOT NULL,
 name text NOT NULL,
 account_type text NOT NULL CHECK(account_type IN ('asset','liability','equity','income','expense')),
 normal_balance text NOT NULL CHECK(normal_balance IN ('debit','credit')),
 active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(practice_client_id,code)
);

CREATE TABLE IF NOT EXISTS public.accounting_staging_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 batch_id uuid NOT NULL REFERENCES public.accounting_intake_batches(id) ON DELETE CASCADE,
 intake_item_id uuid REFERENCES public.accounting_intake_items(id) ON DELETE SET NULL,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 source_type text NOT NULL,
 transaction_date date,
 counterparty text,
 description text NOT NULL,
 gross_minor bigint,
 net_minor bigint,
 tax_minor bigint,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 proposed_account_code text,
 proposed_tax_code text,
 treatment text NOT NULL DEFAULT 'unknown'
  CHECK(treatment IN ('income','revenue_expense','capital_expenditure','asset','liability','equity','private_nonbusiness','transfer','unknown')),
 confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
 duplicate_candidate boolean NOT NULL DEFAULT false,
 proposed_journal_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence_refs text[] NOT NULL DEFAULT '{}',
 model_run_id text,
 review_status text NOT NULL DEFAULT 'proposed'
  CHECK(review_status IN ('proposed','needs_review','approved','rejected','posted')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounting_staging_review_idx
 ON public.accounting_staging_entries(tenant_id,practice_client_id,review_status,confidence,created_at);

CREATE TABLE IF NOT EXISTS public.accounting_review_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 proposal_id uuid NOT NULL REFERENCES public.accounting_staging_entries(id) ON DELETE CASCADE,
 issue_type text NOT NULL
  CHECK(issue_type IN ('low_confidence','capex_vs_revenue','missing_tax','duplicate','unmatched_bank','unknown_account','accounting_policy','other')),
 question text NOT NULL,
 options jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence_refs text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','resolved','dismissed')),
 answer jsonb,
 answered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 answered_at timestamptz,
 resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounting_review_items_queue_idx
 ON public.accounting_review_items(tenant_id,status,created_at);

CREATE TABLE IF NOT EXISTS public.accounting_journals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE SET NULL,
 journal_date date NOT NULL,
 reference text NOT NULL,
 description text NOT NULL,
 source_type text NOT NULL,
 source_ref text NOT NULL,
 status text NOT NULL DEFAULT 'posted' CHECK(status IN ('draft','posted','reversed')),
 posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 posted_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_ref)
);
CREATE INDEX IF NOT EXISTS accounting_journals_period_idx
 ON public.accounting_journals(tenant_id,practice_client_id,journal_date,status);

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
 source_proposal_id uuid REFERENCES public.accounting_staging_entries(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((debit_minor=0 AND credit_minor>0) OR (credit_minor=0 AND debit_minor>0))
);
CREATE INDEX IF NOT EXISTS accounting_journal_lines_account_idx
 ON public.accounting_journal_lines(tenant_id,account_id,journal_id);

CREATE TABLE IF NOT EXISTS public.accounting_assets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 source_proposal_id uuid REFERENCES public.accounting_staging_entries(id) ON DELETE SET NULL,
 asset_class text NOT NULL,
 description text NOT NULL,
 acquisition_date date NOT NULL,
 cost_minor bigint NOT NULL CHECK(cost_minor>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 depreciation_method text NOT NULL DEFAULT 'straight_line' CHECK(depreciation_method IN ('straight_line','reducing_balance','none')),
 useful_life_months integer CHECK(useful_life_months IS NULL OR useful_life_months>0),
 opening_accumulated_depreciation_minor bigint NOT NULL DEFAULT 0 CHECK(opening_accumulated_depreciation_minor>=0),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','disposed','rejected')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounting_assets_client_idx
 ON public.accounting_assets(tenant_id,practice_client_id,status,acquisition_date);

CREATE TABLE IF NOT EXISTS public.accounting_accounts_prep_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE SET NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 framework_key text NOT NULL,
 opening_trial_balance_ref text,
 prior_accounts_document_id uuid REFERENCES public.platform_documents(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','building','review','approved','completed','failed')),
 adjustment_count integer NOT NULL DEFAULT 0 CHECK(adjustment_count>=0),
 output_document_refs text[] NOT NULL DEFAULT '{}',
 review_notes text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(period_end>=period_start)
);

CREATE TABLE IF NOT EXISTS public.tax_knowledge_sources(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 jurisdiction text NOT NULL,
 authority text NOT NULL,
 source_type text NOT NULL,
 authority_level text NOT NULL
  CHECK(authority_level IN ('legislation','regulation','binding_case_law','persuasive_case_law','official_ruling','official_guidance','administrative_manual','secondary')),
 title text NOT NULL,
 citation text,
 source_url text NOT NULL,
 effective_from date,
 effective_until date,
 published_at date,
 checked_at timestamptz NOT NULL,
 content_hash text,
 supersedes_source_id uuid REFERENCES public.tax_knowledge_sources(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(jurisdiction,source_url,COALESCE(content_hash,''))
);
CREATE INDEX IF NOT EXISTS tax_knowledge_sources_lookup_idx
 ON public.tax_knowledge_sources(jurisdiction,authority_level,effective_from,effective_until,checked_at DESC);

CREATE TABLE IF NOT EXISTS public.tax_research_issues(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE SET NULL,
 jurisdiction text NOT NULL,
 tax_type text NOT NULL,
 period_key text NOT NULL,
 issue text NOT NULL,
 factual_basis text NOT NULL,
 fact_evidence_refs text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','researching','review','approved','rejected','superseded')),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_research_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 research_issue_id uuid NOT NULL REFERENCES public.tax_research_issues(id) ON DELETE CASCADE,
 query text NOT NULL,
 source_hierarchy text[] NOT NULL DEFAULT '{}',
 retrieved_source_ids uuid[] NOT NULL DEFAULT '{}',
 answer_draft text NOT NULL DEFAULT '',
 uncertainties text[] NOT NULL DEFAULT '{}',
 contrary_authorities text[] NOT NULL DEFAULT '{}',
 model_run_id text,
 status text NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.tax_position_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 research_issue_id uuid NOT NULL REFERENCES public.tax_research_issues(id) ON DELETE CASCADE,
 title text NOT NULL,
 position_type text NOT NULL,
 proposed_treatment text NOT NULL,
 legal_basis text NOT NULL,
 source_ids uuid[] NOT NULL DEFAULT '{}',
 fact_dependencies text[] NOT NULL DEFAULT '{}',
 evidence_refs text[] NOT NULL DEFAULT '{}',
 estimated_tax_impact_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 confidence numeric(5,4) NOT NULL CHECK(confidence BETWEEN 0 AND 1),
 risk text NOT NULL CHECK(risk IN ('low','medium','high','specialist_review')),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','changes_required','approved','rejected')),
 model_run_id text,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tax_position_proposals_issue_idx ON public.tax_position_proposals(tenant_id,research_issue_id,status,risk);

-- RLS: practice staff can administer; client portal users can upload/read their own intake but cannot post journals/tax positions.
ALTER TABLE public.practice_client_services ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.practice_client_services TO authenticated;
GRANT ALL ON public.practice_client_services TO service_role;
DROP POLICY IF EXISTS "practice client services staff read" ON public.practice_client_services;
CREATE POLICY "practice client services staff read" ON public.practice_client_services FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "practice client services staff write" ON public.practice_client_services;
CREATE POLICY "practice client services staff write" ON public.practice_client_services FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

ALTER TABLE public.accounting_intake_batches ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.accounting_intake_batches TO authenticated;
GRANT UPDATE,DELETE ON public.accounting_intake_batches TO authenticated;
GRANT ALL ON public.accounting_intake_batches TO service_role;
DROP POLICY IF EXISTS "accounting intake client read" ON public.accounting_intake_batches;
CREATE POLICY "accounting intake client read" ON public.accounting_intake_batches FOR SELECT TO authenticated
 USING(public.has_practice_client_access(practice_client_id,auth.uid()));
DROP POLICY IF EXISTS "accounting intake client create" ON public.accounting_intake_batches;
CREATE POLICY "accounting intake client create" ON public.accounting_intake_batches FOR INSERT TO authenticated
 WITH CHECK(public.has_practice_client_access(practice_client_id,auth.uid()) AND status IN ('draft','uploaded'));
DROP POLICY IF EXISTS "accounting intake staff update" ON public.accounting_intake_batches;
CREATE POLICY "accounting intake staff update" ON public.accounting_intake_batches FOR UPDATE TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "accounting intake staff delete" ON public.accounting_intake_batches;
CREATE POLICY "accounting intake staff delete" ON public.accounting_intake_batches FOR DELETE TO authenticated
 USING(public.can_write(tenant_id,auth.uid()));

ALTER TABLE public.accounting_intake_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT ON public.accounting_intake_items TO authenticated;
GRANT UPDATE,DELETE ON public.accounting_intake_items TO authenticated;
GRANT ALL ON public.accounting_intake_items TO service_role;
DROP POLICY IF EXISTS "accounting item client read" ON public.accounting_intake_items;
CREATE POLICY "accounting item client read" ON public.accounting_intake_items FOR SELECT TO authenticated
 USING(EXISTS(
  SELECT 1 FROM public.accounting_intake_batches b
  WHERE b.id=batch_id AND b.tenant_id=tenant_id AND public.has_practice_client_access(b.practice_client_id,auth.uid())
 ));
DROP POLICY IF EXISTS "accounting item client create" ON public.accounting_intake_items;
CREATE POLICY "accounting item client create" ON public.accounting_intake_items FOR INSERT TO authenticated
 WITH CHECK(EXISTS(
  SELECT 1 FROM public.accounting_intake_batches b
  WHERE b.id=batch_id AND b.tenant_id=tenant_id AND public.has_practice_client_access(b.practice_client_id,auth.uid())
 ));
DROP POLICY IF EXISTS "accounting item staff update" ON public.accounting_intake_items;
CREATE POLICY "accounting item staff update" ON public.accounting_intake_items FOR UPDATE TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "accounting item staff delete" ON public.accounting_intake_items;
CREATE POLICY "accounting item staff delete" ON public.accounting_intake_items FOR DELETE TO authenticated
 USING(public.can_write(tenant_id,auth.uid()));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'accounting_extraction_runs','accounting_nominal_accounts','accounting_staging_entries','accounting_review_items',
  'accounting_journals','accounting_journal_lines','accounting_assets','accounting_accounts_prep_runs',
  'tax_research_issues','tax_research_runs','tax_position_proposals'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','accounting staff read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))','accounting staff read',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','accounting staff write',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))','accounting staff write',t);
 END LOOP;
END $$;

ALTER TABLE public.tax_knowledge_sources ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tax_knowledge_sources TO authenticated;
GRANT ALL ON public.tax_knowledge_sources TO service_role;
DROP POLICY IF EXISTS "tax source read" ON public.tax_knowledge_sources;
CREATE POLICY "tax source read" ON public.tax_knowledge_sources FOR SELECT TO authenticated USING(true);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'practice_client_users','practice_client_services','accounting_intake_batches','accounting_intake_items',
  'accounting_nominal_accounts','accounting_staging_entries','accounting_review_items','accounting_journals',
  'accounting_assets','accounting_accounts_prep_runs','tax_research_issues','tax_position_proposals'
 ] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
  EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
 END LOOP;
END $$;

-- Journals and journal lines become append-only to authenticated users; controlled RPC posts them.
REVOKE INSERT,UPDATE,DELETE ON public.accounting_journals,public.accounting_journal_lines FROM authenticated;
DROP POLICY IF EXISTS "accounting staff write" ON public.accounting_journals;
DROP POLICY IF EXISTS "accounting staff write" ON public.accounting_journal_lines;

CREATE OR REPLACE FUNCTION public.post_accounting_proposal(_tenant uuid,_proposal uuid,_actor uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE p public.accounting_staging_entries; b public.accounting_intake_batches; j uuid; line jsonb;
DECLARE total_debit bigint:=0; total_credit bigint:=0; debit_value bigint; credit_value bigint; acc uuid; code text;
BEGIN
 SELECT * INTO p FROM public.accounting_staging_entries WHERE id=_proposal AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND OR p.review_status<>'approved' THEN RAISE EXCEPTION 'approved_proposal_required'; END IF;
 IF p.transaction_date IS NULL THEN RAISE EXCEPTION 'transaction_date_required'; END IF;
 IF jsonb_typeof(p.proposed_journal_lines)<>'array' OR jsonb_array_length(p.proposed_journal_lines)<2 THEN
  RAISE EXCEPTION 'balanced_journal_lines_required';
 END IF;
 SELECT * INTO b FROM public.accounting_intake_batches WHERE id=p.batch_id AND tenant_id=_tenant;
 IF NOT FOUND THEN RAISE EXCEPTION 'accounting_batch_not_found'; END IF;

 FOR line IN SELECT * FROM jsonb_array_elements(p.proposed_journal_lines) LOOP
  code:=btrim(COALESCE(line->>'accountCode',''));
  debit_value:=COALESCE((line->>'debitMinor')::bigint,0);
  credit_value:=COALESCE((line->>'creditMinor')::bigint,0);
  IF code='' OR debit_value<0 OR credit_value<0 OR ((debit_value=0)=(credit_value=0)) THEN
   RAISE EXCEPTION 'invalid_journal_line';
  END IF;
  IF NOT EXISTS(
   SELECT 1 FROM public.accounting_nominal_accounts a
   WHERE a.practice_client_id=p.practice_client_id AND a.tenant_id=_tenant AND a.code=code AND a.active=true
  ) THEN RAISE EXCEPTION 'unknown_account_code:%',code; END IF;
  total_debit:=total_debit+debit_value; total_credit:=total_credit+credit_value;
 END LOOP;
 IF total_debit<=0 OR total_debit<>total_credit THEN RAISE EXCEPTION 'journal_not_balanced'; END IF;

 INSERT INTO public.accounting_journals(
  tenant_id,practice_client_id,engagement_id,journal_date,reference,description,source_type,source_ref,
  status,posted_by,posted_at
 ) VALUES(
  _tenant,p.practice_client_id,b.engagement_id,p.transaction_date,'AI-'||left(p.id::text,8),p.description,
  'accounting_ai_proposal','proposal:'||p.id,'posted',_actor,now()
 ) RETURNING id INTO j;

 FOR line IN SELECT * FROM jsonb_array_elements(p.proposed_journal_lines) LOOP
  code:=btrim(line->>'accountCode');
  SELECT id INTO acc FROM public.accounting_nominal_accounts
   WHERE practice_client_id=p.practice_client_id AND tenant_id=_tenant AND code=code AND active=true;
  INSERT INTO public.accounting_journal_lines(
   tenant_id,journal_id,account_id,description,debit_minor,credit_minor,currency,tax_code,source_proposal_id
  ) VALUES(
   _tenant,j,acc,NULLIF(line->>'memo',''),COALESCE((line->>'debitMinor')::bigint,0),
   COALESCE((line->>'creditMinor')::bigint,0),p.currency,p.proposed_tax_code,p.id
  );
 END LOOP;

 UPDATE public.accounting_staging_entries
  SET review_status='posted',reviewed_by=COALESCE(reviewed_by,_actor),reviewed_at=COALESCE(reviewed_at,now()),updated_at=now()
  WHERE id=p.id;

 IF p.treatment IN ('capital_expenditure','asset') AND p.gross_minor IS NOT NULL AND p.gross_minor>=0 THEN
  INSERT INTO public.accounting_assets(
   tenant_id,practice_client_id,source_proposal_id,asset_class,description,acquisition_date,cost_minor,currency,status,metadata
  ) VALUES(
   _tenant,p.practice_client_id,p.id,COALESCE(NULLIF(p.proposed_account_code,''),'unclassified'),p.description,
   p.transaction_date,p.gross_minor,p.currency,'proposed',jsonb_build_object('createdFrom','accounting_ai_proposal')
  ) ON CONFLICT DO NOTHING;
 END IF;
 RETURN j;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_accounting_proposal(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_accounting_proposal(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.accounting_trial_balance(
 _tenant uuid,_client uuid,_period_start date,_period_end date
)
RETURNS TABLE(
 account_code text,account_name text,account_type text,
 opening_debit_minor bigint,opening_credit_minor bigint,
 period_debit_minor bigint,period_credit_minor bigint,
 closing_debit_minor bigint,closing_credit_minor bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
 WITH activity AS(
  SELECT a.id,a.code,a.name,a.account_type,
   COALESCE(sum(CASE WHEN j.journal_date<_period_start THEN l.debit_minor ELSE 0 END),0)::bigint od,
   COALESCE(sum(CASE WHEN j.journal_date<_period_start THEN l.credit_minor ELSE 0 END),0)::bigint oc,
   COALESCE(sum(CASE WHEN j.journal_date BETWEEN _period_start AND _period_end THEN l.debit_minor ELSE 0 END),0)::bigint pd,
   COALESCE(sum(CASE WHEN j.journal_date BETWEEN _period_start AND _period_end THEN l.credit_minor ELSE 0 END),0)::bigint pc
  FROM public.accounting_nominal_accounts a
  LEFT JOIN public.accounting_journal_lines l ON l.account_id=a.id AND l.tenant_id=_tenant
  LEFT JOIN public.accounting_journals j ON j.id=l.journal_id AND j.tenant_id=_tenant AND j.status='posted'
  WHERE a.tenant_id=_tenant AND a.practice_client_id=_client AND a.active=true
  GROUP BY a.id,a.code,a.name,a.account_type
 )
 SELECT code,name,account_type,
  GREATEST(od-oc,0),GREATEST(oc-od,0),pd,pc,
  GREATEST((od+pd)-(oc+pc),0),GREATEST((oc+pc)-(od+pd),0)
 FROM activity
 ORDER BY code;
$$;
REVOKE EXECUTE ON FUNCTION public.accounting_trial_balance(uuid,uuid,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accounting_trial_balance(uuid,uuid,date,date) TO authenticated,service_role;

COMMIT;
