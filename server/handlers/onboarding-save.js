import {authenticatePortal,pdb} from "../../lib/portal-auth.js";
import {requireSameOrigin} from "../../lib/request-security.js";
function clean(v,n=2000){return String(v||"").trim().slice(0,n)}
function arr(v,max=12,n=300){return (Array.isArray(v)?v:[]).slice(0,max).map(x=>clean(x,n)).filter(Boolean)}
const CHANNELS=new Set(["email","crm","calendar","social","analytics","website","payments","support"]);
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  if(!requireSameOrigin(req))return res.status(403).json({error:"Origen no permitido"});
  const s=await authenticatePortal(req);if(!s)return res.status(401).json({error:"No autorizado"});
  try{
    const ents=await pdb(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=state`);
    const state=ents?.[0]?.state;
    if(!["active","trial"].includes(state)) return res.status(403).json({error:"Tu cuenta está en modo solo lectura hasta reactivar el servicio."});
    const b=req.body||{};
    const companyProfile={
      business_summary:clean(b.businessSummary,2500),
      target_customers:clean(b.targetCustomers,2500),
      website:clean(b.website,500)
    };
    const brandVoice={tone:clean(b.brandVoice,1200),forbidden_claims:clean(b.forbiddenClaims,1200)};
    const knowledgeSources=arr(b.knowledgeSources,12,800).map(url=>({type:"url",url}));
    const desiredChannels=arr(b.channels,12,50).filter(x=>CHANNELS.has(x));
    const commercialRules={
      discounts_require_approval:b.discountsRequireApproval!==false,
      contracts_require_approval:b.contractsRequireApproval!==false,
      bulk_outbound_requires_approval:b.bulkOutboundRequiresApproval!==false,
      notes:clean(b.rulesNotes,1800)
    };
    const status=desiredChannels.length?"needs_connections":"ready_for_review";
    const payload={tenant_id:s.tenantId,company_profile:companyProfile,brand_voice:brandVoice,knowledge_sources:knowledgeSources,desired_channels:desiredChannels,commercial_rules:commercialRules,status,updated_at:new Date().toISOString()};
    const existing=await pdb(`vnx_onboarding_profiles?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=tenant_id`);
    const rows=existing?.[0]
      ?await pdb(`vnx_onboarding_profiles?tenant_id=eq.${encodeURIComponent(s.tenantId)}`,{method:"PATCH",body:JSON.stringify(payload)})
      :await pdb("vnx_onboarding_profiles",{method:"POST",body:JSON.stringify([payload])});
    return res.status(200).json({ok:true,profile:rows?.[0]||payload});
  }catch(e){console.error("onboarding_save",String(e?.message||e).slice(0,300));return res.status(500).json({error:"No se pudo guardar la configuración"})}
}
