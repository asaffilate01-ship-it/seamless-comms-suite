-- Omniqora Web Intelligence phase 1: approved-source, tenant-entitled,
-- single-page public HTML snapshots. This is NOT an unrestricted web browser,
-- third-party MCP tool installation, or an automatic AI/RAG ingestion pipeline.
BEGIN;

INSERT INTO public.service_catalogue
  (service_key,name,description,family,billable,provisioning_mode,status,metadata)
VALUES
  ('omniqora.web-intelligence','Omniqora Web Intelligence',
   'Review-gated public source snapshots for tenant-scoped research',
   'intelligence',true,'manual','beta',
   '{"engine":"scrapling","execution":"external-worker","activation":"manual"}'::jsonb)
ON CONFLICT (service_key) DO NOTHING;

CREATE TABLE public.web_intel_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 3 AND 160),
 category text NOT NULL CHECK(category IN('food','regulatory','education','automotive','other')),
 url text NOT NULL UNIQUE CHECK(length(url) BETWEEN 12 AND 700),
 hostname text NOT NULL CHECK(length(hostname) BETWEEN 4 AND 253),
 purpose text NOT NULL CHECK(length(trim(purpose)) BETWEEN 16 AND 500),
 status text NOT NULL DEFAULT 'pending'
  CHECK(status IN('pending','approved','rejected','revoked')),
 max_chars integer NOT NULL DEFAULT 40000 CHECK(max_chars BETWEEN 1000 AND 50000),
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_by uuid REFERENCES auth.users(id),
 review_note text,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_intel_sources_review ON public.web_intel_sources(status,created_at DESC);

