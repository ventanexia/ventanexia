function matches(cond={},ctx={}){
  for(const [k,v] of Object.entries(cond)){
    if(Array.isArray(v)){ if(!v.includes(ctx[k])) return false; }
    else if(ctx[k]!==v) return false;
  }
  return true;
}
async function sb(path){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_NOT_CONFIGURED");
  const r=await fetch(`${url}/rest/v1/${path}`,{headers:{"apikey":key,"Authorization":`Bearer ${key}`}});
  const j=await r.json(); if(!r.ok) throw new Error(`SUPABASE_${r.status}`); return j;
}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const tenantId=String(req.body?.tenantId||"").slice(0,100);
  const action=String(req.body?.action||"").slice(0,150);
  const context=req.body?.context||{};
  if(!tenantId||!action) return res.status(400).json({error:"tenantId y action obligatorios"});
  try{
    const rows=await sb(`vnx_policies?tenant_id=eq.${encodeURIComponent(tenantId)}&select=*&order=priority.asc`);
    const candidates=rows.filter(p=>p.policy_key===action||p.policy_key==="*").filter(p=>matches(p.conditions||{},context));
    const chosen=candidates[0]||{effect:"approval_required",policy_key:"default_guardian"};
    return res.status(200).json({ok:true,effect:chosen.effect,policy:chosen.policy_key});
  }catch(e){
    return res.status(503).json({error:"Policy engine no disponible"});
  }
}
