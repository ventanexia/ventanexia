function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function db(path,options={}){
  const {url,key}=cfg();
  const r=await fetch(`${url}/rest/v1/${path}`,{
    ...options,
    headers:{
      "apikey":key,"Authorization":`Bearer ${key}`,
      "Content-Type":"application/json","Prefer":"return=representation",
      ...(options.headers||{})
    }
  });
  const txt=await r.text(); let data=null;
  try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error(`SUPABASE_${r.status}:${typeof data==="string"?data:JSON.stringify(data)}`);
  return data;
}
export const TRIAL_DAYS=15;
export const TRIAL_ALLOWED=new Set([
  "blueprint","dashboard","demo_ai","crm_preview","content_preview",
  "proposal_preview","analytics_preview","connector_discovery"
]);
export async function getEntitlement(tenantId){
  const rows=await db(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*`);
  return rows?.[0]||null;
}
export function computeAccess(ent,capability){
  if(!ent) return {allowed:false,state:"missing",reason:"NO_ENTITLEMENT"};
  const billing=ent?.feature_policy&&typeof ent.feature_policy==="object"?ent.feature_policy:{};
  const graceUntil=billing.payment_grace_until?new Date(billing.payment_grace_until).getTime():0;
  if(ent.state==="active"&&billing.billing_status==="payment_due"&&graceUntil&&Date.now()>=graceUntil)return {allowed:false,state:"suspended",reason:"PAYMENT_GRACE_EXPIRED"};
  if(ent.state==="active") return {allowed:true,state:"active",reason:billing.billing_status==="payment_due"?"PAYMENT_GRACE":"PAID"};
  if(ent.state==="trial"){
    const valid=ent.trial_ends_at && Date.now()<new Date(ent.trial_ends_at).getTime();
    if(!valid) return {allowed:false,state:"suspended",reason:"TRIAL_EXPIRED"};
    return {
      allowed:TRIAL_ALLOWED.has(capability),
      state:"trial",
      reason:TRIAL_ALLOWED.has(capability)?"TRIAL_ALLOWED":"TRIAL_LIMIT"
    };
  }
  return {allowed:false,state:ent.state,reason:ent.suspend_reason||"NOT_ACTIVE"};
}
export async function enforceEntitlement(tenantId,capability){
  const ent=await getEntitlement(tenantId);
  const access=computeAccess(ent,capability);
  if(ent?.state==="trial" && access.reason==="TRIAL_EXPIRED")await suspendTenant(tenantId,"TRIAL_EXPIRED");
  if(ent?.state==="active" && access.reason==="PAYMENT_GRACE_EXPIRED")await suspendTenant(tenantId,"PAYMENT_GRACE_EXPIRED");
  return {...access,entitlement:ent};
}
export async function startTrial(tenantId,planKey="core"){
  const start=new Date(), end=new Date(start.getTime()+TRIAL_DAYS*24*60*60*1000);
  const existing=await getEntitlement(tenantId);
  const payload={
    state:"trial",trial_started_at:start.toISOString(),trial_ends_at:end.toISOString(),
    suspended_at:null,suspend_reason:null,plan_key:planKey,
    feature_policy:{
      mode:"trial",days:TRIAL_DAYS,trial_demo_full:true,
      external_writes:true,approval_required:true,bulk_outbound:false,financial_commitments:false,
      variable_cost_locked:true,
      trial_meter_allowances:{image_credits:0,video_credits:0,voice_minutes:0,whatsapp_messages:0}
    }
  };
  if(existing){
    const rows=await db(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify(payload)});
    await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({status:"trial"})});
    return rows?.[0];
  }
  const rows=await db("vnx_entitlements",{method:"POST",body:JSON.stringify([{tenant_id:tenantId,...payload}])});
  await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({status:"trial"})});
  return rows?.[0];
}
export async function activatePaid(tenantId,{customerId=null,subscriptionId=null,invoiceId=null,planKey=null,featurePolicy=null}={}){
  const ent=await getEntitlement(tenantId);
  const previousPolicy=(ent?.feature_policy&&typeof ent.feature_policy==="object")?ent.feature_policy:{};
  const {billing_status,payment_grace_until,payment_url,payment_invoice_id,payment_failed_at,block_email_sent_at,...cleanPolicy}=previousPolicy;
  const payload={
    state:"active",paid_started_at:ent?.paid_started_at||new Date().toISOString(),suspended_at:null,suspend_reason:null,
    stripe_customer_id:customerId||ent?.stripe_customer_id||null,stripe_subscription_id:subscriptionId||ent?.stripe_subscription_id||null,
    stripe_last_invoice_id:invoiceId||ent?.stripe_last_invoice_id||null,plan_key:planKey||ent?.plan_key||"core",
    feature_policy:{mode:"paid",external_writes:true,bulk_outbound:"policy_controlled",...cleanPolicy,...(featurePolicy||{}),billing_status:"paid"}
  };
  if(ent) await db(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify(payload)});
  else await db("vnx_entitlements",{method:"POST",body:JSON.stringify([{tenant_id:tenantId,...payload}])});
  await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({status:"active"})});
  return true;
}
export async function markPaymentGrace(tenantId,{hours=24,payUrl=null,invoiceId=null}={}){
  const ent=await getEntitlement(tenantId);if(!ent)return false;
  const policy=(ent.feature_policy&&typeof ent.feature_policy==="object")?ent.feature_policy:{};
  const previousUntil=policy.billing_status==="payment_due"&&policy.payment_grace_until?new Date(policy.payment_grace_until):null;
  const keepPrevious=previousUntil&&!Number.isNaN(previousUntil.getTime());
  const failedAt=keepPrevious&&policy.payment_failed_at?new Date(policy.payment_failed_at):new Date();
  const until=keepPrevious?previousUntil:new Date(failedAt.getTime()+Math.max(1,Number(hours)||24)*60*60*1000);
  await db(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({
    state:"active",suspended_at:null,suspend_reason:null,
    feature_policy:{...policy,billing_status:"payment_due",payment_failed_at:Number.isNaN(failedAt.getTime())?new Date().toISOString():failedAt.toISOString(),payment_grace_until:until.toISOString(),payment_url:payUrl||policy.payment_url||null,payment_invoice_id:invoiceId||policy.payment_invoice_id||null}
  })});
  await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({status:"payment_due"})});
  return {until:until.toISOString(),reused:keepPrevious};
}

export async function suspendTenant(tenantId,reason="PAYMENT_REQUIRED"){
  await db(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(tenantId)}`,{
    method:"PATCH",body:JSON.stringify({state:"suspended",suspended_at:new Date().toISOString(),suspend_reason:reason})
  });
  await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({status:"suspended"})});
  await db(`vnx_agents?tenant_id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({enabled:false})});
  return true;
}
export async function reactivateAgents(tenantId){
  await db(`vnx_agents?tenant_id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({enabled:true})});
}
export async function recordUsage(tenantId,capability,quantity=1,metadata={}){
  try{
    return await db("rpc/vnx_increment_usage",{method:"POST",body:JSON.stringify({p_tenant:tenantId,p_capability:capability,p_quantity:quantity,p_metadata:metadata})});
  }catch{
    return db("vnx_usage",{method:"POST",body:JSON.stringify([{tenant_id:tenantId,capability,quantity,metadata}])});
  }
}
export async function getMonthlyUsage(tenantId){
  const monthStart=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),1)).toISOString().slice(0,10);
  try{
    const rows=await db(`vnx_usage_monthly?tenant_id=eq.${encodeURIComponent(tenantId)}&month_start=eq.${monthStart}&select=capability,quantity`);
    const byCapability={};for(const r of rows||[])byCapability[r.capability]=Number(r.quantity||0);
    return {monthStart,byCapability};
  }catch{
    const rows=await db(`vnx_usage?tenant_id=eq.${encodeURIComponent(tenantId)}&created_at=gte.${encodeURIComponent(monthStart+"T00:00:00.000Z")}&select=capability,quantity&limit=2000`);
    const byCapability={};for(const r of rows||[])byCapability[r.capability]=(byCapability[r.capability]||0)+Number(r.quantity||0);
    return {monthStart,byCapability};
  }
}
export {db};
