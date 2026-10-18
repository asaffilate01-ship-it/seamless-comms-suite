-- Omniqora Web Intelligence Phase 2: explicitly enabled, reviewed-source
-- monitoring with bounded scheduling, in-app change evidence and retention.
-- Only trusted service_role code claims work; no external web access in SQL.
BEGIN;

CREATE TABLE public.web_intel_monitors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 source_id uuid NOT NULL REFERENCES public.web_intel_sources(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid REFERENCES auth.users(id),
 enabled boolean NOT NULL DEFAULT false,
 interval_hours integer NOT NULL DEFAULT 168 CHECK(interval_hours IN(24,72,168)),
 retention_days integer NOT NULL DEFAULT 30 CHECK(retention_days IN(7,30,90)),
 next_due_at timestamptz,
 last_enqueued_at timestamptz,
 last_observed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,source_id),
 FOREIGN KEY(tenant_id,product_key)
  REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE,
 CONSTRAINT monitor_due_if_enabled CHECK(NOT enabled OR next_due_at IS NOT NULL)
);
CREATE INDEX web_intel_monitors_due ON public.web_intel_monitors(next_due_at)
 WHERE enabled;
CREATE INDEX web_intel_monitors_scope ON public.web_intel_monitors(tenant_id,product_key,updated_at DESC);

ALTER TABLE public.web_intel_jobs
 ADD COLUMN monitor_id uuid REFERENCES public.web_intel_monitors(id) ON DELETE SET NULL,
 ADD COLUMN trigger_kind text NOT NULL DEFAULT 'manual'
   CHECK(trigger_kind IN('manual','scheduled'));
CREATE INDEX web_intel_jobs_monitor ON public.web_intel_jobs(monitor_id,created_at DESC)
 WHERE monitor_id IS NOT NULL;

ALTER TABLE public.web_intel_documents
 ADD COLUMN retention_until timestamptz NOT NULL DEFAULT (now() + interval '30 days');
CREATE INDEX web_intel_documents_expiry ON public.web_intel_documents(retention_until);

