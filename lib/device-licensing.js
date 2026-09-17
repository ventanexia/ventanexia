import crypto from "node:crypto";
import {db,getEntitlement,computeAccess} from "./entitlement.js";
import {deviceLimitForPlan,EXTRA_DEVICE_MONTHLY_EUR} from "./pricing.js";

function clean(v,n=300){return String(v||"").trim().slice(0,n)}
function sha256(v){return crypto.createHash("sha256").update(String(v||"")).digest("hex")}
function safeEqualHex(a,b){
  try{
    const x=Buffer.from(String(a||""),"hex"),y=Buffer.from(String(b||""),"hex");
    return x.length===y.length&&x.length>0&&crypto.timingSafeEqual(x,y);
  }catch{return false}
}
export function createCustomerCode(){
  return `VNX-C-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}
export function createActivationCode(){
  return `VNX-${crypto.randomBytes(12).toString("base64url").toUpperCase()}`;
}
export function activationHash(code){return sha256(clean(code,500))}

export async function getTenantByCustomerCode(customerCode){
  const code=clean(customerCode,80).toUpperCase();
  if(!code)return null;
  const rows=await db(`vnx_tenants?customer_code=eq.${encodeURIComponent(code)}&select=id,name,status,customer_code,desktop_activation_hash,device_limit_override,extra_device_count,device_addon_price_cents`);
  return rows?.[0]||null;
}

export async function getDeviceSummary(tenantId){
  const ent=await getEntitlement(tenantId);
  const planKey=ent?.plan_key||"start";
  const tenants=await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}&select=id,name,status,customer_code,device_limit_override,extra_device_count,device_addon_price_cents`);
  const tenant=tenants?.[0]||{};
  const rows=await db(`vnx_devices?tenant_id=eq.${encodeURIComponent(tenantId)}&select=id,device_key,device_name,platform,app_version,status,first_seen_at,last_seen_at,revoked_at&order=last_seen_at.desc`);
  const baseLimit=Number(tenant.device_limit_override||0)>0?Number(tenant.device_limit_override):deviceLimitForPlan(planKey);
  const extras=Math.max(0,Number(tenant.extra_device_count||0));
  const limit=baseLimit+extras;
  const active=(rows||[]).filter(x=>x.status==="active");
  return {
    tenant,entitlement:ent,planKey,baseLimit,extraDeviceCount:extras,limit,
    activeCount:active.length,available:Math.max(0,limit-active.length),
    extraDeviceMonthlyEur:Number(tenant.device_addon_price_cents||EXTRA_DEVICE_MONTHLY_EUR*100)/100,
    devices:rows||[]
  };
}

export async function registerDevice({customerCode,activationCode,deviceKey,fingerprintHash,deviceName,platform,appVersion}){
  const tenant=await getTenantByCustomerCode(customerCode);
  if(!tenant)return {ok:false,code:"CUSTOMER_NOT_FOUND",message:"ID de cliente no válido"};
  const expected=clean(tenant.desktop_activation_hash,128);
  if(!expected||!safeEqualHex(expected,activationHash(activationCode))){
    return {ok:false,code:"ACTIVATION_INVALID",message:"Código de activación no válido"};
  }
  const ent=await getEntitlement(tenant.id);
  const access=computeAccess(ent,"dashboard");
  if(!access.allowed){
    return {ok:false,code:"LICENSE_NOT_ACTIVE",message:"La licencia no está activa",state:access.state,reason:access.reason};
  }
  const key=clean(deviceKey,120);
  if(!key)return {ok:false,code:"DEVICE_ID_REQUIRED",message:"Falta el identificador del dispositivo"};
  const existing=await db(`vnx_devices?tenant_id=eq.${encodeURIComponent(tenant.id)}&device_key=eq.${encodeURIComponent(key)}&select=*`);
  const current=existing?.[0];
  if(current){
    if(current.status!=="active")return {ok:false,code:"DEVICE_REVOKED",message:"Este dispositivo está revocado. Contacta con soporte."};
    await db(`vnx_devices?id=eq.${encodeURIComponent(current.id)}`,{method:"PATCH",body:JSON.stringify({last_seen_at:new Date().toISOString(),fingerprint_hash:clean(fingerprintHash,128)||null,device_name:clean(deviceName,160)||current.device_name,platform:clean(platform,80)||current.platform,app_version:clean(appVersion,40)||current.app_version})});
    const summary=await getDeviceSummary(tenant.id);
    return {ok:true,registered:false,customerId:tenant.customer_code,tenantId:tenant.id,deviceId:current.id,...summary};
  }
  const before=await getDeviceSummary(tenant.id);
  if(before.activeCount>=before.limit){
    return {ok:false,code:"DEVICE_LIMIT_REACHED",message:`Has utilizado ${before.activeCount} de ${before.limit} dispositivos. Añade otro dispositivo o desactiva uno anterior.`,customerId:tenant.customer_code,activeCount:before.activeCount,limit:before.limit,extraDeviceMonthlyEur:before.extraDeviceMonthlyEur};
  }
  const inserted=await db("vnx_devices",{method:"POST",body:JSON.stringify([{tenant_id:tenant.id,device_key:key,fingerprint_hash:clean(fingerprintHash,128)||null,device_name:clean(deviceName,160)||"Equipo VentaNexIA",platform:clean(platform,80)||null,app_version:clean(appVersion,40)||null,status:"active",last_seen_at:new Date().toISOString()}])});
  const device=inserted?.[0];
  const summary=await getDeviceSummary(tenant.id);
  return {ok:true,registered:true,customerId:tenant.customer_code,tenantId:tenant.id,deviceId:device?.id||null,...summary};
}

export async function touchDevice({customerCode,activationCode,deviceKey}){
  const tenant=await getTenantByCustomerCode(customerCode);
  if(!tenant)return {ok:false,code:"CUSTOMER_NOT_FOUND"};
  if(!tenant.desktop_activation_hash||!safeEqualHex(tenant.desktop_activation_hash,activationHash(activationCode)))return {ok:false,code:"ACTIVATION_INVALID"};
  const rows=await db(`vnx_devices?tenant_id=eq.${encodeURIComponent(tenant.id)}&device_key=eq.${encodeURIComponent(clean(deviceKey,120))}&select=*`);
  const device=rows?.[0];
  if(!device||device.status!=="active")return {ok:false,code:"DEVICE_NOT_ACTIVE"};
  await db(`vnx_devices?id=eq.${encodeURIComponent(device.id)}`,{method:"PATCH",body:JSON.stringify({last_seen_at:new Date().toISOString()})});
  const summary=await getDeviceSummary(tenant.id);
  return {ok:true,customerId:tenant.customer_code,tenantId:tenant.id,deviceId:device.id,...summary};
}
