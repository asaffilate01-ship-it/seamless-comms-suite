-- Automation typed action worker queue claims.
BEGIN;

ALTER TABLE public.automation_action_queue
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0);

CREATE INDEX IF NOT EXISTS automation_action_queue_worker_idx
  ON public.automation_action_queue(state,created_at);

CREATE OR REPLACE FUNCTION public.claim_automation_actions(_limit integer DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 RETURN QUERY
 WITH jobs AS(
  SELECT a.id
  FROM public.automation_action_queue a
  WHERE (
    a.state IN ('queued','approved')
    OR (a.state='executing' AND a.locked_at<now()-interval '5 minutes')
  )
  ORDER BY a.created_at
  LIMIT LEAST(GREATEST(_limit,1),100)
  FOR UPDATE SKIP LOCKED
 )
 UPDATE public.automation_action_queue a
 SET state='executing',attempts=a.attempts+1,locked_at=now(),updated_at=now()
 FROM jobs j
 WHERE a.id=j.id
 RETURNING jsonb_build_object(
  'id',a.id,'tenantId',a.tenant_id,'runId',a.run_id,'workflowId',a.workflow_id,
  'nodeId',a.node_id,'moduleKey',a.module_key,'actionKey',a.action_key,
  'risk',a.risk,'input',a.input,'attempts',a.attempts
 );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_automation_actions(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_actions(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_automation_action(
 _action uuid,_success boolean,_result jsonb DEFAULT '{}'::jsonb,_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE a public.automation_action_queue;
BEGIN
 SELECT * INTO a FROM public.automation_action_queue WHERE id=_action FOR UPDATE;
 IF NOT FOUND OR a.state<>'executing' THEN RAISE EXCEPTION 'automation_action_not_executing'; END IF;
 UPDATE public.automation_action_queue SET
  state=CASE WHEN _success THEN 'completed' ELSE 'failed' END,
  result=COALESCE(_result,'{}'::jsonb),error=CASE WHEN _success THEN NULL ELSE left(COALESCE(_error,'action failed'),2000) END,
  executed_at=CASE WHEN _success THEN now() ELSE executed_at END,locked_at=NULL,updated_at=now()
 WHERE id=_action;
 UPDATE public.automation_runs SET
  status=CASE WHEN _success THEN 'waiting' ELSE 'failed' END,
  next_run_at=now(),locked_at=NULL,
  last_error=CASE WHEN _success THEN NULL ELSE left(COALESCE(_error,'automation action failed'),2000) END,
  updated_at=now(),
  completed_at=CASE WHEN _success THEN completed_at ELSE now() END
 WHERE id=a.run_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finish_automation_action(uuid,boolean,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_automation_action(uuid,boolean,jsonb,text) TO service_role;

COMMIT;
