create table if not exists vnx_whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  phone_number_id text not null unique,
  waba_id text,
  display_phone text,
  verified_name text,
  token_ciphertext text not null,
  token_iv text not null,
  token_tag text not null,
  reply_mode text not null default 'approval' check (reply_mode in ('approval','automatic')),
  billing_model text not null default 'customer_meta_account',
  billing_acknowledged boolean not null default false,
  webhook_ready boolean not null default false,
  last_webhook_at timestamptz,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vnx_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  phone_number_id text not null,
  wa_message_id text not null unique,
  direction text not null check (direction in ('inbound','outbound')),
  from_number text,
  to_number text,
  contact_name text,
  message_type text,
  body text,
  status text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists vnx_whatsapp_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vnx_tenants(id) on delete cascade,
  phone_number_id text not null,
  inbound_message_id text not null,
  customer_number text not null,
  customer_name text,
  inbound_text text,
  proposed_text text not null,
  requires_approval boolean not null default true,
  status text not null default 'pending' check (status in ('pending','sent','rejected','error')),
  error_text text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(phone_number_id,inbound_message_id)
);

alter table vnx_whatsapp_channels enable row level security;
alter table vnx_whatsapp_messages enable row level security;
alter table vnx_whatsapp_drafts enable row level security;

revoke all on vnx_whatsapp_channels from public, anon, authenticated;
revoke all on vnx_whatsapp_messages from public, anon, authenticated;
revoke all on vnx_whatsapp_drafts from public, anon, authenticated;

create index if not exists vnx_whatsapp_channels_tenant_idx on vnx_whatsapp_channels(tenant_id);
create index if not exists vnx_whatsapp_messages_tenant_time_idx on vnx_whatsapp_messages(tenant_id,created_at desc);
create index if not exists vnx_whatsapp_drafts_tenant_status_idx on vnx_whatsapp_drafts(tenant_id,status,created_at desc);
