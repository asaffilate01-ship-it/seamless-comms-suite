BEGIN;
CREATE TABLE public.practice_recurring_work(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),tenant_product_id uuid NOT NULL REFERENCES tenant_products(id),
 client_id uuid NOT NULL REFERENCES practice_clients(id),template_id uuid NOT NULL REFERENCES practice_service_templates(id),
 next_on date NOT NULL,anchor_day integer NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),interval_months integer NOT NULL CHECK(interval_months IN (1,3,12)),
 internal_days integer NOT NULL CHECK(internal_days BETWEEN 0 AND 366),external_days integer NOT NULL CHECK(external_days BETWEEN 0 AND 366),
 enabled boolean NOT NULL DEFAULT true,created_by uuid NOT NULL REFERENCES auth.users(id),
 UNIQUE(tenant_product_id,client_id,template_id)
);
ALTER TABLE practice_recurring_work ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON practice_recurring_work TO authenticated;
GRANT ALL ON practice_recurring_work TO service_role;
CREATE POLICY recurring_read ON practice_recurring_work FOR SELECT TO authenticated USING(public.practice_workspace_access(tenant_id,tenant_product_id));
ALTER TABLE practice_work_requests ADD COLUMN chase_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE practice_work_requests ADD COLUMN last_chased_at timestamptz;
ALTER TABLE practice_work_requests ADD COLUMN chase_count integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.configure_practice_automation(_tenant uuid,_product uuid,_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid; s practice_service_templates; months integer;
BEGIN
 IF NOT public.practice_workspace_access(_tenant,_product,true) OR NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=_tenant AND user_id=auth.uid() AND role::text IN ('owner','admin')) THEN RAISE EXCEPTION 'Practice admin required'; END IF;
 IF _input->>'operation'='request.chasing' THEN
  UPDATE practice_work_requests SET chase_enabled=(_input->>'enabled')::boolean WHERE id=(_input->>'requestId')::uuid AND tenant_id=_tenant AND tenant_product_id=_product RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
 ELSIF _input->>'operation'='recurrence.save' THEN
  SELECT * INTO s FROM practice_service_templates WHERE id=(_input->>'serviceId')::uuid AND tenant_id=_tenant AND tenant_product_id=_product;
  IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM practice_clients WHERE id=(_input->>'clientId')::uuid AND tenant_id=_tenant AND tenant_product_id=_product) THEN RAISE EXCEPTION 'Client or template outside workspace'; END IF;
  months:=CASE s.recurrence WHEN 'monthly' THEN 1 WHEN 'quarterly' THEN 3 WHEN 'annual' THEN 12 END;
  IF months IS NULL THEN RAISE EXCEPTION 'Recurring service template required'; END IF;
  INSERT INTO practice_recurring_work(tenant_id,tenant_product_id,client_id,template_id,next_on,anchor_day,interval_months,internal_days,external_days,enabled,created_by)
  VALUES(_tenant,_product,(_input->>'clientId')::uuid,s.id,(_input->>'nextOn')::date,extract(day from (_input->>'nextOn')::date),months,(_input->>'internalDays')::int,(_input->>'externalDays')::int,(_input->>'enabled')::boolean,auth.uid())
  ON CONFLICT(tenant_product_id,client_id,template_id) DO UPDATE SET next_on=EXCLUDED.next_on,anchor_day=EXCLUDED.anchor_day,interval_months=EXCLUDED.interval_months,internal_days=EXCLUDED.internal_days,external_days=EXCLUDED.external_days,enabled=EXCLUDED.enabled
  RETURNING id INTO result;
 ELSE RAISE EXCEPTION 'Unknown automation operation'; END IF;
 INSERT INTO practice_work_audit(tenant_id,tenant_product_id,actor_id,operation,entity_id) VALUES(_tenant,_product,auth.uid(),_input->>'operation',result);
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.configure_practice_automation(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_practice_automation(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_practice_automation(_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE schedule practice_recurring_work; s practice_service_templates; r practice_work_requests; job uuid; month_start date; product text; jobs integer:=0; reminders integer:=0;
BEGIN
 -- Worker only. Locks and period uniqueness make retries safe; never sends messages directly.
 FOR schedule IN SELECT w.* FROM practice_recurring_work w JOIN tenant_products p ON p.id=w.tenant_product_id AND p.tenant_id=w.tenant_id
 JOIN tenant_module_entitlements e ON e.tenant_product_id=p.id AND e.tenant_id=p.tenant_id AND e.module_key='practice.core'
 WHERE w.enabled AND w.next_on<=current_date AND p.status='active' AND e.enabled
 AND (e.starts_at IS NULL OR e.starts_at<=now()) AND (e.ends_at IS NULL OR e.ends_at>now())
 ORDER BY w.next_on LIMIT greatest(1,least(_limit,100)) FOR UPDATE OF w SKIP LOCKED LOOP
  SELECT * INTO s FROM practice_service_templates WHERE id=schedule.template_id AND tenant_id=schedule.tenant_id AND tenant_product_id=schedule.tenant_product_id;
  IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM practice_clients WHERE id=schedule.client_id AND tenant_id=schedule.tenant_id AND tenant_product_id=schedule.tenant_product_id AND status<>'closed') THEN CONTINUE; END IF;
  INSERT INTO practice_engagements(tenant_id,tenant_product_id,client_id,service_key,period_key,status,due_at,internal_due_at,template_id,template_snapshot)
  VALUES(schedule.tenant_id,schedule.tenant_product_id,schedule.client_id,s.service_key,schedule.next_on::text,'collecting',((schedule.next_on+schedule.external_days)::timestamp+interval '12 hours') AT TIME ZONE 'UTC',((schedule.next_on+schedule.internal_days)::timestamp+interval '12 hours') AT TIME ZONE 'UTC',s.id,to_jsonb(s))
  ON CONFLICT(tenant_product_id,client_id,template_id,period_key) WHERE template_id IS NOT NULL DO NOTHING RETURNING id INTO job;
  IF job IS NOT NULL THEN
   INSERT INTO practice_job_phases(tenant_id,tenant_product_id,engagement_id,position,title,budget_minutes)
   SELECT schedule.tenant_id,schedule.tenant_product_id,job,(ordinality-1)::int,value->>'title',(value->>'budgetMinutes')::int FROM jsonb_array_elements(s.phases) WITH ORDINALITY;
   jobs:=jobs+1;
  END IF;
  month_start:=(date_trunc('month',schedule.next_on)+make_interval(months=>schedule.interval_months))::date;
  UPDATE practice_recurring_work SET next_on=month_start+least(schedule.anchor_day,extract(day from month_start+interval '1 month - 1 day')::int)-1 WHERE id=schedule.id;
 END LOOP;
 FOR r IN SELECT q.* FROM practice_work_requests q JOIN practice_engagements j ON j.id=q.engagement_id
 JOIN tenant_products p ON p.id=q.tenant_product_id AND p.tenant_id=q.tenant_id
 JOIN tenant_module_entitlements e ON e.tenant_product_id=p.id AND e.tenant_id=p.tenant_id AND e.module_key='practice.core'
 WHERE q.chase_enabled AND q.status='outstanding' AND q.due_at<=now() AND q.chase_count<3
 AND (q.last_chased_at IS NULL OR q.last_chased_at<=now()-interval '3 days') AND j.status NOT IN ('completed','cancelled')
 AND p.status='active' AND e.enabled AND (e.starts_at IS NULL OR e.starts_at<=now()) AND (e.ends_at IS NULL OR e.ends_at>now())
 ORDER BY q.due_at LIMIT greatest(1,least(_limit,100)) FOR UPDATE OF q SKIP LOCKED LOOP
  SELECT product_key INTO product FROM tenant_products WHERE id=r.tenant_product_id;
  INSERT INTO platform_events(id,tenant_id,tenant_product_id,product_key,event_type,event_version,occurred_at,environment,subject_type,subject_id,correlation_id,idempotency_key,data_classification,payload)
  VALUES(gen_random_uuid(),r.tenant_id,r.tenant_product_id,product,'practice.request.reminder_due',1,now(),'production','practice_request',r.id::text,r.id::text,'practice-reminder:'||r.id::text||':'||(r.chase_count+1)::text,'internal',jsonb_build_object('requestId',r.id,'clientId',r.client_id,'engagementId',r.engagement_id,'attempt',r.chase_count+1,'requiresOutstandingRecheck',true));
  UPDATE practice_work_requests SET last_chased_at=now(),chase_count=chase_count+1 WHERE id=r.id;
  reminders:=reminders+1;
 END LOOP;
 RETURN jsonb_build_object('jobsCreated',jobs,'reminderEventsQueued',reminders);
END;
$$;
REVOKE ALL ON FUNCTION public.run_practice_automation(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_practice_automation(integer) TO service_role;
COMMIT;
