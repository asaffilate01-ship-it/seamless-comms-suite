BEGIN;

-- Omniqora completion layer: accounting/tax, governed AI, knowledge enrichment,
-- and transaction/M&A control plane. Dishbee-specific runtime/migration is
-- intentionally excluded from this migration.

CREATE TABLE IF NOT EXISTS public.accounting_review_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 ingestion_job_id uuid REFERENCES public.accounting_ingestion_jobs(id) ON DELETE SET NULL,
 client_ref text NOT NULL,
 issue_type text NOT NULL CHECK(issue_type IN(
   'low_confidence','capex_vs_revenue','missing_tax','duplicate','unmatched_bank',
   'unknown_account','accounting_policy','other')),
 question text NOT NULL,
 proposed_entry jsonb NOT NULL DEFAULT '{}'::jsonb,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 confidence numeric CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1)),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','answered','approved','rejected','posted')),
 answer jsonb NOT NULL DEFAULT '{}'::jsonb,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_journals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 journal_date date NOT NULL,
 reference text NOT NULL,
 description text NOT NULL,
 source_type text NOT NULL DEFAULT 'manual',
 source_ref text,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','posted','reversed')),
 posted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 posted_at timestamptz,
 reversal_of uuid REFERENCES public.accounting_journals(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_journal_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 journal_id uuid NOT NULL REFERENCES public.accounting_journals(id) ON DELETE CASCADE,
 account_code text NOT NULL,
 account_name text,
 debit_minor bigint NOT NULL DEFAULT 0 CHECK(debit_minor>=0),
 credit_minor bigint NOT NULL DEFAULT 0 CHECK(credit_minor>=0),
 tax_code text,
 description text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 CHECK((debit_minor>0 AND credit_minor=0) OR (credit_minor>0 AND debit_minor=0))
);

