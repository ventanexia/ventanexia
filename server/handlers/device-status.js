import {touchDevice} from "../../lib/device-licensing.js";
function clean(v,n=300){return String(v||"").trim().slice(0,n)}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const result=await touchDevice({
      customerCode:clean(req.body?.customerId,80),
      activationCode:clean(req.body?.activationCode,500),
      deviceKey:clean(req.body?.deviceKey,120)
    });
    if(!result.ok)return res.status(401).json({error:"Dispositivo o licencia no válidos",...result});
    return res.status(200).json(result);
  }catch(e){
    console.error("device_status_error",String(e?.message||e).slice(0,400));
    return res.status(503).json({error:"El servicio de licencias no está disponible"});
  }
}
