-- Integrity hardening plus event-driven Notification/Search support.
BEGIN;

-- Immutable ledgers/version history: runtime users read them; controlled server RPCs append.
REVOKE INSERT,UPDATE,DELETE ON public.loyalty_ledger FROM authenticated;
DROP POLICY IF EXISTS "shared module write" ON public.loyalty_ledger;

REVOKE INSERT,UPDATE,DELETE ON public.platform_document_versions FROM authenticated;
DROP POLICY IF EXISTS "tenant module write" ON public.platform_document_versions;

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS source_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_event_user_uq
  ON public.user_notifications(tenant_id,user_id,source_event_id)
  WHERE source_event_id IS NOT NULL;

INSERT INTO public.platform_module_event_patterns(module_key,event_pattern) VALUES
 ('notifications.core','notification.requested'),
 ('notifications.core','automation.approval.requested'),
 ('search.core','customer.*'),
 ('search.core','company.*'),
 ('search.core','lead.*'),
 ('search.core','document.*'),
 ('search.core','marketplace.listing.*'),
 ('search.core','practice.client.*'),
 ('search.core','support.ticket.*')
ON CONFLICT(module_key,event_pattern) DO UPDATE SET enabled=true;

CREATE OR REPLACE FUNCTION public.create_support_ticket(
 _tenant uuid,_tenant_product uuid,_title text,_priority text,_conversation uuid,
 _queue uuid,_category text,_channel text,_customer_ref text,_source_product text,
 _external_ref text,_tags text[],_assignee uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE ticket_id uuid; sla public.support_sla_policies; first_due timestamptz; resolution_due timestamptz;
BEGIN
 IF _priority NOT IN ('low','normal','high','urgent') THEN RAISE EXCEPTION 'invalid_priority'; END IF;
 IF _channel NOT IN ('whatsapp','sms','email','voice','web','app','api','internal') THEN RAISE EXCEPTION 'invalid_channel'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products WHERE id=_tenant_product AND tenant_id=_tenant AND status='active') THEN
  RAISE EXCEPTION 'active_tenant_product_required';
 END IF;
 SELECT * INTO sla FROM public.support_sla_policies
  WHERE tenant_id=_tenant AND tenant_product_id=_tenant_product AND priority=_priority AND active=true
  ORDER BY created_at LIMIT 1;
 IF FOUND THEN
  first_due:=now()+(sla.first_response_minutes::text||' minutes')::interval;
  resolution_due:=now()+(sla.resolution_minutes::text||' minutes')::interval;
 END IF;
 INSERT INTO public.cases(tenant_id,conversation_id,title,status,priority,assignee)
 VALUES(_tenant,_conversation,_title,'new',_priority,_assignee)
 RETURNING id INTO ticket_id;
 INSERT INTO public.support_ticket_metadata(
  case_id,tenant_id,tenant_product_id,queue_id,category,channel,customer_ref,
  first_response_due_at,resolution_due_at,tags,source_product_key,external_ref
 ) VALUES(
  ticket_id,_tenant,_tenant_product,_queue,_category,_channel,_customer_ref,
  first_due,resolution_due,COALESCE(_tags,'{}'),_source_product,_external_ref
 );
 RETURN ticket_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_support_ticket(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text[],uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid,uuid,text,text,uuid,uuid,text,text,text,text,text,text[],uuid)
 TO service_role;

COMMIT;
