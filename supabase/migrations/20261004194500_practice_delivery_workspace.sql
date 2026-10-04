BEGIN;

-- Current-native Practice Operations depth.
-- Extends v3 practice_clients / practice_engagements / practice_deadlines.
-- Provider-backed signatures/submissions remain external connector actions.

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.practice-delivery','Practice Delivery',
  'Service templates, recurring work, phases, document requests, time/WIP, fees, proposals, signatures, client portal and authority submission tracking.',
  'accounting','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,status='active',
 implementation_status='built_main',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.practice-delivery','omniqora.practice'),
 ('omniqora.practice-delivery','omniqora.crm'),
 ('omniqora.practice-delivery','omniqora.documents'),
 ('omniqora.practice-delivery','omniqora.identity'),
 ('omniqora.practice-delivery','omniqora.automation')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required)
SELECT p.product_key,'omniqora.practice-delivery',false,false
FROM public.product_catalogue p
WHERE p.product_key IN('omniqora','omniqora-accounts','taxcenda')
ON CONFLICT(product_key,service_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.practice_service_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 template_key text NOT NULL,
 name text NOT NULL,
 service_family text NOT NULL DEFAULT 'general',
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 base_fee_minor bigint NOT NULL DEFAULT 0 CHECK(base_fee_minor>=0),
 unit_fee_minor bigint NOT NULL DEFAULT 0 CHECK(unit_fee_minor>=0),
 recurrence text NOT NULL DEFAULT 'none' CHECK(recurrence IN('none','monthly','quarterly','annual')),
 phases jsonb NOT NULL DEFAULT '[]'::jsonb,
 terms text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','retired')),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,template_key)
);

ALTER TABLE public.practice_engagements
 ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.practice_service_templates(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS period_key text,
 ADD COLUMN IF NOT EXISTS internal_due_at timestamptz,
 ADD COLUMN IF NOT EXISTS external_due_at timestamptz,
 ADD COLUMN IF NOT EXISTS work_version integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS quoted_fee_minor bigint,
 ADD COLUMN IF NOT EXISTS currency text;

CREATE UNIQUE INDEX IF NOT EXISTS practice_engagement_template_period_uq
 ON public.practice_engagements(tenant_id,product_key,client_id,template_id,period_key)
 WHERE template_id IS NOT NULL AND period_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.practice_job_phases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 engagement_id uuid NOT NULL REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
 position integer NOT NULL CHECK(position>=0),
 title text NOT NULL,
 budget_minutes integer NOT NULL DEFAULT 0 CHECK(budget_minutes>=0),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','in_progress','completed','skipped')),
 completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 completed_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(engagement_id,position)
);

CREATE TABLE IF NOT EXISTS public.practice_document_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
 request_key text NOT NULL,
 title text NOT NULL,
 description text,
 due_at timestamptz,
 status text NOT NULL DEFAULT 'outstanding'
   CHECK(status IN('outstanding','submitted','accepted','rejected','waived','expired')),
 response_note text,
 submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 submitted_at timestamptz,
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 reminder_count integer NOT NULL DEFAULT 0 CHECK(reminder_count BETWEEN 0 AND 20),
 last_reminder_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(engagement_id,request_key)
);

CREATE TABLE IF NOT EXISTS public.practice_request_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 request_id uuid NOT NULL REFERENCES public.practice_document_requests(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES public.document_records(id) ON DELETE CASCADE,
 submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN('submitted','accepted','rejected','superseded')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,document_id)
);

CREATE TABLE IF NOT EXISTS public.practice_time_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 engagement_id uuid NOT NULL REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 work_date date NOT NULL DEFAULT current_date,
 minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
 cost_rate_minor bigint NOT NULL DEFAULT 0 CHECK(cost_rate_minor>=0),
 charge_rate_minor bigint NOT NULL DEFAULT 0 CHECK(charge_rate_minor>=0),
 description text NOT NULL,
 billable boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'posted' CHECK(status IN('draft','posted','written_off')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_fee_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 engagement_id uuid NOT NULL REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
 fee_type text NOT NULL CHECK(fee_type IN('fixed','time','unit','catchup','disbursement','discount','adjustment')),
 description text NOT NULL,
 quantity numeric NOT NULL DEFAULT 1 CHECK(quantity>=0),
 unit_minor bigint NOT NULL DEFAULT 0,
 amount_minor bigint NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','approved','invoiced','written_off','reversed')),
 source_ref text,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE SET NULL,
 template_id uuid REFERENCES public.practice_service_templates(id) ON DELETE SET NULL,
 proposal_ref text NOT NULL,
 service_snapshot jsonb NOT NULL,
 fee_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
 total_minor bigint NOT NULL CHECK(total_minor>=0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 terms text NOT NULL,
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','review','approved','issued','accepted','declined','expired','withdrawn')),
 valid_until timestamptz,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 issued_at timestamptz,
 accepted_at timestamptz,
 accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,proposal_ref)
);

