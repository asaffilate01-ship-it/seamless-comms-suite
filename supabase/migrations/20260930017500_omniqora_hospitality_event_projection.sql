-- EPOS item idempotency support for hospitality event projections.
BEGIN;

ALTER TABLE public.epos_item_facts
  ADD COLUMN IF NOT EXISTS line_ref text;

UPDATE public.epos_item_facts
SET line_ref=COALESCE(line_ref,id::text)
WHERE line_ref IS NULL;

ALTER TABLE public.epos_item_facts
  ALTER COLUMN line_ref SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS epos_item_facts_line_uq
  ON public.epos_item_facts(transaction_id,line_ref);

INSERT INTO public.analytics_metric_definitions(metric_key,name,description,unit,aggregation,config,status) VALUES
 ('hospitality.net_sales','Hospitality net sales','Net EPOS sales from reviewed source transaction facts.','money','sum','{"source":"epos_transaction_facts","minor_units":true}'::jsonb,'active'),
 ('hospitality.discounts','Hospitality discounts','Discount value recorded in EPOS transaction facts.','money','sum','{"source":"epos_transaction_facts","minor_units":true}'::jsonb,'active'),
 ('hospitality.refunds','Hospitality refunds','Refund value recorded in EPOS transaction facts.','money','sum','{"source":"epos_transaction_facts","minor_units":true}'::jsonb,'active'),
 ('hospitality.transactions','Hospitality transactions','Count of EPOS transaction facts.','count','count','{"source":"epos_transaction_facts"}'::jsonb,'active')
ON CONFLICT(metric_key) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,unit=EXCLUDED.unit,
 aggregation=EXCLUDED.aggregation,config=EXCLUDED.config,status=EXCLUDED.status,updated_at=now();

COMMIT;
