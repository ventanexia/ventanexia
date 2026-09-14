import {enforceEntitlement} from "../lib/entitlement.js";
function clean(v,n=100){return String(v||"").trim().slice(0,n)}
export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  const tenantId=clean(req.query?.tenantId,100), capability=clean(req.query?.capability||"dashboard",120);
  if(!tenantId) return res.status(400).json({error:"tenantId obligatorio"});
  try{
    const a=await enforceEntitlement(tenantId,capability);
    const e=a.entitlement||{};
    return res.status(200).json({
      allowed:a.allowed,state:a.state,reason:a.reason,
      trialEndsAt:e.trial_ends_at||null,plan:e.plan_key||null
    });
  }catch{return res.status(503).json({error:"Licencia no disponible"});}
}
