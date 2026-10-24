BEGIN;
CREATE OR REPLACE FUNCTION public.crm_edit_deal(
 _tenant uuid,_deal uuid,_expected_updated_at timestamptz,_title text,_amount numeric,_currency text,_expected_close_at timestamptz
) RETURNS public.crm_opportunities LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE previous public.crm_opportunities; saved public.crm_opportunities;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_write(_tenant,auth.uid()) THEN RAISE EXCEPTION 'CRM write access denied'; END IF;
 IF NOT public.has_tenant_entitlement(_tenant,'omniqora.crm') THEN RAISE EXCEPTION 'Omniqora CRM entitlement required'; END IF;
 SELECT * INTO previous FROM public.crm_opportunities WHERE tenant_id=_tenant AND id=_deal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CRM opportunity unavailable'; END IF;
 IF _expected_updated_at IS NULL OR previous.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'This deal changed. Refresh and try again.'; END IF;
 IF _title IS NULL OR length(btrim(_title)) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'Deal title required (maximum 240 characters)'; END IF;
 IF _amount IS NOT NULL AND (_amount<0 OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount>=10000000000000000) THEN RAISE EXCEPTION 'Invalid deal value'; END IF;
 IF _currency IS NOT NULL AND _currency !~ '^[A-Z]{3}$' OR _amount IS NOT NULL AND _currency IS NULL THEN RAISE EXCEPTION 'Deal currency required'; END IF;
 IF _expected_close_at IS NOT NULL AND NOT isfinite(_expected_close_at) THEN RAISE EXCEPTION 'Invalid close date'; END IF;
 IF ROW(previous.title,previous.amount,previous.currency,previous.expected_close_at) IS NOT DISTINCT FROM ROW(btrim(_title),_amount,_currency,_expected_close_at) THEN RETURN previous; END IF;
 UPDATE public.crm_opportunities SET title=btrim(_title),amount=_amount,currency=_currency,expected_close_at=_expected_close_at
 WHERE tenant_id=_tenant AND id=_deal RETURNING * INTO saved;
 INSERT INTO public.crm_activities(tenant_id,activity_type,summary,opportunity_id,person_id,company_id,actor_user_id,metadata)
 VALUES(_tenant,'opportunity_event','Deal details updated',saved.id,saved.person_id,saved.company_id,auth.uid(),jsonb_build_object(
 'before',jsonb_build_object('title',previous.title,'amount',previous.amount,'currency',previous.currency,'expectedCloseAt',previous.expected_close_at),
 'after',jsonb_build_object('title',saved.title,'amount',saved.amount,'currency',saved.currency,'expectedCloseAt',saved.expected_close_at)));
 RETURN saved;
END; $$;
REVOKE ALL ON FUNCTION public.crm_edit_deal(uuid,uuid,timestamptz,text,numeric,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_edit_deal(uuid,uuid,timestamptz,text,numeric,text,timestamptz) TO authenticated;
COMMIT;
