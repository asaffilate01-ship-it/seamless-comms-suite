BEGIN;

-- Product evidence is authored by a verified service identity, without impersonating a user.
ALTER TABLE public.growth_studio_evidence
 ADD COLUMN source_credential_id uuid REFERENCES public.platform_service_credentials(id) ON DELETE RESTRICT,
 ADD COLUMN external_ref text CHECK(external_ref IS NULL OR length(btrim(external_ref)) BETWEEN 1 AND 200),
 ALTER COLUMN created_by DROP NOT NULL,
 ADD CONSTRAINT growth_evidence_author CHECK(created_by IS NOT NULL OR source_credential_id IS NOT NULL),
 ADD CONSTRAINT growth_evidence_source_pair CHECK((source_credential_id IS NULL)=(external_ref IS NULL));
CREATE UNIQUE INDEX growth_evidence_external_ref_unique
 ON public.growth_studio_evidence(tenant_id,product_key,brand_id,external_ref)
 WHERE external_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.growth_studio_evidence_doc(r public.growth_studio_evidence)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'tenantId',r.tenant_id,'productKey',r.product_key,'brandId',r.brand_id,
  'title',r.title,'content',r.content,'sourceUrl',r.source_url,'kind',r.kind,'validUntil',r.valid_until,
  'revision',r.revision,'createdAt',r.created_at,'updatedAt',r.updated_at)
  || CASE WHEN r.source_credential_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(
    'provenance',jsonb_build_object('credentialId',r.source_credential_id,'externalRef',r.external_ref)) END;
$$;

-- Called only by the two service-role RPCs below. Lock the current authorisation rows
-- until the operation completes, so a concurrent revocation cannot race the write/read.
CREATE FUNCTION public.growth_studio_assert_service_scope(
 _credential uuid,_tenant uuid,_product text,_brand uuid,_capability text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.platform_service_credentials;
BEGIN
 IF _tenant IS NULL OR _brand IS NULL OR _product IS NULL
  OR _product NOT IN('omniqora','syndriva','merqora','affivon')
  OR _capability IS NULL OR _capability NOT IN('growth.evidence.write','growth.campaigns.read')
 THEN RAISE EXCEPTION 'Growth service access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.platform_service_credentials WHERE id=_credential FOR SHARE;
 IF NOT FOUND OR c.status<>'active' OR (c.expires_at IS NOT NULL AND c.expires_at<=now())
  OR jsonb_typeof(c.scopes) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Growth service access denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.scopes) s
   WHERE jsonb_typeof(s)='object' AND s->>'tenantId'=_tenant::text AND s->>'productKey'=_product
    AND jsonb_typeof(s->'capabilities')='array' AND (s->'capabilities') ? _capability
    AND (NOT(s ? 'brandIds') OR (jsonb_typeof(s->'brandIds')='array'
      AND ((s->'brandIds')='[]'::jsonb OR (s->'brandIds') ? _brand::text)))
    -- A location scope needs a verified location-to-brand mapping before it can be used.
    AND (NOT(s ? 'locationIds') OR (s->'locationIds')='[]'::jsonb))
 THEN RAISE EXCEPTION 'Growth service access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tenants WHERE id=_tenant AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth service access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tenant_products
  WHERE tenant_id=_tenant AND product_key=_product AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth service access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tenant_services WHERE tenant_id=_tenant AND service_key='omniqora.campaigns'
  AND status IN('active','trial') AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth service access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.growth_studio_brands
  WHERE id=_brand AND tenant_id=_tenant AND product_key=_product FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Growth service access denied' USING ERRCODE='42501'; END IF;
END;
$$;

