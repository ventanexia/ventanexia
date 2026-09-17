alter table vnx_tenants add column if not exists customer_code text;
alter table vnx_tenants add column if not exists desktop_activation_hash text;
alter table vnx_tenants add column if not exists device_limit_override integer;
alter table vnx_tenants add column if not exists extra_device_count integer not null default 0;
alter table vnx_tenants add column if not exists device_addon_price_cents integer not null default 4900;

create unique index if not exists vnx_tenants_customer_code_uidx
  on vnx_tenants(customer_code)
  where customer_code is not null;

create table if not exists vnx_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  device_key text not null,
  fingerprint_hash text,
  device_name text,
  platform text,
  app_version text,
  status text not null default 'active' check (status in ('active','revoked')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(tenant_id,device_key)
);

alter table vnx_devices enable row level security;
create index if not exists vnx_devices_tenant_status_idx on vnx_devices(tenant_id,status);
create index if not exists vnx_devices_last_seen_idx on vnx_devices(last_seen_at desc);

revoke all on vnx_devices from public, anon, authenticated;
