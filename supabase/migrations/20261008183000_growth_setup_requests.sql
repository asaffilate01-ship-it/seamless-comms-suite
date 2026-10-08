-- Scoped Growth onboarding through the existing SaaS Factory authority boundary.
-- This migration creates no tenant activation, entitlement, provider or administrator.
BEGIN;

CREATE TABLE public.growth_setup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES public.product_catalogue(product_key),
  request_key uuid NOT NULL,
  include_creative boolean NOT NULL,
  service_keys text[] NOT NULL CHECK (cardinality(service_keys) BETWEEN 1 AND 30),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected')),
  note text NOT NULL DEFAULT '' CHECK (length(note)<=1000),
  decision_note text CHECK (length(decision_note)<=1000),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  receipt jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (product_key IN ('omniqora','syndriva','merqora','affivon')),
  CHECK ((status='requested')=(decided_by IS NULL AND decided_at IS NULL)),
  CHECK ((status='approved')=(receipt IS NOT NULL)),
  UNIQUE (tenant_id,product_key,request_key)
);
CREATE UNIQUE INDEX growth_setup_one_pending_scope
  ON public.growth_setup_requests(tenant_id,product_key) WHERE status='requested';
CREATE INDEX growth_setup_scope_history
  ON public.growth_setup_requests(tenant_id,product_key,created_at DESC);
ALTER TABLE public.growth_setup_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_setup_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.growth_setup_requests TO authenticated,service_role;
CREATE POLICY growth_setup_scope_read ON public.growth_setup_requests FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()));

