import {verifyTrialToken} from "../../lib/trial-token.js";
import {startTrial,db,TRIAL_DAYS} from "../../lib/entitlement.js";
import {requestSignals,evaluateTrialRisk,recordTrialAttempt} from "../../lib/trial-abuse.js";
import {recommendPlan} from "../../lib/pricing.js";
function clean(v,n=300){return String(v||"").trim().slice(0,n)}
async function sendTrialWelcome({email,company,planName,trialEndsAt}){
  const key=process.env.RESEND_API_KEY;if(!key||!email)return false;
  const from=process.env.TRIAL_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"ventas@ventanexia.es";
  const app=String(process.env.PUBLIC_APP_URL||"https://ventanexia.es").replace(/\/$/,"");
  const end=new Intl.DateTimeFormat("es-ES",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Madrid"}).format(new Date(trialEndsAt));
  const subject="Tus 15 días gratis de VentaNexIA ya están activos";
  const text=`Hola${company?` ${company}`:""},

Tu prueba gratuita de VentaNexIA ya está activa.

Plan de prueba: ${planName||"VentaNexIA"}
Hasta: ${end}

Durante estos 15 días:
- No necesitas introducir tarjeta.
- No se realizará ningún cobro automático.
- No estás aceptando todavía el contrato de pago.
- Puedes dejar de usar la prueba cuando quieras sin coste.

Cuando termine la prueba, VentaNexIA quedará pausado. Si te gusta y quieres seguir, te mostraremos una pantalla para continuar. Solo entonces revisarás y aceptarás el contrato, añadirás tu tarjeta y empezará la suscripción.

Entrar en VentaNexIA:
${app}/portal.html

VentaNexIA · ECOJAFER S.L.`;
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[email],subject,text})});
  return r.ok;
}
const VALID_AGENTS=new Set(["guardian","scout","enrich","outreach","inbox","qualify","scheduler","crm","proposal","content","analyst","provision"]);
function planAgentLimit(key){return key==="start"?3:key==="core"?6:12}
function trialAgents(blueprint,planKey){
  const requested=(Array.isArray(blueprint?.agents)?blueprint.agents:[]).map(x=>String(x||"").toLowerCase()).filter(x=>VALID_AGENTS.has(x));
  const base=["guardian",...requested.filter(x=>x!=="guardian")];
  if(!base.includes("provision"))base.push("provision");
  const unique=[...new Set(base)];
  if(unique.length<2)unique.push("inbox","crm");
  return unique.slice(0,planAgentLimit(planKey));
}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const solutionId=clean(req.body?.solutionId,100);
  const trialToken=clean(req.body?.trialToken,2000);
  const deviceId=clean(req.body?.deviceId,200);
  if(!solutionId||!trialToken) return res.status(400).json({error:"Solicitud de demo incompleta"});
  try{
    const sols=await db(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}&select=*`);
    const sol=sols?.[0]; if(!sol) return res.status(404).json({error:"Solicitud no encontrada"});
    let tokenCheck;
    try{tokenCheck=verifyTrialToken(trialToken,{solutionId,email:sol.email})}catch(e){
      if(String(e?.message||e).includes("TRIAL_SIGNING_SECRET")) return res.status(503).json({code:"TRIAL_NOT_CONFIGURED",error:"La demo segura todavía no está configurada."});
      throw e;
    }
    if(!tokenCheck?.ok) return res.status(401).json({code:"TRIAL_TOKEN_INVALID",error:"Este enlace de demo no es válido o ha caducado."});
    const signals=requestSignals(req,{email:sol.email,deviceId});
    const risk=await evaluateTrialRisk(signals);
    if(risk.decision==="deny"){
      await recordTrialAttempt({solutionRequestId:solutionId,signals,decision:"deny",reason:risk.reason});
      return res.status(403).json({code:"TRIAL_NOT_AVAILABLE",error:"Esta demo gratuita ya no está disponible para esta identidad o red.",nextStep:"Puedes solicitar una demostración comercial o contratar el servicio."});
    }
    if(risk.decision==="review"){
      await recordTrialAttempt({solutionRequestId:solutionId,signals,decision:"review",reason:risk.reason});
      return res.status(403).json({code:"TRIAL_REVIEW_REQUIRED",error:"Necesitamos validar esta solicitud antes de activar otra demo en este entorno.",nextStep:"Solicita una demo comercial; no perderás la propuesta generada."});
    }

    const recommendation=recommendPlan(sol.blueprint||{});
    const planKey=recommendation.key;
    const selectedAgents=trialAgents(sol.blueprint||{},planKey);
    const existing=await db(`vnx_tenants?settings->>solution_request_id=eq.${encodeURIComponent(solutionId)}&select=*`);
    let tenant=existing?.[0];
    if(!tenant){
      const rows=await db("vnx_tenants",{method:"POST",body:JSON.stringify([{
        name:sol.company,status:"trial",autonomy_level:"prepare",
        settings:{solution_request_id:sol.id,blueprint:sol.blueprint,owner_email:sol.email,trial_mode:true,recommended_plan:planKey,trial_restrictions:["no_external_writes","no_bulk_outbound","no_financial_commitments"]}
      }])});
      tenant=rows?.[0];
      if(!tenant?.id) throw new Error("TENANT_CREATE_FAILED");
      const agents=selectedAgents.map(k=>({tenant_id:tenant.id,agent_key:k,name:`VNX ${k[0].toUpperCase()+k.slice(1)}`,mode:k==="guardian"?"EXECUTE_WITHIN_POLICY":"PREPARE",enabled:true,policy:{trial:true}}));
      await db("vnx_agents",{method:"POST",body:JSON.stringify(agents)});
    }
    const ent=await startTrial(tenant.id,planKey);
    await recordTrialAttempt({solutionRequestId:solutionId,tenantId:tenant.id,signals,decision:"allow",reason:"OK"});
    await db(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}`,{method:"PATCH",body:JSON.stringify({status:"trial_ready",updated_at:new Date().toISOString()})});
    await sendTrialWelcome({email:sol.email,company:sol.company,planName:recommendation.name,trialEndsAt:ent.trial_ends_at}).catch(()=>false);
    return res.status(200).json({ok:true,tenantId:tenant.id,state:"trial",trialDays:TRIAL_DAYS,trialEndsAt:ent.trial_ends_at,plan:planKey,planName:recommendation.name,agents:selectedAgents,portalUrl:"/portal.html",limitations:["Sin cambios sensibles en sistemas externos","Sin campañas masivas","Sin compromisos económicos o contractuales"],upgradeRequired:false});
  }catch(e){
    console.error("start_trial_error",String(e?.message||e).slice(0,500));
    return res.status(500).json({error:"No se pudo iniciar la demo"});
  }
}
