import {registerDevice} from "../../lib/device-licensing.js";
function clean(v,n=300){return String(v||"").trim().slice(0,n)}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const result=await registerDevice({
      customerCode:clean(req.body?.customerId,80),
      activationCode:clean(req.body?.activationCode,500),
      deviceKey:clean(req.body?.deviceKey,120),
      fingerprintHash:clean(req.body?.fingerprintHash,128),
      deviceName:clean(req.body?.deviceName,160),
      platform:clean(req.body?.platform,80),
      appVersion:clean(req.body?.appVersion,40)
    });
    if(!result.ok){
      const status=result.code==="DEVICE_LIMIT_REACHED"?409:result.code==="LICENSE_NOT_ACTIVE"?402:401;
      return res.status(status).json({error:result.message||"No se pudo activar este dispositivo",...result});
    }
    return res.status(200).json(result);
  }catch(e){
    console.error("device_register_error",String(e?.message||e).slice(0,400));
    return res.status(503).json({error:"El servicio de licencias no está disponible"});
  }
}
