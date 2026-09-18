import {aiConfigured,createAIResponse} from "../../lib/ai-client.js";

const SYSTEM = `
Eres VentaNexIA AI, el asistente inteligente de la web de VentaNexIA.

TU MISIÓN
Ayuda de verdad. No eres un simple formulario comercial. Debes comportarte como una inteligencia artificial general orientada a empresa, ventas, atención al cliente, contenidos, organización y resolución de problemas.

REGLA PRINCIPAL
- No expliques solo lo que podrías hacer: hazlo en la misma respuesta siempre que sea posible.
- Si el usuario pide un texto, escríbelo completo.
- Si pide ideas, dáselas concretas.
- Si pide una comparación, compárala.
- Si pide una publicación, créala.
- Si pide una propuesta comercial, prepárala.
- Si pide ayuda para resolver un problema, da pasos concretos.
- Solo pregunta cuando falte un dato realmente imprescindible.
- Usa todo el contexto anterior y no vuelvas a preguntar lo que ya te han dicho.

FORMA DE CONVERSAR: PROPONER → VALIDAR → RECTIFICAR
- Da primero una solución o propuesta concreta, aunque falten detalles menores.
- Después pregunta de forma breve si hace falta validar algo.
- Si el usuario dice “sí”, “vale”, “hazlo”, “me gusta”, “quiero verlo” o similar, continúa sobre esa propuesta y entrega el siguiente paso lógico.
- Conserva todo lo anterior salvo lo que el usuario pida cambiar.

CONOCIMIENTO
- Puedes usar conocimiento general para responder sobre negocios, ventas, marketing, organización, tecnología, redacción y dudas habituales.
- No finjas conocer datos privados o en tiempo real si no están disponibles en la conversación o en un sistema conectado.
- No inventes precios reales, stock, fechas de entrega, pedidos, facturas, descuentos, resultados, clientes ni condiciones comerciales.

ESTILO
- Español de España salvo que el usuario use otro idioma.
- Profesional, claro, natural y resolutivo.
- Prioriza soluciones, ejemplos y trabajo terminado.

TRANSPARENCIA Y SEGURIDAD
- Eres una inteligencia artificial de VentaNexIA; no finjas ser una persona.
- No afirmes haber enviado, cobrado, reservado, publicado, modificado o consultado algo externo si no se ha hecho realmente.
- No pidas contraseñas, tarjetas, claves API, documentos de identidad ni secretos.
`;

const DESKTOP_RULES = `
MODO VENTANEXIA DESKTOP
Estás atendiendo al usuario desde la aplicación de escritorio, no desde la demo comercial de la web.

REGLAS OBLIGATORIAS
- Los bloques marcados como DATOS LOCALES AUTORIZADOS proceden de carpetas que el usuario ha autorizado expresamente en su ordenador.
- Si la respuesta está en esos datos, consúltalos y responde directamente con el dato real. No digas “lo comprobaría”, “consultaría”, “prepararía” ni describas lo que harías.
- Distingue claramente datos encontrados de inferencias. No inventes nada que no aparezca en los archivos o en la conversación.
- Si necesitas cruzar varios archivos autorizados, hazlo.
- Si la petición consiste en analizar, resumir, calcular, localizar o comparar información de esos archivos, entrega el resultado en esta misma respuesta.
- Si falta información para ejecutar una acción real, indica exactamente qué dato falta; no sustituyas el trabajo por una explicación genérica.
- Nunca reveles rutas completas del sistema salvo que el usuario las pida; usa el nombre relativo del archivo cuando baste.
- Los datos autorizados son contexto privado de trabajo y no son una demostración ficticia de capacidades.
`;

function extractOutputText(data){
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const out = Array.isArray(data?.output) ? data.output : [];
  for (const item of out){
    if (item?.type === "message" && Array.isArray(item.content)){
      for (const c of item.content){
        if (c?.type === "output_text" && typeof c.text === "string") return c.text.trim();
      }
    }
  }
  return "";
}

function cleanValue(value=""){
  return String(value||"").replace(/\s+/g," ").trim();
}

function matchField(text,label,nextLabel){
  const safeLabel=label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const safeNext=nextLabel?nextLabel.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"):null;
  const re=new RegExp(`${safeLabel}\\s*:\\s*(.+?)${safeNext?`(?=\\.\\s*${safeNext}\\s*:|$)`:`(?=\\.|$)`}`,"i");
  const m=String(text||"").match(re);
  return cleanValue(m?.[1]||"");
}

