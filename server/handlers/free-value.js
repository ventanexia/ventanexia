import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";

function clean(v,max=1200){return String(v||"").trim().slice(0,max)}
function extractText(data){
  if(typeof data?.output_text==="string"&&data.output_text.trim()) return data.output_text.trim();
  const out=Array.isArray(data?.output)?data.output:[];
  const parts=[];
  for(const item of out){
    if(item?.type==="message"&&Array.isArray(item.content)){
      for(const c of item.content){
        if(typeof c?.text==="string"&&c.text.trim()) parts.push(c.text.trim());
      }
    }
  }
  return parts.join("\n").trim();
}
function parseJson(text){
  const s=String(text||"").trim().replace(/^```json\s*/i,"").replace(/```$/i,"").trim();
  try{return JSON.parse(s)}catch{}
  const a=s.indexOf("{"),b=s.lastIndexOf("}");
  if(a>=0&&b>a){try{return JSON.parse(s.slice(a,b+1))}catch{}}
  return null;
}

const systemPrompt=`Eres el analista comercial de VentaNexIA. Tu trabajo es generar oportunidades reales y trabajo comercial útil. Para empresas, webs, direcciones, teléfonos, emails o cualquier dato actual debes usar búsqueda web. Nunca inventes contactos. Solo usa emails empresariales publicados públicamente. Si un dato no aparece de forma fiable, escribe "No publicado". Distingue hechos verificados de hipótesis comerciales. Devuelve SOLO JSON válido, sin markdown.`;

async function nativeWebSearch(prompt){
  const token=String(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||"");
  if(!token) throw new Error("AI_GATEWAY_NOT_CONFIGURED");
  const body={
    model:"openai/gpt-5.6-sol",
    instructions:systemPrompt,
    input:prompt,
    tools:[{type:"web_search"}],
    tool_choice:"required",
    max_output_tokens:3200,
    reasoning:{effort:"medium"}
  };
  const r=await fetch("https://ai-gateway.vercel.sh/v1/responses",{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data?.error?.message||data?.message||`GATEWAY_${r.status}`);
  const parsed=parseJson(extractText(data));
  if(!parsed) throw new Error("INVALID_NATIVE_OUTPUT");
  return parsed;
}

async function perplexityFallback(prompt){
  const result=await generateText({
    model:"openai/gpt-5.6-sol",
    system:systemPrompt,
    prompt:`Usa obligatoriamente la herramienta de búsqueda web antes de responder.\n\n${prompt}`,
    tools:{perplexity_search:gateway.tools.perplexitySearch()},
    toolChoice:"required",
    maxOutputTokens:3200
  });
  const parsed=parseJson(result.text);
  if(!parsed) throw new Error("INVALID_FALLBACK_OUTPUT");
  return parsed;
}

async function runWithSearch(prompt){
  try{
    return await nativeWebSearch(prompt);
  }catch(first){
    console.error("native-web-search-failed",first?.message||first);
    return await perplexityFallback(prompt);
  }
}

async function prospects({offer,buyerType,area,website}){
  const buyerInstruction=buyerType
    ?`El usuario quiere vender principalmente a este perfil: ${buyerType}. Respeta ese criterio como filtro prioritario.`
    :`El usuario no ha indicado un perfil concreto. Deduce tú los compradores con más sentido.`;
  const prompt=`El usuario vende u ofrece esto:\n${offer}\n\n${buyerInstruction}\n\nZona preferida: ${area||"España"}\nWeb del usuario: ${website||"No indicada"}\n\nHaz una búsqueda real online y devuelve EXACTAMENTE 3 oportunidades reales de la zona. Deben ser compradores potenciales o canales de venta plausibles, no simples empresas del mismo sector. Si el usuario ha elegido particulares, busca empresas o canales que permitan llegar a particulares; no uses datos de personas privadas.\n\nPara cada oportunidad verifica con fuentes públicas: nombre, actividad, dirección, web oficial, teléfono y email comercial público si existe. Explica por qué puede encajar sin afirmar que sabemos que necesita comprar. Redacta el asunto y el email exacto que dejarías en BORRADORES. Propón una imagen o material comercial útil y la siguiente acción si no responde. Incluye URLs de las fuentes usadas.\n\nDevuelve exactamente:\n{"agent_name":"Agente Captador de Clientes","agent_goal":"Identifica compradores potenciales, encuentra oportunidades reales y deja el contacto preparado","title":"3 oportunidades comerciales reales","summary":"Explica qué perfil se ha buscado y por qué.","items":[{"name":"","fit":"Encaja mucho|Encaja|Encaja poco","why":"","address":"","website":"","phone":"","email":"","sales_angle":"","email_subject":"","email_body":"","image_concept":"","image_text":"","next_action":"","sources":["https://..."]}],"trust_note":"Datos empresariales obtenidos de fuentes públicas. Conviene verificarlos antes de contactar y nada se envía sin aprobación."}`;
  const result=await runWithSearch(prompt);
  if(!Array.isArray(result?.items)||result.items.length!==3) throw new Error("INVALID_PROSPECT_COUNT");
  return result;
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
  const offer=clean(b.offer,1000),buyerType=clean(b.buyerType,300),area=clean(b.area,250),website=clean(b.website,600),problem=clean(b.problem,1200);
  if(mode==="prospects"&&!offer) return res.status(400).json({error:"Cuéntame qué vendes o qué servicio ofreces."});
  if(mode!=="prospects"&&!offer&&!problem&&!website) return res.status(400).json({error:"Cuéntame al menos qué vendes, tu problema o tu web."});
  try{
    const result=mode==="prospects"?await prospects({offer,buyerType,area,website}):await genericIdeas({mode,offer,area,website,problem});
    return res.status(200).json({ok:true,mode,result});
  }catch(e){
    console.error("free-value",e?.message||e);
    return res.status(503).json({error:"No he podido completar la búsqueda online con datos suficientemente fiables. No voy a inventar empresas. Vuelve a intentarlo en unos segundos."});
  }
}
