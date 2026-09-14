create extension if not exists pgcrypto;

create table if not exists vnx_tenants (
  id uuid primary key default gen_random_uuid(),
  public_key text unique not null default ('vnx_' || encode(gen_random_bytes(12),'hex')),
  name text not null,
  domain text,
  status text not null default 'draft' check (status in ('draft','provisioning','active','paused','offboarded')),
  autonomy_level text not null default 'execute_within_policy'
    check (autonomy_level in ('observe','recommend','prepare','execute_within_policy','full_after_approval')),
  crm_provider text,
  calendar_provider text,
  email_provider text,
  social_channels jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vnx_agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  agent_key text not null,
  name text not null,
  mode text not null,
  enabled boolean not null default true,
  policy jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(tenant_id, agent_key)
);

create table if not exists vnx_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references vnx_tenants(id) on delete cascade,
  agent_key text not null,
  action_type text not null,
  title text not null,
  rationale text,
  payload jsonb not null default '{}'::jsonb,
  risk text not null default 'medium' check (risk in ('low','medium','high','critical')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','executed','failed','expired')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  executed_at timestamptz,
  decision_note text
);

create table if not exists vnx_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references vnx_tenants(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued','running','waiting_approval','done','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vnx_events (
  id bigserial primary key,
  tenant_id uuid references vnx_tenants(id) on delete cascade,
  correlation_id uuid,
  actor text not null,
  channel text,
  object_type text,
  object_id text,
  action text not null,
  outcome text,
  confidence numeric,
  policy text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists vnx_client_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  name text,
  email text,
  phone text,
  company text,
  message text,
  source_url text,
  consent boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table vnx_tenants enable row level security;
alter table vnx_agents enable row level security;
alter table vnx_approvals enable row level security;
alter table vnx_jobs enable row level security;
alter table vnx_events enable row level security;
alter table vnx_client_leads enable row level security;

-- No anon/authenticated policies are intentionally created.
-- Server operations use the Supabase service-role key only.
