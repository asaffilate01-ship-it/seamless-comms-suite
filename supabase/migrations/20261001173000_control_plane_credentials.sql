-- Secure per-product control-plane credentials and provisioning completion.
BEGIN;

ALTER TABLE public.product_connections
  ADD COLUMN IF NOT EXISTS credential_hash text,
  ADD COLUMN IF NOT EXISTS credential_suffix text,
  ADD COLUMN IF NOT EXISTS credential_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS product_connections_credential_hash_idx
  ON public.product_connections(credential_hash)
  WHERE credential_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.platform_rotate_product_credential(
  _connection uuid,
  _valid_days integer DEFAULT 365
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token text; row public.product_connections%rowtype;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required'; END IF;
  IF _valid_days NOT BETWEEN 1 AND 730 THEN RAISE EXCEPTION 'Invalid credential lifetime'; END IF;
  SELECT * INTO row FROM public.product_connections WHERE id=_connection;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product connection not found'; END IF;

  token := 'oqcp_' || encode(gen_random_bytes(32),'hex');
  UPDATE public.product_connections
  SET credential_hash=encode(digest(token,'sha256'),'hex'),
      credential_suffix=right(token,8),
      credential_expires_at=now()+make_interval(days=>_valid_days),
      status='configured',
      updated_at=now()
  WHERE id=_connection;

  INSERT INTO public.provisioning_jobs(tenant_id,target_kind,target_key,action,idempotency_key,payload,requested_by)
  VALUES(row.tenant_id,'integration',row.product_key||':'||row.external_tenant_id,'verify',
    row.tenant_id::text||':credential:'||row.id::text||':'||floor(extract(epoch from now())/10)::text,
    jsonb_build_object('connectionId',row.id,'productKey',row.product_key,'externalTenantId',row.external_tenant_id),
    auth.uid())
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'connectionId',row.id,
    'token',token,
    'suffix',right(token,8),
    'expiresAt',now()+make_interval(days=>_valid_days)
  );
END; $$;
REVOKE ALL ON FUNCTION public.platform_rotate_product_credential(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_rotate_product_credential(uuid,integer) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.server_complete_provisioning_job(
  _job uuid,
  _succeeded boolean,
  _detail jsonb DEFAULT '{}'::jsonb,
  _error text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.provisioning_jobs%rowtype;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  SELECT * INTO j FROM public.provisioning_jobs WHERE id=_job FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Provisioning job not found'; END IF;

  UPDATE public.provisioning_jobs
  SET status=CASE WHEN _succeeded THEN 'succeeded' ELSE 'failed' END,
      attempts=attempts+1,
      last_error=CASE WHEN _succeeded THEN NULL ELSE left(COALESCE(_error,'provisioning_failed'),1000) END,
      started_at=COALESCE(started_at,now()),
      finished_at=now()
  WHERE id=_job;

  IF j.target_kind='product' THEN
    UPDATE public.tenant_products
    SET status=CASE WHEN _succeeded AND j.action IN ('provision','resume','update','verify') THEN 'active'
                    WHEN _succeeded AND j.action IN ('suspend','deprovision') THEN 'suspended'
                    ELSE 'failed' END,
        activated_at=CASE WHEN _succeeded AND j.action='provision' THEN COALESCE(activated_at,now()) ELSE activated_at END,
        updated_at=now()
    WHERE tenant_id=j.tenant_id AND product_key=j.target_key;
  ELSIF j.target_kind='service' THEN
    UPDATE public.tenant_services
    SET status=CASE WHEN _succeeded AND j.action IN ('provision','resume','update','verify') THEN 'active'
                    WHEN _succeeded AND j.action IN ('suspend','deprovision') THEN 'suspended'
                    ELSE 'failed' END,
        updated_at=now()
    WHERE tenant_id=j.tenant_id AND service_key=j.target_key;
  ELSIF j.target_kind='integration' AND _succeeded THEN
    UPDATE public.product_connections
    SET status='connected',last_verified_at=now(),updated_at=now()
    WHERE tenant_id=j.tenant_id
      AND (product_key||':'||external_tenant_id)=j.target_key;
  END IF;

  INSERT INTO public.provisioning_events(job_id,tenant_id,event,detail)
  VALUES(j.id,j.tenant_id,CASE WHEN _succeeded THEN 'succeeded' ELSE 'failed' END,
    COALESCE(_detail,'{}'::jsonb) || CASE WHEN _error IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('error',left(_error,1000)) END);
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.server_complete_provisioning_job(uuid,boolean,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_complete_provisioning_job(uuid,boolean,jsonb,text) TO service_role;

COMMIT;
