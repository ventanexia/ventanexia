create table if not exists vnx_solution_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null,
  email text not null,
  role text,
  request_text text not null,
  current_tools text,
  monthly_leads text,
  fit_score integer not null default 0 check (fit_score between 0 and 100),
  blueprint jsonb not null default '{}'::jsonb,
  status text not null default 'new'
    check (status in ('new','blueprint_ready','diagnostic','proposal','accepted','provisioning','active','rejected')),
  consent boolean not null default false,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table vnx_solution_requests enable row level security;
-- No public policies. Website writes through the server-side service role only.
create index if not exists vnx_solution_requests_email_idx on vnx_solution_requests (lower(email));
create index if not exists vnx_solution_requests_status_idx on vnx_solution_requests (status);
