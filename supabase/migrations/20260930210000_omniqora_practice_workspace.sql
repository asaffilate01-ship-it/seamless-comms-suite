-- Shared service delivery workspace. Additive; no existing tenants are enabled or billed.
BEGIN;
CREATE TABLE public.practice_service_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id), service_key text NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 240), industry text NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), base_minor bigint NOT NULL CHECK(base_minor BETWEEN 0 AND 100000000),
 unit_minor bigint NOT NULL CHECK(unit_minor BETWEEN 0 AND 100000000), recurrence text NOT NULL CHECK(recurrence IN ('none','monthly','quarterly','annual')),
 phases jsonb NOT NULL CHECK(jsonb_typeof(phases)='array' AND jsonb_array_length(phases) BETWEEN 1 AND 30),
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_product_id,service_key)
);
ALTER TABLE public.practice_engagements ADD COLUMN work_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.practice_engagements ADD COLUMN internal_due_at timestamptz;
ALTER TABLE public.practice_engagements ADD COLUMN template_id uuid REFERENCES public.practice_service_templates(id);
ALTER TABLE public.practice_engagements ADD COLUMN template_snapshot jsonb;
CREATE UNIQUE INDEX practice_job_period_unique ON public.practice_engagements(tenant_product_id,client_id,template_id,period_key) WHERE template_id IS NOT NULL;
-- Legacy engagement writers cannot bypass phase gates for workspace-managed jobs.
CREATE POLICY managed_job_insert ON public.practice_engagements AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(template_id IS NULL);
CREATE POLICY managed_job_update ON public.practice_engagements AS RESTRICTIVE FOR UPDATE TO authenticated USING(template_id IS NULL) WITH CHECK(template_id IS NULL);
CREATE POLICY managed_job_delete ON public.practice_engagements AS RESTRICTIVE FOR DELETE TO authenticated USING(template_id IS NULL);
CREATE TABLE public.practice_job_phases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id), engagement_id uuid NOT NULL REFERENCES public.practice_engagements(id),
 position integer NOT NULL CHECK(position>=0), title text NOT NULL, budget_minutes integer NOT NULL CHECK(budget_minutes>=0),
 completed_at timestamptz, completed_by uuid REFERENCES auth.users(id), UNIQUE(engagement_id,position)
);
CREATE TABLE public.practice_work_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id), client_id uuid NOT NULL REFERENCES public.practice_clients(id),
 engagement_id uuid NOT NULL REFERENCES public.practice_engagements(id), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
 status text NOT NULL DEFAULT 'outstanding' CHECK(status IN ('outstanding','submitted','accepted')),
 due_at timestamptz, response text, submitted_by uuid REFERENCES auth.users(id), submitted_at timestamptz,
 reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.practice_work_time (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id), engagement_id uuid NOT NULL REFERENCES public.practice_engagements(id),
 user_id uuid NOT NULL REFERENCES auth.users(id), minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
 cost_rate_minor bigint NOT NULL CHECK(cost_rate_minor BETWEEN 0 AND 10000000), description text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.practice_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id), client_id uuid NOT NULL REFERENCES public.practice_clients(id),
 template_id uuid NOT NULL REFERENCES public.practice_service_templates(id), service_snapshot jsonb NOT NULL,
 units integer NOT NULL CHECK(units BETWEEN 0 AND 100000), catchup_minor bigint NOT NULL CHECK(catchup_minor BETWEEN 0 AND 100000000),
 total_minor bigint NOT NULL CHECK(total_minor BETWEEN 0 AND 100000000000), currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 terms text NOT NULL CHECK(length(terms) BETWEEN 1 AND 20000), expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','accepted','declined')),
 issued_at timestamptz, accepted_at timestamptz, accepted_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.practice_work_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id), actor_id uuid NOT NULL REFERENCES auth.users(id),
 operation text NOT NULL, entity_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
-- Client portal is deliberately served through a narrow RPC, not broad table access.
CREATE OR REPLACE FUNCTION public.practice_workspace_access(_tenant uuid,_product uuid,_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM tenant_products p JOIN tenant_module_entitlements e ON e.tenant_product_id=p.id AND e.tenant_id=p.tenant_id
 JOIN tenant_members m ON m.tenant_id=p.tenant_id AND m.user_id=auth.uid()
 WHERE p.id=_product AND p.tenant_id=_tenant AND p.status='active' AND e.module_key='practice.core' AND e.enabled
 AND (e.starts_at IS NULL OR e.starts_at<=now()) AND (e.ends_at IS NULL OR e.ends_at>now())
 AND (NOT _write OR m.role::text IN ('owner','admin','agent')));
