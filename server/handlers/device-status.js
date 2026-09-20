function clean(v,n=300){return String(v||"").trim().slice(0,n)}
function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function rpc(name,body){
  const {url,key}=cfg();
  const r=await fetch(`${url}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(`SUPABASE_RPC_${r.status}`);
  return data;
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const result=await rpc("vnx_device_status_public",{
      p_customer_code:clean(req.body?.customerId,80),
      p_activation_code:clean(req.body?.activationCode,500),
      p_device_key:clean(req.body?.deviceKey,120)
    });
    if(!result?.ok)return res.status(401).json({error:result?.message||"Dispositivo o licencia no válidos",...(result||{})});
    return res.status(200).json(result);
  }catch(e){
    console.error("device_status_error",String(e?.message||e).slice(0,400));
    return res.status(503).json({error:"El servicio de licencias no está disponible"});
  }
}
