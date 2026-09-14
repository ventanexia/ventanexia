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

export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  const key=String(req.query?.key||"").trim().slice(0,100);
  if(!key) return res.status(400).json({error:"Falta key"});
  try{
    const rows=await sbFetch(`vnx_tenants?public_key=eq.${encodeURIComponent(key)}&status=eq.active&select=public_key,name,settings`);
    const t=rows?.[0];
    if(!t) return res.status(404).json({error:"Instalación no activa"});
    res.setHeader("Cache-Control","public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({key:t.public_key,brand:t.name,widget:t.settings?.widget||{},capabilities:{leadCapture:true,aiChat:false}});
  }catch(e){return res.status(503).json({error:"Configuración no disponible"});}
}