CREATE FUNCTION public.growth_studio_ingest_product_evidence(
 _credential uuid,_tenant uuid,_product text,_brand uuid,_external_ref text,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_studio_evidence; source_link text; valid_to timestamptz;
 title_text text; content_text text; kind_text text; was_created boolean:=false; was_changed boolean:=false;
BEGIN
 PERFORM public.growth_studio_assert_service_scope(_credential,_tenant,_product,_brand,'growth.evidence.write');
 _external_ref:=btrim(_external_ref);
 IF _external_ref IS NULL OR length(_external_ref) NOT BETWEEN 1 AND 200
  OR jsonb_typeof(_data) IS DISTINCT FROM 'object' OR octet_length(_data::text)>65536
  OR (_data-ARRAY['title','content','sourceUrl','kind','validUntil'])<>'{}'::jsonb
  OR jsonb_typeof(_data->'title') IS DISTINCT FROM 'string'
  OR jsonb_typeof(_data->'content') IS DISTINCT FROM 'string'
  OR jsonb_typeof(_data->'kind') IS DISTINCT FROM 'string'
  OR COALESCE(jsonb_typeof(_data->'sourceUrl'),'null') NOT IN('null','string')
  OR COALESCE(jsonb_typeof(_data->'validUntil'),'null') NOT IN('null','string')
 THEN RAISE EXCEPTION 'Invalid product evidence' USING ERRCODE='22023'; END IF;
 title_text:=btrim(_data->>'title'); content_text:=btrim(_data->>'content'); kind_text:=_data->>'kind';
 source_link:=_data->>'sourceUrl';
 IF length(title_text) NOT BETWEEN 1 AND 200 OR length(content_text) NOT BETWEEN 3 AND 12000
  OR kind_text NOT IN('brand_fact','competitor_ad','customer_feedback','product_data','affiliate_offer')
  OR (source_link IS NOT NULL AND (length(source_link)>2000
    OR source_link !~ '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$'))
 THEN RAISE EXCEPTION 'Invalid product evidence' USING ERRCODE='22023'; END IF;
 BEGIN valid_to:=(_data->>'validUntil')::timestamptz;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow
  THEN RAISE EXCEPTION 'Invalid product evidence validity' USING ERRCODE='22023'; END;
 IF (kind_text IN('product_data','affiliate_offer') AND valid_to IS NULL)
  OR (valid_to IS NOT NULL AND (NOT isfinite(valid_to) OR valid_to<=now()))
 THEN RAISE EXCEPTION 'Product evidence must still be valid' USING ERRCODE='22023'; END IF;
 -- Serialise first writes as well as revisions; the unique index is the final tenant/brand boundary.
 PERFORM pg_advisory_xact_lock(hashtextextended(
  'growth-evidence:'||_tenant::text||':'||_product||':'||_brand::text||':'||_external_ref,0));
 SELECT * INTO r FROM public.growth_studio_evidence
  WHERE tenant_id=_tenant AND product_key=_product AND brand_id=_brand AND external_ref=_external_ref FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO public.growth_studio_evidence(tenant_id,product_key,brand_id,title,content,source_url,kind,valid_until,
   created_by,source_credential_id,external_ref)
  VALUES(_tenant,_product,_brand,title_text,content_text,source_link,kind_text,valid_to,NULL,_credential,_external_ref)
  RETURNING * INTO r;
  was_created:=true; was_changed:=true;
 ELSIF (r.title,r.content,r.source_url,r.kind,r.valid_until)
  IS DISTINCT FROM (title_text,content_text,source_link,kind_text,valid_to) THEN
  UPDATE public.growth_studio_evidence SET title=title_text,content=content_text,source_url=source_link,
   kind=kind_text,valid_until=valid_to,source_credential_id=_credential,revision=revision+1,updated_at=now()
   WHERE id=r.id RETURNING * INTO r;
  was_changed:=true;
  UPDATE public.growth_studio_runs run SET status='stale',error='Evidence changed; generate a new draft.',
   review_status='pending',reviewed_by=NULL,reviewed_at=NULL,revision=revision+1,
   updated_at=now(),finished_at=COALESCE(finished_at,now())
   WHERE run.status IN('running','completed') AND run.marketing_campaign_id IS NULL AND EXISTS(
    SELECT 1 FROM public.growth_studio_campaign_evidence ce WHERE ce.campaign_id=run.campaign_id AND ce.evidence_id=r.id);
 END IF;
 -- Identical retries preserve the revision, timestamps, approval validity and original source identity.
 RETURN jsonb_build_object('created',was_created,'changed',was_changed,'replayed',NOT was_changed,
  'evidence',public.growth_studio_evidence_doc(r));
END;
$$;

CREATE FUNCTION public.growth_studio_export_product_campaign(
 _credential uuid,_tenant uuid,_product text,_brand uuid,_run uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.growth_studio_runs; sources jsonb; marketing_status text; creative_status text;
BEGIN
 PERFORM public.growth_studio_assert_service_scope(_credential,_tenant,_product,_brand,'growth.campaigns.read');
 SELECT * INTO r FROM public.growth_studio_runs
  WHERE id=_run AND tenant_id=_tenant AND product_key=_product AND brand_id=_brand FOR SHARE;
 IF NOT FOUND OR r.status<>'completed' OR r.review_status<>'approved' OR r.result IS NULL
 THEN RAISE EXCEPTION 'Growth campaign is not available' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM public.growth_studio_campaigns WHERE id=r.campaign_id FOR SHARE;
 PERFORM 1 FROM public.growth_studio_evidence e JOIN public.growth_studio_campaign_evidence ce ON ce.evidence_id=e.id
  WHERE ce.campaign_id=r.campaign_id FOR SHARE OF e;
 -- Recheck immutable snapshots and TTL even after a handoff, whose run record cannot be changed.
 PERFORM public.growth_studio_assert_reviewable(r);
 SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
   'id',e->'id','revision',e->'revision','kind',e->'kind','sourceUrl',e->'sourceUrl',
   'validUntil',e->'validUntil','provenance',e->'provenance')) ORDER BY e->>'id'),'[]'::jsonb)
  INTO sources FROM jsonb_array_elements(r.input_snapshot->'evidence') e;
 SELECT status INTO marketing_status FROM public.marketing_campaigns
  WHERE id=r.marketing_campaign_id AND tenant_id=_tenant AND product_key=_product;
 SELECT status INTO creative_status FROM public.creative_briefs
  WHERE id=r.creative_brief_id AND tenant_id=_tenant AND product_key=_product;
 RETURN jsonb_build_object('tenantId',_tenant,'productKey',_product,'brandId',_brand,
  'runId',r.id,'campaignId',r.campaign_id,'status',r.status,'reviewStatus',r.review_status,
  'output',r.result->'output',
  'handoff',jsonb_build_object('marketingCampaignId',r.marketing_campaign_id,'marketingStatus',marketing_status,
    'creativeBriefId',r.creative_brief_id,'creativeStatus',creative_status),
  'provenance',jsonb_build_object('runRevision',r.revision,'brandRevision',r.input_snapshot#>'{brand,revision}',
    'campaignRevision',r.input_snapshot#>'{campaign,revision}','evidence',sources,
    'providerKey',r.provider_key,'model',r.model,'reviewedAt',r.reviewed_at,'finishedAt',r.finished_at),
  'exportedAt',now());
END;
$$;

REVOKE ALL ON FUNCTION public.growth_studio_evidence_doc(public.growth_studio_evidence),
 public.growth_studio_assert_service_scope(uuid,uuid,text,uuid,text),
 public.growth_studio_ingest_product_evidence(uuid,uuid,text,uuid,text,jsonb),
 public.growth_studio_export_product_campaign(uuid,uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.growth_studio_ingest_product_evidence(uuid,uuid,text,uuid,text,jsonb),
 public.growth_studio_export_product_campaign(uuid,uuid,text,uuid,uuid) TO service_role;

COMMENT ON FUNCTION public.growth_studio_ingest_product_evidence(uuid,uuid,text,uuid,text,jsonb)
 IS 'Verified product ingress only. Idempotent by tenant/product/brand/external reference; updates invalidate dependent approvals.';
COMMENT ON FUNCTION public.growth_studio_export_product_campaign(uuid,uuid,text,uuid,uuid)
 IS 'Current approved output and scoped provenance only. Never creates a handoff, publishes, provisions, or activates a tenant.';
COMMIT;