CREATE TABLE public.web_intel_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL UNIQUE REFERENCES public.web_intel_jobs(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 source_id uuid NOT NULL REFERENCES public.web_intel_sources(id),
 new_document_id uuid REFERENCES public.web_intel_documents(id) ON DELETE SET NULL,
 previous_document_id uuid REFERENCES public.web_intel_documents(id) ON DELETE SET NULL,
 change_kind text NOT NULL CHECK(change_kind IN('initial','changed','unchanged')),
 previous_sha256 text CHECK(previous_sha256 IS NULL OR previous_sha256 ~ '^[0-9a-f]{64}$'),
 current_sha256 text NOT NULL CHECK(current_sha256 ~ '^[0-9a-f]{64}$'),
 detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_intel_changes_scope
 ON public.web_intel_changes(tenant_id,product_key,detected_at DESC);
CREATE INDEX web_intel_changes_source
 ON public.web_intel_changes(tenant_id,product_key,source_id,detected_at DESC);

ALTER TABLE public.web_intel_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.web_intel_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_intel_monitors,public.web_intel_changes FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.web_intel_monitors,public.web_intel_changes TO service_role;
GRANT SELECT ON public.web_intel_monitors,public.web_intel_changes TO authenticated;

CREATE POLICY "web intel scoped monitor read" ON public.web_intel_monitors
 FOR SELECT TO authenticated
 USING(public.is_platform_admin((select auth.uid()))
       OR public.is_tenant_member(tenant_id,(select auth.uid())));
CREATE POLICY "web intel scoped change feed" ON public.web_intel_changes
 FOR SELECT TO authenticated
 USING(
  detected_at > now()-interval '120 days'
  AND (public.is_platform_admin((select auth.uid()))
    OR public.is_tenant_member(tenant_id,(select auth.uid())))
 );

-- Once a document expires, it must no longer be exposed via RLS even if
-- maintenance has not physically purged it yet.
DROP POLICY IF EXISTS "web intel tenant documents read" ON public.web_intel_documents;
CREATE POLICY "web intel tenant documents read" ON public.web_intel_documents
 FOR SELECT TO authenticated
 USING(
  retention_until > now()
  AND (public.is_platform_admin((select auth.uid()))
    OR public.is_tenant_member(tenant_id,(select auth.uid())))
 );

-- All monitor mutations happen through this one validated RPC.
-- This intentionally allows pausing without revoking an approved source.
CREATE FUNCTION public.configure_web_intel_monitor(
 _tenant uuid,_product text,_source uuid,
 _interval_hours integer,_retention_days integer,_enabled boolean
) RETURNS public.web_intel_monitors
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.web_intel_monitors;
BEGIN
 IF auth.uid() IS NULL OR _enabled IS NULL OR
    _interval_hours IS NULL OR _interval_hours NOT IN(24,72,168) OR
    _retention_days IS NULL OR _retention_days NOT IN(7,30,90) THEN
  RAISE EXCEPTION 'Invalid monitor configuration'; END IF;
 IF NOT(public.is_platform_admin(auth.uid()) OR EXISTS(
   SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id=_tenant AND m.user_id=auth.uid()
      AND m.role IN('owner','admin'))) THEN
   RAISE EXCEPTION 'Tenant administrator required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products p
   WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.status='active')
   OR NOT public.has_tenant_entitlement(_tenant,'omniqora.web-intelligence') THEN
   RAISE EXCEPTION 'Active product and Web Intelligence entitlement required'; END IF;
 -- Revocation stops future scheduling. Existing monitors can still be paused
 -- by their tenant administrator, even after a source is revoked.
 IF NOT EXISTS(SELECT 1 FROM public.web_intel_sources s
    WHERE s.id=_source AND (
      s.status='approved'
      OR (NOT _enabled AND EXISTS(
        SELECT 1 FROM public.web_intel_monitors old_m
        WHERE old_m.tenant_id=_tenant AND old_m.product_key=_product
          AND old_m.source_id=_source
      ))
    )) THEN
   RAISE EXCEPTION 'Independently approved source required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_tenant::text,0));
 SELECT * INTO rec FROM public.web_intel_monitors m
  WHERE m.tenant_id=_tenant AND m.product_key=_product AND m.source_id=_source
  FOR UPDATE;
 IF NOT FOUND THEN
  IF (SELECT count(*) FROM public.web_intel_monitors WHERE tenant_id=_tenant)>=10
    THEN RAISE EXCEPTION 'Tenant maximum of ten source monitors reached'; END IF;
  INSERT INTO public.web_intel_monitors
     (tenant_id,product_key,source_id,created_by,updated_by,enabled,
      interval_hours,retention_days,next_due_at)
  VALUES(_tenant,_product,_source,auth.uid(),auth.uid(),_enabled,
         _interval_hours,_retention_days,CASE WHEN _enabled THEN now() ELSE NULL END)
  RETURNING * INTO rec;
 ELSE
  UPDATE public.web_intel_monitors
    SET enabled=_enabled,interval_hours=_interval_hours,retention_days=_retention_days,
        updated_by=auth.uid(),updated_at=now(),
        next_due_at=CASE WHEN _enabled THEN
         CASE WHEN rec.enabled AND rec.next_due_at IS NOT NULL
            THEN rec.next_due_at ELSE now() END ELSE NULL END
   WHERE id=rec.id RETURNING * INTO rec;
 END IF;
 RETURN rec;
END $$;

-- SQL-owned, low-volume queueing: workers can request due jobs, but cannot
-- choose tenant, source, credentials or schedule. A disabled service schedules
-- nothing. Advisory locking matches the Phase 1 manual-queue quota lock.
CREATE FUNCTION public.schedule_due_web_intel_monitors()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE monitor public.web_intel_monitors; queued integer := 0;
        created_job public.web_intel_jobs;
