-- Additive Power BI pilot: existing tenant/entitlement authority remains canonical.
-- Provider tokens and PKCE verifiers are encrypted by the server, never client-readable.
begin;

create table public.bi_powerbi_connections (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation uuid not null,
  config_revision text not null check (config_revision ~ '^[0-9a-f]{64}$'),
  token_encrypted text check (length(token_encrypted) <= 100000),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  check ((token_encrypted is null) = (expires_at is null))
);
create table public.bi_powerbi_oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  generation uuid not null,
  config_revision text not null check (config_revision ~ '^[0-9a-f]{64}$'),
  run_id uuid not null,
  verifier_encrypted text not null check (length(verifier_encrypted) <= 2000),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index bi_powerbi_oauth_expiry on public.bi_powerbi_oauth_states(expires_at);
create table public.bi_powerbi_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('connect','discover','investigate')),
  status text not null default 'running' check (status in ('running','completed','failed')),
  model_key text,
  request_hash text,
  query_hash text,
  provider_request_id text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.bi_powerbi_oauth_states add constraint bi_powerbi_oauth_run_fk foreign key (run_id) references public.bi_powerbi_runs(id) on delete cascade;
create index bi_powerbi_runs_rate on public.bi_powerbi_runs(tenant_id,user_id,created_at desc);

alter table public.bi_powerbi_connections enable row level security;
alter table public.bi_powerbi_connections force row level security;
alter table public.bi_powerbi_oauth_states enable row level security;
alter table public.bi_powerbi_oauth_states force row level security;
alter table public.bi_powerbi_runs enable row level security;
alter table public.bi_powerbi_runs force row level security;
revoke all on public.bi_powerbi_connections, public.bi_powerbi_oauth_states, public.bi_powerbi_runs from public, anon, authenticated;
grant all on public.bi_powerbi_connections, public.bi_powerbi_oauth_states, public.bi_powerbi_runs to service_role;
grant select on public.bi_powerbi_runs to authenticated;
-- Deliberately no authenticated policies on tokens or OAuth states.
create policy bi_powerbi_runs_own_read on public.bi_powerbi_runs for select to authenticated using (
  user_id = auth.uid()
  and exists (select 1 from public.tenant_members m where m.tenant_id = bi_powerbi_runs.tenant_id and m.user_id = auth.uid())
  and public.has_tenant_entitlement(tenant_id, 'omniqora.bi')
);

-- Atomic multi-instance limit; do not rely on an in-memory per-process counter.
create function public.bi_powerbi_reserve_run(_tenant uuid, _user uuid, _action text, _model text default null, _request_hash text default null)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare run_id uuid;
begin
  if _action not in ('connect','discover','investigate') then raise exception 'BI_INVALID_ACTION'; end if;
  perform pg_advisory_xact_lock(hashtextextended(_tenant::text || ':' || _user::text, 0));
  if (select count(*) from public.bi_powerbi_runs where tenant_id = _tenant and user_id = _user and created_at > clock_timestamp() - interval '1 minute') >= 20 then
    raise exception 'BI_RATE_LIMITED';
  end if;
  insert into public.bi_powerbi_runs(tenant_id,user_id,action,model_key,request_hash)
    values(_tenant,_user,_action,_model,_request_hash) returning id into run_id;
  return run_id;
end $$;
revoke all on function public.bi_powerbi_reserve_run(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.bi_powerbi_reserve_run(uuid,uuid,text,text,text) to service_role;
comment on table public.bi_powerbi_runs is 'Metadata only: no access tokens, raw queries, metric values, documents or AI prompts.';
commit;
