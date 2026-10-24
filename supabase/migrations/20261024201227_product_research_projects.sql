BEGIN;
CREATE SCHEMA IF NOT EXISTS product_research_private;
REVOKE ALL ON SCHEMA product_research_private FROM PUBLIC;
GRANT USAGE ON SCHEMA product_research_private TO authenticated;

CREATE TABLE public.product_research_projects (
 id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
 revision integer NOT NULL CHECK(revision > 0),
 dossier jsonb NOT NULL CHECK(jsonb_typeof(dossier) = 'object' AND octet_length(dossier::text) <= 1000000),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,tenant_id)
);
CREATE INDEX product_research_tenant_updated_idx ON public.product_research_projects(tenant_id,updated_at DESC,id);
CREATE TABLE public.product_research_revisions (
 project_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision > 0),
 request_id uuid NOT NULL,
 name text NOT NULL,
 dossier jsonb NOT NULL,
 saved_by uuid NOT NULL REFERENCES auth.users(id),
 saved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,revision),
 UNIQUE(project_id,request_id),
 FOREIGN KEY(project_id,tenant_id) REFERENCES public.product_research_projects(id,tenant_id) ON DELETE CASCADE
);
ALTER TABLE public.product_research_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_research_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_research_projects,public.product_research_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.product_research_projects,public.product_research_revisions TO authenticated;
CREATE POLICY research_projects_read ON public.product_research_projects FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=product_research_projects.tenant_id AND m.user_id=(SELECT auth.uid())));
CREATE POLICY research_revisions_read ON public.product_research_revisions FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=product_research_revisions.tenant_id AND m.user_id=(SELECT auth.uid())));

-- Private definer: the only write path. No direct client writes to history or metadata.
CREATE FUNCTION product_research_private.save_project(_tenant uuid,_project uuid,_expected integer,_request uuid,_name text,_dossier jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.product_research_projects; prior public.product_research_revisions; next_revision integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant AND m.user_id=auth.uid() AND m.role::text IN('owner','admin','agent')) THEN
  RAISE EXCEPTION 'Research write access required' USING ERRCODE='42501';
 END IF;
 IF _project IS NULL OR _request IS NULL OR _expected IS NULL OR _expected<0 OR _name IS NULL OR length(btrim(_name)) NOT BETWEEN 1 AND 120 OR _dossier IS NULL OR jsonb_typeof(_dossier)<>'object' OR octet_length(_dossier::text)>1000000 THEN
  RAISE EXCEPTION 'Invalid research project';
 END IF;
 IF (_dossier->>'version') IS DISTINCT FROM '1' OR jsonb_typeof(_dossier->'sources') IS DISTINCT FROM 'array' OR jsonb_typeof(_dossier->'observations') IS DISTINCT FROM 'array' OR jsonb_typeof(_dossier->'features') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Invalid research dossier';
 END IF;
 IF jsonb_array_length(_dossier->'sources')>100 OR jsonb_array_length(_dossier->'observations')>300 OR jsonb_array_length(_dossier->'features')>150 THEN RAISE EXCEPTION 'Research dossier exceeds record limits'; END IF;
 -- Serialises both first creation and updates; lock key is independent of the caller tenant.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_project::text,0));
 SELECT * INTO p FROM public.product_research_projects WHERE id=_project;
 IF FOUND AND p.tenant_id<>_tenant THEN RAISE EXCEPTION 'Research project unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM public.product_research_revisions WHERE project_id=_project AND request_id=_request;
 IF FOUND THEN
  IF prior.saved_by<>auth.uid() OR prior.name<>btrim(_name) OR prior.dossier<>_dossier THEN RAISE EXCEPTION 'Request key already used with different content'; END IF;
  RETURN jsonb_build_object('id',_project,'revision',prior.revision,'replayed',true);
 END IF;
 IF p.id IS NULL THEN
  IF _expected<>0 THEN RAISE EXCEPTION 'Research revision conflict' USING ERRCODE='40001'; END IF;
  next_revision:=1;
  INSERT INTO public.product_research_projects(id,tenant_id,name,revision,dossier,updated_by) VALUES(_project,_tenant,btrim(_name),next_revision,_dossier,auth.uid());
 ELSE
  IF p.revision<>_expected THEN RAISE EXCEPTION 'Research revision conflict' USING ERRCODE='40001'; END IF;
  next_revision:=p.revision+1;
  UPDATE public.product_research_projects SET name=btrim(_name),revision=next_revision,dossier=_dossier,updated_by=auth.uid(),updated_at=now() WHERE id=_project;
 END IF;
 INSERT INTO public.product_research_revisions(project_id,tenant_id,revision,request_id,name,dossier,saved_by) VALUES(_project,_tenant,next_revision,_request,btrim(_name),_dossier,auth.uid());
 RETURN jsonb_build_object('id',_project,'revision',next_revision,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION product_research_private.save_project(uuid,uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION product_research_private.save_project(uuid,uuid,integer,uuid,text,jsonb) TO authenticated;
CREATE FUNCTION public.save_product_research_project(_tenant uuid,_project uuid,_expected integer,_request uuid,_name text,_dossier jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT product_research_private.save_project(_tenant,_project,_expected,_request,_name,_dossier);
$$;
REVOKE ALL ON FUNCTION public.save_product_research_project(uuid,uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_product_research_project(uuid,uuid,integer,uuid,text,jsonb) TO authenticated;
COMMIT;
