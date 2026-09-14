create table if not exists vnx_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  module_key text not null,
  name text not null,
  version text not null default '1.0',
  status text not null default 'draft'
    check (status in ('draft','testing','approval_required','active','paused','failed','retired')),
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,module_key)
);

create table if not exists vnx_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  policy_key text not null,
  effect text not null check(effect in ('allow','prepare','approval_required','deny')),
  conditions jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,policy_key)
);

create table if not exists vnx_secret_refs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  provider text not null,
  secret_ref text not null,
  purpose text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(tenant_id,provider,purpose)
);

create table if not exists vnx_executor_registry (
  id uuid primary key default gen_random_uuid(),
  executor_key text unique not null,
  provider text not null,
  capabilities jsonb not null default '[]'::jsonb,
  status text not null default 'available',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table vnx_modules enable row level security;
alter table vnx_policies enable row level security;
alter table vnx_secret_refs enable row level security;
alter table vnx_executor_registry enable row level security;
