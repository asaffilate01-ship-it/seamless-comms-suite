BEGIN;

INSERT INTO public.service_catalogue(
 service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status
) VALUES
 ('omniqora.regulatory-monitoring','Regulatory Monitoring','Versioned authority-source monitoring, outage/change evidence and reviewed impact tracking.','compliance','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,status='active',
 implementation_status='built_main',updated_at=now();

INSERT INTO public.service_dependencies(service_key,depends_on_service_key) VALUES
 ('omniqora.regulatory-monitoring','omniqora.connectors'),
 ('omniqora.regulatory-monitoring','omniqora.graphrag')
ON CONFLICT DO NOTHING;

INSERT INTO public.product_services(product_key,service_key,default_enabled,required)
SELECT 'omniqora','omniqora.regulatory-monitoring',true,false
WHERE EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key='omniqora')
ON CONFLICT(product_key,service_key) DO UPDATE SET default_enabled=true;

ALTER TABLE public.communication_identities
 DROP CONSTRAINT IF EXISTS communication_identities_channel_check;
ALTER TABLE public.communication_identities
 ADD CONSTRAINT communication_identities_channel_check
 CHECK(channel IN('whatsapp','sms','email','voice','push','web_chat','social'));

CREATE TABLE IF NOT EXISTS public.regulatory_source_monitors(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
 source_key text NOT NULL,
 authority text NOT NULL,
 jurisdiction text NOT NULL,
 source_type text NOT NULL,
 source_url text NOT NULL CHECK(source_url LIKE 'https://%'),
 provider_key text REFERENCES public.provider_catalogue(provider_key) ON DELETE SET NULL,
 collection_key text,
 polling_rrule text,
 status text NOT NULL DEFAULT 'configured' CHECK(status IN('configured','active','degraded','paused','failed','retired')),
 last_checked_at timestamptz,
 last_success_at timestamptz,
 last_content_hash text,
 current_revision integer NOT NULL DEFAULT 0,
 last_error text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_key)
);

CREATE TABLE IF NOT EXISTS public.regulatory_source_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 monitor_id uuid NOT NULL REFERENCES public.regulatory_source_monitors(id) ON DELETE CASCADE,
 revision integer NOT NULL CHECK(revision>0),
 content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
 checked_at timestamptz NOT NULL DEFAULT now(),
 published_at timestamptz,
 effective_from date,
 effective_until date,
 source_document_id uuid REFERENCES public.document_records(id) ON DELETE SET NULL,
 source_ref text,
 summary jsonb NOT NULL DEFAULT '{}'::jsonb,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(monitor_id,revision),
 UNIQUE(monitor_id,content_hash)
);

CREATE TABLE IF NOT EXISTS public.regulatory_change_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 monitor_id uuid NOT NULL REFERENCES public.regulatory_source_monitors(id) ON DELETE CASCADE,
 from_revision integer,
 to_revision integer NOT NULL,
 change_type text NOT NULL DEFAULT 'content_changed'
   CHECK(change_type IN('content_changed','new_source','withdrawn','effective_date','metadata','unknown')),
 summary text,
 impact jsonb NOT NULL DEFAULT '{}'::jsonb,
 affected_products text[] NOT NULL DEFAULT '{}',
 affected_controls text[] NOT NULL DEFAULT '{}',
 evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'review'
   CHECK(status IN('review','accepted','action_required','dismissed','superseded')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.regulatory_source_outages(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 monitor_id uuid NOT NULL REFERENCES public.regulatory_source_monitors(id) ON DELETE CASCADE,
 detected_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 failure_class text NOT NULL,
 detail text,
 provider_status text,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','monitoring','resolved','accepted')),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY[
  'regulatory_source_monitors','regulatory_source_snapshots','regulatory_change_events','regulatory_source_outages'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))',
    'regulatory tenant read '||t,t);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid())) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.can_write(tenant_id,auth.uid()))',
    'regulatory tenant write '||t,t);
 END LOOP;
END $$;

DROP POLICY IF EXISTS "regulatory monitor admin mutation" ON public.regulatory_source_monitors;
CREATE POLICY "regulatory monitor admin mutation"
 ON public.regulatory_source_monitors AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

CREATE INDEX IF NOT EXISTS regulatory_monitor_status_idx
 ON public.regulatory_source_monitors(tenant_id,status,last_checked_at);
CREATE INDEX IF NOT EXISTS regulatory_change_review_idx
 ON public.regulatory_change_events(tenant_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION public.regulatory_record_snapshot(
 _monitor uuid,_content_hash text,_source_document uuid DEFAULT NULL,_source_ref text DEFAULT NULL,
 _summary jsonb DEFAULT '{}'::jsonb,_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE m public.regulatory_source_monitors%rowtype;prior_hash text;prior_revision integer;new_revision integer;snapshot_id uuid;change_id uuid;
BEGIN
IF _content_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid content hash'; END IF;
 SELECT * INTO m FROM public.regulatory_source_monitors WHERE id=_monitor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Regulatory monitor not found'; END IF;
 prior_hash:=m.last_content_hash;prior_revision:=m.current_revision;
 IF prior_hash=_content_hash THEN
  UPDATE public.regulatory_source_monitors SET last_checked_at=now(),last_success_at=now(),status='active',last_error=NULL,updated_at=now() WHERE id=m.id;
  RETURN jsonb_build_object('changed',false,'revision',prior_revision);
 END IF;
 new_revision:=prior_revision+1;
 INSERT INTO public.regulatory_source_snapshots(
  tenant_id,monitor_id,revision,content_hash,source_document_id,source_ref,summary,metadata
 ) VALUES(m.tenant_id,m.id,new_revision,_content_hash,_source_document,_source_ref,COALESCE(_summary,'{}'::jsonb),COALESCE(_metadata,'{}'::jsonb))
 RETURNING id INTO snapshot_id;
 INSERT INTO public.regulatory_change_events(
  tenant_id,monitor_id,from_revision,to_revision,change_type,summary,evidence_refs,status
 ) VALUES(
  m.tenant_id,m.id,CASE WHEN prior_revision=0 THEN NULL ELSE prior_revision END,new_revision,
  CASE WHEN prior_revision=0 THEN 'new_source' ELSE 'content_changed' END,
  COALESCE(_summary->>'headline','Regulatory source changed'),
  jsonb_build_array(jsonb_build_object('snapshotId',snapshot_id,'sourceRef',_source_ref)),
  'review'
 ) RETURNING id INTO change_id;
 UPDATE public.regulatory_source_monitors
 SET last_checked_at=now(),last_success_at=now(),last_content_hash=_content_hash,current_revision=new_revision,
     status='active',last_error=NULL,updated_at=now()
 WHERE id=m.id;
 RETURN jsonb_build_object('changed',true,'revision',new_revision,'snapshotId',snapshot_id,'changeId',change_id);
END $$;
REVOKE ALL ON FUNCTION public.regulatory_record_snapshot(uuid,text,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.regulatory_record_snapshot(uuid,text,uuid,text,jsonb,jsonb) TO service_role;

COMMIT;