CREATE TABLE IF NOT EXISTS public.practice_signature_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 proposal_id uuid REFERENCES public.practice_proposals(id) ON DELETE SET NULL,
 document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 signer_ref text NOT NULL,
 signer_name text,
 signer_email text,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 provider_request_ref text,
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','review','approved','submitted','viewed','signed','declined','expired','void','failed')),
 signed_at timestamptz,
 evidence_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 engagement_id uuid REFERENCES public.practice_engagements(id) ON DELETE SET NULL,
 deadline_id uuid REFERENCES public.practice_deadlines(id) ON DELETE SET NULL,
 submission_type text NOT NULL,
 authority text NOT NULL,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 payload_ref text,
 provider_submission_ref text,
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','review','approved','submitted','accepted','rejected','failed','cancelled')),
 response jsonb NOT NULL DEFAULT '{}'::jsonb,
 evidence_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 submitted_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_recurring_work(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 template_id uuid NOT NULL REFERENCES public.practice_service_templates(id) ON DELETE CASCADE,
 recurrence text NOT NULL CHECK(recurrence IN('monthly','quarterly','annual')),
 next_period_start date NOT NULL,
 internal_due_offset_days integer NOT NULL DEFAULT 0 CHECK(internal_due_offset_days BETWEEN 0 AND 366),
 external_due_offset_days integer NOT NULL DEFAULT 0 CHECK(external_due_offset_days BETWEEN 0 AND 366),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','ended')),
 last_generated_period_key text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,client_id,template_id)
);

CREATE TABLE IF NOT EXISTS public.practice_client_portal_access(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 portal_role text NOT NULL DEFAULT 'client_viewer'
   CHECK(portal_role IN('client_owner','client_contributor','client_viewer')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','suspended','revoked')),
 permissions text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(client_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.practice_work_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 actor_kind text NOT NULL DEFAULT 'user' CHECK(actor_kind IN('user','client','provider','worker','system')),
 operation text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY[
  'practice_service_templates','practice_job_phases','practice_document_requests','practice_request_documents',
  'practice_time_entries','practice_fee_items','practice_proposals','practice_signature_requests',
  'practice_submissions','practice_recurring_work','practice_client_portal_access','practice_work_audit'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
   'practice delivery tenant read '||t,t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))',
   'practice delivery tenant write '||t,t);
 END LOOP;
END $$;

-- Client portal gets narrow read/write rules in addition to staff policies.
CREATE POLICY "practice request portal read" ON public.practice_document_requests
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.practice_client_portal_access a
  WHERE a.tenant_id=practice_document_requests.tenant_id
    AND a.product_key=practice_document_requests.product_key
    AND a.client_id=practice_document_requests.client_id
    AND a.user_id=auth.uid() AND a.status='active'
 ));
CREATE POLICY "practice request document portal read" ON public.practice_request_documents
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1
  FROM public.practice_document_requests r
  JOIN public.practice_client_portal_access a
    ON a.tenant_id=r.tenant_id AND a.product_key=r.product_key AND a.client_id=r.client_id
  WHERE r.id=practice_request_documents.request_id
    AND a.user_id=auth.uid() AND a.status='active'
 ));
CREATE POLICY "practice proposal portal read" ON public.practice_proposals
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.practice_client_portal_access a
  WHERE a.tenant_id=practice_proposals.tenant_id
    AND a.product_key=practice_proposals.product_key
    AND a.client_id=practice_proposals.client_id
    AND a.user_id=auth.uid() AND a.status='active'
 ));

