-- Reproduce y endurece el sistema de licencia/contadores que ya usa VentaNexIA en producción.
-- Alineado con los planes actuales 99/249/499, demo completa de 15 días y servicios de coste variable por créditos.
create table if not exists public.vnx_metered_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vnx_tenants(id) on delete cascade,
  device_id uuid references public.vnx_devices(id) on delete set null,
  meter_key text not null,
  quantity integer not null check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists vnx_metered_usage_tenant_meter_created_idx on public.vnx_metered_usage(tenant_id,meter_key,created_at desc);

create table if not exists public.vnx_usage_wallets (
  tenant_id uuid not null references public.vnx_tenants(id) on delete cascade,
  meter_key text not null,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id,meter_key)
);

create table if not exists public.vnx_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vnx_tenants(id) on delete cascade,
  meter_key text not null,
  pack_key text not null,
  quantity integer not null check (quantity > 0),
  amount_cents integer not null default 0 check (amount_cents >= 0),
  stripe_session_id text unique,
  created_at timestamptz not null default now()
);
create index if not exists vnx_credit_purchases_tenant_created_idx on public.vnx_credit_purchases(tenant_id,created_at desc);

create table if not exists public.vnx_video_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.vnx_tenants(id) on delete cascade,
  device_id uuid references public.vnx_devices(id) on delete set null,
  credits_used integer not null check (credits_used > 0),
  duration_seconds integer not null check (duration_seconds between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists vnx_video_usage_tenant_created_idx on public.vnx_video_usage(tenant_id,created_at desc);

alter table public.vnx_metered_usage enable row level security;
alter table public.vnx_usage_wallets enable row level security;
alter table public.vnx_credit_purchases enable row level security;
alter table public.vnx_video_usage enable row level security;
revoke all on public.vnx_metered_usage from public,anon,authenticated;
revoke all on public.vnx_usage_wallets from public,anon,authenticated;
revoke all on public.vnx_credit_purchases from public,anon,authenticated;
revoke all on public.vnx_video_usage from public,anon,authenticated;

create or replace function public.vnx_feature_enabled(p_plan text,p_policy jsonb,p_feature text)
returns boolean language plpgsql immutable set search_path to public,extensions as $$
begin
  if p_feature is null then return true; end if;
  if lower(coalesce(p_plan,'')) in ('start','inicio','core','growth','crecimiento','scale','empresa','enterprise','premium','master') then return true; end if;
  return coalesce(p_policy->'purchased_included','[]'::jsonb) ? p_feature
      or coalesce(p_policy->'purchased_extras','[]'::jsonb) ? p_feature;
end;
$$;

create or replace function public.vnx_meter_required_feature(p_meter text)
returns text language sql immutable set search_path to public,extensions as $$
select case p_meter
  when 'image_credits' then 'redes' when 'voice_minutes' then 'voz' when 'whatsapp_messages' then 'whatsapp'
  when 'lead_credits' then 'buscador' when 'email_ai_actions' then 'email' when 'automation_runs' then 'automatizacion'
  when 'seo_pages' then 'seo' when 'report_generations' then 'informes' else null end
$$;

create or replace function public.vnx_meter_limit(p_plan text,p_meter text)
returns integer language sql immutable set search_path to public,extensions as $$
select case lower(coalesce(p_plan,'start'))
  when 'start' then case p_meter
    when 'image_credits' then 0 when 'voice_minutes' then 0 when 'whatsapp_messages' then 0
    when 'lead_credits' then 50 when 'lead_search' then 50 when 'order_extractions' then 100 when 'ai_heavy_tasks' then 150 when 'email_ai_actions' then 1500
    when 'automation_runs' then 500 when 'seo_pages' then 100 when 'report_generations' then 30 when 'storage_mb' then 5120 else 0 end
  when 'inicio' then public.vnx_meter_limit('start',p_meter)
  when 'core' then case p_meter
    when 'image_credits' then 0 when 'voice_minutes' then 0 when 'whatsapp_messages' then 0
    when 'lead_credits' then 250 when 'lead_search' then 250 when 'order_extractions' then 500 when 'ai_heavy_tasks' then 600 when 'email_ai_actions' then 5000
    when 'automation_runs' then 2500 when 'seo_pages' then 500 when 'report_generations' then 100 when 'storage_mb' then 20480 else 0 end
  when 'growth' then public.vnx_meter_limit('core',p_meter)
  when 'crecimiento' then public.vnx_meter_limit('core',p_meter)
  when 'scale' then case p_meter
    when 'image_credits' then 0 when 'voice_minutes' then 0 when 'whatsapp_messages' then 0
    when 'lead_credits' then 700 when 'lead_search' then 700 when 'order_extractions' then 2000 when 'ai_heavy_tasks' then 1500 when 'email_ai_actions' then 12000
    when 'automation_runs' then 7000 when 'seo_pages' then 1500 when 'report_generations' then 250 when 'storage_mb' then 51200 else 0 end
  when 'empresa' then public.vnx_meter_limit('scale',p_meter)
  when 'enterprise' then public.vnx_meter_limit('scale',p_meter)
  when 'premium' then public.vnx_meter_limit('scale',p_meter)
  when 'master' then 100000000 else 0 end
$$;

create or replace function public.vnx_trial_meter_limit(p_meter text)
returns integer language sql immutable set search_path to public,extensions as $$
select case p_meter
  when 'image_credits' then 0 when 'voice_minutes' then 0 when 'whatsapp_messages' then 0
  when 'lead_credits' then 25 when 'lead_search' then 25 when 'order_extractions' then 25 when 'ai_heavy_tasks' then 25 when 'email_ai_actions' then 100
  when 'automation_runs' then 100 when 'seo_pages' then 20 when 'report_generations' then 20
  when 'storage_mb' then 1024 else 0 end
$$;

create or replace function public.vnx_wallet_balance(p_tenant uuid,p_meter text)
returns integer language sql stable set search_path to public,extensions as $$
select coalesce((select balance from public.vnx_usage_wallets where tenant_id=p_tenant and meter_key=p_meter),0)
$$;

create or replace function public.vnx_device_status_public(p_customer_code text,p_activation_code text,p_device_key text)
returns jsonb language plpgsql security definer set search_path to public,extensions as $$
declare
  t public.vnx_tenants%rowtype; e public.vnx_entitlements%rowtype; d public.vnx_devices%rowtype;
  v_active int; v_base int; v_limit int; v_hash text; v_valid boolean:=false;
begin
  select * into t from public.vnx_tenants where upper(customer_code)=upper(trim(p_customer_code)) limit 1;
  if t.id is null then return jsonb_build_object('ok',false,'code','CUSTOMER_NOT_FOUND','message','ID de cliente no válido'); end if;
  v_hash:=encode(digest(trim(p_activation_code),'sha256'),'hex');
  if t.desktop_activation_hash is null or t.desktop_activation_hash<>v_hash then return jsonb_build_object('ok',false,'code','ACTIVATION_INVALID','message','Código de activación no válido'); end if;
  select * into e from public.vnx_entitlements where tenant_id=t.id limit 1;
  if e.id is not null then v_valid:=e.state='active' or (e.state='trial' and e.trial_ends_at is not null and now()<e.trial_ends_at); end if;
  if not v_valid then return jsonb_build_object('ok',false,'code','LICENSE_NOT_ACTIVE','message','La licencia no está activa'); end if;
  select * into d from public.vnx_devices where tenant_id=t.id and device_key=trim(p_device_key) limit 1;
  if d.id is null or d.status<>'active' then return jsonb_build_object('ok',false,'code','DEVICE_NOT_ACTIVE','message','Este dispositivo no está activo'); end if;
  update public.vnx_devices set last_seen_at=now() where id=d.id;
  select count(*) into v_active from public.vnx_devices where tenant_id=t.id and status='active';
  if e.state='trial' then v_base:=1;
  else
    v_base:=case lower(coalesce(e.plan_key,'start'))
      when 'core' then 3 when 'growth' then 3 when 'crecimiento' then 3
      when 'scale' then 5 when 'enterprise' then 5 when 'empresa' then 5 when 'premium' then 5
      when 'master' then 50 else 1 end;
  end if;
  if coalesce(t.device_limit_override,0)>0 then v_base:=t.device_limit_override; end if;
  v_limit:=v_base+greatest(0,coalesce(t.extra_device_count,0));
  return jsonb_build_object('ok',true,'customerId',t.customer_code,'deviceId',d.id,'planKey',e.plan_key,'state',e.state,'trialEndsAt',e.trial_ends_at,
    'featurePolicy',coalesce(e.feature_policy,'{}'::jsonb),'baseLimit',v_base,'extraDeviceCount',greatest(0,coalesce(t.extra_device_count,0)),
    'limit',v_limit,'activeCount',v_active,'available',greatest(0,v_limit-v_active),'extraDeviceMonthlyEur',coalesce(t.device_addon_price_cents,4900)/100.0);
end;
$$;

create or replace function public.vnx_meter_status(p_customer_code text,p_meter text)
returns jsonb language plpgsql security definer set search_path to public,extensions as $$
declare
  t public.vnx_tenants%rowtype; e public.vnx_entitlements%rowtype;
  base_limit int:=0; recurring_extra int:=0; month_used int:=0; wallet int:=0; base_remaining int:=0;
  required_feature text; valid_state boolean:=false;
begin
  select * into t from public.vnx_tenants where upper(customer_code)=upper(trim(p_customer_code)) limit 1;
  if t.id is null then return jsonb_build_object('ok',false,'code','CUSTOMER_NOT_FOUND'); end if;
  select * into e from public.vnx_entitlements where tenant_id=t.id limit 1;
  if e.id is not null then valid_state:=e.state='active' or (e.state='trial' and e.trial_ends_at is not null and now()<e.trial_ends_at); end if;
  if not valid_state then return jsonb_build_object('ok',false,'code','LICENSE_NOT_ACTIVE'); end if;
  required_feature:=public.vnx_meter_required_feature(p_meter);
  if not public.vnx_feature_enabled(e.plan_key,coalesce(e.feature_policy,'{}'::jsonb),required_feature) then
    return jsonb_build_object('ok',false,'code','FEATURE_NOT_INCLUDED','feature',required_feature,'meter',p_meter);
  end if;
  base_limit:=case when e.state='trial' then public.vnx_trial_meter_limit(p_meter) else public.vnx_meter_limit(e.plan_key,p_meter) end;
  if e.state='active' and p_meter='storage_mb' and coalesce(e.feature_policy->'provisioned_extras','[]'::jsonb) ? 'storage_pack' then recurring_extra:=10240; end if;
  select coalesce(sum(quantity),0) into month_used from public.vnx_metered_usage
    where tenant_id=t.id and meter_key=p_meter and created_at>=date_trunc('month',now());
  wallet:=case when e.state='active' then public.vnx_wallet_balance(t.id,p_meter) else 0 end;
  base_remaining:=greatest(0,base_limit+recurring_extra-month_used);
  return jsonb_build_object('ok',true,'meter',p_meter,'planKey',e.plan_key,'state',e.state,'baseLimit',base_limit,'recurringExtra',recurring_extra,
    'monthlyLimit',base_limit+recurring_extra,'usedThisMonth',month_used,'baseRemaining',base_remaining,'prepaidCredits',wallet,'remaining',base_remaining+wallet);
end;
$$;

create or replace function public.vnx_consume_meter(p_customer_code text,p_device_id uuid,p_meter text,p_quantity integer,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to public,extensions as $$
declare t public.vnx_tenants%rowtype; e public.vnx_entitlements%rowtype; st jsonb; base_rem int; wallet_need int;
begin
  if p_quantity<=0 then return jsonb_build_object('ok',false,'code','INVALID_QUANTITY'); end if;
  perform pg_advisory_xact_lock(hashtext(upper(trim(p_customer_code))||':'||p_meter));
  st:=public.vnx_meter_status(p_customer_code,p_meter);
  if coalesce((st->>'ok')::boolean,false) is not true then return st; end if;
  if coalesce((st->>'remaining')::int,0)<p_quantity then return st||jsonb_build_object('ok',false,'code','CREDITS_EXHAUSTED'); end if;
  select * into t from public.vnx_tenants where upper(customer_code)=upper(trim(p_customer_code)) limit 1;
  select * into e from public.vnx_entitlements where tenant_id=t.id limit 1;
  base_rem:=coalesce((st->>'baseRemaining')::int,0); wallet_need:=case when e.state='active' then greatest(0,p_quantity-base_rem) else 0 end;
  if wallet_need>0 then
    update public.vnx_usage_wallets set balance=balance-wallet_need,updated_at=now()
      where tenant_id=t.id and meter_key=p_meter and balance>=wallet_need;
    if not found then return st||jsonb_build_object('ok',false,'code','CREDITS_EXHAUSTED'); end if;
  end if;
  insert into public.vnx_metered_usage(tenant_id,device_id,meter_key,quantity,metadata)
    values(t.id,p_device_id,p_meter,p_quantity,coalesce(p_metadata,'{}'::jsonb));
  return public.vnx_meter_status(p_customer_code,p_meter)||jsonb_build_object('ok',true,'consumed',p_quantity);
end;
$$;

create or replace function public.vnx_grant_usage_credits(p_tenant uuid,p_meter text,p_pack_key text,p_quantity integer,p_amount_cents integer,p_stripe_session_id text)
returns jsonb language plpgsql security definer set search_path to public,extensions as $$
declare inserted_id uuid; new_balance int;
begin
  if p_quantity<=0 then return jsonb_build_object('ok',false,'code','INVALID_QUANTITY'); end if;
  insert into public.vnx_credit_purchases(tenant_id,meter_key,pack_key,quantity,amount_cents,stripe_session_id)
    values(p_tenant,p_meter,p_pack_key,p_quantity,coalesce(p_amount_cents,0),p_stripe_session_id)
    on conflict (stripe_session_id) do nothing returning id into inserted_id;
  if inserted_id is null then
    select balance into new_balance from public.vnx_usage_wallets where tenant_id=p_tenant and meter_key=p_meter;
    return jsonb_build_object('ok',true,'duplicate',true,'balance',coalesce(new_balance,0));
  end if;
  insert into public.vnx_usage_wallets(tenant_id,meter_key,balance,updated_at)
    values(p_tenant,p_meter,p_quantity,now())
    on conflict (tenant_id,meter_key) do update set balance=public.vnx_usage_wallets.balance+excluded.balance,updated_at=now()
    returning balance into new_balance;
  return jsonb_build_object('ok',true,'balance',new_balance);
end;
$$;

create or replace function public.vnx_video_quota_status(p_customer_code text)
returns jsonb language plpgsql security definer set search_path to public,extensions as $$
declare
  t public.vnx_tenants%rowtype; e public.vnx_entitlements%rowtype;
  base_limit int:=0; used_month int:=0; wallet int:=0; base_remaining int:=0; total_remaining int:=0;
  daily_limit int:=5; used_today int:=0; valid_state boolean:=false;
begin
  select * into t from public.vnx_tenants where upper(customer_code)=upper(trim(p_customer_code)) limit 1;
  if t.id is null then return jsonb_build_object('ok',false,'code','CUSTOMER_NOT_FOUND'); end if;
  select * into e from public.vnx_entitlements where tenant_id=t.id limit 1;
  if e.id is not null then valid_state:=e.state='active' or (e.state='trial' and e.trial_ends_at is not null and now()<e.trial_ends_at); end if;
  if not valid_state then return jsonb_build_object('ok',false,'code','LICENSE_NOT_ACTIVE'); end if;
  if lower(coalesce(e.plan_key,''))='master' then base_limit:=1000000;daily_limit:=50; else base_limit:=0; end if;
  select coalesce(sum(credits_used),0) into used_month from public.vnx_video_usage where tenant_id=t.id and created_at>=date_trunc('month',now());
  wallet:=case when e.state='active' then public.vnx_wallet_balance(t.id,'video_credits') else 0 end;
  base_remaining:=greatest(0,base_limit-used_month);total_remaining:=base_remaining+wallet;
  select count(*) into used_today from public.vnx_video_usage where tenant_id=t.id and created_at>=date_trunc('day',now());
  return jsonb_build_object('ok',true,'planKey',e.plan_key,'state',e.state,'baseCredits',base_limit,'usedThisMonth',used_month,
    'baseRemaining',base_remaining,'prepaidCredits',wallet,'remaining',total_remaining,'monthlyLimit',base_limit,'dailyLimit',daily_limit,
    'generationsToday',used_today,'dailyRemaining',greatest(0,daily_limit-used_today),'rules',jsonb_build_object('upTo15Seconds',1,'upTo30Seconds',2,'upTo60Seconds',4));
end;
$$;

create or replace function public.vnx_consume_video_quota(p_customer_code text,p_device_id uuid,p_duration_seconds integer)
returns jsonb language plpgsql security definer set search_path to public,extensions as $$
declare t public.vnx_tenants%rowtype; e public.vnx_entitlements%rowtype; status jsonb; needed int; base_rem int; wallet_need int; daily_rem int;
begin
  perform pg_advisory_xact_lock(hashtext(upper(trim(p_customer_code))||':video'));
  if p_duration_seconds<=0 or p_duration_seconds>60 then return jsonb_build_object('ok',false,'code','DURATION_NOT_ALLOWED','message','La duración máxima es de 60 segundos.'); end if;
  needed:=case when p_duration_seconds<=15 then 1 when p_duration_seconds<=30 then 2 else 4 end;
  status:=public.vnx_video_quota_status(p_customer_code);
  if coalesce((status->>'ok')::boolean,false) is not true then return status; end if;
  daily_rem:=coalesce((status->>'dailyRemaining')::int,0);
  if daily_rem<1 then return status||jsonb_build_object('ok',false,'code','DAILY_LIMIT_REACHED'); end if;
  if coalesce((status->>'remaining')::int,0)<needed then return status||jsonb_build_object('ok',false,'code','CREDITS_EXHAUSTED'); end if;
  select * into t from public.vnx_tenants where upper(customer_code)=upper(trim(p_customer_code)) limit 1;
  select * into e from public.vnx_entitlements where tenant_id=t.id limit 1;
  base_rem:=coalesce((status->>'baseRemaining')::int,0); wallet_need:=case when e.state='active' then greatest(0,needed-base_rem) else 0 end;
  if wallet_need>0 then
    update public.vnx_usage_wallets set balance=balance-wallet_need,updated_at=now()
      where tenant_id=t.id and meter_key='video_credits' and balance>=wallet_need;
    if not found then return status||jsonb_build_object('ok',false,'code','CREDITS_EXHAUSTED'); end if;
  end if;
  insert into public.vnx_video_usage(tenant_id,device_id,credits_used,duration_seconds) values(t.id,p_device_id,needed,p_duration_seconds);
  return public.vnx_video_quota_status(p_customer_code)||jsonb_build_object('ok',true,'creditsUsed',needed);
end;
$$;

revoke all on function public.vnx_device_status_public(text,text,text) from public,anon,authenticated;
revoke all on function public.vnx_meter_status(text,text) from public,anon,authenticated;
revoke all on function public.vnx_consume_meter(text,uuid,text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.vnx_video_quota_status(text) from public,anon,authenticated;
revoke all on function public.vnx_consume_video_quota(text,uuid,integer) from public,anon,authenticated;
revoke all on function public.vnx_grant_usage_credits(uuid,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.vnx_device_status_public(text,text,text) to service_role;
grant execute on function public.vnx_meter_status(text,text) to service_role;
grant execute on function public.vnx_consume_meter(text,uuid,text,integer,jsonb) to service_role;
grant execute on function public.vnx_video_quota_status(text) to service_role;
grant execute on function public.vnx_consume_video_quota(text,uuid,integer) to service_role;
grant execute on function public.vnx_grant_usage_credits(uuid,text,text,integer,integer,text) to service_role;


create or replace function public.vnx_register_device_public(
  p_customer_code text,
  p_activation_code text,
  p_device_key text,
  p_fingerprint_hash text default null,
  p_device_name text default null,
  p_platform text default null,
  p_app_version text default null
)
returns jsonb language plpgsql security definer set search_path to public,extensions as $$
declare
  t public.vnx_tenants%rowtype; e public.vnx_entitlements%rowtype; d public.vnx_devices%rowtype;
  v_active int; v_base int; v_limit int; v_hash text; v_valid boolean:=false;
begin
  if coalesce(trim(p_customer_code),'')='' or coalesce(trim(p_activation_code),'')='' or coalesce(trim(p_device_key),'')='' then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST','message','Faltan datos de activación');
  end if;
  select * into t from public.vnx_tenants where upper(customer_code)=upper(trim(p_customer_code)) limit 1;
  if t.id is null then return jsonb_build_object('ok',false,'code','CUSTOMER_NOT_FOUND','message','ID de cliente no válido'); end if;
  v_hash:=encode(digest(trim(p_activation_code),'sha256'),'hex');
  if t.desktop_activation_hash is null or t.desktop_activation_hash<>v_hash then
    return jsonb_build_object('ok',false,'code','ACTIVATION_INVALID','message','Código de activación no válido');
  end if;
  select * into e from public.vnx_entitlements where tenant_id=t.id limit 1;
  if e.id is not null then v_valid:=e.state='active' or (e.state='trial' and e.trial_ends_at is not null and now()<e.trial_ends_at); end if;
  if not v_valid then return jsonb_build_object('ok',false,'code','LICENSE_NOT_ACTIVE','message','La licencia no está activa'); end if;

  if e.state='trial' then v_base:=1;
  else
    v_base:=case lower(coalesce(e.plan_key,'start'))
      when 'core' then 3 when 'growth' then 3 when 'crecimiento' then 3
      when 'scale' then 5 when 'enterprise' then 5 when 'empresa' then 5 when 'premium' then 5
      when 'master' then 50 else 1 end;
  end if;
  if coalesce(t.device_limit_override,0)>0 then v_base:=t.device_limit_override; end if;
  v_limit:=v_base+greatest(0,coalesce(t.extra_device_count,0));

  select * into d from public.vnx_devices where tenant_id=t.id and device_key=trim(p_device_key) limit 1;
  if d.id is not null then
    if d.status<>'active' then return jsonb_build_object('ok',false,'code','DEVICE_REVOKED','message','Este dispositivo está revocado. Contacta con soporte.'); end if;
    update public.vnx_devices set last_seen_at=now(),fingerprint_hash=nullif(trim(p_fingerprint_hash),''),
      device_name=coalesce(nullif(trim(p_device_name),''),device_name),platform=coalesce(nullif(trim(p_platform),''),platform),
      app_version=coalesce(nullif(trim(p_app_version),''),app_version) where id=d.id;
  else
    select count(*) into v_active from public.vnx_devices where tenant_id=t.id and status='active';
    if v_active>=v_limit then
      return jsonb_build_object('ok',false,'code','DEVICE_LIMIT_REACHED','message',format('Has utilizado %s de %s dispositivos.',v_active,v_limit),
        'activeCount',v_active,'limit',v_limit,'extraDeviceMonthlyEur',coalesce(t.device_addon_price_cents,4900)/100.0);
    end if;
    insert into public.vnx_devices(tenant_id,device_key,fingerprint_hash,device_name,platform,app_version,status,last_seen_at)
      values(t.id,trim(p_device_key),nullif(trim(p_fingerprint_hash),''),coalesce(nullif(trim(p_device_name),''),'Equipo VentaNexIA'),
        nullif(trim(p_platform),''),nullif(trim(p_app_version),''),'active',now()) returning * into d;
  end if;

  select count(*) into v_active from public.vnx_devices where tenant_id=t.id and status='active';
  return jsonb_build_object('ok',true,'registered',d.first_seen_at=d.last_seen_at,'customerId',t.customer_code,'deviceId',d.id,
    'planKey',e.plan_key,'state',e.state,'trialEndsAt',e.trial_ends_at,'baseLimit',v_base,
    'extraDeviceCount',greatest(0,coalesce(t.extra_device_count,0)),'limit',v_limit,'activeCount',v_active,
    'available',greatest(0,v_limit-v_active),'extraDeviceMonthlyEur',coalesce(t.device_addon_price_cents,4900)/100.0);
end;
$$;

revoke all on function public.vnx_register_device_public(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.vnx_register_device_public(text,text,text,text,text,text,text) to service_role;

create index if not exists vnx_provisioning_tasks_tenant_idx on public.vnx_provisioning_tasks(tenant_id);
