-- Shared Documents, Support, Notifications and tenant-safe Search engines.
BEGIN;

INSERT INTO public.platform_modules(module_key,name,module_kind,version,status,ui_mode,dependencies,capabilities) VALUES
 ('documents.core','Omniqora Documents','documents','1.0.0-preview','preview','hybrid',
  ARRAY['platform.tenant','platform.audit'],
  ARRAY['library','versions','links','templates','generation','signatures','evidence_packs','retention']),
 ('support.core','Omniqora Support','support','1.0.0-preview','preview','hybrid',
  ARRAY['crm.core','connect.core','notifications.core','platform.audit'],
  ARRAY['tickets','queues','sla','assignment','escalation','knowledge','satisfaction','ai_assist']),
 ('notifications.core','Omniqora Notifications','notifications','1.0.0-preview','preview','hybrid',
  ARRAY['platform.tenant','connect.core','platform.events'],
  ARRAY['inbox','preferences','in_app','email','sms','whatsapp','push','digest']),
 ('search.core','Omniqora Search','search','1.0.0-preview','preview','hybrid',
  ARRAY['platform.tenant','platform.events'],
  ARRAY['global','full_text','filters','semantic','recent'])
ON CONFLICT(module_key) DO UPDATE SET
 name=EXCLUDED.name,module_kind=EXCLUDED.module_kind,version=EXCLUDED.version,status=EXCLUDED.status,
 ui_mode=EXCLUDED.ui_mode,dependencies=EXCLUDED.dependencies,capabilities=EXCLUDED.capabilities,updated_at=now();

