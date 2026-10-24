BEGIN;
CREATE OR REPLACE FUNCTION public.crm_convert_lead(
 _tenant uuid, _lead uuid, _stage uuid, _expected_updated_at timestamptz,
 _amount numeric DEFAULT NULL, _currency text DEFAULT NULL
) RETURNS public.crm_opportunities
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE lead public.crm_leads; stage public.crm_pipeline_stages; deal public.crm_opportunities;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_write(_tenant,auth.uid()) THEN RAISE EXCEPTION 'CRM write access denied'; END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.crm') THEN RAISE EXCEPTION 'Omniqora CRM entitlement required'; END IF;
 SELECT * INTO lead FROM public.crm_leads WHERE tenant_id=_tenant AND id=_lead FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CRM lead unavailable'; END IF;
 -- The locked lead is the idempotency record. Retries return its existing deal.
 IF lead.converted_opportunity_id IS NOT NULL THEN
  SELECT * INTO deal FROM public.crm_opportunities WHERE tenant_id=_tenant AND id=lead.converted_opportunity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Converted deal unavailable'; END IF;
  RETURN deal;
 END IF;
 IF _expected_updated_at IS NULL OR lead.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'This lead changed. Refresh and try again.'; END IF;
 IF lead.status NOT IN ('new','working','qualified') THEN RAISE EXCEPTION 'Only active leads can be converted'; END IF;
 IF _amount IS NOT NULL AND (_amount < 0 OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount >= 10000000000000000) THEN RAISE EXCEPTION 'Invalid deal value'; END IF;
 IF (_currency IS NOT NULL AND _currency !~ '^[A-Z]{3}$') OR (_amount IS NOT NULL AND _currency IS NULL) THEN RAISE EXCEPTION 'Deal currency required'; END IF;
 SELECT s.* INTO stage FROM public.crm_pipeline_stages s JOIN public.crm_pipelines p ON p.id=s.pipeline_id AND p.tenant_id=s.tenant_id
 WHERE s.tenant_id=_tenant AND s.id=_stage AND p.is_active AND NOT s.is_closed_won AND NOT s.is_closed_lost;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open pipeline stage required'; END IF;
 IF lead.person_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_people WHERE tenant_id=_tenant AND id=lead.person_id) THEN RAISE EXCEPTION 'CRM linked person unavailable'; END IF;
 IF lead.company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_companies WHERE tenant_id=_tenant AND id=lead.company_id) THEN RAISE EXCEPTION 'CRM linked company unavailable'; END IF;
 INSERT INTO public.crm_opportunities(tenant_id,pipeline_id,stage_id,person_id,company_id,title,amount,currency,
 probability_percent,status,owner_user_id,source_product_key,metadata)
 VALUES(_tenant,stage.pipeline_id,stage.id,lead.person_id,lead.company_id,lead.title,_amount,_currency,
 stage.probability_percent,'open',lead.owner_user_id,lead.source_product_key,jsonb_build_object('sourceLeadId',lead.id)) RETURNING * INTO deal;
 UPDATE public.crm_leads SET status='converted',converted_opportunity_id=deal.id WHERE tenant_id=_tenant AND id=_lead;
 INSERT INTO public.crm_activities(tenant_id,activity_type,summary,lead_id,opportunity_id,person_id,company_id,actor_user_id,metadata)
 VALUES(_tenant,'lead_event','Lead converted to deal',lead.id,deal.id,lead.person_id,lead.company_id,auth.uid(),jsonb_build_object('previousStatus',lead.status,'pipelineId',stage.pipeline_id));
 RETURN deal;
END; $$;
REVOKE ALL ON FUNCTION public.crm_convert_lead(uuid,uuid,uuid,timestamptz,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_convert_lead(uuid,uuid,uuid,timestamptz,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_complete_deal_followup(_tenant uuid,_task uuid,_expected_updated_at timestamptz)
RETURNS public.crm_tasks LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE task public.crm_tasks; deal public.crm_opportunities;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_write(_tenant,auth.uid()) THEN RAISE EXCEPTION 'CRM write access denied'; END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.crm') THEN RAISE EXCEPTION 'Omniqora CRM entitlement required'; END IF;
 SELECT * INTO task FROM public.crm_tasks WHERE tenant_id=_tenant AND id=_task FOR UPDATE;
 IF NOT FOUND OR task.related_type IS DISTINCT FROM 'opportunity' THEN RAISE EXCEPTION 'Deal follow-up unavailable'; END IF;
 SELECT * INTO deal FROM public.crm_opportunities WHERE tenant_id=_tenant AND id::text=task.related_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CRM opportunity unavailable'; END IF;
 IF task.status='completed' THEN RETURN task; END IF;
 IF _expected_updated_at IS NULL OR task.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'This follow-up changed. Refresh and try again.'; END IF;
 IF task.status NOT IN ('open','in_progress') THEN RAISE EXCEPTION 'Only active follow-ups can be completed'; END IF;
 UPDATE public.crm_tasks SET status='completed' WHERE tenant_id=_tenant AND id=_task RETURNING * INTO task;
 INSERT INTO public.crm_activities(tenant_id,activity_type,summary,opportunity_id,person_id,company_id,actor_user_id,metadata)
 VALUES(_tenant,'task','Follow-up completed: '||task.title,deal.id,deal.person_id,deal.company_id,auth.uid(),jsonb_build_object('taskId',task.id,'status','completed'));
 RETURN task;
END; $$;
REVOKE ALL ON FUNCTION public.crm_complete_deal_followup(uuid,uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_complete_deal_followup(uuid,uuid,timestamptz) TO authenticated;
COMMIT;