CREATE TABLE IF NOT EXISTS public.accounting_assets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 review_item_id uuid REFERENCES public.accounting_review_items(id) ON DELETE SET NULL,
 asset_class text NOT NULL,
 description text NOT NULL,
 acquisition_date date NOT NULL,
 cost_minor bigint NOT NULL CHECK(cost_minor>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 depreciation_method text NOT NULL DEFAULT 'straight_line'
   CHECK(depreciation_method IN('straight_line','reducing_balance','none')),
 useful_life_months integer CHECK(useful_life_months IS NULL OR useful_life_months>0),
 accumulated_depreciation_minor bigint NOT NULL DEFAULT 0 CHECK(accumulated_depreciation_minor>=0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('proposed','active','disposed','rejected')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_accounts_prep_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 framework_key text NOT NULL,
 prior_accounts_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','building','review','approved','completed','failed')),
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 proposed_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb,
 output_document_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 review_notes text,
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
 authority_level text NOT NULL CHECK(authority_level IN(
   'legislation','regulation','binding_case_law','persuasive_case_law',
   'official_ruling','official_guidance','administrative_manual','secondary')),
 title text NOT NULL,
 citation text,
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),
 effective_from date,
 effective_until date,
 published_at date,
 checked_at timestamptz NOT NULL,
 content_hash text CHECK(content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'),
 supersedes_source_id uuid REFERENCES public.tax_knowledge_sources(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>=effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS tax_source_version_uq
 ON public.tax_knowledge_sources(jurisdiction,source_url,COALESCE(content_hash,''));

CREATE TABLE IF NOT EXISTS public.tax_positions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 research_case_id uuid NOT NULL REFERENCES public.tax_research_cases(id) ON DELETE CASCADE,
 title text NOT NULL,
 position_type text NOT NULL,
 proposed_treatment text NOT NULL,
 legal_basis text NOT NULL,
 source_ids uuid[] NOT NULL DEFAULT '{}',
 fact_dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
 estimated_tax_impact_minor bigint,
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 confidence numeric NOT NULL DEFAULT 0 CHECK(confidence>=0 AND confidence<=1),
 risk text NOT NULL DEFAULT 'specialist_review'
   CHECK(risk IN('low','medium','high','specialist_review')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','review','approved','rejected','superseded')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_agent_profiles(
 profile_key text PRIMARY KEY,
 name text NOT NULL,
 purpose text NOT NULL,
 allowed_tools text[] NOT NULL DEFAULT '{}',
 requires_human_approval boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','preview','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.ai_agent_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 profile_key text NOT NULL REFERENCES public.ai_agent_profiles(profile_key) ON DELETE RESTRICT,
 goal text NOT NULL,
 status text NOT NULL DEFAULT 'queued'
   CHECK(status IN('queued','running','waiting_approval','completed','failed','cancelled','stale')),
 model_provider text,
 model_id text,
 policy_revision text,
 input_version text,
 max_steps integer NOT NULL DEFAULT 8 CHECK(max_steps BETWEEN 1 AND 50),
 current_step integer NOT NULL DEFAULT 0 CHECK(current_step>=0),
 input_tokens bigint NOT NULL DEFAULT 0,
 output_tokens bigint NOT NULL DEFAULT 0,
 cost_estimate_minor bigint NOT NULL DEFAULT 0,
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency ~ '^[A-Z]{3}$'),
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 error text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ai_agent_steps(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES public.ai_agent_runs(id) ON DELETE CASCADE,
 step_no integer NOT NULL CHECK(step_no>0),
 step_type text NOT NULL CHECK(step_type IN('model','tool','proposal','approval','final','error')),
 tool_key text,
 input jsonb NOT NULL DEFAULT '{}'::jsonb,
 output jsonb NOT NULL DEFAULT '{}'::jsonb,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'completed' CHECK(status IN('queued','running','completed','failed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,step_no)
);

CREATE TABLE IF NOT EXISTS public.ai_action_approvals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES public.ai_agent_runs(id) ON DELETE CASCADE,
 step_id uuid REFERENCES public.ai_agent_steps(id) ON DELETE SET NULL,
 action_key text NOT NULL,
 target_ref text,
 proposal jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','expired','executed','failed')),
 proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 executed_at timestamptz,
 execution_result jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_enrichment_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 collection_key text NOT NULL,
 document_ref text NOT NULL,
 document_revision integer NOT NULL DEFAULT 1 CHECK(document_revision>0),
 status text NOT NULL DEFAULT 'proposed'
   CHECK(status IN('proposed','review','accepted','partially_accepted','rejected','failed')),
 provider text,
 model_id text,
 entity_count integer NOT NULL DEFAULT 0,
 edge_count integer NOT NULL DEFAULT 0,
 trace jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.knowledge_entity_candidates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES public.knowledge_enrichment_runs(id) ON DELETE CASCADE,
 entity_key text NOT NULL,
 label text NOT NULL,
 entity_type text NOT NULL DEFAULT 'entity',
 aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence_quote text,
 confidence numeric NOT NULL DEFAULT 0 CHECK(confidence>=0 AND confidence<=1),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected')),
 UNIQUE(run_id,entity_key)
);

CREATE TABLE IF NOT EXISTS public.knowledge_edge_candidates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES public.knowledge_enrichment_runs(id) ON DELETE CASCADE,
 source_key text NOT NULL,
 relation text NOT NULL,
 target_key text NOT NULL,
 supporting_quote text NOT NULL,
 confidence numeric NOT NULL DEFAULT 0 CHECK(confidence>=0 AND confidence<=1),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected')),
 accepted_edge_ref text,
 CHECK(lower(source_key)<>lower(target_key))
);

CREATE TABLE IF NOT EXISTS public.transaction_programmes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 programme_type text NOT NULL CHECK(programme_type IN(
   'acquisition','disposal','merger','carve_out','integration','separation','due_diligence','transformation')),
 target_name text,
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency ~ '^[A-Z]{3}$'),
 day_one_date date,
 status text NOT NULL DEFAULT 'discovery'
   CHECK(status IN('discovery','diligence','planning','execution','day1_ready','stabilisation','complete','cancelled')),
 assumptions jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transaction_diligence_findings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.transaction_programmes(id) ON DELETE CASCADE,
 workstream text NOT NULL,
 title text NOT NULL,
 finding_type text NOT NULL CHECK(finding_type IN('risk','gap','dependency','opportunity','assumption','decision')),
 severity text NOT NULL DEFAULT 'medium' CHECK(severity IN('low','medium','high','critical')),
 description text NOT NULL,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 owner text,
 due_at timestamptz,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','mitigating','accepted','resolved','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transaction_tsa_obligations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.transaction_programmes(id) ON DELETE CASCADE,
 service_name text NOT NULL,
 provider_party text NOT NULL,
 recipient_party text NOT NULL,
 service_owner text,
 start_date date,
 exit_date date,
 monthly_cost_minor bigint CHECK(monthly_cost_minor IS NULL OR monthly_cost_minor>=0),
 currency text CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$'),
 exit_criteria text NOT NULL,
 dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','agreed','active','exiting','exited','disputed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transaction_day1_gates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.transaction_programmes(id) ON DELETE CASCADE,
 domain text NOT NULL,
 gate_key text NOT NULL,
 title text NOT NULL,
 critical boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'not_started' CHECK(status IN('not_started','in_progress','blocked','passed','waived')),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 blocker text,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 UNIQUE(programme_id,gate_key)
);

CREATE TABLE IF NOT EXISTS public.transaction_synergies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.transaction_programmes(id) ON DELETE CASCADE,
 category text NOT NULL,
 title text NOT NULL,
 baseline_minor bigint NOT NULL DEFAULT 0,
 target_minor bigint NOT NULL DEFAULT 0,
 realised_minor bigint NOT NULL DEFAULT 0,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 recurring boolean NOT NULL DEFAULT true,
 timing_months integer CHECK(timing_months IS NULL OR timing_months>=0),
 confidence numeric NOT NULL DEFAULT 0 CHECK(confidence>=0 AND confidence<=1),
 methodology text,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 finance_approved boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'accounting_review_items','accounting_journals','accounting_journal_lines','accounting_assets',
  'accounting_accounts_prep_runs','tax_positions','ai_agent_runs','ai_agent_steps','ai_action_approvals',
  'knowledge_enrichment_runs','knowledge_entity_candidates','knowledge_edge_candidates',
  'transaction_programmes','transaction_diligence_findings','transaction_tsa_obligations',
  'transaction_day1_gates','transaction_synergies'
 ] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
   EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
    'omniqora tenant read',t);
   EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))',
    'omniqora tenant write',t);
 END LOOP;
