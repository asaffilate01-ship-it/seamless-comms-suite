-- Omniqora shared Practice workspace v2 on current tenant_id + product_key control-plane scope.
BEGIN;

INSERT INTO public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES(
  'omniqora.practice','Practice Operations',
  'Shared client service-delivery workspace, jobs, requests, proposals, time and recurring work.',
  'professional-services','omniqora',true,'automatic','active','built_main'
)
ON CONFLICT(service_key) DO UPDATE SET
  name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
  owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
  provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
  implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key,required)
VALUES('omniqora.practice','omniqora.crm',true)
ON CONFLICT(service_key,depends_on_service_key) DO UPDATE SET required=true;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required) VALUES
 ('omniqora-accounts','omniqora.practice',false,false),
 ('taxcenda','omniqora.practice',false,false),
 ('taxnuvia','omniqora.practice',false,false),
 ('lawquo','omniqora.practice',false,false),
 ('haccora','omniqora.practice',false,false),
 ('formationgenie','omniqora.practice',false,false)
ON CONFLICT(product_key,service_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.practice_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  crm_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 240),
  billing_email text,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('prospect','active','paused','closed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,crm_company_id)
);
CREATE INDEX IF NOT EXISTS practice_clients_scope_idx ON public.practice_clients(tenant_id,product_key,status);

