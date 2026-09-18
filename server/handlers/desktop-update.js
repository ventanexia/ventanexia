function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function db(path,options={}){
  const {url,key}=cfg();
  const r=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation",...(options.headers||{})}});
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch{j=t}
  if(!r.ok)throw new Error(typeof j==="string"?j:JSON.stringify(j));
  return j;
}
async function rpc(name,body){
  const {url,key}=cfg();
  const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>null);if(!r.ok)throw new Error("RPC_"+r.status);return j;
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const customerId=String(req.body?.customerId||"").trim(),activationCode=String(req.body?.activationCode||"").trim(),deviceKey=String(req.body?.deviceKey||"").trim();
    const status=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
    if(!status?.ok)return res.status(401).json({error:status?.message||"Licencia no válida"});
    const rows=await db("vnx_releases?select=version,title,notes,plan_notes,download_url,published_at&order=published_at.desc&limit=1");
    const rel=rows?.[0];if(!rel)return res.status(200).json({ok:true,update:null,planKey:status.planKey||null});
    const plan=String(status.planKey||"start");
    const planText=rel.plan_notes?.[plan]||rel.plan_notes?.default||"";
    return res.status(200).json({ok:true,planKey:plan,update:{version:rel.version,title:rel.title,notes:rel.notes,planNotes:planText,downloadUrl:rel.download_url,publishedAt:rel.published_at}});
  }catch(e){return res.status(503).json({error:"No se pudo comprobar actualizaciones"})}
}
