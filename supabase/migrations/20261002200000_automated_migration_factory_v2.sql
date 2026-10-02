BEGIN;

CREATE TABLE IF NOT EXISTS public.portfolio_repo_audits(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES public.portfolio_assets(id) ON DELETE CASCADE,
 repository_url text,
 commit_sha text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','running','passed','failed','manual_review')),
 stack jsonb NOT NULL DEFAULT '{}'::jsonb,
 schemas jsonb NOT NULL DEFAULT '[]'::jsonb,
 routes jsonb NOT NULL DEFAULT '[]'::jsonb,
 providers jsonb NOT NULL DEFAULT '[]'::jsonb,
 capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
 risks jsonb NOT NULL DEFAULT '[]'::jsonb,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 audited_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_repo_audits_asset_idx ON public.portfolio_repo_audits(tenant_id,asset_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.portfolio_capability_findings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES public.portfolio_assets(id) ON DELETE CASCADE,
 capability_key text NOT NULL,
 disposition text NOT NULL CHECK(disposition IN('keep_vertical','use_shared','merge_shared','replace','retire','manual_review')),
 target_service_key text REFERENCES public.service_catalogue(service_key) ON DELETE SET NULL,
 confidence numeric CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(asset_id,capability_key)
);

CREATE TABLE IF NOT EXISTS public.portfolio_migration_targets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES public.portfolio_assets(id) ON DELETE CASCADE,
 target_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 target_product_key text NOT NULL REFERENCES public.product_catalogue(product_key) ON DELETE RESTRICT,
 source_workspace_id text,
 product_connection_id uuid REFERENCES public.product_connections(id) ON DELETE SET NULL,
 required boolean NOT NULL DEFAULT true,
 status text NOT NULL DEFAULT 'mapped' CHECK(status IN('mapped','adapter_ready','shadowing','ready','cutover','complete','blocked')),
 config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(asset_id,target_tenant_id,target_product_key)
);
CREATE INDEX IF NOT EXISTS portfolio_targets_asset_idx ON public.portfolio_migration_targets(asset_id,status);

CREATE TABLE IF NOT EXISTS public.portfolio_migration_adapters(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES public.portfolio_assets(id) ON DELETE CASCADE,
 adapter_key text NOT NULL,
 version text NOT NULL DEFAULT '1',
 direction text NOT NULL DEFAULT 'bidirectional' CHECK(direction IN('source_to_target','target_to_source','bidirectional','control_only')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','configured','verified','failed','retired')),
 contract jsonb NOT NULL DEFAULT '{}'::jsonb,
 mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
 idempotency_strategy text,
 rollback_strategy text,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 verified_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(asset_id,adapter_key)
);

CREATE TABLE IF NOT EXISTS public.portfolio_shadow_checks(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES public.portfolio_assets(id) ON DELETE CASCADE,
 target_id uuid REFERENCES public.portfolio_migration_targets(id) ON DELETE CASCADE,
 check_key text NOT NULL,
 check_type text NOT NULL CHECK(check_type IN('record_count','sample_parity','money_parity','order_parity','event_parity','auth_parity','manual')),
 status text NOT NULL CHECK(status IN('passed','failed','warning','running')),
 source_value jsonb,
 target_value jsonb,
 tolerance jsonb NOT NULL DEFAULT '{}'::jsonb,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portfolio_shadow_checks_asset_idx ON public.portfolio_shadow_checks(asset_id,target_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS public.portfolio_cutover_plans(
 asset_id uuid PRIMARY KEY REFERENCES public.portfolio_assets(id) ON DELETE CASCADE,
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 change_window text,
 freeze_strategy text,
 dns_strategy text,
 communication_plan text,
 rollback_strategy text NOT NULL,
 rollback_thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
 smoke_tests jsonb NOT NULL DEFAULT '[]'::jsonb,
 owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 approved_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.portfolio_cutover_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES public.portfolio_assets(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN('planned','running','succeeded','rolled_back','failed')),
 started_at timestamptz,
 completed_at timestamptz,
 preflight jsonb NOT NULL DEFAULT '{}'::jsonb,
 result jsonb NOT NULL DEFAULT '{}'::jsonb,
 rollback_reason text,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
  'portfolio_repo_audits','portfolio_capability_findings','portfolio_migration_targets',
  'portfolio_migration_adapters','portfolio_shadow_checks','portfolio_cutover_plans','portfolio_cutover_runs'
 ] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','migration factory read',t);
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])) WITH CHECK(public.is_platform_admin(auth.uid()) OR public.has_tenant_role(tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]))','migration factory write',t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.migration_map_target(
 _asset uuid,_target_tenant uuid,_product text,_source_workspace text,_required boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.portfolio_assets%rowtype; result uuid; conn uuid;