function fallbackReply(message=""){
  const raw=String(message||"");
  const t=raw.toLowerCase();

  if(/secretaria virtual|secretaría virtual|cliente pregunta|responde como secretaria/.test(t)){
    const business=matchField(raw,"Responde como secretaria virtual de una","Cliente pregunta")||"empresa";
    const question=matchField(raw,"Cliente pregunta","Da una respuesta")||"su consulta";
    return `Claro. Para ${business}, respondería así:\n\n“Gracias por su consulta. Sobre ${question}, voy a comprobar las condiciones y el plazo real antes de confirmarle una fecha. Si se trata de un pedido de gran volumen, revisaré disponibilidad, capacidad y fecha prevista de entrega para darle una respuesta correcta. ¿Me indica, por favor, la cantidad aproximada que necesita?”`;
  }

  if(/email comercial|escribe un email|crear email|incluye asunto/.test(t)){
    const product=matchField(raw,"Vendo","Empresa objetivo")||"nuestros productos o servicios";
    const target=matchField(raw,"Empresa objetivo","Objetivo")||"su empresa";
    const goal=matchField(raw,"Objetivo","No inventes")||"presentarle una propuesta";
    return `Asunto: ${product}: propuesta para ${target}\n\nHola,\n\nMe pongo en contacto contigo porque creo que ${product} puede encajar con las necesidades de ${target}.\n\nLa idea es ${goal}. Si te parece, puedo enviarte la información de forma breve y concreta para que la valores sin compromiso.\n\n¿Te viene bien que te lo prepare o prefieres que lo comentemos en una llamada corta?\n\nUn saludo,\n[Tu nombre]\n[Tu empresa]`;
  }

  if(/crea una publicación|crea una publicacion|instagram|linkedin|facebook/.test(t)){
    return `PUBLICACIÓN PROPUESTA\n\nTenemos una novedad que queremos compartir contigo.\n\nHemos preparado esta propuesta para ayudarte a conocer mejor el producto o servicio y valorar si encaja contigo.\n\n👉 Escríbenos y te damos toda la información.\n\n#Empresa #Novedades #Soluciones`;
  }

  return "Dime qué necesitas y trabajaré con la información disponible en esta conversación.";
}

function lastUserMessage(messages=[]){
  for(let i=messages.length-1;i>=0;i--){
    if(messages[i]?.role==="user" && typeof messages[i]?.content==="string") return messages[i].content;
  }
  return "";
}

function parseCsvLine(line=""){
  const out=[]; let cur=""; let quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quoted && line[i+1]==='"'){cur+='"';i++;}
      else quoted=!quoted;
    }else if(ch===',' && !quoted){out.push(cur.trim());cur="";}
    else cur+=ch;
  }
  out.push(cur.trim());
  return out;
}

function csvRows(content=""){
  const lines=String(content).replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
  if(lines.length<2)return [];
  const headers=parseCsvLine(lines[0]);
  return lines.slice(1).map(line=>{
    const vals=parseCsvLine(line); const row={};
    headers.forEach((h,i)=>row[h]=vals[i]??"");
    return row;
  });
}

