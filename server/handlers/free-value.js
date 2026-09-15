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

async function callAI({mode,sector,offer,area,website,problem}){
  const gateway=String(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||"");
  const direct=String(process.env.OPENAI_API_KEY||"");
  const token=direct||gateway;
  if(!token) throw new Error("AI_NOT_CONFIGURED");
  const base=direct?"https://api.openai.com/v1":"https://ai-gateway.vercel.sh/v1";
  const model=direct?"gpt-5.6-sol":"openai/gpt-5.6-sol";

  const common=`Eres el analista y agente comercial de VentaNexIA. El objetivo no es presumir de IA: es generar oportunidades reales, trabajo útil y posibles ingresos antes de pedir dinero.\n\nReglas:\n- Piensa como consultor de negocio y como comercial senior.\n- Da criterio, ideas concretas y prioridades.\n- No uses frases vacías como \"podemos ayudarte\".\n- No inventes empresas, emails, teléfonos, direcciones, precios ni datos.\n- Para datos empresariales actuales usa búsqueda web y solo devuelve información que puedas respaldar con fuentes públicas.\n- Nunca devuelvas emails personales privados. Solo correos empresariales publicados públicamente, por ejemplo info@, comercial@, ventas@ o un email corporativo visible en la web oficial.\n- Si un dato no se encuentra, escribe \"No publicado\".\n- Cuando prepares captación, no te limites a listar empresas: analiza por qué encajan, qué venderles y redacta el email exacto.\n- El email debe quedar como BORRADOR, nunca como enviado.\n- Propón una imagen comercial útil para acompañar el email, pero marca que debe aprobarse antes de crearla o adjuntarla.\n- Explica por qué cada recomendación tiene sentido.\n- Prioriza qué harías primero y qué puede esperar.\n- Español de España, lenguaje sencillo y profesional.\n- Devuelve SOLO JSON válido.`;

  let task="";
  if(mode==="prospects"){
    task=`Actúa como un AGENTE CAPTADOR DE CLIENTES. Busca exactamente 3 empresas reales que puedan convertirse en clientes potenciales.\n\nProducto/servicio que vende el usuario: ${offer}.\nSector objetivo o contexto: ${sector||"no indicado"}.\nZona: ${area||"España"}.\nWeb del usuario, si existe: ${website||"no indicada"}.\n\nPara cada empresa:\n1. Verifica con fuentes públicas nombre, actividad, dirección, web, teléfono público y email comercial público si existe.\n2. Explica por qué puede comprar lo que vende el usuario.\n3. Detecta el ángulo comercial más lógico para esa empresa.\n4. Redacta un email de captación personalizado, corto y creíble, listo para dejar en BORRADORES. No inventes que conocemos a la empresa ni que hemos hablado antes.\n5. Crea un asunto de email claro.\n6. Propón una imagen que ayude a vender: qué debe mostrar y qué texto tendría. No la des por creada; queda PENDIENTE DE APROBACIÓN.\n7. Indica el siguiente paso después del email: seguimiento, llamada o segundo mensaje.\n\nDevuelve esta forma exacta:\n{\"title\":\"3 oportunidades comerciales reales\",\"summary\":\"...\",\"agent_name\":\"Agente Captador de Clientes\",\"agent_goal\":\"Buscar oportunidades, preparar el contacto y dejarlo listo para aprobación\",\"items\":[{\"name\":\"...\",\"fit\":\"Encaja mucho|Encaja|Encaja poco\",\"why\":\"...\",\"sales_angle\":\"...\",\"address\":\"...\",\"website\":\"...\",\"phone\":\"...\",\"email\":\"...\",\"email_subject\":\"...\",\"email_body\":\"...\",\"image_concept\":\"...\",\"image_text\":\"...\",\"approval_status\":\"Pendiente de aprobación\",\"next_action\":\"...\",\"sources\":[\"https://...\"]}],\"next_steps\":[\"Revisar los 3 borradores\",\"Aprobar o corregir cada mensaje\",\"Crear la imagen aprobada y adjuntarla\",\"Enviar desde el correo conectado solo después de aprobación\",\"Programar seguimiento si no responden\"],\"trust_note\":\"Los contactos se basan en información empresarial pública. Los emails quedan como borradores hasta que el usuario los aprueba.\"}`;
  }else if(mode==="diagnosis"){
    task=`Haz un diagnóstico útil de esta empresa o problema.\nSector: ${sector||"no indicado"}.\nQué vende: ${offer||"no indicado"}.\nZona: ${area||"no indicada"}.\nWeb: ${website||"no indicada"}.\nProblema principal: ${problem||"no indicado"}.\n\nSi hay web, analízala con búsqueda web. Entrega 3 problemas u oportunidades prioritarias, 3 acciones que harías esta semana y un ejemplo concreto de trabajo terminado. Prioriza acciones que puedan ahorrar tiempo, recuperar ventas o generar ingresos.\n\nDevuelve:\n{\"title\":\"Diagnóstico rápido\",\"summary\":\"...\",\"findings\":[{\"issue\":\"...\",\"why\":\"...\",\"priority\":\"Alta|Media|Baja\"}],\"actions\":[{\"action\":\"...\",\"impact\":\"...\"}],\"example\":{\"title\":\"...\",\"content\":\"...\"},\"sources\":[\"https://...\"],\"question\":\"¿Te encaja este enfoque o quieres que cambie algo?\"}`;
  }else{
    task=`Genera 3 ideas concretas para mejorar este negocio.\nSector: ${sector||"no indicado"}.\nQué vende: ${offer||"no indicado"}.\nZona: ${area||"no indicada"}.\nWeb: ${website||"no indicada"}.\nProblema: ${problem||"no indicado"}.\n\nNo des consejos genéricos. Da prioridad a ideas que puedan conseguir clientes, aumentar conversión, recuperar oportunidades perdidas o quitar trabajo que impide vender. Cada idea debe incluir qué harías, por qué, un ejemplo y el primer paso de mañana. Si hay web, úsala como contexto actual.\n\nDevuelve:\n{\"title\":\"3 ideas que pondría en marcha\",\"summary\":\"...\",\"ideas\":[{\"idea\":\"...\",\"why\":\"...\",\"example\":\"...\",\"tomorrow\":\"...\"}],\"sources\":[\"https://...\"],\"question\":\"¿Cuál de las 3 quieres que desarrolle primero?\"}`;
  }

  const body={
    model,
    instructions:common,
    input:task,
    max_output_tokens:2600,
    tools:[{type:"web_search"}],
    reasoning:{effort:"medium"}
  };
  const r=await fetch(`${base}/responses`,{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const message=data?.error?.message||data?.message||`AI_${r.status}`;
    throw new Error(message);
  }
  const parsed=parseJson(extractText(data));
  if(!parsed) throw new Error("INVALID_AI_OUTPUT");
  return parsed;
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const b=req.body||{};
  const mode=["prospects","diagnosis","ideas"].includes(String(b.mode))?String(b.mode):"ideas";
  const sector=clean(b.sector,300),offer=clean(b.offer,600),area=clean(b.area,250),website=clean(b.website,600),problem=clean(b.problem,1000);
  if(mode==="prospects"&&!offer) return res.status(400).json({error:"Dime qué vendes para poder buscar clientes que encajen."});
  if(mode!=="prospects"&&!offer&&!problem&&!website) return res.status(400).json({error:"Cuéntame al menos qué vendes, tu problema o tu web."});
  try{
    const result=await callAI({mode,sector,offer,area,website,problem});
    return res.status(200).json({ok:true,mode,result});
  }catch(e){
    console.error("free-value",e?.message||e);
    return res.status(503).json({error:"Ahora mismo no he podido completar el análisis con datos fiables. No voy a inventarte resultados. Inténtalo de nuevo en un momento."});
  }
}