BEGIN
 FOR monitor IN
   SELECT m.* FROM public.web_intel_monitors m
   JOIN public.web_intel_sources s ON s.id=m.source_id AND s.status='approved'
   JOIN public.tenant_products tp ON tp.tenant_id=m.tenant_id
     AND tp.product_key=m.product_key AND tp.status='active'
   WHERE m.enabled AND m.next_due_at <= now()
     AND public.has_tenant_entitlement(m.tenant_id,'omniqora.web-intelligence')
     -- Filter backlogged and recently fetched sources BEFORE LIMIT 10 so
     -- tenants at quota cannot indefinitely starve unrelated due monitors.
     AND (SELECT count(*) FROM public.web_intel_jobs pending
          WHERE pending.tenant_id=m.tenant_id
            AND pending.status IN('queued','running'))<2
     AND NOT EXISTS(SELECT 1 FROM public.web_intel_jobs recent
          WHERE recent.tenant_id=m.tenant_id
            AND recent.source_id=m.source_id
            AND (recent.status IN('queued','running')
                 OR recent.created_at>now()-interval '60 minutes'))
   ORDER BY m.next_due_at,m.id
   LIMIT 10 FOR UPDATE OF m SKIP LOCKED
 LOOP
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(monitor.tenant_id::text,0));
  IF (SELECT count(*) FROM public.web_intel_jobs j
      WHERE j.tenant_id=monitor.tenant_id AND j.status IN('queued','running'))>=2
    THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM public.web_intel_jobs j
      WHERE j.tenant_id=monitor.tenant_id AND j.source_id=monitor.source_id
        AND (j.status IN('queued','running')
             OR j.created_at>now()-interval '60 minutes'))
    THEN CONTINUE; END IF;

  INSERT INTO public.web_intel_jobs(
    tenant_id,product_key,source_id,requested_by,idempotency_key,
    monitor_id,trigger_kind
  ) VALUES (
    monitor.tenant_id,monitor.product_key,monitor.source_id,monitor.created_by,
    gen_random_uuid(),monitor.id,'scheduled'
  ) RETURNING * INTO created_job;
  INSERT INTO public.web_intel_events(job_id,tenant_id,event_type,details)
  VALUES(created_job.id,monitor.tenant_id,'queued',
         jsonb_build_object('trigger','scheduled','monitorId',monitor.id));
  UPDATE public.web_intel_monitors SET
    last_enqueued_at=now(),
    next_due_at=now()+make_interval(hours=>monitor.interval_hours),
    updated_at=now()
  WHERE id=monitor.id;
  queued:=queued+1;
 END LOOP;
 RETURN queued;
END $$;

-- Retention and changes are computed by the database, not accepted as
-- client/worker-supplied fields. The same source is compared only inside
-- the identical (tenant, product) scope.
CREATE FUNCTION public.set_web_intel_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lifetime integer := 30;
BEGIN
 SELECT COALESCE(m.retention_days,30) INTO lifetime
 FROM public.web_intel_jobs j
 LEFT JOIN public.web_intel_monitors m ON m.id=j.monitor_id
 WHERE j.id=NEW.job_id;
 NEW.retention_until :=
   NEW.captured_at + make_interval(days=>COALESCE(lifetime,30));
 RETURN NEW;
END $$;
CREATE TRIGGER web_intel_document_retention
 BEFORE INSERT ON public.web_intel_documents
 FOR EACH ROW EXECUTE FUNCTION public.set_web_intel_retention();

CREATE FUNCTION public.record_web_intel_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.web_intel_documents; kind text;
BEGIN
 SELECT d.* INTO previous FROM public.web_intel_documents d
 WHERE d.id<>NEW.id AND d.tenant_id=NEW.tenant_id
   AND d.product_key=NEW.product_key AND d.source_id=NEW.source_id
   AND d.retention_until>now()
 ORDER BY d.captured_at DESC,d.id DESC LIMIT 1;
 kind := CASE WHEN previous.id IS NULL THEN 'initial'
              WHEN previous.content_sha256=NEW.content_sha256 THEN 'unchanged'
              ELSE 'changed' END;

 INSERT INTO public.web_intel_changes(
   job_id,tenant_id,product_key,source_id,new_document_id,
   previous_document_id,change_kind,previous_sha256,current_sha256
 ) VALUES(
   NEW.job_id,NEW.tenant_id,NEW.product_key,NEW.source_id,NEW.id,
   previous.id,kind,previous.content_sha256,NEW.content_sha256
 );
 UPDATE public.web_intel_monitors m SET
  last_observed_at=now(),updated_at=now()
 FROM public.web_intel_jobs j
 WHERE j.id=NEW.job_id AND m.id=j.monitor_id
   AND m.tenant_id=NEW.tenant_id AND m.product_key=NEW.product_key;
 RETURN NEW;
