create table if not exists vnx_social_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references vnx_tenants(id) on delete cascade,
  brand_name text not null,
  brand_voice jsonb not null default '{}'::jsonb,
  audiences jsonb not null default '[]'::jsonb,
  pillars jsonb not null default '[]'::jsonb,
  forbidden_topics jsonb not null default '[]'::jsonb,
  claims_policy jsonb not null default '{}'::jsonb,
  default_approval_mode text not null default 'approval_required'
    check(default_approval_mode in ('autonomous','approval_required','draft_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vnx_social_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  provider text not null check(provider in ('linkedin','instagram','facebook','tiktok','x','metricool','other')),
  external_account_id text,
  display_name text,
  status text not null default 'authorization_needed'
    check(status in ('authorization_needed','connected','testing','ready','revoked','failed')),
  capabilities jsonb not null default '[]'::jsonb,
  connection_ref text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,provider,external_account_id)
);

create table if not exists vnx_social_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  name text not null,
  objective text,
  start_date date,
  end_date date,
  channels jsonb not null default '[]'::jsonb,
  cadence jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check(status in ('draft','approval_required','active','paused','completed')),
  strategy jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vnx_social_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  campaign_id uuid references vnx_social_campaigns(id) on delete set null,
  channel text not null,
  post_type text not null default 'text',
  topic text,
  copy text not null,
  media_refs jsonb not null default '[]'::jsonb,
  hashtags jsonb not null default '[]'::jsonb,
  utm jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  approval_mode text not null default 'approval_required'
    check(approval_mode in ('autonomous','approval_required','draft_only')),
  status text not null default 'draft'
    check(status in ('draft','approval_required','approved','scheduled','publishing','published','failed','cancelled')),
  external_post_id text,
  external_url text,
  publish_error text,
  performance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vnx_social_profiles enable row level security;
alter table vnx_social_accounts enable row level security;
alter table vnx_social_campaigns enable row level security;
alter table vnx_social_posts enable row level security;

create index if not exists vnx_social_posts_schedule_idx on vnx_social_posts(status,scheduled_for);
create index if not exists vnx_social_posts_tenant_idx on vnx_social_posts(tenant_id,created_at desc);
