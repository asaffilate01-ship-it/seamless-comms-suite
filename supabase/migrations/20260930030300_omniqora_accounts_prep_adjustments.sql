-- Reviewable Accounts Preparation AI results and year-end adjustments.
BEGIN;

ALTER TABLE public.accounting_accounts_prep_runs
  ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS model_run_id text,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.accounting_accounts_prep_adjustments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  prep_run_id uuid NOT NULL REFERENCES public.accounting_accounts_prep_runs(id) ON DELETE CASCADE,
  practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  reason text NOT NULL,
  journal_date date NOT NULL,
  currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}
  evidence_refs text[] NOT NULL DEFAULT '{}',
  confidence numeric(5,4) NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  risk text NOT NULL DEFAULT 'normal' CHECK(risk IN ('low','normal','high','specialist_review')),
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected','posted')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  posted_journal_id uuid REFERENCES public.accounting_journals(id) ON DELETE SET NULL,
  model_run_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounting_prep_adjustments_queue_idx
 ON public.accounting_accounts_prep_adjustments(tenant_id,practice_client_id,prep_run_id,status,risk);

ALTER TABLE public.accounting_accounts_prep_adjustments ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.accounting_accounts_prep_adjustments TO authenticated;
GRANT ALL ON public.accounting_accounts_prep_adjustments TO service_role;
DROP POLICY IF EXISTS "accounts prep adjustment staff read" ON public.accounting_accounts_prep_adjustments;
CREATE POLICY "accounts prep adjustment staff read" ON public.accounting_accounts_prep_adjustments FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "accounts prep adjustment staff write" ON public.accounting_accounts_prep_adjustments;
CREATE POLICY "accounts prep adjustment staff write" ON public.accounting_accounts_prep_adjustments FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.accounting_accounts_prep_adjustments;
CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.accounting_accounts_prep_adjustments
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

