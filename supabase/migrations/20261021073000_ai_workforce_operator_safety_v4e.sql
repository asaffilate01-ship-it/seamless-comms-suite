-- Phase 4E: explicit operator worker allowlist, revocation and uncertain-spend safety.
-- Adds no active tenants, credentials, provider bindings, schedules or model calls.
BEGIN;

CREATE TABLE public.ai_workforce_worker_allowlist (
 tenant_id uuid NOT NULL,
 product_key text NOT NULL CHECK(product_key='omniqora'),
 worker_ref text NOT NULL CHECK(worker_ref ~ '^[A-Za-z0-9_-]{8,80}$'),
 model_key text NOT NULL CHECK(model_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$'),
 status text NOT NULL DEFAULT 'disabled' CHECK(status IN('disabled','active','revoked')),
 max_claims integer NOT NULL CHECK(max_claims BETWEEN 1 AND 8),
 used_claims integer NOT NULL DEFAULT 0 CHECK(used_claims>=0 AND used_claims<=max_claims),
 expires_at timestamptz NOT NULL,
 operator_reference text NOT NULL CHECK(length(btrim(operator_reference)) BETWEEN 16 AND 240),
 evidence_reference text NOT NULL CHECK(
    length(evidence_reference) BETWEEN 20 AND 500 AND evidence_reference ~ '^https://'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,product_key,worker_ref),
 FOREIGN KEY(tenant_id,product_key)
  REFERENCES public.ai_workforce_readonly_pilots(tenant_id,product_key) ON DELETE CASCADE
);

CREATE TABLE public.ai_workforce_operator_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 product_key text NOT NULL CHECK(product_key='omniqora'),
 admission_id uuid REFERENCES public.ai_workforce_readonly_admissions(id) ON DELETE SET NULL,
 worker_ref text,
 event_key text NOT NULL CHECK(event_key IN
   ('allowlist_enabled','allowlist_disabled','worker_claimed',
    'worker_settlement_review','uncertain_usage_held','stale_job_quarantined',
    'pilot_emergency_stopped')),
 operator_reference text CHECK(operator_reference IS NULL OR length(operator_reference)<=240),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,product_key)
  REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE CASCADE
);
CREATE INDEX ai_workforce_operator_events_scope_idx
 ON public.ai_workforce_operator_events(tenant_id,product_key,created_at DESC);

DO $rls$ DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['ai_workforce_worker_allowlist','ai_workforce_operator_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',tab);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',tab);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',tab);
  EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
    public.is_platform_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.tenant_members m
      WHERE m.tenant_id=%I.tenant_id AND m.user_id=auth.uid()
      AND m.role IN ('owner','admin'))
  )$p$,'ai workforce operations read '||tab,tab,tab);
 END LOOP;
END $rls$;

-- Operator manually approves a short-lived, model-specific worker reference.
-- This is an additional DB allowlist, NOT per-worker cryptographic authentication.
CREATE FUNCTION public.configure_ai_workforce_worker_allowlist(
 _tenant uuid,_product text,_worker_ref text,_model_key text,
 _enabled boolean,_expires_at timestamptz,_max_claims integer,
 _operator_reference text,_evidence_reference text)
RETURNS public.ai_workforce_worker_allowlist
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $allow$
DECLARE pilot public.ai_workforce_readonly_pilots;
 existing public.ai_workforce_worker_allowlist; result public.ai_workforce_worker_allowlist;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR _product<>'omniqora' THEN
  RAISE EXCEPTION 'Operator-only worker authorisation required';
 END IF;
 SELECT * INTO STRICT pilot FROM public.ai_workforce_readonly_pilots
  WHERE tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF _worker_ref IS NULL OR _worker_ref !~ '^[A-Za-z0-9_-]{8,80}$' OR
    _model_key IS NULL OR _model_key !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$' OR
    _enabled IS NULL OR _expires_at IS NULL OR
    (_enabled AND (pilot.enabled IS DISTINCT FROM true OR pilot.expires_at<=now()
      OR _expires_at<=now() OR _expires_at>now()+interval '2 hours'
      OR _expires_at>pilot.expires_at)) OR
    _max_claims IS NULL OR _max_claims NOT BETWEEN 1 AND 8 OR
    length(btrim(COALESCE(_operator_reference,''))) NOT BETWEEN 16 AND 240 OR
    _evidence_reference IS NULL OR length(_evidence_reference) NOT BETWEEN 20 AND 500
    OR _evidence_reference !~ '^https://' THEN
   RAISE EXCEPTION 'Invalid time-limited worker operator approval';
 END IF;
 SELECT * INTO existing FROM public.ai_workforce_worker_allowlist
  WHERE tenant_id=_tenant AND product_key=_product AND worker_ref=_worker_ref FOR UPDATE;
 IF _enabled AND existing.status='active' AND existing.expires_at>now() THEN
  RAISE EXCEPTION 'Cannot silently renew an active worker permit';
 END IF;
 INSERT INTO public.ai_workforce_worker_allowlist(
  tenant_id,product_key,worker_ref,model_key,status,max_claims,used_claims,
  expires_at,operator_reference,evidence_reference)
 VALUES(_tenant,_product,_worker_ref,_model_key,
  CASE WHEN _enabled THEN 'active' ELSE 'disabled' END,
  _max_claims,0,_expires_at,btrim(_operator_reference),_evidence_reference)
 ON CONFLICT(tenant_id,product_key,worker_ref) DO UPDATE SET
  model_key=EXCLUDED.model_key,status=EXCLUDED.status,
  max_claims=EXCLUDED.max_claims,
  used_claims=CASE WHEN _enabled THEN 0 ELSE public.ai_workforce_worker_allowlist.used_claims END,
  expires_at=EXCLUDED.expires_at,operator_reference=EXCLUDED.operator_reference,
  evidence_reference=EXCLUDED.evidence_reference,updated_at=now()
 RETURNING * INTO result;
 INSERT INTO public.ai_workforce_operator_events(
  tenant_id,product_key,worker_ref,event_key,operator_reference)
 VALUES(_tenant,_product,_worker_ref,
  CASE WHEN _enabled THEN 'allowlist_enabled' ELSE 'allowlist_disabled' END,
  btrim(_operator_reference));
 RETURN result;
