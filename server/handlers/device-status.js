const SUPABASE_URL="https://puthimkwgmncajajlkqe.supabase.co";
const SUPABASE_KEY="sb_publishable_8lCwhQ2d6Jk044gnISCPGA_RvV8h_EU";
function clean(v,n=300){return String(v||"").trim().slice(0,n)}
async function rpc(name,body){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json"},
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
