BEGIN;
CREATE OR REPLACE FUNCTION public.crm_log_deal_activity(_tenant uuid,_deal uuid,_request uuid,_kind text,_summary text)
RETURNS public.crm_activities LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE deal public.crm_opportunities; receipt public.crm_activities;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_write(_tenant,auth.uid()) THEN RAISE EXCEPTION 'CRM write access denied'; END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.crm') THEN RAISE EXCEPTION 'Omniqora CRM entitlement required'; END IF;
 IF _request IS NULL OR _kind IS NULL OR _kind NOT IN ('note','call','meeting') THEN RAISE EXCEPTION 'Invalid activity request'; END IF;
 IF _summary IS NULL OR length(btrim(_summary)) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Activity text required (maximum 4000 characters)'; END IF;
 SELECT * INTO deal FROM public.crm_opportunities WHERE tenant_id=_tenant AND id=_deal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CRM opportunity unavailable'; END IF;
 SELECT * INTO receipt FROM public.crm_activities WHERE tenant_id=_tenant AND source_product_key='omniqora-deal-log' AND external_ref=_request::text;
 IF FOUND THEN
  IF receipt.opportunity_id IS DISTINCT FROM _deal OR receipt.actor_user_id IS DISTINCT FROM auth.uid()
   OR receipt.activity_type IS DISTINCT FROM _kind OR receipt.summary IS DISTINCT FROM btrim(_summary) THEN
    RAISE EXCEPTION 'Activity request already used with different details';
  END IF;
  RETURN receipt;
 END IF;
 IF deal.person_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_people WHERE id=deal.person_id AND tenant_id=_tenant) THEN RAISE EXCEPTION 'CRM linked person unavailable'; END IF;
 IF deal.company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.crm_companies WHERE id=deal.company_id AND tenant_id=_tenant) THEN RAISE EXCEPTION 'CRM linked company unavailable'; END IF;
 INSERT INTO public.crm_activities(tenant_id,activity_type,summary,opportunity_id,person_id,company_id,actor_user_id,source_product_key,external_ref,metadata)
 VALUES(_tenant,_kind,btrim(_summary),deal.id,deal.person_id,deal.company_id,auth.uid(),'omniqora-deal-log',_request::text,'{"capture":"manual"}') RETURNING * INTO receipt;
 RETURN receipt;
END; $$;
REVOKE ALL ON FUNCTION public.crm_log_deal_activity(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_log_deal_activity(uuid,uuid,uuid,text,text) TO authenticated;
COMMIT;
