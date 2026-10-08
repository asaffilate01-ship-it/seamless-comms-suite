BEGIN;

-- Register product identities only. This never provisions a tenant or grants an entitlement.
INSERT INTO public.product_catalogue(product_key,name,description,category,deployment_mode,status)
VALUES
 ('syndriva','Syndriva','Shared marketplace infrastructure and catalogue adapters.','commerce','hybrid','active'),
 ('merqora','Merqora','Seller and agency marketplace growth workspace; external commerce data remains authoritative.','commerce','external','active'),
 ('affivon','Affivon','Affiliate catalogue, offers and content across merchant storefronts.','commerce','external','active')
ON CONFLICT(product_key) DO NOTHING;

INSERT INTO public.provider_catalogue(provider_key,name,provider_kind,capabilities,required_secret_names,
 public_config_names,status,implementation_status,metadata)
VALUES('ai.jev','Jev','ai',ARRAY['classification'],ARRAY['api_key'],ARRAY['model','growth_enabled'],
 'preview','built_main','{"activation":"Requires a scoped provider binding and server secret; no live usage is implied."}'::jsonb)
ON CONFLICT(provider_key) DO NOTHING;

CREATE TABLE public.growth_studio_brands(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL, product_key text NOT NULL CHECK(product_key IN('omniqora','syndriva','merqora','affivon')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
 voice text NOT NULL DEFAULT '' CHECK(length(voice)<=6000),
 offer text NOT NULL DEFAULT '' CHECK(length(offer)<=6000),
 rules text[] NOT NULL DEFAULT '{}' CHECK(cardinality(rules)<=40),
 audience text NOT NULL DEFAULT '' CHECK(length(audience)<=6000),
 locale text NOT NULL DEFAULT 'en' CHECK(locale IN('en','ur','es')),
 disclosure text NOT NULL DEFAULT '' CHECK(length(disclosure)<=4000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,tenant_id,product_key),
 CHECK(product_key<>'affivon' OR length(btrim(disclosure))>0),
 FOREIGN KEY(tenant_id,product_key) REFERENCES public.tenant_products(tenant_id,product_key) ON DELETE RESTRICT
);

CREATE TABLE public.growth_studio_evidence(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, product_key text NOT NULL,
 brand_id uuid NOT NULL, title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
 content text NOT NULL CHECK(length(btrim(content)) BETWEEN 1 AND 20000),
 source_url text CHECK(source_url IS NULL OR (length(source_url)<=2000 AND source_url ~ '^https?://[^[:space:]]+$')),
 kind text NOT NULL CHECK(kind IN('brand_fact','competitor_ad','customer_feedback','product_data','affiliate_offer')),
 valid_until timestamptz, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,tenant_id,product_key), UNIQUE(id,brand_id,tenant_id,product_key),
 CHECK(kind NOT IN('product_data','affiliate_offer') OR valid_until IS NOT NULL),
 FOREIGN KEY(brand_id,tenant_id,product_key) REFERENCES public.growth_studio_brands(id,tenant_id,product_key) ON DELETE RESTRICT
);

CREATE TABLE public.growth_studio_campaigns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, product_key text NOT NULL,
 brand_id uuid NOT NULL, title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 200),
 objective text NOT NULL CHECK(length(btrim(objective)) BETWEEN 1 AND 10000),
 channel text NOT NULL CHECK(channel IN('social','email','whatsapp','web')),
 locale text NOT NULL CHECK(locale IN('en','ur','es')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,tenant_id,product_key), UNIQUE(id,brand_id,tenant_id,product_key),
 FOREIGN KEY(brand_id,tenant_id,product_key) REFERENCES public.growth_studio_brands(id,tenant_id,product_key) ON DELETE RESTRICT
);

CREATE TABLE public.growth_studio_campaign_evidence(
 campaign_id uuid NOT NULL, evidence_id uuid NOT NULL,
 brand_id uuid NOT NULL, tenant_id uuid NOT NULL, product_key text NOT NULL,
 PRIMARY KEY(campaign_id,evidence_id),
 FOREIGN KEY(campaign_id,brand_id,tenant_id,product_key)
   REFERENCES public.growth_studio_campaigns(id,brand_id,tenant_id,product_key) ON DELETE CASCADE,
 FOREIGN KEY(evidence_id,brand_id,tenant_id,product_key)
   REFERENCES public.growth_studio_evidence(id,brand_id,tenant_id,product_key) ON DELETE RESTRICT
);

-- Composite targets protect the draft handoff even if a privileged caller supplies a wrong ID.
ALTER TABLE public.marketing_campaigns ADD CONSTRAINT growth_marketing_scope_unique UNIQUE(id,tenant_id,product_key);
ALTER TABLE public.creative_briefs ADD CONSTRAINT growth_creative_scope_unique UNIQUE(id,tenant_id,product_key);

