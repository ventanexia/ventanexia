import {getMonthlyUsage} from "../../lib/entitlement.js";
import {readPortalSession,pdb} from "../../lib/portal-auth.js";
function remain(end){
  if(!end)return null;
  const ms=Math.max(0,new Date(end).getTime()-Date.now());
  return {ms,days:Math.floor(ms/86400000),hours:Math.floor((ms%86400000)/3600000),minutes:Math.floor((ms%3600000)/60000)};
}
export default async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Método no permitido"});
  const s=readPortalSession(req);if(!s)return res.status(401).json({authenticated:false});
  try{
    const [tenants,ents,agents,connections,approvals,posts,changes,usage,onboarding,monthlyUsage]=await Promise.all([
      pdb(`vnx_tenants?id=eq.${encodeURIComponent(s.tenantId)}&select=id,name,status,autonomy_level,settings`),
      pdb(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=*`),
      pdb(`vnx_agents?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=agent_key,name,mode,enabled&order=name.asc`),
      pdb(`vnx_connections?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=provider,purpose,status,last_checked_at&order=provider.asc`),
      pdb(`vnx_approvals?tenant_id=eq.${encodeURIComponent(s.tenantId)}&status=eq.pending&select=id,title,rationale,risk,created_at&order=created_at.desc&limit=10`),
      pdb(`vnx_social_posts?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=id,channel,topic,copy,scheduled_for,status,approval_mode&order=scheduled_for.asc&limit=12`),
      pdb(`vnx_change_requests?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=id,request_text,category,priority,status,plan_impact,created_at&order=created_at.desc&limit=10`),
      pdb(`vnx_usage?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=capability,quantity,created_at&order=created_at.desc&limit=100`),
      pdb(`vnx_onboarding_profiles?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=status,company_profile,brand_voice,knowledge_sources,desired_channels,commercial_rules,updated_at`),
      getMonthlyUsage(s.tenantId)
    ]);
    const tenant=tenants?.[0]||{},ent=ents?.[0]||null;
    const activeAgents=(agents||[]).filter(x=>x.enabled).length;
    const connected=(connections||[]).filter(x=>["connected","testing","ready"].includes(x.status)).length;
    return res.status(200).json({
      authenticated:true,
      tenant:{id:tenant.id,name:tenant.name,status:tenant.status,autonomyLevel:tenant.autonomy_level},
      entitlement:ent?{
        state:ent.state,plan:ent.plan_key,trialEndsAt:ent.trial_ends_at,
        remaining:remain(ent.trial_ends_at),suspendReason:ent.suspend_reason,
        canReactivate:["suspended","cancelled"].includes(ent.state)&&Boolean(ent.stripe_customer_id),
        readOnly:["suspended","cancelled"].includes(ent.state)
      }:null,
      summary:{activeAgents,totalAgents:(agents||[]).length,connectedIntegrations:connected,totalIntegrations:(connections||[]).length,pendingApprovals:(approvals||[]).length},
      agents:agents||[],connections:connections||[],approvals:approvals||[],socialPosts:posts||[],changeRequests:changes||[],usage:usage||[],
      usageMonthly:monthlyUsage||{byCapability:{}},onboarding:onboarding?.[0]||null
    });
  }catch(e){
    console.error("portal_state",String(e?.message||e).slice(0,300));
    return res.status(503).json({error:"Portal no disponible"});
  }
}
