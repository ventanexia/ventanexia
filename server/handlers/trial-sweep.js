import crypto from "node:crypto";
import {db,suspendTenant} from "../../lib/entitlement.js";
function authorized(req){
  const exp=process.env.CRON_SECRET||process.env.AUTOMATION_WEBHOOK_SECRET;
  const got=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!exp||!got)return false;
  try{return exp.length===got.length&&crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(got))}catch{return false}
}
export default async function handler(req,res){
  if(!["GET","POST"].includes(req.method)) return res.status(405).json({error:"Método no permitido"});
  if(!authorized(req)) return res.status(401).json({error:"No autorizado"});
  try{
    const now=new Date().toISOString();
    const rows=await db(`vnx_entitlements?state=eq.trial&trial_ends_at=lt.${encodeURIComponent(now)}&select=tenant_id`);
    let count=0;
    for(const x of rows||[]){await suspendTenant(x.tenant_id,"TRIAL_EXPIRED");count++}
    return res.status(200).json({ok:true,suspended:count});
  }catch(e){return res.status(500).json({error:"Sweep failed"});}
}
