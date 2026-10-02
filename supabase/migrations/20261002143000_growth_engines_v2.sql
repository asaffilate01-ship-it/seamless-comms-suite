BEGIN;
CREATE TABLE IF NOT EXISTS public.growth_customer_metrics(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,
 last_order_at timestamptz,orders_count integer NOT NULL DEFAULT 0,revenue_minor bigint NOT NULL DEFAULT 0,
 recency_days integer,frequency_score integer,monetary_score integer,rfm_segment text,ltv_minor bigint NOT NULL DEFAULT 0,
 churn_risk numeric,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,person_id));
CREATE TABLE IF NOT EXISTS public.growth_segments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,name text NOT NULL,segment_key text NOT NULL,
 rules jsonb NOT NULL DEFAULT '{}'::jsonb,status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,segment_key));
CREATE TABLE IF NOT EXISTS public.growth_segment_members(
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,segment_id uuid NOT NULL REFERENCES public.growth_segments(id) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES public.crm_people(id) ON DELETE CASCADE,reason jsonb NOT NULL DEFAULT '{}'::jsonb,updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(segment_id,person_id));
CREATE TABLE IF NOT EXISTS public.marketing_campaigns(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,name text NOT NULL,channel text NOT NULL CHECK(channel IN('whatsapp','sms','email','push','multi')),
 segment_id uuid REFERENCES public.growth_segments(id) ON DELETE SET NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','scheduled','running','paused','completed','cancelled')),
 subject text,content jsonb NOT NULL DEFAULT '{}'::jsonb,scheduled_at timestamptz,started_at timestamptz,completed_at timestamptz,
 sent_count integer NOT NULL DEFAULT 0,delivered_count integer NOT NULL DEFAULT 0,opened_count integer NOT NULL DEFAULT 0,clicked_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.customer_journeys(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,name text NOT NULL,trigger_event text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','archived')),definition jsonb NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.journey_enrolments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 journey_id uuid NOT NULL REFERENCES public.customer_journeys(id) ON DELETE CASCADE,person_id uuid REFERENCES public.crm_people(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'active' CHECK(status IN('active','waiting','completed','cancelled','failed')),current_node text,
 context jsonb NOT NULL DEFAULT '{}'::jsonb,started_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.sales_sequences(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,name text NOT NULL,status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','active','paused','archived')),
 steps jsonb NOT NULL DEFAULT '[]'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.sales_sequence_enrolments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 sequence_id uuid NOT NULL REFERENCES public.sales_sequences(id) ON DELETE CASCADE,lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
 person_id uuid REFERENCES public.crm_people(id) ON DELETE CASCADE,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','completed','replied','cancelled','failed')),
 current_step integer NOT NULL DEFAULT 0,next_action_at timestamptz,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.feedback_surveys(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 product_key text REFERENCES public.product_catalogue(product_key) ON DELETE CASCADE,name text NOT NULL,survey_type text NOT NULL CHECK(survey_type IN('nps','csat','ces','review')),
 trigger_event text,status text NOT NULL DEFAULT 'active' CHECK(status IN('draft','active','paused','archived')),config jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.feedback_responses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 survey_id uuid NOT NULL REFERENCES public.feedback_surveys(id) ON DELETE CASCADE,person_id uuid REFERENCES public.crm_people(id) ON DELETE SET NULL,
 subject_type text,subject_id text,score numeric NOT NULL,comment text,sentiment text CHECK(sentiment IS NULL OR sentiment IN('positive','neutral','negative')),
 recovery_status text NOT NULL DEFAULT 'none' CHECK(recovery_status IN('none','queued','contacted','resolved','closed')),metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['growth_customer_metrics','growth_segments','growth_segment_members','marketing_campaigns','customer_journeys','journey_enrolments','sales_sequences','sales_sequence_enrolments','feedback_surveys','feedback_responses'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('GRANT ALL ON public.%I TO service_role',t);EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
 EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING(public.is_platform_admin(auth.uid()) OR public.is_tenant_member(tenant_id,auth.uid()))','growth tenant read',t);
 EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING(public.can_write(tenant_id,auth.uid())) WITH CHECK(public.can_write(tenant_id,auth.uid()))','growth tenant write',t);
 END LOOP;END $$;
CREATE OR REPLACE FUNCTION public.growth_recompute_customer_metrics(_tenant uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p record;cnt integer:=0;last_order timestamptz;orders integer;revenue bigint;recency integer;seg text;BEGIN
 IF NOT public.can_write(_tenant,auth.uid()) AND NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Growth access denied';END IF;
 FOR p IN SELECT id,external_ref FROM public.crm_people WHERE tenant_id=_tenant LOOP
  SELECT max(created_at),count(*)::integer,COALESCE(sum(total_minor),0)::bigint INTO last_order,orders,revenue FROM public.marketplace_orders WHERE tenant_id=_tenant AND buyer_ref IN (p.id::text,COALESCE(p.external_ref,''),'crm:'||p.id::text) AND status IN('paid','accepted','fulfilling','completed');
  recency:=CASE WHEN last_order IS NULL THEN NULL ELSE GREATEST(0,extract(day FROM now()-last_order)::integer) END;
  seg:=CASE WHEN orders>=10 AND COALESCE(recency,999)<=30 THEN 'champion' WHEN orders>=5 AND COALESCE(recency,999)<=60 THEN 'loyal' WHEN orders>=1 AND COALESCE(recency,999)<=30 THEN 'recent' WHEN orders>=1 AND COALESCE(recency,999)>90 THEN 'at_risk' ELSE 'prospect' END;
  INSERT INTO public.growth_customer_metrics(tenant_id,person_id,last_order_at,orders_count,revenue_minor,recency_days,frequency_score,monetary_score,rfm_segment,ltv_minor,churn_risk)
  VALUES(_tenant,p.id,last_order,orders,revenue,recency,LEAST(5,GREATEST(1,orders)),LEAST(5,GREATEST(1,(revenue/10000)::integer+1)),seg,revenue,CASE WHEN recency IS NULL THEN 0.5 WHEN recency>90 THEN 0.9 WHEN recency>60 THEN 0.7 WHEN recency>30 THEN 0.4 ELSE 0.1 END)
  ON CONFLICT(tenant_id,person_id) DO UPDATE SET last_order_at=EXCLUDED.last_order_at,orders_count=EXCLUDED.orders_count,revenue_minor=EXCLUDED.revenue_minor,recency_days=EXCLUDED.recency_days,frequency_score=EXCLUDED.frequency_score,monetary_score=EXCLUDED.monetary_score,rfm_segment=EXCLUDED.rfm_segment,ltv_minor=EXCLUDED.ltv_minor,churn_risk=EXCLUDED.churn_risk,updated_at=now();cnt:=cnt+1;
 END LOOP;RETURN cnt;END;$$;
UPDATE public.service_catalogue SET implementation_status='built_main',updated_at=now() WHERE service_key IN('omniqora.journeys','omniqora.rfm','omniqora.sales','omniqora.feedback');
INSERT INTO public.service_catalogue(service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,implementation_status) VALUES
('omniqora.campaigns','Campaigns','Shared multichannel campaign definitions and delivery metrics.','growth','omniqora',true,'automatic','active','built_main')
ON CONFLICT(service_key) DO UPDATE SET implementation_status='built_main',updated_at=now();
COMMIT;