CREATE POLICY "practice portal access self read" ON public.practice_client_portal_access
 FOR SELECT TO authenticated USING(user_id=auth.uid() AND status='active');
CREATE POLICY "practice client portal read" ON public.practice_clients
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.practice_client_portal_access a
  WHERE a.tenant_id=practice_clients.tenant_id
    AND a.product_key=practice_clients.product_key
    AND a.client_id=practice_clients.id
    AND a.user_id=auth.uid() AND a.status='active'
 ));
CREATE POLICY "practice engagement portal read" ON public.practice_engagements
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.practice_client_portal_access a
  WHERE a.tenant_id=practice_engagements.tenant_id
    AND a.product_key=practice_engagements.product_key
    AND a.client_id=practice_engagements.client_id
    AND a.user_id=auth.uid() AND a.status='active'
 ));
CREATE POLICY "practice signature portal read" ON public.practice_signature_requests
 FOR SELECT TO authenticated USING(EXISTS(
  SELECT 1 FROM public.practice_client_portal_access a
  WHERE a.tenant_id=practice_signature_requests.tenant_id
    AND a.product_key=practice_signature_requests.product_key
    AND a.client_id=practice_signature_requests.client_id
    AND a.user_id=auth.uid() AND a.status='active'
 ));

-- Provider terminal states cannot be fabricated through direct tenant writes.
DROP POLICY IF EXISTS "practice signature provider-state update" ON public.practice_signature_requests;
CREATE POLICY "practice signature provider-state update" AS RESTRICTIVE
 ON public.practice_signature_requests FOR UPDATE TO authenticated
 USING(status NOT IN('submitted','viewed','signed','declined','expired','failed'))
 WITH CHECK(status NOT IN('submitted','viewed','signed','declined','expired','failed'));
DROP POLICY IF EXISTS "practice submission provider-state update" ON public.practice_submissions;
CREATE POLICY "practice submission provider-state update" AS RESTRICTIVE
 ON public.practice_submissions FOR UPDATE TO authenticated
 USING(status NOT IN('submitted','accepted','rejected','failed'))
 WITH CHECK(status NOT IN('submitted','accepted','rejected','failed'));

CREATE INDEX IF NOT EXISTS practice_phase_engagement_idx ON public.practice_job_phases(engagement_id,position);
CREATE INDEX IF NOT EXISTS practice_requests_due_idx ON public.practice_document_requests(tenant_id,status,due_at);
CREATE INDEX IF NOT EXISTS practice_time_engagement_idx ON public.practice_time_entries(engagement_id,work_date);
CREATE INDEX IF NOT EXISTS practice_fee_engagement_idx ON public.practice_fee_items(engagement_id,status);
CREATE INDEX IF NOT EXISTS practice_submission_status_idx ON public.practice_submissions(tenant_id,product_key,status,updated_at);
CREATE INDEX IF NOT EXISTS practice_recurring_due_idx ON public.practice_recurring_work(status,next_period_start);