CREATE TABLE IF NOT EXISTS public.platform_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 document_key text,
 title text NOT NULL,
 document_type text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','superseded','archived','deleted')),
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 locale text,
 tags text[] NOT NULL DEFAULT '{}',
 current_version integer NOT NULL DEFAULT 0 CHECK(current_version>=0),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_documents_key_uq
 ON public.platform_documents(
  tenant_id,
  COALESCE(tenant_product_id,'00000000-0000-0000-0000-000000000000'::uuid),
  document_key
 ) WHERE document_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_documents_lookup_idx
 ON public.platform_documents(tenant_id,tenant_product_id,status,document_type,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.platform_document_versions(
 document_id uuid NOT NULL REFERENCES public.platform_documents(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 version integer NOT NULL CHECK(version>0),
 storage_ref text NOT NULL,
 file_name text NOT NULL,
 mime_type text NOT NULL,
 size_bytes bigint NOT NULL CHECK(size_bytes>=0),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 source text NOT NULL CHECK(source IN ('upload','generated','import','provider')),
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_document_versions_storage_uq
 ON public.platform_document_versions(tenant_id,storage_ref);

CREATE TABLE IF NOT EXISTS public.platform_document_links(
 document_id uuid NOT NULL REFERENCES public.platform_documents(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 relationship text NOT NULL DEFAULT 'attachment',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(document_id,entity_type,entity_id,relationship)
);
CREATE INDEX IF NOT EXISTS platform_document_links_entity_idx
 ON public.platform_document_links(tenant_id,entity_type,entity_id);

CREATE TABLE IF NOT EXISTS public.platform_document_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.platform_products(product_key) ON DELETE CASCADE,
 template_key text NOT NULL,
 name text NOT NULL,
 locale text NOT NULL,
 document_type text NOT NULL,
 body_ref text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','retired')),
 variables text[] NOT NULL DEFAULT '{}',
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_document_templates_version_uq
 ON public.platform_document_templates(
  COALESCE(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(product_key,''),template_key,locale,version
 );

CREATE TABLE IF NOT EXISTS public.support_queues(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 name text NOT NULL,
 email_alias text,
 default_priority text NOT NULL DEFAULT 'normal' CHECK(default_priority IN ('low','normal','high','urgent')),
 active boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_sla_policies(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 name text NOT NULL,
 priority text NOT NULL CHECK(priority IN ('low','normal','high','urgent')),
 first_response_minutes integer NOT NULL CHECK(first_response_minutes>0),
 resolution_minutes integer NOT NULL CHECK(resolution_minutes>0),
 business_hours_key text,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_sla_policy_lookup_idx
 ON public.support_sla_policies(tenant_id,tenant_product_id,priority,active);

CREATE TABLE IF NOT EXISTS public.support_ticket_metadata(
 case_id uuid PRIMARY KEY REFERENCES public.cases(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 queue_id uuid REFERENCES public.support_queues(id) ON DELETE SET NULL,
 category text,
 channel text NOT NULL DEFAULT 'internal'
  CHECK(channel IN ('whatsapp','sms','email','voice','web','app','api','internal')),
 customer_ref text,
 first_response_due_at timestamptz,
 resolution_due_at timestamptz,
 first_responded_at timestamptz,
 resolved_at timestamptz,
 sla_breached boolean NOT NULL DEFAULT false,
 tags text[] NOT NULL DEFAULT '{}',
 source_product_key text,
 external_ref text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_ticket_queue_idx
 ON public.support_ticket_metadata(tenant_id,queue_id,sla_breached,resolution_due_at);

CREATE TABLE IF NOT EXISTS public.support_satisfaction(
 case_id uuid PRIMARY KEY REFERENCES public.cases(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 score integer NOT NULL CHECK(score BETWEEN 1 AND 5),
 comment text,
 received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 notification_type text NOT NULL,
 title text NOT NULL,
 body text,
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
 entity_type text,
 entity_id text,
 action_url text,
 read_at timestamptz,
 dismissed_at timestamptz,
 expires_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_notifications_inbox_idx
 ON public.user_notifications(user_id,tenant_id,read_at,dismissed_at,created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_preferences(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 notification_type text NOT NULL,
 in_app boolean NOT NULL DEFAULT true,
 email boolean NOT NULL DEFAULT false,
 sms boolean NOT NULL DEFAULT false,
 whatsapp boolean NOT NULL DEFAULT false,
 push boolean NOT NULL DEFAULT false,
 quiet_hours jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id,notification_type)
);

CREATE TABLE IF NOT EXISTS public.platform_search_documents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 tenant_product_id uuid REFERENCES public.tenant_products(id) ON DELETE CASCADE,
 product_key text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 title text NOT NULL,
 body text,
 keywords text[] NOT NULL DEFAULT '{}',
 locale text,
 source_revision text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS platform_search_documents_scope_idx
 ON public.platform_search_documents(tenant_id,tenant_product_id,entity_type,updated_at DESC);
CREATE INDEX IF NOT EXISTS platform_search_documents_fts_idx
 ON public.platform_search_documents
 USING gin(to_tsvector('simple',coalesce(title,'')||' '||coalesce(body,'')));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'platform_documents','platform_document_versions','platform_document_links',
  'support_queues','support_sla_policies','support_ticket_metadata','support_satisfaction'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','tenant module read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id,auth.uid()))','tenant module read',t);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','tenant module write',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_write(tenant_id,auth.uid())) WITH CHECK (public.can_write(tenant_id,auth.uid()))','tenant module write',t);
 END LOOP;
END $$;

ALTER TABLE public.platform_document_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.platform_document_templates TO authenticated;
GRANT ALL ON public.platform_document_templates TO service_role;
DROP POLICY IF EXISTS "document templates read" ON public.platform_document_templates;
CREATE POLICY "document templates read" ON public.platform_document_templates FOR SELECT TO authenticated
 USING(tenant_id IS NULL OR public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "document templates tenant write" ON public.platform_document_templates;
CREATE POLICY "document templates tenant write" ON public.platform_document_templates FOR ALL TO authenticated
 USING(tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(tenant_id IS NOT NULL AND public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT,UPDATE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;
DROP POLICY IF EXISTS "notification self read" ON public.user_notifications;
CREATE POLICY "notification self read" ON public.user_notifications FOR SELECT TO authenticated
 USING(user_id=auth.uid() AND public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "notification self update" ON public.user_notifications;
CREATE POLICY "notification self update" ON public.user_notifications FOR UPDATE TO authenticated
 USING(user_id=auth.uid() AND public.is_tenant_member(tenant_id,auth.uid()))
 WITH CHECK(user_id=auth.uid() AND public.is_tenant_member(tenant_id,auth.uid()));

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
DROP POLICY IF EXISTS "notification prefs self" ON public.notification_preferences;
CREATE POLICY "notification prefs self" ON public.notification_preferences FOR ALL TO authenticated
 USING(user_id=auth.uid() AND public.is_tenant_member(tenant_id,auth.uid()))
 WITH CHECK(user_id=auth.uid() AND public.is_tenant_member(tenant_id,auth.uid()));

ALTER TABLE public.platform_search_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_search_documents TO authenticated;
GRANT ALL ON public.platform_search_documents TO service_role;
DROP POLICY IF EXISTS "search documents tenant read" ON public.platform_search_documents;
CREATE POLICY "search documents tenant read" ON public.platform_search_documents FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'platform_documents','support_queues','support_sla_policies','support_ticket_metadata',
  'platform_document_templates'
 ] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I',t);
  EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.add_platform_document_version(
 _tenant uuid,_document uuid,_storage_ref text,_file_name text,_mime_type text,_size_bytes bigint,
 _sha256 text,_source text,_created_by uuid,_notes text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE d public.platform_documents; v integer;
BEGIN
 SELECT * INTO d FROM public.platform_documents WHERE id=_document AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND OR d.status='deleted' THEN RAISE EXCEPTION 'document_not_found'; END IF;
 v:=d.current_version+1;
 INSERT INTO public.platform_document_versions(
  document_id,tenant_id,version,storage_ref,file_name,mime_type,size_bytes,sha256,source,created_by,notes
 ) VALUES(_document,_tenant,v,_storage_ref,_file_name,_mime_type,_size_bytes,_sha256,_source,_created_by,_notes);
 UPDATE public.platform_documents SET current_version=v,status=CASE WHEN status='draft' THEN 'active' ELSE status END,updated_at=now()
 WHERE id=_document;
 RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.add_platform_document_version(uuid,uuid,text,text,text,bigint,text,text,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_platform_document_version(uuid,uuid,text,text,text,bigint,text,text,uuid,text)
 TO service_role;

CREATE OR REPLACE FUNCTION public.search_platform_documents(
 _tenant uuid,_query text,_tenant_product uuid DEFAULT NULL,_entity_types text[] DEFAULT NULL,_limit integer DEFAULT 25,_offset integer DEFAULT 0
)
RETURNS TABLE(entity_type text,entity_id text,product_key text,title text,snippet text,rank real,metadata jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE q tsquery;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.is_tenant_member(_tenant,auth.uid()) THEN
  RAISE EXCEPTION 'tenant_access_denied';
 END IF;
 IF btrim(COALESCE(_query,''))='' THEN RETURN; END IF;
 q:=websearch_to_tsquery('simple',_query);
 RETURN QUERY
 SELECT d.entity_type,d.entity_id,d.product_key,d.title,
  ts_headline('simple',coalesce(d.body,d.title),q,'MaxFragments=2,MinWords=4,MaxWords=20'),
  ts_rank_cd(to_tsvector('simple',coalesce(d.title,'')||' '||coalesce(d.body,'')),q)::real,
  d.metadata
 FROM public.platform_search_documents d
 WHERE d.tenant_id=_tenant
   AND (_tenant_product IS NULL OR d.tenant_product_id=_tenant_product)
   AND (_entity_types IS NULL OR d.entity_type=ANY(_entity_types))
   AND to_tsvector('simple',coalesce(d.title,'')||' '||coalesce(d.body,'')) @@ q
 ORDER BY 6 DESC,d.updated_at DESC
 LIMIT LEAST(GREATEST(_limit,1),100)
 OFFSET GREATEST(_offset,0);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.search_platform_documents(uuid,text,uuid,text[],integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_platform_documents(uuid,text,uuid,text[],integer,integer) TO authenticated,service_role;

COMMIT;