END $allow$;

-- A real-world provider worker may claim only with a currently active
-- operator allowlist in the same tenant/product/model and available claim slots.
CREATE FUNCTION public.enforce_ai_workforce_readonly_lease()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $lease$
DECLARE att public.ai_workforce_worker_allowlist;
BEGIN
 IF OLD.status='queued' AND NEW.status='processing' THEN
  IF auth.role() IS DISTINCT FROM 'service_role' OR NEW.worker_ref IS NULL THEN
    RAISE EXCEPTION 'Unverified read-only worker claim denied';
  END IF;
  SELECT * INTO att FROM public.ai_workforce_worker_allowlist
   WHERE tenant_id=NEW.tenant_id AND product_key=NEW.product_key
     AND worker_ref=NEW.worker_ref FOR UPDATE;
  IF att.worker_ref IS NULL OR att.status<>'active' OR att.expires_at<=now()
     OR att.model_key<>NEW.model_key OR att.used_claims>=att.max_claims THEN
    RAISE EXCEPTION 'Read-only worker attestation missing, exhausted or revoked';
  END IF;
  UPDATE public.ai_workforce_worker_allowlist
    SET used_claims=used_claims+1,updated_at=now()
    WHERE tenant_id=NEW.tenant_id AND product_key=NEW.product_key
      AND worker_ref=NEW.worker_ref;
  INSERT INTO public.ai_workforce_operator_events(
   tenant_id,product_key,admission_id,worker_ref,event_key,operator_reference)
  VALUES(NEW.tenant_id,NEW.product_key,NEW.id,NEW.worker_ref,
   'worker_claimed',att.operator_reference);
 ELSIF OLD.status='processing' AND NEW.status='waiting_review' THEN
  SELECT * INTO att FROM public.ai_workforce_worker_allowlist
   WHERE tenant_id=NEW.tenant_id AND product_key=NEW.product_key
    AND worker_ref=NEW.worker_ref;
  IF auth.role() IS DISTINCT FROM 'service_role' OR att.worker_ref IS NULL
    OR att.status<>'active' OR att.expires_at<=now() OR
    att.model_key<>NEW.model_key THEN
   RAISE EXCEPTION 'Worker permission revoked before result settlement';
  END IF;
  INSERT INTO public.ai_workforce_operator_events(
   tenant_id,product_key,admission_id,worker_ref,event_key,operator_reference)
  VALUES(NEW.tenant_id,NEW.product_key,NEW.id,NEW.worker_ref,
   'worker_settlement_review',att.operator_reference);
 ELSIF OLD.status='processing' AND NEW.status='reconciliation_required' THEN
  INSERT INTO public.ai_workforce_operator_events(
    tenant_id,product_key,admission_id,worker_ref,event_key)
  VALUES(NEW.tenant_id,NEW.product_key,NEW.id,NEW.worker_ref,'uncertain_usage_held');
 END IF;
 RETURN NEW;
END $lease$;
CREATE TRIGGER ai_workforce_readonly_lease_guard
 BEFORE UPDATE OF status ON public.ai_workforce_readonly_admissions
 FOR EACH ROW EXECUTE FUNCTION public.enforce_ai_workforce_readonly_lease();

