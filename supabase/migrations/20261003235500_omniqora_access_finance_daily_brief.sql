BEGIN;

-- Final 40-day reconciliation: fine-grained resource access, embedded finance,
-- and the "Welcome to your day" operating brief.

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.access-control','Fine-grained Access Control','Reusable department/team/resource ACLs layered over tenant RLS.','identity','omniqora',false,'automatic','active','built_main'),
 ('omniqora.embedded-finance','Embedded Finance','Provider-neutral merchant onboarding, business accounts, tokenised cards/beneficiaries and approved transfers.','payments','omniqora',true,'external','active','built_main'),
 ('omniqora.daily-brief','Daily Executive Brief','Welcome-to-your-day briefing across tasks, approvals, blockers, deadlines and AI proposals.','analytics','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,family=EXCLUDED.family,
 owner_product_key=EXCLUDED.owner_product_key,billable=EXCLUDED.billable,
 provisioning_mode=EXCLUDED.provisioning_mode,status=EXCLUDED.status,
 implementation_status=EXCLUDED.implementation_status,updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.access-control','omniqora.identity'),
 ('omniqora.embedded-finance','omniqora.payments'),
 ('omniqora.embedded-finance','omniqora.identity'),
 ('omniqora.daily-brief','omniqora.analytics'),
 ('omniqora.daily-brief','omniqora.crm')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required)
SELECT 'omniqora',x.service_key,x.default_enabled,false
FROM (VALUES
 ('omniqora.access-control',true),
 ('omniqora.embedded-finance',false),
 ('omniqora.daily-brief',true)
) AS x(service_key,default_enabled)
WHERE EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key='omniqora')
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=EXCLUDED.default_enabled;