BEGIN
 SELECT * INTO a FROM public.portfolio_assets WHERE id=_asset;
 IF NOT FOUND THEN RAISE EXCEPTION 'Portfolio asset not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid())
    AND NOT public.has_tenant_role(a.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Migration factory access denied';
 END IF;
 SELECT id INTO conn FROM public.product_connections
 WHERE tenant_id=_target_tenant AND product_key=_product
   AND (_source_workspace IS NULL OR external_tenant_id=_source_workspace)
 ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,id LIMIT 1;
 INSERT INTO public.portfolio_migration_targets(
  tenant_id,asset_id,target_tenant_id,target_product_key,source_workspace_id,product_connection_id,required,status
 ) VALUES(a.tenant_id,_asset,_target_tenant,_product,_source_workspace,conn,_required,'mapped')
 ON CONFLICT(asset_id,target_tenant_id,target_product_key) DO UPDATE SET
  source_workspace_id=EXCLUDED.source_workspace_id,product_connection_id=EXCLUDED.product_connection_id,
  required=EXCLUDED.required,updated_at=now()
 RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.migration_map_target(uuid,uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.migration_map_target(uuid,uuid,text,text,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.migration_refresh_target(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.portfolio_migration_targets%rowtype; conn public.product_connections%rowtype; readiness jsonb; blockers jsonb:='[]'::jsonb; new_status text;
BEGIN
 SELECT * INTO t FROM public.portfolio_migration_targets WHERE id=_target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Migration target not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(t.tenant_id,auth.uid()) THEN
  RAISE EXCEPTION 'Migration target access denied';
 END IF;
 SELECT * INTO conn FROM public.product_connections
 WHERE tenant_id=t.target_tenant_id AND product_key=t.target_product_key
   AND (t.source_workspace_id IS NULL OR external_tenant_id=t.source_workspace_id)
 ORDER BY CASE WHEN status='connected' THEN 0 ELSE 1 END,id LIMIT 1;
 IF conn.id IS NULL OR conn.status<>'connected' THEN
  blockers:=blockers||jsonb_build_array('product_connection_not_connected');
 ELSE
  UPDATE public.portfolio_migration_targets SET product_connection_id=conn.id WHERE id=t.id;
 END IF;
 BEGIN
  readiness:=public.get_tenant_product_readiness(t.target_tenant_id,t.target_product_key);
 EXCEPTION WHEN OTHERS THEN
  readiness:=jsonb_build_object('ready',false,'blockers',jsonb_build_array('tenant_product_readiness_unavailable'));
 END;
 IF NOT COALESCE((readiness->>'ready')::boolean,false) THEN
  blockers:=blockers||COALESCE(readiness->'blockers','[]'::jsonb);
 END IF;
 new_status:=CASE WHEN jsonb_array_length(blockers)=0 THEN 'ready' ELSE 'blocked' END;
 UPDATE public.portfolio_migration_targets SET status=new_status,updated_at=now() WHERE id=t.id;
 RETURN jsonb_build_object('targetId',t.id,'ready',jsonb_array_length(blockers)=0,'blockers',blockers,'productReadiness',readiness);
END; $$;
REVOKE ALL ON FUNCTION public.migration_refresh_target(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.migration_refresh_target(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.migration_evaluate_asset(_asset uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.portfolio_assets%rowtype; blockers jsonb:='[]'::jsonb; warnings jsonb:='[]'::jsonb;
 audit_ok boolean; adapter_ok boolean; plan_ok boolean; required_targets integer; ready_targets integer; failed_shadow integer; passed_shadow integer;
BEGIN
 SELECT * INTO a FROM public.portfolio_assets WHERE id=_asset;
 IF NOT FOUND THEN RAISE EXCEPTION 'Portfolio asset not found'; END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.is_tenant_member(a.tenant_id,auth.uid()) THEN
  RAISE EXCEPTION 'Migration asset access denied';
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.portfolio_repo_audits WHERE asset_id=_asset AND status='passed') INTO audit_ok;
 IF NOT audit_ok THEN blockers:=blockers||jsonb_build_array('repo_audit_not_passed'); END IF;
 IF a.target_mode='pending' OR a.canonical_product_key IS NULL THEN blockers:=blockers||jsonb_build_array('migration_decision_incomplete'); END IF;
 SELECT EXISTS(SELECT 1 FROM public.portfolio_migration_adapters WHERE asset_id=_asset AND status='verified' AND rollback_strategy IS NOT NULL) INTO adapter_ok;
 IF NOT adapter_ok THEN blockers:=blockers||jsonb_build_array('verified_adapter_missing'); END IF;
 SELECT count(*) FILTER(WHERE required),count(*) FILTER(WHERE required AND status='ready') INTO required_targets,ready_targets FROM public.portfolio_migration_targets WHERE asset_id=_asset;
 IF required_targets=0 THEN blockers:=blockers||jsonb_build_array('required_targets_missing');
 ELSIF ready_targets<required_targets THEN blockers:=blockers||jsonb_build_array('required_targets_not_ready'); END IF;
 SELECT count(*) FILTER(WHERE status='failed'),count(*) FILTER(WHERE status='passed') INTO failed_shadow,passed_shadow
 FROM public.portfolio_shadow_checks WHERE asset_id=_asset AND checked_at>now()-interval '7 days';
 IF failed_shadow>0 THEN blockers:=blockers||jsonb_build_array('shadow_checks_failed'); END IF;
 IF passed_shadow=0 THEN blockers:=blockers||jsonb_build_array('shadow_checks_missing'); END IF;
 SELECT EXISTS(SELECT 1 FROM public.portfolio_cutover_plans WHERE asset_id=_asset AND rollback_strategy<>'' AND approved_at IS NOT NULL) INTO plan_ok;
 IF NOT plan_ok THEN blockers:=blockers||jsonb_build_array('approved_cutover_plan_missing'); END IF;
 IF a.live_url IS NULL THEN warnings:=warnings||jsonb_build_array('live_url_missing'); END IF;
 RETURN jsonb_build_object(
  'assetId',_asset,'ready',jsonb_array_length(blockers)=0,'blockers',blockers,'warnings',warnings,
  'requiredTargets',required_targets,'readyTargets',ready_targets,'passedShadowChecks',passed_shadow,'failedShadowChecks',failed_shadow
 );
END; $$;
REVOKE ALL ON FUNCTION public.migration_evaluate_asset(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.migration_evaluate_asset(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.migration_mark_cutover_ready(_asset uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb; a public.portfolio_assets%rowtype;
BEGIN
 SELECT * INTO a FROM public.portfolio_assets WHERE id=_asset FOR UPDATE;
 IF NOT FOUND OR (NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(a.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[])) THEN
  RAISE EXCEPTION 'Migration factory access denied';
 END IF;
 e:=public.migration_evaluate_asset(_asset);
 IF NOT COALESCE((e->>'ready')::boolean,false) THEN RAISE EXCEPTION 'Asset is not cutover ready: %',e->'blockers'; END IF;
 UPDATE public.portfolio_assets SET migration_stage='cutover_ready',stage_progress=85,updated_at=now() WHERE id=_asset;
 INSERT INTO public.portfolio_migration_events(tenant_id,asset_id,actor_user_id,event_type,from_stage,to_stage,details)
 VALUES(a.tenant_id,_asset,auth.uid(),'cutover.ready',a.migration_stage,'cutover_ready',e);
 RETURN e;
END; $$;
REVOKE ALL ON FUNCTION public.migration_mark_cutover_ready(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.migration_mark_cutover_ready(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.migration_begin_cutover(_asset uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.portfolio_assets%rowtype; result uuid;
BEGIN
 SELECT * INTO a FROM public.portfolio_assets WHERE id=_asset FOR UPDATE;
 IF NOT FOUND OR a.migration_stage<>'cutover_ready' THEN RAISE EXCEPTION 'Asset is not cutover ready'; END IF;
 IF NOT public.is_platform_admin(auth.uid()) AND NOT public.has_tenant_role(a.tenant_id,auth.uid(),ARRAY['owner','admin']::public.app_role[]) THEN
  RAISE EXCEPTION 'Migration factory access denied';
 END IF;
 INSERT INTO public.portfolio_cutover_runs(tenant_id,asset_id,status,started_at,preflight,created_by)
 VALUES(a.tenant_id,_asset,'running',now(),public.migration_evaluate_asset(_asset),auth.uid()) RETURNING id INTO result;
 UPDATE public.portfolio_assets SET migration_stage='cutover',stage_progress=95,updated_at=now() WHERE id=_asset;
 UPDATE public.portfolio_migration_targets SET status='cutover',updated_at=now() WHERE asset_id=_asset AND required;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.migration_begin_cutover(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.migration_begin_cutover(uuid) TO authenticated,service_role;

COMMIT;