CREATE TABLE public.growth_studio_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, product_key text NOT NULL,
 brand_id uuid NOT NULL, campaign_id uuid NOT NULL,
 request_key text NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),
 writer_binding_id text CHECK(writer_binding_id IS NULL OR length(writer_binding_id) BETWEEN 1 AND 200),
 classifier_binding_id text CHECK(classifier_binding_id IS NULL OR length(classifier_binding_id) BETWEEN 1 AND 200),
 provider_key text NOT NULL CHECK(length(provider_key) BETWEEN 1 AND 120),
 model text NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
 input_snapshot jsonb NOT NULL CHECK(jsonb_typeof(input_snapshot)='object'),
 execution_token uuid NOT NULL DEFAULT gen_random_uuid(),
 lease_expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
 status text NOT NULL DEFAULT 'running' CHECK(status IN('running','completed','blocked','failed','stale')),
 review_status text NOT NULL DEFAULT 'pending' CHECK(review_status IN('pending','approved','rejected')),
 result jsonb CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND octet_length(result::text)<=524288)),
 error text CHECK(error IS NULL OR length(error)<=4000),
 note text CHECK(note IS NULL OR length(note)<=4000),
 reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz,
 finished_at timestamptz,
 marketing_campaign_id uuid, creative_brief_id uuid,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,product_key,request_key), UNIQUE(id,tenant_id,product_key),
 CHECK((marketing_campaign_id IS NULL)=(creative_brief_id IS NULL)),
 CHECK(marketing_campaign_id IS NULL OR (status='completed' AND review_status='approved')),
 CHECK(status<>'running' OR (result IS NULL AND finished_at IS NULL)),
 CHECK(review_status='pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
 FOREIGN KEY(campaign_id,brand_id,tenant_id,product_key)
   REFERENCES public.growth_studio_campaigns(id,brand_id,tenant_id,product_key) ON DELETE RESTRICT,
 FOREIGN KEY(marketing_campaign_id,tenant_id,product_key)
   REFERENCES public.marketing_campaigns(id,tenant_id,product_key) ON DELETE RESTRICT,
 FOREIGN KEY(creative_brief_id,tenant_id,product_key)
   REFERENCES public.creative_briefs(id,tenant_id,product_key) ON DELETE RESTRICT
);

CREATE INDEX growth_studio_evidence_scope_idx ON public.growth_studio_evidence(tenant_id,product_key,brand_id);
CREATE INDEX growth_studio_campaign_scope_idx ON public.growth_studio_campaigns(tenant_id,product_key,updated_at DESC);
CREATE INDEX growth_studio_run_scope_idx ON public.growth_studio_runs(tenant_id,product_key,created_at DESC);

CREATE FUNCTION public.growth_studio_can_access(_tenant uuid,_product text,_actor uuid,_mode text DEFAULT 'read')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT _actor IS NOT NULL
   AND _product IN('omniqora','syndriva','merqora','affivon')
   AND _mode IN('read','write','admin')
   AND EXISTS(SELECT 1 FROM public.tenants t WHERE t.id=_tenant AND t.status='active')
   AND EXISTS(SELECT 1 FROM public.tenant_products p
      WHERE p.tenant_id=_tenant AND p.product_key=_product AND p.status='active')
   AND EXISTS(SELECT 1 FROM public.tenant_services s
      WHERE s.tenant_id=_tenant AND s.service_key='omniqora.campaigns'
      AND s.status IN('active','trial') AND s.valid_from<=now()
      AND (s.valid_until IS NULL OR s.valid_until>now()))
   AND (public.is_platform_admin(_actor) OR EXISTS(
      SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant AND m.user_id=_actor
       AND (_mode='read' OR (_mode='write' AND m.role::text IN('owner','admin','agent'))
         OR (_mode='admin' AND m.role::text IN('owner','admin')))
   ));
$$;
REVOKE ALL ON FUNCTION public.growth_studio_can_access(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.growth_studio_can_access(uuid,text,uuid,text) TO authenticated,service_role;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['growth_studio_brands','growth_studio_evidence','growth_studio_campaigns','growth_studio_campaign_evidence','growth_studio_runs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO service_role',t);
  IF t<>'growth_studio_runs' THEN EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t); END IF;
  EXECUTE format('CREATE POLICY growth_studio_scope_read ON public.%I FOR SELECT TO authenticated USING(public.growth_studio_can_access(tenant_id,product_key,auth.uid(),''read''))',t);
 END LOOP;
END $$;
-- Private execution tokens are never exposed by workspace/table reads.
GRANT SELECT(id,tenant_id,product_key,brand_id,campaign_id,request_key,writer_binding_id,classifier_binding_id,
 provider_key,model,input_snapshot,lease_expires_at,status,review_status,result,error,note,reviewed_by,reviewed_at,
 finished_at,marketing_campaign_id,creative_brief_id,revision,created_by,created_at,updated_at)
 ON public.growth_studio_runs TO authenticated;

CREATE FUNCTION public.growth_studio_immutable_run() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (NEW.id,NEW.tenant_id,NEW.product_key,NEW.brand_id,NEW.campaign_id,NEW.request_key,
     NEW.writer_binding_id,NEW.classifier_binding_id,NEW.provider_key,NEW.model,NEW.input_snapshot,
     NEW.execution_token,NEW.lease_expires_at,NEW.created_by,NEW.created_at)
    IS DISTINCT FROM
    (OLD.id,OLD.tenant_id,OLD.product_key,OLD.brand_id,OLD.campaign_id,OLD.request_key,
     OLD.writer_binding_id,OLD.classifier_binding_id,OLD.provider_key,OLD.model,OLD.input_snapshot,
     OLD.execution_token,OLD.lease_expires_at,OLD.created_by,OLD.created_at)
 THEN RAISE EXCEPTION 'Growth run identity and input snapshot are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status<>'running' AND NEW.result IS DISTINCT FROM OLD.result
 THEN RAISE EXCEPTION 'A terminal Growth result is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.marketing_campaign_id IS NOT NULL AND NEW IS DISTINCT FROM OLD
 THEN RAISE EXCEPTION 'A handed-off Growth run is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER growth_studio_immutable_run BEFORE UPDATE ON public.growth_studio_runs
 FOR EACH ROW EXECUTE FUNCTION public.growth_studio_immutable_run();

