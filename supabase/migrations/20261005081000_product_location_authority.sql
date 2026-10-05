BEGIN;

-- Explicit central-location -> external-product-location authority.
-- Never infer external SaaS locations from names, postcodes or array position.

CREATE TABLE IF NOT EXISTS public.product_location_links(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_connection_id uuid NOT NULL REFERENCES public.product_connections(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,
  tenant_location_id uuid NOT NULL REFERENCES public.tenant_locations(id) ON DELETE CASCADE,
  external_location_id text NOT NULL CHECK(length(btrim(external_location_id)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'configured'
    CHECK(status IN('configured','verified','disabled','failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_connection_id,tenant_location_id),
  UNIQUE(product_connection_id,external_location_id)
);

CREATE INDEX IF NOT EXISTS product_location_links_tenant_idx
  ON public.product_location_links(tenant_id,product_key,status);

ALTER TABLE public.product_location_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_location_links FROM anon,authenticated;
GRANT SELECT ON public.product_location_links TO authenticated;
GRANT ALL ON public.product_location_links TO service_role;

DROP POLICY IF EXISTS product_location_links_read ON public.product_location_links;
CREATE POLICY product_location_links_read
ON public.product_location_links FOR SELECT TO authenticated
USING(
  public.is_platform_admin(auth.uid())
  OR public.is_tenant_member(tenant_id,auth.uid())
);

CREATE OR REPLACE FUNCTION public.platform_upsert_product_location_link(
  _connection uuid,
  _tenant_location uuid,
  _external_location text,
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  c public.product_connections%rowtype;
  result uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;

  SELECT * INTO c FROM public.product_connections WHERE id=_connection;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product connection not found'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.tenant_locations
    WHERE id=_tenant_location AND tenant_id=c.tenant_id
  ) THEN RAISE EXCEPTION 'Tenant location not found'; END IF;
  IF NULLIF(btrim(_external_location),'') IS NULL THEN
    RAISE EXCEPTION 'External product location id required';
  END IF;

  INSERT INTO public.product_location_links(
    tenant_id,product_connection_id,product_key,tenant_location_id,
    external_location_id,status,metadata,updated_at
  ) VALUES(
    c.tenant_id,c.id,c.product_key,_tenant_location,btrim(_external_location),
    'configured',COALESCE(_metadata,'{}'::jsonb),now()
  )
  ON CONFLICT(product_connection_id,tenant_location_id) DO UPDATE SET
    external_location_id=EXCLUDED.external_location_id,
    status='configured',
    metadata=EXCLUDED.metadata,
    last_verified_at=NULL,
    updated_at=now()
  RETURNING id INTO result;

  PERFORM public.queue_provisioning(
    c.tenant_id,'integration',c.product_key||':'||c.external_tenant_id,'verify',
    jsonb_build_object('connectionId',c.id,'locationLinkId',result)
  );

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_upsert_product_location_link(uuid,uuid,text,jsonb)
FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_upsert_product_location_link(uuid,uuid,text,jsonb)
TO authenticated;


CREATE OR REPLACE FUNCTION public.server_upsert_product_location_link(
  _connection uuid,
  _tenant_location uuid,
  _external_location text,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _verified boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
  c public.product_connections%rowtype;
  result uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  SELECT * INTO c FROM public.product_connections WHERE id=_connection;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product connection not found'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.tenant_locations
    WHERE id=_tenant_location AND tenant_id=c.tenant_id
  ) THEN RAISE EXCEPTION 'Tenant location not found'; END IF;

  INSERT INTO public.product_location_links(
    tenant_id,product_connection_id,product_key,tenant_location_id,
    external_location_id,status,metadata,last_verified_at,updated_at
  ) VALUES(
    c.tenant_id,c.id,c.product_key,_tenant_location,btrim(_external_location),
    CASE WHEN _verified THEN 'verified' ELSE 'configured' END,
    COALESCE(_metadata,'{}'::jsonb),
    CASE WHEN _verified THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT(product_connection_id,tenant_location_id) DO UPDATE SET
    external_location_id=EXCLUDED.external_location_id,
    status=EXCLUDED.status,
    metadata=EXCLUDED.metadata,
    last_verified_at=EXCLUDED.last_verified_at,
    updated_at=now()
  RETURNING id INTO result;

  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.server_upsert_product_location_link(uuid,uuid,text,jsonb,boolean)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_upsert_product_location_link(uuid,uuid,text,jsonb,boolean)
TO service_role;


CREATE OR REPLACE FUNCTION public.server_mark_product_location_link(
  _link uuid,
  _verified boolean,
  _detail jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  UPDATE public.product_location_links
  SET status=CASE WHEN _verified THEN 'verified' ELSE 'failed' END,
      last_verified_at=CASE WHEN _verified THEN now() ELSE last_verified_at END,
      metadata=metadata||COALESCE(_detail,'{}'::jsonb),
      updated_at=now()
  WHERE id=_link;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.server_mark_product_location_link(uuid,boolean,jsonb)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_mark_product_location_link(uuid,boolean,jsonb)
TO service_role;


-- Worker-only credential issuance. The browser-admin version remains MFA/admin
-- controlled; this variant is for provisioning adapters only.
CREATE OR REPLACE FUNCTION public.server_set_product_credential(
  _connection uuid,
  _credential_hash text,
  _suffix text,
  _valid_days integer DEFAULT 365
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE row public.product_connections%rowtype;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role',true),'')<>'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF _valid_days NOT BETWEEN 1 AND 730 THEN RAISE EXCEPTION 'Invalid credential lifetime'; END IF;
  IF _credential_hash !~ '^[a-f0-9]{64}$' OR length(_suffix) NOT BETWEEN 4 AND 16 THEN
    RAISE EXCEPTION 'Invalid credential material';
  END IF;

  SELECT * INTO row FROM public.product_connections WHERE id=_connection;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product connection not found'; END IF;

  UPDATE public.product_connections
  SET credential_hash=_credential_hash,
      credential_suffix=_suffix,
      credential_expires_at=now()+make_interval(days=>_valid_days),
      status='configured',
      updated_at=now()
  WHERE id=_connection;

  RETURN jsonb_build_object(
    'connectionId',row.id,
    'suffix',_suffix,
    'expiresAt',now()+make_interval(days=>_valid_days)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.server_set_product_credential(uuid,text,text,integer)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_set_product_credential(uuid,text,text,integer)
TO service_role;


CREATE OR REPLACE FUNCTION public.get_product_location_links(_tenant uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',l.id,
    'connectionId',l.product_connection_id,
    'productKey',l.product_key,
    'tenantLocationId',l.tenant_location_id,
    'externalLocationId',l.external_location_id,
    'status',l.status,
    'lastVerifiedAt',l.last_verified_at,
    'metadata',l.metadata
  ) ORDER BY l.product_key,l.tenant_location_id),'[]'::jsonb)
  FROM public.product_location_links l
  WHERE l.tenant_id=_tenant
    AND (
      public.is_platform_admin(auth.uid())
      OR public.is_tenant_member(_tenant,auth.uid())
    )
$$;
REVOKE ALL ON FUNCTION public.get_product_location_links(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_product_location_links(uuid) TO authenticated,service_role;

COMMIT;
