import crypto from "node:crypto";

function clean(v,n=4000){return String(v||"").trim().slice(0,n)}
function authorized(req){const expected=String(process.env.AUTOMATION_WEBHOOK_SECRET||"");const got=clean(req.headers["x-vnx-automation-key"]||req.headers["authorization"]||"",500).replace(/^Bearer\s+/i,"");if(!expected||!got)return false;const a=Buffer.from(got),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b)}
function sb(){const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");return {url,key,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=minimal"}}}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  if(!authorized(req))return res.status(401).json({error:"No autorizado"});
  const customerId=clean(req.body?.stripe_customer_id,120),contractId=clean(req.body?.contract_id,120),tenantId=clean(req.body?.tenant_id,120),eventType=clean(req.body?.event_type||"conversation",80),title=clean(req.body?.title||"Actividad de cliente",240),question=clean(req.body?.question,8000),answer=clean(req.body?.answer,12000),channel=clean(req.body?.channel,80),extra=req.body?.details&&typeof req.body.details==="object"?req.body.details:{};
  if(!customerId&&!contractId&&!tenantId)return res.status(400).json({error:"Falta identificador del cliente"});
  try{const c=sb();const details={...extra,channel:channel||null,question:question||null,answer:answer||null};const r=await fetch(`${c.url}/rest/v1/vnx_customer_events`,{method:"POST",headers:c.headers,body:JSON.stringify({stripe_customer_id:customerId||null,contract_id:contractId||null,tenant_id:tenantId||null,event_type:eventType,title,details})});if(!r.ok)throw new Error(`SUPABASE_${r.status}`);return res.status(201).json({ok:true})}catch(e){return res.status(500).json({error:"No se pudo registrar la actividad",detail:String(e?.message||e).slice(0,200)})}
}