END $$;

ALTER TABLE public.tax_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.tax_knowledge_sources,public.ai_agent_profiles TO authenticated;
GRANT ALL ON public.tax_knowledge_sources,public.ai_agent_profiles TO service_role;
CREATE POLICY "tax sources authenticated read" ON public.tax_knowledge_sources FOR SELECT TO authenticated USING(true);
CREATE POLICY "tax sources platform admin write" ON public.tax_knowledge_sources FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()));
CREATE POLICY "agent profiles authenticated read" ON public.ai_agent_profiles FOR SELECT TO authenticated USING(status<>'retired');

CREATE INDEX IF NOT EXISTS accounting_review_tenant_status_idx ON public.accounting_review_items(tenant_id,status,created_at);
CREATE INDEX IF NOT EXISTS accounting_journal_client_date_idx ON public.accounting_journals(tenant_id,client_ref,journal_date);
CREATE INDEX IF NOT EXISTS tax_positions_case_idx ON public.tax_positions(research_case_id,status);
CREATE INDEX IF NOT EXISTS ai_agent_runs_tenant_idx ON public.ai_agent_runs(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_enrichment_tenant_idx ON public.knowledge_enrichment_runs(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS transaction_programmes_tenant_idx ON public.transaction_programmes(tenant_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS transaction_findings_programme_idx ON public.transaction_diligence_findings(programme_id,status,severity);
CREATE INDEX IF NOT EXISTS transaction_gates_programme_idx ON public.transaction_day1_gates(programme_id,status,critical);

INSERT INTO public.ai_agent_profiles(profile_key,name,purpose,allowed_tools,requires_human_approval,status) VALUES
 ('discovery','Discovery specialist','Evidence-backed business discovery and gap identification',ARRAY['records.read','evidence.search','task.propose'],true,'active'),
 ('finance','Finance specialist','Financial baselines, reconciliations, scenarios and reviewed finance proposals',ARRAY['records.read','evidence.search','finance.report','task.propose'],true,'active'),
 ('technical','Technical specialist','Architecture, dependency, migration and operational-readiness analysis',ARRAY['records.read','evidence.search','technical.report','task.propose'],true,'active'),
 ('compliance','Compliance specialist','Evidence and control-gap analysis without certifying compliance',ARRAY['records.read','evidence.search','compliance.report','task.propose'],true,'active'),
 ('product','Product specialist','Research, requirements, prioritisation, UAT and release-readiness analysis',ARRAY['records.read','evidence.search','product.report','task.propose'],true,'active'),
 ('transaction','Transaction specialist','M&A, diligence, carve-out, TSA, Day-1 and synergy analysis',ARRAY['records.read','evidence.search','transaction.report','task.propose'],true,'active'),
 ('accounting','Accounting specialist','Extraction, coding and accounts-preparation proposals subject to accounting review',ARRAY['documents.read','evidence.search','accounting.propose'],true,'active'),
 ('tax','Tax research specialist','Authority-backed tax research proposals subject to qualified review',ARRAY['evidence.search','tax.sources.read','tax.propose'],true,'active'),
 ('knowledge','Knowledge graph specialist','Entity and relationship proposals from supplied evidence',ARRAY['evidence.search','graph.propose'],true,'active')
ON CONFLICT(profile_key) DO UPDATE SET
 name=EXCLUDED.name,purpose=EXCLUDED.purpose,allowed_tools=EXCLUDED.allowed_tools,
 requires_human_approval=EXCLUDED.requires_human_approval,status=EXCLUDED.status;

UPDATE public.vertical_package_catalogue
SET status='active',implementation_status='live_main',updated_at=now()
WHERE package_key IN('practice.core','accounting.ai','tax.intelligence','regulaos.core');

CREATE OR REPLACE FUNCTION public.accounting_post_reviewed_entry(
 _tenant uuid,_review uuid,_actor uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE r public.accounting_review_items%rowtype;
        j uuid:=gen_random_uuid();
        line jsonb;
        debit_total bigint:=0;
        credit_total bigint:=0;
        d bigint;
        c bigint;
        code text;
        nm text;
BEGIN
 SELECT * INTO r FROM public.accounting_review_items
 WHERE id=_review AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Accounting review item not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(_tenant,auth.uid()) THEN
   RAISE EXCEPTION 'Accounting write access denied';
 END IF;
 IF r.status<>'approved' THEN RAISE EXCEPTION 'Accounting review item must be approved before posting'; END IF;
 IF jsonb_typeof(r.proposed_entry->'lines')<>'array' OR jsonb_array_length(r.proposed_entry->'lines')<2 THEN
   RAISE EXCEPTION 'Balanced journal proposal with at least two lines required';
 END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(r.proposed_entry->'lines') LOOP
   d:=COALESCE((line->>'debitMinor')::bigint,0);
   c:=COALESCE((line->>'creditMinor')::bigint,0);
   IF d<0 OR c<0 OR (d>0 AND c>0) OR (d=0 AND c=0) THEN
     RAISE EXCEPTION 'Invalid journal line';
   END IF;
   debit_total:=debit_total+d; credit_total:=credit_total+c;
 END LOOP;
 IF debit_total=0 OR debit_total<>credit_total THEN RAISE EXCEPTION 'Journal is not balanced'; END IF;

 INSERT INTO public.accounting_journals(
   id,tenant_id,product_key,client_ref,journal_date,reference,description,source_type,source_ref,
   currency,status,posted_by,posted_at,metadata
 ) VALUES(
   j,r.tenant_id,r.product_key,r.client_ref,
   COALESCE((r.proposed_entry->>'journalDate')::date,current_date),
   COALESCE(r.proposed_entry->>'reference','review-'||r.id::text),
   COALESCE(r.proposed_entry->>'description',r.question),
   'review_item',r.id::text,COALESCE(r.proposed_entry->>'currency','GBP'),
   'posted',_actor,now(),jsonb_build_object('reviewItemId',r.id)
 );

 FOR line IN SELECT value FROM jsonb_array_elements(r.proposed_entry->'lines') LOOP
   d:=COALESCE((line->>'debitMinor')::bigint,0);
   c:=COALESCE((line->>'creditMinor')::bigint,0);
   code:=COALESCE(line->>'accountCode','UNMAPPED');
   nm:=COALESCE(line->>'accountName',code);
   INSERT INTO public.accounting_journal_lines(
     tenant_id,journal_id,account_code,account_name,debit_minor,credit_minor,tax_code,description
   ) VALUES(r.tenant_id,j,code,nm,d,c,line->>'taxCode',line->>'description');

   INSERT INTO public.accounting_trial_balance_entries(
     tenant_id,product_key,client_ref,period_end,account_code,account_name,debit_minor,credit_minor,source,metadata
   ) VALUES(
     r.tenant_id,r.product_key,r.client_ref,
     COALESCE((r.proposed_entry->>'periodEnd')::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date),
     code,nm,d,c,'journal',jsonb_build_object('journalId',j)
   )
   ON CONFLICT(tenant_id,product_key,client_ref,period_end,account_code) DO UPDATE SET
     debit_minor=public.accounting_trial_balance_entries.debit_minor+EXCLUDED.debit_minor,
     credit_minor=public.accounting_trial_balance_entries.credit_minor+EXCLUDED.credit_minor,
     metadata=public.accounting_trial_balance_entries.metadata||EXCLUDED.metadata;
 END LOOP;

 UPDATE public.accounting_review_items
 SET status='posted',reviewed_by=COALESCE(reviewed_by,_actor),reviewed_at=COALESCE(reviewed_at,now()),updated_at=now()
 WHERE id=r.id;

 RETURN j;
END $$;
REVOKE ALL ON FUNCTION public.accounting_post_reviewed_entry(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accounting_post_reviewed_entry(uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.transaction_readiness(_programme uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE p public.transaction_programmes%rowtype;
 critical_total integer:=0; critical_passed integer:=0; blocked integer:=0;
 open_high integer:=0; tsa_open integer:=0; ready boolean;
BEGIN
 SELECT * INTO p FROM public.transaction_programmes WHERE id=_programme;
 IF NOT FOUND THEN RAISE EXCEPTION 'Transaction programme not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(p.tenant_id,auth.uid()) THEN
   RAISE EXCEPTION 'Transaction programme access denied';
 END IF;
 SELECT count(*) FILTER(WHERE critical),
        count(*) FILTER(WHERE critical AND status IN('passed','waived')),
        count(*) FILTER(WHERE status='blocked')
 INTO critical_total,critical_passed,blocked
 FROM public.transaction_day1_gates WHERE programme_id=_programme;
 SELECT count(*) INTO open_high FROM public.transaction_diligence_findings
 WHERE programme_id=_programme AND severity IN('high','critical') AND status NOT IN('resolved','closed','accepted');
 SELECT count(*) INTO tsa_open FROM public.transaction_tsa_obligations
 WHERE programme_id=_programme AND status IN('draft','disputed');
 ready:=critical_total>0 AND critical_passed=critical_total AND blocked=0 AND open_high=0 AND tsa_open=0;
 RETURN jsonb_build_object(
  'programmeId',_programme,'ready',ready,'criticalGates',critical_total,'criticalPassed',critical_passed,
  'blockedGates',blocked,'openHighCriticalFindings',open_high,'unagreedTsaObligations',tsa_open
 );
END $$;
REVOKE ALL ON FUNCTION public.transaction_readiness(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transaction_readiness(uuid) TO authenticated,service_role;

COMMIT;
