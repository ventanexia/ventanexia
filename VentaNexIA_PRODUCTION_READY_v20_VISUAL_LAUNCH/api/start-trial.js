import {startTrial,db,TRIAL_DAYS} from "../lib/entitlement.js";
import {requestSignals,evaluateTrialRisk,recordTrialAttempt} from "../lib/trial-abuse.js";
function clean(v,n=300){return String(v||"").trim().slice(0,n)}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const solutionId=clean(req.body?.solutionId,100);
  const deviceId=clean(req.body?.deviceId,200);
  if(!solutionId) return res.status(400).json({error:"solutionId obligatorio"});
  try{
    const sols=await db(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}&select=*`);
    const sol=sols?.[0]; if(!sol) return res.status(404).json({error:"Solicitud no encontrada"});
    const signals=requestSignals(req,{email:sol.email,deviceId});
    const risk=await evaluateTrialRisk(signals);
    if(risk.decision==="deny"){
      await recordTrialAttempt({solutionRequestId:solutionId,signals,decision:"deny",reason:risk.reason});
      return res.status(403).json({
        code:"TRIAL_NOT_AVAILABLE",
        error:"Esta demo gratuita ya no está disponible para esta identidad o red.",
        nextStep:"Puedes solicitar una demostración comercial o contratar el servicio."
      });
    }
    if(risk.decision==="review"){
      await recordTrialAttempt({solutionRequestId:solutionId,signals,decision:"review",reason:risk.reason});
      return res.status(403).json({
        code:"TRIAL_REVIEW_REQUIRED",
        error:"Necesitamos validar esta solicitud antes de activar otra demo en este entorno.",
        nextStep:"Solicita una demo comercial; no perderás el blueprint generado."
      });
    }

    const existing=await db(`vnx_tenants?settings->>solution_request_id=eq.${encodeURIComponent(solutionId)}&select=*`);
    let tenant=existing?.[0];
    if(!tenant){
      const rows=await db("vnx_tenants",{method:"POST",body:JSON.stringify([{
        name:sol.company,status:"trial",autonomy_level:"prepare",
        settings:{
          solution_request_id:sol.id,blueprint:sol.blueprint,owner_email:sol.email,
          trial_mode:true,trial_restrictions:["no_external_writes","no_bulk_outbound","no_financial_commitments"]
        }
      }])});
      tenant=rows?.[0];
      if(!tenant?.id) throw new Error("TENANT_CREATE_FAILED");
      const agents=["guardian","qualify","crm","content","analyst","provision"].map(k=>({
        tenant_id:tenant.id,agent_key:k,name:`VNX ${k[0].toUpperCase()+k.slice(1)}`,
        mode:k==="guardian"?"EXECUTE_WITHIN_POLICY":"PREPARE",enabled:true,policy:{trial:true}
      }));
      await db("vnx_agents",{method:"POST",body:JSON.stringify(agents)});
    }
    const ent=await startTrial(tenant.id,"core");
    await recordTrialAttempt({solutionRequestId:solutionId,tenantId:tenant.id,signals,decision:"allow",reason:"OK"});
    await db(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}`,{
      method:"PATCH",body:JSON.stringify({status:"diagnostic",updated_at:new Date().toISOString()})
    });
    return res.status(200).json({
      ok:true,tenantId:tenant.id,state:"trial",trialDays:TRIAL_DAYS,
      trialEndsAt:ent.trial_ends_at,
      limitations:["Sin escrituras sensibles en sistemas externos","Sin campañas masivas","Sin compromisos económicos/contractuales"],
      upgradeRequired:true
    });
  }catch(e){
    console.error("start_trial_error",String(e?.message||e).slice(0,500));
    return res.status(500).json({error:"No se pudo iniciar la demo"});
  }
}
