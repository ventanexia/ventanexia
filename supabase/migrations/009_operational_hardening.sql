create table if not exists vnx_webhook_events (
  id bigserial primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  status text not null default 'processing' check(status in ('processing','processed','failed')),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider,event_id)
);

create table if not exists vnx_execution_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  action_type text not null,
  capability text not null default 'action',
  status text not null default 'approved'
    check(status in ('approval_required','approved','dispatched','completed','failed','cancelled')),
  idempotency_key text not null,
  context jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,idempotency_key)
);

create table if not exists vnx_usage_monthly (
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  month_start date not null,
  capability text not null,
  quantity numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,month_start,capability)
);

create table if not exists vnx_onboarding_profiles (
  tenant_id uuid primary key references vnx_tenants(id) on delete cascade,
  company_profile jsonb not null default '{}'::jsonb,
  brand_voice jsonb not null default '{}'::jsonb,
  knowledge_sources jsonb not null default '[]'::jsonb,
  desired_channels jsonb not null default '[]'::jsonb,
  commercial_rules jsonb not null default '{}'::jsonb,
  status text not null default 'started' check(status in ('started','needs_connections','ready_for_review','completed')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table vnx_webhook_events enable row level security;
alter table vnx_execution_requests enable row level security;
alter table vnx_usage_monthly enable row level security;
alter table vnx_onboarding_profiles enable row level security;

create index if not exists vnx_webhook_events_status_idx on vnx_webhook_events(provider,status,received_at desc);
create index if not exists vnx_execution_requests_tenant_idx on vnx_execution_requests(tenant_id,created_at desc);
create index if not exists vnx_usage_monthly_tenant_idx on vnx_usage_monthly(tenant_id,month_start desc);

create or replace function vnx_increment_usage(
  p_tenant uuid,
  p_capability text,
  p_quantity numeric default 1,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m date := date_trunc('month', now())::date;
begin
  insert into vnx_usage(tenant_id,capability,quantity,metadata)
  values(p_tenant,p_capability,p_quantity,coalesce(p_metadata,'{}'::jsonb));

  insert into vnx_usage_monthly(tenant_id,month_start,capability,quantity,updated_at)
  values(p_tenant,m,p_capability,p_quantity,now())
  on conflict(tenant_id,month_start,capability)
  do update set quantity=vnx_usage_monthly.quantity+excluded.quantity,updated_at=now();
end;
$$;

revoke all on function vnx_increment_usage(uuid,text,numeric,jsonb) from public;
revoke all on function vnx_increment_usage(uuid,text,numeric,jsonb) from anon;
revoke all on function vnx_increment_usage(uuid,text,numeric,jsonb) from authenticated;
grant execute on function vnx_increment_usage(uuid,text,numeric,jsonb) to service_role;
