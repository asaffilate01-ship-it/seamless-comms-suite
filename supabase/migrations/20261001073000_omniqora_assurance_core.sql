-- Shared assurance and transaction workspace records.
BEGIN;

CREATE TABLE IF NOT EXISTS public.omniqora_workspaces(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_key text REFERENCES public.omniqora_product_catalogue(product_key) ON DELETE SET NULL,
  service_key text NOT NULL REFERENCES public.omniqora_service_catalogue(service_key),
  workspace_type text NOT NULL CHECK(workspace_type IN ('audit','compliance','transaction','carveout','accounting','risk','transformation','general')),
  template_key text,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','review','complete','archived')),
  jurisdiction text,
  period_start date,
  period_end date,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_workstreams(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  workstream_key text NOT NULL,
  name text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','blocked','review','complete')),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  start_at date,
  due_at date,
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  sort_order integer NOT NULL DEFAULT 100,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,workstream_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_workspace_records(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  workstream_id uuid REFERENCES public.omniqora_workstreams(id) ON DELETE SET NULL,
  record_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  severity text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_system text,
  external_ref text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_evidence(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  record_id uuid REFERENCES public.omniqora_workspace_records(id) ON DELETE SET NULL,
  evidence_type text NOT NULL DEFAULT 'document',
  title text NOT NULL,
  source_type text,
  source_ref text,
  document_url text,
  content_hash text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(6,5) CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
  review_status text NOT NULL DEFAULT 'unreviewed' CHECK(review_status IN ('unreviewed','reviewed','accepted','rejected','superseded')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_risk_controls(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  risk_key text,
  control_key text,
  name text NOT NULL,
  risk_statement text,
  control_description text,
  frequency text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  inherent_risk text,
  residual_risk text,
  design_effectiveness text CHECK(design_effectiveness IS NULL OR design_effectiveness IN ('effective','partially_effective','ineffective','not_tested')),
  operating_effectiveness text CHECK(operating_effectiveness IS NULL OR operating_effectiveness IN ('effective','partially_effective','ineffective','not_tested')),
  test_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_findings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  record_id uuid REFERENCES public.omniqora_workspace_records(id) ON DELETE SET NULL,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK(severity IN ('info','low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','agreed','in_progress','risk_accepted','closed')),
  root_cause text,
  impact text,
  recommendation text,
  management_response text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_at date,
  closed_at timestamptz,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_transaction_items(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  name text NOT NULL,
  disposition text NOT NULL DEFAULT 'unknown' CHECK(disposition IN ('retained','separated','shared','newco','buyer','seller','target','unknown')),
  criticality text,
  owner text,
  day1_required boolean NOT NULL DEFAULT false,
  tsa_required boolean NOT NULL DEFAULT false,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS omniqora_workspace_records_type_idx
  ON public.omniqora_workspace_records(workspace_id,record_type,status);

CREATE OR REPLACE FUNCTION public.omniqora_workspace_tenant(target uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT tenant_id FROM public.omniqora_workspaces WHERE id=target
$$;
REVOKE ALL ON FUNCTION public.omniqora_workspace_tenant(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_workspace_tenant(uuid) TO authenticated,service_role;

ALTER TABLE public.omniqora_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omniqora_workstreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omniqora_workspace_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omniqora_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omniqora_risk_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omniqora_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omniqora_transaction_items ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.omniqora_workspaces,public.omniqora_workstreams,public.omniqora_workspace_records,
 public.omniqora_evidence,public.omniqora_risk_controls,public.omniqora_findings,public.omniqora_transaction_items
TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.omniqora_workspaces,public.omniqora_workstreams,
 public.omniqora_workspace_records,public.omniqora_evidence,public.omniqora_risk_controls,
 public.omniqora_findings,public.omniqora_transaction_items
TO authenticated;

CREATE POLICY "assurance workspace read" ON public.omniqora_workspaces FOR SELECT TO authenticated
 USING(public.is_tenant_member(tenant_id,auth.uid()));
CREATE POLICY "assurance workspace write" ON public.omniqora_workspaces FOR ALL TO authenticated
 USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()));

CREATE POLICY "workstream read" ON public.omniqora_workstreams FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "workstream write" ON public.omniqora_workstreams FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

CREATE POLICY "workspace record read" ON public.omniqora_workspace_records FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "workspace record write" ON public.omniqora_workspace_records FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

CREATE POLICY "evidence read" ON public.omniqora_evidence FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "evidence write" ON public.omniqora_evidence FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

CREATE POLICY "risk controls read" ON public.omniqora_risk_controls FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "risk controls write" ON public.omniqora_risk_controls FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

CREATE POLICY "findings read" ON public.omniqora_findings FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "findings write" ON public.omniqora_findings FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

CREATE POLICY "transaction items read" ON public.omniqora_transaction_items FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "transaction items write" ON public.omniqora_transaction_items FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

COMMIT;