-- Reconciliation watchdog: if a worker dies, the reserved money remains
-- HELD and the task goes into a controlled human investigation queue.
CREATE FUNCTION public.quarantine_stale_ai_workforce_readonly(
 _tenant uuid,_product text,_minutes integer DEFAULT 15,_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $quarantine$
DECLARE item record; quarantined integer:=0;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR _product<>'omniqora'
    OR _minutes IS NULL OR _minutes NOT BETWEEN 15 AND 1440
    OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 20 THEN
   RAISE EXCEPTION 'Trusted bounded reconciliation operator required';
 END IF;
 FOR item IN
  SELECT a.id AS admission_id,a.run_id,a.job_id FROM public.ai_workforce_readonly_admissions a
  JOIN public.intelligence_jobs j ON j.id=a.job_id
    AND j.tenant_id=a.tenant_id AND j.product_key=a.product_key
  JOIN public.ai_agent_runs r ON r.id=a.run_id
    AND r.tenant_id=a.tenant_id AND r.product_key=a.product_key
  JOIN public.ai_budgeted_run_reservations b ON b.id=a.reservation_id
    AND b.run_id=a.run_id AND b.tenant_id=a.tenant_id AND b.product_key=a.product_key
  WHERE a.tenant_id=_tenant AND a.product_key=_product
    AND a.status='processing' AND j.status='processing'
    AND r.status='running' AND b.status='reserved'
    AND j.locked_at<=now()-make_interval(mins=>_minutes)
  ORDER BY j.locked_at LIMIT _limit FOR UPDATE OF a,j,r,b SKIP LOCKED
 LOOP
  UPDATE public.ai_workforce_readonly_admissions
    SET status='reconciliation_required',finished_at=now() WHERE id=item.admission_id;
  UPDATE public.intelligence_jobs SET status='waiting_review',
    locked_at=NULL,last_error='Worker stalled; provider cost requires review',
    updated_at=now() WHERE id=item.job_id;
  UPDATE public.ai_agent_runs SET status='waiting_review',updated_at=now()
    WHERE id=item.run_id;
  INSERT INTO public.ai_workforce_operator_events(
   tenant_id,product_key,admission_id,event_key)
  VALUES(_tenant,_product,item.admission_id,'stale_job_quarantined');
  quarantined:=quarantined+1;
 END LOOP;
 RETURN jsonb_build_object('quarantined',quarantined,'reservationsReleased',0,
   'humanReconciliationRequired',quarantined>0,'modelCalls',0);
END $quarantine$;

-- Emergency operator STOP is separate from worker credentials and worker
-- renewal. It disables the pilot and revokes all worker allowlist grants, but
-- does NOT erase uncertain usage or release the reserved amount.
CREATE FUNCTION public.emergency_stop_ai_workforce_readonly(
 _tenant uuid,_product text,_operator_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $stop$
DECLARE killed integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR _product<>'omniqora'
   OR length(btrim(COALESCE(_operator_reference,''))) NOT BETWEEN 16 AND 240 THEN
  RAISE EXCEPTION 'Privileged emergency-stop operator evidence required';
 END IF;
 UPDATE public.ai_workforce_readonly_pilots
 SET enabled=false,expires_at=now(),updated_at=now()
 WHERE tenant_id=_tenant AND product_key=_product;
 IF NOT FOUND THEN RAISE EXCEPTION 'No controlled CRM pilot in tenant scope'; END IF;
 UPDATE public.ai_workforce_worker_allowlist SET
  status='revoked',expires_at=now(),updated_at=now()
 WHERE tenant_id=_tenant AND product_key=_product AND status='active';
 GET DIAGNOSTICS killed=ROW_COUNT;
 INSERT INTO public.ai_workforce_operator_events(
  tenant_id,product_key,event_key,operator_reference)
 VALUES(_tenant,_product,'pilot_emergency_stopped',btrim(_operator_reference));
 RETURN jsonb_build_object('pilotEnabled',false,'workerPermitsRevoked',killed,
  'queuedWorkDisabled',true,'reservationsReleased',0,
  'outstandingChargeReconciliationRequired',true);
END $stop$;

REVOKE ALL ON FUNCTION public.configure_ai_workforce_worker_allowlist(uuid,text,text,text,boolean,timestamptz,integer,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enforce_ai_workforce_readonly_lease() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.quarantine_stale_ai_workforce_readonly(uuid,text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.emergency_stop_ai_workforce_readonly(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_ai_workforce_worker_allowlist(uuid,text,text,text,boolean,timestamptz,integer,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_ai_workforce_readonly_lease() TO service_role;
GRANT EXECUTE ON FUNCTION public.quarantine_stale_ai_workforce_readonly(uuid,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.emergency_stop_ai_workforce_readonly(uuid,text,text) TO service_role;

COMMIT;
