BEGIN;

CREATE TABLE IF NOT EXISTS public.automation_workflows(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 name text NOT NULL,
 description text,
 trigger_event text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','archived')),
 active_version integer NOT NULL DEFAULT 1,
 definition jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.automation_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
 event_id uuid REFERENCES public.platform_events(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','waiting','approval','completed','failed','cancelled')),
 current_node_id text,
 context jsonb NOT NULL DEFAULT '{}'::jsonb,
 error text,
 started_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS automation_runs_queue_idx ON public.automation_runs(status,created_at);

CREATE TABLE IF NOT EXISTS public.automation_approvals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
 node_id text NOT NULL,
 title text NOT NULL,
 requested_from_role text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','expired','cancelled')),
 decision_note text,
 decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 decided_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 subject_type text,
 subject_id text,
 document_type text NOT NULL,
 title text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','archived','deleted')),
 current_version integer NOT NULL DEFAULT 1,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.document_versions(
 document_id uuid NOT NULL REFERENCES public.document_records(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>0),
 storage_ref text NOT NULL,
 mime_type text,
 size_bytes bigint CHECK(size_bytes IS NULL OR size_bytes>=0),
 checksum_sha256 text,
 extracted_text text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,version)
);

CREATE TABLE IF NOT EXISTS public.form_definitions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 form_key text NOT NULL,
 name text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','retired')),
 active_version integer NOT NULL DEFAULT 1,
 schema jsonb NOT NULL DEFAULT '{"fields":[],"sections":[]}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,form_key)
);
CREATE TABLE IF NOT EXISTS public.form_submissions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 definition_id uuid NOT NULL REFERENCES public.form_definitions(id) ON DELETE RESTRICT,
 form_version integer NOT NULL,
 subject_type text,
 subject_id text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','review','accepted','rejected')),
 answers jsonb NOT NULL DEFAULT '{}'::jsonb,
 submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 submitted_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_tickets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 subject text NOT NULL,
 description text,
 channel text NOT NULL DEFAULT 'internal' CHECK(channel IN('internal','email','whatsapp','sms','voice','web')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN('low','normal','high','urgent')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','pending','waiting_customer','resolved','closed')),
 assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 sla_due_at timestamptz,
 resolved_at timestamptz,
 source_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx ON public.support_tickets(tenant_id,status,priority,sla_due_at);

CREATE TABLE IF NOT EXISTS public.notification_preferences(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN('email','sms','whatsapp','push')),
 purpose text NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 quiet_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,person_id,channel,purpose)
);
CREATE TABLE IF NOT EXISTS public.notification_outbox(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 channel text NOT NULL CHECK(channel IN('email','sms','whatsapp','push')),
 purpose text NOT NULL,
 template_key text,
 recipient jsonb NOT NULL DEFAULT '{}'::jsonb,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 idempotency_key text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','processing','sent','delivered','failed','cancelled','suppressed')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 last_error text,
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS notification_outbox_queue_idx ON public.notification_outbox(status,available_at,created_at);

CREATE TABLE IF NOT EXISTS public.search_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 title text NOT NULL,
 body text NOT NULL DEFAULT '',
 keywords text[] NOT NULL DEFAULT '{}',
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS search_documents_lookup_idx ON public.search_documents(tenant_id,entity_type,updated_at DESC);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'automation_workflows','automation_runs','automation_approvals',
  'document_records','document_versions','form_definitions','form_submissions',
  'support_tickets','notification_preferences','notification_outbox','search_documents'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','utility tenant read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','utility tenant write',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.automation_enqueue_for_event(_event uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.platform_events%rowtype; w record; n integer:=0;
BEGIN
 SELECT * INTO e FROM public.platform_events WHERE id=_event;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event not found'; END IF;
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    AND NOT public.can_write(e.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN
   RAISE EXCEPTION 'Automation access denied';
 END IF;
 FOR w IN
   SELECT * FROM public.automation_workflows
   WHERE tenant_id=e.tenant_id AND status='active'
     AND (product_key IS NULL OR product_key=e.product_key)
     AND trigger_event=e.event_type
 LOOP
   INSERT INTO public.automation_runs(tenant_id,workflow_id,event_id,status,context)
   VALUES(e.tenant_id,w.id,e.id,'queued',jsonb_build_object('event',e.payload,'eventType',e.event_type,'subjectType',e.subject_type,'subjectId',e.subject_id));
   n:=n+1;
 END LOOP;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.automation_enqueue_for_event(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.automation_enqueue_for_event(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.notification_enqueue(
 _tenant uuid,_product text,_person uuid,_channel text,_purpose text,_template text,_recipient jsonb,_payload jsonb,_idempotency text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; allowed boolean:=true;
BEGIN
 IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    AND NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN
   RAISE EXCEPTION 'Notification access denied';
 END IF;
 IF _person IS NOT NULL THEN
   SELECT COALESCE((SELECT enabled FROM public.notification_preferences
     WHERE tenant_id=_tenant AND person_id=_person AND channel=_channel AND purpose=_purpose),true) INTO allowed;
 END IF;
 INSERT INTO public.notification_outbox(tenant_id,product_key,person_id,channel,purpose,template_key,recipient,payload,idempotency_key,status)
 VALUES(_tenant,_product,_person,_channel,_purpose,_template,COALESCE(_recipient,'{}'::jsonb),COALESCE(_payload,'{}'::jsonb),_idempotency,CASE WHEN allowed THEN 'queued' ELSE 'suppressed' END)
 ON CONFLICT(tenant_id,idempotency_key) DO UPDATE SET payload=EXCLUDED.payload
 RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.notification_enqueue(uuid,text,uuid,text,text,text,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.notification_enqueue(uuid,text,uuid,text,text,text,jsonb,jsonb,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.search_tenant(_tenant uuid,_query text,_limit integer DEFAULT 50)
RETURNS TABLE(entity_type text,entity_id text,title text,excerpt text,rank integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT d.entity_type,d.entity_id,d.title,left(d.body,240),
   (CASE WHEN lower(d.title) LIKE '%'||lower(_query)||'%' THEN 3 ELSE 0 END +
    CASE WHEN lower(d.body) LIKE '%'||lower(_query)||'%' THEN 1 ELSE 0 END)::integer AS rank
 FROM public.search_documents d
 WHERE d.tenant_id=_tenant
   AND (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(_tenant,auth.uid()))
   AND (lower(d.title) LIKE '%'||lower(_query)||'%' OR lower(d.body) LIKE '%'||lower(_query)||'%' OR EXISTS(SELECT 1 FROM unnest(d.keywords) k WHERE lower(k) LIKE '%'||lower(_query)||'%'))
 ORDER BY rank DESC,d.updated_at DESC
 LIMIT GREATEST(1,LEAST(_limit,100))
$$;
REVOKE ALL ON FUNCTION public.search_tenant(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_tenant(uuid,text,integer) TO authenticated,service_role;

INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status) VALUES
 ('omniqora.automation','Automation','Event-triggered workflows, durable runs and approvals.','platform','omniqora',true,'automatic','active','built_main'),
 ('omniqora.documents','Documents','Shared document metadata, versions and evidence links.','platform','omniqora',true,'automatic','active','built_main'),
 ('omniqora.forms','Forms','Shared form definitions, submissions and review states.','platform','omniqora',true,'automatic','active','built_main'),
 ('omniqora.search','Global Search','Tenant-safe cross-product search projection.','platform','omniqora',true,'automatic','active','built_main'),
 ('omniqora.support','Support & SLA','Shared helpdesk, assignment and SLA tracking.','platform','omniqora',true,'automatic','active','built_main'),
 ('omniqora.notifications','Notifications','Shared notification preferences and delivery outbox.','communications','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET implementation_status='built_main',updated_at=now();

COMMIT;