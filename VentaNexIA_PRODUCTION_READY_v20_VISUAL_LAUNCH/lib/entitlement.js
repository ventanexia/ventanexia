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
export const TRIAL_DAYS=3;
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
  if(ent.state==="active") return {allowed:true,state:"active",reason:"PAID"};
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
  if(ent?.state==="trial" && access.reason==="TRIAL_EXPIRED"){
    await suspendTenant(tenantId,"TRIAL_EXPIRED");
  }
  return {...access,entitlement:ent};
}
export async function startTrial(tenantId,planKey="core"){
  const start=new Date(), end=new Date(start.getTime()+TRIAL_DAYS*24*60*60*1000);
  const existing=await getEntitlement(tenantId);
  const payload={
    state:"trial",trial_started_at:start.toISOString(),trial_ends_at:end.toISOString(),
    suspended_at:null,suspend_reason:null,plan_key:planKey,
    feature_policy:{mode:"trial",days:TRIAL_DAYS,external_writes:false,bulk_outbound:false}
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
export async function activatePaid(tenantId,{customerId=null,subscriptionId=null,invoiceId=null,planKey="core"}={}){
  const payload={
    state:"active",paid_started_at:new Date().toISOString(),suspended_at:null,suspend_reason:null,
    stripe_customer_id:customerId,stripe_subscription_id:subscriptionId,
    stripe_last_invoice_id:invoiceId,plan_key:planKey,
    feature_policy:{mode:"paid",external_writes:true,bulk_outbound:"policy_controlled"}
  };
  const ent=await getEntitlement(tenantId);
  if(ent) await db(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify(payload)});
  else await db("vnx_entitlements",{method:"POST",body:JSON.stringify([{tenant_id:tenantId,...payload}])});
  await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({status:"active"})});
  return true;
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
  return db("vnx_usage",{method:"POST",body:JSON.stringify([{tenant_id:tenantId,capability,quantity,metadata}])});
}
export {db};