CREATE FUNCTION public.growth_studio_brand_doc(r public.growth_studio_brands)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'tenantId',r.tenant_id,'productKey',r.product_key,'name',r.name,
 'voice',r.voice,'offer',r.offer,'rules',r.rules,'audience',r.audience,'locale',r.locale,'disclosure',r.disclosure,
 'revision',r.revision,'createdAt',r.created_at,'updatedAt',r.updated_at);
$$;
CREATE FUNCTION public.growth_studio_evidence_doc(r public.growth_studio_evidence)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'tenantId',r.tenant_id,'productKey',r.product_key,'brandId',r.brand_id,
 'title',r.title,'content',r.content,'sourceUrl',r.source_url,'kind',r.kind,'validUntil',r.valid_until,
 'revision',r.revision,'createdAt',r.created_at,'updatedAt',r.updated_at);
$$;
CREATE FUNCTION public.growth_studio_campaign_doc(r public.growth_studio_campaigns)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'tenantId',r.tenant_id,'productKey',r.product_key,'brandId',r.brand_id,
 'title',r.title,'objective',r.objective,'channel',r.channel,'locale',r.locale,
 'evidenceIds',COALESCE((SELECT jsonb_agg(e.evidence_id ORDER BY e.evidence_id)
    FROM public.growth_studio_campaign_evidence e WHERE e.campaign_id=r.id),'[]'::jsonb),
 'revision',r.revision,'createdAt',r.created_at,'updatedAt',r.updated_at);
$$;
CREATE FUNCTION public.growth_studio_run_doc(r public.growth_studio_runs)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'tenantId',r.tenant_id,'productKey',r.product_key,'brandId',r.brand_id,
 'campaignId',r.campaign_id,'requestKey',r.request_key,'providerKey',r.provider_key,'model',r.model,
 'inputSnapshot',r.input_snapshot,'status',r.status,'reviewStatus',r.review_status,'result',r.result,
 'error',r.error,'note',r.note,'reviewedAt',r.reviewed_at,'finishedAt',r.finished_at,
 'marketingCampaignId',r.marketing_campaign_id,'creativeBriefId',r.creative_brief_id,
 'revision',r.revision,'createdAt',r.created_at,'updatedAt',r.updated_at);
$$;