CREATE OR REPLACE FUNCTION public.practice_create_managed_engagement(
 _tenant uuid,_product text,_client uuid,_template uuid,_period_key text,
 _period_start date,_period_end date,_owner uuid DEFAULT NULL,
 _internal_due timestamptz DEFAULT NULL,_external_due timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE tpl public.practice_service_templates%rowtype;cid public.practice_clients%rowtype;eid uuid;phase jsonb;pos integer:=0;
BEGIN
 IF auth.uid() IS NOT NULL
    AND NOT public.is_platform_admin(auth.uid())
    AND NOT public.can_write(_tenant,auth.uid()) THEN
  RAISE EXCEPTION 'Practice write access denied';
 END IF;
 SELECT * INTO tpl FROM public.practice_service_templates
 WHERE id=_template AND tenant_id=_tenant AND product_key=_product AND status='active';
 SELECT * INTO cid FROM public.practice_clients
 WHERE id=_client AND tenant_id=_tenant AND product_key=_product AND status IN('onboarding','active','on_hold');
 IF tpl.id IS NULL OR cid.id IS NULL THEN RAISE EXCEPTION 'Practice client/template scope mismatch'; END IF;
 IF COALESCE(length(trim(_period_key)),0)=0 THEN RAISE EXCEPTION 'Period key required'; END IF;

 INSERT INTO public.practice_engagements(
  tenant_id,product_key,client_id,engagement_type,period_start,period_end,status,owner_user_id,scope,metadata,
  template_id,period_key,internal_due_at,external_due_at,work_version,quoted_fee_minor,currency
 ) VALUES(
  _tenant,_product,_client,tpl.template_key,_period_start,_period_end,'active',COALESCE(_owner,auth.uid()),'{}','{}',
  tpl.id,_period_key,_internal_due,_external_due,1,tpl.base_fee_minor,tpl.currency
 )
 ON CONFLICT(tenant_id,product_key,client_id,template_id,period_key)
 WHERE template_id IS NOT NULL AND period_key IS NOT NULL
 DO NOTHING
 RETURNING id INTO eid;
 IF eid IS NULL THEN
  SELECT id INTO eid FROM public.practice_engagements
  WHERE tenant_id=_tenant AND product_key=_product AND client_id=_client
    AND template_id=_template AND period_key=_period_key;
  RETURN eid;
 END IF;

 FOR phase IN SELECT value FROM jsonb_array_elements(tpl.phases) LOOP
  INSERT INTO public.practice_job_phases(
   tenant_id,product_key,engagement_id,position,title,budget_minutes,metadata
  ) VALUES(
   _tenant,_product,eid,pos,
   COALESCE(NULLIF(phase->>'title',''),'Phase '||(pos+1)::text),
   GREATEST(COALESCE((phase->>'budgetMinutes')::integer,0),0),
   COALESCE(phase->'metadata','{}'::jsonb)
  );
  pos:=pos+1;
 END LOOP;

 INSERT INTO public.practice_work_audit(tenant_id,product_key,actor_user_id,operation,entity_type,entity_id)
 VALUES(_tenant,_product,auth.uid(),'engagement.create','engagement',eid::text);
 RETURN eid;
END $$;
REVOKE ALL ON FUNCTION public.practice_create_managed_engagement(uuid,text,uuid,uuid,text,date,date,uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_create_managed_engagement(uuid,text,uuid,uuid,text,date,date,uuid,timestamptz,timestamptz) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.practice_complete_phase(
 _phase uuid,_expected_version integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE p public.practice_job_phases%rowtype;e public.practice_engagements%rowtype;new_version integer;
BEGIN
 SELECT * INTO p FROM public.practice_job_phases WHERE id=_phase FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Practice phase not found'; END IF;
 SELECT * INTO e FROM public.practice_engagements WHERE id=p.engagement_id FOR UPDATE;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.can_write(p.tenant_id,auth.uid()) THEN
  RAISE EXCEPTION 'Practice write access denied';
 END IF;
 IF p.status IN('completed','skipped') THEN RETURN e.work_version; END IF;
 IF e.work_version<>_expected_version THEN RAISE EXCEPTION 'Engagement changed; refresh before retrying'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.practice_job_phases x
  WHERE x.engagement_id=e.id AND x.position<p.position AND x.status NOT IN('completed','skipped')
 ) THEN RAISE EXCEPTION 'Complete earlier phases first'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.practice_document_requests r
  WHERE r.engagement_id=e.id AND r.status IN('outstanding','submitted','rejected')
 ) THEN RAISE EXCEPTION 'Outstanding client document requests must be resolved first'; END IF;
 UPDATE public.practice_job_phases
 SET status='completed',completed_by=auth.uid(),completed_at=now()
 WHERE id=p.id;
 UPDATE public.practice_engagements
 SET work_version=work_version+1,updated_at=now()
 WHERE id=e.id RETURNING work_version INTO new_version;
 INSERT INTO public.practice_work_audit(tenant_id,product_key,actor_user_id,operation,entity_type,entity_id)
 VALUES(p.tenant_id,p.product_key,auth.uid(),'phase.complete','phase',p.id::text);
 RETURN new_version;
END $$;
REVOKE ALL ON FUNCTION public.practice_complete_phase(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_complete_phase(uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.practice_wip_summary(_engagement uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE e public.practice_engagements%rowtype;minutes integer;cost bigint;charge bigint;fees bigint;approved_fees bigint;
BEGIN
 SELECT * INTO e FROM public.practice_engagements WHERE id=_engagement;
 IF NOT FOUND THEN RAISE EXCEPTION 'Practice engagement not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(e.tenant_id,auth.uid()) THEN
  RAISE EXCEPTION 'Practice access denied';
 END IF;
 SELECT COALESCE(sum(t.minutes),0)::integer,
        COALESCE(sum(round(t.minutes*t.cost_rate_minor/60.0)),0)::bigint,
        COALESCE(sum(round(t.minutes*t.charge_rate_minor/60.0)),0)::bigint
 INTO minutes,cost,charge
 FROM public.practice_time_entries t
 WHERE t.engagement_id=e.id AND t.status='posted';
 SELECT COALESCE(sum(f.amount_minor),0)::bigint,
        COALESCE(sum(f.amount_minor) FILTER(WHERE f.status IN('approved','invoiced')),0)::bigint
 INTO fees,approved_fees
 FROM public.practice_fee_items f
 WHERE f.engagement_id=e.id AND f.status<>'reversed';
 RETURN jsonb_build_object(
  'engagementId',e.id,'minutes',minutes,'timeCostMinor',cost,'timeChargeMinor',charge,
  'feeItemsMinor',fees,'approvedFeeItemsMinor',approved_fees,
  'quotedFeeMinor',e.quoted_fee_minor,'currency',e.currency,
  'note','WIP/cost/charge view only; not recognised revenue or statutory accounts.'
 );
END $$;
REVOKE ALL ON FUNCTION public.practice_wip_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_wip_summary(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.practice_issue_proposal(_proposal uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE p public.practice_proposals%rowtype;
BEGIN
 SELECT * INTO p FROM public.practice_proposals WHERE id=_proposal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Practice proposal not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid())
    AND NOT public.has_tenant_role(p.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Practice proposal approval denied';
 END IF;
 IF p.status NOT IN('draft','review','approved') THEN RAISE EXCEPTION 'Proposal is not issuable'; END IF;
 IF p.valid_until IS NOT NULL AND p.valid_until<=now() THEN RAISE EXCEPTION 'Proposal has expired'; END IF;
 UPDATE public.practice_proposals
 SET status='issued',approved_by=COALESCE(approved_by,auth.uid()),approved_at=COALESCE(approved_at,now()),
     issued_at=now(),updated_at=now()
 WHERE id=p.id;
 INSERT INTO public.practice_work_audit(tenant_id,product_key,actor_user_id,operation,entity_type,entity_id)
 VALUES(p.tenant_id,p.product_key,auth.uid(),'proposal.issue','proposal',p.id::text);
END $$;
REVOKE ALL ON FUNCTION public.practice_issue_proposal(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_issue_proposal(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.practice_portal_respond_request(
 _request uuid,_response text,_document uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE r public.practice_document_requests%rowtype;
BEGIN
 SELECT * INTO r FROM public.practice_document_requests WHERE id=_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Practice document request not found'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.practice_client_portal_access a
  WHERE a.tenant_id=r.tenant_id AND a.product_key=r.product_key AND a.client_id=r.client_id
    AND a.user_id=auth.uid() AND a.status='active' AND a.portal_role IN('client_owner','client_contributor')
 ) THEN RAISE EXCEPTION 'Client portal write access required'; END IF;
 IF r.status NOT IN('outstanding','rejected') THEN RAISE EXCEPTION 'Outstanding/rejected request required'; END IF;
 IF COALESCE(length(trim(_response)),0)>10000 THEN RAISE EXCEPTION 'Response note too long'; END IF;
 IF _document IS NOT NULL THEN
  IF NOT EXISTS(
   SELECT 1 FROM public.document_records d
   WHERE d.id=_document AND d.tenant_id=r.tenant_id AND d.product_key=r.product_key AND d.status<>'deleted'
  ) THEN RAISE EXCEPTION 'Document scope mismatch'; END IF;
  INSERT INTO public.practice_request_documents(tenant_id,request_id,document_id,submitted_by,status)
  VALUES(r.tenant_id,r.id,_document,auth.uid(),'submitted')
  ON CONFLICT(request_id,document_id) DO NOTHING;
 END IF;
 UPDATE public.practice_document_requests
 SET status='submitted',response_note=NULLIF(trim(_response),''),submitted_by=auth.uid(),submitted_at=now(),updated_at=now()
 WHERE id=r.id;
 INSERT INTO public.practice_work_audit(tenant_id,product_key,actor_user_id,actor_kind,operation,entity_type,entity_id)
 VALUES(r.tenant_id,r.product_key,auth.uid(),'client','request.submit','document_request',r.id::text);
END $$;
REVOKE ALL ON FUNCTION public.practice_portal_respond_request(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_portal_respond_request(uuid,text,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.practice_portal_accept_proposal(_proposal uuid,_accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE p public.practice_proposals%rowtype;
BEGIN
 SELECT * INTO p FROM public.practice_proposals WHERE id=_proposal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Practice proposal not found'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.practice_client_portal_access a
  WHERE a.tenant_id=p.tenant_id AND a.product_key=p.product_key AND a.client_id=p.client_id
    AND a.user_id=auth.uid() AND a.status='active' AND a.portal_role='client_owner'
 ) THEN RAISE EXCEPTION 'Client owner access required'; END IF;
 IF p.status<>'issued' OR (p.valid_until IS NOT NULL AND p.valid_until<=now()) THEN
  RAISE EXCEPTION 'Current issued proposal required';
 END IF;
 UPDATE public.practice_proposals
 SET status=CASE WHEN _accept THEN 'accepted' ELSE 'declined' END,
     accepted_at=CASE WHEN _accept THEN now() ELSE NULL END,
     accepted_by=CASE WHEN _accept THEN auth.uid() ELSE NULL END,updated_at=now()
 WHERE id=p.id;
 INSERT INTO public.practice_work_audit(tenant_id,product_key,actor_user_id,actor_kind,operation,entity_type,entity_id)
 VALUES(p.tenant_id,p.product_key,auth.uid(),'client',CASE WHEN _accept THEN 'proposal.accept' ELSE 'proposal.decline' END,'proposal',p.id::text);
END $$;
REVOKE ALL ON FUNCTION public.practice_portal_accept_proposal(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_portal_accept_proposal(uuid,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.practice_generate_recurring_work(_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE rw record;period_end date;period_key text;eid uuid;n integer:=0;
BEGIN
 FOR rw IN
  SELECT * FROM public.practice_recurring_work
  WHERE status='active' AND next_period_start<=current_date
  ORDER BY next_period_start,id
  LIMIT LEAST(GREATEST(_limit,1),500)
  FOR UPDATE SKIP LOCKED
 LOOP
  period_end:=CASE rw.recurrence
   WHEN 'monthly' THEN (rw.next_period_start+interval '1 month - 1 day')::date
   WHEN 'quarterly' THEN (rw.next_period_start+interval '3 months - 1 day')::date
   ELSE (rw.next_period_start+interval '1 year - 1 day')::date END;
  period_key:=to_char(rw.next_period_start,'YYYY-MM-DD')||':'||rw.recurrence;
  SELECT public.practice_create_managed_engagement(
   rw.tenant_id,rw.product_key,rw.client_id,rw.template_id,period_key,
   rw.next_period_start,period_end,NULL,
   (period_end::timestamp + make_interval(days=>rw.internal_due_offset_days))::timestamptz,
   (period_end::timestamp + make_interval(days=>rw.external_due_offset_days))::timestamptz
  ) INTO eid;
  UPDATE public.practice_recurring_work SET
   last_generated_period_key=period_key,
   next_period_start=CASE rw.recurrence
    WHEN 'monthly' THEN (rw.next_period_start+interval '1 month')::date
    WHEN 'quarterly' THEN (rw.next_period_start+interval '3 months')::date
    ELSE (rw.next_period_start+interval '1 year')::date END,
   updated_at=now()
  WHERE id=rw.id;
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.practice_generate_recurring_work(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.practice_generate_recurring_work(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.practice_record_provider_signature(
 _request uuid,_status text,_provider_ref text DEFAULT NULL,_signed_at timestamptz DEFAULT NULL,_evidence_document uuid DEFAULT NULL,_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE r public.practice_signature_requests%rowtype;
BEGIN
 SELECT * INTO r FROM public.practice_signature_requests WHERE id=_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Signature request not found'; END IF;
 IF _status NOT IN('submitted','viewed','signed','declined','expired','void','failed') THEN RAISE EXCEPTION 'Invalid signature provider status'; END IF;
 UPDATE public.practice_signature_requests
 SET status=_status,provider_request_ref=COALESCE(_provider_ref,provider_request_ref),
     signed_at=CASE WHEN _status='signed' THEN COALESCE(_signed_at,now()) ELSE signed_at END,
     evidence_document_id=COALESCE(_evidence_document,evidence_document_id),
     metadata=metadata||COALESCE(_metadata,'{}'::jsonb),updated_at=now()
 WHERE id=r.id;
 IF _status='signed' AND r.proposal_id IS NOT NULL THEN
  UPDATE public.practice_proposals
  SET status='accepted',accepted_at=COALESCE(accepted_at,COALESCE(_signed_at,now())),updated_at=now()
  WHERE id=r.proposal_id AND status IN('issued','accepted');
 END IF;
 INSERT INTO public.practice_work_audit(tenant_id,product_key,actor_kind,operation,entity_type,entity_id,detail)
 VALUES(r.tenant_id,r.product_key,'provider','signature.'||_status,'signature_request',r.id::text,COALESCE(_metadata,'{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.practice_record_provider_signature(uuid,text,text,timestamptz,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.practice_record_provider_signature(uuid,text,text,timestamptz,uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.practice_record_provider_submission(
 _submission uuid,_status text,_provider_ref text DEFAULT NULL,_response jsonb DEFAULT '{}'::jsonb,_evidence_document uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE s public.practice_submissions%rowtype;
BEGIN
 SELECT * INTO s FROM public.practice_submissions WHERE id=_submission FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Practice submission not found'; END IF;
 IF _status NOT IN('submitted','accepted','rejected','failed') THEN RAISE EXCEPTION 'Invalid provider submission status'; END IF;
 UPDATE public.practice_submissions
 SET status=_status,provider_submission_ref=COALESCE(_provider_ref,provider_submission_ref),
     response=COALESCE(_response,'{}'::jsonb),evidence_document_id=COALESCE(_evidence_document,evidence_document_id),
     submitted_at=CASE WHEN _status='submitted' THEN COALESCE(submitted_at,now()) ELSE submitted_at END,
     completed_at=CASE WHEN _status IN('accepted','rejected','failed') THEN now() ELSE completed_at END,
     updated_at=now()
 WHERE id=s.id;
 IF s.deadline_id IS NOT NULL AND _status='accepted' THEN
  UPDATE public.practice_deadlines SET status='filed',updated_at=now() WHERE id=s.deadline_id;
 END IF;
 INSERT INTO public.practice_work_audit(tenant_id,product_key,actor_kind,operation,entity_type,entity_id,detail)
 VALUES(s.tenant_id,s.product_key,'provider','submission.'||_status,'submission',s.id::text,COALESCE(_response,'{}'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.practice_record_provider_submission(uuid,text,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.practice_record_provider_submission(uuid,text,text,jsonb,uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.practice_enqueue_due_reminders(_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $
DECLARE r record;n integer:=0;event_key text;
BEGIN
 FOR r IN
  SELECT q.*
  FROM public.practice_document_requests q
  JOIN public.practice_engagements e ON e.id=q.engagement_id
  WHERE q.status='outstanding'
    AND q.due_at IS NOT NULL AND q.due_at<now()
    AND e.status NOT IN('complete','closed','cancelled')
    AND q.reminder_count<3
    AND (q.last_reminder_at IS NULL OR q.last_reminder_at<=now()-interval '3 days')
  ORDER BY q.due_at
  LIMIT LEAST(GREATEST(_limit,1),500)
  FOR UPDATE OF q SKIP LOCKED
 LOOP
  event_key:='practice-reminder:'||r.id::text||':'||(r.reminder_count+1)::text;
  INSERT INTO public.platform_events(
   tenant_id,product_key,event_type,event_version,source_service,subject_type,subject_id,
   idempotency_key,data_classification,payload
  ) VALUES(
   r.tenant_id,r.product_key,'practice.request.reminder_due',1,'omniqora.practice-delivery',
   'practice_document_request',r.id::text,event_key,'confidential',
   jsonb_build_object('requestId',r.id,'clientId',r.client_id,'engagementId',r.engagement_id,'title',r.title,'dueAt',r.due_at)
  ) ON CONFLICT(tenant_id,product_key,idempotency_key) DO NOTHING;
  UPDATE public.practice_document_requests
  SET reminder_count=reminder_count+1,last_reminder_at=now(),updated_at=now()
  WHERE id=r.id;
  n:=n+1;
 END LOOP;
 RETURN n;
END $;
REVOKE ALL ON FUNCTION public.practice_enqueue_due_reminders(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.practice_enqueue_due_reminders(integer) TO service_role;


-- Direct-table mutation hardening. Security-definer workflow RPCs remain the
-- controlled path for gated/terminal transitions.
CREATE POLICY "practice template admin insert" AS RESTRICTIVE ON public.practice_service_templates
 FOR INSERT TO authenticated WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "practice template admin update" AS RESTRICTIVE ON public.practice_service_templates
 FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "practice template admin delete" AS RESTRICTIVE ON public.practice_service_templates
 FOR DELETE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "practice recurring admin insert" AS RESTRICTIVE ON public.practice_recurring_work
 FOR INSERT TO authenticated WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "practice recurring admin update" AS RESTRICTIVE ON public.practice_recurring_work
 FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "practice recurring admin delete" AS RESTRICTIVE ON public.practice_recurring_work
 FOR DELETE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "practice portal grant admin insert" AS RESTRICTIVE ON public.practice_client_portal_access
 FOR INSERT TO authenticated WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "practice portal grant admin update" AS RESTRICTIVE ON public.practice_client_portal_access
 FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "practice portal grant admin delete" AS RESTRICTIVE ON public.practice_client_portal_access
 FOR DELETE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "practice time actor insert" AS RESTRICTIVE ON public.practice_time_entries
 FOR INSERT TO authenticated
 WITH CHECK(user_id=auth.uid() OR public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "practice time actor update" AS RESTRICTIVE ON public.practice_time_entries
 FOR UPDATE TO authenticated
 USING(user_id=auth.uid() OR public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(user_id=auth.uid() OR public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "practice time actor delete" AS RESTRICTIVE ON public.practice_time_entries
 FOR DELETE TO authenticated
 USING(user_id=auth.uid() OR public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE POLICY "practice phase controlled update" AS RESTRICTIVE ON public.practice_job_phases
 FOR UPDATE TO authenticated
 USING(status<>'completed')
 WITH CHECK(status<>'completed');

CREATE POLICY "practice proposal draft update only" AS RESTRICTIVE ON public.practice_proposals
 FOR UPDATE TO authenticated
 USING(status IN('draft','review'))
 WITH CHECK(status IN('draft','review'));
CREATE POLICY "practice proposal draft delete only" AS RESTRICTIVE ON public.practice_proposals
 FOR DELETE TO authenticated USING(status IN('draft','review'));
CREATE POLICY "practice proposal safe insert" AS RESTRICTIVE ON public.practice_proposals
 FOR INSERT TO authenticated WITH CHECK(status IN('draft','review'));

CREATE POLICY "practice signature safe insert" AS RESTRICTIVE ON public.practice_signature_requests
 FOR INSERT TO authenticated
 WITH CHECK(
  status IN('draft','review','approved')
  AND (public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 );

DROP POLICY IF EXISTS "practice submission provider-state update" ON public.practice_submissions;
CREATE POLICY "practice submission controlled update" AS RESTRICTIVE
 ON public.practice_submissions FOR UPDATE TO authenticated
 USING(status IN('draft','review'))
 WITH CHECK(status IN('draft','review'));
CREATE POLICY "practice submission safe insert" AS RESTRICTIVE
 ON public.practice_submissions FOR INSERT TO authenticated
 WITH CHECK(status IN('draft','review'));

CREATE POLICY "practice fee approval control insert" AS RESTRICTIVE ON public.practice_fee_items
 FOR INSERT TO authenticated
 WITH CHECK(
   status='draft'
   OR public.is_platform_admin(auth.uid())
   OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])
 );
CREATE POLICY "practice fee approval control update" AS RESTRICTIVE ON public.practice_fee_items
 FOR UPDATE TO authenticated
 USING(true)
 WITH CHECK(
   status NOT IN('approved','invoiced')
   OR public.is_platform_admin(auth.uid())
   OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])
 );

COMMIT;
