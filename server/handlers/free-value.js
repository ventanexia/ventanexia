import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";

function clean(v,max=1200){return String(v||"").trim().slice(0,max)}
function parseJson(text){
  const s=String(text||"").trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim();
  try{return JSON.parse(s)}catch{}
  const a=s.indexOf("{"),b=s.lastIndexOf("}");
  if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch{}}
  return null;
}

async function runWithSearch(prompt){
  const token=String(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||"");
  if(!token) throw new Error("AI_GATEWAY_NOT_CONFIGURED");
  const result=await generateText({
    model:"openai/gpt-5.6-sol",
    system:`Eres el analista comercial de VentaNexIA. Tu trabajo es ayudar antes de vender nada. Piensa como un director comercial excelente. Usa búsqueda web para cualquier empresa, dirección, teléfono, email, web o dato actual. Nunca inventes contactos. Si no encuentras un dato, escribe "No publicado". Solo usa emails empresariales publicados públicamente. No uses emails personales privados. Devuelve SOLO JSON válido, sin markdown.`,
    prompt,
    tools:{perplexity_search:gateway.tools.perplexitySearch()},
    maxOutputTokens:2600
  });
  const parsed=parseJson(result.text);
  if(!parsed) throw new Error("INVALID_AI_OUTPUT");
  return parsed;
}

async function prospects({offer,area,website}){
  const prompt=`El usuario quiere vender esto:\n${offer}\n\nZona preferida: ${area||"España"}\nWeb del usuario: ${website||"No indicada"}\n\nIMPORTANTE: el usuario NO tiene por qué saber quién es su cliente ideal. Primero deduce tú qué tipos de empresas tienen más probabilidad de necesitar lo que vende. Después usa búsqueda web para encontrar EXACTAMENTE 3 empresas reales de la zona que encajen. No elijas empresas solo porque sean del mismo sector: explica la necesidad concreta que podría tener cada una.\n\nPara cada empresa busca y verifica: nombre, actividad, dirección pública, web oficial, teléfono público y email comercial público si existe. Si no hay email fiable, pon "No publicado". Prepara un ángulo comercial personalizado, un asunto de email, un borrador de email breve y profesional, una propuesta de imagen/material comercial que tendría sentido adjuntar y una siguiente acción. No afirmes que sabes que necesitan comprar; habla de encaje potencial basado en su actividad.\n\nDevuelve exactamente esta estructura JSON:\n{"agent_name":"Agente Captador de Clientes","agent_goal":"Identifica quién puede necesitar lo que vendes, encuentra oportunidades reales y deja el contacto preparado","title":"3 oportunidades comerciales reales","summary":"Incluye también en esta frase qué perfil de comprador has decidido buscar y por qué.","items":[{"name":"","fit":"Encaja mucho|Encaja|Encaja poco","why":"","address":"","website":"","phone":"","email":"","sales_angle":"","email_subject":"","email_body":"","image_concept":"","image_text":"","next_action":"","sources":["https://..."]}],"trust_note":"Datos empresariales obtenidos de fuentes públicas y pendientes de verificación antes de contactar."}`;
  return runWithSearch(prompt);
}

async function genericIdeas({mode,offer,area,website,problem}){
  const prompt=mode==="diagnosis"
    ?`Haz un diagnóstico práctico de este negocio. Qué vende: ${offer||"No indicado"}. Zona: ${area||"No indicada"}. Web: ${website||"No indicada"}. Problema: ${problem||"No indicado"}. Si hay web, búscala y analízala. Devuelve SOLO JSON con {"title":"Diagnóstico rápido","summary":"","findings":[{"issue":"","why":"","priority":"Alta|Media|Baja"}],"actions":[{"action":"","impact":""}],"example":{"title":"","content":""},"sources":["https://..."],"question":"¿Te encaja este enfoque o quieres que cambie algo?"}. Incluye 3 hallazgos y 3 acciones concretas.`
    :`Genera 3 ideas concretas para mejorar este negocio. Qué vende: ${offer||"No indicado"}. Zona: ${area||"No indicada"}. Web: ${website||"No indicada"}. Problema: ${problem||"No indicado"}. Si hay web, búscala y úsala. Devuelve SOLO JSON con {"title":"3 ideas que pondría en marcha","summary":"","ideas":[{"idea":"","why":"","example":"","tomorrow":""}],"sources":["https://..."],"question":"¿Cuál de las 3 quieres que desarrolle primero?"}.`;
  return runWithSearch(prompt);
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const b=req.body||{};
  const mode=["prospects","diagnosis","ideas"].includes(String(b.mode))?String(b.mode):"ideas";
  const offer=clean(b.offer,1000),area=clean(b.area,250),website=clean(b.website,600),problem=clean(b.problem,1200);
  if(mode==="prospects"&&!offer) return res.status(400).json({error:"Cuéntame qué vendes o qué servicio ofreces."});
  if(mode!=="prospects"&&!offer&&!problem&&!website) return res.status(400).json({error:"Cuéntame al menos qué vendes, tu problema o tu web."});
  try{
    const result=mode==="prospects"?await prospects({offer,area,website}):await genericIdeas({mode,offer,area,website,problem});
    return res.status(200).json({ok:true,mode,result});
  }catch(e){
    console.error("free-value",e?.message||e);
    return res.status(503).json({error:"No he podido completar la búsqueda con datos públicos fiables ahora mismo. No voy a inventarte clientes. Inténtalo de nuevo en unos segundos."});
  }
}
