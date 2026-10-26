begin;
create table public.criclume_worker_leases (
 admission_id uuid primary key references public.criclume_ai_budgeted_admissions(id),tenant_id uuid not null references public.tenants(id),worker_ref uuid not null,
 state text not null check(state in ('processing','settled','reconciliation_required')),provider_key text not null,provider_receipt_id text,receipt jsonb,
 claimed_at timestamptz not null default now(),finished_at timestamptz,unique(provider_key,provider_receipt_id)
);
alter table public.criclume_worker_leases enable row level security;
revoke all on public.criclume_worker_leases from public,anon,authenticated;
grant all on public.criclume_worker_leases to service_role;
create function public.claim_criclume_worker_job(_tenant uuid,_worker uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a record;
begin
 if _tenant is null or _worker is null then raise exception 'Worker scope required'; end if;
 if not public.has_tenant_entitlement(_tenant,'omniqora.intelligence-runtime') then raise exception 'Entitlement inactive'; end if;
 select x.*,j.input as job_input into a from public.criclume_ai_budgeted_admissions x
 join public.intelligence_jobs j on j.id=x.job_id and j.tenant_id=x.tenant_id and j.product_key='criclume'
 join public.ai_agent_runs r on r.id=x.run_id and r.tenant_id=x.tenant_id and r.product_key='criclume'
 join public.ai_budgeted_run_reservations b on b.id=x.reservation_id and b.run_id=x.run_id and b.tenant_id=x.tenant_id and b.product_key='criclume'
 join public.criclume_ai_pilot_controls p on p.tenant_id=x.tenant_id
 join public.criclume_ai_source_bindings s on s.tenant_id=x.tenant_id and s.source_organisation_id=x.source_organisation_id and s.credential_id=x.service_credential_id
 join public.platform_service_credentials c on c.id=x.service_credential_id
 join public.ai_use_cases u on u.id=x.use_case_id and u.tenant_id=x.tenant_id and u.product_key='criclume'
 where x.tenant_id=_tenant and x.status='queued' and j.status='queued' and j.attempts=0 and j.job_type='criclume.budgeted.readonly' and r.status='queued' and b.status='reserved'
 and p.enabled and p.worker_ready and p.expires_at>now() and s.enabled and s.expires_at>now()
 and c.status='active' and (c.expires_at is null or c.expires_at>now())
 and exists(select 1 from jsonb_array_elements(c.scopes::jsonb) z(v) where z.v->>'tenantId'=_tenant::text and z.v->>'productKey'='criclume' and z.v->'capabilities' ? 'intelligence.run.budgeted' and coalesce(jsonb_array_length(z.v->'brandIds'),0)=0 and coalesce(jsonb_array_length(z.v->'locationIds'),0)=0)
 and u.status in ('approved','pilot') and u.approved_by is not null and u.owner_user_id is distinct from u.approved_by and cardinality(u.allowed_tools)=1 and 'criclume.matches.aggregate.read'=any(u.allowed_tools)
 and exists(select 1 from public.tenant_products tp where tp.tenant_id=_tenant and tp.product_key='criclume' and tp.status='active')
 and exists(select 1 from public.provider_bindings pb where pb.tenant_id=_tenant and pb.product_key='criclume' and pb.provider_key=x.provider_key and pb.status='active' and pb.environment='production' and pb.last_verified_at between now()-interval '24 hours' and now())
 and exists(select 1 from public.ai_reviewed_model_rates rate join public.tenants t on t.id=_tenant where rate.provider_key=x.provider_key and rate.model_key=x.model_key and rate.rate_version=x.rate_version and rate.currency=x.currency and rate.status='approved' and rate.evaluation_passed and t.country_code=any(rate.supported_regions) and rate.verified_at between now()-interval '30 days' and now())
 and x.admitted_at>=now()-interval '30 minutes' and j.next_attempt_at<=now()
 order by x.admitted_at limit 1 for update of x,j,r,b skip locked;
 if not found then return null; end if;
 insert into public.criclume_worker_leases(admission_id,tenant_id,worker_ref,state,provider_key) values(a.id,_tenant,_worker,'processing',a.provider_key);
 update public.criclume_ai_budgeted_admissions set status='processing',updated_at=now() where id=a.id;
 update public.intelligence_jobs set status='processing',attempts=1,worker_key_id=_worker::text,locked_at=now(),started_at=now(),updated_at=now() where id=a.job_id;
 update public.ai_agent_runs set status='running',updated_at=now() where id=a.run_id;
 return jsonb_build_object('admissionId',a.id,'tenantId',_tenant,'productKey','criclume','runId',a.run_id,'providerKey',a.provider_key,'modelKey',a.model_key,'snapshot',a.source_snapshot,'sourceHash',a.snapshot_hash,'task',a.task,'maxInputTokens',a.job_input->'maxInputTokens','maxOutputTokens',a.job_input->'maxOutputTokens','reservedMinor',a.reserved_minor,'currency',a.currency,'humanReviewRequired',true,'tools','[]'::jsonb);
end $$;
create function public.finish_criclume_worker_job(_tenant uuid,_admission uuid,_worker uuid,_receipt jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.criclume_ai_budgeted_admissions; l public.criclume_worker_leases; j public.intelligence_jobs; rate public.ai_reviewed_model_rates;
 input_count bigint; output_count bigint; cached_count bigint; actual_minor bigint; receipt_ref text; settlement jsonb;
begin
 select * into strict a from public.criclume_ai_budgeted_admissions where id=_admission and tenant_id=_tenant for update;
 select * into strict l from public.criclume_worker_leases where admission_id=a.id and tenant_id=_tenant for update;
 if l.worker_ref is distinct from _worker then raise exception 'Worker lease mismatch'; end if;
 if l.state='settled' and l.receipt=_receipt then return jsonb_build_object('status','waiting_review','reused',true); end if;
 select * into strict j from public.intelligence_jobs where id=a.job_id and tenant_id=_tenant and product_key='criclume' for update;
 if a.status<>'processing' or l.state not in ('processing','reconciliation_required') or j.worker_key_id is distinct from _worker::text then raise exception 'Worker job state invalid'; end if;
 if _receipt is null or jsonb_typeof(_receipt)<>'object' or length(_receipt::text)>10000 or _receipt->>'providerKey' is distinct from a.provider_key or _receipt->>'modelKey' is distinct from a.model_key or _receipt->>'sourceHash' is distinct from a.snapshot_hash or _receipt->>'modelCalls' is distinct from '1' or _receipt->>'toolCalls' is distinct from '0' or _receipt->>'humanReviewRequired' is distinct from 'true' or jsonb_typeof(_receipt->'summary') is distinct from 'string' or length(btrim(_receipt->>'summary')) not between 20 and 5000 then raise exception 'Invalid metered cricket receipt'; end if;
 receipt_ref:=_receipt->>'providerReceiptId';
 if receipt_ref is null or receipt_ref !~ '^[A-Za-z0-9_-]{8,180}$' or coalesce(_receipt->>'inputTokens','') !~ '^[0-9]{1,6}$' or coalesce(_receipt->>'outputTokens','') !~ '^[0-9]{1,6}$' or coalesce(_receipt->>'cachedInputTokens','0') !~ '^[0-9]{1,6}$' then raise exception 'Provider usage missing'; end if;
 input_count:=(_receipt->>'inputTokens')::bigint;output_count:=(_receipt->>'outputTokens')::bigint;cached_count:=coalesce(_receipt->>'cachedInputTokens','0')::bigint;
 if cached_count not between 0 and input_count or input_count not between 1 and (j.input->>'maxInputTokens')::integer or output_count not between 1 and (j.input->>'maxOutputTokens')::integer then raise exception 'Token ceiling exceeded'; end if;
 select * into strict rate from public.ai_reviewed_model_rates where provider_key=a.provider_key and model_key=a.model_key and rate_version=a.rate_version and currency=a.currency;
 actual_minor:=ceil(((input_count-cached_count)::numeric*rate.input_minor_per_million+cached_count::numeric*coalesce(rate.cached_input_minor_per_million,rate.input_minor_per_million))/1000000)::bigint+ceil(output_count::numeric*rate.output_minor_per_million/1000000)::bigint;
 if actual_minor>a.reserved_minor then raise exception 'Reservation exceeded'; end if;
 settlement:=public.settle_budgeted_ai_agent(a.run_id,actual_minor,a.provider_key||':'||receipt_ref);
 if settlement->>'status' is distinct from 'settled' then raise exception 'Settlement failed'; end if;
 update public.criclume_worker_leases set state='settled',provider_receipt_id=receipt_ref,receipt=_receipt,finished_at=now() where admission_id=a.id;
 update public.criclume_ai_budgeted_admissions set status='waiting_review',updated_at=now() where id=a.id;
 update public.ai_agent_runs set status='waiting_review',result=jsonb_build_object('summary',_receipt->>'summary','humanReviewRequired',true,'sourceHash',a.snapshot_hash,'meteredCostMinor',actual_minor),token_usage=jsonb_build_object('inputTokens',input_count,'outputTokens',output_count),updated_at=now() where id=a.run_id;
 update public.intelligence_jobs set status='waiting_review',locked_at=null,updated_at=now() where id=a.job_id;
 return jsonb_build_object('status','waiting_review','reused',false,'meteredCostMinor',actual_minor,'currency',a.currency);
end $$;
create function public.flag_criclume_worker_reconciliation(_tenant uuid,_admission uuid,_worker uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.criclume_ai_budgeted_admissions;
begin
 select * into strict a from public.criclume_ai_budgeted_admissions where id=_admission and tenant_id=_tenant for update;
 update public.criclume_worker_leases set state='reconciliation_required' where admission_id=a.id and tenant_id=_tenant and worker_ref=_worker and state='processing';
 if not found then raise exception 'Worker lease unavailable'; end if;
 update public.intelligence_jobs set status='waiting_review',last_error='Provider outcome requires receipt reconciliation',updated_at=now() where id=a.job_id and tenant_id=_tenant and worker_key_id=_worker::text;
 return jsonb_build_object('status','reconciliation_required','reservationHeld',true);
end $$;
revoke all on function public.claim_criclume_worker_job(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finish_criclume_worker_job(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.flag_criclume_worker_reconciliation(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_criclume_worker_job(uuid,uuid) to service_role;
grant execute on function public.finish_criclume_worker_job(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.flag_criclume_worker_reconciliation(uuid,uuid,uuid) to service_role;
commit;