CREATE FUNCTION public.growth_setup_actor_role(_tenant uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL
    WHEN public.is_platform_admin(auth.uid()) THEN 'platform_admin'
    ELSE (SELECT m.role::text FROM public.tenant_members m WHERE m.tenant_id=_tenant AND m.user_id=auth.uid()) END;
$$;

-- The same SQL access rule now drives the runtime, so platform administrators
-- have consistent authority even with a viewer membership or without membership.
CREATE FUNCTION public.growth_studio_access(_tenant uuid,_product text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_role text; tenant_status text; product_status text; allowed boolean; writable boolean; reviewer boolean; creative boolean; reason text;
BEGIN
  actor_role:=public.growth_setup_actor_role(_tenant);
  IF actor_role IS NULL THEN RAISE EXCEPTION 'Tenant access required' USING ERRCODE='42501'; END IF;
  IF _product IS NULL OR _product NOT IN ('omniqora','syndriva','merqora','affivon') THEN RAISE EXCEPTION 'Unsupported Growth product' USING ERRCODE='22023'; END IF;
  SELECT status INTO tenant_status FROM public.tenants WHERE id=_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found' USING ERRCODE='P0002'; END IF;
  SELECT status INTO product_status FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product;
  allowed:=public.growth_studio_can_access(_tenant,_product,auth.uid(),'read');
  writable:=public.growth_studio_can_access(_tenant,_product,auth.uid(),'write');
  reviewer:=public.growth_studio_can_access(_tenant,_product,auth.uid(),'admin');
  SELECT EXISTS(SELECT 1 FROM public.tenant_services WHERE tenant_id=_tenant AND service_key='omniqora.creative'
    AND status IN ('active','trial') AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())) INTO creative;
  reason:=CASE WHEN tenant_status<>'active' THEN 'This workspace is not active. An administrator must restore access.'
    WHEN product_status IS DISTINCT FROM 'active' THEN 'Request product activation in Growth setup to use this workspace.'
    WHEN NOT allowed THEN 'Request the Campaigns service in Growth setup to use this workspace.'
    WHEN NOT writable THEN 'Your workspace role has read access. An owner, admin or agent can prepare campaigns.'
    ELSE NULL END;
  RETURN jsonb_strip_nulls(jsonb_build_object('allowed',allowed,'canWrite',writable,'canReview',reviewer,
    'canHandoff',reviewer AND creative,'role',actor_role,'reason',reason));
END; $$;

CREATE FUNCTION public.growth_setup_list_workspaces(_offset integer DEFAULT 0,_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; total integer; admin_actor boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF _offset IS NULL OR _offset NOT BETWEEN 0 AND 10000 OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 50
    THEN RAISE EXCEPTION 'Invalid workspace page' USING ERRCODE='22023'; END IF;
  admin_actor:=public.is_platform_admin(auth.uid());
  WITH available AS (
    SELECT t.id,t.name,t.status,CASE WHEN admin_actor THEN 'platform_admin' ELSE m.role::text END AS role
    FROM public.tenants t LEFT JOIN public.tenant_members m ON m.tenant_id=t.id AND m.user_id=auth.uid()
    WHERE admin_actor OR m.user_id IS NOT NULL ORDER BY lower(t.name),t.id LIMIT _limit+1 OFFSET _offset
  ) SELECT count(*)::integer,COALESCE(jsonb_agg(to_jsonb(x) ORDER BY lower(x.name),x.id),'[]'::jsonb)
    INTO total,result FROM available x;
  IF total>_limit THEN result:=result-_limit; END IF;
  RETURN jsonb_build_object('workspaces',result,'hasMore',total>_limit,'nextOffset',CASE WHEN total>_limit THEN _offset+_limit ELSE NULL END);
END; $$;

CREATE FUNCTION public.growth_setup_request_doc(r public.growth_setup_requests)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',r.id,'tenantId',r.tenant_id,'productKey',r.product_key,'requestKey',r.request_key,
    'includeCreative',r.include_creative,'status',r.status,'note',r.note,'decisionNote',r.decision_note,
    'requestedBy',r.requested_by,'decidedBy',r.decided_by,'decidedAt',r.decided_at,'receipt',r.receipt,
    'revision',r.revision,'createdAt',r.created_at,'updatedAt',r.updated_at);
$$;

CREATE FUNCTION public.growth_setup_service_keys(_product text,_include_creative boolean)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH RECURSIVE seeds(service_key) AS (
    SELECT 'omniqora.campaigns'::text
    UNION SELECT 'omniqora.creative' WHERE _include_creative
    UNION SELECT service_key FROM public.product_services WHERE product_key=_product AND required
  ), needed(service_key) AS (
    SELECT service_key FROM seeds
    UNION SELECT d.depends_on_service_key FROM needed n JOIN public.service_dependencies d ON d.service_key=n.service_key AND d.required
  ) SELECT array_agg(service_key ORDER BY service_key) FROM needed;
$$;

CREATE FUNCTION public.growth_setup_blockers(_tenant uuid,_product text,_services text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE blockers jsonb:='[]'; p public.product_catalogue; tp public.tenant_products; s record; tenant_status text;
BEGIN
  SELECT status INTO tenant_status FROM public.tenants WHERE id=_tenant;
  IF tenant_status IS DISTINCT FROM 'active' THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('code','tenant_inactive','message','The workspace must be restored before activation.')); END IF;
  SELECT * INTO p FROM public.product_catalogue WHERE product_key=_product;
  SELECT * INTO tp FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product;
  IF p.product_key IS NULL OR p.status NOT IN ('active','beta','internal') THEN
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','product_unavailable','message','The product is unavailable in SaaS Factory.'));
  ELSIF tp.status IS NOT NULL AND tp.status NOT IN ('requested','provisioning','active') THEN
    blockers:=blockers||jsonb_build_array(jsonb_build_object('code','product_protected','message','An existing product suspension, cancellation or failure must be resolved in SaaS Factory.'));
  ELSIF tp.status IS DISTINCT FROM 'active' THEN
    IF _product='omniqora' AND p.deployment_mode='hosted' AND p.implementation_status IN ('built_main','live_main') THEN NULL;
    ELSIF _product<>'omniqora' AND EXISTS(SELECT 1 FROM public.product_connections c
      WHERE c.tenant_id=_tenant AND c.product_key=_product AND c.status='connected' AND c.last_verified_at IS NOT NULL
        AND length(btrim(c.external_tenant_id))>0) THEN NULL;
    ELSE blockers:=blockers||jsonb_build_array(jsonb_build_object('code','product_connection_required',
      'message',CASE WHEN _product='omniqora' THEN 'The hosted product implementation is not ready.'
        ELSE 'Connect and independently verify the source product workspace before activating it.' END)); END IF;
  END IF;
  IF _services IS NULL OR cardinality(_services) NOT BETWEEN 1 AND 30 THEN
    RETURN blockers||jsonb_build_array(jsonb_build_object('code','service_closure_invalid','message','The required service plan is unavailable or exceeds the supported setup scope.'));
  END IF;
  FOR s IN SELECT k.service_key,c.name,c.status AS catalogue_status,c.owner_product_key,c.provisioning_mode,c.implementation_status,
    t.status,t.source,t.valid_from,t.valid_until FROM unnest(_services) AS k(service_key)
    LEFT JOIN public.service_catalogue c ON c.service_key=k.service_key
    LEFT JOIN public.tenant_services t ON t.tenant_id=_tenant AND t.service_key=k.service_key ORDER BY k.service_key LOOP
    IF s.catalogue_status IS NULL OR s.catalogue_status NOT IN ('active','beta','internal')
      OR s.owner_product_key IS DISTINCT FROM 'omniqora' OR s.provisioning_mode IS DISTINCT FROM 'automatic'
      OR s.implementation_status NOT IN ('built_main','live_main') THEN
      blockers:=blockers||jsonb_build_array(jsonb_build_object('code','service_not_provisionable','message',s.service_key||' is not an implemented automatic Omniqora service.'));
    ELSIF s.status IS NOT NULL AND (s.status NOT IN ('requested','provisioning','active','trial')
      OR s.valid_from>now() OR (s.valid_until IS NOT NULL AND s.valid_until<=now())
      OR (s.source='billing' AND s.status NOT IN ('active','trial'))) THEN
      blockers:=blockers||jsonb_build_array(jsonb_build_object('code','service_protected','message',s.service_key||' has a suspension, expiry, future start or billing restriction that must be resolved first.'));
    END IF;
  END LOOP;
  RETURN blockers;
END; $$;

CREATE FUNCTION public.growth_setup_workspace(_tenant uuid,_product text,_include_creative boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_role text; access_doc jsonb; t public.tenants; p public.product_catalogue; product_status text;
  keys text[]; service_docs jsonb; request_doc jsonb; history_docs jsonb; connection_time timestamptz; pending public.growth_setup_requests;
BEGIN
  access_doc:=public.growth_studio_access(_tenant,_product);
  actor_role:=access_doc->>'role';
  SELECT * INTO STRICT t FROM public.tenants WHERE id=_tenant;
  SELECT * INTO p FROM public.product_catalogue WHERE product_key=_product;
  IF NOT FOUND THEN RAISE EXCEPTION 'Growth product is unavailable' USING ERRCODE='P0002'; END IF;
  SELECT status INTO product_status FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product;
  SELECT * INTO pending FROM public.growth_setup_requests
    WHERE tenant_id=_tenant AND product_key=_product AND status='requested';
  IF FOUND THEN request_doc:=public.growth_setup_request_doc(pending); END IF;
  keys:=public.growth_setup_service_keys(_product,COALESCE(pending.include_creative,_include_creative,true));
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key',k.service_key,'name',COALESCE(c.name,k.service_key),'status',s.status,
    'active',COALESCE(s.status IN ('active','trial') AND s.valid_from<=now() AND (s.valid_until IS NULL OR s.valid_until>now()),false),
    'validFrom',s.valid_from,'validUntil',s.valid_until,'implementationStatus',c.implementation_status,
    'provisionable',COALESCE(c.status IN ('active','beta','internal') AND c.owner_product_key='omniqora'
      AND c.provisioning_mode='automatic' AND c.implementation_status IN ('built_main','live_main'),false)) ORDER BY k.service_key),'[]'::jsonb)
    INTO service_docs FROM unnest(keys) AS k(service_key) LEFT JOIN public.service_catalogue c ON c.service_key=k.service_key
    LEFT JOIN public.tenant_services s ON s.tenant_id=_tenant AND s.service_key=k.service_key;
  SELECT COALESCE(jsonb_agg(public.growth_setup_request_doc(r) ORDER BY r.created_at DESC,r.id),'[]'::jsonb) INTO history_docs
    FROM (SELECT * FROM public.growth_setup_requests WHERE tenant_id=_tenant AND product_key=_product ORDER BY created_at DESC,id LIMIT 5) r;
  SELECT max(last_verified_at) INTO connection_time FROM public.product_connections
    WHERE tenant_id=_tenant AND product_key=_product AND status='connected' AND length(btrim(external_tenant_id))>0;
  RETURN jsonb_build_object('tenant',jsonb_build_object('id',t.id,'name',t.name,'status',t.status),
    'product',jsonb_build_object('key',p.product_key,'name',p.name,'status',product_status,
      'deploymentMode',p.deployment_mode,'implementationStatus',p.implementation_status),
    'access',access_doc,'permissions',jsonb_build_object('canRequest',t.status='active' AND actor_role IN ('owner','admin','platform_admin'),
      'canConfigure',t.status='active' AND actor_role IN ('owner','admin','platform_admin'),'canDecide',actor_role='platform_admin',
      'reviewAvailable',EXISTS(SELECT 1 FROM public.platform_admins)),
    'services',service_docs,'connection',jsonb_build_object('verified',connection_time IS NOT NULL,'lastVerifiedAt',connection_time),
    'request',request_doc,'history',history_docs,'blockers',public.growth_setup_blockers(_tenant,_product,keys));
