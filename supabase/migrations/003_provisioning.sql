create table if not exists vnx_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  provider text not null,
  purpose text not null,
  status text not null default 'required'
    check (status in ('required','authorization_needed','connected','testing','ready','failed','revoked')),
  external_account_id text,
  scopes jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, provider, purpose)
);

create table if not exists vnx_installations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  install_type text not null,
  target text,
  status text not null default 'planned'
    check (status in ('planned','waiting_authorization','ready','installing','testing','approval_required','active','failed','rolled_back')),
  manifest jsonb not null default '{}'::jsonb,
  rollback_manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vnx_connections enable row level security;
alter table vnx_installations enable row level security;

create index if not exists vnx_connections_tenant_idx on vnx_connections(tenant_id);
create index if not exists vnx_installations_tenant_idx on vnx_installations(tenant_id);
