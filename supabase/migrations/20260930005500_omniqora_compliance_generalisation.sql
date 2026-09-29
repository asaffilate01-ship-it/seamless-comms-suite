-- Generalise the existing procurement-readiness engine into Omniqora Compliance.
-- Existing procurement assessments and Aramco packs remain compatible.
BEGIN;

ALTER TABLE public.procurement_packs
  ADD COLUMN IF NOT EXISTS pack_type text NOT NULL DEFAULT 'procurement'
    CHECK (pack_type IN ('procurement','regulatory_application','ongoing_compliance','certification','buyer_assurance','custom')),
  ADD COLUMN IF NOT EXISTS authority text,
  ADD COLUMN IF NOT EXISTS jurisdiction text,
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.procurement_assessments
  ADD COLUMN IF NOT EXISTS authority text,
  ADD COLUMN IF NOT EXISTS application_type text,
  ADD COLUMN IF NOT EXISTS location_ref text,
  ADD COLUMN IF NOT EXISTS service_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.compliance_correspondence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.procurement_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.rrci_workspaces(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
  authority text,
  subject text NOT NULL,
  received_or_sent_at timestamptz NOT NULL,
  due_at timestamptz,
  source_ref text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','drafting','review','responded','closed')),
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_correspondence_due_idx
  ON public.compliance_correspondence (workspace_id,status,due_at);

CREATE TABLE IF NOT EXISTS public.compliance_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.procurement_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.rrci_workspaces(id) ON DELETE CASCADE,
  inspection_type text NOT NULL,
  authority text,
  location_ref text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','preparing','scheduled','completed','cancelled')),
  readiness_notes text,
  outcome_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_inspections_schedule_idx
  ON public.compliance_inspections (workspace_id,status,scheduled_at);

CREATE TABLE IF NOT EXISTS public.compliance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.procurement_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.rrci_workspaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  authority text,
  source_ref text,
  cadence text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  next_due_at timestamptz,
  evidence_requirement text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','retired')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_obligations_due_idx
  ON public.compliance_obligations (workspace_id,status,next_due_at);

CREATE TABLE IF NOT EXISTS public.compliance_monitoring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.compliance_obligations(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES public.procurement_assessments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.rrci_workspaces(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','warning','breach','unknown','review_required')),
  evidence_refs text[] NOT NULL DEFAULT '{}',
  summary text NOT NULL,
  model_run_id text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS compliance_monitoring_events_idx
  ON public.compliance_monitoring_events (workspace_id,assessment_id,observed_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_correspondence','compliance_inspections','compliance_obligations','compliance_monitoring_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'compliance workspace read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.procurement_can(workspace_id,''read''))',
      'compliance workspace read', t
    );
  END LOOP;
END $$;

CREATE OR REPLACE VIEW public.compliance_packs
WITH (security_invoker = true)
AS SELECT * FROM public.procurement_packs;
CREATE OR REPLACE VIEW public.compliance_assessments
WITH (security_invoker = true)
AS SELECT * FROM public.procurement_assessments;
CREATE OR REPLACE VIEW public.compliance_requirements
WITH (security_invoker = true)
AS SELECT * FROM public.procurement_requirements;
GRANT SELECT ON public.compliance_packs,public.compliance_assessments,public.compliance_requirements TO authenticated;
GRANT ALL ON public.compliance_packs,public.compliance_assessments,public.compliance_requirements TO service_role;

CREATE OR REPLACE FUNCTION public.create_compliance_assessment(
  _workspace uuid,
  _pack text,
  _name text,
  _entity text,
  _scope text,
  _authority text,
  _country text,
  _application_type text DEFAULT NULL,
  _location_ref text DEFAULT NULL,
  _service_types text[] DEFAULT ARRAY[]::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE p public.procurement_packs; a uuid;
BEGIN
  IF NOT public.procurement_can(_workspace,'write') THEN RAISE EXCEPTION 'Compliance access denied'; END IF;
  SELECT * INTO STRICT p FROM public.procurement_packs WHERE id=_pack;
  INSERT INTO public.procurement_assessments(
    workspace_id,pack_id,pack_version,name,legal_entity,scope,buyer,country,created_by,
    authority,application_type,location_ref,service_types
  ) VALUES (
    _workspace,p.id,p.version,btrim(_name),btrim(_entity),btrim(_scope),COALESCE(NULLIF(btrim(_authority),''),p.authority,p.title),btrim(_country),auth.uid(),
    COALESCE(NULLIF(btrim(_authority),''),p.authority),NULLIF(btrim(_application_type),''),NULLIF(btrim(_location_ref),''),COALESCE(_service_types,ARRAY[]::text[])
  ) RETURNING id INTO a;
  INSERT INTO public.procurement_requirements(assessment_id,workspace_id,template)
    SELECT a,_workspace,value FROM jsonb_array_elements(p.requirements);
  INSERT INTO public.procurement_audit(assessment_id,workspace_id,actor,action,detail)
    VALUES(a,_workspace,auth.uid(),'compliance.assessment.created',jsonb_build_object('pack',p.id,'version',p.version,'authority',COALESCE(_authority,p.authority)));
  RETURN a;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_compliance_assessment(uuid,text,text,text,text,text,text,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_compliance_assessment(uuid,text,text,text,text,text,text,text,text,text[]) TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_correspondence','compliance_inspections','compliance_obligations']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS platform_touch_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER platform_touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.platform_touch_updated_at()', t);
  END LOOP;
END $$;

COMMIT;