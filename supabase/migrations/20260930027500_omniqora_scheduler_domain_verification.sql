-- Scheduler execution state and custom-domain ownership verification.
BEGIN;

ALTER TABLE public.platform_schedules
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS verification_token_hash text,
  ADD COLUMN IF NOT EXISTS verification_record_name text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE INDEX IF NOT EXISTS platform_schedules_claim_v2_idx
  ON public.platform_schedules(enabled,next_run_at,locked_at);

CREATE OR REPLACE FUNCTION public.claim_platform_schedules(_limit integer DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 RETURN QUERY
 WITH due AS(
  SELECT s.id
  FROM public.platform_schedules s
  WHERE s.enabled=true
    AND s.next_run_at<=now()
    AND (s.locked_at IS NULL OR s.locked_at<now()-interval '5 minutes')
  ORDER BY s.next_run_at
  LIMIT LEAST(GREATEST(_limit,1),100)
  FOR UPDATE SKIP LOCKED
 )
 UPDATE public.platform_schedules s
 SET locked_at=now(),attempts=s.attempts+1,updated_at=now()
 FROM due d
 WHERE s.id=d.id
 RETURNING jsonb_build_object(
  'id',s.id,'tenantId',s.tenant_id,'tenantProductId',s.tenant_product_id,
  'moduleKey',s.module_key,'scheduleKey',s.schedule_key,'timezone',s.timezone,
  'intervalMinutes',s.interval_minutes,'actionKey',s.action_key,'actionPayload',s.action_payload,
  'nextRunAt',s.next_run_at,'attempts',s.attempts
 );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_platform_schedules(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_platform_schedules(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_platform_schedule(
 _schedule uuid,_success boolean,_next_run_at timestamptz,_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 UPDATE public.platform_schedules SET
  last_run_at=CASE WHEN _success THEN now() ELSE last_run_at END,
  next_run_at=_next_run_at,
  locked_at=NULL,
  last_error=CASE WHEN _success THEN NULL ELSE left(COALESCE(_error,'schedule failed'),2000) END,
  updated_at=now()
 WHERE id=_schedule;
 IF NOT FOUND THEN RAISE EXCEPTION 'schedule_not_found'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finish_platform_schedule(uuid,boolean,timestamptz,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_platform_schedule(uuid,boolean,timestamptz,text)
 TO service_role;

COMMIT;
