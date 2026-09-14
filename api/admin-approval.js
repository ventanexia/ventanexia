import crypto from "node:crypto";
function b64url(v){return Buffer.from(v).toString("base64url")}
function sign(v,secret){return crypto.createHmac("sha256",secret).update(v).digest("base64url")}
function parseCookies(req){
  return Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf("="); return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];
  }));
}
function verifyAdmin(req){
  const secret=process.env.ADMIN_SESSION_SECRET;
  if(!secret) return false;
  const token=parseCookies(req).vnx_admin;
  if(!token) return false;
  const [payload,sig]=token.split(".");
  if(!payload||!sig) return false;
  const expected=sign(payload,secret);
  try{
    if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return false;
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    return data?.exp>Date.now() && data?.role==="admin";
  }catch{return false}
}
function newSession(){
  const secret=process.env.ADMIN_SESSION_SECRET;
  const payload=b64url(JSON.stringify({role:"admin",exp:Date.now()+8*60*60*1000}));
  return `${payload}.${sign(payload,secret)}`;
}
function safeEqual(a,b){
  if(!a||!b) return false;
  try{return a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))}catch{return false}
}

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

function clean(v,n=1000){return String(v||"").trim().slice(0,n)}
async function fire(payload){
  const url=process.env.N8N_AUTOMATION_WEBHOOK;
  if(!url) return {queuedOnly:true};
  const key=process.env.AUTOMATION_WEBHOOK_SECRET||"";
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(payload)});
  return {forwarded:r.ok,status:r.status};
}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!verifyAdmin(req)) return res.status(401).json({error:"No autorizado"});
  const id=clean(req.body?.id,100), decision=clean(req.body?.decision,30), note=clean(req.body?.note,1000);
  if(!id||!["approve","reject"].includes(decision)) return res.status(400).json({error:"Solicitud inválida"});
  try{
    const rows=await sbFetch(`vnx_approvals?id=eq.${encodeURIComponent(id)}&select=*`);
    const item=rows?.[0];
    if(!item||item.status!=="pending") return res.status(404).json({error:"Aprobación no disponible"});
    const status=decision==="approve"?"approved":"rejected";
    await sbFetch(`vnx_approvals?id=eq.${encodeURIComponent(id)}`,{
      method:"PATCH",body:JSON.stringify({status,decided_at:new Date().toISOString(),decision_note:note||null})
    });
    let execution=null;
    if(decision==="approve"){
      execution=await fire({source:"vnx-control",type:"approval.approved",approval:item});
      if(execution.forwarded){
        await sbFetch(`vnx_approvals?id=eq.${encodeURIComponent(id)}`,{
          method:"PATCH",body:JSON.stringify({status:"executed",executed_at:new Date().toISOString()})
        });
      }
    }
    return res.status(200).json({ok:true,status,execution});
  }catch(e){
    return res.status(500).json({error:"No se pudo registrar la decisión",detail:String(e?.message||e).slice(0,300)});
  }
}
