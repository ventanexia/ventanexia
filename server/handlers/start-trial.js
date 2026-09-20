import {verifyTrialToken} from "../../lib/trial-token.js";
import {startTrial,db,TRIAL_DAYS} from "../../lib/entitlement.js";
import {requestSignals,evaluateTrialRisk,recordTrialAttempt} from "../../lib/trial-abuse.js";
import {recommendPlan} from "../../lib/pricing.js";
import {createCustomerCode,createActivationCode,activationHash,getTenantByCustomerCode} from "../../lib/device-licensing.js";
function clean(v,n=300){return String(v||"").trim().slice(0,n)}
async function sendTrialWelcome({email,company,planName,trialEndsAt,customerId,activationCode,downloadUrl,termsVersion}){
  const key=process.env.RESEND_API_KEY;if(!key||!email)return false;
  const from=process.env.TRIAL_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"ventas@ventanexia.es";
  const app=String(process.env.PUBLIC_APP_URL||"https://ventanexia.es").replace(/\/$/,"");
  const end=new Intl.DateTimeFormat("es-ES",{dateStyle:"long",timeStyle:"short",timeZone:"Europe/Madrid"}).format(new Date(trialEndsAt));
  const subject="Tus 15 días gratis de VentaNexIA ya están activos";
  const text=`Hola${company?` ${company}`:""},

Tu prueba gratuita de VentaNexIA ya está activa.

ID de cliente: ${customerId}
Código de activación: ${activationCode}
Plan de prueba: ${planName||"VentaNexIA"}
Hasta: ${end}
Condiciones de prueba aceptadas: ${termsVersion||"2026-09-20-v2"}

Durante estos 15 días:
- No necesitas introducir tarjeta.
- No se realizará ningún cobro automático.
- No estás aceptando todavía el contrato de pago.
- Puedes dejar de usar la prueba cuando quieras sin coste.

Cuando termine la prueba, VentaNexIA quedará pausado. Si te gusta y quieres seguir, te mostraremos una pantalla para continuar. Solo entonces revisarás y aceptarás el contrato, añadirás tu tarjeta y empezará la suscripción.

Descargar VentaNexIA:
${downloadUrl||"El enlace de descarga aparecerá en tu zona de cliente cuando la última versión esté disponible."}

Entrar en tu zona de VentaNexIA:
${app}/portal.html

Guarda tu ID y código de activación. Son datos de licencia de tu empresa y no debes compartirlos fuera de la organización registrada.

VentaNexIA · ECOJAFER S.L.`;
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[email],subject,text})});
  return r.ok;
}
async function latestDownloadUrl(){
  try{
    const rows=await db("vnx_releases?select=download_url,version&order=published_at.desc&limit=1");
    return rows?.[0]?.download_url||null;
  }catch{return null}
}
async function uniqueCustomerCode(){
  for(let i=0;i<5;i++){
    const code=createCustomerCode();
    if(!await getTenantByCustomerCode(code))return code;
  }
  throw new Error("CUSTOMER_CODE_GENERATION_FAILED");
}
async function recordTrialTerms(tenantId,details){
  try{await db("vnx_customer_events",{method:"POST",body:JSON.stringify([{tenant_id:tenantId,event_type:"trial_terms_accepted",title:"Condiciones de prueba aceptadas",details}])})}catch{}
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
  const trialTermsAccepted=req.body?.trialTermsAccepted===true;
  const noChargeAccepted=req.body?.noChargeAccepted===true;
  const trialTermsVersion=clean(req.body?.trialTermsVersion,80);
  if(!solutionId||!trialToken) return res.status(400).json({error:"Solicitud de demo incompleta"});
  if(!trialTermsAccepted||!noChargeAccepted||trialTermsVersion!=="2026-09-20-v2") return res.status(400).json({code:"TRIAL_TERMS_REQUIRED",error:"Debes aceptar las Condiciones de Prueba y confirmar que entiendes que no habrá cobro automático."});
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
    const acceptedAt=new Date().toISOString();
    const selectedAgents=trialAgents(sol.blueprint||{},planKey);
    const existing=await db(`vnx_tenants?settings->>solution_request_id=eq.${encodeURIComponent(solutionId)}&select=*`);
    let tenant=existing?.[0];
    let activationCode=null;
    if(!tenant){
      const customerCode=await uniqueCustomerCode();
      activationCode=createActivationCode();
      const rows=await db("vnx_tenants",{method:"POST",body:JSON.stringify([{
        name:sol.company,status:"trial",autonomy_level:"prepare",customer_code:customerCode,desktop_activation_hash:activationHash(activationCode),
        settings:{solution_request_id:sol.id,blueprint:sol.blueprint,owner_email:sol.email,trial_mode:true,recommended_plan:planKey,trial_terms:{version:trialTermsVersion,accepted_at:acceptedAt,license_nominative:true,non_transferable:true,confidentiality_accepted:true,no_competitive_copy:true,no_card_required:true,no_automatic_charge:true},trial_restrictions:["no_external_writes","no_bulk_outbound","no_financial_commitments"]}
      }])});
      tenant=rows?.[0];
      if(!tenant?.id) throw new Error("TENANT_CREATE_FAILED");
      const agents=selectedAgents.map(k=>({tenant_id:tenant.id,agent_key:k,name:`VNX ${k[0].toUpperCase()+k.slice(1)}`,mode:k==="guardian"?"EXECUTE_WITHIN_POLICY":"PREPARE",enabled:true,policy:{trial:true}}));
      await db("vnx_agents",{method:"POST",body:JSON.stringify(agents)});
    }else{
      if(!tenant.customer_code){
        const customerCode=await uniqueCustomerCode();
        activationCode=createActivationCode();
        const patched=await db(`vnx_tenants?id=eq.${encodeURIComponent(tenant.id)}`,{method:"PATCH",body:JSON.stringify({customer_code:customerCode,desktop_activation_hash:activationHash(activationCode)})});
        tenant=patched?.[0]||{...tenant,customer_code:customerCode};
      }else{
        activationCode=createActivationCode();
        await db(`vnx_tenants?id=eq.${encodeURIComponent(tenant.id)}`,{method:"PATCH",body:JSON.stringify({desktop_activation_hash:activationHash(activationCode)})});
      }
    }
    const ent=await startTrial(tenant.id,planKey);
    await recordTrialTerms(tenant.id,{version:trialTermsVersion,accepted_at:acceptedAt,solution_request_id:solutionId,email:sol.email,company:sol.company,license_nominative:true,non_transferable:true,no_card_required:true,no_automatic_charge:true,device_signal:deviceId||null});
    await recordTrialAttempt({solutionRequestId:solutionId,tenantId:tenant.id,signals,decision:"allow",reason:"OK"});
    await db(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}`,{method:"PATCH",body:JSON.stringify({status:"trial_ready",updated_at:new Date().toISOString()})});
    const downloadUrl=await latestDownloadUrl();
    await sendTrialWelcome({email:sol.email,company:sol.company,planName:recommendation.name,trialEndsAt:ent.trial_ends_at,customerId:tenant.customer_code,activationCode,downloadUrl,termsVersion:trialTermsVersion}).catch(()=>false);
    return res.status(200).json({ok:true,tenantId:tenant.id,customerId:tenant.customer_code,activationCode,downloadUrl,state:"trial",trialDays:TRIAL_DAYS,trialEndsAt:ent.trial_ends_at,plan:planKey,planName:recommendation.name,agents:selectedAgents,portalUrl:"/portal.html",trialTermsVersion,limitations:["Sin cambios sensibles en sistemas externos","Sin campañas masivas","Sin compromisos económicos o contractuales"],upgradeRequired:false});
  }catch(e){
    console.error("start_trial_error",String(e?.message||e).slice(0,500));
    return res.status(500).json({error:"No se pudo iniciar la demo"});
  }
}
