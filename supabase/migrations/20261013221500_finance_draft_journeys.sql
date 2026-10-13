-- UK Finance Factory Phase 2: expand to separately regulated personal finance,
-- and add audit-ready INTERNAL draft journeys. NO provider transmissions or loan offers.
BEGIN;
INSERT INTO public.provider_catalogue
 (provider_key,name,provider_kind,capabilities,supported_countries,required_secret_names,
 public_config_names,status,implementation_status,metadata)
VALUES
 ('personal.monevo','Monevo','personal_finance',ARRAY['personal_loans','comparison']::text[],ARRAY['GB']::text[],
 ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only',
 '{"directConsumerBrokerAuthorisationRequired":true,"noAutoActivation":true,"rail":"multi_lender","live":false}'::jsonb),
 ('personal.clearscore','ClearScore Partner API','personal_finance',ARRAY['personal_loans','comparison']::text[],ARRAY['GB']::text[],
 ARRAY[]::text[],ARRAY[]::text[],'planned','catalogue_only',
 '{"directConsumerBrokerAuthorisationRequired":true,"noAutoActivation":true,"rail":"multi_lender","live":false}'::jsonb)
ON CONFLICT(provider_key) DO NOTHING;
ALTER TABLE public.finance_product_applicability
 DROP CONSTRAINT IF EXISTS finance_product_applicability_finance_family_check;
ALTER TABLE public.finance_product_applicability
 ADD CONSTRAINT finance_product_applicability_finance_family_check
 CHECK(finance_family IN ('merchant_capital','consumer_checkout','b2b_terms','personal_finance'));
INSERT INTO public.finance_product_applicability
 (product_key,finance_family,country_code,candidate_only,enabled_by_default,restrictions)
SELECT product_key,'personal_finance','GB',true,false,
 '{"requiresFcaConsumerCreditBrokerPermissions":true,"consumerDutyReview":true,"noPersonalDataInControlPlane":true}'::jsonb
FROM public.product_catalogue WHERE product_key='zoryn'
ON CONFLICT(product_key,finance_family) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.finance_case_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
 brand_id uuid REFERENCES public.tenant_brands(id),
 provider_key text NOT NULL REFERENCES public.provider_catalogue(provider_key),
 family text NOT NULL CHECK(family IN ('merchant_capital','consumer_checkout','b2b_terms','personal_finance')),
 source_subject_ref uuid NOT NULL, -- opaque identifier only; NO name/email/NI/credit file
 requested_amount_minor bigint NOT NULL CHECK(requested_amount_minor BETWEEN 100 AND 10000000000),
 currency text NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
 stage text NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','withdrawn')),
 idempotency_key uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,idempotency_key)
);
CREATE INDEX IF NOT EXISTS finance_case_drafts_scope_idx ON public.finance_case_drafts
 (tenant_id,product_key,created_by,created_at DESC);
CREATE TABLE IF NOT EXISTS public.finance_case_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id uuid NOT NULL REFERENCES public.finance_case_drafts(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN ('draft_created','draft_withdrawn')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS finance_case_audit_idx ON public.finance_case_audit(tenant_id,case_id,occurred_at);
ALTER TABLE public.finance_case_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_case_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_case_drafts, public.finance_case_audit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.finance_case_drafts,public.finance_case_audit TO service_role;
GRANT SELECT ON public.finance_case_drafts,public.finance_case_audit TO authenticated;

CREATE POLICY finance_case_owner_read ON public.finance_case_drafts FOR SELECT TO authenticated
 USING(created_by=auth.uid() AND public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY finance_case_audit_owner_read ON public.finance_case_audit FOR SELECT TO authenticated
 USING(EXISTS(
  SELECT 1 FROM public.finance_case_drafts c WHERE c.id=case_id AND c.tenant_id=finance_case_audit.tenant_id
  AND c.created_by=auth.uid() AND public.is_tenant_member(c.tenant_id,auth.uid())
 ));

-- Deliberately exposes only draft creation. No application "submit" method exists.
CREATE OR REPLACE FUNCTION public.finance_create_draft(
 _tenant uuid,_product text,_provider text,_source_ref uuid,_amount bigint,_idempotency uuid,
 _brand uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _family text; _result uuid; _previous public.finance_case_drafts%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authenticated account required'; END IF;
 IF NOT (
   public.is_platform_admin(auth.uid()) OR
   public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[])
 ) THEN RAISE EXCEPTION 'Tenant owner or admin required'; END IF;
 IF _idempotency IS NULL OR _source_ref IS NULL OR _amount NOT BETWEEN 100 AND 10000000000
 THEN RAISE EXCEPTION 'Invalid draft reference or amount'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_products p WHERE p.tenant_id=_tenant
 AND p.product_key=_product AND p.status='active') THEN RAISE EXCEPTION 'Active tenant product required'; END IF;
 IF _brand IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tenant_brands b WHERE b.id=_brand
 AND b.tenant_id=_tenant) THEN RAISE EXCEPTION 'Brand outside tenant'; END IF;
 SELECT provider_kind INTO _family FROM public.provider_catalogue
 WHERE provider_key=_provider AND status<>'retired';
 IF _family IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.finance_product_applicability f
  WHERE f.product_key=_product AND f.finance_family=_family AND f.country_code='GB'
 ) THEN RAISE EXCEPTION 'Provider family is not mapped to this product'; END IF;
 -- Serialise repeated keys and reject changed payload for an existing reference.
 PERFORM pg_advisory_xact_lock(hashtextextended(_tenant::text||':'||_product||':'||_idempotency::text,0));
 SELECT * INTO _previous FROM public.finance_case_drafts
 WHERE tenant_id=_tenant AND product_key=_product AND idempotency_key=_idempotency;
 IF FOUND THEN
  IF _previous.provider_key<>_provider OR _previous.source_subject_ref<>_source_ref
   OR _previous.requested_amount_minor<>_amount OR _previous.brand_id IS DISTINCT FROM _brand
   OR _previous.created_by<>auth.uid()
  THEN RAISE EXCEPTION 'Idempotency key cannot be reused for another request'; END IF;
  RETURN _previous.id;
 END IF;
 INSERT INTO public.finance_case_drafts(
 tenant_id,product_key,provider_key,family,source_subject_ref,requested_amount_minor,
 idempotency_key,brand_id,created_by
 ) VALUES(_tenant,_product,_provider,_family,_source_ref,_amount,_idempotency,_brand,auth.uid())
 RETURNING id INTO _result;
 INSERT INTO public.finance_case_audit(case_id,tenant_id,action,actor_id)
 VALUES(_result,_tenant,'draft_created',auth.uid());
 RETURN _result;
END $$;
REVOKE ALL ON FUNCTION public.finance_create_draft(uuid,text,text,uuid,bigint,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_create_draft(uuid,text,text,uuid,bigint,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_withdraw_draft(_tenant uuid,_case uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE _changed uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_tenant_member(_tenant,auth.uid())
 THEN RAISE EXCEPTION 'Tenant access denied'; END IF;
 UPDATE public.finance_case_drafts SET stage='withdrawn',updated_at=now()
 WHERE id=_case AND tenant_id=_tenant AND created_by=auth.uid() AND stage='draft'
 RETURNING id INTO _changed;
 IF _changed IS NULL THEN RETURN false; END IF;
 INSERT INTO public.finance_case_audit(case_id,tenant_id,action,actor_id)
 VALUES(_changed,_tenant,'draft_withdrawn',auth.uid());
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.finance_withdraw_draft(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finance_withdraw_draft(uuid,uuid) TO authenticated;
COMMIT;
