-- Native Syndriva catalogue evidence. The commerce schema is optional in the
-- hosted Growth deployment; no unrelated commerce migrations are applied here.
BEGIN;

CREATE TABLE public.growth_syndriva_sources (
  tenant_id uuid NOT NULL,
  product_key text NOT NULL DEFAULT 'syndriva' CHECK (product_key='syndriva'),
  brand_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  evidence_id uuid NOT NULL UNIQUE,
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot)='object' AND octet_length(source_snapshot::text)<=65536),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[a-f0-9]{64}$'),
  evidence_revision integer NOT NULL CHECK (evidence_revision>0),
  imported_by uuid NOT NULL REFERENCES auth.users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,brand_id,listing_id),
  FOREIGN KEY (evidence_id,brand_id,tenant_id,product_key)
    REFERENCES public.growth_studio_evidence(id,brand_id,tenant_id,product_key) ON DELETE RESTRICT
);
ALTER TABLE public.growth_syndriva_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.growth_syndriva_sources FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.growth_syndriva_sources TO authenticated,service_role;
CREATE POLICY growth_syndriva_source_read ON public.growth_syndriva_sources FOR SELECT TO authenticated
  USING (public.growth_studio_can_access(tenant_id,'syndriva',auth.uid(),'read'));

CREATE FUNCTION public.growth_syndriva_schema_ready()
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT to_regclass('public.marketplace_listings') IS NOT NULL
    AND to_regclass('public.marketplace_vendors') IS NOT NULL
    AND to_regclass('public.inventory_items') IS NOT NULL
    AND to_regclass('public.inventory_stock_locations') IS NOT NULL
    AND to_regclass('public.inventory_stock_balances') IS NOT NULL;
$$;

