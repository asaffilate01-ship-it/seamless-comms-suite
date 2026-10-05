-- Fanout registrations and idempotency for newly added shared modules.
BEGIN;

INSERT INTO public.platform_module_event_patterns(module_key,event_pattern) VALUES
  ('inventory.core','inventory.movement.*'),
  ('inventory.core','hospitality.waste.*'),
  ('ordering.core','reception.order.*'),
  ('ordering.core','payment.*'),
  ('ordering.core','catalogue.*'),
  ('hospitality.intelligence','epos.*'),
  ('hospitality.intelligence','inventory.*'),
  ('hospitality.intelligence','hospitality.waste.*'),
  ('hospitality.intelligence','order.*'),
  ('hospitality.intelligence','refund.*'),
  ('practice.core','crm.*'),
  ('practice.core','document.*'),
  ('practice.core','signature.*'),
  ('practice.core','payment.*'),
  ('practice.core','compliance.*'),
  ('business360.core','crm.*'),
  ('business360.core','financial.*'),
  ('business360.core','analytics.*'),
  ('business360.core','document.*'),
  ('business360.core','compliance.*'),
  ('transactions.core','business360.*'),
  ('transactions.core','financial.*'),
  ('transactions.core','document.*'),
  ('transactions.core','compliance.*'),
  ('bookings.core','booking.*'),
  ('loyalty.core','order.completed'),
  ('loyalty.core','booking.completed'),
  ('loyalty.core','refund.completed'),
  ('automation.core','*'),
  ('forms.core','form.*')
ON CONFLICT(module_key,event_pattern) DO UPDATE SET enabled=true;

CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_event_workflow_uq
  ON public.automation_runs(workflow_id,event_id);

COMMIT;
