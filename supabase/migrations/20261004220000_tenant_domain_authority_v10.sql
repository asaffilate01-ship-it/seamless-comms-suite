-- Auditable white-label domain ownership and TLS readiness. A domain can only
-- belong to one tenant; service workers report observed DNS/TLS evidence.
BEGIN;

ALTER TABLE public.tenant_domains
  ADD COLUMN IF NOT EXISTS verification_method text NOT NULL DEFAULT 'dns_txt'
    CHECK (verification_method IN ('dns_txt')),
  ADD COLUMN IF NOT EXISTS verification_token text,
  ADD COLUMN IF NOT EXISTS verification_record_name text,
  ADD COLUMN IF NOT EXISTS verification_record_value text,
  ADD COLUMN IF NOT EXISTS verification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS ssl_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_reason text;

UPDATE public.tenant_domains
SET verification_token=COALESCE(verification_token,replace(gen_random_uuid()::text,'-','')),
    verification_record_name=COALESCE(verification_record_name,'_omniqora-verification.'||domain),
    verification_record_value=COALESCE(
      verification_record_value,
      'omniqora-domain='||COALESCE(verification_token,replace(gen_random_uuid()::text,'-',''))
    )
WHERE verification_token IS NULL OR verification_record_name IS NULL OR verification_record_value IS NULL;

-- Reconcile tokens generated independently by the backfill expression.
UPDATE public.tenant_domains
SET verification_record_value='omniqora-domain='||verification_token
WHERE verification_record_value IS DISTINCT FROM 'omniqora-domain='||verification_token;

ALTER TABLE public.tenant_domains
  ALTER COLUMN verification_token SET NOT NULL,
  ALTER COLUMN verification_record_name SET NOT NULL,
  ALTER COLUMN verification_record_value SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_domains_verification_token_key
  ON public.tenant_domains(verification_token);

CREATE TABLE IF NOT EXISTS public.tenant_domain_verification_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.tenant_domains(id) ON DELETE CASCADE,
  domain text NOT NULL,
  dns_verified boolean NOT NULL,
  ssl_active boolean NOT NULL,
  observed_txt jsonb NOT NULL DEFAULT '[]'::jsonb,
  http_status integer,
  failure_reason text,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_domain_verification_attempts_lookup_idx
  ON public.tenant_domain_verification_attempts(tenant_id,domain_id,checked_at DESC);

ALTER TABLE public.tenant_domain_verification_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_domain_verification_attempts FROM anon,authenticated;
GRANT ALL ON public.tenant_domain_verification_attempts TO service_role;
GRANT SELECT ON public.tenant_domain_verification_attempts TO authenticated;
CREATE POLICY "tenant domain attempts read" ON public.tenant_domain_verification_attempts
  FOR SELECT TO authenticated
  USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

