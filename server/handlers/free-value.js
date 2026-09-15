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

async function runWithSearch(prompt){
  const token=String(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||"");
  if(!token) throw new Error("AI_GATEWAY_NOT_CONFIGURED");

  const body={
    model:"openai/gpt-5.6-sol",
    instructions:`Eres el analista comercial de VentaNexIA. Tu trabajo es generar oportunidades reales y trabajo comercial útil. Usa búsqueda web siempre que necesites identificar empresas, webs, direcciones, teléfonos, emails o cualquier dato actual. Nunca inventes contactos. Solo usa emails empresariales publicados públicamente. Si un dato no aparece de forma fiable, escribe "No publicado". Distingue siempre entre hechos verificados e hipótesis comerciales. Devuelve SOLO JSON válido, sin markdown.`,
    input:prompt,
    tools:[{type:"web_search"}],
    max_output_tokens:3000,
    reasoning:{effort:"medium"}
  };

  const r=await fetch("https://ai-gateway.vercel.sh/v1/responses",{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const msg=data?.error?.message||data?.message||`GATEWAY_${r.status}`;
    console.error("free-value-gateway",r.status,msg);
    throw new Error(msg);
  }
  const text=extractText(data);
  const parsed=parseJson(text);
  if(!parsed){
    console.error("free-value-invalid-output",text.slice(0,500));
    throw new Error("INVALID_AI_OUTPUT");
  }
  return parsed;
}

async function prospects({offer,area,website}){
  const prompt=`El usuario vende u ofrece esto:\n${offer}\n\nZona preferida: ${area||"España"}\nWeb del usuario: ${website||"No indicada"}\n\nNo preguntes al usuario qué tipo de cliente quiere. DEDÚCELO tú a partir de lo que vende. Primero identifica mentalmente los perfiles de comprador con más sentido y después busca EXACTAMENTE 3 empresas reales de la zona que puedan ser oportunidades razonables.\n\nNo busques empresas del mismo sector para revenderles sin sentido. Busca compradores potenciales. Ejemplo: si vende muebles de cocina, piensa en promotoras, constructoras, estudios de interiorismo, reformas, apartamentos turísticos u otros compradores plausibles según la zona. Si vende mobiliario sanitario, piensa en clínicas, centros médicos, residencias, fisioterapia u otros compradores plausibles.\n\nPara cada oportunidad:\n- verifica nombre y actividad;\n- dirección pública;\n- web oficial;\n- teléfono público;\n- email comercial público si existe;\n- explica por qué podría encajar, sin afirmar que sabemos que necesita comprar;\n- redacta el asunto y el email exacto que dejarías en BORRADORES;\n- propone una imagen o material comercial útil para acompañar el email;\n- indica la siguiente acción si no responde;\n- incluye URLs de las fuentes públicas que has usado.\n\nDevuelve EXACTAMENTE esta estructura JSON:\n{"agent_name":"Agente Captador de Clientes","agent_goal":"Identifica quién puede necesitar lo que vendes, encuentra oportunidades reales y deja el contacto preparado","title":"3 oportunidades comerciales reales","summary":"Explica brevemente qué perfil de comprador has decidido buscar y por qué.","items":[{"name":"","fit":"Encaja mucho|Encaja|Encaja poco","why":"","address":"","website":"","phone":"","email":"","sales_angle":"","email_subject":"","email_body":"","image_concept":"","image_text":"","next_action":"","sources":["https://..."]}],"trust_note":"Datos empresariales obtenidos de fuentes públicas. Conviene verificarlos antes de contactar y nada se envía sin aprobación."}`;
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
  const offer=clean(b.offer,1000),area=clean(b.area,250),website=clean(b.website,600),problem=clean(b.problem,1200);
  if(mode==="prospects"&&!offer) return res.status(400).json({error:"Cuéntame qué vendes o qué servicio ofreces."});
  if(mode!=="prospects"&&!offer&&!problem&&!website) return res.status(400).json({error:"Cuéntame al menos qué vendes, tu problema o tu web."});
  try{
    const result=mode==="prospects"?await prospects({offer,area,website}):await genericIdeas({mode,offer,area,website,problem});
    return res.status(200).json({ok:true,mode,result});
  }catch(e){
    console.error("free-value",e?.message||e);
    return res.status(503).json({error:"La búsqueda no ha podido completarse ahora mismo. No voy a inventarte empresas ni datos. Vuelve a probar en unos segundos."});
  }
}