CREATE OR REPLACE FUNCTION public.post_accounts_prep_adjustment(
 _tenant uuid,_adjustment uuid,_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE a public.accounting_accounts_prep_adjustments; j uuid; line jsonb;
DECLARE total_debit bigint:=0; total_credit bigint:=0; debit_value bigint; credit_value bigint; acc uuid; code text;
BEGIN
 SELECT * INTO a FROM public.accounting_accounts_prep_adjustments
  WHERE id=_adjustment AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND OR a.status<>'approved' THEN RAISE EXCEPTION 'approved_adjustment_required'; END IF;
 IF jsonb_typeof(a.proposed_journal_lines)<>'array' OR jsonb_array_length(a.proposed_journal_lines)<2 THEN
  RAISE EXCEPTION 'balanced_journal_lines_required';
 END IF;

 FOR line IN SELECT * FROM jsonb_array_elements(a.proposed_journal_lines) LOOP
  code:=btrim(COALESCE(line->>'accountCode',''));
  debit_value:=COALESCE((line->>'debitMinor')::bigint,0);
  credit_value:=COALESCE((line->>'creditMinor')::bigint,0);
  IF code='' OR debit_value<0 OR credit_value<0 OR ((debit_value=0)=(credit_value=0)) THEN
   RAISE EXCEPTION 'invalid_journal_line';
  END IF;
  SELECT id INTO acc FROM public.accounting_nominal_accounts
   WHERE practice_client_id=a.practice_client_id AND tenant_id=_tenant AND code=code AND active=true;
  IF acc IS NULL THEN RAISE EXCEPTION 'unknown_account_code:%',code; END IF;
  total_debit:=total_debit+debit_value; total_credit:=total_credit+credit_value;
 END LOOP;
 IF total_debit<=0 OR total_debit<>total_credit THEN RAISE EXCEPTION 'journal_not_balanced'; END IF;

 INSERT INTO public.accounting_journals(
  tenant_id,practice_client_id,journal_date,reference,description,source_type,source_ref,
  status,posted_by,posted_at
 ) VALUES(
  _tenant,a.practice_client_id,a.journal_date,'YR-'||left(a.id::text,8),a.title,
  'accounts_prep_adjustment','accounts-prep-adjustment:'||a.id,'posted',_actor,now()
 ) RETURNING id INTO j;

 FOR line IN SELECT * FROM jsonb_array_elements(a.proposed_journal_lines) LOOP
  code:=btrim(line->>'accountCode');
  SELECT id INTO acc FROM public.accounting_nominal_accounts
   WHERE practice_client_id=a.practice_client_id AND tenant_id=_tenant AND code=code AND active=true;
  INSERT INTO public.accounting_journal_lines(
   tenant_id,journal_id,account_id,description,debit_minor,credit_minor,currency,tax_code,source_proposal_id
  ) VALUES(
   _tenant,j,acc,NULLIF(line->>'memo',''),COALESCE((line->>'debitMinor')::bigint,0),
   COALESCE((line->>'creditMinor')::bigint,0),
   a.currency,NULLIF(line->>'taxCode',''),NULL
  );
 END LOOP;

 UPDATE public.accounting_accounts_prep_adjustments SET
  status='posted',posted_journal_id=j,reviewed_by=COALESCE(reviewed_by,_actor),
  reviewed_at=COALESCE(reviewed_at,now()),updated_at=now()
 WHERE id=a.id;
 RETURN j;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_accounts_prep_adjustment(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_accounts_prep_adjustment(uuid,uuid,uuid) TO service_role;

COMMIT;
),
  proposed_journal_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_refs text[] NOT NULL DEFAULT '{}',
  confidence numeric(5,4) NOT NULL CHECK(confidence BETWEEN 0 AND 1),
  risk text NOT NULL DEFAULT 'normal' CHECK(risk IN ('low','normal','high','specialist_review')),
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected','posted')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  posted_journal_id uuid REFERENCES public.accounting_journals(id) ON DELETE SET NULL,
  model_run_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounting_prep_adjustments_queue_idx
 ON public.accounting_accounts_prep_adjustments(tenant_id,practice_client_id,prep_run_id,status,risk);

ALTER TABLE public.accounting_accounts_prep_adjustments ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.accounting_accounts_prep_adjustments TO authenticated;
GRANT ALL ON public.accounting_accounts_prep_adjustments TO service_role;
DROP POLICY IF EXISTS "accounts prep adjustment staff read" ON public.accounting_accounts_prep_adjustments;
CREATE POLICY "accounts prep adjustment staff read" ON public.accounting_accounts_prep_adjustments FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
DROP POLICY IF EXISTS "accounts prep adjustment staff write" ON public.accounting_accounts_prep_adjustments;
CREATE POLICY "accounts prep adjustment staff write" ON public.accounting_accounts_prep_adjustments FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.accounting_accounts_prep_adjustments;
CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.accounting_accounts_prep_adjustments
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

CREATE OR REPLACE FUNCTION public.post_accounts_prep_adjustment(
 _tenant uuid,_adjustment uuid,_actor uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE a public.accounting_accounts_prep_adjustments; j uuid; line jsonb;
DECLARE total_debit bigint:=0; total_credit bigint:=0; debit_value bigint; credit_value bigint; acc uuid; code text;
BEGIN
 SELECT * INTO a FROM public.accounting_accounts_prep_adjustments
  WHERE id=_adjustment AND tenant_id=_tenant FOR UPDATE;
 IF NOT FOUND OR a.status<>'approved' THEN RAISE EXCEPTION 'approved_adjustment_required'; END IF;
 IF jsonb_typeof(a.proposed_journal_lines)<>'array' OR jsonb_array_length(a.proposed_journal_lines)<2 THEN
  RAISE EXCEPTION 'balanced_journal_lines_required';
 END IF;

 FOR line IN SELECT * FROM jsonb_array_elements(a.proposed_journal_lines) LOOP
  code:=btrim(COALESCE(line->>'accountCode',''));
  debit_value:=COALESCE((line->>'debitMinor')::bigint,0);
  credit_value:=COALESCE((line->>'creditMinor')::bigint,0);
  IF code='' OR debit_value<0 OR credit_value<0 OR ((debit_value=0)=(credit_value=0)) THEN
   RAISE EXCEPTION 'invalid_journal_line';
  END IF;
  SELECT id INTO acc FROM public.accounting_nominal_accounts
   WHERE practice_client_id=a.practice_client_id AND tenant_id=_tenant AND code=code AND active=true;
  IF acc IS NULL THEN RAISE EXCEPTION 'unknown_account_code:%',code; END IF;
  total_debit:=total_debit+debit_value; total_credit:=total_credit+credit_value;
 END LOOP;
 IF total_debit<=0 OR total_debit<>total_credit THEN RAISE EXCEPTION 'journal_not_balanced'; END IF;

 INSERT INTO public.accounting_journals(
  tenant_id,practice_client_id,journal_date,reference,description,source_type,source_ref,
  status,posted_by,posted_at
 ) VALUES(
  _tenant,a.practice_client_id,a.journal_date,'YR-'||left(a.id::text,8),a.title,
  'accounts_prep_adjustment','accounts-prep-adjustment:'||a.id,'posted',_actor,now()
 ) RETURNING id INTO j;

 FOR line IN SELECT * FROM jsonb_array_elements(a.proposed_journal_lines) LOOP
  code:=btrim(line->>'accountCode');
  SELECT id INTO acc FROM public.accounting_nominal_accounts
   WHERE practice_client_id=a.practice_client_id AND tenant_id=_tenant AND code=code AND active=true;
  INSERT INTO public.accounting_journal_lines(
   tenant_id,journal_id,account_id,description,debit_minor,credit_minor,currency,tax_code,source_proposal_id
  ) VALUES(
   _tenant,j,acc,NULLIF(line->>'memo',''),COALESCE((line->>'debitMinor')::bigint,0),
   COALESCE((line->>'creditMinor')::bigint,0),
   COALESCE(NULLIF(line->>'currency',''),'GBP'),NULLIF(line->>'taxCode',''),NULL
  );
 END LOOP;

 UPDATE public.accounting_accounts_prep_adjustments SET
  status='posted',posted_journal_id=j,reviewed_by=COALESCE(reviewed_by,_actor),
  reviewed_at=COALESCE(reviewed_at,now()),updated_at=now()
 WHERE id=a.id;
 RETURN j;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.post_accounts_prep_adjustment(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.post_accounts_prep_adjustment(uuid,uuid,uuid) TO service_role;

COMMIT;
