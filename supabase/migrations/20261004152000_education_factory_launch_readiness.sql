BEGIN;

-- Final shared factory layer from the 40-day reconciliation:
-- Education Factory / Student 360 and a reusable evidence-backed launch gate.

INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status) VALUES
('omniqora.education-factory','Education Factory','Reusable institution, programme, cohort, Student 360, assessment, attendance, placement and intervention primitives.','education','omniqora',true,'automatic','active','built_main'),
('omniqora.launch-readiness','SaaS Launch Readiness','Evidence-backed go-live gates layered over platform runtime readiness for every tenant/product.','platform','omniqora',false,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
 implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
('omniqora.education-factory','omniqora.crm'),
('omniqora.education-factory','omniqora.documents'),
('omniqora.education-factory','omniqora.ai'),
('omniqora.education-factory','omniqora.analytics'),
('omniqora.launch-readiness','omniqora.identity')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.education_institutions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 institution_ref text NOT NULL,
 name text NOT NULL,
 institution_type text NOT NULL DEFAULT 'provider',
 country_code text,
 regulator_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,institution_ref)
);

CREATE TABLE IF NOT EXISTS public.education_programmes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 institution_id uuid REFERENCES public.education_institutions(id) ON DELETE SET NULL,
 programme_ref text NOT NULL,
 name text NOT NULL,
 level text,
 awarding_body text,
 delivery_mode text,
 duration jsonb NOT NULL DEFAULT '{}'::jsonb,
 requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,programme_ref)
);

CREATE TABLE IF NOT EXISTS public.education_cohorts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.education_programmes(id) ON DELETE CASCADE,
 cohort_ref text NOT NULL,
 name text NOT NULL,
 starts_on date,
 ends_on date,
 capacity integer CHECK(capacity IS NULL OR capacity>=0),
 timetable jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','open','active','complete','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,cohort_ref)
);

CREATE TABLE IF NOT EXISTS public.education_students(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 student_ref text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('applicant','onboarding','active','paused','completed','withdrawn')),
 profile jsonb NOT NULL DEFAULT '{}'::jsonb,
 support_context jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,student_ref)
);

CREATE TABLE IF NOT EXISTS public.education_enrolments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.education_students(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.education_programmes(id) ON DELETE RESTRICT,
 cohort_id uuid REFERENCES public.education_cohorts(id) ON DELETE SET NULL,
 enrolled_on date NOT NULL DEFAULT current_date,
 expected_completion date,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('applied','offered','active','paused','completed','withdrawn','cancelled')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.education_attendance_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.education_students(id) ON DELETE CASCADE,
 cohort_id uuid REFERENCES public.education_cohorts(id) ON DELETE SET NULL,
 session_ref text NOT NULL,
 occurred_on date NOT NULL,
 status text NOT NULL CHECK(status IN('present','late','authorised_absence','absence','remote_present')),
 minutes_attended integer CHECK(minutes_attended IS NULL OR minutes_attended>=0),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,student_id,session_ref)
);

CREATE TABLE IF NOT EXISTS public.education_assessment_results(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.education_students(id) ON DELETE CASCADE,
 programme_id uuid NOT NULL REFERENCES public.education_programmes(id) ON DELETE RESTRICT,
 assessment_ref text NOT NULL,
 assessment_type text,
 score numeric,
 grade text,
 max_score numeric,
 attempt integer NOT NULL DEFAULT 1 CHECK(attempt>0),
 status text NOT NULL DEFAULT 'provisional' CHECK(status IN('provisional','moderation','confirmed','resit','void')),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,student_id,assessment_ref,attempt)
);

CREATE TABLE IF NOT EXISTS public.education_placements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.education_students(id) ON DELETE CASCADE,
 placement_type text NOT NULL,
 host_name text,
 starts_on date,
 ends_on date,
 hours_required numeric,
 hours_completed numeric NOT NULL DEFAULT 0,
 supervisor_ref text,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','active','complete','cancelled','failed')),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.education_student_metrics(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.education_students(id) ON DELETE CASCADE,
 attendance_rate numeric,
 assessment_average numeric,
 completion_rate numeric,
 placement_progress numeric,
 engagement_score numeric,
 risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
 explanation jsonb NOT NULL DEFAULT '{}'::jsonb,
 calculated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,student_id)
);

