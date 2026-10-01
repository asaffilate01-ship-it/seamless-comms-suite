-- Secure client/staff accounting upload sessions and constrained client factual answers.
BEGIN;

CREATE TABLE IF NOT EXISTS public.accounting_upload_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  tenant_product_id uuid NOT NULL REFERENCES public.tenant_products(id) ON DELETE CASCADE,
  practice_client_id uuid NOT NULL REFERENCES public.practice_clients(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.accounting_intake_batches(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL
    CHECK(source_type IN ('receipt','purchase_invoice','sales_invoice','bank_statement','credit_card_statement','opening_accounts','opening_trial_balance','journal','other')),
  storage_ref text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  state text NOT NULL DEFAULT 'initiated'
    CHECK(state IN ('initiated','uploaded','finalized','expired','failed')),
  expires_at timestamptz NOT NULL,
  finalized_document_id uuid REFERENCES public.platform_documents(id) ON DELETE SET NULL,
  finalized_intake_item_id uuid REFERENCES public.accounting_intake_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS accounting_upload_sessions_user_idx
 ON public.accounting_upload_sessions(requested_by,state,expires_at);

ALTER TABLE public.accounting_upload_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.accounting_upload_sessions TO authenticated;
GRANT ALL ON public.accounting_upload_sessions TO service_role;
DROP POLICY IF EXISTS "accounting upload session read" ON public.accounting_upload_sessions;
CREATE POLICY "accounting upload session read" ON public.accounting_upload_sessions FOR SELECT TO authenticated
 USING(
   requested_by=auth.uid()
   OR public.is_tenant_member(tenant_id,auth.uid())
 );

DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.accounting_upload_sessions;
CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.accounting_upload_sessions
FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at();

-- Client portal answers must go through a constrained RPC; direct UPDATE is too broad.
REVOKE UPDATE ON public.accounting_review_items FROM authenticated;
DROP POLICY IF EXISTS "accounting review client answer" ON public.accounting_review_items;

CREATE OR REPLACE FUNCTION public.answer_accounting_review_item(
 _review_item uuid,_answer jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE r public.accounting_review_items; p public.accounting_staging_entries;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 SELECT * INTO r FROM public.accounting_review_items WHERE id=_review_item FOR UPDATE;
 IF NOT FOUND OR r.status<>'open' OR r.audience NOT IN ('client','both') THEN
  RAISE EXCEPTION 'client_review_item_not_available';
 END IF;
 SELECT * INTO p FROM public.accounting_staging_entries WHERE id=r.proposal_id;
 IF NOT FOUND OR NOT public.has_practice_client_access(p.practice_client_id,auth.uid()) THEN
  RAISE EXCEPTION 'practice_client_access_denied';
 END IF;
 UPDATE public.accounting_review_items SET
  answer=COALESCE(_answer,'{}'::jsonb),answered_by=auth.uid(),answered_at=now(),
  status='answered',updated_at=now()
 WHERE id=r.id;
 RETURN jsonb_build_object('id',r.id,'status','answered');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.answer_accounting_review_item(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.answer_accounting_review_item(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_accounting_upload(
 _session uuid,_size_bytes bigint,_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE s public.accounting_upload_sessions; b public.accounting_intake_batches;
DECLARE document_id uuid; intake_item_id uuid; version_no integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
 IF _size_bytes<1 OR _size_bytes>52428800 THEN RAISE EXCEPTION 'invalid_file_size'; END IF;
 IF _sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_sha256'; END IF;

 SELECT * INTO s FROM public.accounting_upload_sessions WHERE id=_session FOR UPDATE;
 IF NOT FOUND OR s.state NOT IN ('initiated','uploaded') OR s.expires_at<=now() THEN
  RAISE EXCEPTION 'upload_session_not_available';
 END IF;
 IF s.requested_by<>auth.uid() AND NOT public.is_tenant_member(s.tenant_id,auth.uid()) THEN
  RAISE EXCEPTION 'upload_session_access_denied';
 END IF;
 SELECT * INTO b FROM public.accounting_intake_batches
  WHERE id=s.batch_id AND tenant_id=s.tenant_id AND tenant_product_id=s.tenant_product_id
    AND practice_client_id=s.practice_client_id
  FOR UPDATE;
 IF NOT FOUND OR b.status NOT IN ('draft','uploaded','review','failed') THEN
  RAISE EXCEPTION 'accounting_batch_not_open';
 END IF;

 IF s.finalized_document_id IS NOT NULL AND s.finalized_intake_item_id IS NOT NULL THEN
  RETURN jsonb_build_object('documentId',s.finalized_document_id,'intakeItemId',s.finalized_intake_item_id,'idempotent',true);
 END IF;

 INSERT INTO public.platform_documents(
  tenant_id,tenant_product_id,title,document_type,status,owner_user_id,tags,current_version,metadata
 ) VALUES(
  s.tenant_id,s.tenant_product_id,s.file_name,'accounting_source','draft',auth.uid(),
  ARRAY['accounting',s.source_type],0,
  jsonb_build_object('practiceClientId',s.practice_client_id,'batchId',s.batch_id,'sourceType',s.source_type)
 ) RETURNING id INTO document_id;

 version_no:=public.add_platform_document_version(
  s.tenant_id,document_id,s.storage_ref,s.file_name,s.mime_type,_size_bytes,_sha256,'upload',auth.uid(),'Accounting client/practice upload'
 );

 INSERT INTO public.platform_document_links(document_id,tenant_id,entity_type,entity_id,relationship)
 VALUES(document_id,s.tenant_id,'practice_client',s.practice_client_id::text,'accounting_source');

 INSERT INTO public.accounting_intake_items(
  tenant_id,batch_id,document_id,source_type,original_reference,extraction_status
 ) VALUES(
  s.tenant_id,s.batch_id,document_id,s.source_type,s.file_name,'not_started'
 ) RETURNING id INTO intake_item_id;

 UPDATE public.accounting_intake_batches SET status='uploaded',updated_at=now() WHERE id=b.id;
 UPDATE public.accounting_upload_sessions SET
  state='finalized',finalized_document_id=document_id,finalized_intake_item_id=intake_item_id,updated_at=now()
 WHERE id=s.id;

 RETURN jsonb_build_object('documentId',document_id,'intakeItemId',intake_item_id,'version',version_no,'idempotent',false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finalize_accounting_upload(uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_accounting_upload(uuid,bigint,text) TO authenticated;

COMMIT;