$$;
REVOKE ALL ON FUNCTION public.practice_workspace_access(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_workspace_access(uuid,uuid,boolean) TO authenticated;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['practice_service_templates','practice_job_phases','practice_work_requests','practice_work_time','practice_proposals','practice_work_audit'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY workspace_read ON public.%I FOR SELECT TO authenticated USING (public.practice_workspace_access(tenant_id,tenant_product_id))',t);
  EXECUTE format('CREATE INDEX ON public.%I (tenant_id,tenant_product_id)',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.practice_workspace_command(_tenant uuid,_product uuid,_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op text:=_command->>'operation'; result_id uuid; s public.practice_service_templates; j public.practice_engagements;
 p public.practice_proposals; r public.practice_work_requests; item jsonb; n integer; total bigint; client uuid; uid uuid; next_status text;
BEGIN
 IF NOT public.practice_workspace_access(_tenant,_product,true) THEN RAISE EXCEPTION 'Practice write entitlement required'; END IF;
 IF op='service.save' THEN
  IF NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=_tenant AND user_id=auth.uid() AND role::text IN ('owner','admin')) THEN RAISE EXCEPTION 'Admin required'; END IF;
  item:=_command->'service';
  IF (item->>'key') !~ '^[a-z][a-z0-9_-]{1,79}$' OR jsonb_array_length(item->'phases') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid service'; END IF;
  FOR n IN 0..jsonb_array_length(item->'phases')-1 LOOP
   IF coalesce(length(item->'phases'->n->>'title'),0) NOT BETWEEN 1 AND 240 OR coalesce((item->'phases'->n->>'budgetMinutes')::integer,-1) NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid phase'; END IF;
  END LOOP;
  INSERT INTO practice_service_templates(tenant_id,tenant_product_id,service_key,name,industry,currency,base_minor,unit_minor,recurrence,phases)
  VALUES(_tenant,_product,item->>'key',item->>'name',item->>'industry',item->>'currency',(item->>'baseMinor')::bigint,(item->>'unitMinor')::bigint,item->>'recurrence',item->'phases')
  ON CONFLICT(tenant_product_id,service_key) DO UPDATE SET name=EXCLUDED.name,industry=EXCLUDED.industry,currency=EXCLUDED.currency,
   base_minor=EXCLUDED.base_minor,unit_minor=EXCLUDED.unit_minor,recurrence=EXCLUDED.recurrence,phases=EXCLUDED.phases,
   version=practice_service_templates.version+1,updated_at=now() RETURNING id INTO result_id;
 ELSIF op IN ('job.create','proposal.create') THEN
  SELECT * INTO s FROM practice_service_templates WHERE id=(_command->>'serviceId')::uuid AND tenant_id=_tenant AND tenant_product_id=_product;
  client:=(_command->>'clientId')::uuid;
  IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM practice_clients WHERE id=client AND tenant_id=_tenant AND tenant_product_id=_product) THEN RAISE EXCEPTION 'Client or service outside workspace'; END IF;
  IF op='job.create' THEN
   IF coalesce(length(_command->>'periodKey'),0) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Period required'; END IF;
   INSERT INTO practice_engagements(tenant_id,tenant_product_id,client_id,service_key,period_key,status,assigned_user_ids,due_at,internal_due_at,template_id,template_snapshot)
   VALUES(_tenant,_product,client,s.service_key,_command->>'periodKey','collecting',ARRAY[auth.uid()],(_command->>'externalDue')::timestamptz,(_command->>'internalDue')::timestamptz,s.id,to_jsonb(s))
   ON CONFLICT(tenant_product_id,client_id,template_id,period_key) WHERE template_id IS NOT NULL DO NOTHING RETURNING id INTO result_id;
   IF result_id IS NULL THEN SELECT id INTO result_id FROM practice_engagements WHERE tenant_product_id=_product AND client_id=client AND template_id=s.id AND period_key=_command->>'periodKey'; RETURN jsonb_build_object('id',result_id,'existing',true); END IF;
   INSERT INTO practice_job_phases(tenant_id,tenant_product_id,engagement_id,position,title,budget_minutes)
   SELECT _tenant,_product,result_id,(ordinality-1)::integer,value->>'title',(value->>'budgetMinutes')::integer FROM jsonb_array_elements(s.phases) WITH ORDINALITY;
  ELSE
   total:=s.base_minor+s.unit_minor*(_command->>'units')::bigint+(_command->>'catchupMinor')::bigint;
   IF (_command->>'expiresAt')::timestamptz<=now() THEN RAISE EXCEPTION 'Proposal expiry must be in the future'; END IF;
   INSERT INTO practice_proposals(tenant_id,tenant_product_id,client_id,template_id,service_snapshot,units,catchup_minor,total_minor,currency,terms,expires_at)
   VALUES(_tenant,_product,client,s.id,to_jsonb(s),(_command->>'units')::integer,(_command->>'catchupMinor')::bigint,total,s.currency,_command->>'terms',(_command->>'expiresAt')::timestamptz) RETURNING id INTO result_id;
  END IF;
 ELSIF op='proposal.issue' THEN
  SELECT * INTO p FROM practice_proposals WHERE id=(_command->>'proposalId')::uuid AND tenant_id=_tenant AND tenant_product_id=_product FOR UPDATE;
  IF p.id IS NULL OR p.status<>'draft' OR p.expires_at<=now() THEN RAISE EXCEPTION 'Proposal is not issuable'; END IF;
  UPDATE practice_proposals SET status='issued',issued_at=now() WHERE id=p.id; result_id:=p.id;
 ELSIF op='request.review' THEN
  SELECT * INTO r FROM practice_work_requests WHERE id=(_command->>'requestId')::uuid AND tenant_id=_tenant AND tenant_product_id=_product FOR UPDATE;
  IF r.id IS NULL OR r.status<>'submitted' THEN RAISE EXCEPTION 'Submitted request required'; END IF;
  UPDATE practice_work_requests SET status=CASE WHEN (_command->>'accepted')::boolean THEN 'accepted' ELSE 'outstanding' END,reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id;
  result_id:=r.id;
 ELSE
  SELECT * INTO j FROM practice_engagements WHERE id=(_command->>'jobId')::uuid AND tenant_id=_tenant AND tenant_product_id=_product AND template_id IS NOT NULL FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF j.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Job is closed'; END IF;
  IF op IN ('phase.complete','job.status','job.assign') AND j.work_version IS DISTINCT FROM (_command->>'expectedVersion')::integer THEN RAISE EXCEPTION 'Job changed; refresh before retrying'; END IF;
  IF op='phase.complete' THEN
   SELECT position INTO n FROM practice_job_phases WHERE id=(_command->>'phaseId')::uuid AND engagement_id=j.id AND completed_at IS NULL;
   IF n IS NULL THEN RAISE EXCEPTION 'Open phase required'; END IF;
   IF EXISTS(SELECT 1 FROM practice_job_phases WHERE engagement_id=j.id AND position<n AND completed_at IS NULL) THEN RAISE EXCEPTION 'Complete earlier phases first'; END IF;
   IF EXISTS(SELECT 1 FROM practice_work_requests WHERE engagement_id=j.id AND status<>'accepted') THEN RAISE EXCEPTION 'Outstanding client requests must be accepted first'; END IF;
   UPDATE practice_job_phases SET completed_at=now(),completed_by=auth.uid() WHERE id=(_command->>'phaseId')::uuid;
   UPDATE practice_engagements SET progress=(SELECT round(100.0*count(*) FILTER(WHERE completed_at IS NOT NULL)/count(*))::integer FROM practice_job_phases WHERE engagement_id=j.id),work_version=work_version+1 WHERE id=j.id;
   result_id:=j.id;
  ELSIF op='job.status' THEN
   next_status:=_command->>'status';
   IF next_status NOT IN ('collecting','processing','client_action','review','approval','submission','completed','cancelled') THEN RAISE EXCEPTION 'Invalid job status'; END IF;
   IF next_status='completed' AND (EXISTS(SELECT 1 FROM practice_job_phases WHERE engagement_id=j.id AND completed_at IS NULL) OR EXISTS(SELECT 1 FROM practice_work_requests WHERE engagement_id=j.id AND status<>'accepted')) THEN RAISE EXCEPTION 'Complete phases and client requests first'; END IF;
   UPDATE practice_engagements SET status=next_status,work_version=work_version+1 WHERE id=j.id;result_id:=j.id;
  ELSIF op='job.assign' THEN
   uid:=(_command->>'userId')::uuid;
   IF uid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=_tenant AND user_id=uid AND role::text IN ('owner','admin','agent')) THEN RAISE EXCEPTION 'Assignee must be a workspace staff member'; END IF;
   UPDATE practice_engagements SET assigned_user_ids=CASE WHEN uid IS NULL THEN '{}'::uuid[] ELSE ARRAY[uid] END,work_version=work_version+1 WHERE id=j.id;result_id:=j.id;
  ELSIF op='request.create' THEN
   INSERT INTO practice_work_requests(tenant_id,tenant_product_id,client_id,engagement_id,title,due_at)
   VALUES(_tenant,_product,j.client_id,j.id,_command->>'title',(_command->>'dueAt')::timestamptz) RETURNING id INTO result_id;
  ELSIF op='time.record' THEN
   INSERT INTO practice_work_time(tenant_id,tenant_product_id,engagement_id,user_id,minutes,cost_rate_minor,description)
   VALUES(_tenant,_product,j.id,auth.uid(),(_command->>'minutes')::integer,(_command->>'costRateMinor')::bigint,_command->>'description') RETURNING id INTO result_id;
  ELSE RAISE EXCEPTION 'Unknown practice operation'; END IF;
 END IF;
 INSERT INTO practice_work_audit(tenant_id,tenant_product_id,actor_id,operation,entity_id) VALUES(_tenant,_product,auth.uid(),op,result_id);
 RETURN jsonb_build_object('id',result_id);
END;
$$;
REVOKE ALL ON FUNCTION public.practice_workspace_command(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_workspace_command(uuid,uuid,jsonb) TO authenticated;

-- Optional across the suite; existing defaults retained. Commercial prices are deliberately not invented.
INSERT INTO public.product_module_defaults(product_key,module_key,enabled_by_default)
SELECT product_key,'practice.core',false FROM public.platform_products WHERE kind IN ('platform','vertical_landlord','standalone','product_variant')
ON CONFLICT(product_key,module_key) DO NOTHING;
UPDATE public.platform_modules SET version='1.1.0-preview', capabilities=ARRAY['clients','engagements','deadlines','document_requests','signatures','client_portal','time_wip','fees','submissions','service_templates','job_phases','proposals','pricing_rules','work_board'],ui_mode='hybrid' WHERE module_key='practice.core';

CREATE OR REPLACE FUNCTION public.practice_portal_workspace(_client uuid, _action text DEFAULT 'read', _entity uuid DEFAULT NULL, _response text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.practice_clients; u public.practice_client_users; p public.practice_proposals; r public.practice_work_requests;
BEGIN
 SELECT * INTO c FROM practice_clients WHERE id=_client;
 SELECT * INTO u FROM practice_client_users WHERE practice_client_id=_client AND tenant_id=c.tenant_id AND user_id=auth.uid() AND status='active';
 IF c.id IS NULL OR u.id IS NULL THEN RAISE EXCEPTION 'Client portal membership required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM tenant_module_entitlements e JOIN tenant_products t ON t.id=e.tenant_product_id AND t.tenant_id=e.tenant_id
 WHERE e.tenant_id=c.tenant_id AND e.tenant_product_id=c.tenant_product_id AND t.status='active' AND e.module_key='practice.core' AND e.enabled
 AND (e.starts_at IS NULL OR e.starts_at<=now()) AND (e.ends_at IS NULL OR e.ends_at>now())) THEN RAISE EXCEPTION 'Practice entitlement required'; END IF;
 IF _action<>'read' THEN
  IF u.portal_role='client_viewer' THEN RAISE EXCEPTION 'Portal is read only'; END IF;
  IF _action='respond' THEN
   SELECT * INTO r FROM practice_work_requests WHERE id=_entity AND client_id=c.id AND tenant_id=c.tenant_id AND tenant_product_id=c.tenant_product_id FOR UPDATE;
   IF r.id IS NULL OR r.status<>'outstanding' OR coalesce(length(trim(_response)),0) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Outstanding request and response required'; END IF;
   IF EXISTS(SELECT 1 FROM practice_engagements WHERE id=r.engagement_id AND status IN ('completed','cancelled')) THEN RAISE EXCEPTION 'Job is closed'; END IF;
   UPDATE practice_work_requests SET response=trim(_response),status='submitted',submitted_by=auth.uid(),submitted_at=now() WHERE id=r.id;
  ELSIF _action IN ('accept','decline') THEN
   IF u.portal_role<>'client_owner' THEN RAISE EXCEPTION 'Client owner approval required'; END IF;
   SELECT * INTO p FROM practice_proposals WHERE id=_entity AND client_id=c.id AND tenant_id=c.tenant_id AND tenant_product_id=c.tenant_product_id FOR UPDATE;
   IF p.id IS NULL OR p.status<>'issued' OR p.expires_at<=now() THEN RAISE EXCEPTION 'Current issued proposal required'; END IF;
   UPDATE practice_proposals SET status=CASE WHEN _action='accept' THEN 'accepted' ELSE 'declined' END,accepted_by=auth.uid(),accepted_at=now() WHERE id=p.id;
  ELSE RAISE EXCEPTION 'Invalid portal action'; END IF;
  INSERT INTO practice_work_audit(tenant_id,tenant_product_id,actor_id,operation,entity_id) VALUES(c.tenant_id,c.tenant_product_id,auth.uid(),'portal.'||_action,_entity);
 END IF;
 RETURN jsonb_build_object(
  'client',jsonb_build_object('id',c.id,'name',c.legal_name,'role',u.portal_role),
  'jobs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'service_key',service_key,'period_key',period_key,'status',status,'progress',progress,'due_at',due_at)) FROM practice_engagements WHERE client_id=c.id AND tenant_id=c.tenant_id AND tenant_product_id=c.tenant_product_id AND template_id IS NOT NULL),'[]'::jsonb),
  'requests',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'due_at',due_at,'status',status,'response',response)) FROM practice_work_requests WHERE client_id=c.id AND tenant_id=c.tenant_id AND tenant_product_id=c.tenant_product_id),'[]'::jsonb),
  'proposals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'service_name',service_snapshot->>'name','total_minor',total_minor,'currency',currency,'terms',terms,'expires_at',expires_at,'status',status)) FROM practice_proposals WHERE client_id=c.id AND tenant_id=c.tenant_id AND tenant_product_id=c.tenant_product_id AND status<>'draft'),'[]'::jsonb)
 );