CREATE OR REPLACE FUNCTION public.platform_upsert_domain(
  _tenant uuid,_product text,_domain text,_primary boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  result uuid; normalized text; existing public.tenant_domains%rowtype; challenge text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Domain access denied';
  END IF;
  normalized:=lower(trim(trailing '.' FROM trim(_domain)));
  IF length(normalized)>253
     OR normalized !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
     OR normalized !~ '\.[a-z]{2,63}$'
     OR normalized LIKE '%.local' THEN
    RAISE EXCEPTION 'Invalid domain';
  END IF;

  SELECT * INTO existing FROM public.tenant_domains WHERE domain=normalized FOR UPDATE;
  IF FOUND AND existing.tenant_id<>_tenant THEN
    RAISE EXCEPTION 'Domain is already claimed by another tenant';
  END IF;
  challenge:=replace(gen_random_uuid()::text,'-','');
  IF _primary THEN
    UPDATE public.tenant_domains SET is_primary=false,updated_at=now()
    WHERE tenant_id=_tenant AND product_key IS NOT DISTINCT FROM _product;
  END IF;

  IF FOUND THEN
    UPDATE public.tenant_domains SET
      product_key=_product,is_primary=_primary,
      verification_token=COALESCE(existing.verification_token,challenge),
      verification_record_name='_omniqora-verification.'||normalized,
      verification_record_value='omniqora-domain='||COALESCE(existing.verification_token,challenge),
      updated_at=now()
    WHERE id=existing.id RETURNING id INTO result;
  ELSE
    INSERT INTO public.tenant_domains(
      tenant_id,product_key,domain,is_primary,verification_token,
      verification_record_name,verification_record_value
    ) VALUES(
      _tenant,_product,normalized,_primary,challenge,
      '_omniqora-verification.'||normalized,'omniqora-domain='||challenge
    ) RETURNING id INTO result;
  END IF;

  PERFORM public.queue_provisioning(
    _tenant,'domain',normalized,'verify',
    jsonb_build_object('productKey',_product,'primary',_primary)
  );
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.platform_upsert_domain(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_upsert_domain(uuid,text,text,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_request_domain_verification(_tenant uuid,_domain text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.tenant_domains%rowtype; job_id uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Domain access denied';
  END IF;
  SELECT * INTO target FROM public.tenant_domains
  WHERE tenant_id=_tenant AND domain=lower(trim(trailing '.' FROM trim(_domain))) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant domain not found'; END IF;
  UPDATE public.tenant_domains SET
    verification_status=CASE WHEN verification_status='verified' THEN verification_status ELSE 'pending' END,
    failure_reason=NULL,updated_at=now()
  WHERE id=target.id;
  SELECT public.queue_provisioning(
    _tenant,'domain',target.domain,'verify',
    jsonb_build_object('productKey',target.product_key,'primary',target.is_primary,'requestedAt',now())
  ) INTO job_id;
  RETURN job_id;
END; $$;
REVOKE ALL ON FUNCTION public.platform_request_domain_verification(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_request_domain_verification(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.platform_rotate_domain_challenge(_tenant uuid,_domain text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.tenant_domains%rowtype; challenge text;
BEGIN
  IF NOT public.is_platform_admin(auth.uid())
     AND NOT public.has_tenant_role(_tenant,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Domain access denied';
  END IF;
  SELECT * INTO target FROM public.tenant_domains
  WHERE tenant_id=_tenant AND domain=lower(trim(trailing '.' FROM trim(_domain))) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant domain not found'; END IF;
  challenge:=replace(gen_random_uuid()::text,'-','');
  UPDATE public.tenant_domains SET
    verification_token=challenge,
    verification_record_name='_omniqora-verification.'||target.domain,
    verification_record_value='omniqora-domain='||challenge,
    verification_status='pending',ssl_status='pending',verified_at=NULL,ssl_activated_at=NULL,
    failure_reason=NULL,updated_at=now()
  WHERE id=target.id;
  PERFORM public.queue_provisioning(
    _tenant,'domain',target.domain,'verify',
    jsonb_build_object('productKey',target.product_key,'challengeRotated',true)
  );
  RETURN jsonb_build_object(
    'domainId',target.id,'domain',target.domain,
    'recordName','_omniqora-verification.'||target.domain,
    'recordValue','omniqora-domain='||challenge
  );
END; $$;
REVOKE ALL ON FUNCTION public.platform_rotate_domain_challenge(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_rotate_domain_challenge(uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.service_report_domain_verification(
  _tenant uuid,_domain text,_dns_verified boolean,_ssl_active boolean,
  _observed_txt jsonb DEFAULT '[]'::jsonb,_http_status integer DEFAULT NULL,
  _failure_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.tenant_domains%rowtype;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Platform service required';
  END IF;
  SELECT * INTO target FROM public.tenant_domains
  WHERE tenant_id=_tenant AND domain=lower(trim(trailing '.' FROM trim(_domain))) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant domain not found'; END IF;
  INSERT INTO public.tenant_domain_verification_attempts(
    tenant_id,domain_id,domain,dns_verified,ssl_active,observed_txt,http_status,failure_reason
  ) VALUES(
    _tenant,target.id,target.domain,_dns_verified,_ssl_active,COALESCE(_observed_txt,'[]'::jsonb),
    _http_status,NULLIF(trim(COALESCE(_failure_reason,'')),'')
  );
  UPDATE public.tenant_domains SET
    verification_attempts=verification_attempts+1,last_checked_at=now(),
    verification_status=CASE WHEN _dns_verified THEN 'verified' ELSE 'pending' END,
    verified_at=CASE WHEN _dns_verified THEN COALESCE(verified_at,now()) ELSE verified_at END,
    ssl_status=CASE WHEN _ssl_active THEN 'active' WHEN _dns_verified THEN 'pending' ELSE ssl_status END,
    ssl_activated_at=CASE WHEN _ssl_active THEN COALESCE(ssl_activated_at,now()) ELSE ssl_activated_at END,
    failure_reason=NULLIF(trim(COALESCE(_failure_reason,'')),''),updated_at=now()
  WHERE id=target.id;
  RETURN jsonb_build_object(
    'domainId',target.id,'domain',target.domain,
    'verificationStatus',CASE WHEN _dns_verified THEN 'verified' ELSE 'pending' END,
    'sslStatus',CASE WHEN _ssl_active THEN 'active' WHEN _dns_verified THEN 'pending' ELSE target.ssl_status END,
    'dnsVerified',_dns_verified,'sslActive',_ssl_active
  );
END; $$;
REVOKE ALL ON FUNCTION public.service_report_domain_verification(uuid,text,boolean,boolean,jsonb,integer,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_report_domain_verification(uuid,text,boolean,boolean,jsonb,integer,text)
  TO service_role;

COMMIT;