END; $$;

CREATE FUNCTION public.growth_setup_request(_tenant uuid,_product text,_include_creative boolean,_request_key uuid,_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_role text; r public.growth_setup_requests;
BEGIN
  actor_role:=public.growth_setup_actor_role(_tenant);
  IF actor_role IS NULL OR actor_role NOT IN ('owner','admin','platform_admin') THEN RAISE EXCEPTION 'Workspace owner or admin required' USING ERRCODE='42501'; END IF;
  IF _product IS NULL OR _product NOT IN ('omniqora','syndriva','merqora','affivon') OR _request_key IS NULL
    OR _include_creative IS NULL OR _note IS NULL OR length(_note)>1000 THEN RAISE EXCEPTION 'Invalid Growth setup request' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_tenant::text||':growth-setup:'||_product,0));
  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=_tenant AND status='active') THEN RAISE EXCEPTION 'Workspace must be active' USING ERRCODE='55000'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key=_product AND status IN ('active','beta','internal')) THEN RAISE EXCEPTION 'Growth product is unavailable' USING ERRCODE='55000'; END IF;
  SELECT * INTO r FROM public.growth_setup_requests WHERE tenant_id=_tenant AND product_key=_product AND request_key=_request_key;
  IF FOUND THEN
    IF r.include_creative IS DISTINCT FROM _include_creative OR r.note IS DISTINCT FROM btrim(_note) THEN RAISE EXCEPTION 'Request key belongs to different setup details' USING ERRCODE='23505'; END IF;
    RETURN public.growth_setup_request_doc(r);
  END IF;
  SELECT * INTO r FROM public.growth_setup_requests WHERE tenant_id=_tenant AND product_key=_product AND status='requested';
  IF FOUND THEN
    IF r.include_creative IS DISTINCT FROM _include_creative THEN RAISE EXCEPTION 'A different setup plan is already awaiting review' USING ERRCODE='55000'; END IF;
    RETURN public.growth_setup_request_doc(r);
  END IF;
  INSERT INTO public.growth_setup_requests(tenant_id,product_key,request_key,include_creative,service_keys,note,requested_by)
    VALUES(_tenant,_product,_request_key,_include_creative,public.growth_setup_service_keys(_product,_include_creative),btrim(_note),auth.uid()) RETURNING * INTO r;
  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
    VALUES(_tenant,auth.uid(),'growth.setup.requested','growth_setup_requests',r.id::text,
      jsonb_build_object('productKey',_product,'includeCreative',_include_creative,'revision',r.revision));
  RETURN public.growth_setup_request_doc(r);
