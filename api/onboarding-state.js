import {readPortalSession,pdb} from "../lib/portal-auth.js";
export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  const s=readPortalSession(req);if(!s)return res.status(401).json({error:"No autorizado"});
  try{
    const [profiles,connections,ents]=await Promise.all([
      pdb(`vnx_onboarding_profiles?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=*`),
      pdb(`vnx_connections?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=provider,purpose,status&order=provider.asc`),
      pdb(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=state,plan_key`)
    ]);
    return res.status(200).json({ok:true,profile:profiles?.[0]||null,connections:connections||[],entitlement:ents?.[0]||null});
  }catch(e){return res.status(503).json({error:"Onboarding no disponible"})}
}