CREATE TABLE public.web_intel_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 source_id uuid NOT NULL REFERENCES public.web_intel_sources(id),
 requested_by uuid NOT NULL REFERENCES auth.users(id),
 idempotency_key uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued'
  CHECK(status IN('queued','running','succeeded','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 lease_token uuid,
 lease_expires_at timestamptz,
 http_status integer,
 failure_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz,
 completed_at timestamptz,
 UNIQUE(tenant_id,product_key,idempotency_key),
 FOREIGN KEY(tenant_id,product_key)
  REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE
);
CREATE INDEX web_intel_jobs_queue ON public.web_intel_jobs(status,lease_expires_at,created_at);
CREATE INDEX web_intel_jobs_scope ON public.web_intel_jobs(tenant_id,product_key,created_at DESC);

CREATE TABLE public.web_intel_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL UNIQUE REFERENCES public.web_intel_jobs(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 source_id uuid NOT NULL REFERENCES public.web_intel_sources(id),
 source_url text NOT NULL,
 title text NOT NULL,
 content_text text NOT NULL CHECK(length(content_text) BETWEEN 1 AND 50000),
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[0-9a-f]{64}$'),
 content_type text NOT NULL DEFAULT 'text/plain' CHECK(content_type='text/plain'),
 trust_level text NOT NULL DEFAULT 'untrusted_external'
   CHECK(trust_level='untrusted_external'),
 captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_intel_documents_scope ON public.web_intel_documents(tenant_id,product_key,captured_at DESC);

CREATE TABLE public.web_intel_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES public.web_intel_jobs(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 event_type text NOT NULL CHECK(event_type IN('queued','claimed','succeeded','failed','lease_expired')),
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_intel_events_scope ON public.web_intel_events(tenant_id,job_id,created_at DESC);

DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['web_intel_sources','web_intel_jobs','web_intel_documents','web_intel_events']
 LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
 END LOOP;
END $$;

CREATE POLICY "web intel source visibility" ON public.web_intel_sources
 FOR SELECT TO authenticated
 USING(status='approved' OR public.is_platform_admin((select auth.uid())));

CREATE POLICY "web intel tenant jobs read" ON public.web_intel_jobs
 FOR SELECT TO authenticated
 USING(public.is_platform_admin((select auth.uid()))
    OR public.is_tenant_member(tenant_id,(select auth.uid())));

CREATE POLICY "web intel tenant documents read" ON public.web_intel_documents
 FOR SELECT TO authenticated
 USING(public.is_platform_admin((select auth.uid()))
    OR public.is_tenant_member(tenant_id,(select auth.uid())));

CREATE POLICY "web intel tenant events read" ON public.web_intel_events
 FOR SELECT TO authenticated
 USING(public.is_platform_admin((select auth.uid()))
    OR public.is_tenant_member(tenant_id,(select auth.uid())));

-- Source proposals never directly approve a URL. The worker independently
-- blocks private IPs, credentials, redirects, robots denial and non-HTML pages.
CREATE FUNCTION public.propose_web_intel_source(
 _name text,_category text,_url text,_purpose text
) RETURNS public.web_intel_sources
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.web_intel_sources; host text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Platform admin required'; END IF;
 IF _name IS NULL OR length(trim(_name)) NOT BETWEEN 3 AND 160
    OR _category IS NULL OR _category NOT IN('food','regulatory','education','automotive','other')
    OR _purpose IS NULL OR length(trim(_purpose)) NOT BETWEEN 16 AND 500
    OR _url IS NULL OR length(_url) NOT BETWEEN 12 AND 700
    OR _url !~ '^https://[a-z0-9.-]+(/[^[:space:]#]*)?$' THEN
  RAISE EXCEPTION 'Invalid public HTTPS source'; END IF;
 host := split_part(split_part(_url,'/',3),':',1);
 IF length(host) NOT BETWEEN 4 AND 253 OR host !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'
    OR host LIKE '%.local' OR host LIKE '%.internal' OR host LIKE '%.localhost'
    OR host IN ('localhost','metadata.google.internal')
    OR host ~ '^[0-9.]+$' THEN
  RAISE EXCEPTION 'Invalid source hostname'; END IF;
 INSERT INTO public.web_intel_sources
   (name,category,url,hostname,purpose,requested_by)
 VALUES (trim(_name),_category,_url,host,trim(_purpose),auth.uid())
 RETURNING * INTO rec;
 RETURN rec;
END $$;

CREATE FUNCTION public.review_web_intel_source(
 _source uuid,_decision text,_note text
) RETURNS public.web_intel_sources
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.web_intel_sources;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Platform reviewer required'; END IF;
 IF _decision IS NULL OR _decision NOT IN('approved','rejected','revoked')
    OR _note IS NULL OR length(trim(_note)) NOT BETWEEN 16 AND 1000 THEN
  RAISE EXCEPTION 'Decision and review evidence required'; END IF;
 SELECT * INTO STRICT rec FROM public.web_intel_sources WHERE id=_source FOR UPDATE;
 IF rec.requested_by=auth.uid() THEN RAISE EXCEPTION 'Independent reviewer required'; END IF;
 IF (rec.status='pending' AND _decision NOT IN('approved','rejected'))
    OR (rec.status='approved' AND _decision<>'revoked')
    OR rec.status IN('rejected','revoked') THEN
  RAISE EXCEPTION 'Invalid source review transition'; END IF;
 UPDATE public.web_intel_sources
 SET status=_decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(_note)
 WHERE id=_source RETURNING * INTO rec;
 RETURN rec;
END $$;

-- Client calls this narrow RPC; no direct INSERT/UPDATE/DELETE table grants.
CREATE FUNCTION public.queue_web_intel_job(
 _tenant uuid,_product text,_source uuid,_idempotency uuid
) RETURNS public.web_intel_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.web_intel_jobs;
BEGIN
 IF auth.uid() IS NULL OR _idempotency IS NULL THEN
  RAISE EXCEPTION 'Authenticated idempotent request required'; END IF;
 IF NOT(public.is_platform_admin(auth.uid()) OR EXISTS(
  SELECT 1 FROM public.tenant_members m
  WHERE m.tenant_id=_tenant AND m.user_id=auth.uid() AND m.role IN('owner','admin')
 )) THEN RAISE EXCEPTION 'Tenant administrator required'; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.tenant_products p
  WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.status='active'
 ) THEN RAISE EXCEPTION 'Active tenant product required'; END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.web-intelligence') THEN
  RAISE EXCEPTION 'Web Intelligence entitlement required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.web_intel_sources s
               WHERE s.id=_source AND s.status='approved') THEN
  RAISE EXCEPTION 'Reviewed source required'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_tenant::text, 0));
 SELECT * INTO rec FROM public.web_intel_jobs
  WHERE tenant_id=_tenant AND product_key=_product AND idempotency_key=_idempotency;
 IF FOUND THEN
  IF rec.source_id<>_source THEN RAISE EXCEPTION 'Idempotency key reused'; END IF;
  RETURN rec;
 END IF;
 IF (SELECT count(*) FROM public.web_intel_jobs
   WHERE tenant_id=_tenant AND status IN('queued','running')) >= 2 THEN
  RAISE EXCEPTION 'Tenant has reached the two-job limit'; END IF;
 IF EXISTS(SELECT 1 FROM public.web_intel_jobs
   WHERE tenant_id=_tenant AND source_id=_source
     AND created_at>now()-interval '60 minutes') THEN
  RAISE EXCEPTION 'Source has been requested within the last hour'; END IF;
 INSERT INTO public.web_intel_jobs(tenant_id,product_key,source_id,requested_by,idempotency_key)
 VALUES(_tenant,_product,_source,auth.uid(),_idempotency)
 RETURNING * INTO rec;
 INSERT INTO public.web_intel_events(job_id,tenant_id,event_type)
 VALUES(rec.id,_tenant,'queued');
 RETURN rec;
