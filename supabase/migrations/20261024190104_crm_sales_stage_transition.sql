BEGIN;
-- Keep stage, outcome, probability and the activity receipt in one transaction.
-- Invoker privileges preserve the existing CRM table RLS boundary.
CREATE OR REPLACE FUNCTION public.crm_move_opportunity(
  _tenant uuid, _opportunity uuid, _stage uuid, _expected_updated_at timestamptz
) RETURNS public.crm_opportunities
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  deal public.crm_opportunities;
  destination public.crm_pipeline_stages;
  previous_stage uuid;
  previous_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write(_tenant, auth.uid()) THEN
    RAISE EXCEPTION 'CRM write access denied';
  END IF;
  IF NOT public.has_tenant_entitlement(_tenant, 'omniqora.crm') THEN
    RAISE EXCEPTION 'Omniqora CRM entitlement required';
  END IF;
  SELECT * INTO deal FROM public.crm_opportunities
    WHERE tenant_id = _tenant AND id = _opportunity FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM opportunity unavailable'; END IF;
  IF _expected_updated_at IS NULL OR deal.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'This deal changed. Refresh and try again.';
  END IF;
  SELECT s.* INTO destination FROM public.crm_pipeline_stages s
    JOIN public.crm_pipelines p ON p.id = s.pipeline_id AND p.tenant_id = s.tenant_id
    WHERE s.tenant_id = _tenant AND s.id = _stage AND s.pipeline_id = deal.pipeline_id AND p.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'CRM pipeline stage unavailable'; END IF;
  IF deal.stage_id = destination.id THEN RETURN deal; END IF;
  previous_stage := deal.stage_id;
  previous_status := deal.status;
  UPDATE public.crm_opportunities SET stage_id = destination.id,
    status = CASE WHEN destination.is_closed_won THEN 'won' WHEN destination.is_closed_lost THEN 'lost' ELSE 'open' END,
    probability_percent = CASE WHEN destination.is_closed_won THEN 100 WHEN destination.is_closed_lost THEN 0 ELSE destination.probability_percent END
    WHERE tenant_id = _tenant AND id = _opportunity RETURNING * INTO deal;
  INSERT INTO public.crm_activities(tenant_id, activity_type, summary, person_id, company_id,
    opportunity_id, actor_user_id, source_product_key, metadata)
  VALUES(_tenant, 'opportunity_event', 'Deal moved to ' || destination.name, deal.person_id, deal.company_id,
    deal.id, auth.uid(), 'omniqora', jsonb_build_object('fromStageId', previous_stage,
      'toStageId', destination.id, 'fromStatus', previous_status, 'status', deal.status));
  RETURN deal;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_move_opportunity(uuid,uuid,uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_move_opportunity(uuid,uuid,uuid,timestamptz) TO authenticated;
COMMIT;
