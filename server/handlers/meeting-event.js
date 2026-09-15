import crypto from "node:crypto";
import {aiConfigured,createAIResponse} from "../../lib/ai-client.js";

function clean(v,max=6000){return String(v||"").trim().slice(0,max)}
function auth(req){
  const expected=process.env.AUTOMATION_WEBHOOK_SECRET;
  const got=clean(req.headers["x-vnx-automation-key"]||req.headers["authorization"]||"",500).replace(/^Bearer\s+/i,"");
  if(!expected||!got) return false;
  try{return expected.length===got.length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(got))}catch{return false}
}
async function hsPatch(dealId,properties){
  const token=process.env.HUBSPOT_ACCESS_TOKEN;
  if(!token) throw new Error("HUBSPOT_NOT_CONFIGURED");
  const r=await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`,{
    method:"PATCH",headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({properties})
  });
  if(!r.ok) throw new Error(`HubSpot ${r.status}`);
}
async function generate(kind,input){
  if(!aiConfigured()) return null;
  const instruction=kind==="brief"
    ?"Crea un briefing comercial breve en español de España. Incluye: empresa, contexto, hipótesis de dolor, preguntas de diagnóstico, riesgos, siguiente objetivo. No inventes hechos."
    :"Redacta un borrador de seguimiento comercial breve. Resume lo acordado, siguiente paso y CTA. No inventes precios, compromisos ni fechas.";
  const r=await createAIResponse({store:false,max_output_tokens:500,instructions:instruction,input});
  if(!r.ok) return null;
  const j=r.data;
  return j.output_text||null;
}
async function forward(payload){
  const url=process.env.N8N_AUTOMATION_WEBHOOK;
  if(!url) return;
  const key=process.env.AUTOMATION_WEBHOOK_SECRET||"";
  await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(payload)}).catch(()=>{});
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!auth(req)) return res.status(401).json({error:"No autorizado"});

  const dealId=clean(req.body?.dealId,100);
  const eventType=clean(req.body?.eventType,40);
  const context=clean(req.body?.context,6000);
  if(!dealId||!eventType) return res.status(400).json({error:"dealId y eventType son obligatorios"});

  const map={
    booked:{dealstage:"presentationscheduled",hs_next_step:"Realizar diagnóstico y registrar conclusiones"},
    completed:{dealstage:"decisionmakerboughtin",hs_next_step:"Preparar propuesta con alcance y siguiente paso"},
    no_show:{hs_next_step:"Reagendar reunión y confirmar interés"},
    cancelled:{hs_next_step:"Revisar cancelación y proponer nueva fecha"}
  };
  const properties=map[eventType];
  if(!properties) return res.status(400).json({error:"eventType no soportado"});

  try{
    await hsPatch(dealId,properties);
    const ai=eventType==="booked"
      ? await generate("brief",context||`Negocio HubSpot ${dealId}. Preparar briefing sin inventar datos.`)
      : eventType==="completed"
        ? await generate("followup",context||`Reunión del negocio HubSpot ${dealId}. Preparar seguimiento conservador.`)
        : null;

    const payload={source:"ventanexia",type:`meeting.${eventType}`,dealId,context,ai,ts:new Date().toISOString()};
    await forward(payload);
    console.log(JSON.stringify({event:"meeting_event",eventType,dealId,aiGenerated:!!ai,ts:payload.ts}));
    return res.status(200).json({ok:true,eventType,dealId,ai});
  }catch(e){
    console.error(JSON.stringify({event:"meeting_event_error",eventType,dealId,error:String(e?.message||e).slice(0,400)}));
    return res.status(500).json({error:"No se pudo procesar el evento"});
  }
}