END $$;
CREATE TRIGGER web_intel_document_change
 AFTER INSERT ON public.web_intel_documents
 FOR EACH ROW EXECUTE FUNCTION public.record_web_intel_change();

-- Low-volume maintenance. A document becomes unreadable immediately when
-- expired through RLS; hard-deletion is a separate bounded worker operation.
-- Hash-only metadata is retained for at most 120 days.
CREATE FUNCTION public.prune_web_intel_evidence()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE documents_removed integer := 0; changes_removed integer := 0;
BEGIN
 DELETE FROM public.web_intel_documents
 WHERE id IN (
   SELECT id FROM public.web_intel_documents
   WHERE retention_until<=now()
   ORDER BY retention_until,id LIMIT 100
 );
 GET DIAGNOSTICS documents_removed=ROW_COUNT;
 DELETE FROM public.web_intel_changes
 WHERE id IN (
   SELECT id FROM public.web_intel_changes
   WHERE detected_at<=now()-interval '120 days'
   ORDER BY detected_at,id LIMIT 100
 );
 GET DIAGNOSTICS changes_removed=ROW_COUNT;
 RETURN jsonb_build_object('documentsPurged',documents_removed,
                           'changeMetadataPurged',changes_removed);
END $$;

-- The existing authenticated worker polls "claim". It also advances a
-- bounded maintenance/scheduling tick; both RPCs are restricted to service_role.
CREATE OR REPLACE FUNCTION public.claim_web_intel_job()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.web_intel_jobs; src public.web_intel_sources; lease uuid;
BEGIN
 PERFORM public.prune_web_intel_evidence();
 PERFORM public.schedule_due_web_intel_monitors();
 UPDATE public.web_intel_jobs SET status='failed',failure_reason='lease_exhausted',
   completed_at=now(),lease_token=NULL,lease_expires_at=NULL
 WHERE status='running' AND lease_expires_at<now() AND attempts>=3;

 SELECT j.* INTO rec FROM public.web_intel_jobs j
 JOIN public.web_intel_sources s ON s.id=j.source_id AND s.status='approved'
 JOIN public.tenant_products p ON p.tenant_id=j.tenant_id
   AND p.product_key=j.product_key AND p.status='active'
 WHERE (j.status='queued' OR
        (j.status='running' AND j.lease_expires_at<now() AND j.attempts<3))
   AND public.has_tenant_entitlement(j.tenant_id,'omniqora.web-intelligence')
 ORDER BY j.created_at
 LIMIT 1 FOR UPDATE OF j SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO STRICT src FROM public.web_intel_sources WHERE id=rec.source_id;
 lease:=gen_random_uuid();
 UPDATE public.web_intel_jobs SET status='running',attempts=attempts+1,
   lease_token=lease,lease_expires_at=now()+interval '3 minutes',
   started_at=now(),failure_reason=NULL
 WHERE id=rec.id;
 INSERT INTO public.web_intel_events(job_id,tenant_id,event_type,details)
 VALUES(rec.id,rec.tenant_id,'claimed',jsonb_build_object('attempt',rec.attempts+1));
 RETURN jsonb_build_object(
  'jobId',rec.id,'leaseToken',lease,'tenantId',rec.tenant_id,
  'productKey',rec.product_key,'sourceId',src.id,'url',src.url,
  'hostname',src.hostname,'sourceName',src.name,'maxChars',src.max_chars
 );
END $$;

-- Public-schema SECURITY DEFINER functions are NOT automatically safe.
REVOKE ALL ON FUNCTION public.configure_web_intel_monitor(uuid,text,uuid,integer,integer,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_web_intel_monitor(uuid,text,uuid,integer,integer,boolean)
 TO authenticated;
REVOKE ALL ON FUNCTION public.schedule_due_web_intel_monitors()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.prune_web_intel_evidence()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_web_intel_retention()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_web_intel_change()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_due_web_intel_monitors(),
 public.prune_web_intel_evidence(),public.set_web_intel_retention(),
 public.record_web_intel_change() TO service_role;

COMMIT;
