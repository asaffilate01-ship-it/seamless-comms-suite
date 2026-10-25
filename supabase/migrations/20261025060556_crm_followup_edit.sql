BEGIN;
CREATE OR REPLACE FUNCTION public.crm_edit_deal_followup(_tenant uuid,_task uuid,_expected_updated_at timestamptz,_title text,_due_at timestamptz,_priority text)
RETURNS public.crm_tasks LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE task public.crm_tasks; previous public.crm_tasks; deal public.crm_opportunities;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_write(_tenant,auth.uid()) THEN RAISE EXCEPTION 'CRM write access denied'; END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.crm') THEN RAISE EXCEPTION 'Omniqora CRM entitlement required'; END IF;
 SELECT * INTO task FROM public.crm_tasks WHERE tenant_id=_tenant AND id=_task FOR UPDATE;
 IF NOT FOUND OR task.related_type IS DISTINCT FROM 'opportunity' THEN RAISE EXCEPTION 'Deal follow-up unavailable'; END IF;
 SELECT * INTO deal FROM public.crm_opportunities WHERE tenant_id=_tenant AND id::text=task.related_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CRM opportunity unavailable'; END IF;
 IF _expected_updated_at IS NULL OR task.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'This follow-up changed. Refresh and try again.'; END IF;
 IF task.status NOT IN ('open','in_progress') THEN RAISE EXCEPTION 'Only active follow-ups can be edited'; END IF;
 IF _title IS NULL OR length(btrim(_title)) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Follow-up title required (maximum 240 characters)'; END IF;
 IF _priority IS NULL OR _priority NOT IN ('low','normal','high','urgent') THEN RAISE EXCEPTION 'Invalid priority'; END IF;
 IF _due_at IS NOT NULL AND NOT isfinite(_due_at) THEN RAISE EXCEPTION 'Invalid due date'; END IF;
 IF ROW(task.title,task.due_at,task.priority) IS NOT DISTINCT FROM ROW(btrim(_title),_due_at,_priority) THEN RETURN task; END IF;
 previous:=task;
 UPDATE public.crm_tasks SET title=btrim(_title),due_at=_due_at,priority=_priority WHERE tenant_id=_tenant AND id=_task RETURNING * INTO task;
 INSERT INTO public.crm_activities(tenant_id,activity_type,summary,opportunity_id,person_id,company_id,actor_user_id,metadata)
 VALUES(_tenant,'task','Follow-up updated: '||task.title,deal.id,deal.person_id,deal.company_id,auth.uid(),jsonb_build_object('taskId',task.id,
 'before',jsonb_build_object('title',previous.title,'dueAt',previous.due_at,'priority',previous.priority),
 'after',jsonb_build_object('title',task.title,'dueAt',task.due_at,'priority',task.priority)));
 RETURN task;
END; $$;
REVOKE ALL ON FUNCTION public.crm_edit_deal_followup(uuid,uuid,timestamptz,text,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_edit_deal_followup(uuid,uuid,timestamptz,text,timestamptz,text) TO authenticated;
COMMIT;
