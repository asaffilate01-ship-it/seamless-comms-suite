BEGIN;
-- Reviews are append-only, tied to an exact saved revision and authenticated identity.
CREATE TABLE public.product_research_reviews (
 project_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 revision integer NOT NULL,
 reviewer_id uuid NOT NULL REFERENCES auth.users(id),
 decision text NOT NULL CHECK(decision IN ('reviewed','changes_requested')),
 note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 2000),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,revision,reviewer_id),
 FOREIGN KEY(project_id,tenant_id) REFERENCES public.product_research_projects(id,tenant_id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,revision) REFERENCES public.product_research_revisions(project_id,revision) ON DELETE CASCADE
);
ALTER TABLE public.product_research_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_research_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.product_research_reviews TO authenticated;
CREATE POLICY research_reviews_read ON public.product_research_reviews FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=product_research_reviews.tenant_id AND m.user_id=(SELECT auth.uid())));
CREATE FUNCTION product_research_private.review_project(_tenant uuid,_project uuid,_revision integer,_decision text,_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.product_research_projects; prior public.product_research_reviews;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant AND m.user_id=auth.uid() AND m.role::text IN('owner','admin')) THEN
  RAISE EXCEPTION 'Research review access required' USING ERRCODE='42501';
 END IF;
 IF _revision IS NULL OR _revision<1 OR _decision IS NULL OR _decision NOT IN('reviewed','changes_requested') OR _note IS NULL OR length(btrim(_note)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid research review'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_project::text,0));
 SELECT * INTO p FROM public.product_research_projects WHERE id=_project AND tenant_id=_tenant;
 IF NOT FOUND THEN RAISE EXCEPTION 'Research project unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM public.product_research_reviews WHERE project_id=_project AND revision=_revision AND reviewer_id=auth.uid();
 IF FOUND THEN
  IF prior.decision<>_decision OR prior.note<>btrim(_note) THEN RAISE EXCEPTION 'Review already recorded. Save a new revision to request another review.'; END IF;
  RETURN jsonb_build_object('revision',_revision,'replayed',true);
 END IF;
 IF p.revision<>_revision THEN RAISE EXCEPTION 'Research revision conflict' USING ERRCODE='40001'; END IF;
 INSERT INTO public.product_research_reviews(project_id,tenant_id,revision,reviewer_id,decision,note) VALUES(_project,_tenant,_revision,auth.uid(),_decision,btrim(_note));
 RETURN jsonb_build_object('revision',_revision,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION product_research_private.review_project(uuid,uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION product_research_private.review_project(uuid,uuid,integer,text,text) TO authenticated;
CREATE FUNCTION public.review_product_research_project(_tenant uuid,_project uuid,_revision integer,_decision text,_note text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT product_research_private.review_project(_tenant,_project,_revision,_decision,_note);
$$;
REVOKE ALL ON FUNCTION public.review_product_research_project(uuid,uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_product_research_project(uuid,uuid,integer,text,text) TO authenticated;
COMMIT;
