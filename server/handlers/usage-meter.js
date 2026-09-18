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
    const meter=String(req.body?.meter||"").trim();
    const action=String(req.body?.action||"status").trim();
    const quantity=Math.max(1,Math.min(1000000,Number(req.body?.quantity||1)||1));
    const metadata=req.body?.metadata&&typeof req.body.metadata==="object"?req.body.metadata:{};
    const allowed=new Set(["image_credits","voice_minutes","whatsapp_messages","lead_credits","ai_heavy_tasks","email_ai_actions","automation_runs","seo_pages","report_generations","storage_mb"]);
    if(!customerId||!activationCode||!deviceKey||!allowed.has(meter))return res.status(400).json({error:"Datos de uso no válidos"});
    const device=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
    if(!device?.ok)return res.status(401).json({error:device?.message||"Licencia no válida",code:device?.code||"LICENSE_INVALID"});
    if(action==="consume"){
      const out=await rpc("vnx_consume_meter",{p_customer_code:customerId,p_device_id:device.deviceId||null,p_meter:meter,p_quantity:quantity,p_metadata:metadata});
      return res.status(out?.ok?200:409).json(out||{ok:false,error:"No se pudo registrar el uso"});
    }
    const out=await rpc("vnx_meter_status",{p_customer_code:customerId,p_meter:meter});
    return res.status(out?.ok?200:409).json(out||{ok:false,error:"No se pudo comprobar el uso"});
  }catch(e){
    return res.status(503).json({error:"No se pudo comprobar el uso incluido"});
  }
}
