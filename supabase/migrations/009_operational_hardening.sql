create table if not exists vnx_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  session_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vnx_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists vnx_auth_attempts (
  id bigint generated always as identity primary key,
  attempt_key text not null,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

alter table vnx_portal_sessions enable row level security;
alter table vnx_auth_attempts enable row level security;
alter table vnx_admin_sessions enable row level security;

create index if not exists vnx_portal_sessions_hash_idx on vnx_portal_sessions(session_hash);
create index if not exists vnx_admin_sessions_hash_idx on vnx_admin_sessions(session_hash);
create index if not exists vnx_auth_attempts_key_time_idx on vnx_auth_attempts(attempt_key,created_at desc);

create or replace function vnx_consume_portal_login_token(p_token_hash text)
returns setof vnx_portal_login_tokens
language sql
security invoker
as $$
  update vnx_portal_login_tokens
     set used_at=now()
   where id=(
     select id from vnx_portal_login_tokens
      where token_hash=p_token_hash
        and used_at is null
        and expires_at>now()
      order by created_at desc
      limit 1
      for update skip locked
   )
  returning *;
$$;

revoke all on function vnx_consume_portal_login_token(text) from public, anon, authenticated;
grant execute on function vnx_consume_portal_login_token(text) to service_role;