END; $$;

CREATE FUNCTION public.growth_setup_decide(_tenant uuid,_product text,_request uuid,_expected_revision integer,_decision text,_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_setup_requests; keys text[]; blockers jsonb; key text; current_service public.tenant_services;
  product_active boolean; activated text[]:='{}'; preserved text[]:='{}'; receipt_doc jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Platform administrator required' USING ERRCODE='42501'; END IF;
  IF _decision IS NULL OR _decision NOT IN ('approved','rejected') OR _expected_revision IS NULL OR _expected_revision<1
    OR _note IS NULL OR length(_note)>1000 THEN RAISE EXCEPTION 'Invalid setup decision' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_tenant::text||':growth-setup:'||_product,0));
  SELECT * INTO r FROM public.growth_setup_requests WHERE id=_request AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Setup request not found in this workspace' USING ERRCODE='P0002'; END IF;
  IF r.status<>'requested' THEN
    IF r.status=_decision AND r.decision_note IS NOT DISTINCT FROM btrim(_note)
      AND _expected_revision IN (r.revision,r.revision-1) THEN RETURN public.growth_setup_request_doc(r); END IF;
    RAISE EXCEPTION 'This setup request already has a different decision' USING ERRCODE='40001';
  END IF;
  IF r.revision<>_expected_revision THEN RAISE EXCEPTION 'Reload the setup request before deciding' USING ERRCODE='40001'; END IF;
  IF _decision='approved' THEN
    -- Serialize all grants in the workspace; row locks also prevent concurrent
    -- billing/suspension updates from being overwritten during this transaction.
    PERFORM 1 FROM public.tenants WHERE id=_tenant FOR UPDATE;
    PERFORM 1 FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product FOR UPDATE;
    keys:=public.growth_setup_service_keys(_product,r.include_creative);
    IF keys IS DISTINCT FROM r.service_keys THEN RAISE EXCEPTION 'The required service plan changed. Reject this request and submit the updated plan.' USING ERRCODE='40001'; END IF;
    PERFORM 1 FROM public.tenant_services WHERE tenant_id=_tenant AND service_key=ANY(keys) ORDER BY service_key FOR UPDATE;
    PERFORM 1 FROM public.product_connections WHERE tenant_id=_tenant AND product_key=_product FOR SHARE;
    blockers:=public.growth_setup_blockers(_tenant,_product,keys);
    IF jsonb_array_length(blockers)>0 THEN RAISE EXCEPTION '%',blockers->0->>'message' USING ERRCODE='55000'; END IF;
    SELECT EXISTS(SELECT 1 FROM public.tenant_products WHERE tenant_id=_tenant AND product_key=_product AND status='active') INTO product_active;
    IF NOT product_active THEN
      INSERT INTO public.tenant_products(tenant_id,product_key,status,activated_at,launch_status)
        VALUES(_tenant,_product,'active',now(),'configuring')
        ON CONFLICT (tenant_id,product_key) DO UPDATE SET status='active',activated_at=COALESCE(public.tenant_products.activated_at,now()),updated_at=now();
    END IF;
    FOREACH key IN ARRAY keys LOOP
      SELECT * INTO current_service FROM public.tenant_services WHERE tenant_id=_tenant AND service_key=key;
      IF FOUND AND current_service.status IN ('active','trial') THEN preserved:=array_append(preserved,key);
      ELSE
        INSERT INTO public.tenant_services(tenant_id,service_key,status,source)
          VALUES(_tenant,key,'active','manual')
          ON CONFLICT (tenant_id,service_key) DO UPDATE SET status='active',updated_at=now();
        activated:=array_append(activated,key);
      END IF;
    END LOOP;
    receipt_doc:=jsonb_build_object('productActivated',NOT product_active,'servicesActivated',to_jsonb(activated),'servicesPreserved',to_jsonb(preserved));
  END IF;
  UPDATE public.growth_setup_requests SET status=_decision,decision_note=btrim(_note),decided_by=auth.uid(),decided_at=now(),
    receipt=receipt_doc,revision=revision+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
    VALUES(_tenant,auth.uid(),'growth.setup.'||_decision,'growth_setup_requests',r.id::text,
      jsonb_build_object('productKey',_product,'includeCreative',r.include_creative,'revision',r.revision,'receipt',receipt_doc));
  RETURN public.growth_setup_request_doc(r);
