BEGIN;

CREATE TABLE IF NOT EXISTS public.vertical_package_catalogue(
 package_key text PRIMARY KEY CHECK(package_key ~ '^[a-z0-9.-]{3,100}$'),
 name text NOT NULL,
 family text NOT NULL,
 description text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'preview' CHECK(status IN('active','preview','planned','retired')),
 implementation_status text NOT NULL DEFAULT 'catalogue_only'
   CHECK(implementation_status IN('live_main','built_main','draft_branch','catalogue_only','external_product')),
 required_services text[] NOT NULL DEFAULT '{}',
 provider_requirements text[] NOT NULL DEFAULT '{}',
 capabilities text[] NOT NULL DEFAULT '{}',
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_vertical_packages(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 package_key text NOT NULL REFERENCES public.vertical_package_catalogue(package_key) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','configuring','active','blocked','suspended','cancelled')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 activated_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,package_key)
);

CREATE TABLE IF NOT EXISTS public.practice_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 client_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
 job_type text NOT NULL,
 title text NOT NULL,
 period_start date,
 period_end date,
 due_at timestamptz,
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'not_started' CHECK(status IN('not_started','waiting_client','in_progress','review','complete','filed','cancelled')),
 workflow_id uuid REFERENCES public.automation_workflows(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_ingestion_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('receipt','invoice','statement','csv','pdf','scan','api')),
 document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','extracting','classifying','review','posted','failed')),
 extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
 proposed_entries jsonb NOT NULL DEFAULT '[]'::jsonb,
 exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.accounting_trial_balance_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 period_end date NOT NULL,
 account_code text NOT NULL,
 account_name text NOT NULL,
 debit_minor bigint NOT NULL DEFAULT 0,
 credit_minor bigint NOT NULL DEFAULT 0,
 source text NOT NULL DEFAULT 'system',
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,client_ref,period_end,account_code)
);

CREATE TABLE IF NOT EXISTS public.tax_research_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_ref text NOT NULL,
 jurisdiction text NOT NULL,
 tax_type text NOT NULL,
 period text,
 question text NOT NULL,
 status text NOT NULL DEFAULT 'research' CHECK(status IN('research','review','advised','filed','closed')),
 authority_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
 conclusions jsonb NOT NULL DEFAULT '{}'::jsonb,
 reviewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payroll_employees(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 employer_ref text NOT NULL,
 employee_ref text NOT NULL,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 payroll_id text,
 tax_code text,
 pay_frequency text NOT NULL CHECK(pay_frequency IN('weekly','fortnightly','four_weekly','monthly','quarterly','annual')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','leaver','on_hold')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,employer_ref,employee_ref)
);
CREATE TABLE IF NOT EXISTS public.payroll_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 employer_ref text NOT NULL,
 period_key text NOT NULL,
 pay_date date NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','calculated','review','approved','submitted','paid','cancelled')),
 totals jsonb NOT NULL DEFAULT '{}'::jsonb,
 provider_ref text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,employer_ref,period_key)
);
CREATE TABLE IF NOT EXISTS public.payroll_run_lines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL REFERENCES public.payroll_employees(id) ON DELETE RESTRICT,
 gross_minor bigint NOT NULL DEFAULT 0,
 deductions_minor bigint NOT NULL DEFAULT 0,
 employer_cost_minor bigint NOT NULL DEFAULT 0,
 net_minor bigint NOT NULL DEFAULT 0,
 calculation jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(run_id,employee_id)
);

