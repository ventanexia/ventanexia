import crypto from "node:crypto";
import {pdb,hash} from "../../lib/portal-auth.js";
import {requireSameOrigin} from "../../lib/request-security.js";
function clean(v,n=320){return String(v||"").trim().slice(0,n)}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
async function forward(payload){
  const url=process.env.N8N_AUTOMATION_WEBHOOK;
  if(!url) return false;
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.AUTOMATION_WEBHOOK_SECRET||""}`},body:JSON.stringify(payload)});
  return r.ok;
}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!requireSameOrigin(req))return res.status(403).json({error:"Origen no permitido"});
  const email=clean(req.body?.email).toLowerCase();
  if(!emailOk(email)) return res.status(200).json({ok:true}); // anti-enumeration
  const ip=String(req.headers?.["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
  const attemptKey=hash(`magic:${email}:${ip}`);
  const since=new Date(Date.now()-10*60*1000).toISOString();
  try{
    const attempts=await pdb(`vnx_auth_attempts?attempt_key=eq.${encodeURIComponent(attemptKey)}&created_at=gte.${encodeURIComponent(since)}&select=id`);
    if((attempts||[]).length>=5)return res.status(200).json({ok:true});
    await pdb("vnx_auth_attempts",{method:"POST",body:JSON.stringify([{attempt_key:attemptKey,success:false}])});
    const tenants=await pdb(`vnx_tenants?settings->>owner_email=eq.${encodeURIComponent(email)}&select=id,name,status,settings`);
    const tenant=tenants?.[0];
    if(!tenant) return res.status(200).json({ok:true});

    const raw=crypto.randomBytes(32).toString("base64url");
    const expires=new Date(Date.now()+20*60*1000).toISOString();
    await pdb("vnx_portal_login_tokens",{method:"POST",body:JSON.stringify([{
      tenant_id:tenant.id,email_hash:hash(email),token_hash:hash(raw),expires_at:expires
    }])});

    const origin=String(process.env.PUBLIC_APP_URL||"https://www.ventanexia.es").replace(/\/$/,"");
    const loginUrl=`${origin}/api/portal-login?token=${encodeURIComponent(raw)}`;
    const sent=await forward({
      source:"vnx-portal",type:"portal.magic_link",
      tenantId:tenant.id,company:tenant.name,email,loginUrl,expiresAt:expires
    });
    // Never return the token/link publicly.
    return res.status(200).json({ok:true,delivery:sent?"queued":"pending_email_executor"});
  }catch(e){
    console.error("portal_request_link",String(e?.message||e).slice(0,300));
    return res.status(200).json({ok:true});
  }
}