CREATE TABLE IF NOT EXISTS public.practice_client_users (
  practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portal_role text NOT NULL DEFAULT 'client_viewer' CHECK(portal_role IN ('client_owner','client_viewer')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(practice_client_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.practice_service_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  service_key text NOT NULL CHECK(service_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 240),
  industry text NOT NULL,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  base_minor bigint NOT NULL DEFAULT 0 CHECK(base_minor BETWEEN 0 AND 100000000),
  unit_minor bigint NOT NULL DEFAULT 0 CHECK(unit_minor BETWEEN 0 AND 100000000),
  recurrence text NOT NULL DEFAULT 'none' CHECK(recurrence IN ('none','monthly','quarterly','annual')),
  phases jsonb NOT NULL CHECK(jsonb_typeof(phases)='array' AND jsonb_array_length(phases) BETWEEN 1 AND 30),
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,service_key)
);

CREATE TABLE IF NOT EXISTS public.practice_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.practice_service_templates(id) ON DELETE RESTRICT,
  service_key text NOT NULL,
  period_key text NOT NULL CHECK(length(period_key) BETWEEN 1 AND 240),
  status text NOT NULL DEFAULT 'collecting' CHECK(status IN ('collecting','processing','client_action','review','approval','submission','completed','cancelled')),
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  external_due_at timestamptz,
  internal_due_at timestamptz,
  template_snapshot jsonb,
  work_version integer NOT NULL DEFAULT 1 CHECK(work_version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS practice_job_period_uq
 ON public.practice_engagements(tenant_id,product_key,client_id,template_id,period_key)
 WHERE template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS practice_jobs_board_idx ON public.practice_engagements(tenant_id,product_key,status,external_due_at);

CREATE TABLE IF NOT EXISTS public.practice_job_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  engagement_id uuid NOT NULL REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK(position>=0),
  title text NOT NULL,
  budget_minutes integer NOT NULL DEFAULT 0 CHECK(budget_minutes BETWEEN 0 AND 100000),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(engagement_id,position)
);

CREATE TABLE IF NOT EXISTS public.practice_work_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
  status text NOT NULL DEFAULT 'outstanding' CHECK(status IN ('outstanding','submitted','accepted')),
  due_at timestamptz,
  response text,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  chase_enabled boolean NOT NULL DEFAULT false,
  chase_count integer NOT NULL DEFAULT 0 CHECK(chase_count BETWEEN 0 AND 3),
  last_chased_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS practice_requests_due_idx ON public.practice_work_requests(tenant_id,product_key,status,due_at);

CREATE TABLE IF NOT EXISTS public.practice_work_time (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  engagement_id uuid NOT NULL REFERENCES public.practice_engagements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
  cost_rate_minor bigint NOT NULL DEFAULT 0 CHECK(cost_rate_minor BETWEEN 0 AND 10000000),
  description text NOT NULL CHECK(length(description) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.practice_service_templates(id) ON DELETE RESTRICT,
  service_snapshot jsonb NOT NULL,
  units integer NOT NULL DEFAULT 0 CHECK(units BETWEEN 0 AND 100000),
  catchup_minor bigint NOT NULL DEFAULT 0 CHECK(catchup_minor BETWEEN 0 AND 100000000),
  total_minor bigint NOT NULL CHECK(total_minor BETWEEN 0 AND 100000000000),
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
  terms text NOT NULL CHECK(length(terms) BETWEEN 1 AND 20000),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','accepted','declined')),
  issued_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.practice_recurring_work (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.practice_service_templates(id) ON DELETE CASCADE,
  next_on date NOT NULL,
  interval_months integer NOT NULL CHECK(interval_months IN (1,3,12)),
  anchor_day integer NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
  internal_days integer NOT NULL DEFAULT 0 CHECK(internal_days BETWEEN 0 AND 366),
  external_days integer NOT NULL DEFAULT 0 CHECK(external_days BETWEEN 0 AND 366),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,client_id,template_id)
);

CREATE TABLE IF NOT EXISTS public.practice_work_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operation text NOT NULL,
  entity_id uuid NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.practice_access(_tenant uuid,_product text,_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.has_tenant_entitlement(_tenant,'omniqora.practice')
    AND EXISTS(SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.status='active')
    AND (
      public.is_platform_admin(auth.uid())
      OR EXISTS(
        SELECT 1 FROM public.tenant_members m
        WHERE m.tenant_id=_tenant AND m.user_id=auth.uid()
          AND (NOT _write OR m.role::text IN ('owner','admin','agent'))
      )
    );
$$;
REVOKE ALL ON FUNCTION public.practice_access(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_access(uuid,text,boolean) TO authenticated,service_role;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'practice_clients','practice_client_users','practice_service_templates','practice_engagements',
  'practice_job_phases','practice_work_requests','practice_work_time','practice_proposals',
  'practice_recurring_work','practice_work_audit'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
GRANT SELECT ON public.practice_clients,public.practice_client_users,public.practice_service_templates,
 public.practice_engagements,public.practice_job_phases,public.practice_work_requests,public.practice_work_time,
 public.practice_proposals,public.practice_recurring_work,public.practice_work_audit TO authenticated;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'practice_clients','practice_service_templates','practice_engagements','practice_job_phases',
  'practice_work_requests','practice_work_time','practice_proposals','practice_recurring_work','practice_work_audit'
 ] LOOP
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.practice_access(tenant_id,product_key,false))','practice staff read',t);
 END LOOP;
END $$;
CREATE POLICY "practice client user self read" ON public.practice_client_users FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.practice_access(tenant_id,product_key,false));

CREATE OR REPLACE FUNCTION public.practice_workspace_command(_tenant uuid,_product text,_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 op text:=_command->>'operation'; result_id uuid; item jsonb; n integer; total bigint;
 client public.practice_clients; tmpl public.practice_service_templates; job public.practice_engagements;
 req public.practice_work_requests; prop public.practice_proposals; member_role text;
BEGIN
 IF NOT public.practice_access(_tenant,_product,true) THEN RAISE EXCEPTION 'Practice write entitlement required'; END IF;
 SELECT role::text INTO member_role FROM public.tenant_members WHERE tenant_id=_tenant AND user_id=auth.uid();

 IF op='client.save' THEN
  item:=_command->'client';
  IF item->>'crmCompanyId' IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.crm_companies c WHERE c.id=(item->>'crmCompanyId')::uuid AND c.tenant_id=_tenant
  ) THEN RAISE EXCEPTION 'CRM company outside tenant'; END IF;
  IF item->>'id' IS NULL THEN
   INSERT INTO public.practice_clients(tenant_id,product_key,crm_company_id,display_name,billing_email,status,metadata)
   VALUES(_tenant,_product,NULLIF(item->>'crmCompanyId','')::uuid,item->>'displayName',NULLIF(item->>'billingEmail',''),COALESCE(item->>'status','active'),COALESCE(item->'metadata','{}'::jsonb))
   RETURNING id INTO result_id;
  ELSE
   UPDATE public.practice_clients SET crm_company_id=NULLIF(item->>'crmCompanyId','')::uuid,display_name=item->>'displayName',
    billing_email=NULLIF(item->>'billingEmail',''),status=COALESCE(item->>'status','active'),metadata=COALESCE(item->'metadata','{}'::jsonb),updated_at=now()
   WHERE id=(item->>'id')::uuid AND tenant_id=_tenant AND product_key=_product RETURNING id INTO result_id;
  END IF;
 ELSIF op='service.save' THEN
  IF NOT public.is_platform_admin(auth.uid()) AND member_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Practice admin required'; END IF;
  item:=_command->'service';
  IF (item->>'key') !~ '^[a-z][a-z0-9_-]{1,79}$' OR jsonb_array_length(item->'phases') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid service'; END IF;
  FOR n IN 0..jsonb_array_length(item->'phases')-1 LOOP
   IF coalesce(length(item->'phases'->n->>'title'),0) NOT BETWEEN 1 AND 240 OR coalesce((item->'phases'->n->>'budgetMinutes')::integer,-1) NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid phase'; END IF;
  END LOOP;
  INSERT INTO public.practice_service_templates(tenant_id,product_key,service_key,name,industry,currency,base_minor,unit_minor,recurrence,phases)
  VALUES(_tenant,_product,item->>'key',item->>'name',item->>'industry',item->>'currency',(item->>'baseMinor')::bigint,(item->>'unitMinor')::bigint,item->>'recurrence',item->'phases')
  ON CONFLICT(tenant_id,product_key,service_key) DO UPDATE SET name=EXCLUDED.name,industry=EXCLUDED.industry,currency=EXCLUDED.currency,
   base_minor=EXCLUDED.base_minor,unit_minor=EXCLUDED.unit_minor,recurrence=EXCLUDED.recurrence,phases=EXCLUDED.phases,
   version=public.practice_service_templates.version+1,status='active',updated_at=now()
  RETURNING id INTO result_id;
 ELSIF op='job.create' THEN
  SELECT * INTO tmpl FROM public.practice_service_templates WHERE id=(_command->>'serviceId')::uuid AND tenant_id=_tenant AND product_key=_product AND status='active';
  SELECT * INTO client FROM public.practice_clients WHERE id=(_command->>'clientId')::uuid AND tenant_id=_tenant AND product_key=_product AND status<>'closed';
  IF tmpl.id IS NULL OR client.id IS NULL THEN RAISE EXCEPTION 'Client or service outside practice workspace'; END IF;
  INSERT INTO public.practice_engagements(tenant_id,product_key,client_id,template_id,service_key,period_key,status,assigned_user_id,external_due_at,internal_due_at,template_snapshot)
  VALUES(_tenant,_product,client.id,tmpl.id,tmpl.service_key,_command->>'periodKey','collecting',auth.uid(),
   NULLIF(_command->>'externalDue','')::timestamptz,NULLIF(_command->>'internalDue','')::timestamptz,to_jsonb(tmpl))
  ON CONFLICT(tenant_id,product_key,client_id,template_id,period_key) WHERE template_id IS NOT NULL DO NOTHING
  RETURNING id INTO result_id;
  IF result_id IS NULL THEN
   SELECT id INTO result_id FROM public.practice_engagements WHERE tenant_id=_tenant AND product_key=_product
    AND client_id=client.id AND template_id=tmpl.id AND period_key=_command->>'periodKey';
   RETURN jsonb_build_object('id',result_id,'existing',true);
  END IF;
  INSERT INTO public.practice_job_phases(tenant_id,product_key,engagement_id,position,title,budget_minutes)
  SELECT _tenant,_product,result_id,(ordinality-1)::integer,value->>'title',(value->>'budgetMinutes')::integer
  FROM jsonb_array_elements(tmpl.phases) WITH ORDINALITY;
 ELSIF op='phase.complete' THEN
  SELECT * INTO job FROM public.practice_engagements WHERE id=(_command->>'jobId')::uuid AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
  IF job.id IS NULL OR job.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Open job required'; END IF;
  IF job.work_version<>(_command->>'expectedVersion')::integer THEN RAISE EXCEPTION 'Job changed; refresh'; END IF;
  SELECT position INTO n FROM public.practice_job_phases WHERE id=(_command->>'phaseId')::uuid AND engagement_id=job.id AND tenant_id=_tenant;
  IF n IS NULL THEN RAISE EXCEPTION 'Phase not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.practice_job_phases WHERE engagement_id=job.id AND position<n AND completed_at IS NULL) THEN RAISE EXCEPTION 'Earlier phases are incomplete'; END IF;
  UPDATE public.practice_job_phases SET completed_at=COALESCE(completed_at,now()),completed_by=COALESCE(completed_by,auth.uid()) WHERE id=(_command->>'phaseId')::uuid;
  UPDATE public.practice_engagements SET work_version=work_version+1,updated_at=now() WHERE id=job.id;
  result_id:=job.id;
 ELSIF op='job.status' THEN
  SELECT * INTO job FROM public.practice_engagements WHERE id=(_command->>'jobId')::uuid AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
  IF job.id IS NULL OR job.work_version<>(_command->>'expectedVersion')::integer THEN RAISE EXCEPTION 'Job changed or unavailable'; END IF;
  UPDATE public.practice_engagements SET status=_command->>'status',work_version=work_version+1,updated_at=now() WHERE id=job.id;
  result_id:=job.id;
 ELSIF op='request.create' THEN
  SELECT * INTO job FROM public.practice_engagements WHERE id=(_command->>'jobId')::uuid AND tenant_id=_tenant AND product_key=_product;
  IF job.id IS NULL OR job.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Open job required'; END IF;
  INSERT INTO public.practice_work_requests(tenant_id,product_key,client_id,engagement_id,title,due_at,chase_enabled)
  VALUES(_tenant,_product,job.client_id,job.id,_command->>'title',NULLIF(_command->>'dueAt','')::timestamptz,COALESCE((_command->>'chaseEnabled')::boolean,false))
  RETURNING id INTO result_id;
 ELSIF op='request.chasing' THEN
  SELECT * INTO req FROM public.practice_work_requests WHERE id=(_command->>'requestId')::uuid AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  UPDATE public.practice_work_requests SET chase_enabled=COALESCE((_command->>'enabled')::boolean,false) WHERE id=req.id;
  result_id:=req.id;
 ELSIF op='request.review' THEN
  SELECT * INTO req FROM public.practice_work_requests WHERE id=(_command->>'requestId')::uuid AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
  IF req.id IS NULL OR req.status<>'submitted' THEN RAISE EXCEPTION 'Submitted request required'; END IF;
  UPDATE public.practice_work_requests SET status=CASE WHEN (_command->>'accepted')::boolean THEN 'accepted' ELSE 'outstanding' END,
   reviewed_by=auth.uid(),reviewed_at=now() WHERE id=req.id;
  result_id:=req.id;
 ELSIF op='time.record' THEN
  SELECT * INTO job FROM public.practice_engagements WHERE id=(_command->>'jobId')::uuid AND tenant_id=_tenant AND product_key=_product;
  IF job.id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
  INSERT INTO public.practice_work_time(tenant_id,product_key,engagement_id,user_id,minutes,cost_rate_minor,description)
  VALUES(_tenant,_product,job.id,auth.uid(),(_command->>'minutes')::integer,(_command->>'costRateMinor')::bigint,_command->>'description')
  RETURNING id INTO result_id;
 ELSIF op='proposal.create' THEN
  SELECT * INTO tmpl FROM public.practice_service_templates WHERE id=(_command->>'serviceId')::uuid AND tenant_id=_tenant AND product_key=_product;
  SELECT * INTO client FROM public.practice_clients WHERE id=(_command->>'clientId')::uuid AND tenant_id=_tenant AND product_key=_product;
  IF tmpl.id IS NULL OR client.id IS NULL THEN RAISE EXCEPTION 'Client or service outside practice workspace'; END IF;
  total:=tmpl.base_minor+tmpl.unit_minor*(_command->>'units')::bigint+(_command->>'catchupMinor')::bigint;
  IF total>100000000000 OR (_command->>'expiresAt')::timestamptz<=now() THEN RAISE EXCEPTION 'Invalid proposal'; END IF;
  INSERT INTO public.practice_proposals(tenant_id,product_key,client_id,template_id,service_snapshot,units,catchup_minor,total_minor,currency,terms,expires_at)
  VALUES(_tenant,_product,client.id,tmpl.id,to_jsonb(tmpl),(_command->>'units')::integer,(_command->>'catchupMinor')::bigint,total,tmpl.currency,_command->>'terms',(_command->>'expiresAt')::timestamptz)
  RETURNING id INTO result_id;
 ELSIF op='proposal.issue' THEN
  SELECT * INTO prop FROM public.practice_proposals WHERE id=(_command->>'proposalId')::uuid AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
  IF prop.id IS NULL OR prop.status<>'draft' OR prop.expires_at<=now() THEN RAISE EXCEPTION 'Proposal is not issuable'; END IF;
  UPDATE public.practice_proposals SET status='issued',issued_at=now() WHERE id=prop.id;
  result_id:=prop.id;
 ELSIF op='recurrence.save' THEN
  IF NOT public.is_platform_admin(auth.uid()) AND member_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Practice admin required'; END IF;
  SELECT * INTO tmpl FROM public.practice_service_templates WHERE id=(_command->>'serviceId')::uuid AND tenant_id=_tenant AND product_key=_product;
  SELECT * INTO client FROM public.practice_clients WHERE id=(_command->>'clientId')::uuid AND tenant_id=_tenant AND product_key=_product;
  IF tmpl.id IS NULL OR client.id IS NULL OR tmpl.recurrence='none' THEN RAISE EXCEPTION 'Recurring service required'; END IF;
  INSERT INTO public.practice_recurring_work(tenant_id,product_key,client_id,template_id,next_on,interval_months,anchor_day,internal_days,external_days,enabled,created_by)
  VALUES(_tenant,_product,client.id,tmpl.id,(_command->>'nextOn')::date,
   CASE tmpl.recurrence WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 ELSE 12 END,
   extract(day from (_command->>'nextOn')::date)::integer,
   (_command->>'internalDays')::integer,(_command->>'externalDays')::integer,
   COALESCE((_command->>'enabled')::boolean,true),auth.uid())
  ON CONFLICT(tenant_id,product_key,client_id,template_id) DO UPDATE SET next_on=EXCLUDED.next_on,
   interval_months=EXCLUDED.interval_months,anchor_day=EXCLUDED.anchor_day,internal_days=EXCLUDED.internal_days,
   external_days=EXCLUDED.external_days,enabled=EXCLUDED.enabled,updated_at=now()
  RETURNING id INTO result_id;
 ELSE
  RAISE EXCEPTION 'Unknown practice operation';
 END IF;

 INSERT INTO public.practice_work_audit(tenant_id,product_key,actor_id,operation,entity_id,detail)
 VALUES(_tenant,_product,auth.uid(),op,result_id,'{}'::jsonb);
 RETURN jsonb_build_object('id',result_id);
END; $$;
REVOKE ALL ON FUNCTION public.practice_workspace_command(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_workspace_command(uuid,text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.practice_grant_client_user(
  _tenant uuid,_product text,_client uuid,_user uuid,_role text DEFAULT 'client_viewer'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $
DECLARE member_role text;
BEGIN
 IF NOT public.practice_access(_tenant,_product,true) THEN RAISE EXCEPTION 'Practice admin access required'; END IF;
 SELECT role::text INTO member_role FROM public.tenant_members WHERE tenant_id=_tenant AND user_id=auth.uid();
 IF NOT public.is_platform_admin(auth.uid()) AND member_role NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Practice admin required'; END IF;
 IF _role NOT IN ('client_owner','client_viewer') THEN RAISE EXCEPTION 'Invalid client portal role'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.practice_clients WHERE id=_client AND tenant_id=_tenant AND product_key=_product) THEN RAISE EXCEPTION 'Client not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_user) THEN RAISE EXCEPTION 'Portal user not found'; END IF;
 INSERT INTO public.practice_client_users(practice_client_id,tenant_id,product_key,user_id,portal_role,status)
 VALUES(_client,_tenant,_product,_user,_role,'active')
 ON CONFLICT(practice_client_id,user_id) DO UPDATE SET portal_role=EXCLUDED.portal_role,status='active';
END; $;
REVOKE ALL ON FUNCTION public.practice_grant_client_user(uuid,text,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_grant_client_user(uuid,text,uuid,uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.practice_portal_workspace(
  _client uuid,_action text DEFAULT 'read',_entity uuid DEFAULT NULL,_response text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE membership public.practice_client_users%rowtype; req public.practice_work_requests%rowtype; prop public.practice_proposals%rowtype;
BEGIN
 SELECT * INTO membership FROM public.practice_client_users WHERE practice_client_id=_client AND user_id=auth.uid() AND status='active';
 IF membership.user_id IS NULL THEN RAISE EXCEPTION 'Practice portal access denied'; END IF;

 IF _action='respond' THEN
  SELECT * INTO req FROM public.practice_work_requests WHERE id=_entity AND client_id=_client AND tenant_id=membership.tenant_id AND product_key=membership.product_key FOR UPDATE;
  IF req.id IS NULL OR req.status NOT IN ('outstanding','submitted') OR length(COALESCE(_response,'')) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Request cannot be submitted'; END IF;
  UPDATE public.practice_work_requests SET response=_response,status='submitted',submitted_by=auth.uid(),submitted_at=now(),reviewed_by=NULL,reviewed_at=NULL WHERE id=req.id;
 ELSIF _action IN ('accept','decline') THEN
  IF membership.portal_role<>'client_owner' THEN RAISE EXCEPTION 'Client owner required'; END IF;
  SELECT * INTO prop FROM public.practice_proposals WHERE id=_entity AND client_id=_client AND tenant_id=membership.tenant_id AND product_key=membership.product_key FOR UPDATE;
  IF prop.id IS NULL OR prop.status<>'issued' OR prop.expires_at<=now() THEN RAISE EXCEPTION 'Proposal cannot be actioned'; END IF;
  UPDATE public.practice_proposals SET status=CASE WHEN _action='accept' THEN 'accepted' ELSE 'declined' END,
   accepted_at=CASE WHEN _action='accept' THEN now() ELSE NULL END,accepted_by=CASE WHEN _action='accept' THEN auth.uid() ELSE NULL END
  WHERE id=prop.id;
 ELSIF _action<>'read' THEN RAISE EXCEPTION 'Unknown portal action'; END IF;

 RETURN jsonb_build_object(
  'client',(SELECT jsonb_build_object('id',c.id,'displayName',c.display_name,'billingEmail',c.billing_email,'status',c.status) FROM public.practice_clients c WHERE c.id=_client),
  'role',membership.portal_role,
  'jobs',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',j.id,'serviceKey',j.service_key,'periodKey',j.period_key,'status',j.status,'externalDueAt',j.external_due_at) ORDER BY j.created_at DESC),'[]'::jsonb) FROM public.practice_engagements j WHERE j.client_id=_client AND j.tenant_id=membership.tenant_id AND j.product_key=membership.product_key),
  'requests',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'engagementId',r.engagement_id,'title',r.title,'status',r.status,'dueAt',r.due_at,'response',r.response,'submittedAt',r.submitted_at) ORDER BY r.created_at DESC),'[]'::jsonb) FROM public.practice_work_requests r WHERE r.client_id=_client AND r.tenant_id=membership.tenant_id AND r.product_key=membership.product_key),
  'proposals',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'totalMinor',p.total_minor,'currency',p.currency,'terms',p.terms,'expiresAt',p.expires_at,'status',p.status,'issuedAt',p.issued_at,'acceptedAt',p.accepted_at) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.practice_proposals p WHERE p.client_id=_client AND p.tenant_id=membership.tenant_id AND p.product_key=membership.product_key AND p.status<>'draft')
 );
