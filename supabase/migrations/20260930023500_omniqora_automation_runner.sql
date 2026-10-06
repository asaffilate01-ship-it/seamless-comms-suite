-- Durable Automation runner and typed action queue.
BEGIN;

ALTER TABLE public.automation_runs
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  ADD COLUMN IF NOT EXISTS step_count integer NOT NULL DEFAULT 0 CHECK(step_count>=0),
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS automation_runs_claim_idx
  ON public.automation_runs(status,next_run_at,created_at);

CREATE TABLE IF NOT EXISTS public.automation_action_queue(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.automation_runs(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  module_key text,
  action_key text NOT NULL,
  risk text NOT NULL DEFAULT 'low' CHECK(risk IN ('read','low','medium','high')),
  requires_approval boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'queued'
    CHECK(state IN ('queued','approval','approved','executing','completed','failed','rejected','cancelled')),
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id,node_id)
);
CREATE INDEX IF NOT EXISTS automation_action_queue_claim_idx
  ON public.automation_action_queue(state,created_at);

ALTER TABLE public.automation_action_queue ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.automation_action_queue TO authenticated;
GRANT ALL ON public.automation_action_queue TO service_role;
DROP POLICY IF EXISTS "automation action tenant read" ON public.automation_action_queue;
CREATE POLICY "automation action tenant read" ON public.automation_action_queue FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "automation action tenant review" ON public.automation_action_queue;
CREATE POLICY "automation action tenant review" ON public.automation_action_queue FOR UPDATE TO authenticated
 USING(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))
 WITH CHECK(public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]));

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.automation_action_queue;
CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.automation_action_queue
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

CREATE OR REPLACE FUNCTION public.claim_automation_runs(_limit integer DEFAULT 20)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 RETURN QUERY
 WITH jobs AS(
  SELECT r.id
  FROM public.automation_runs r
  WHERE (
    (r.status IN ('queued','running','waiting') AND r.next_run_at<=now())
    OR (r.status='running' AND r.locked_at<now()-interval '5 minutes')
  )
  ORDER BY r.created_at
  LIMIT LEAST(GREATEST(_limit,1),100)
  FOR UPDATE SKIP LOCKED
 )
 UPDATE public.automation_runs r
 SET status='running',attempts=r.attempts+1,locked_at=now(),updated_at=now()
 FROM jobs j
 WHERE r.id=j.id
 RETURNING jsonb_build_object(
  'id',r.id,'tenantId',r.tenant_id,'workflowId',r.workflow_id,
  'workflowVersion',r.workflow_version,'eventId',r.event_id,
  'currentNodeId',r.current_node_id,'context',r.context,
  'stepCount',r.step_count,'attempts',r.attempts
 );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_automation_runs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automation_runs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_automation_run_step(
 _run uuid,_status text,_node text,_context jsonb,_next_run_at timestamptz,_step_count integer,_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
 IF _status NOT IN ('running','waiting','approval','completed','failed','cancelled') THEN
  RAISE EXCEPTION 'invalid_automation_run_status';
 END IF;
 UPDATE public.automation_runs SET
  status=_status,current_node_id=_node,context=COALESCE(_context,'{}'::jsonb),
  next_run_at=COALESCE(_next_run_at,now()),step_count=_step_count,last_error=left(_error,2000),
  locked_at=NULL,
  started_at=COALESCE(started_at,CASE WHEN _status<>'queued' THEN now() ELSE NULL END),
  completed_at=CASE WHEN _status IN ('completed','failed','cancelled') THEN now() ELSE completed_at END,
  updated_at=now()
 WHERE id=_run;
 IF NOT FOUND THEN RAISE EXCEPTION 'automation_run_not_found'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finish_automation_run_step(uuid,text,text,jsonb,timestamptz,integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_automation_run_step(uuid,text,text,jsonb,timestamptz,integer,text)
 TO service_role;

COMMIT;
