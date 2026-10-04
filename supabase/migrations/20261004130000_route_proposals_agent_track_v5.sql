-- Durable native-routing proposals and privacy-minimised Agent/Track/POD projections.
-- Vertical products retain their operational data; Omniqora stores only IDs,
-- aggregate route plans, public tracking state and proof metadata.
BEGIN;

CREATE TABLE IF NOT EXISTS public.routing_plan_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  external_route_id text NOT NULL CHECK(length(external_route_id) BETWEEN 1 AND 200),
  input_fingerprint text NOT NULL CHECK(length(input_fingerprint) BETWEEN 16 AND 128),
  plan_hash text NOT NULL CHECK(plan_hash ~ '^[a-f0-9]{64}$'),
  engine text NOT NULL,
  plan jsonb NOT NULL,
  status text NOT NULL DEFAULT 'review' CHECK(status IN ('review','approved','rejected','applied','expired','superseded')),
  source_service text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  applied_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS routing_plan_proposals_scope_idx
  ON public.routing_plan_proposals(tenant_id,product_key,status,created_at DESC);
CREATE INDEX IF NOT EXISTS routing_plan_proposals_input_idx
  ON public.routing_plan_proposals(tenant_id,product_key,external_route_id,input_fingerprint);
CREATE UNIQUE INDEX IF NOT EXISTS routing_plan_proposals_one_active_route_idx
  ON public.routing_plan_proposals(tenant_id,product_key,external_route_id)
  WHERE status IN ('review','approved');

CREATE TABLE IF NOT EXISTS public.external_pod_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
  external_job_id text NOT NULL CHECK(length(external_job_id) BETWEEN 1 AND 200),
  methods text[] NOT NULL DEFAULT '{}',
  evidence_count integer NOT NULL DEFAULT 0 CHECK(evidence_count>=0),
  captured_at timestamptz NOT NULL,
  source_event_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,product_key,external_job_id),
  UNIQUE(tenant_id,product_key,source_event_key)
);

ALTER TABLE public.routing_plan_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_pod_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.routing_plan_proposals,public.external_pod_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.routing_plan_proposals,public.external_pod_receipts TO service_role;
GRANT SELECT ON public.routing_plan_proposals,public.external_pod_receipts TO authenticated;

CREATE POLICY "routing proposals scoped read" ON public.routing_plan_proposals
FOR SELECT TO authenticated USING(
  public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid())
);
CREATE POLICY "external pod scoped read" ON public.external_pod_receipts
FOR SELECT TO authenticated USING(
  public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid())
);

CREATE OR REPLACE FUNCTION public.review_routing_plan_proposal(
  _proposal uuid,_decision text,_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proposal public.routing_plan_proposals%rowtype; route_count integer; unassigned_count integer;
BEGIN
  SELECT * INTO proposal FROM public.routing_plan_proposals WHERE id=_proposal FOR UPDATE;
  IF NOT FOUND OR (NOT public.can_write(proposal.tenant_id,auth.uid()) AND NOT public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Routing proposal access denied';
  END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Decision must be approved or rejected'; END IF;
  IF proposal.status<>'review' OR proposal.expires_at<=now() THEN RAISE EXCEPTION 'Routing proposal is not reviewable'; END IF;
  route_count := COALESCE(jsonb_array_length(proposal.plan->'routes'),0);
  unassigned_count := COALESCE(jsonb_array_length(proposal.plan->'unassigned'),0);
  IF _decision='approved' AND (route_count<1 OR unassigned_count>0) THEN
    RAISE EXCEPTION 'Only complete routing proposals can be approved';
  END IF;
  UPDATE public.routing_plan_proposals SET status=_decision,reviewed_by=auth.uid(),reviewed_at=now(),
    review_note=NULLIF(trim(COALESCE(_note,'')),''),updated_at=now() WHERE id=_proposal;
  RETURN jsonb_build_object('proposalId',_proposal,'status',_decision,'planHash',proposal.plan_hash);
END; $$;
REVOKE ALL ON FUNCTION public.review_routing_plan_proposal(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_routing_plan_proposal(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_routing_plan_proposals()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role'
    AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform service required'; END IF;
  UPDATE public.routing_plan_proposals SET status='expired',updated_at=now()
   WHERE status IN ('review','approved') AND expires_at<=now();
  GET DIAGNOSTICS affected=ROW_COUNT;
  RETURN affected;
END; $$;
REVOKE ALL ON FUNCTION public.expire_routing_plan_proposals() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_routing_plan_proposals() TO service_role;

COMMIT;
