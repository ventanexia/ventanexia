import {authenticatePortal,pdb} from "../../lib/portal-auth.js";
import {recommendPlan} from "../../lib/pricing.js";
import {requireSameOrigin} from "../../lib/request-security.js";
function clean(v,n=6000){return String(v||"").trim().slice(0,n)}
async function ai(requirement,current={}){
 const key=process.env.OPENAI_API_KEY;
 if(!key)return {summary:"Solicitud recibida para análisis.",agents:[],integrations_required:[],complexity:"Por validar",automations:[requirement],next_step:"Analizar alcance"};
 const model=process.env.OPENAI_MODEL||"gpt-5.6-terra";
 const instructions=`Eres VNX Change Architect. Convierte una petición de un cliente existente en un blueprint incremental.
No inventes accesos ni capacidades. No incluyas secretos. No prometas resultados.
Devuelve SOLO JSON con summary,agents[],integrations_required[],automations[],data_needed[],approvals_required[],complexity,next_step.
La petición es incremental: conserva lo existente y especifica solo lo nuevo o modificado.`;
 const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,max_output_tokens:900,instructions,input:JSON.stringify({requirement,current})})});
 const j=await r.json();if(!r.ok)throw new Error("AI_ERROR");
 const t=j.output_text||"",a=t.indexOf("{"),b=t.lastIndexOf("}");if(a<0||b<a)throw new Error("BAD_JSON");
 return JSON.parse(t.slice(a,b+1));
}
async function forward(payload){
 const url=process.env.N8N_AUTOMATION_WEBHOOK;if(!url)return false;
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.AUTOMATION_WEBHOOK_SECRET||""}`},body:JSON.stringify(payload)});
 return r.ok;
}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  if(!requireSameOrigin(req))return res.status(403).json({error:"Origen no permitido"});
 const s=await authenticatePortal(req);if(!s)return res.status(401).json({error:"No autorizado"});
 const requestText=clean(req.body?.request,6000),priority=clean(req.body?.priority||"normal",20);
 if(requestText.length<15)return res.status(400).json({error:"Describe con algo más de detalle lo que necesitas."});
 try{
   const [agents,connections,ent] = await Promise.all([
     pdb(`vnx_agents?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=agent_key,name,enabled`),
     pdb(`vnx_connections?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=provider,purpose,status`),
     pdb(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=plan_key,state`)
   ]);
   const currentEnt=ent?.[0]||{};
   if(!["active","trial"].includes(currentEnt.state)) return res.status(403).json({error:"Tu cuenta está en modo solo lectura hasta reactivar el servicio."});
   const blueprint=await ai(requestText,{agents,connections});
   const rec=recommendPlan(blueprint);
   const currentPlan=currentEnt.plan_key||"core";
   const order={start:1,core:2,scale:3,enterprise:4};
   const planImpact={
      currentPlan,recommendedPlan:rec.key,
      upgradeSuggested:(order[rec.key]||99)>(order[currentPlan]||0),
      recommendation:rec
   };
   const rows=await pdb("vnx_change_requests",{method:"POST",body:JSON.stringify([{
     tenant_id:s.tenantId,requested_by:s.email,request_text:requestText,
     category:"custom_automation",priority:["low","normal","high","urgent"].includes(priority)?priority:"normal",
     status:"blueprint_ready",blueprint,plan_impact:planImpact
   }])});
   const cr=rows?.[0];
   await forward({source:"vnx-portal",type:"client.change_request",tenantId:s.tenantId,changeRequest:cr});
   return res.status(201).json({ok:true,id:cr?.id,blueprint,planImpact});
 }catch(e){
   console.error("portal_change_request",String(e?.message||e).slice(0,300));
   return res.status(500).json({error:"No se pudo analizar la solicitud"});
 }
}