-- Only the public catalogue facts used as evidence are selected. Vendor payout
-- references, private metadata, contact data and inferred public URLs are excluded.
CREATE FUNCTION public.growth_syndriva_source_snapshot(_tenant uuid,_listing uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.growth_syndriva_schema_ready() THEN RETURN NULL; END IF;
  EXECUTE $query$
    SELECT jsonb_build_object(
      'source','Syndriva marketplace catalogue',
      'listing',jsonb_build_object('id',l.id,'title',l.title,'description',l.description,'type',l.listing_type,
        'sku',l.sku,'priceMinor',l.price_minor::text,'currency',l.currency,'status',l.status),
      'vendor',jsonb_build_object('id',v.id,'name',v.name,'status',v.status,'brandId',v.brand_id),
      'inventory',CASE WHEN l.inventory_tracked THEN jsonb_build_object('tracked',true,
        'itemId',i.id,'stockLocationId',sl.id,'locationId',sl.location_id,'unit',i.unit,
        'availableQuantity',(b.on_hand-b.reserved)::text)
        ELSE jsonb_build_object('tracked',false,'availableQuantity',NULL) END)
    FROM public.marketplace_listings l
    JOIN public.marketplace_vendors v ON v.id=l.vendor_id AND v.tenant_id=l.tenant_id AND v.product_key=l.product_key AND v.status='active'
    LEFT JOIN public.tenant_brands vb ON vb.id=v.brand_id AND vb.tenant_id=l.tenant_id AND (vb.product_key IS NULL OR vb.product_key=l.product_key)
    LEFT JOIN public.inventory_items i ON i.id=l.inventory_item_id AND i.tenant_id=l.tenant_id AND i.product_key=l.product_key
    LEFT JOIN public.inventory_stock_locations sl ON sl.id=l.stock_location_id AND sl.tenant_id=l.tenant_id AND sl.product_key=l.product_key
    LEFT JOIN public.tenant_locations tl ON tl.id=sl.location_id AND tl.tenant_id=l.tenant_id AND tl.status='active'
    LEFT JOIN public.tenant_brands lb ON lb.id=tl.brand_id AND lb.tenant_id=l.tenant_id AND (lb.product_key IS NULL OR lb.product_key=l.product_key)
    LEFT JOIN public.inventory_stock_balances b ON b.item_id=i.id AND b.stock_location_id=sl.id AND b.tenant_id=l.tenant_id
    WHERE l.id=$2 AND l.tenant_id=$1 AND l.product_key='syndriva' AND l.status='active'
      AND (v.brand_id IS NULL OR vb.id IS NOT NULL)
      AND length(btrim(l.title)) BETWEEN 1 AND 200 AND length(l.title)<=200
      AND length(btrim(v.name)) BETWEEN 1 AND 160 AND length(v.name)<=160
      AND (l.description IS NULL OR length(l.description)<=6000) AND (l.sku IS NULL OR length(l.sku)<=100)
      AND (NOT l.inventory_tracked OR (
        i.id IS NOT NULL AND i.track_stock AND sl.id IS NOT NULL AND b.item_id IS NOT NULL
        AND length(i.unit) BETWEEN 1 AND 100
        AND (sl.location_id IS NULL OR (tl.id IS NOT NULL AND (tl.brand_id IS NULL OR lb.id IS NOT NULL)))
        AND b.on_hand::text NOT IN ('NaN','Infinity','-Infinity') AND b.reserved::text NOT IN ('NaN','Infinity','-Infinity')
        AND b.on_hand-b.reserved>0))
  $query$ INTO result USING _tenant,_listing;
  IF result IS NOT NULL AND (length(result::text)>18500 OR octet_length(result::text)>64000) THEN RETURN NULL; END IF;
  RETURN result;
END; $$;

CREATE FUNCTION public.growth_syndriva_fingerprint(_snapshot jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT encode(sha256(convert_to(_snapshot::text,'UTF8')),'hex');
$$;

CREATE FUNCTION public.growth_syndriva_source_current(s public.growth_syndriva_sources)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE current_snapshot jsonb; evidence public.growth_studio_evidence;
BEGIN
  SELECT * INTO evidence FROM public.growth_studio_evidence WHERE id=s.evidence_id AND tenant_id=s.tenant_id AND product_key='syndriva' AND brand_id=s.brand_id;
  IF NOT FOUND OR evidence.revision<>s.evidence_revision OR evidence.kind<>'product_data'
    OR evidence.valid_until IS NULL OR evidence.valid_until<=now() THEN RETURN false; END IF;
  current_snapshot:=public.growth_syndriva_source_snapshot(s.tenant_id,s.listing_id);
  RETURN current_snapshot IS NOT NULL AND current_snapshot=s.source_snapshot
    AND public.growth_syndriva_fingerprint(current_snapshot)=s.source_fingerprint;
END; $$;

CREATE FUNCTION public.growth_syndriva_campaign_current(_tenant uuid,_campaign uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT NOT EXISTS(SELECT 1 FROM public.growth_studio_campaign_evidence ce
    JOIN public.growth_syndriva_sources s ON s.evidence_id=ce.evidence_id AND s.tenant_id=ce.tenant_id AND s.brand_id=ce.brand_id
    WHERE ce.tenant_id=_tenant AND ce.campaign_id=_campaign AND NOT public.growth_syndriva_source_current(s));
$$;

CREATE FUNCTION public.growth_syndriva_list_sources(_tenant uuid,_brand uuid,_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; total integer;
BEGIN
  PERFORM public.growth_studio_assert_access(_tenant,'syndriva','read');
  IF _offset IS NULL OR _offset NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid Syndriva source page' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.growth_studio_brands WHERE id=_brand AND tenant_id=_tenant AND product_key='syndriva')
    THEN RAISE EXCEPTION 'Growth brand not found in this product' USING ERRCODE='P0002'; END IF;
  IF NOT public.growth_syndriva_schema_ready() THEN
    RETURN jsonb_build_object('available',false,'message','The native Syndriva commerce catalogue is not installed in this deployment.',
      'items','[]'::jsonb,'hasMore',false,'nextOffset',NULL);
  END IF;
  EXECUTE $query$
    WITH page AS MATERIALIZED (
      SELECT l.id,public.growth_syndriva_source_snapshot($1,l.id) AS snapshot
      FROM public.marketplace_listings l WHERE l.tenant_id=$1 AND l.product_key='syndriva' AND l.status='active'
        AND public.growth_syndriva_source_snapshot($1,l.id) IS NOT NULL
      ORDER BY lower(l.title),l.id LIMIT 26 OFFSET $3
    ) SELECT count(*)::integer,COALESCE(jsonb_agg(jsonb_build_object(
      'listingId',p.id,'title',p.snapshot#>>'{listing,title}','vendorName',p.snapshot#>>'{vendor,name}',
      'priceMinor',p.snapshot#>>'{listing,priceMinor}','currency',p.snapshot#>>'{listing,currency}',
      'inventoryTracked',(p.snapshot#>>'{inventory,tracked}')::boolean,'availableQuantity',p.snapshot#>>'{inventory,availableQuantity}',
      'evidenceId',s.evidence_id,'evidenceRevision',e.revision,'validUntil',e.valid_until,
      'current',CASE WHEN s.evidence_id IS NULL THEN false ELSE public.growth_syndriva_source_current(s) END)
      ORDER BY lower(p.snapshot#>>'{listing,title}'),p.id),'[]'::jsonb)
    FROM page p LEFT JOIN public.growth_syndriva_sources s ON s.tenant_id=$1 AND s.brand_id=$2 AND s.listing_id=p.id
    LEFT JOIN public.growth_studio_evidence e ON e.id=s.evidence_id AND e.tenant_id=$1 AND e.brand_id=$2 AND e.product_key='syndriva'
  $query$ INTO total,result USING _tenant,_brand,_offset;
  IF total>25 THEN result:=result-25; END IF;
  RETURN jsonb_build_object('available',true,'message','Active catalogue records are checked against vendor scope and tracked stock. Imported evidence expires after 15 minutes.',
    'items',result,'hasMore',total>25,'nextOffset',CASE WHEN total>25 THEN _offset+25 ELSE NULL END);
END; $$;

CREATE FUNCTION public.growth_syndriva_import_source(_tenant uuid,_brand uuid,_listing uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; fingerprint text; source_link public.growth_syndriva_sources; evidence public.growth_studio_evidence;
  saved jsonb; created boolean; deadline timestamptz:=now()+interval '15 minutes';
BEGIN
  PERFORM public.growth_studio_assert_access(_tenant,'syndriva','write');
  IF _brand IS NULL OR _listing IS NULL THEN RAISE EXCEPTION 'Choose a Growth brand and Syndriva listing' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.growth_studio_brands WHERE id=_brand AND tenant_id=_tenant AND product_key='syndriva' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Growth brand not found in this product' USING ERRCODE='P0002'; END IF;
  IF NOT public.growth_syndriva_schema_ready() THEN RAISE EXCEPTION 'The native Syndriva commerce catalogue is not installed in this deployment' USING ERRCODE='55000'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_tenant::text||':growth-syndriva:'||_brand::text||':'||_listing::text,0));
  snapshot:=public.growth_syndriva_source_snapshot(_tenant,_listing);
  IF snapshot IS NULL THEN RAISE EXCEPTION 'This listing is unavailable, outside the workspace, or has insufficient tracked stock' USING ERRCODE='55000'; END IF;
  fingerprint:=public.growth_syndriva_fingerprint(snapshot);
  SELECT * INTO source_link FROM public.growth_syndriva_sources WHERE tenant_id=_tenant AND brand_id=_brand AND listing_id=_listing FOR UPDATE;
  created:=NOT FOUND;
  IF NOT created THEN
    SELECT * INTO evidence FROM public.growth_studio_evidence WHERE id=source_link.evidence_id AND tenant_id=_tenant AND product_key='syndriva' AND brand_id=_brand FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The linked Growth evidence is unavailable' USING ERRCODE='55000'; END IF;
    IF source_link.source_fingerprint=fingerprint AND source_link.source_snapshot=snapshot AND evidence.revision=source_link.evidence_revision
      AND evidence.kind='product_data' AND evidence.valid_until>now() THEN
      RETURN jsonb_build_object('listingId',_listing,'created',false,'changed',false,'replayed',true,'evidence',public.growth_studio_evidence_doc(evidence));
    END IF;
  END IF;
  saved:=public.growth_studio_save_evidence(_tenant,'syndriva',CASE WHEN created THEN NULL ELSE evidence.id END,
    CASE WHEN created THEN NULL ELSE evidence.revision END,_brand,
    jsonb_build_object('title',snapshot#>>'{listing,title}','content','Recorded Syndriva catalogue facts: '||snapshot::text,
      'sourceUrl',NULL,'kind','product_data','validUntil',deadline));
  INSERT INTO public.growth_syndriva_sources(tenant_id,brand_id,listing_id,evidence_id,source_snapshot,source_fingerprint,evidence_revision,imported_by)
    VALUES(_tenant,_brand,_listing,(saved->>'id')::uuid,snapshot,fingerprint,(saved->>'revision')::integer,auth.uid())
    ON CONFLICT(tenant_id,brand_id,listing_id) DO UPDATE SET source_snapshot=EXCLUDED.source_snapshot,
      source_fingerprint=EXCLUDED.source_fingerprint,evidence_revision=EXCLUDED.evidence_revision,imported_by=EXCLUDED.imported_by,imported_at=now();
  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
    VALUES(_tenant,auth.uid(),'growth.syndriva.imported','growth_studio_evidence',saved->>'id',
      jsonb_build_object('brandId',_brand,'listingId',_listing,'evidenceRevision',saved->'revision','created',created));
  RETURN jsonb_build_object('listingId',_listing,'created',created,'changed',true,'replayed',false,'evidence',saved);
END; $$;

-- Reject a stale native source before the run is claimed or provider HTTP can
-- begin. Generic manual evidence and other product contexts keep their rules.
CREATE FUNCTION public.growth_syndriva_guard_run()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.product_key='syndriva' AND NOT public.growth_syndriva_campaign_current(NEW.tenant_id,NEW.campaign_id) THEN
    RAISE EXCEPTION 'Linked Syndriva evidence changed or expired. Reimport the listing before generating.' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER growth_syndriva_guard_run BEFORE INSERT ON public.growth_studio_runs
  FOR EACH ROW EXECUTE FUNCTION public.growth_syndriva_guard_run();

CREATE OR REPLACE FUNCTION public.growth_studio_run_current(r public.growth_studio_runs)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.growth_studio_can_access(r.tenant_id,r.product_key,r.created_by,'write')
    AND (r.input_snapshot-'writerBindingId'-'classifierBindingId')=public.growth_studio_snapshot(r.tenant_id,r.product_key,r.campaign_id)
    AND NOT EXISTS(SELECT 1 FROM public.growth_studio_campaign_evidence ce JOIN public.growth_studio_evidence e ON e.id=ce.evidence_id
      WHERE ce.campaign_id=r.campaign_id AND e.valid_until IS NOT NULL AND e.valid_until<=now())
    AND (r.product_key<>'syndriva' OR public.growth_syndriva_campaign_current(r.tenant_id,r.campaign_id));
$$;

REVOKE ALL ON FUNCTION public.growth_syndriva_schema_ready(),public.growth_syndriva_source_snapshot(uuid,uuid),
  public.growth_syndriva_fingerprint(jsonb),public.growth_syndriva_source_current(public.growth_syndriva_sources),
  public.growth_syndriva_campaign_current(uuid,uuid),public.growth_syndriva_guard_run()
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.growth_syndriva_list_sources(uuid,uuid,integer),public.growth_syndriva_import_source(uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.growth_syndriva_list_sources(uuid,uuid,integer),public.growth_syndriva_import_source(uuid,uuid,uuid)
  TO authenticated;

COMMIT;
