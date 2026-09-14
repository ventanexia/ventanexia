create table if not exists vnx_trial_attempts (
  id bigserial primary key,
  solution_request_id uuid,
  email_hash text not null,
  domain_hash text,
  device_hash text,
  network_hash text,
  user_agent_hash text,
  decision text not null check (decision in ('allow','deny','review')),
  reason text,
  tenant_id uuid references vnx_tenants(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists vnx_trial_attempts_email_idx on vnx_trial_attempts(email_hash,created_at desc);
create index if not exists vnx_trial_attempts_device_idx on vnx_trial_attempts(device_hash,created_at desc);
create index if not exists vnx_trial_attempts_network_idx on vnx_trial_attempts(network_hash,created_at desc);
create index if not exists vnx_trial_attempts_domain_idx on vnx_trial_attempts(domain_hash,created_at desc);

alter table vnx_trial_attempts enable row level security;
