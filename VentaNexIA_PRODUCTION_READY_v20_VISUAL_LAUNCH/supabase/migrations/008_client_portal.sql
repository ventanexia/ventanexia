create table if not exists vnx_portal_login_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  email_hash text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vnx_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  requested_by text,
  request_text text not null,
  category text,
  priority text not null default 'normal'
    check(priority in ('low','normal','high','urgent')),
  status text not null default 'new'
    check(status in ('new','analyzing','blueprint_ready','approval_required','queued','implementing','testing','completed','rejected')),
  blueprint jsonb not null default '{}'::jsonb,
  plan_impact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vnx_portal_login_tokens enable row level security;
alter table vnx_change_requests enable row level security;

create index if not exists vnx_portal_login_token_hash_idx on vnx_portal_login_tokens(token_hash);
create index if not exists vnx_change_requests_tenant_idx on vnx_change_requests(tenant_id,created_at desc);
