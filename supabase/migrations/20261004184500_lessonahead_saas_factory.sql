-- Register LessonAhead as an external Marketplace + Operations product.
-- Learner, lesson, verification and message bodies remain in LessonAhead.
begin;

insert into public.product_catalogue(
  product_key,name,description,category,deployment_mode,default_base_url,status,metadata
) values (
  'lessonahead','LessonAhead','UK driving-instructor marketplace, learner progress and school operations.',
  'marketplace','external','https://nectar-design-lab.lovable.app','active',
  '{"productClass":["marketplace","operations"],"country":"GB","systemOfRecord":"external","repository":"https://github.com/asaffilate01-ship-it/nectar-design-lab"}'::jsonb
)
on conflict(product_key) do update set
  name=excluded.name,description=excluded.description,category=excluded.category,
  deployment_mode=excluded.deployment_mode,default_base_url=excluded.default_base_url,
  status=excluded.status,metadata=excluded.metadata,updated_at=now();

insert into public.service_catalogue(
  service_key,name,description,family,owner_product_key,billable,provisioning_mode,status,metadata
) values (
  'lessonahead.core','LessonAhead Core','Marketplace, booking, Learning Passport and school operations owned by LessonAhead.',
  'marketplace','lessonahead',true,'external','active',
  '{"dataBoundary":"LessonAhead Supabase","containsSpecialCategoryData":true}'::jsonb
)
on conflict(service_key) do update set
  name=excluded.name,description=excluded.description,family=excluded.family,
  owner_product_key=excluded.owner_product_key,billable=excluded.billable,
  provisioning_mode=excluded.provisioning_mode,status=excluded.status,metadata=excluded.metadata,updated_at=now();

insert into public.product_services(product_key,service_key,default_enabled,required,metadata) values
  ('lessonahead','lessonahead.core',true,true,'{}'),
  ('lessonahead','omniqora.marketplace',true,false,'{"usage":"aggregate analytics and shared marketplace primitives only"}'),
  ('lessonahead','omniqora.geo',true,false,'{"usage":"RouteFit travel-time and area matching"}'),
  ('lessonahead','omniqora.analytics',true,false,'{"usage":"minimal consented events and aggregate analytics"}'),
  ('lessonahead','omniqora.connect',false,false,'{"usage":"optional WhatsApp AI and transactional messaging"}'),
  ('lessonahead','omniqora.voice',false,false,'{"usage":"optional masked calling"}'),
  ('lessonahead','omniqora.intelligence-runtime',false,false,'{"usage":"optional governed Intelligence Plus"}')
on conflict(product_key,service_key) do update set
  default_enabled=excluded.default_enabled,required=excluded.required,metadata=excluded.metadata;

insert into public.billing_plan_catalogue(
  plan_key,product_key,name,currency,billing_interval,price_minor,trial_days,status,metadata
) values
  ('lessonahead.independent.monthly','lessonahead','Independent','GBP','monthly',599,60,'active','{"audience":"independent_instructor","commissionPercent":0}'),
  ('lessonahead.independent.annual','lessonahead','Independent annual','GBP','annual',5990,60,'active','{"audience":"independent_instructor","commissionPercent":0}'),
  ('lessonahead.school.monthly','lessonahead','School','GBP','monthly',1499,60,'active','{"audience":"driving_school","includedInstructors":3,"commissionPercent":0}'),
  ('lessonahead.school.annual','lessonahead','School annual','GBP','annual',14990,60,'active','{"audience":"driving_school","includedInstructors":3,"commissionPercent":0}')
on conflict(plan_key) do update set
  name=excluded.name,currency=excluded.currency,billing_interval=excluded.billing_interval,
  price_minor=excluded.price_minor,trial_days=excluded.trial_days,status=excluded.status,
  metadata=excluded.metadata,updated_at=now();

insert into public.billing_plan_services(plan_key,service_key,included,limits,config) values
  ('lessonahead.independent.monthly','lessonahead.core',true,'{}','{}'),
  ('lessonahead.independent.annual','lessonahead.core',true,'{}','{}'),
  ('lessonahead.school.monthly','lessonahead.core',true,'{"instructors":3}','{}'),
  ('lessonahead.school.annual','lessonahead.core',true,'{"instructors":3}','{}')
on conflict(plan_key,service_key) do update set included=excluded.included,limits=excluded.limits,config=excluded.config;