END; $$;

CREATE FUNCTION public.growth_setup_save_writer(_tenant uuid,_product text,_provider text,_environment text,_model text,_max_tokens integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor_role text; binding public.provider_bindings; secret_name text; result uuid;
BEGIN
  actor_role:=public.growth_setup_actor_role(_tenant);
  IF actor_role IS NULL OR actor_role NOT IN ('owner','admin','platform_admin') THEN RAISE EXCEPTION 'Workspace owner or admin required' USING ERRCODE='42501'; END IF;
  IF _product IS NULL OR _product NOT IN ('omniqora','syndriva','merqora','affivon') OR _provider IS NULL OR _provider NOT IN ('ai.openai','ai.anthropic','ai.gemini')
    OR _environment IS NULL OR _environment NOT IN ('development','staging','production') OR _model IS NULL OR _model !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{1,160}$'
    OR _max_tokens IS NULL OR _max_tokens NOT BETWEEN 512 AND 4096 THEN RAISE EXCEPTION 'Invalid Growth writer configuration' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=_tenant AND status='active') THEN RAISE EXCEPTION 'Workspace must be active' USING ERRCODE='55000'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_catalogue WHERE product_key=_product AND status IN ('active','beta','internal'))
    OR NOT EXISTS(SELECT 1 FROM public.provider_catalogue WHERE provider_key=_provider AND status<>'retired') THEN RAISE EXCEPTION 'Product or provider is unavailable' USING ERRCODE='55000'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_tenant::text||':growth-writer:'||_product||':'||_provider||':'||_environment,0));
  SELECT * INTO binding FROM public.provider_bindings WHERE tenant_id=_tenant AND product_key=_product AND provider_key=_provider
    AND environment=_environment AND brand_id IS NULL AND location_id IS NULL FOR UPDATE;
  IF FOUND AND binding.status NOT IN ('configured','active','degraded') THEN RAISE EXCEPTION 'A disabled or failed provider binding must be restored by its operator before setup can edit it' USING ERRCODE='55000'; END IF;
  secret_name:='OQ_SECRET_GROWTH_'||upper(replace(_tenant::text,'-',''))||'_'||upper(_product)||'_'||upper(substring(_provider FROM 4));
  IF binding.id IS NOT NULL THEN
    UPDATE public.provider_bindings SET secret_refs=secret_refs||jsonb_build_object('api_key','env:'||secret_name),
      config=config||jsonb_build_object('growth_enabled',true,'model',_model,'max_output_tokens',_max_tokens),
      status='configured',last_verified_at=NULL,health='{}'::jsonb,updated_at=now() WHERE id=binding.id RETURNING id INTO result;
  ELSE
    INSERT INTO public.provider_bindings(tenant_id,product_key,provider_key,environment,status,secret_refs,config)
      VALUES(_tenant,_product,_provider,_environment,'configured',jsonb_build_object('api_key','env:'||secret_name),
        jsonb_build_object('growth_enabled',true,'model',_model,'max_output_tokens',_max_tokens)) RETURNING id INTO result;
  END IF;
  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
    VALUES(_tenant,auth.uid(),'growth.writer.configured','provider_bindings',result::text,
      jsonb_build_object('productKey',_product,'providerKey',_provider,'environment',_environment,'model',_model,'maxOutputTokens',_max_tokens));
  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.growth_setup_actor_role(uuid),public.growth_setup_request_doc(public.growth_setup_requests),
  public.growth_setup_service_keys(text,boolean),public.growth_setup_blockers(uuid,text,text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.growth_studio_access(uuid,text),public.growth_setup_list_workspaces(integer,integer),
  public.growth_setup_workspace(uuid,text,boolean),public.growth_setup_request(uuid,text,boolean,uuid,text),
  public.growth_setup_decide(uuid,text,uuid,integer,text,text),public.growth_setup_save_writer(uuid,text,text,text,text,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.growth_studio_access(uuid,text),public.growth_setup_list_workspaces(integer,integer),
  public.growth_setup_workspace(uuid,text,boolean),public.growth_setup_request(uuid,text,boolean,uuid,text),
  public.growth_setup_decide(uuid,text,uuid,integer,text,text),public.growth_setup_save_writer(uuid,text,text,text,text,integer)
  TO authenticated;

COMMIT;
