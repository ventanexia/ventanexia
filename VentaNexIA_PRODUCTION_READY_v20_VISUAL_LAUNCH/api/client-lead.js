function sb(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key,headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation"}};
}
async function sbFetch(path,options={}){
  const c=sb();
  const r=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{...c.headers,...(options.headers||{})}});
  const txt=await r.text();
  let data=null; try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error(`SUPABASE_${r.status}:${typeof data==="string"?data:JSON.stringify(data)}`);
  return data;
}

function clean(v,n=2000){return String(v||"").trim().slice(0,n)}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const b=req.body||{}, key=clean(b.key,100);
  if(clean(b.website,200)) return res.status(200).json({ok:true});
  const email=clean(b.email,320).toLowerCase(), message=clean(b.message,3000), consent=b.consent===true;
  if(!key||!email||!message||!consent) return res.status(400).json({error:"Datos incompletos"});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Email no válido"});
  try{
    const rows=await sbFetch(`vnx_tenants?public_key=eq.${encodeURIComponent(key)}&status=eq.active&select=id,name`);
    const t=rows?.[0]; if(!t) return res.status(404).json({error:"Instalación no activa"});
    const lead=(await sbFetch("vnx_client_leads",{method:"POST",body:JSON.stringify([{
      tenant_id:t.id,name:clean(b.name,250),email,phone:clean(b.phone,80),company:clean(b.company,250),
      message,source_url:clean(b.source_url,1000),consent:true,metadata:b.metadata||{}
    }])}))?.[0];
    await sbFetch("vnx_jobs",{method:"POST",body:JSON.stringify([{
      tenant_id:t.id,job_type:"qualify_inbound_lead",status:"queued",payload:{lead_id:lead?.id}
    }])});
    return res.status(200).json({ok:true});
  }catch(e){return res.status(500).json({error:"No se pudo registrar la solicitud"});}
}