CREATE TABLE IF NOT EXISTS public.company_secretarial_entities(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 jurisdiction text NOT NULL,
 company_number text,
 legal_name text NOT NULL,
 incorporation_date date,
 status text NOT NULL DEFAULT 'active',
 provider_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.company_secretarial_obligations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 entity_id uuid NOT NULL REFERENCES public.company_secretarial_entities(id) ON DELETE CASCADE,
 obligation_type text NOT NULL,
 due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'due' CHECK(status IN('due','prepared','submitted','accepted','rejected','not_required')),
 provider_ref text,
 evidence_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.compliance_pack_definitions(
 pack_key text PRIMARY KEY,
 name text NOT NULL,
 regulator text,
 jurisdiction text,
 version text NOT NULL DEFAULT '1',
 status text NOT NULL DEFAULT 'preview' CHECK(status IN('active','preview','retired')),
 controls jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.tenant_compliance_pack_status(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 pack_key text NOT NULL REFERENCES public.compliance_pack_definitions(pack_key) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'not_started' CHECK(status IN('not_started','in_progress','review','ready','blocked','certified_external')),
 score numeric,
 findings jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,pack_key)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'tenant_vertical_packages','practice_jobs','accounting_ingestion_jobs','accounting_trial_balance_entries',
  'tax_research_cases','payroll_employees','payroll_runs','payroll_run_lines',
  'company_secretarial_entities','company_secretarial_obligations','tenant_compliance_pack_status'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','vertical tenant read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','vertical tenant write',t);
 END LOOP;
END $$;
ALTER TABLE public.vertical_package_catalogue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_pack_definitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.vertical_package_catalogue,public.compliance_pack_definitions TO authenticated;
GRANT ALL ON public.vertical_package_catalogue,public.compliance_pack_definitions TO service_role;
CREATE POLICY "vertical catalogue read" ON public.vertical_package_catalogue FOR SELECT TO authenticated USING(status<>'retired');
CREATE POLICY "compliance packs read" ON public.compliance_pack_definitions FOR SELECT TO authenticated USING(status<>'retired');

INSERT INTO public.vertical_package_catalogue(package_key,name,family,description,status,implementation_status,required_services,provider_requirements,capabilities) VALUES
 ('practice.core','Practice Operations','accounting','Client jobs, deadlines, owners and workflows.','preview','built_main',ARRAY['omniqora.crm','omniqora.documents','omniqora.automation'],ARRAY[]::text[],ARRAY['jobs','deadlines','client_work']),
 ('accounting.ai','Accounting AI','accounting','Document ingestion, extraction, classification and trial-balance preparation.','preview','built_main',ARRAY['omniqora.documents','omniqora.ai'],ARRAY[]::text[],ARRAY['ingestion','classification','exceptions','trial_balance']),
 ('tax.intelligence','Tax Intelligence','tax','Authority-backed research case workspace and review evidence.','preview','built_main',ARRAY['omniqora.documents','omniqora.ai'],ARRAY[]::text[],ARRAY['research_cases','authority_sources','review']),
 ('payroll.core','Payroll','payroll','Employee, pay-run and calculation persistence with provider boundary.','preview','built_main',ARRAY['omniqora.crm','omniqora.documents'],ARRAY['tax.hmrc'],ARRAY['employees','pay_runs','lines']),
 ('formation.secretarial','Company Secretarial','registry','Company register and filing-obligation workflow.','preview','built_main',ARRAY['omniqora.documents','omniqora.automation'],ARRAY['registry.companies-house'],ARRAY['entities','obligations','filing_status']),
 ('kindelo.childcare','Kindelo Childcare','childcare','Childcare agency shared package; regulatory provider logic remains product-boundary.','preview','catalogue_only',ARRAY['omniqora.crm','omniqora.bookings','omniqora.documents'],ARRAY[]::text[],ARRAY['parents','providers','matching']),
 ('automotive.shared','Automotive Shared','automotive','Shared vehicle/evidence/provider package; PR #6 remains donor for deeper flows.','preview','draft_branch',ARRAY['omniqora.documents','omniqora.marketplace'],ARRAY['vehicle.uk-data'],ARRAY['vehicle_identity','passport','evidence']),
 ('regulaos.core','RegulaOS','compliance','Reusable compliance pack/evidence orchestration.','preview','built_main',ARRAY['omniqora.documents','omniqora.automation'],ARRAY[]::text[],ARRAY['packs','controls','evidence','findings'])
ON CONFLICT(package_key) DO UPDATE SET implementation_status=EXCLUDED.implementation_status,required_services=EXCLUDED.required_services,provider_requirements=EXCLUDED.provider_requirements,capabilities=EXCLUDED.capabilities,updated_at=now();

INSERT INTO public.compliance_pack_definitions(pack_key,name,regulator,jurisdiction,status,controls) VALUES
 ('uk-ofsted-cma','UK Childminder Agency','Ofsted','GB','preview','[]'::jsonb),
 ('uk-fca-basic','UK FCA Readiness','FCA','GB','preview','[]'::jsonb),
 ('uk-companies-house','Companies House Governance','Companies House','GB','preview','[]'::jsonb),
 ('sa-aramco-readiness','Saudi Aramco Readiness','Saudi Aramco','SA','preview','[]'::jsonb)
ON CONFLICT(pack_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.vertical_enable_package(_tenant uuid,_product text,_package text,_config jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.vertical_package_catalogue%rowtype; svc text; missing text[]:=ARRAY[]::text[];
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Vertical package access denied';
 END IF;
 SELECT * INTO p FROM public.vertical_package_catalogue WHERE package_key=_package AND status<>'retired';
 IF NOT FOUND THEN RAISE EXCEPTION 'Vertical package not found'; END IF;
 FOREACH svc IN ARRAY p.required_services LOOP
  IF NOT public.has_tenant_entitlement(_tenant,svc) THEN missing:=array_append(missing,svc); END IF;
 END LOOP;
 INSERT INTO public.tenant_vertical_packages(tenant_id,product_key,package_key,status,config,activated_at)
 VALUES(_tenant,_product,_package,CASE WHEN cardinality(missing)=0 THEN 'active' ELSE 'blocked' END,COALESCE(_config,'{}'::jsonb),CASE WHEN cardinality(missing)=0 THEN now() ELSE NULL END)
 ON CONFLICT(tenant_id,product_key,package_key) DO UPDATE SET status=EXCLUDED.status,config=EXCLUDED.config,activated_at=EXCLUDED.activated_at,updated_at=now();
 IF cardinality(missing)>0 THEN RAISE NOTICE 'Package blocked by missing services: %',array_to_string(missing,','); END IF;
END; $$;
REVOKE ALL ON FUNCTION public.vertical_enable_package(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vertical_enable_package(uuid,text,text,jsonb) TO authenticated,service_role;

COMMIT;