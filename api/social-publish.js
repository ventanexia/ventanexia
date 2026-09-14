import {authorizeExecution,completeExecution,markExecutionStatus} from "../lib/execution-gateway.js";
import crypto from "node:crypto";
function clean(v,n=1000){return String(v||"").trim().slice(0,n)}
function auth(req){
 const exp=process.env.AUTOMATION_WEBHOOK_SECRET;
 const got=clean(req.headers.authorization||"",500).replace(/^Bearer\s+/i,"");
 if(!exp||!got)return false;
 try{return exp.length===got.length&&crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(got))}catch{return false}
}
function cfg(){const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");return{url,key}}
async function db(path,options={}){const {url,key}=cfg();const r=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation",...(options.headers||{})}});const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch{j=t}if(!r.ok)throw new Error(`DB_${r.status}`);return j}
async function forward(payload){
 const url=process.env.N8N_AUTOMATION_WEBHOOK;if(!url)return {ok:false,reason:"EXECUTOR_NOT_CONFIGURED"};
 const key=process.env.AUTOMATION_WEBHOOK_SECRET||"";
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(payload)});
 return {ok:r.ok,status:r.status};
}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
 if(!auth(req))return res.status(401).json({error:"No autorizado"});
 try{
  const postId=clean(req.body?.postId,100);
  const rows=await db(`vnx_social_posts?id=eq.${encodeURIComponent(postId)}&select=*`),post=rows?.[0];
  if(!post)return res.status(404).json({error:"Post no encontrado"});
  if(!["approved","scheduled"].includes(post.status))return res.status(409).json({error:"Post no autorizado para publicación"});
  const accounts=await db(`vnx_social_accounts?tenant_id=eq.${encodeURIComponent(post.tenant_id)}&provider=eq.${encodeURIComponent(post.channel)}&status=eq.ready&select=*`);
  const account=accounts?.[0];
  if(!account)return res.status(409).json({error:"Canal no conectado o no preparado"});
  const gate=await authorizeExecution({
    tenantId:post.tenant_id,capability:"social_publish",actionType:"social.publish",
    context:{channel:post.channel,approval_mode:post.approval_mode},
    metadata:{post_id:post.id,channel:post.channel},
    idempotencyKey:`social:${post.id}`,
    approved:post.status==="approved"||post.approval_mode==="autonomous"
  });
  if(!gate.allowed)return res.status(gate.effect==="approval_required"?409:403).json({error:"Guardian ha bloqueado la publicación",reason:gate.reason});
  if(gate.idempotent)return res.status(200).json({ok:true,status:post.status,idempotent:true});
  await markExecutionStatus(gate.execution?.id,"dispatched",{channel:post.channel});
  await db(`vnx_social_posts?id=eq.${encodeURIComponent(postId)}`,{method:"PATCH",body:JSON.stringify({status:"publishing",updated_at:new Date().toISOString()})});
  const sent=await forward({source:"vnx-social",type:"social.publish",post,account:{id:account.id,provider:account.provider,connection_ref:account.connection_ref,external_account_id:account.external_account_id}});
  if(!sent.ok){
    await markExecutionStatus(gate.execution?.id,"failed",{reason:sent.reason||`HTTP_${sent.status||0}`}).catch(()=>{});
    await db(`vnx_social_posts?id=eq.${encodeURIComponent(postId)}`,{method:"PATCH",body:JSON.stringify({status:"failed",publish_error:sent.reason||`HTTP_${sent.status||0}`,updated_at:new Date().toISOString()})});
    return res.status(503).json({error:"Ejecutor social no configurado",detail:sent});
  }
  await completeExecution({executionId:gate.execution?.id,tenantId:post.tenant_id,capability:"social_publish",quantity:1,result:{channel:post.channel,accepted:true}}).catch(()=>{});
  return res.status(202).json({ok:true,status:"publishing"});
 }catch(e){return res.status(500).json({error:"No se pudo publicar"});}
}