CREATE TABLE IF NOT EXISTS public.education_interventions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 student_id uuid NOT NULL REFERENCES public.education_students(id) ON DELETE CASCADE,
 intervention_type text NOT NULL,
 reason text NOT NULL,
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 proposed_by text NOT NULL DEFAULT 'system',
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','review','approved','rejected','active','complete','cancelled')),
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.education_knowledge_scopes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 scope_type text NOT NULL CHECK(scope_type IN('institution','programme','cohort','student_support','careers','policy')),
 scope_ref text NOT NULL,
 collection_key text NOT NULL,
 permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','retired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,scope_type,scope_ref,collection_key)
);

CREATE TABLE IF NOT EXISTS public.factory_launch_gates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 gate_key text NOT NULL,
 category text NOT NULL,
 title text NOT NULL,
 required boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','in_progress','passed','failed','waived','not_applicable')),
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 blocker text,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,gate_key)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'education_institutions','education_programmes','education_cohorts','education_students','education_enrolments',
  'education_attendance_events','education_assessment_results','education_placements','education_student_metrics',
  'education_interventions','education_knowledge_scopes','factory_launch_gates'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','factory education read '||t,t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))','factory education write '||t,t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.education_student_360(_tenant uuid,_product text,_student uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE s public.education_students%rowtype;att numeric;avg_score numeric;enrol jsonb;placements jsonb;interventions jsonb;
BEGIN
 SELECT * INTO s FROM public.education_students WHERE id=_student AND tenant_id=_tenant AND product_key=_product;
 IF NOT FOUND THEN RAISE EXCEPTION 'Student not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN RAISE EXCEPTION 'Student access denied'; END IF;
 SELECT CASE WHEN count(*)=0 THEN NULL ELSE round(100.0*count(*) FILTER(WHERE status IN('present','late','remote_present'))/count(*),2) END
 INTO att FROM public.education_attendance_events WHERE tenant_id=_tenant AND product_key=_product AND student_id=_student;
 SELECT avg(score) INTO avg_score FROM public.education_assessment_results WHERE tenant_id=_tenant AND product_key=_product AND student_id=_student AND status IN('confirmed','moderation','provisional');
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at),'[]'::jsonb) INTO enrol FROM public.education_enrolments e WHERE e.tenant_id=_tenant AND e.product_key=_product AND e.student_id=_student;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.created_at),'[]'::jsonb) INTO placements FROM public.education_placements p WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.student_id=_student;
 SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC),'[]'::jsonb) INTO interventions FROM public.education_interventions i WHERE i.tenant_id=_tenant AND i.product_key=_product AND i.student_id=_student;
 RETURN jsonb_build_object('student',to_jsonb(s),'attendanceRate',att,'assessmentAverage',avg_score,'enrolments',enrol,'placements',placements,'interventions',interventions,'humanDecisionRequired',true);
END $$;
REVOKE ALL ON FUNCTION public.education_student_360(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.education_student_360(uuid,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.saas_factory_readiness(_tenant uuid,_product text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE base jsonb;required_count integer:=0;passed_count integer:=0;failed_count integer:=0;pending_count integer:=0;ready boolean;
BEGIN
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN RAISE EXCEPTION 'Launch readiness access denied'; END IF;
 BEGIN
   base:=public.get_tenant_product_readiness(_tenant,_product);
 EXCEPTION WHEN OTHERS THEN
   base:=jsonb_build_object('ready',false,'blockers',jsonb_build_array('platform_runtime_readiness_unavailable'));
 END;
 SELECT count(*) FILTER(WHERE required AND status NOT IN('waived','not_applicable')),
        count(*) FILTER(WHERE required AND status='passed'),
        count(*) FILTER(WHERE required AND status='failed'),
        count(*) FILTER(WHERE required AND status IN('pending','in_progress'))
 INTO required_count,passed_count,failed_count,pending_count
 FROM public.factory_launch_gates WHERE tenant_id=_tenant AND product_key=_product;
 ready:=coalesce((base->>'ready')::boolean,false)
   AND failed_count=0 AND pending_count=0
   AND (required_count=0 OR passed_count=required_count);
 RETURN jsonb_build_object(
  'tenantId',_tenant,'productKey',_product,'ready',ready,'platformReadiness',base,
  'requiredGates',required_count,'passedGates',passed_count,'failedGates',failed_count,'pendingGates',pending_count,
  'blockers',CASE WHEN failed_count>0 OR pending_count>0 THEN jsonb_build_array('factory_launch_gates_incomplete') ELSE '[]'::jsonb END
 );
END $$;
REVOKE ALL ON FUNCTION public.saas_factory_readiness(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_factory_readiness(uuid,text) TO authenticated,service_role;

COMMIT;
