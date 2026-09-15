import {issueTrialToken} from "../../lib/trial-token.js";
import {recommendPlan} from "../../lib/pricing.js";
import {aiConfigured,createAIResponse} from "../../lib/ai-client.js";
function clean(v,max=6000){return String(v||"").trim().slice(0,max)}
function emailOk(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)}
function scoreRequest({company,requestText,volume,role}){
  let s=0;if(company)s+=20;if(requestText.length>=60)s+=20;
  if(/crm|lead|venta|ventas|comercial|seguimiento|email|correo|agenda|reuni|automat|cliente|prospe|factur|pago|seo|redes|social|whatsapp/.test(requestText.toLowerCase()))s+=30;
  if(Number(volume||0)>0)s+=15;if(/ceo|director|gerente|responsable|dueñ|socio|administrador|fundador/.test(String(role||"").toLowerCase()))s+=15;
  return Math.min(100,s);
}
function fallbackBlueprint(requestText){
  const t=String(requestText||"").toLowerCase(),modules=[];
  if(/lead|captaci|prospe|cliente/.test(t))modules.push("Buscar posibles clientes");
  if(/email|correo|respuesta|seguimiento|whatsapp|mensaje/.test(t))modules.push("Responder mensajes y recordar a quién volver a contactar");
  if(/crm|pipeline|oportunidad/.test(t))modules.push("Mantener ordenada la información de clientes y ventas");
  if(/agenda|reuni|cita/.test(t))modules.push("Organizar reuniones en la agenda");
  if(/pago|cobro|factur/.test(t))modules.push("Ayudar con cobros y facturas");
  if(/seo|google|posicion/.test(t))modules.push("Preparar contenido para mejorar la presencia en Google");
  if(/redes|linkedin|instagram|social/.test(t))modules.push("Preparar publicaciones para redes sociales");
  if(!modules.length)modules.push("Quitar trabajo repetitivo y dejar las tareas más ordenadas");
  return {summary:"Esto es lo que VentaNexIA podría hacer por ti según lo que nos has contado.",goals:["Ahorrarte trabajo repetitivo","Responder más rápido","Tener todo mejor organizado"],modules,agents:["Guardian","Qualify","CRM","Analyst"],integrations_required:["Revisaremos contigo qué programas utilizas y cuáles habría que conectar"],automations:["Guardar cada nueva consulta","Detectar quién tiene interés real","Recomendar qué hacer después","Recordar a quién volver a contactar"],data_needed:["Cómo trabajas ahora","Por dónde te escriben los clientes","Qué programas utilizas","Qué cosas quieres aprobar tú"],approvals_required:["Dar permiso para conectar tus programas","Activarlo para trabajar de verdad","Aceptar precios y condiciones del servicio"],complexity:"Por validar",risk_notes:["No conectaremos ni cambiaremos nada importante sin tu permiso."],next_step:"Revisar contigo los últimos detalles y dejar clara la propuesta."};
}
async function aiBlueprint(input){
  const fallback=fallbackBlueprint(input.requestText);
  if(!aiConfigured())return fallback;
  const instructions=`Eres el ayudante de VentaNexIA que prepara una propuesta para una persona que NO conoce informática ni vocabulario comercial. Convierte su petición en una propuesta clara, sencilla y concreta. No inventes capacidades, precios, conexiones, resultados ni plazos. Devuelve SOLO JSON válido con estas claves exactas: summary:string, goals:string[], modules:string[], agents:string[], integrations_required:string[], automations:string[], data_needed:string[], approvals_required:string[], complexity:"Baja"|"Media"|"Alta"|"Por validar", risk_notes:string[], next_step:string. En agents usa solo: Guardian, Scout, Enrich, Outreach, Inbox, Qualify, Scheduler, CRM, Proposal, Content, Analyst, Provision.`;
  try{
    const r=await createAIResponse({store:false,max_output_tokens:900,instructions,input:JSON.stringify({company:input.company,role:input.role,request:input.requestText,monthly_leads:input.volume||null,current_tools:input.tools||null})});
    if(!r.ok)return fallback;
    const text=String(r.data?.output_text||"").trim();
    const start=text.indexOf("{"),end=text.lastIndexOf("}");
    if(start<0||end<start)return fallback;
    const parsed=JSON.parse(text.slice(start,end+1));
    return parsed&&typeof parsed==="object"?parsed:fallback;
  }catch{return fallback}
}
async function saveSupabase(row){
  try{
    const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)return null;
    const r=await fetch(`${url}/rest/v1/vnx_solution_requests`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify([row])});
    if(!r.ok)return null;const j=await r.json().catch(()=>[]);return j?.[0]||null;
  }catch{return null}
}
async function forward(payload){try{const url=process.env.N8N_AUTOMATION_WEBHOOK;if(!url)return;const key=process.env.AUTOMATION_WEBHOOK_SECRET||"";await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify(payload)})}catch{}}
export default async function handler(req,res){
  try{
    if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
    const b=req.body||{};if(clean(b.website,200))return res.status(200).json({ok:true});
    const name=clean(b.name,250),company=clean(b.company,250),email=clean(b.email,320).toLowerCase(),role=clean(b.role,200),requestText=clean(b.request,6000),tools=clean(b.tools,1000),volume=clean(b.volume,30),consent=b.consent===true;
    if(!name||!company||!email||requestText.length<20||!consent)return res.status(400).json({error:"Completa empresa, nombre, email, necesidad y consentimiento."});
    if(!emailOk(email))return res.status(400).json({error:"Email no válido"});
    const fitScore=scoreRequest({company,requestText,volume,role});
    const blueprint=await aiBlueprint({company,role,requestText,volume,tools});
    let planRecommendation=null;try{planRecommendation=recommendPlan(blueprint)}catch{}
    const stored=await saveSupabase({name,company,email,role:role||null,request_text:requestText,current_tools:tools||null,monthly_leads:volume||null,fit_score:fitScore,blueprint,status:"blueprint_ready",consent:true,source_url:clean(b.source_url,1000)||null});
    const requestId=stored?.id||null;
    await forward({source:"ventanexia",type:"solution.blueprint_ready",requestId,company,email,fitScore,blueprint,ts:new Date().toISOString()});
    let trialToken=null;if(requestId){try{trialToken=issueTrialToken({solutionId:requestId,email})}catch{}}
    return res.status(200).json({ok:true,requestId,trialToken,trialReady:Boolean(requestId&&trialToken),fitBand:fitScore>=85?"PRIORITY":fitScore>=70?"QUALIFIED":fitScore>=50?"NURTURE":"DISCOVERY",blueprint,planRecommendation,productionActivation:"REQUIRES_GUARDIAN_APPROVAL"});
  }catch(e){
    console.error("solution-builder",e);
    return res.status(200).json({ok:true,requestId:null,trialToken:null,trialReady:false,fitBand:"DISCOVERY",blueprint:fallbackBlueprint(clean(req.body?.request,6000)),planRecommendation:null,productionActivation:"REQUIRES_GUARDIAN_APPROVAL",warning:"La propuesta se ha preparado en modo seguro."});
  }
}
