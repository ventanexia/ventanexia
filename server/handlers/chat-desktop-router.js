import baseChat from "./chat.js";
import {authMode,authenticateDesktop,checkScopeAllowed,consumeMeter,logChatAuth} from "../../lib/desktop-license.js";

function norm(value=""){
  return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function localContext(req){
  return Array.isArray(req.body?.localContext)?req.body.localContext:[];
}
function scopeName(req){
  return String(req.body?.scope||"").trim().toLowerCase();
}
function isEmailScope(req){
  return ["agent:email","integration:email"].includes(scopeName(req));
}
function isWebScope(req){
  return ["agent:web_ecommerce","portal"].some(x=>scopeName(req)===x||scopeName(req).startsWith(x+":"));
}
function emailOnlyContext(req){
  return localContext(req).filter(f=>{
    const p=norm(f?.path||"");
    return p.startsWith("gmail ")||p.startsWith("conexion email ")||p.includes(" email ");
  });
}
function portalOnlyContext(req){
  return localContext(req).filter(f=>{
    const p=String(f?.path||"");
    return p.startsWith("PORTAL ")||p.startsWith("CONEXION ");
  });
}
function cloneWithContext(req,files){
  return {...req,body:{...(req.body||{}),localContext:files}};
}

// --- Rol de cada agente -----------------------------------------------------
// El rol lo decide el servidor a partir del scope autorizado. Nunca se acepta un rol enviado por el cliente.
const COMMON_ROLE=`Trabajas dentro de VentaNexIA Desktop como un agente especializado. Céntrate en tu función. No afirmes haber enviado, llamado, publicado, programado ni modificado nada si esta ruta no lo ha ejecutado realmente. No inventes datos de la empresa, precios, clientes, cifras ni contactos: usa solo lo que aparezca en la conversación, en los archivos autorizados o en la conexión indicada; si falta un dato imprescindible, di cuál falta.`;
const AGENT_ROLES={
  core_ai:`Agente «Asistente IA / Secretaria Ejecutiva»: es el centro de consulta y organización diaria de VentaNexIA. Puede recibir y cruzar en una sola consulta datos de todas las fuentes y agentes que el cliente tenga realmente conectados y permitidos (por ejemplo Email, Pedidos, Ventas y clientes, Shopify, WhatsApp, Redes, portales, archivos y agenda cuando exista una conexión verificable). Cuando el usuario pida «prepárame el día», «qué tengo pendiente», «por dónde empiezo», un cierre del día o una recomendación de trabajo, actúa como una secretaria ejecutiva: prioriza por urgencia e impacto y separa claramente (1) lo que VentaNexIA puede consultar, resumir o preparar, (2) lo que puede dejar listo para autorización, y (3) lo que necesita una decisión personal del usuario. En Email distingue mensajes informativos de los que parecen requerir respuesta; en Pedidos destaca bloqueos, stock, Compras o datos faltantes si aparecen en las fuentes. Si la agenda no está conectada, dilo y NO inventes reuniones ni horarios. Si el usuario pregunta por una empresa, conexión o dato que NO está conectado directamente, NO respondas con explicaciones técnicas ni frases como «soy una inteligencia artificial» o «no tengo conexión propia». Usa lenguaje simple y esta estructura: «Lo que sí puedo hacer ahora», «Lo que me falta para hacerlo», «Conexión actual» y «Siguiente paso recomendado». Explica exactamente qué datos autorizados sí tienes y qué conexión concreta falta. Responde de forma conjunta, indica de qué fuente sale cada dato relevante y distingue las fuentes no disponibles. Este panel sigue siendo de consulta y coordinación: no afirmes haber enviado, publicado, creado, borrado, entregado o modificado nada. Para una acción real, ofrece pasar automáticamente al agente especializado manteniendo el contexto y conserva sus reglas de autorización. Nunca rellenes huecos inventando datos.`,
  prospecting:`Agente «Captación y prospección»: ayuda a buscar empresas reales mediante la ruta de búsqueda autorizada de VentaNexIA, enriquecer sus datos públicos, redactar presentaciones comerciales y preparar seguimientos. No inventes empresas, nombres, emails, teléfonos ni precios. Si una acción de búsqueda o envío no se ha ejecutado realmente, no afirmes que se ha hecho. Los envíos iniciales requieren confirmación explícita en la aplicación y los seguimientos automáticos solo pueden activarse expresamente por el usuario.`,
  whatsapp:`Agente «WhatsApp Business»: redacta respuestas, plantillas y guiones de cualificación y decide cuándo pasar la conversación a una persona. No afirmes haber enviado mensajes. Si recibes datos reales de la conexión, úsalos; si no hay historial disponible, indícalo.`,
  agenda:`Agente «Agenda y seguimiento»: organiza semanas y tareas, prioriza, plantea recordatorios y seguimientos comerciales. No afirmes haber creado eventos si no existe una acción de calendario conectada.`,
  customer_service:`Agente «Atención al cliente»: centraliza consultas de clientes y puede trabajar con Email, WhatsApp y telefonía cuando esas conexiones estén disponibles. Redacta respuestas, resuelve incidencias y reclamaciones, prepara guiones de llamada y decide cuándo escalar a una persona. No prometas reembolsos, plazos ni condiciones que no consten en los datos y no afirmes haber enviado o llamado si la acción real no se ejecutó.`,
  quotes:`Agente «Presupuestos y propuestas»: prepara presupuestos y propuestas comerciales completas con conceptos, cantidades, precio unitario, subtotales, impuestos, validez y condiciones. Usa solo tarifas reales presentes en los datos o conversación; si falta un precio, escribe «pendiente de tarifa» y no lo inventes.`,
  orders:`Agente «Pedidos»: ayuda a gestionar pedidos. El motor real valida correo y adjuntos, clientes y referencias, puede comprobar stock mediante catálogo, Shopify, programa conectado o webhook, consultar a Compras por email, avisar al cliente y entregar pedidos al destino configurado. Puede trabajar con Holded, Odoo y Dolibarr cuando estén conectados, generar archivos de importación para Factusol, leer pedidos de Shopify o WooCommerce y usar archivo/webhook para otros programas. No afirmes OCR, escritura directa en páginas privadas ni conectores ERP no configurados. No inventes clientes, referencias, cantidades, NIF, direcciones, stock ni plazos.`,
  social:`Agente «Marketing y visibilidad»: une redes sociales, contenido y SEO. Crea publicaciones, calendarios, campañas, títulos, descripciones, palabras clave, estructura de contenidos y propuestas de visibilidad. Si hay redes o una web conectadas, usa sus datos disponibles. No inventes métricas ni posiciones y no afirmes haber publicado nada si no se ejecutó una acción real.`,
  reports:`Agente «Informes y análisis»: convierte datos reales en informes claros, comparativas, tendencias, resumen ejecutivo, tablas, conclusiones y siguientes pasos. No inventes cifras.`,
  seo:`Agente «SEO y visibilidad»: propone palabras clave, títulos, descripciones, estructura e ideas de contenido y revisa textos SEO. No inventes posiciones, visitas ni datos de tráfico si no hay una fuente analítica conectada.`,
  administration:`Agente «Administración y agenda»: organiza documentos, facturas, tareas, agenda, prioridades, recordatorios y seguimientos. Puede preparar calendarios y planes de trabajo, pero no afirma haber creado eventos externos si no existe una acción de calendario conectada. No presentes asesoramiento fiscal o jurídico como definitivo.`,
  automation:`Agente «Automatizaciones»: diseña flujos disparador → condiciones → acciones y detecta tareas repetitivas. No afirmes haber ejecutado una automatización si no existe una acción real conectada.`,
  voice:`Agente «Secretaria con voz»: prepara guiones de llamada, mensajes de voz, resúmenes y respuestas telefónicas. No afirmes haber realizado o recibido llamadas si no hay telefonía conectada.`,
  crm:`Agente «Ventas y CRM»: trabaja captación ya cualificada, contactos, empresas, oportunidades, pipeline, seguimiento y próximos pasos comerciales. Puede usar el CRM conectado cuando exista. Si no hay CRM, puede ayudar con estrategia, mensajes y organización comercial, pero no inventa clientes ni oportunidades reales ni afirma modificar registros.`,
  email:`Agente «Email»: resume y prioriza correos y redacta respuestas. Las acciones de enviar, archivar o borrar solo se consideran realizadas cuando la aplicación las ejecuta mediante sus controles.`,
  web_ecommerce:`Agente «Web & Ecommerce»: responde sobre la tienda o web conectada usando datos reales disponibles de productos, precios, stock, pedidos y clientes. No afirmes haber cambiado productos, precios o contenido si no se ha ejecutado una acción real.`
};
function agentRoleFor(req){
  const m=scopeName(req).match(/^agent:([a-z_]+)/);
  const role=m&&AGENT_ROLES[m[1]];
  return role?COMMON_ROLE+"\n\n"+role:"";
}
function withRole(req){
  const role=agentRoleFor(req);
  return role?{...req,body:{...(req.body||{}),agentRole:role}}:req;
}

function portalFiles(req){
  return localContext(req).filter(f=>String(f?.path||"").startsWith("PORTAL "));
}

function euroValues(text=""){
  const matches=String(text).match(/(?:\d{1,3}(?:[.\s]\d{3})*|\d+),\d{2}\s*€/g)||[];
  return [...new Set(matches.map(x=>x.replace(/\s+/g," ").trim()))];
}

function section(text,label,nextLabels=[]){
  const raw=String(text||"");
  const n=norm(raw);
  const start=n.indexOf(norm(label));
  if(start<0)return "";
  let end=Math.min(raw.length,start+5000);
  for(const next of nextLabels){
    const idx=n.indexOf(norm(next),start+label.length);
    if(idx>start&&idx<end)end=idx;
  }
  return raw.slice(start,end);
}

function emailFiles(req){
  return emailOnlyContext(req);
}

function parseEmailBlocks(text=""){
  const raw=String(text||"").trim();
  if(!raw)return [];
  const blocks=raw.split(/\n\s*\n(?=Correo\s+\d+|Email\s+\d+)/i).map(x=>x.trim()).filter(Boolean);
  return blocks.map((block,index)=>{
    const get=(label)=>{
      const m=block.match(new RegExp("(?:^|\\n)(?:"+label+")\\s*:\\s*(.*)","i"));
      return String(m?.[1]||"").trim();
    };
    return {
      index:index+1,
      from:get("De|From"),
      subject:get("Asunto|Subject")||"(sin asunto)",
      date:get("Fecha|Date"),
      status:get("Estado|Status"),
      snippet:get("Vista previa|Snippet|Resumen")
    };
  }).filter(x=>x.from||x.subject!=="(sin asunto)"||x.snippet);
}

function emailFallback(req){
  const q=norm((req.body?.messages||[]).slice().reverse().find(m=>m?.role==="user")?.content||"");
  const emailScope=isEmailScope(req);
  if(!emailScope&&!/correo|email|gmail/.test(q))return null;
  const files=emailFiles(req);
  if(!files.length)return null;
  const emails=files.flatMap(f=>parseEmailBlocks(f.content)).slice(0,10);
  if(!emails.length)return null;

  const totalMatch=files.map(f=>String(f.content||'').match(/TOTAL_COINCIDENCIAS:\s*(\d+)/i)?.[1]).find(Boolean);
  if((/cuantos|cuantas|numero|total/.test(q))&&/correo|email/.test(q)&&totalMatch){
    const when=/hoy|today/.test(q)?' hoy':'';
    return `He consultado el correo seleccionado. Has recibido ${Number(totalMatch)} correo(s)${when} en la bandeja de entrada.`;
  }

  if(/requieren respuesta|requiere respuesta|pendientes? de responder|pendientes? de contestar|tengo que responder|debo responder|necesito responder|que correos responder|que emails responder|que correos contestar|que emails contestar|cuales responder|cuales contestar|necesitan respuesta/.test(q)){
    const replyScore=(m)=>{
      const t=norm([m.from,m.subject,m.snippet,m.status].join(" "));
      let s=0;
      if(/pregunta|consulta|confirma|confirmacion|respuesta|respond|contesta|necesito|necesitamos|podrias|puedes|cuando|plazo|incidencia|problema|reclam|pedido|presupuesto|entrega|envio|devoluc|cancel|mandes|enviar|envies|catalogo|documentacion|ficha tecnica|tarifa/.test(t))s+=5;
      if(/cliente|customer|proveedor|supplier|hola|hello|buenos dias|buenas tardes|dear sir|dear madam/.test(t))s+=2;
      if(/no leido|unread/.test(t))s+=1;
      if(/codigo de verificacion|verification code|login code|log in code|sign-in|sign in|new sign-in|nuevo inicio de sesion|otp|2fa|one-time|vence en \d+ minutos|expires in \d+ minutes|no compartas|do not share/.test(t))s-=10;
      if(/newsletter|boletin|promocion|marketing|noreply|no-reply|do not reply|notificacion automatica|notification|mailer@shopify\.com|system@vercel\.com|notifications@vercel\.com|linkedin|instagram|facebook|canva|social|report domain:|dmarc/.test(t))s-=8;
      if(/pago de una factura fallo|fallo el pago|payment failed|card declined/.test(t))s-=6;
      return s;
    };
    const pending=emails.map(m=>({m,score:replyScore(m)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
    if(!pending.length)return "He revisado los correos visibles y no encuentro ninguno que parezca requerir una respuesta clara.";
    const lines=pending.slice(0,10).map((x,i)=>`${i+1}. ${x.m.subject} — ${x.m.from||"remitente no disponible"}${x.m.date?` — ${x.m.date}`:""}${x.m.status?` — ${x.m.status}`:""}\n   ${x.m.snippet||"Sin vista previa disponible."}`);
    return `He revisado los correos. ${pending.length===1?"Solo encuentro 1 que requiera respuesta:":"Encuentro "+pending.length+" que requieren respuesta:"}\n\n${lines.join("\n\n")}\n\nLos avisos automáticos, códigos de acceso y newsletters se han excluido de esta cola.`;
  }

  if(/redacta|prepara|escribe|respuesta amable|responder al primer correo|responde al primer correo/.test(q)){
    const first=emails[0];
    if(!first)return "No tengo un primer correo disponible para preparar la respuesta.";
    const subject=first.subject||"(sin asunto)";
    const sender=first.from||"";
    const snippet=first.snippet||"";
    return `He revisado el primer correo visible:\n\nAsunto: ${subject}\nDe: ${sender}\n\nBorrador de respuesta:\n\nHola,\n\nGracias por tu mensaje. He recibido tu consulta y la estoy revisando. En relación con «${subject}», ${snippet?"he tenido en cuenta la información que indicas en el correo. ":""}Si necesitas que confirme algún dato concreto, indícamelo y te respondo con detalle.\n\nUn saludo.\n\nNo he enviado ni eliminado ningún correo; esto es solo un borrador para que lo revises.`;
  }

  if(/pedido|pedidos/.test(q)){
    const orderEmails=emails.filter(m=>/pedido|order|compra|presupuesto|entrega|expedicion|envio/i.test([m.subject,m.snippet].join(" ")));
    const pool=orderEmails.length?orderEmails:emails;
    const needsReply=(m)=>{
      const t=norm([m.subject,m.snippet,m.status].join(" "));
      let s=0;
      if(/no leido|unread/.test(t))s+=2;
      if(/pregunta|consulta|confirma|confirmacion|respuesta|respond|necesito|podrias|puedes|cuando|plazo|incidencia|problema|reclam|cancel|devoluc|urgente/.test(t))s+=3;
      if(/pedido|order|compra|presupuesto|entrega|envio|expedicion/.test(t))s+=1;
      return s;
    };
    const ranked=[...pool].sort((a,b)=>needsReply(b)-needsReply(a));
    const top=ranked[0];
    const shown=ranked.slice(0,5);
    const lines=shown.map((m,i)=>`${i+1}. ${m.subject} — ${m.from||"remitente no disponible"}${m.date?` — ${m.date}`:""}${m.status?` — ${m.status}`:""}\n   ${m.snippet||"Sin vista previa disponible."}`);
    const reason=top?`El que parece requerir respuesta primero es «${top.subject}» de ${top.from||"ese remitente"}, por las señales de consulta/seguimiento que aparecen en el asunto o la vista previa.`:"No veo un correo de pedido que requiera respuesta clara entre los últimos mensajes.";
    return `He revisado el correo seleccionado y he buscado mensajes relacionados con pedidos:\n\n${lines.join("\n\n")}\n\n${reason}`;
  }

  if(/ultim|recient/.test(q)){
    const wanted=(q.match(/\b(\d{1,2})\b/)||[])[1];
    const n=Math.max(1,Math.min(10,Number(wanted||5)));
    const chosen=emails.slice(0,n);
    const attentionScore=(m)=>{
      const t=norm([m.subject,m.snippet,m.status].join(" "));
      let s=0;
      if(/no leido|unread/.test(t))s+=2;
      if(/importante|important/.test(t))s+=3;
      if(/urgente|urgent|incidencia|problema|error|pago|factura|pedido|reclam|venc|cancel|devoluc|bloque|seguridad/.test(t))s+=2;
      return s;
    };
    const ranked=[...chosen].sort((a,b)=>attentionScore(b)-attentionScore(a));
    const top=ranked[0];
    const lines=chosen.map((m,i)=>`${i+1}. ${m.subject} — ${m.from||"remitente no disponible"}${m.date?` — ${m.date}`:""}${m.status?` — ${m.status}`:""}\n   ${m.snippet||"Sin vista previa disponible."}`);
    const reason=top?(`El que revisaría primero es «${top.subject}» de ${top.from||"ese remitente"}, porque ${/importante|important/i.test(top.status||"")?"Gmail lo marca como importante":/no le[ií]do|unread/i.test(top.status||"")?"está sin leer y es el que más señales de atención presenta":"por el contenido del asunto y la vista previa parece requerir más atención"}.`):"";
    return `He consultado el correo seleccionado. Estos son los últimos ${chosen.length} correos:\n\n${lines.join("\n\n")}\n\n${reason}`;
  }
  return null;
}

function portalFallback(req){
  const q=norm((req.body?.messages||[]).slice().reverse().find(m=>m?.role==="user")?.content||"");
  const portals=portalFiles(req);
  if(!portals.length)return null;
  const combined=portals.map(f=>String(f?.content||"")).join("\n\n");

  if(/facturad|facturacion|ventas/.test(q)&&/mes|mensual/.test(q)){
    const block=section(combined,"facturado mensual",["grafico facturacion mensual","ultimos 100 pedidos web","pedidos web"]);
    const values=euroValues(block);
    if(values.length===1)return `El facturado mensual que aparece ahora mismo en el portal es ${values[0]}.`;
    if(values.length>1)return `En el bloque «Facturado mensual» del portal aparecen estos importes: ${values.slice(0,5).join(", ")}. No voy a escoger uno sin poder distinguir con fiabilidad cuál es el total principal.`;
  }

  if(/ultim|recient/.test(q)&&/pedido/.test(q)){
    const block=section(combined,"ultimos 100 pedidos web",["facturas","productos","clientes"]);
    if(block){
      const clean=block.replace(/\n{3,}/g,"\n\n").trim().slice(0,5000);
      return `He consultado el portal de Naturdesma en solo lectura. Estos son los datos visibles en la sección de últimos pedidos web:\n\n${clean}`;
    }
  }

  if(/pedido/.test(q)&&/pendient/.test(q)){
    const block=section(combined,"ultimos 100 pedidos web",["facturas","productos","clientes"]);
    if(block){
      const lines=block.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      const hits=lines.filter(x=>norm(x).includes("pendiente")).slice(0,20);
      if(hits.length)return `He encontrado estos registros marcados como pendientes en el portal:\n${hits.map(x=>`• ${x}`).join("\n")}`;
    }
  }

  if(/producto|precio|tarifa|cliente|factura/.test(q)){
    const terms=q.split(/[^a-z0-9]+/).filter(x=>x.length>=4);
    const ranked=portals.map(f=>{
      const hay=norm(`${f.path}\n${f.content}`);
      return {f,score:terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0)};
    }).sort((a,b)=>b.score-a.score);
    const best=ranked[0];
    if(best?.score>0){
      const text=String(best.f.content||"").replace(/\n{3,}/g,"\n\n").trim();
      return `He consultado el portal autorizado. La información más relacionada que aparece es:\n\n${text.slice(0,4500)}`;
    }
  }

  return null;
}

// --- Control de acceso del chat de escritorio -------------------------------
// Toda petición que traiga datos locales, un scope o el bloque "desktop" es de la
// app de escritorio y debe llevar licencia + dispositivo. Solo la demo pública de
// la web (sin nada de eso) queda fuera.
function isDesktopRequest(req){
  return Boolean(req.body?.desktop)||localContext(req).length>0||Boolean(scopeName(req));
}

async function desktopGate(req){
  const mode=authMode(),scope=scopeName(req)||null;
  const auth=await authenticateDesktop(req.body);
  if(!auth.ok){
    logChatAuth({outcome:"denied",code:auth.code,scope,customerId:auth.customerId||null,detail:auth.detail||null});
    return mode==="enforce"?{deny:true,status:auth.status,code:auth.code,message:auth.message}:{deny:false,license:null};
  }
  const allowed=checkScopeAllowed(auth.license,scope);
  if(!allowed.ok){
    logChatAuth({outcome:"denied",code:allowed.code,scope,customerId:auth.license.customerId,plan:auth.license.planKey});
    return mode==="enforce"?{deny:true,status:allowed.status,code:allowed.code,message:allowed.message}:{deny:false,license:auth.license};
  }
  logChatAuth({outcome:"allowed",scope,customerId:auth.license.customerId,plan:auth.license.planKey});
  return {deny:false,license:auth.license};
}

// Las respuestas que pasan por la IA del agente Email consumen "acciones de email con IA"
// del plan (las respuestas directas, sin IA, no consumen).
async function chargeEmailAi(license,res){
  if(authMode()!=="enforce"||!license)return true;
  const m=await consumeMeter(license,"email_ai_actions",1,{scope:"agent:email"});
  if(m.meterError)console.error(JSON.stringify({event:"chat_meter_error",error:m.meterError}));
  if(m.ok)return true;
  res.status(429).json({error:"Has agotado las acciones de email con IA incluidas este mes. Puedes esperar a la renovación o ampliar tu plan.",code:"USAGE_LIMIT_REACHED",meter:"email_ai_actions"});
  return false;
}

export default async function handler(req,res){
  if(req.method!=="POST")return baseChat(req,res);
  if(req.body&&typeof req.body==="object")delete req.body.agentRole;
  let license=null;
  if(isDesktopRequest(req)){
    const gate=await desktopGate(req);
    if(gate.deny)return res.status(gate.status).json({error:gate.message,code:gate.code});
    license=gate.license;
  }
  if(req.body?.desktop){
    const scope=scopeName(req);

    // Aislamiento estricto por agente: el Agente Email jamás puede ver portales,
    // Shopify, Naturdesma, MobiliarioSanitario u otra fuente ajena al correo.
    if(isEmailScope(req)){
      const files=emailOnlyContext(req);
      if(!files.length){
        return res.status(200).json({
          reply:"El Agente Email está seleccionado, pero no he recibido datos de ninguna cuenta de correo conectada. Revisa la conexión de Email y vuelve a intentarlo.",
          source:"desktop-email-no-context",
          route:scope
        });
      }
      const isolatedReq=cloneWithContext(req,files);
      const emailDirect=emailFallback(isolatedReq);
      if(emailDirect)return res.status(200).json({reply:emailDirect,source:"desktop-email-direct",route:scope,filesUsed:files.length});
      if(!(await chargeEmailAi(license,res)))return;
      return baseChat(withRole(isolatedReq),res);
    }

    // El agente Web & Ecommerce solo puede trabajar con su contexto web/portal.
    if(scope==="agent:web_ecommerce"||scope.startsWith("portal:")){
      const files=portalOnlyContext(req);
      if(!files.length){
        return res.status(200).json({
          reply:"El Agente Web & Ecommerce está seleccionado, pero no he recibido datos de una tienda o portal conectado.",
          source:"desktop-web-no-context",
          route:scope
        });
      }
      const isolatedReq=cloneWithContext(req,files);
      const direct=portalFallback(isolatedReq);
      if(direct)return res.status(200).json({reply:direct,source:"desktop-portal-direct",route:scope,filesUsed:files.length});
      return baseChat(withRole(isolatedReq),res);
    }

    // Carla / Secretaria Ejecutiva debe recibir el contexto completo y llegar a la IA.
    // No debe caer en atajos de Email o portal por contener palabras como "correo" o "respuesta".
    if(scope==="agent:core_ai")return baseChat(withRole(req),res);

    // Sin agente especializado, solo se aplican fallbacks que correspondan a la fuente.
    const emailDirect=emailFallback(req);
    if(emailDirect)return res.status(200).json({reply:emailDirect,source:"desktop-email-direct",route:scope||null});
    const direct=portalFallback(req);
    if(direct)return res.status(200).json({reply:direct,source:"desktop-portal-direct",route:scope||null});
  }
  return baseChat(withRole(req),res);
}
