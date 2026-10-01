-- Shared knowledge graph, AI run and metric layer for RAG/GraphRAG/BI.
BEGIN;

CREATE TABLE IF NOT EXISTS public.omniqora_knowledge_nodes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  node_type text NOT NULL,
  label text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_graph_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,node_key)
);

CREATE TABLE IF NOT EXISTS public.omniqora_knowledge_edges(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  from_node_id uuid NOT NULL REFERENCES public.omniqora_knowledge_nodes(id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES public.omniqora_knowledge_nodes(id) ON DELETE CASCADE,
  relationship text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_graph_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_ai_runs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  service_key text REFERENCES public.omniqora_service_catalogue(service_key) ON DELETE SET NULL,
  agent_key text,
  run_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK(status IN ('queued','running','awaiting_approval','complete','failed','cancelled')),
  model_provider text,
  model_name text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_pence integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.omniqora_metrics(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.omniqora_workspaces(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  metric_name text NOT NULL,
  period_key text NOT NULL,
  value numeric,
  unit text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  semantic_model_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS omniqora_metrics_lookup_idx ON public.omniqora_metrics(workspace_id,metric_key,period_key);
CREATE INDEX IF NOT EXISTS omniqora_knowledge_edges_graph_idx
  ON public.omniqora_knowledge_edges(workspace_id,from_node_id,to_node_id,relationship);

ALTER TABLE public.omniqora_knowledge_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omniqora_knowledge_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omniqora_ai_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omniqora_metrics ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.omniqora_knowledge_nodes,public.omniqora_knowledge_edges,
  public.omniqora_ai_runs,public.omniqora_metrics TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.omniqora_knowledge_nodes,public.omniqora_knowledge_edges,
  public.omniqora_ai_runs,public.omniqora_metrics TO authenticated;

CREATE POLICY "knowledge nodes read" ON public.omniqora_knowledge_nodes FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "knowledge nodes write" ON public.omniqora_knowledge_nodes FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

CREATE POLICY "knowledge edges read" ON public.omniqora_knowledge_edges FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "knowledge edges write" ON public.omniqora_knowledge_edges FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

CREATE POLICY "ai runs read" ON public.omniqora_ai_runs FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "ai runs write" ON public.omniqora_ai_runs FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

CREATE POLICY "metrics read" ON public.omniqora_metrics FOR SELECT TO authenticated
 USING(public.is_tenant_member(public.omniqora_workspace_tenant(workspace_id),auth.uid()));
CREATE POLICY "metrics write" ON public.omniqora_metrics FOR ALL TO authenticated
 USING(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()))
 WITH CHECK(public.can_write(public.omniqora_workspace_tenant(workspace_id),auth.uid()));

COMMIT;
