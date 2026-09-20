function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function rpc(name,body){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>null);
  if(!r.ok)throw new Error("RPC_"+r.status);
  return j;
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const customerId=String(req.body?.customerId||"").trim();
    const activationCode=String(req.body?.activationCode||"").trim();
    const deviceKey=String(req.body?.deviceKey||"").trim();
    const action=String(req.body?.action||"status").trim();
    const durationSeconds=Math.max(0,Math.min(60,Number(req.body?.durationSeconds||0)||0));
    if(!customerId||!activationCode||!deviceKey)return res.status(400).json({error:"Faltan datos de licencia"});
    const device=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
    if(!device?.ok)return res.status(401).json({error:device?.message||"Licencia no válida",code:device?.code||"LICENSE_INVALID"});
    if(action==="consume"&&device?.featurePolicy?.variable_cost_locked)return res.status(403).json({ok:false,code:"TRIAL_COST_LOCKED",error:"La generación de vídeo no consume créditos durante la demo gratuita. Se activa al contratar créditos de vídeo."});
    if(action==="consume"){
      if(!durationSeconds)return res.status(400).json({error:"Indica la duración del vídeo"});
      const out=await rpc("vnx_consume_video_quota",{p_customer_code:customerId,p_device_id:device.deviceId||null,p_duration_seconds:durationSeconds});
      return res.status(out?.ok?200:409).json(out||{ok:false,error:"No se pudo descontar el uso"});
    }
    const out=await rpc("vnx_video_quota_status",{p_customer_code:customerId});
    return res.status(out?.ok?200:409).json(out||{ok:false,error:"No se pudo comprobar el uso"});
  }catch(e){
    return res.status(503).json({error:"No se pudo comprobar los vídeos disponibles"});
  }
}
