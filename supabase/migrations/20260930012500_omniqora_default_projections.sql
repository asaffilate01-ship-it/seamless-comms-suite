-- Idempotent default analytics projections from canonical events.
BEGIN;

ALTER TABLE public.analytics_metric_points
  ADD COLUMN IF NOT EXISTS source_event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS analytics_metric_points_source_uq
  ON public.analytics_metric_points(tenant_id,metric_key,source_event_id)
  WHERE source_event_id IS NOT NULL;

INSERT INTO public.analytics_metric_definitions(metric_key,name,description,unit,aggregation,config,status) VALUES
 ('revenue.gross','Gross revenue','Gross revenue projected from canonical completed-order events.','money','sum','{"minor_units":true}'::jsonb,'active'),
 ('customers.new','New customers','New CRM/customer records from canonical customer-created events.','count','count','{}'::jsonb,'active'),
 ('jobs.completed','Completed jobs','Completed Dispatch jobs.','count','count','{}'::jsonb,'active')
ON CONFLICT (metric_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,unit=EXCLUDED.unit,aggregation=EXCLUDED.aggregation,config=EXCLUDED.config,status=EXCLUDED.status;

COMMIT;