END; $$;
REVOKE ALL ON FUNCTION public.practice_portal_workspace(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_portal_workspace(uuid,text,uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.run_practice_automation(_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE schedule public.practice_recurring_work; tmpl public.practice_service_templates; req public.practice_work_requests;
 job_id uuid; month_start date; jobs integer:=0; reminders integer:=0;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN RAISE EXCEPTION 'Service role required'; END IF;
 FOR schedule IN
  SELECT w.* FROM public.practice_recurring_work w
  JOIN public.tenant_products p ON p.tenant_id=w.tenant_id AND p.product_key=w.product_key AND p.status='active'
  JOIN public.tenant_services e ON e.tenant_id=w.tenant_id AND e.service_key='omniqora.practice'
    AND e.status IN ('active','trial') AND (e.valid_until IS NULL OR e.valid_until>now())
  WHERE w.enabled AND w.next_on<=current_date ORDER BY w.next_on
  LIMIT greatest(1,least(_limit,100)) FOR UPDATE OF w SKIP LOCKED
 LOOP
  SELECT * INTO tmpl FROM public.practice_service_templates WHERE id=schedule.template_id AND tenant_id=schedule.tenant_id AND product_key=schedule.product_key AND status='active';
  IF tmpl.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.practice_clients WHERE id=schedule.client_id AND status<>'closed') THEN CONTINUE; END IF;
  INSERT INTO public.practice_engagements(tenant_id,product_key,client_id,template_id,service_key,period_key,status,external_due_at,internal_due_at,template_snapshot)
  VALUES(schedule.tenant_id,schedule.product_key,schedule.client_id,tmpl.id,tmpl.service_key,schedule.next_on::text,'collecting',
   ((schedule.next_on+schedule.external_days)::timestamp+interval '12 hours') AT TIME ZONE 'UTC',
   ((schedule.next_on+schedule.internal_days)::timestamp+interval '12 hours') AT TIME ZONE 'UTC',to_jsonb(tmpl))
  ON CONFLICT(tenant_id,product_key,client_id,template_id,period_key) WHERE template_id IS NOT NULL DO NOTHING
  RETURNING id INTO job_id;
  IF job_id IS NOT NULL THEN
   INSERT INTO public.practice_job_phases(tenant_id,product_key,engagement_id,position,title,budget_minutes)
   SELECT schedule.tenant_id,schedule.product_key,job_id,(ordinality-1)::integer,value->>'title',(value->>'budgetMinutes')::integer
   FROM jsonb_array_elements(tmpl.phases) WITH ORDINALITY;
   jobs:=jobs+1;
  END IF;
  month_start:=(date_trunc('month',schedule.next_on)+make_interval(months=>schedule.interval_months))::date;
  UPDATE public.practice_recurring_work SET next_on=month_start+least(schedule.anchor_day,extract(day from month_start+interval '1 month - 1 day')::integer)-1,updated_at=now() WHERE id=schedule.id;
 END LOOP;

 FOR req IN
  SELECT q.* FROM public.practice_work_requests q
  JOIN public.practice_engagements j ON j.id=q.engagement_id
  JOIN public.tenant_products p ON p.tenant_id=q.tenant_id AND p.product_key=q.product_key AND p.status='active'
  JOIN public.tenant_services e ON e.tenant_id=q.tenant_id AND e.service_key='omniqora.practice'
    AND e.status IN ('active','trial') AND (e.valid_until IS NULL OR e.valid_until>now())
  WHERE q.chase_enabled AND q.status='outstanding' AND q.due_at<=now() AND q.chase_count<3
    AND (q.last_chased_at IS NULL OR q.last_chased_at<=now()-interval '3 days')
    AND j.status NOT IN ('completed','cancelled')
  ORDER BY q.due_at LIMIT greatest(1,least(_limit,100)) FOR UPDATE OF q SKIP LOCKED
 LOOP
  INSERT INTO public.platform_events(
   tenant_id,product_key,event_type,event_version,occurred_at,source_service,subject_type,subject_id,
   correlation_id,idempotency_key,data_classification,payload
  ) VALUES(
   req.tenant_id,req.product_key,'practice.request.reminder_due',1,now(),'omniqora.practice',
   'practice_request',req.id::text,req.id::text,
   'practice-reminder:'||req.id::text||':'||(req.chase_count+1)::text,'internal',
   jsonb_build_object('requestId',req.id,'clientId',req.client_id,'engagementId',req.engagement_id,'attempt',req.chase_count+1,'requiresOutstandingRecheck',true)
  ) ON CONFLICT(tenant_id,product_key,idempotency_key) DO NOTHING;
  UPDATE public.practice_work_requests SET last_chased_at=now(),chase_count=chase_count+1 WHERE id=req.id;
  reminders:=reminders+1;
 END LOOP;
 RETURN jsonb_build_object('jobsCreated',jobs,'reminderEventsQueued',reminders);
END; $$;
REVOKE ALL ON FUNCTION public.run_practice_automation(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_practice_automation(integer) TO service_role;

COMMIT;
