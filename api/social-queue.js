import crypto from "node:crypto";
function clean(v,n=6000){return String(v||"").trim().slice(0,n)}
function auth(req){
 const exp=process.env.AUTOMATION_WEBHOOK_SECRET;
 const got=clean(req.headers.authorization||"",500).replace(/^Bearer\s+/i,"");
 if(!exp||!got)return false;
 try{return exp.length===got.length&&crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(got))}catch{return false}
}
function cfg(){const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");return{url,key}}
async function db(path,options={}){const {url,key}=cfg();const r=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation",...(options.headers||{})}});const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch{j=t}if(!r.ok)throw new Error(`DB_${r.status}`);return j}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
 if(!auth(req))return res.status(401).json({error:"No autorizado"});
 try{
   const tenantId=clean(req.body?.tenantId,100),campaignId=clean(req.body?.campaignId,100);
   const posts=Array.isArray(req.body?.posts)?req.body.posts.slice(0,90):[];
   if(!tenantId||!posts.length)return res.status(400).json({error:"tenantId y posts obligatorios"});
   const now=Date.now();
   const rows=posts.map(p=>{
     const mode=["autonomous","approval_required","draft_only"].includes(p.approval_mode)?p.approval_mode:"approval_required";
     const scheduled=new Date(now+Math.max(0,Number(p.scheduled_offset_days||0))*86400000).toISOString();
     return {
       tenant_id:tenantId,campaign_id:campaignId||null,channel:clean(p.channel,50),
       post_type:clean(p.post_type||"text",40),topic:clean(p.topic,500),copy:clean(p.copy,6000),
       hashtags:Array.isArray(p.hashtags)?p.hashtags.slice(0,30):[],utm:p.utm||{},
       scheduled_for:scheduled,approval_mode:mode,
       status:mode==="autonomous"?"scheduled":mode==="approval_required"?"approval_required":"draft"
     };
   });
   const saved=await db("vnx_social_posts",{method:"POST",body:JSON.stringify(rows)});
   return res.status(201).json({ok:true,count:saved?.length||0,posts:saved});
 }catch(e){return res.status(500).json({error:"No se pudo crear la cola social"});}
}