-- ---------------------------------------------------------------------------
-- Fine-grained access teams and resource ACLs.
-- Absence of an ACL remains backward-compatible tenant-wide access.
-- Once any active ACL exists for a resource, only explicit matching allows
-- survive, with deny taking precedence.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.access_teams(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 team_key text NOT NULL,
 name text NOT NULL,
 team_type text NOT NULL DEFAULT 'department' CHECK(team_type IN('department','project','business_unit','location','custom')),
 parent_team_id uuid REFERENCES public.access_teams(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive','retired')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,team_key)
);

CREATE TABLE IF NOT EXISTS public.access_team_members(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 team_id uuid NOT NULL REFERENCES public.access_teams(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 team_role text NOT NULL DEFAULT 'member' CHECK(team_role IN('owner','manager','member','viewer')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','inactive')),
 added_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(team_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.resource_access_rules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 resource_type text NOT NULL,
 resource_id text NOT NULL,
 principal_type text NOT NULL CHECK(principal_type IN('user','role','team')),
 principal_ref text NOT NULL,
 permission text NOT NULL CHECK(permission IN('read','write','approve','admin')),
 effect text NOT NULL DEFAULT 'allow' CHECK(effect IN('allow','deny')),
 expires_at timestamptz,
 reason text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,resource_type,resource_id,principal_type,principal_ref,permission,effect)
);
CREATE INDEX IF NOT EXISTS resource_access_lookup_idx
 ON public.resource_access_rules(tenant_id,resource_type,resource_id,effect,permission);

ALTER TABLE public.access_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_access_rules ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.access_teams,public.access_team_members,public.resource_access_rules TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.access_teams,public.access_team_members,public.resource_access_rules TO authenticated;
CREATE POLICY "access team tenant read" ON public.access_teams FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "access team admin write" ON public.access_teams FOR ALL TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "access member tenant read" ON public.access_team_members FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "access member admin write" ON public.access_team_members FOR ALL TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "resource acl tenant read" ON public.resource_access_rules FOR SELECT TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "resource acl admin write" ON public.resource_access_rules FOR ALL TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE OR REPLACE FUNCTION public.resource_access_allowed(
 _tenant uuid,_resource_type text,_resource_id text,_user uuid,_permission text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE user_role text;has_rules boolean;denied boolean;allowed boolean;
BEGIN
 IF _user IS NULL THEN RETURN false; END IF;
 IF public.is_platform_admin(_user) THEN RETURN true; END IF;
 IF NOT public.is_tenant_member(_tenant,_user) THEN RETURN false; END IF;
 SELECT role::text INTO user_role FROM public.tenant_members
 WHERE tenant_id=_tenant AND user_id=_user;

 SELECT EXISTS(
  SELECT 1 FROM public.resource_access_rules r
  WHERE r.tenant_id=_tenant AND r.resource_type=_resource_type AND r.resource_id=_resource_id
    AND (r.expires_at IS NULL OR r.expires_at>now())
 ) INTO has_rules;
 IF NOT has_rules THEN RETURN true; END IF;

 SELECT EXISTS(
  SELECT 1
  FROM public.resource_access_rules r
  WHERE r.tenant_id=_tenant AND r.resource_type=_resource_type AND r.resource_id=_resource_id
    AND r.effect='deny' AND (r.expires_at IS NULL OR r.expires_at>now())
    AND (
      (r.principal_type='user' AND r.principal_ref=_user::text)
      OR (r.principal_type='role' AND r.principal_ref=user_role)
      OR (r.principal_type='team' AND EXISTS(
        SELECT 1 FROM public.access_team_members tm
        WHERE tm.tenant_id=_tenant AND tm.user_id=_user AND tm.status='active' AND tm.team_id::text=r.principal_ref
      ))
    )
    AND (
      r.permission='admin'
      OR r.permission=_permission
      OR (_permission='read' AND r.permission IN('write','approve'))
    )
 ) INTO denied;
 IF denied THEN RETURN false; END IF;

 SELECT EXISTS(
  SELECT 1
  FROM public.resource_access_rules r
  WHERE r.tenant_id=_tenant AND r.resource_type=_resource_type AND r.resource_id=_resource_id
    AND r.effect='allow' AND (r.expires_at IS NULL OR r.expires_at>now())
    AND (
      (r.principal_type='user' AND r.principal_ref=_user::text)
      OR (r.principal_type='role' AND r.principal_ref=user_role)
      OR (r.principal_type='team' AND EXISTS(
        SELECT 1 FROM public.access_team_members tm
        WHERE tm.tenant_id=_tenant AND tm.user_id=_user AND tm.status='active' AND tm.team_id::text=r.principal_ref
      ))
    )
    AND (
      r.permission='admin'
      OR r.permission=_permission
      OR (_permission='read' AND r.permission IN('write','approve'))
    )
 ) INTO allowed;
 RETURN allowed;
END $$;
REVOKE ALL ON FUNCTION public.resource_access_allowed(uuid,text,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.resource_access_allowed(uuid,text,text,uuid,text) TO authenticated,service_role;

DROP POLICY IF EXISTS "document acl restrictive read" ON public.document_records;
CREATE POLICY "document acl restrictive read" ON public.document_records AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.resource_access_allowed(tenant_id,'document',id::text,auth.uid(),'read'));
DROP POLICY IF EXISTS "document acl restrictive update" ON public.document_records;
CREATE POLICY "document acl restrictive update" ON public.document_records AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.resource_access_allowed(tenant_id,'document',id::text,auth.uid(),'write'))
 WITH CHECK(public.resource_access_allowed(tenant_id,'document',id::text,auth.uid(),'write'));
DROP POLICY IF EXISTS "document acl restrictive delete" ON public.document_records;
CREATE POLICY "document acl restrictive delete" ON public.document_records AS RESTRICTIVE FOR DELETE TO authenticated
 USING(public.resource_access_allowed(tenant_id,'document',id::text,auth.uid(),'write'));

DROP POLICY IF EXISTS "document version acl restrictive read" ON public.document_versions;
CREATE POLICY "document version acl restrictive read" ON public.document_versions AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.resource_access_allowed(tenant_id,'document',document_id::text,auth.uid(),'read'));
DROP POLICY IF EXISTS "document version acl restrictive update" ON public.document_versions;
CREATE POLICY "document version acl restrictive update" ON public.document_versions AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.resource_access_allowed(tenant_id,'document',document_id::text,auth.uid(),'write'))
 WITH CHECK(public.resource_access_allowed(tenant_id,'document',document_id::text,auth.uid(),'write'));
DROP POLICY IF EXISTS "document version acl restrictive delete" ON public.document_versions;
CREATE POLICY "document version acl restrictive delete" ON public.document_versions AS RESTRICTIVE FOR DELETE TO authenticated
 USING(public.resource_access_allowed(tenant_id,'document',document_id::text,auth.uid(),'write'));

DROP POLICY IF EXISTS "search document acl restrictive read" ON public.search_documents;
CREATE POLICY "search document acl restrictive read" ON public.search_documents AS RESTRICTIVE FOR SELECT TO authenticated
 USING(
  entity_type NOT IN('document','document_record')
  OR public.resource_access_allowed(tenant_id,'document',entity_id,auth.uid(),'read')
 );

-- ---------------------------------------------------------------------------
-- Embedded finance: provider-neutral control records. No raw PAN/account
-- credentials are stored; external provider references stay tokenised.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.embedded_finance_profiles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 crm_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
 vendor_ref text,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 external_holder_ref text,
 legal_entity_ref text,
 capabilities text[] NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','submitted','review','active','restricted','suspended','closed','rejected')),
 requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.embedded_finance_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.embedded_finance_profiles(id) ON DELETE CASCADE,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 external_account_ref text,
 account_type text NOT NULL DEFAULT 'balance'
   CHECK(account_type IN('balance','current','settlement','reserve')),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 iban_masked text,
 status text NOT NULL DEFAULT 'requested'
   CHECK(status IN('requested','opening','active','restricted','suspended','closed','failed')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.embedded_finance_cards(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.embedded_finance_profiles(id) ON DELETE CASCADE,
 account_id uuid REFERENCES public.embedded_finance_accounts(id) ON DELETE SET NULL,
 holder_ref text NOT NULL,
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 external_card_ref text,
 card_type text NOT NULL CHECK(card_type IN('physical','virtual')),
 last4 text CHECK(last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
 spend_controls jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'requested'
   CHECK(status IN('requested','issuing','active','frozen','cancelled','expired','failed')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.embedded_finance_beneficiaries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.embedded_finance_profiles(id) ON DELETE CASCADE,
 beneficiary_ref text NOT NULL,
 name text NOT NULL,
 beneficiary_type text NOT NULL DEFAULT 'supplier' CHECK(beneficiary_type IN('supplier','employee','merchant','bank_account','other')),
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 external_beneficiary_ref text,
 destination_masked text,
 status text NOT NULL DEFAULT 'review' CHECK(status IN('draft','review','approved','rejected','disabled')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(tenant_id,profile_id,beneficiary_ref)
);

CREATE TABLE IF NOT EXISTS public.embedded_finance_transfers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.embedded_finance_profiles(id) ON DELETE CASCADE,
 source_account_id uuid REFERENCES public.embedded_finance_accounts(id) ON DELETE SET NULL,
 beneficiary_id uuid NOT NULL REFERENCES public.embedded_finance_beneficiaries(id) ON DELETE RESTRICT,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 purpose text,
 idempotency_key text NOT NULL,
 status text NOT NULL DEFAULT 'draft'
   CHECK(status IN('draft','review','approved','submitted','processing','completed','failed','cancelled','reversed')),
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 provider_ref text,
 failure_reason text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'embedded_finance_profiles','embedded_finance_accounts','embedded_finance_cards',
  'embedded_finance_beneficiaries','embedded_finance_transfers'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
   'embedded finance tenant read '||t,t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))',
   'embedded finance tenant write '||t,t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.embedded_finance_approve_transfer(_transfer uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE t public.embedded_finance_transfers%rowtype;
BEGIN
 SELECT * INTO t FROM public.embedded_finance_transfers WHERE id=_transfer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid())
    AND NOT public.has_tenant_role(t.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Transfer approval denied';
 END IF;
 IF t.status NOT IN('draft','review') THEN RAISE EXCEPTION 'Transfer is not reviewable'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.embedded_finance_beneficiaries b
  WHERE b.id=t.beneficiary_id AND b.tenant_id=t.tenant_id AND b.status='approved'
 ) THEN RAISE EXCEPTION 'Approved beneficiary required'; END IF;
 UPDATE public.embedded_finance_transfers
 SET status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now()
 WHERE id=t.id;
END $$;
REVOKE ALL ON FUNCTION public.embedded_finance_approve_transfer(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.embedded_finance_approve_transfer(uuid) TO authenticated,service_role;

-- ---------------------------------------------------------------------------
-- "Welcome to your day": deterministic operating brief built from governed
-- records. Calendar/meeting items can be injected by approved connectors.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_brief_profiles(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 timezone text NOT NULL DEFAULT 'Europe/London',
 sections text[] NOT NULL DEFAULT ARRAY['tasks','approvals','blockers','deadlines','meetings','kpis','suggestions'],
 delivery_channels text[] NOT NULL DEFAULT ARRAY['in_app'],
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id,product_key)
);

CREATE TABLE IF NOT EXISTS public.daily_brief_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 brief_date date NOT NULL DEFAULT current_date,
 status text NOT NULL DEFAULT 'building' CHECK(status IN('building','ready','delivered','failed')),
 summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS daily_brief_user_date_idx
 ON public.daily_brief_runs(tenant_id,user_id,brief_date DESC);

CREATE TABLE IF NOT EXISTS public.daily_brief_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES public.daily_brief_runs(id) ON DELETE CASCADE,
 category text NOT NULL CHECK(category IN('task','approval','blocker','deadline','meeting','kpi','alert','suggestion')),
 source_type text,
 source_id text,
 title text NOT NULL,
 detail text,
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
 due_at timestamptz,
 action_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['daily_brief_profiles','daily_brief_runs','daily_brief_items'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
   'daily brief tenant read '||t,t);
  EXECUTE format(
   'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))',
   'daily brief tenant write '||t,t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.daily_brief_generate(_tenant uuid,_product text,_user uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE rid uuid:=gen_random_uuid();n_tasks integer:=0;n_approvals integer:=0;n_blockers integer:=0;n_deadlines integer:=0;caller uuid:=auth.uid();
BEGIN
 IF _user IS NULL OR (
   NOT public.is_platform_admin(_user)
   AND NOT public.is_tenant_member(_tenant,_user)
 ) THEN RAISE EXCEPTION 'Daily brief target denied'; END IF;
 IF caller IS NOT NULL
    AND caller<>_user
    AND NOT public.is_platform_admin(caller)
    AND NOT public.has_tenant_role(_tenant,caller,ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Daily brief access denied';
 END IF;

 INSERT INTO public.daily_brief_runs(id,tenant_id,product_key,user_id,brief_date,status)
 VALUES(rid,_tenant,_product,_user,current_date,'building');

 INSERT INTO public.daily_brief_items(tenant_id,run_id,category,source_type,source_id,title,detail,priority,due_at,action_ref)
 SELECT _tenant,rid,'task','crm_task',t.id::text,t.title,t.description,t.priority,t.due_at,'/app/crm'
 FROM public.crm_tasks t
 WHERE t.tenant_id=_tenant AND t.status IN('open','in_progress')
   AND (t.assignee_user_id IS NULL OR t.assignee_user_id=_user)
   AND (t.due_at IS NULL OR t.due_at<now()+interval '2 days')
 ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,t.due_at NULLS LAST
 LIMIT 50;
 GET DIAGNOSTICS n_tasks=ROW_COUNT;

 INSERT INTO public.daily_brief_items(tenant_id,run_id,category,source_type,source_id,title,detail,priority,due_at,action_ref)
 SELECT _tenant,rid,'approval','automation_approval',a.id::text,a.title,a.decision_note,'high',a.expires_at,'/app/workflows'
 FROM public.automation_approvals a
 WHERE a.tenant_id=_tenant AND a.status='pending'
 ORDER BY a.expires_at NULLS LAST,a.created_at
 LIMIT 30;
 GET DIAGNOSTICS n_approvals=ROW_COUNT;

 INSERT INTO public.daily_brief_items(tenant_id,run_id,category,source_type,source_id,title,detail,priority,action_ref)
 SELECT _tenant,rid,'approval','ai_action',p.id::text,'AI action: '||p.action_key,p.rationale,'high','/app/intelligence'
 FROM public.ai_action_proposals p
 WHERE p.tenant_id=_tenant AND p.status='pending'
   AND (_product IS NULL OR p.product_key=_product)
 ORDER BY p.created_at
 LIMIT 30;
 GET DIAGNOSTICS n_approvals=n_approvals+ROW_COUNT;

 INSERT INTO public.daily_brief_items(tenant_id,run_id,category,source_type,source_id,title,detail,priority,due_at,action_ref)
 SELECT _tenant,rid,'blocker','support_ticket',s.id::text,s.subject,s.description,s.priority,s.sla_due_at,'/app/utilities'
 FROM public.support_tickets s
 WHERE s.tenant_id=_tenant AND s.status IN('open','pending')
   AND s.priority IN('high','urgent')
   AND (s.assigned_user_id IS NULL OR s.assigned_user_id=_user)
 ORDER BY CASE s.priority WHEN 'urgent' THEN 0 ELSE 1 END,s.sla_due_at NULLS LAST
 LIMIT 30;
 GET DIAGNOSTICS n_blockers=ROW_COUNT;

 INSERT INTO public.daily_brief_items(tenant_id,run_id,category,source_type,source_id,title,detail,priority,due_at,action_ref)
 SELECT _tenant,rid,'deadline','practice_deadline',d.id::text,
        'Deadline: '||d.deadline_type,d.authority_ref,'high',d.due_at,'/app/finance-ai'
 FROM public.practice_deadlines d
 WHERE d.tenant_id=_tenant AND d.status IN('due','in_progress','overdue')
   AND (_product IS NULL OR d.product_key=_product)
   AND d.due_at<now()+interval '7 days'
 ORDER BY d.due_at
 LIMIT 30;
 GET DIAGNOSTICS n_deadlines=ROW_COUNT;

 UPDATE public.daily_brief_runs
 SET status='ready',summary=jsonb_build_object(
  'tasks',n_tasks,'approvals',n_approvals,'blockers',n_blockers,'deadlines',n_deadlines,
  'generatedAt',now()
 )
 WHERE id=rid;
 RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.daily_brief_generate(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.daily_brief_generate(uuid,text,uuid) TO authenticated,service_role;

-- Mutation hardening: UI checks are not the security boundary.
DROP POLICY IF EXISTS "billing subscription admin insert" ON public.billing_subscriptions;
CREATE POLICY "billing subscription admin insert" ON public.billing_subscriptions AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "billing subscription admin update" ON public.billing_subscriptions;
CREATE POLICY "billing subscription admin update" ON public.billing_subscriptions AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()))
 WITH CHECK(public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "billing subscription admin delete" ON public.billing_subscriptions;
CREATE POLICY "billing subscription admin delete" ON public.billing_subscriptions AS RESTRICTIVE FOR DELETE TO authenticated
 USING(public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "billing addon subscription admin insert" ON public.billing_addon_subscriptions;
CREATE POLICY "billing addon subscription admin insert" ON public.billing_addon_subscriptions AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "billing addon subscription admin update" ON public.billing_addon_subscriptions;
CREATE POLICY "billing addon subscription admin update" ON public.billing_addon_subscriptions AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()))
 WITH CHECK(public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "billing addon subscription admin delete" ON public.billing_addon_subscriptions;
CREATE POLICY "billing addon subscription admin delete" ON public.billing_addon_subscriptions AS RESTRICTIVE FOR DELETE TO authenticated
 USING(public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "finance beneficiary admin update" ON public.embedded_finance_beneficiaries;
CREATE POLICY "finance beneficiary admin update" ON public.embedded_finance_beneficiaries AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "finance transfer admin update" ON public.embedded_finance_transfers;
CREATE POLICY "finance transfer admin update" ON public.embedded_finance_transfers AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "contact centre admin insert" ON public.contact_centres;
CREATE POLICY "contact centre admin insert" ON public.contact_centres AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "contact centre admin update" ON public.contact_centres;
CREATE POLICY "contact centre admin update" ON public.contact_centres AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "contact centre admin delete" ON public.contact_centres;
CREATE POLICY "contact centre admin delete" ON public.contact_centres AS RESTRICTIVE FOR DELETE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "contact queue admin insert" ON public.contact_queues;
CREATE POLICY "contact queue admin insert" ON public.contact_queues AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "contact queue admin update" ON public.contact_queues;
CREATE POLICY "contact queue admin update" ON public.contact_queues AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "contact queue admin delete" ON public.contact_queues;
CREATE POLICY "contact queue admin delete" ON public.contact_queues AS RESTRICTIVE FOR DELETE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "experiment admin update" ON public.growth_experiments;
CREATE POLICY "experiment admin update" ON public.growth_experiments AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "daily brief profile self read" ON public.daily_brief_profiles;
CREATE POLICY "daily brief profile self read" ON public.daily_brief_profiles AS RESTRICTIVE FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "daily brief profile self write" ON public.daily_brief_profiles;
CREATE POLICY "daily brief profile self write" ON public.daily_brief_profiles AS RESTRICTIVE FOR ALL TO authenticated
 USING(user_id=auth.uid() OR public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(user_id=auth.uid() OR public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "daily brief run private read" ON public.daily_brief_runs;
CREATE POLICY "daily brief run private read" ON public.daily_brief_runs AS RESTRICTIVE FOR SELECT TO authenticated
 USING(user_id=auth.uid() OR public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));
DROP POLICY IF EXISTS "daily brief item private read" ON public.daily_brief_items;
CREATE POLICY "daily brief item private read" ON public.daily_brief_items AS RESTRICTIVE FOR SELECT TO authenticated
 USING(EXISTS(
  SELECT 1 FROM public.daily_brief_runs r
  WHERE r.id=daily_brief_items.run_id AND r.tenant_id=daily_brief_items.tenant_id
    AND (r.user_id=auth.uid() OR public.is_platform_admin(auth.uid()) OR public.has_tenant_role(r.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 ));
REVOKE INSERT,UPDATE,DELETE ON public.daily_brief_runs,public.daily_brief_items FROM authenticated;

COMMIT;
