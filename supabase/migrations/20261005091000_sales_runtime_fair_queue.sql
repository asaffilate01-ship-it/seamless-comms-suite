BEGIN;
-- Already prepared drafts and unfinished manual work must not consume the batch
-- limit forever. Select only new work, CRM outcomes to reconcile, or suppressed
-- enrollments needing cancellation. The tenant lock and unique action key remain.
CREATE OR REPLACE FUNCTION public.sales_v1_prepare_due(_tenant uuid,_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e record; a public.sales_sequence_actions; s jsonb; task uuid; n integer:=0; synced integer:=0; ts text;
BEGIN
 PERFORM public.sales_v1_assert_write(_tenant);
 IF _limit IS NULL OR _limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Batch limit must be 1 to 100'; END IF;
 FOR e IN SELECT en.*,seq.product_key FROM public.sales_sequence_enrolments en
  JOIN public.sales_sequences seq ON seq.id=en.sequence_id AND seq.tenant_id=en.tenant_id
  WHERE en.tenant_id=_tenant AND en.runtime_version=1 AND en.status='active' AND seq.status='active'
   AND en.next_action_at<=now()
   AND (
    EXISTS(SELECT 1 FROM public.sales_contact_suppressions x WHERE x.tenant_id=en.tenant_id AND x.person_id=en.person_id)
    OR NOT EXISTS(SELECT 1 FROM public.sales_sequence_actions x WHERE x.tenant_id=en.tenant_id AND x.enrolment_id=en.id AND x.step_index=en.current_step)
    OR EXISTS(SELECT 1 FROM public.sales_sequence_actions x JOIN public.crm_tasks t ON t.id=x.task_id AND t.tenant_id=x.tenant_id
     WHERE x.tenant_id=en.tenant_id AND x.enrolment_id=en.id AND x.step_index=en.current_step AND x.status='manual_open' AND t.status IN('completed','cancelled'))
   )
  ORDER BY en.next_action_at,en.id LIMIT _limit FOR UPDATE OF en SKIP LOCKED LOOP
  IF EXISTS(SELECT 1 FROM public.sales_contact_suppressions WHERE tenant_id=_tenant AND person_id=e.person_id) THEN
   PERFORM public.sales_v1_cancel_enrolment(_tenant,e.id,'cancelled','opt_out'); CONTINUE;
  END IF;
  SELECT * INTO a FROM public.sales_sequence_actions WHERE enrolment_id=e.id AND step_index=e.current_step;
  IF FOUND THEN
   IF a.status='manual_open' AND a.task_id IS NOT NULL THEN
    SELECT status INTO ts FROM public.crm_tasks WHERE id=a.task_id AND tenant_id=_tenant;
    IF ts='completed' THEN
     PERFORM public.sales_v1_finish_manual(_tenant,a.id,'Completed in CRM; reconciled by sales queue'); synced:=synced+1;
    ELSIF ts='cancelled' THEN
     PERFORM public.sales_v1_cancel_enrolment(_tenant,e.id,'cancelled','crm_task_cancelled');
    END IF;
   END IF;
   CONTINUE;
  END IF;
  s:=e.steps_snapshot->e.current_step;
  IF s IS NULL THEN RAISE EXCEPTION 'Invalid enrollment snapshot'; END IF;
  task:=NULL;
  IF s->>'kind' IN('call','task') THEN
   INSERT INTO public.crm_tasks(tenant_id,title,description,due_at,assignee_user_id,related_type,related_id,source_product_key,external_ref,created_by)
   VALUES(_tenant,s->>'title',COALESCE(s->>'body',''),e.next_action_at,e.owner_user_id,'person',e.person_id::text,e.product_key,
    'sales-v1:'||e.id::text||':'||e.current_step::text,auth.uid()) RETURNING id INTO task;
  END IF;
  INSERT INTO public.sales_sequence_actions(tenant_id,enrolment_id,step_index,kind,title,body,subject,status,task_id,created_by)
  VALUES(_tenant,e.id,e.current_step,s->>'kind',s->>'title',COALESCE(s->>'body',''),s->>'subject',
   CASE WHEN s->>'kind' IN('call','task') THEN 'manual_open' ELSE 'pending_review' END,task,auth.uid());
  n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('prepared',n,'reconciled',synced,'deliveryMode','review_only');
END $$;
REVOKE ALL ON FUNCTION public.sales_v1_prepare_due(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_v1_prepare_due(uuid,integer) TO authenticated;
COMMIT;
