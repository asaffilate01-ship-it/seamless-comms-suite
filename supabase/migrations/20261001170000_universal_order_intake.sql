-- Universal tenant-aware phone / WhatsApp / manual order intake.
create extension if not exists pgcrypto;

create table if not exists public.order_intake_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_key text not null,
  location_id uuid,
  channel text not null check (channel in ('voice','whatsapp','sms','manual')),
  provider text not null default 'twilio',
  address text not null,
  enabled boolean not null default true,
  routing jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, channel, address)
);

create table if not exists public.order_intake_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  product_key text not null,
  location_id uuid,
  channel text not null,
  provider text not null default 'twilio',
  provider_session_id text,
  customer_phone text,
  customer_name text,
  status text not null default 'open' check (status in ('open','draft','awaiting_payment','paid','submitted','cancelled','expired','failed')),
  order_draft jsonb not null default '{}'::jsonb,
  total_minor integer,
  currency text not null default 'GBP',
  target_order_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_intake_sessions_provider_idx
  on public.order_intake_sessions(provider, provider_session_id);
create index if not exists order_intake_sessions_tenant_status_idx
  on public.order_intake_sessions(tenant_id, status, created_at desc);

create table if not exists public.order_payment_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.order_intake_sessions(id) on delete cascade,
  tenant_id uuid not null,
  provider text not null,
  provider_reference text,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null default 'GBP',
  payment_url text,
  status text not null default 'pending' check (status in ('pending','sent','paid','expired','cancelled','failed')),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.order_intake_channels enable row level security;
alter table public.order_intake_sessions enable row level security;
alter table public.order_payment_requests enable row level security;

comment on table public.order_intake_channels is
'Maps Twilio/PSTN/WhatsApp addresses to an Omniqora tenant, product and optional location.';
comment on table public.order_intake_sessions is
'Channel-neutral order intake state before handoff to MealDeck, Dishbee or another product order API.';
