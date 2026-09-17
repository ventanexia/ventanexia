import {authenticateAdmin} from "../../lib/admin-auth.js";
import {requireSameOrigin} from "../../lib/request-security.js";
import {db} from "../../lib/entitlement.js";
import {createActivationCode,activationHash,getDeviceSummary} from "../../lib/device-licensing.js";
function clean(v,n=300){return String(v||"").trim().slice(0,n)}
export default async function handler(req,res){
  if(!await authenticateAdmin(req))return res.status(401).json({error:"No autorizado"});
  const tenantId=clean(req.method==="GET"?req.query?.tenantId:req.body?.tenantId,100);
  if(!tenantId)return res.status(400).json({error:"tenantId obligatorio"});
  try{
    if(req.method==="GET"){
      const summary=await getDeviceSummary(tenantId);
      return res.status(200).json({ok:true,...summary});
    }
    if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
    if(!requireSameOrigin(req))return res.status(403).json({error:"Origen no permitido"});
    const action=clean(req.body?.action,80);
    if(action==="set_device_capacity"){
      const extraDeviceCount=Math.max(0,Math.min(500,Number(req.body?.extraDeviceCount||0)||0));
      const rawOverride=req.body?.deviceLimitOverride;
      const deviceLimitOverride=rawOverride===null||rawOverride===""?null:Math.max(1,Math.min(500,Number(rawOverride)||1));
      await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({extra_device_count:extraDeviceCount,device_limit_override:deviceLimitOverride})});
      return res.status(200).json({ok:true,...await getDeviceSummary(tenantId)});
    }
    if(action==="regenerate_activation"){
      const activationCode=createActivationCode();
      await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({desktop_activation_hash:activationHash(activationCode)})});
      return res.status(200).json({ok:true,activationCode,note:"Este código solo se devuelve una vez. Guárdalo de forma segura."});
    }
    if(action==="revoke_device"){
      const deviceId=clean(req.body?.deviceId,100);if(!deviceId)return res.status(400).json({error:"deviceId obligatorio"});
      await db(`vnx_devices?id=eq.${encodeURIComponent(deviceId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({status:"revoked",revoked_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,...await getDeviceSummary(tenantId)});
    }
    if(action==="reactivate_device"){
      const deviceId=clean(req.body?.deviceId,100);if(!deviceId)return res.status(400).json({error:"deviceId obligatorio"});
      const summary=await getDeviceSummary(tenantId);
      if(summary.activeCount>=summary.limit)return res.status(409).json({error:"No hay plazas de dispositivo disponibles",code:"DEVICE_LIMIT_REACHED",activeCount:summary.activeCount,limit:summary.limit});
      await db(`vnx_devices?id=eq.${encodeURIComponent(deviceId)}&tenant_id=eq.${encodeURIComponent(tenantId)}`,{method:"PATCH",body:JSON.stringify({status:"active",revoked_at:null,last_seen_at:new Date().toISOString()})});
      return res.status(200).json({ok:true,...await getDeviceSummary(tenantId)});
    }
    return res.status(400).json({error:"Acción no válida"});
  }catch(e){
    console.error("admin_device_license_error",String(e?.message||e).slice(0,400));
    return res.status(500).json({error:"No se pudo gestionar la licencia de dispositivos"});
  }
}