END $$;

-- Called ONLY by Omniqora server via service_role after authenticating the
-- private worker secret. No browser role has permission to claim/finish.
CREATE FUNCTION public.claim_web_intel_job()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.web_intel_jobs; src public.web_intel_sources; lease uuid;
BEGIN
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
 FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO STRICT src FROM public.web_intel_sources WHERE id=rec.source_id;
 lease := gen_random_uuid();
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

CREATE FUNCTION public.finish_web_intel_job(
 _job uuid,_lease uuid,_success boolean,_title text,
 _content text,_sha256 text,_http_status integer,_failure text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rec public.web_intel_jobs; src public.web_intel_sources;
BEGIN
 SELECT * INTO STRICT rec FROM public.web_intel_jobs WHERE id=_job FOR UPDATE;
 IF rec.status<>'running' OR rec.lease_token IS DISTINCT FROM _lease
    OR rec.lease_expires_at<=now() THEN
  RAISE EXCEPTION 'Invalid or expired worker lease'; END IF;
 IF _success THEN
  SELECT * INTO STRICT src FROM public.web_intel_sources
   WHERE id=rec.source_id AND status='approved';
  IF _content IS NULL OR length(_content) NOT BETWEEN 1 AND src.max_chars
     OR _sha256 IS NULL OR _sha256 !~ '^[0-9a-f]{64}$'
     OR _http_status NOT BETWEEN 200 AND 299 THEN
   RAISE EXCEPTION 'Invalid bounded evidence'; END IF;
  INSERT INTO public.web_intel_documents
   (job_id,tenant_id,product_key,source_id,source_url,title,content_text,content_sha256)
  VALUES(rec.id,rec.tenant_id,rec.product_key,rec.source_id,src.url,
         left(COALESCE(nullif(trim(_title),''),src.name),200),_content,_sha256);
 END IF;
 UPDATE public.web_intel_jobs SET status=CASE WHEN _success THEN 'succeeded' ELSE 'failed' END,
   http_status=_http_status, failure_reason=CASE WHEN _success THEN NULL ELSE left(COALESCE(_failure,'worker_failed'),300) END,
   lease_token=NULL,lease_expires_at=NULL,completed_at=now()
 WHERE id=rec.id;
 INSERT INTO public.web_intel_events(job_id,tenant_id,event_type,details)
 VALUES(rec.id,rec.tenant_id,CASE WHEN _success THEN 'succeeded' ELSE 'failed' END,
        jsonb_build_object('httpStatus',_http_status));
 RETURN jsonb_build_object('jobId',rec.id,'status',CASE WHEN _success THEN 'succeeded' ELSE 'failed' END);
END $$;

-- Limit EXECUTE as carefully as table DML: SECURITY DEFINER in public otherwise
-- inherits EXECUTE FROM PUBLIC by default in PostgreSQL.
REVOKE ALL ON FUNCTION public.propose_web_intel_source(text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.review_web_intel_source(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.queue_web_intel_job(uuid,text,uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.claim_web_intel_job() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_web_intel_job(uuid,uuid,boolean,text,text,text,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.propose_web_intel_source(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_web_intel_source(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_web_intel_job(uuid,text,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_web_intel_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_web_intel_job(uuid,uuid,boolean,text,text,text,integer,text) TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.web_intel_events_id_seq TO service_role;

COMMIT;
