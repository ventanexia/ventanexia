-- VentaNexIA · pago pendiente con 24 horas de cortesía
create or replace function public.vnx_device_status_public(p_customer_code text,p_activation_code text,p_device_key text)
returns jsonb language plpgsql security definer set search_path to public,extensions as $$
declare
  t public.vnx_tenants%rowtype; e public.vnx_entitlements%rowtype; d public.vnx_devices%rowtype;
  v_active int; v_base int; v_limit int; v_hash text; v_valid boolean:=false;
  v_grace_until timestamptz;
begin
  select * into t from public.vnx_tenants where upper(customer_code)=upper(trim(p_customer_code)) limit 1;
  if t.id is null then return jsonb_build_object('ok',false,'code','CUSTOMER_NOT_FOUND','message','ID de cliente no válido'); end if;
  v_hash:=encode(digest(trim(p_activation_code),'sha256'),'hex');
  if t.desktop_activation_hash is null or t.desktop_activation_hash<>v_hash then return jsonb_build_object('ok',false,'code','ACTIVATION_INVALID','message','Código de activación no válido'); end if;
  select * into e from public.vnx_entitlements where tenant_id=t.id limit 1;

  if e.id is not null and e.state='active' and coalesce(e.feature_policy->>'billing_status','')='payment_due' and coalesce(e.feature_policy->>'payment_grace_until','')<>'' then
    begin v_grace_until:=(e.feature_policy->>'payment_grace_until')::timestamptz; exception when others then v_grace_until:=null; end;
    if v_grace_until is not null and now()>=v_grace_until then
      update public.vnx_entitlements set state='suspended',suspended_at=now(),suspend_reason='PAYMENT_GRACE_EXPIRED' where tenant_id=t.id;
      update public.vnx_tenants set status='suspended' where id=t.id;
      update public.vnx_agents set enabled=false where tenant_id=t.id;
      return jsonb_build_object('ok',false,'code','PAYMENT_REQUIRED','message','La cuota está pendiente. Regulariza el pago para reactivar VentaNexIA.','paymentUrl',e.feature_policy->>'payment_url');
    end if;
  end if;

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
  required_feature text; valid_state boolean:=false; v_grace_until timestamptz;
begin
  select * into t from public.vnx_tenants where upper(customer_code)=upper(trim(p_customer_code)) limit 1;
  if t.id is null then return jsonb_build_object('ok',false,'code','CUSTOMER_NOT_FOUND'); end if;
  select * into e from public.vnx_entitlements where tenant_id=t.id limit 1;
  if e.id is not null then
    valid_state:=e.state='active' or (e.state='trial' and e.trial_ends_at is not null and now()<e.trial_ends_at);
    if e.state='active' and coalesce(e.feature_policy->>'billing_status','')='payment_due' and coalesce(e.feature_policy->>'payment_grace_until','')<>'' then
      begin v_grace_until:=(e.feature_policy->>'payment_grace_until')::timestamptz; exception when others then v_grace_until:=null; end;
      if v_grace_until is not null and now()>=v_grace_until then valid_state:=false; end if;
    end if;
  end if;
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