END;
$$;
REVOKE ALL ON FUNCTION public.practice_portal_workspace(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_portal_workspace(uuid,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.practice_request_access(_request uuid,_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM practice_work_requests r JOIN practice_engagements j ON j.id=r.engagement_id
 JOIN tenant_products p ON p.id=r.tenant_product_id AND p.tenant_id=r.tenant_id
 JOIN tenant_module_entitlements e ON e.tenant_product_id=p.id AND e.tenant_id=p.tenant_id AND e.module_key='practice.core'
 WHERE r.id=_request AND p.status='active' AND e.enabled AND (e.starts_at IS NULL OR e.starts_at<=now()) AND (e.ends_at IS NULL OR e.ends_at>now())
 AND (NOT _write OR (r.status='outstanding' AND j.status NOT IN ('completed','cancelled')))
 AND (public.practice_workspace_access(r.tenant_id,r.tenant_product_id,_write) OR EXISTS(
 SELECT 1 FROM practice_client_users u WHERE u.tenant_id=r.tenant_id AND u.practice_client_id=r.client_id AND u.user_id=auth.uid() AND u.status='active'
 AND (NOT _write OR u.portal_role IN ('client_owner','client_user')))));
$$;
REVOKE ALL ON FUNCTION public.practice_request_access(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_request_access(uuid,boolean) TO authenticated;
CREATE TABLE public.practice_request_files(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES public.practice_work_requests(id),
 storage_path text NOT NULL UNIQUE, file_name text NOT NULL, mime_type text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'), uploaded_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.practice_request_files ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.practice_request_files TO authenticated;
GRANT ALL ON public.practice_request_files TO service_role;
CREATE POLICY request_files_read ON public.practice_request_files FOR SELECT TO authenticated USING(public.practice_request_access(request_id));
CREATE INDEX ON public.practice_request_files(request_id);
COMMIT;
