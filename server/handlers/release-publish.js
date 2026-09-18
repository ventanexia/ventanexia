import crypto from "node:crypto";
function clean(v,n=5000){return String(v||"").trim().slice(0,n)}
function allowed(req){
  const expected=process.env.AUTOMATION_WEBHOOK_SECRET||process.env.CRON_SECRET||"";
  const got=clean(req.headers.authorization||req.headers["x-vnx-automation-key"]||"",500).replace(/^Bearer\s+/i,"");
  if(!expected||!got)return false;
  try{const a=Buffer.from(got),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}
}
function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return{url,key}
}
async function db(path,options={}){
  const{url,key}=cfg();
  const r=await fetch(url+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json","Prefer":"return=representation",...(options.headers||{})}});
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch{j=t}
  if(!r.ok)throw new Error(typeof j==="string"?j:JSON.stringify(j));return j
}
async function send(to,subject,text){
  const key=process.env.RESEND_API_KEY;if(!key||!to)return false;
  const from=process.env.UPDATE_FROM_EMAIL||process.env.BILLING_FROM_EMAIL||"actualizaciones@ventanexia.es";
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject,text})});
  return r.ok
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  if(!allowed(req))return res.status(401).json({error:"No autorizado"});
  try{
    const version=clean(req.body?.version,60),title=clean(req.body?.title,180),notes=clean(req.body?.notes,8000),downloadUrl=clean(req.body?.downloadUrl,2000);
    const planNotes=req.body?.planNotes&&typeof req.body.planNotes==="object"?req.body.planNotes:{};
    if(!version||!title||!downloadUrl)return res.status(400).json({error:"Faltan datos de la actualización"});
    let rows=await db("vnx_releases?version=eq."+encodeURIComponent(version)+"&select=*");
    if(!rows?.length)rows=await db("vnx_releases",{method:"POST",body:JSON.stringify([{version,title,notes,plan_notes:planNotes,download_url:downloadUrl}])});
    const release=rows?.[0];
    const ents=await db("vnx_entitlements?state=eq.active&select=tenant_id,plan_key");
    const tenants=await db("vnx_tenants?select=id,name,settings");
    const map=new Map((tenants||[]).map(t=>[t.id,t]));
    let sent=0;
    for(const e of ents||[]){
      const t=map.get(e.tenant_id),email=String(t?.settings?.owner_email||t?.settings?.email||"").trim();
      if(!email)continue;
      const plan=String(e.plan_key||"start"),specific=planNotes?.[plan]||planNotes?.default||"";
      let body="Hola"+(t?.name?" "+t.name:"")+",\n\n";
      body+="Ya está disponible VentaNexIA "+version+".\n\n";
      body+=(notes||"Hemos mejorado VentaNexIA.")+"\n";
      if(specific)body+="\nMejoras disponibles en tu plan:\n"+specific+"\n";
      body+="\nPuedes ver todas las novedades, pero VentaNexIA solo permitirá usar las funciones incluidas en tu plan o los extras que tengas contratados.";
      body+="\n\nDescarga/actualización: "+downloadUrl+"\n\nVentaNexIA";
      if(await send(email,"Nueva actualización de VentaNexIA · "+version,body))sent++;
    }
    if(release?.id)await db("vnx_releases?id=eq."+encodeURIComponent(release.id),{method:"PATCH",body:JSON.stringify({emails_sent_at:new Date().toISOString()})});
    return res.status(200).json({ok:true,version,emailsSent:sent});
  }catch(e){return res.status(500).json({error:"No se pudo publicar la actualización"})}
}