CREATE FUNCTION public.growth_studio_snapshot(_tenant uuid,_product text,_campaign uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.growth_studio_campaigns; b public.growth_studio_brands; e jsonb;
BEGIN
 SELECT * INTO c FROM public.growth_studio_campaigns WHERE id=_campaign AND tenant_id=_tenant AND product_key=_product;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth campaign not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO STRICT b FROM public.growth_studio_brands WHERE id=c.brand_id AND tenant_id=_tenant AND product_key=_product;
 SELECT COALESCE(jsonb_agg(public.growth_studio_evidence_doc(x) ORDER BY x.id),'[]'::jsonb) INTO e
 FROM public.growth_studio_evidence x JOIN public.growth_studio_campaign_evidence ce
  ON ce.evidence_id=x.id AND ce.campaign_id=c.id;
 RETURN jsonb_build_object('brand',public.growth_studio_brand_doc(b),'campaign',public.growth_studio_campaign_doc(c),'evidence',e);
END;
$$;

CREATE FUNCTION public.growth_studio_run_current(r public.growth_studio_runs)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.growth_studio_can_access(r.tenant_id,r.product_key,r.created_by,'write')
  AND (r.input_snapshot-'writerBindingId'-'classifierBindingId')=public.growth_studio_snapshot(r.tenant_id,r.product_key,r.campaign_id)
  AND NOT EXISTS(SELECT 1 FROM public.growth_studio_campaign_evidence ce
    JOIN public.growth_studio_evidence e ON e.id=ce.evidence_id
    WHERE ce.campaign_id=r.campaign_id AND e.valid_until IS NOT NULL AND e.valid_until<=now());
$$;

CREATE FUNCTION public.growth_studio_assert_access(_tenant uuid,_product text,_mode text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT COALESCE(public.growth_studio_can_access(_tenant,_product,auth.uid(),_mode),false)
 THEN RAISE EXCEPTION 'Growth requires tenant access, an active product and a current campaigns entitlement' USING ERRCODE='42501'; END IF;
END;
$$;

CREATE FUNCTION public.growth_studio_workspace(_tenant uuid,_product text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.growth_studio_assert_access(_tenant,_product,'read');
 UPDATE public.growth_studio_runs SET status='failed',error='Generation timed out; retry with a new request key.',
  finished_at=now(),updated_at=now(),revision=revision+1
  WHERE tenant_id=_tenant AND product_key=_product AND status='running' AND lease_expires_at<=now();
 RETURN jsonb_build_object(
  'brands',COALESCE((SELECT jsonb_agg(public.growth_studio_brand_doc(b) ORDER BY b.updated_at DESC)
    FROM public.growth_studio_brands b WHERE b.tenant_id=_tenant AND b.product_key=_product),'[]'::jsonb),
  'evidence',COALESCE((SELECT jsonb_agg(public.growth_studio_evidence_doc(e) ORDER BY e.updated_at DESC)
    FROM public.growth_studio_evidence e WHERE e.tenant_id=_tenant AND e.product_key=_product),'[]'::jsonb),
  'campaigns',COALESCE((SELECT jsonb_agg(public.growth_studio_campaign_doc(c) ORDER BY c.updated_at DESC)
    FROM public.growth_studio_campaigns c WHERE c.tenant_id=_tenant AND c.product_key=_product),'[]'::jsonb),
  'runs',COALESCE((SELECT jsonb_agg(public.growth_studio_run_doc(r) ORDER BY r.created_at DESC)
    FROM (SELECT * FROM public.growth_studio_runs WHERE tenant_id=_tenant AND product_key=_product
      ORDER BY created_at DESC LIMIT 100) r),'[]'::jsonb));
END;
$$;

CREATE FUNCTION public.growth_studio_save_brand(_tenant uuid,_product text,_id uuid,_expected_revision integer,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_studio_brands; rule_list text[];
BEGIN
 PERFORM public.growth_studio_assert_access(_tenant,_product,'write');
 IF jsonb_typeof(_data) IS DISTINCT FROM 'object' OR jsonb_typeof(_data->'rules') IS DISTINCT FROM 'array'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(_data->'rules') x WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>1000)
 THEN RAISE EXCEPTION 'Invalid Growth brand instructions' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(x),'{}'::text[]) INTO rule_list FROM jsonb_array_elements_text(_data->'rules') x;
 IF _id IS NULL THEN
  IF _expected_revision IS NOT NULL THEN RAISE EXCEPTION 'New Growth brand cannot have an expected revision' USING ERRCODE='22023'; END IF;
  INSERT INTO public.growth_studio_brands(tenant_id,product_key,name,voice,offer,rules,audience,locale,disclosure,created_by)
  VALUES(_tenant,_product,_data->>'name',COALESCE(_data->>'voice',''),COALESCE(_data->>'offer',''),rule_list,
   COALESCE(_data->>'audience',''),COALESCE(_data->>'locale','en'),COALESCE(_data->>'disclosure',''),auth.uid()) RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM public.growth_studio_brands WHERE id=_id AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Growth brand not found' USING ERRCODE='P0002'; END IF;
  IF _expected_revision IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'Growth brand changed; reload before saving' USING ERRCODE='40001'; END IF;
  UPDATE public.growth_studio_brands SET name=_data->>'name',voice=COALESCE(_data->>'voice',''),offer=COALESCE(_data->>'offer',''),
   rules=rule_list,audience=COALESCE(_data->>'audience',''),locale=COALESCE(_data->>'locale','en'),disclosure=COALESCE(_data->>'disclosure',''),
   revision=revision+1,updated_at=now() WHERE id=_id RETURNING * INTO r;
  UPDATE public.growth_studio_runs SET status='stale',error='Brand instructions changed; generate a new draft.',
   review_status='pending',reviewed_by=NULL,reviewed_at=NULL,revision=revision+1,updated_at=now(),finished_at=COALESCE(finished_at,now())
   WHERE brand_id=_id AND status IN('running','completed') AND marketing_campaign_id IS NULL;
 END IF;
 RETURN public.growth_studio_brand_doc(r);
END;
$$;

CREATE FUNCTION public.growth_studio_save_evidence(_tenant uuid,_product text,_id uuid,_expected_revision integer,_brand uuid,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_studio_evidence;
BEGIN
 PERFORM public.growth_studio_assert_access(_tenant,_product,'write');
 IF jsonb_typeof(_data)<>'object' THEN RAISE EXCEPTION 'Invalid Growth evidence' USING ERRCODE='22023'; END IF;
 IF NULLIF(_data->>'validUntil','')::timestamptz<=now()
 THEN RAISE EXCEPTION 'Growth evidence validity must be in the future' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.growth_studio_brands WHERE id=_brand AND tenant_id=_tenant AND product_key=_product FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth brand not found' USING ERRCODE='P0002'; END IF;
 IF _id IS NULL THEN
  IF _expected_revision IS NOT NULL THEN RAISE EXCEPTION 'New Growth evidence cannot have an expected revision' USING ERRCODE='22023'; END IF;
  INSERT INTO public.growth_studio_evidence(tenant_id,product_key,brand_id,title,content,source_url,kind,valid_until,created_by)
  VALUES(_tenant,_product,_brand,_data->>'title',_data->>'content',NULLIF(_data->>'sourceUrl',''),_data->>'kind',
   NULLIF(_data->>'validUntil','')::timestamptz,auth.uid()) RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM public.growth_studio_evidence WHERE id=_id AND tenant_id=_tenant AND product_key=_product AND brand_id=_brand FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Growth evidence not found' USING ERRCODE='P0002'; END IF;
  IF _expected_revision IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'Growth evidence changed; reload before saving' USING ERRCODE='40001'; END IF;
  UPDATE public.growth_studio_evidence SET title=_data->>'title',content=_data->>'content',source_url=NULLIF(_data->>'sourceUrl',''),
   kind=_data->>'kind',valid_until=NULLIF(_data->>'validUntil','')::timestamptz,revision=revision+1,updated_at=now()
   WHERE id=_id RETURNING * INTO r;
  UPDATE public.growth_studio_runs run SET status='stale',error='Evidence changed; generate a new draft.',
   review_status='pending',reviewed_by=NULL,reviewed_at=NULL,revision=revision+1,updated_at=now(),finished_at=COALESCE(finished_at,now())
   WHERE run.status IN('running','completed') AND run.marketing_campaign_id IS NULL AND EXISTS(
    SELECT 1 FROM public.growth_studio_campaign_evidence ce WHERE ce.campaign_id=run.campaign_id AND ce.evidence_id=_id);
 END IF;
 RETURN public.growth_studio_evidence_doc(r);
END;
$$;

CREATE FUNCTION public.growth_studio_save_campaign(_tenant uuid,_product text,_id uuid,_expected_revision integer,_brand uuid,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_studio_campaigns; evidence_ids uuid[]; eid uuid;
BEGIN
 PERFORM public.growth_studio_assert_access(_tenant,_product,'write');
 IF jsonb_typeof(_data) IS DISTINCT FROM 'object' OR jsonb_typeof(_data->'evidenceIds') IS DISTINCT FROM 'array'
  OR jsonb_array_length(_data->'evidenceIds') NOT BETWEEN 1 AND 20
 THEN RAISE EXCEPTION 'Invalid Growth campaign evidence' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(array_agg(DISTINCT x::uuid),'{}'::uuid[]) INTO evidence_ids FROM jsonb_array_elements_text(_data->'evidenceIds') x;
 PERFORM 1 FROM public.growth_studio_brands WHERE id=_brand AND tenant_id=_tenant AND product_key=_product FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth brand not found' USING ERRCODE='P0002'; END IF;
 FOREACH eid IN ARRAY evidence_ids LOOP
  PERFORM 1 FROM public.growth_studio_evidence WHERE id=eid AND brand_id=_brand AND tenant_id=_tenant AND product_key=_product FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign evidence must belong to the same brand, tenant and product' USING ERRCODE='23503'; END IF;
 END LOOP;
 IF _id IS NULL THEN
  IF _expected_revision IS NOT NULL THEN RAISE EXCEPTION 'New Growth campaign cannot have an expected revision' USING ERRCODE='22023'; END IF;
  INSERT INTO public.growth_studio_campaigns(tenant_id,product_key,brand_id,title,objective,channel,locale,created_by)
  VALUES(_tenant,_product,_brand,_data->>'title',_data->>'objective',_data->>'channel',_data->>'locale',auth.uid()) RETURNING * INTO r;
 ELSE
  SELECT * INTO r FROM public.growth_studio_campaigns WHERE id=_id AND tenant_id=_tenant AND product_key=_product AND brand_id=_brand FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Growth campaign not found' USING ERRCODE='P0002'; END IF;
  IF _expected_revision IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'Growth campaign changed; reload before saving' USING ERRCODE='40001'; END IF;
  UPDATE public.growth_studio_campaigns SET title=_data->>'title',objective=_data->>'objective',channel=_data->>'channel',
   locale=_data->>'locale',revision=revision+1,updated_at=now() WHERE id=_id RETURNING * INTO r;
  UPDATE public.growth_studio_runs SET status='stale',error='Campaign brief changed; generate a new draft.',
   review_status='pending',reviewed_by=NULL,reviewed_at=NULL,revision=revision+1,updated_at=now(),finished_at=COALESCE(finished_at,now())
   WHERE campaign_id=_id AND status IN('running','completed') AND marketing_campaign_id IS NULL;
 END IF;
 DELETE FROM public.growth_studio_campaign_evidence WHERE campaign_id=r.id;
 INSERT INTO public.growth_studio_campaign_evidence(campaign_id,evidence_id,brand_id,tenant_id,product_key)
 SELECT r.id,x,_brand,_tenant,_product FROM unnest(evidence_ids) x;
 RETURN public.growth_studio_campaign_doc(r);
END;
$$;

CREATE FUNCTION public.growth_studio_start_run(_tenant uuid,_product text,_campaign uuid,_request_key text,
 _writer_binding text,_classifier_binding text,_provider text,_model text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.growth_studio_campaigns; r public.growth_studio_runs; snapshot jsonb;
BEGIN
 PERFORM public.growth_studio_assert_access(_tenant,_product,'write');
 -- A scope lock makes request deduplication and the daily/start limits atomic across different keys.
 PERFORM pg_advisory_xact_lock(hashtextextended('growth:'||_tenant::text||':'||_product,0));
 SELECT * INTO r FROM public.growth_studio_runs WHERE tenant_id=_tenant AND product_key=_product AND request_key=_request_key FOR UPDATE;
 IF FOUND THEN
  IF (r.campaign_id,r.writer_binding_id,r.classifier_binding_id,r.provider_key,r.model)
    IS DISTINCT FROM (_campaign,_writer_binding,_classifier_binding,_provider,_model)
  THEN RAISE EXCEPTION 'Request key already belongs to another generation request' USING ERRCODE='23505'; END IF;
  IF r.status='running' AND r.lease_expires_at<=now() THEN
   UPDATE public.growth_studio_runs SET status='failed',error='Generation timed out; retry with a new request key.',
    finished_at=now(),updated_at=now(),revision=revision+1 WHERE id=r.id RETURNING * INTO r;
  END IF;
  RETURN jsonb_build_object('run',public.growth_studio_run_doc(r),'created',false,'claimToken',NULL);
 END IF;
 UPDATE public.growth_studio_runs SET status='failed',error='Generation timed out; retry with a new request key.',
  finished_at=now(),updated_at=now(),revision=revision+1
  WHERE tenant_id=_tenant AND product_key=_product AND status='running' AND lease_expires_at<=now();
 IF EXISTS(SELECT 1 FROM public.growth_studio_runs WHERE tenant_id=_tenant AND product_key=_product
   AND campaign_id=_campaign AND status='running')
 THEN RAISE EXCEPTION 'A generation is already running for this campaign' USING ERRCODE='55000'; END IF;
 IF (SELECT count(*) FROM public.growth_studio_runs WHERE tenant_id=_tenant AND product_key=_product
   AND created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))>=30
 THEN RAISE EXCEPTION 'The daily Growth generation limit for this product has been reached' USING ERRCODE='54000'; END IF;
 SELECT * INTO c FROM public.growth_studio_campaigns WHERE id=_campaign AND tenant_id=_tenant AND product_key=_product FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth campaign not found' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.growth_studio_brands WHERE id=c.brand_id FOR SHARE;
 PERFORM 1 FROM public.growth_studio_evidence e JOIN public.growth_studio_campaign_evidence ce ON ce.evidence_id=e.id
  WHERE ce.campaign_id=c.id FOR SHARE OF e;
 snapshot:=public.growth_studio_snapshot(_tenant,_product,_campaign)
  ||jsonb_build_object('writerBindingId',_writer_binding,'classifierBindingId',_classifier_binding);
 INSERT INTO public.growth_studio_runs(tenant_id,product_key,brand_id,campaign_id,request_key,writer_binding_id,
  classifier_binding_id,provider_key,model,input_snapshot,created_by)
 VALUES(_tenant,_product,c.brand_id,c.id,_request_key,_writer_binding,_classifier_binding,_provider,_model,snapshot,auth.uid()) RETURNING * INTO r;
 IF EXISTS(SELECT 1 FROM public.growth_studio_campaign_evidence ce JOIN public.growth_studio_evidence e ON e.id=ce.evidence_id
   WHERE ce.campaign_id=c.id AND e.valid_until IS NOT NULL AND e.valid_until<=now())
   OR (_product='affivon' AND btrim(snapshot#>>'{brand,disclosure}')='') THEN
  UPDATE public.growth_studio_runs SET status='blocked',error=CASE WHEN _product='affivon' AND btrim(snapshot#>>'{brand,disclosure}')=''
    THEN 'Add the affiliate disclosure to brand instructions before generating.' ELSE 'Selected evidence has expired; update it before generating.' END,
   finished_at=now(),updated_at=now(),revision=revision+1 WHERE id=r.id RETURNING * INTO r;
  RETURN jsonb_build_object('run',public.growth_studio_run_doc(r),'created',true,'claimToken',NULL);
 END IF;
 RETURN jsonb_build_object('run',public.growth_studio_run_doc(r),'created',true,'claimToken',r.execution_token);
END;
$$;

CREATE FUNCTION public.growth_studio_get_run(_tenant uuid,_product text,_run uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_studio_runs;
BEGIN
 PERFORM public.growth_studio_assert_access(_tenant,_product,'read');
 UPDATE public.growth_studio_runs SET status='failed',error='Generation timed out; retry with a new request key.',
  finished_at=now(),updated_at=now(),revision=revision+1
  WHERE id=_run AND tenant_id=_tenant AND product_key=_product AND status='running' AND lease_expires_at<=now();
 SELECT * INTO r FROM public.growth_studio_runs WHERE id=_run AND tenant_id=_tenant AND product_key=_product;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth run not found' USING ERRCODE='P0002'; END IF;
 RETURN public.growth_studio_run_doc(r);
END;
$$;

CREATE FUNCTION public.growth_studio_finish_run(_tenant uuid,_product text,_run uuid,_claim_token uuid,
 _status text,_result jsonb,_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_studio_runs; final_status text; final_error text;
BEGIN
 IF _status NOT IN('completed','blocked','failed') THEN RAISE EXCEPTION 'Invalid Growth completion status' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.growth_studio_runs WHERE id=_run AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF NOT FOUND OR _claim_token IS DISTINCT FROM r.execution_token THEN RAISE EXCEPTION 'Growth execution claim refused' USING ERRCODE='42501'; END IF;
 IF r.status<>'running' THEN RETURN public.growth_studio_run_doc(r); END IF;
 final_status:=_status; final_error:=_error;
 IF r.lease_expires_at<=now() THEN
  final_status:='failed'; final_error:='Generation timed out; retry with a new request key.';
 ELSIF NOT COALESCE(public.growth_studio_run_current(r),false) THEN
  final_status:='stale'; final_error:='Inputs or access changed during generation; generate a new draft.';
 END IF;
 IF final_status='completed' AND (jsonb_typeof(_result) IS DISTINCT FROM 'object' OR jsonb_typeof(_result#>'{output,variants}') IS DISTINCT FROM 'array'
    OR COALESCE(jsonb_array_length(_result#>'{output,variants}'),0) NOT BETWEEN 1 AND 3)
 THEN RAISE EXCEPTION 'A completed Growth run requires validated output variants' USING ERRCODE='22023'; END IF;
 -- Bind the completed output to the requested provider/model in this execution claim.
 -- An upstream alias resolution may be recorded separately as provider.resolvedModel.
 IF final_status='completed' AND (jsonb_typeof(_result->'provider') IS DISTINCT FROM 'object'
    OR jsonb_typeof(_result#>'{provider,providerKey}') IS DISTINCT FROM 'string'
    OR jsonb_typeof(_result#>'{provider,model}') IS DISTINCT FROM 'string'
    OR (_result#>>'{provider,providerKey}') IS DISTINCT FROM r.provider_key
    OR (_result#>>'{provider,model}') IS DISTINCT FROM r.model)
 THEN RAISE EXCEPTION 'Growth provider identity does not match the execution claim' USING ERRCODE='23514'; END IF;
 UPDATE public.growth_studio_runs SET status=final_status,
  result=CASE WHEN final_status IN('stale','failed') AND final_status<>_status THEN NULL ELSE _result END,
  error=final_error,finished_at=now(),updated_at=now(),revision=revision+1 WHERE id=r.id RETURNING * INTO r;
 RETURN public.growth_studio_run_doc(r);
END;
$$;

CREATE FUNCTION public.growth_studio_assert_reviewable(r public.growth_studio_runs)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE variant jsonb; evidence_id text; check_row jsonb; disclosure text;
BEGIN
 IF r.status<>'completed' OR r.result IS NULL THEN RAISE EXCEPTION 'Only a completed Growth result can be approved' USING ERRCODE='22023'; END IF;
 IF NOT COALESCE(public.growth_studio_run_current(r),false) THEN RAISE EXCEPTION 'Growth inputs or access are stale; generate again' USING ERRCODE='40001'; END IF;
 IF jsonb_typeof(r.result#>'{output,variants}') IS DISTINCT FROM 'array'
    OR COALESCE(jsonb_array_length(r.result#>'{output,variants}'),0) NOT BETWEEN 1 AND 3
    OR jsonb_typeof(r.result->'checks') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Growth result is missing its validated output and checks' USING ERRCODE='22023'; END IF;
 FOR check_row IN SELECT value FROM jsonb_array_elements(r.result->'checks') LOOP
  IF COALESCE(check_row->>'status','') NOT IN('pass','review')
  THEN RAISE EXCEPTION 'Resolve failed Growth output checks before approval' USING ERRCODE='22023'; END IF;
 END LOOP;
 disclosure:=COALESCE(r.input_snapshot#>>'{brand,disclosure}','');
 FOR variant IN SELECT value FROM jsonb_array_elements(r.result#>'{output,variants}') LOOP
  IF COALESCE(length(btrim(variant->>'body')),0)=0 OR COALESCE(length(btrim(variant->>'headline')),0)=0
    OR jsonb_typeof(variant->'evidenceIds') IS DISTINCT FROM 'array'
    OR COALESCE(jsonb_array_length(variant->'evidenceIds'),0) NOT BETWEEN 1 AND 20
  THEN RAISE EXCEPTION 'Growth variants require content and evidence references' USING ERRCODE='22023'; END IF;
  FOR evidence_id IN SELECT value FROM jsonb_array_elements_text(variant->'evidenceIds') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.input_snapshot->'evidence') e WHERE e->>'id'=evidence_id)
   THEN RAISE EXCEPTION 'Growth output cites evidence outside its immutable input' USING ERRCODE='23503'; END IF;
  END LOOP;
  IF r.product_key='affivon' AND (btrim(disclosure)='' OR variant->>'disclosure' IS DISTINCT FROM disclosure)
  THEN RAISE EXCEPTION 'Every affiliate variant must include the required disclosure' USING ERRCODE='22023'; END IF;
 END LOOP;
END;
$$;

CREATE FUNCTION public.growth_studio_review_run(_tenant uuid,_product text,_run uuid,_expected_revision integer,_decision text,_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_studio_runs;
BEGIN
 PERFORM public.growth_studio_assert_access(_tenant,_product,'admin');
 IF _decision NOT IN('approved','rejected') THEN RAISE EXCEPTION 'Invalid Growth review decision' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.growth_studio_runs WHERE id=_run AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth run not found' USING ERRCODE='P0002'; END IF;
 IF _expected_revision IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'Growth review changed; reload before reviewing' USING ERRCODE='40001'; END IF;
 IF r.marketing_campaign_id IS NOT NULL THEN RAISE EXCEPTION 'This Growth result was already handed off' USING ERRCODE='22023'; END IF;
 IF r.status<>'completed' THEN RAISE EXCEPTION 'Only a completed Growth run can be reviewed' USING ERRCODE='22023'; END IF;
 IF _decision='approved' THEN PERFORM public.growth_studio_assert_reviewable(r); END IF;
 UPDATE public.growth_studio_runs SET review_status=_decision,reviewed_by=auth.uid(),reviewed_at=now(),
  note=NULLIF(_note,''),revision=revision+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN public.growth_studio_run_doc(r);
END;
$$;

CREATE FUNCTION public.growth_studio_handoff_run(_tenant uuid,_product text,_run uuid,_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_studio_runs; marketing_id uuid; creative_id uuid; content text; channels text[]; assets text[]; output jsonb;
BEGIN
 PERFORM public.growth_studio_assert_access(_tenant,_product,'admin');
 IF NOT EXISTS(SELECT 1 FROM public.tenant_services s WHERE s.tenant_id=_tenant AND s.service_key='omniqora.creative'
   AND s.status IN('active','trial') AND s.valid_from<=now() AND (s.valid_until IS NULL OR s.valid_until>now()))
 THEN RAISE EXCEPTION 'A current Creative Studio entitlement is required for draft handoff' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.growth_studio_runs WHERE id=_run AND tenant_id=_tenant AND product_key=_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth run not found' USING ERRCODE='P0002'; END IF;
 IF r.marketing_campaign_id IS NOT NULL THEN RETURN public.growth_studio_run_doc(r); END IF;
 IF _expected_revision IS NOT NULL AND _expected_revision<>r.revision
 THEN RAISE EXCEPTION 'Growth result changed; reload before handoff' USING ERRCODE='40001'; END IF;
 IF r.review_status<>'approved' THEN RAISE EXCEPTION 'Approve the Growth result before draft handoff' USING ERRCODE='22023'; END IF;
 -- Hold source rows until the draft transaction commits, preventing a concurrent edit from racing handoff.
 PERFORM 1 FROM public.growth_studio_campaigns WHERE id=r.campaign_id FOR SHARE;
 PERFORM 1 FROM public.growth_studio_brands WHERE id=r.brand_id FOR SHARE;
 PERFORM 1 FROM public.growth_studio_evidence e JOIN public.growth_studio_campaign_evidence ce ON ce.evidence_id=e.id
   WHERE ce.campaign_id=r.campaign_id FOR SHARE OF e;
 PERFORM public.growth_studio_assert_reviewable(r);
 output:=r.result->'output';
 content:=output#>>'{variants,0,body}';
 channels:=ARRAY[r.input_snapshot#>>'{campaign,channel}'];
 SELECT COALESCE(array_agg(x),'{}'::text[]) INTO assets FROM jsonb_array_elements_text(COALESCE(output#>'{creativeBrief,assetTypes}','[]'::jsonb)) x;
 INSERT INTO public.marketing_campaigns(tenant_id,product_key,name,channel,status,subject,content)
 VALUES(_tenant,_product,r.input_snapshot#>>'{campaign,title}',
   CASE WHEN channels[1] IN('email','whatsapp') THEN channels[1] ELSE 'multi' END,'draft',
   output#>>'{variants,0,headline}',jsonb_build_object('source','omniqora.growth','growthRunId',r.id,
    'intendedChannel',channels[1],'locale',r.input_snapshot#>>'{campaign,locale}',
    'output',output,'checks',r.result->'checks','inputSnapshot',r.input_snapshot,'publicationStatus','draft_only')) RETURNING id INTO marketing_id;
 INSERT INTO public.creative_briefs(tenant_id,product_key,campaign_id,campaign_ref,objective,audience,channels,asset_types,message,
  offer,call_to_action,status,created_by)
 VALUES(_tenant,_product,marketing_id,'omniqora.growth:'||r.id,
  r.input_snapshot#>>'{campaign,objective}',COALESCE(r.input_snapshot#>>'{brand,audience}',''),channels,assets,
  COALESCE(output#>>'{creativeBrief,direction}','')||E'\n\n'||COALESCE(output#>>'{variants,0,headline}','')
    ||E'\n\n'||content||E'\n\n'||COALESCE(output#>>'{variants,0,callToAction}','')
    ||E'\n\n'||COALESCE(output#>>'{variants,0,disclosure}',''),
  r.input_snapshot#>>'{brand,offer}',output#>>'{variants,0,callToAction}','draft',auth.uid()) RETURNING id INTO creative_id;
 UPDATE public.growth_studio_runs SET marketing_campaign_id=marketing_id,creative_brief_id=creative_id,
  updated_at=now(),revision=revision+1 WHERE id=r.id RETURNING * INTO r;
 RETURN public.growth_studio_run_doc(r);
END;
$$;

-- Derived copies retain the source access boundary inside the existing shared engines.
-- Look up immutable handoff receipts as the function owner: caller RLS must not hide a
-- suspended source and turn an absent-row check into permission to read the copy.
CREATE FUNCTION public.growth_studio_handoff_access(_target text,_id uuid,_mode text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT _target IN('marketing_campaigns','creative_briefs') AND _id IS NOT NULL AND _mode IN('read','write')
  AND NOT EXISTS(SELECT 1 FROM public.growth_studio_runs r
   WHERE ((_target='marketing_campaigns' AND r.marketing_campaign_id=_id)
      OR (_target='creative_briefs' AND r.creative_brief_id=_id))
    AND (NOT COALESCE(public.growth_studio_can_access(r.tenant_id,r.product_key,auth.uid(),_mode),false)
      OR (_target='creative_briefs' AND NOT EXISTS(SELECT 1 FROM public.tenant_services s
        WHERE s.tenant_id=r.tenant_id AND s.service_key='omniqora.creative'
         AND s.status IN('active','trial') AND s.valid_from<=now() AND (s.valid_until IS NULL OR s.valid_until>now())))));
$$;
CREATE INDEX growth_studio_marketing_receipt_idx ON public.growth_studio_runs(marketing_campaign_id)
 WHERE marketing_campaign_id IS NOT NULL;
CREATE INDEX growth_studio_creative_receipt_idx ON public.growth_studio_runs(creative_brief_id)
 WHERE creative_brief_id IS NOT NULL;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['marketing_campaigns','creative_briefs'] LOOP
  EXECUTE format('CREATE POLICY growth_handoff_select_guard ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(public.growth_studio_handoff_access(%L,id,''read''))',t,t);
  EXECUTE format('CREATE POLICY growth_handoff_insert_guard ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.growth_studio_handoff_access(%L,id,''write''))',t,t);
  EXECUTE format('CREATE POLICY growth_handoff_update_guard ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING(public.growth_studio_handoff_access(%L,id,''write'')) WITH CHECK(public.growth_studio_handoff_access(%L,id,''write''))',t,t,t);
  EXECUTE format('CREATE POLICY growth_handoff_delete_guard ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(public.growth_studio_handoff_access(%L,id,''write''))',t,t);
 END LOOP;
END $$;

-- Internal helpers cannot be invoked as public RPCs. Every mutation has an explicit privilege grant.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'growth_studio_%' AND p.proname<>'growth_studio_can_access'
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.growth_studio_workspace(uuid,text),public.growth_studio_get_run(uuid,text,uuid),
 public.growth_studio_save_brand(uuid,text,uuid,integer,jsonb),
 public.growth_studio_save_evidence(uuid,text,uuid,integer,uuid,jsonb),
 public.growth_studio_save_campaign(uuid,text,uuid,integer,uuid,jsonb),
 public.growth_studio_start_run(uuid,text,uuid,text,text,text,text,text),
 public.growth_studio_review_run(uuid,text,uuid,integer,text,text),
 public.growth_studio_handoff_run(uuid,text,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.growth_studio_handoff_access(text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.growth_studio_finish_run(uuid,text,uuid,uuid,text,jsonb,text) TO service_role;

COMMENT ON TABLE public.growth_studio_runs IS 'Immutable source snapshots and durable provider results. Handoffs create internal drafts only; no external marketplace publication or advertising spend.';
COMMIT;
