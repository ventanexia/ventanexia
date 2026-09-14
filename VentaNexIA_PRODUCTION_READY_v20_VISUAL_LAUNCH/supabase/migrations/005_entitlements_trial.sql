alter table vnx_tenants drop constraint if exists vnx_tenants_status_check;
alter table vnx_tenants add constraint vnx_tenants_status_check
  check (status in ('draft','trial','provisioning','active','suspended','paused','offboarded'));

create table if not exists vnx_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references vnx_tenants(id) on delete cascade,
  state text not null default 'trial'
    check (state in ('trial','active','suspended','cancelled')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  paid_started_at timestamptz,
  suspended_at timestamptz,
  suspend_reason text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_last_invoice_id text,
  plan_key text not null default 'core',
  feature_policy jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists vnx_usage (
  id bigserial primary key,
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  capability text not null,
  quantity numeric not null default 1,
  unit text not null default 'action',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table vnx_entitlements enable row level security;
alter table vnx_usage enable row level security;

create index if not exists vnx_entitlements_state_idx on vnx_entitlements(state);
create index if not exists vnx_entitlements_trial_end_idx on vnx_entitlements(trial_ends_at);
create index if not exists vnx_usage_tenant_created_idx on vnx_usage(tenant_id,created_at);

create or replace function vnx_trial_is_valid(end_at timestamptz)
returns boolean language sql stable as $$
  select end_at is not null and now() < end_at
$$;