insert into public.billing_addon_catalogue(
  addon_key,product_key,service_key,name,currency,billing_interval,price_minor,included_limits,status,metadata
) values
  ('lessonahead.masked-calls','lessonahead','omniqora.voice','Masked calling','GBP','monthly',1499,'{"connectedMinutes":200}','active','{"overagePencePerMinute":6,"recording":false}'),
  ('lessonahead.whatsapp-ai','lessonahead','omniqora.connect','WhatsApp AI','GBP','monthly',0,'{}','draft','{"priceDecisionRequired":true,"defaultMode":"draft_only","humanOnlyIntents":["payment","refund","complaint","safety","verification","emergency","test_pass_prediction"]}'),
  ('lessonahead.intelligence-plus','lessonahead','omniqora.intelligence-runtime','Intelligence Plus','GBP','monthly',0,'{}','draft','{"priceDecisionRequired":true,"humanApprovalForWrites":true}')
on conflict(addon_key) do update set
  service_key=excluded.service_key,name=excluded.name,currency=excluded.currency,
  billing_interval=excluded.billing_interval,price_minor=excluded.price_minor,
  included_limits=excluded.included_limits,status=excluded.status,metadata=excluded.metadata,updated_at=now();

insert into public.billing_meter_rates(
  addon_key,service_key,metric_key,included_quantity,unit_size,unit_price_minor,currency,status
) select 'lessonahead.masked-calls','omniqora.voice','connected_call_minute',200,1,6,'GBP','active'
where not exists (
  select 1 from public.billing_meter_rates
  where addon_key='lessonahead.masked-calls' and metric_key='connected_call_minute' and status='active'
);

insert into public.ecosystem_addon_catalogue(
  addon_key,host_product_key,addon_service_key,name,category,description,integration_mode,data_boundary,capabilities,default_enabled,status,metadata
) values
  ('lessonahead.masked-calls','lessonahead','omniqora.voice','Masked calling','communications','Privacy-preserving forwarding and call attribution.','channel','Omniqora stores provider call references and aggregate duration; LessonAhead remains authoritative for instructor destinations and bookings.',array['masked_calls','call_attribution','usage_metering'],false,'active','{"recording":false}'),
  ('lessonahead.whatsapp-ai','lessonahead','omniqora.connect','WhatsApp AI','communications','Consent-aware WhatsApp inbox with governed AI drafting.','channel','Omniqora owns provider delivery; LessonAhead receives scoped thread references and consented message content only.',array['whatsapp','ai_drafts','approved_faq','human_handoff'],false,'preview','{"defaultMode":"draft_only"}'),
  ('lessonahead.intelligence-plus','lessonahead','omniqora.intelligence-runtime','Intelligence Plus','ai','Evidence-backed operational recommendations.','background_sync','LessonAhead sends minimal consented events and receives recommendations; learner progress, safety and verification decisions stay in LessonAhead.',array['recommendations','evidence','approval_queue','audit'],false,'preview','{"writesRequireApproval":true}')
on conflict(addon_key) do update set
  host_product_key=excluded.host_product_key,addon_service_key=excluded.addon_service_key,
  name=excluded.name,category=excluded.category,description=excluded.description,
  integration_mode=excluded.integration_mode,data_boundary=excluded.data_boundary,
  capabilities=excluded.capabilities,default_enabled=excluded.default_enabled,
  status=excluded.status,metadata=excluded.metadata,updated_at=now();

insert into public.tenant_blueprints(blueprint_key,name,description,country_code,category,status,metadata) values
  ('lessonahead-independent-gb','LessonAhead independent instructor','UK independent instructor with core marketplace and operations.','GB','driving-instruction','active','{"product":"lessonahead","plan":"lessonahead.independent.monthly"}'),
  ('lessonahead-school-gb','LessonAhead driving school','UK driving school with up to three instructors on the base plan.','GB','driving-instruction','active','{"product":"lessonahead","plan":"lessonahead.school.monthly"}')
on conflict(blueprint_key) do update set
  name=excluded.name,description=excluded.description,country_code=excluded.country_code,
  category=excluded.category,status=excluded.status,metadata=excluded.metadata;

insert into public.blueprint_products(blueprint_key,product_key,required,config) values
  ('lessonahead-independent-gb','lessonahead',true,'{"planKey":"lessonahead.independent.monthly"}'),
  ('lessonahead-school-gb','lessonahead',true,'{"planKey":"lessonahead.school.monthly"}')
on conflict(blueprint_key,product_key) do update set required=excluded.required,config=excluded.config;

insert into public.blueprint_services(blueprint_key,service_key,required,config) values
  ('lessonahead-independent-gb','lessonahead.core',true,'{}'),
  ('lessonahead-school-gb','lessonahead.core',true,'{}')
on conflict(blueprint_key,service_key) do update set required=excluded.required,config=excluded.config;

commit;