function desktopFallback(message,localContext=[]){
  const q=String(message||"").toLowerCase();
  if((/cliente|clientes|prospecto|prospectos/.test(q))&&(/email|correo|escribir|enviar/.test(q))){
    return "Puedo ayudarte con eso, pero para hacerlo con datos reales necesito tener conectadas dos cosas: una fuente de clientes o captación y una cuenta de correo. Ve a “Conexiones”, conecta esas herramientas y después vuelve aquí. Cuando estén conectadas, podré trabajar con los clientes reales y preparar los correos sin inventar datos.";
  }
  const byName=(needle)=>localContext.find(f=>String(f?.path||"").toLowerCase().includes(needle));
  const ventas=byName("ventas_demo.csv");
  const clientes=byName("clientes_demo.csv");

  if(ventas && /pedido|pedidos|venta|ventas/.test(q) && /pendient/.test(q)){
    const orders=csvRows(ventas.content).filter(r=>String(r.Estado||r.estado||"").toLowerCase().includes("pendient"));
    const people=clientes?csvRows(clientes.content):[];
    if(!orders.length)return "No hay pedidos pendientes en los datos autorizados.";
    const lines=orders.map(o=>{
      const id=o.Cliente_ID||o.cliente_id||o.Cliente||"";
      const person=people.find(p=>(p.ID||p.id)===id);
      const who=person?[person.Nombre,person.Empresa].filter(Boolean).join(" / "):id||"Cliente sin identificar";
      const order=o.Pedido||o.pedido||"";
      const amount=o.Importe_EUR||o.importe||"";
      return `• ${who}${order?` — pedido ${order}`:""}${amount?` — ${amount} €`:""}`;
    });
    return `He consultado los archivos autorizados. Pedido(s) pendiente(s):\n${lines.join("\n")}`;
  }

  if(clientes && /cu[aá]ntos? clientes|n[uú]mero de clientes|total de clientes/.test(q)){
    const rows=csvRows(clientes.content);
    return `Hay ${rows.length} clientes en el archivo autorizado de clientes.`;
  }

  if(/contrato/.test(q)){
    const matches=localContext.filter(f=>String(f?.path||"").toLowerCase().includes("contrato"));
    if(matches.length)return `He localizado ${matches.length} archivo(s) de contrato autorizado(s): ${matches.map(x=>x.path).join(", ")}.`;
  }

  const words=[...new Set(q.normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^a-z0-9]+/).filter(w=>w.length>3))];
  const ranked=localContext.map(f=>{
    const hay=(String(f.path||"")+"\n"+String(f.content||"")).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    return {f,score:words.reduce((n,w)=>n+(hay.includes(w)?1:0),0)};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
  if(ranked.length){
    const refs=ranked.map(x=>x.f.path).join(", ");
    return `He encontrado información relacionada en los datos autorizados (${refs}), pero para darte una respuesta precisa necesito que elijas la conexión o carpeta concreta con la que quieres trabajar. Así evito mezclar datos o darte una respuesta incorrecta.`;
  }
  return "Todavía no tengo una fuente de datos adecuada para responder con precisión. Conecta o selecciona la cuenta, tienda, portal o carpeta donde están esos datos y vuelve a pedírmelo.";
}

function normalizeLocalContext(value){
  if(!Array.isArray(value))return [];
  return value.slice(0,80).map(f=>({
    path:String(f?.path||"").slice(0,500),
    content:String(f?.content||"").slice(0,20000)
  })).filter(f=>f.path&&f.content);
}

function localContextText(files=[]){
  if(!files.length)return "";
  return files.map(f=>`\n--- ARCHIVO AUTORIZADO: ${f.path} ---\n${f.content}`).join("\n").slice(0,120000);
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-20):[];
  if(!messages.length) return res.status(400).json({error:"Conversación vacía"});

  const localContext=normalizeLocalContext(req.body?.localContext);
  const isDesktop=localContext.length>0;
  const userMessage=lastUserMessage(messages);
  const fallback=isDesktop?desktopFallback(userMessage,localContext):fallbackReply(userMessage);

  if(!aiConfigured()) return res.status(200).json({reply:fallback,source:isDesktop?"desktop-local-fallback":"fallback"});

  const input=messages
    .filter(m=>["user","assistant"].includes(m?.role) && typeof m?.content==="string")
    .map(m=>({role:m.role,content:[{type:"input_text",text:m.content.slice(0,7000)}]}));

  const instructions=isDesktop
    ? `${SYSTEM}\n${DESKTOP_RULES}\n\nDATOS LOCALES AUTORIZADOS:\n${localContextText(localContext)}`
    : SYSTEM;

  try{
    const r=await createAIResponse({instructions,input,max_output_tokens:1400,store:false});
    if(!r.ok) return res.status(200).json({reply:fallback,source:isDesktop?"desktop-local-fallback":"fallback"});
    const text=extractOutputText(r.data);
    if(!text) return res.status(200).json({reply:fallback,source:isDesktop?"desktop-local-fallback":"fallback"});
    return res.status(200).json({reply:text,source:isDesktop?"desktop-ai":"ai",filesUsed:isDesktop?localContext.length:0});
  }catch(e){
    return res.status(200).json({reply:fallback,source:isDesktop?"desktop-local-fallback":"fallback"});
  }
}
