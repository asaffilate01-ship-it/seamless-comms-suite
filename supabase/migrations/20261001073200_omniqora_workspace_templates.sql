-- Workspace templates and summary RPCs for reusable assurance products.
BEGIN;

CREATE OR REPLACE FUNCTION public.omniqora_create_workspace(
  p_tenant uuid,
  p_service_key text,
  p_workspace_type text,
  p_template_key text,
  p_name text,
  p_jurisdiction text DEFAULT null,
  p_period_start date DEFAULT null,
  p_period_end date DEFAULT null
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_workspace uuid;
  v_row record;
  v_order integer:=10;
BEGIN
  IF NOT public.can_write(p_tenant,auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.omniqora_has_service(p_tenant,p_service_key) THEN RAISE EXCEPTION 'service_not_enabled'; END IF;
  IF p_workspace_type NOT IN ('audit','compliance','transaction','carveout','accounting','risk','transformation','general')
  THEN RAISE EXCEPTION 'invalid_workspace_type'; END IF;

  INSERT INTO public.omniqora_workspaces(
    tenant_id,service_key,workspace_type,template_key,name,status,jurisdiction,
    period_start,period_end,owner_user_id,created_by
  ) VALUES(
    p_tenant,p_service_key,p_workspace_type,p_template_key,p_name,'active',p_jurisdiction,
    p_period_start,p_period_end,auth.uid(),auth.uid()
  ) RETURNING id INTO v_workspace;

  FOR v_row IN
    SELECT workstream_key,name,category FROM (VALUES
      ('full-audit','planning','Planning & materiality','Audit'),
      ('full-audit','financial-statements','Financial statements & close','Finance'),
      ('full-audit','revenue','Revenue & receivables','Finance'),
      ('full-audit','purchases','Purchases, expenses & payables','Finance'),
      ('full-audit','assets','Fixed assets & capex','Finance'),
      ('full-audit','cash','Cash, debt & treasury','Finance'),
      ('full-audit','payroll','Payroll & people costs','People'),
      ('full-audit','tax','Tax','Tax'),
      ('full-audit','itgc','IT, data & general controls','Technology'),
      ('full-audit','controls','Risk & controls testing','Controls'),
      ('full-audit','sampling','Sampling & substantive testing','Audit'),
      ('full-audit','evidence','Evidence & confirmations','Audit'),
      ('full-audit','findings','Findings, review & reporting','Reporting'),

      ('compliance-as-a-service','scope','Scope & obligations register','Compliance'),
      ('compliance-as-a-service','policies','Policies & procedures','Compliance'),
      ('compliance-as-a-service','risks-controls','Risks & controls','Risk'),
      ('compliance-as-a-service','evidence','Evidence & attestations','Assurance'),
      ('compliance-as-a-service','monitoring','Continuous monitoring','Monitoring'),
      ('compliance-as-a-service','regulatory-change','Regulatory change','Intelligence'),
      ('compliance-as-a-service','remediation','Findings & remediation','Remediation'),
      ('compliance-as-a-service','reporting','Board, client & regulator reporting','Reporting'),

      ('ma-carveout','transaction-scope','Transaction scope, perimeter & governance','Transaction'),
      ('ma-carveout','qoe','Financial diligence & QoE','Finance'),
      ('ma-carveout','people','People & organisation','People'),
      ('ma-carveout','applications','Applications & ERP','Technology'),
      ('ma-carveout','identity-workplace','Identity & workplace','Technology'),
      ('ma-carveout','cloud-infra','Cloud & infrastructure','Technology'),
      ('ma-carveout','cyber','Cybersecurity','Technology'),
      ('ma-carveout','data-bi','Data, BI & reporting','Data'),
      ('ma-carveout','vendors-contracts','Vendors, contracts & licences','Commercial'),
      ('ma-carveout','carveout-financials','Carve-out financials & allocations','Finance'),
      ('ma-carveout','stranded-costs','Shared & stranded costs','Finance'),
      ('ma-carveout','tsa','TSAs & exit criteria','Separation'),
      ('ma-carveout','day1','Operational Day 1','Separation'),
      ('ma-carveout','day30','Days 2–30','Separation'),
      ('ma-carveout','day60','Days 31–60','Separation'),
      ('ma-carveout','day100','Days 61–100','Separation'),
      ('ma-carveout','benefits','Synergies & benefits realisation','Value'),

      ('accounting-tax','intake','Document intake','Bookkeeping'),
      ('accounting-tax','bookkeeping','AI bookkeeping & coding','Bookkeeping'),
      ('accounting-tax','uncertainty','Uncertain items & client queries','Bookkeeping'),
      ('accounting-tax','reconciliations','Bank & control reconciliations','Accounting'),
      ('accounting-tax','trial-balance','Trial balance & lead schedules','Accounting'),
      ('accounting-tax','assets','Fixed asset register','Accounting'),
      ('accounting-tax','accounts','Accounts production','Accounts'),
      ('accounting-tax','tax','Tax research & computations','Tax'),
      ('accounting-tax','payroll','Payroll','Payroll'),
      ('accounting-tax','review','Review, approval & submission','Practice')
    ) AS seed(template_key,workstream_key,name,category)
    WHERE template_key=p_template_key
  LOOP
    INSERT INTO public.omniqora_workstreams(
      workspace_id,workstream_key,name,category,sort_order
    ) VALUES(v_workspace,v_row.workstream_key,v_row.name,v_row.category,v_order)
    ON CONFLICT(workspace_id,workstream_key) DO NOTHING;
    v_order:=v_order+10;
  END LOOP;

  INSERT INTO public.audit_log(tenant_id,actor,action,entity,entity_id,payload)
  VALUES(p_tenant,auth.uid(),'omniqora.workspace.created','workspace',v_workspace::text,
    jsonb_build_object('serviceKey',p_service_key,'templateKey',p_template_key,'type',p_workspace_type));

  RETURN v_workspace;
END $$;
REVOKE ALL ON FUNCTION public.omniqora_create_workspace(uuid,text,text,text,text,text,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_create_workspace(uuid,text,text,text,text,text,date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.omniqora_workspace_summary(p_workspace uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.omniqora_workspaces WHERE id=p_workspace;
  IF v_tenant IS NULL OR NOT public.is_tenant_member(v_tenant,auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN jsonb_build_object(
    'workspace',(SELECT to_jsonb(w) FROM public.omniqora_workspaces w WHERE w.id=p_workspace),
    'workstreams',coalesce((SELECT jsonb_agg(to_jsonb(ws) ORDER BY ws.sort_order,ws.name)
      FROM public.omniqora_workstreams ws WHERE ws.workspace_id=p_workspace),'[]'::jsonb),
    'counts',jsonb_build_object(
      'records',(SELECT count(*) FROM public.omniqora_workspace_records WHERE workspace_id=p_workspace),
      'evidence',(SELECT count(*) FROM public.omniqora_evidence WHERE workspace_id=p_workspace),
      'controls',(SELECT count(*) FROM public.omniqora_risk_controls WHERE workspace_id=p_workspace),
      'findings',(SELECT count(*) FROM public.omniqora_findings WHERE workspace_id=p_workspace),
      'transactionItems',(SELECT count(*) FROM public.omniqora_transaction_items WHERE workspace_id=p_workspace),
      'knowledgeNodes',(SELECT count(*) FROM public.omniqora_knowledge_nodes WHERE workspace_id=p_workspace),
      'aiRuns',(SELECT count(*) FROM public.omniqora_ai_runs WHERE workspace_id=p_workspace),
      'metrics',(SELECT count(*) FROM public.omniqora_metrics WHERE workspace_id=p_workspace)
    ),
    'openFindings',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY
      CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
      f.created_at DESC)
      FROM public.omniqora_findings f WHERE f.workspace_id=p_workspace AND f.status<>'closed'),'[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.omniqora_workspace_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.omniqora_workspace_summary(uuid) TO authenticated;

COMMIT;
