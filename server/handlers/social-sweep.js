import {authorizeExecution,completeExecution,markExecutionStatus} from "../../lib/execution-gateway.js";
import crypto from "node:crypto";
function auth(req){const exp=process.env.CRON_SECRET||process.env.AUTOMATION_WEBHOOK_SECRET,got=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");if(!exp||!got)return false;try{return exp.length===got.length&&crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(got))}catch{return false}}
function cfg(){const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");return{url,key}}
async function db(path,options={}){const {url,key}=cfg();const r=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation",...(options.headers||{})}});const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch{j=t}if(!r.ok)throw new Error(`DB_${r.status}`);return j}
async function forward(payload){const url=process.env.N8N_AUTOMATION_WEBHOOK;if(!url)return false;const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.AUTOMATION_WEBHOOK_SECRET||""}`},body:JSON.stringify(payload)});return r.ok}
export default async function handler(req,res){
 if(!["GET","POST"].includes(req.method))return res.status(405).json({error:"Método no permitido"});
 if(!auth(req))return res.status(401).json({error:"No autorizado"});
 try{
   const now=new Date().toISOString();
   const posts=await db(`vnx_social_posts?status=eq.scheduled&scheduled_for=lte.${encodeURIComponent(now)}&select=*&limit=25`);
   let queued=0,blocked=0;
   for(const post of posts||[]){
     const accounts=await db(`vnx_social_accounts?tenant_id=eq.${encodeURIComponent(post.tenant_id)}&provider=eq.${encodeURIComponent(post.channel)}&status=eq.ready&select=id,provider,connection_ref,external_account_id`);
     if(!accounts?.[0]){blocked++;continue}
     const gate=await authorizeExecution({tenantId:post.tenant_id,capability:"social_publish",actionType:"social.publish",context:{channel:post.channel,approval_mode:post.approval_mode},metadata:{post_id:post.id,channel:post.channel},idempotencyKey:`social:${post.id}`,approved:post.approval_mode==="autonomous"});
     if(!gate.allowed){blocked++;continue}
     if(gate.idempotent){queued++;continue}
     await markExecutionStatus(gate.execution?.id,"dispatched",{channel:post.channel}).catch(()=>{});
     const ok=await forward({source:"vnx-social",type:"social.publish",post,account:accounts[0]});
     if(ok){await db(`vnx_social_posts?id=eq.${post.id}`,{method:"PATCH",body:JSON.stringify({status:"publishing",updated_at:new Date().toISOString()})});await completeExecution({executionId:gate.execution?.id,tenantId:post.tenant_id,capability:"social_publish",quantity:1,result:{channel:post.channel,accepted:true}}).catch(()=>{});queued++}
     else await markExecutionStatus(gate.execution?.id,"failed",{reason:"EXECUTOR_REJECTED"}).catch(()=>{});
   }
   return res.status(200).json({ok:true,queued,blocked});
 }catch(e){return res.status(500).json({error:"Social sweep failed"});}
}
