-- Additive Veyumo control plane. Access is exclusively through authenticated bridge functions.
create table public.veyumo_accounts(id uuid primary key default gen_random_uuid(),market text not null check(market in ('GB','DE')),created_at timestamptz not null default now());
create table public.veyumo_account_links(source text not null,subject text not null,account_id uuid not null references public.veyumo_accounts(id),role text not null default 'owner' check(role in ('owner','staff')),email text not null,entitlement jsonb not null default '{}',updated_at timestamptz not null default now(),primary key(source,subject));
create table public.veyumo_link_tokens(token_hash text primary key,account_id uuid not null references public.veyumo_accounts(id),kind text not null check(kind in ('link','invite')),email text,created_by text not null,expires_at timestamptz not null,used_at timestamptz,created_at timestamptz not null default now());
create table public.veyumo_offers(id uuid primary key default gen_random_uuid(),name text not null,description text not null,market text not null check(market in ('GB','DE')),currency text not null check(currency in ('GBP','EUR')),monthly_minor integer not null check(monthly_minor>=0),gigs_plan_id text not null,requires_subscription boolean not null default false,terms_url text not null,enabled boolean not null default false);
create table public.veyumo_gigs_users(account_id uuid not null references public.veyumo_accounts(id),subject_key text not null,gigs_user_id text not null unique,primary key(account_id,subject_key));
create table public.veyumo_subscriptions(id text primary key,account_id uuid not null references public.veyumo_accounts(id),gigs_user_id text not null,status text not null,plan_name text,phone_number text,updated_at timestamptz not null default now());
create table public.veyumo_inbox(source text not null,event_id text not null,payload jsonb not null,state text not null default 'pending' check(state in ('pending','processing','done','dead')),attempts int not null default 0,next_attempt_at timestamptz not null default now(),locked_at timestamptz,last_error text,created_at timestamptz not null default now(),primary key(source,event_id));
create table public.veyumo_outbox(id uuid primary key default gen_random_uuid(),destination text not null,event_id text not null,payload jsonb not null,state text not null default 'pending' check(state in ('pending','processing','done','dead')),attempts int not null default 0,next_attempt_at timestamptz not null default now(),locked_at timestamptz,last_error text,created_at timestamptz not null default now(),unique(destination,event_id));
create table public.veyumo_request_nonces(source text not null,nonce text not null,created_at timestamptz not null default now(),primary key(source,nonce));
create table public.veyumo_audit(id bigint generated always as identity primary key,account_id uuid,source text not null,subject text not null,action text not null,created_at timestamptz not null default now());
create index on public.veyumo_account_links(account_id);
create index on public.veyumo_subscriptions(account_id);
create index on public.veyumo_inbox(state,next_attempt_at);
create index on public.veyumo_outbox(state,next_attempt_at);
DO $$ declare t text; begin foreach t in array array['veyumo_accounts','veyumo_account_links','veyumo_link_tokens','veyumo_offers','veyumo_gigs_users','veyumo_subscriptions','veyumo_inbox','veyumo_outbox','veyumo_request_nonces','veyumo_audit'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
grant usage,select on sequence public.veyumo_audit_id_seq to service_role;
create function public.veyumo_create_account(p_source text,p_subject text,p_email text,p_market text) returns uuid language plpgsql security definer set search_path=public as $$ declare a uuid; begin
 perform pg_advisory_xact_lock(hashtextextended(p_source||':'||p_subject,0));
 select account_id into a from veyumo_account_links where source=p_source and subject=p_subject;
 if a is null then insert into veyumo_accounts(market) values(p_market) returning id into a;insert into veyumo_account_links(source,subject,email,account_id)values(p_source,p_subject,p_email,a);end if;return a;end $$;
create function public.veyumo_claim_token(p_hash text,p_kind text,p_source text,p_subject text,p_email text,p_market text) returns uuid language plpgsql security definer set search_path=public as $$ declare t veyumo_link_tokens;begin
 perform pg_advisory_xact_lock(hashtextextended(p_source||':'||p_subject,0));
 select * into t from veyumo_link_tokens where token_hash=p_hash and kind=p_kind and used_at is null and expires_at>now() for update;
 if not found or (t.kind='invite' and lower(t.email)<>lower(p_email)) then raise exception 'invalid_or_expired_token';end if;
 if not exists(select 1 from veyumo_accounts where id=t.account_id and market=p_market)then raise exception 'market_mismatch';end if;
 if exists(select 1 from veyumo_account_links where source=p_source and subject=p_subject) then raise exception 'account_already_linked';end if;
 insert into veyumo_account_links(source,subject,email,account_id,role) values(p_source,p_subject,p_email,t.account_id,case when t.kind='invite' then 'staff' else 'owner' end);
 update veyumo_link_tokens set used_at=now() where token_hash=p_hash;return t.account_id;end $$;
create function public.veyumo_claim_jobs(p_queue text,p_limit int default 20) returns setof jsonb language plpgsql security definer set search_path=public as $$ begin
 if p_queue='inbox' then return query with jobs as(select source,event_id from veyumo_inbox where (state='pending' and next_attempt_at<=now())or(state='processing'and locked_at<now()-interval '5 minutes') order by created_at limit least(greatest(p_limit,1),50)for update skip locked)update veyumo_inbox t set state='processing',attempts=t.attempts+1,locked_at=now()from jobs j where t.source=j.source and t.event_id=j.event_id returning to_jsonb(t);
 elsif p_queue='outbox' then return query with jobs as(select id from veyumo_outbox where(state='pending'and next_attempt_at<=now())or(state='processing'and locked_at<now()-interval '5 minutes') order by created_at limit least(greatest(p_limit,1),50)for update skip locked)update veyumo_outbox t set state='processing',attempts=t.attempts+1,locked_at=now()from jobs j where t.id=j.id returning to_jsonb(t);
 else raise exception 'invalid_queue';end if;end $$;
revoke all on function public.veyumo_create_account(text,text,text,text),public.veyumo_claim_token(text,text,text,text,text,text),public.veyumo_claim_jobs(text,int) from public,anon,authenticated;
grant execute on function public.veyumo_create_account(text,text,text,text),public.veyumo_claim_token(text,text,text,text,text,text),public.veyumo_claim_jobs(text,int) to service_role;
-- Prevent duplicate provider-user creation when checkout requests overlap or a request times out.
create table public.veyumo_provider_provisioning(account_id uuid primary key references public.veyumo_accounts(id),created_at timestamptz not null default now());
alter table public.veyumo_provider_provisioning enable row level security;
revoke all on public.veyumo_provider_provisioning from anon,authenticated;
grant all on public.veyumo_provider_provisioning to service_role;

-- A slower earlier provider read must not overwrite a later snapshot.
create function public.veyumo_store_subscription(p_id text,p_account uuid,p_user text,p_status text,p_plan text,p_phone text,p_observed_at timestamptz) returns void language sql security definer set search_path=public as $$
 insert into veyumo_subscriptions(id,account_id,gigs_user_id,status,plan_name,phone_number,updated_at)
 values(p_id,p_account,p_user,p_status,p_plan,p_phone,p_observed_at)
 on conflict(id) do update set status=excluded.status,plan_name=excluded.plan_name,phone_number=excluded.phone_number,updated_at=excluded.updated_at
 where veyumo_subscriptions.account_id=excluded.account_id and veyumo_subscriptions.gigs_user_id=excluded.gigs_user_id and veyumo_subscriptions.updated_at<excluded.updated_at;
$$;
revoke all on function public.veyumo_store_subscription(text,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.veyumo_store_subscription(text,uuid,text,text,text,text,timestamptz) to service_role;
