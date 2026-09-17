-- VentaNexIA customer/contract audit tables
create table if not exists public.vnx_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_id text not null unique,
  version text not null,
  dpa_version text,
  subprocessor_version text,
  accepted_at timestamptz not null,
  signer text not null,
  company text not null,
  taxid text not null,
  email text not null,
  phone text,
  plan text not null,
  plan_name text not null,
  included jsonb not null default '[]'::jsonb,
  extras jsonb not null default '[]'::jsonb,
  total_monthly numeric(12,2) not null,
  minimum_term_months integer not null default 12,
  notice_days integer not null default 30,
  recurring_charge_authorized boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  status text not null default 'accepted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vnx_contracts_email_idx on public.vnx_contracts(lower(email));
create index if not exists vnx_contracts_stripe_customer_idx on public.vnx_contracts(stripe_customer_id);

create table if not exists public.vnx_customer_events (
  id uuid primary key default gen_random_uuid(),
  stripe_customer_id text,
  contract_id text,
  tenant_id uuid,
  event_type text not null,
  title text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vnx_customer_events_customer_idx on public.vnx_customer_events(stripe_customer_id,created_at desc);
create index if not exists vnx_customer_events_contract_idx on public.vnx_customer_events(contract_id,created_at desc);

-- These tables are server-side only. Do not expose them with permissive RLS policies.
alter table public.vnx_contracts enable row level security;
alter table public.vnx_customer_events enable row level security;
