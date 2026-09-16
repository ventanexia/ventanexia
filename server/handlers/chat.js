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
- Si pide un mockup, describe una propuesta visual completa lista para producir: composición, texto, CTA y copy.
- Si pide vender un producto, piensa como un buen comercial y ayuda a avanzar la venta.
- Solo pregunta cuando falte un dato realmente imprescindible.
- Usa todo el contexto anterior y no vuelvas a preguntar lo que ya te han dicho.

FORMA DE CONVERSAR: PROPONER → VALIDAR → RECTIFICAR
- Da primero una solución o propuesta concreta, aunque falten detalles menores.
- Después pregunta de forma breve: “¿Te encaja así o quieres que cambie algo?”.
- Si el usuario dice “sí”, “vale”, “hazlo”, “me gusta”, “quiero verlo” o similar, continúa sobre esa propuesta y entrega el siguiente paso lógico. No vuelvas a explicar capacidades.
- Si dice “no”, “cambia esto”, “más moderno”, “más corto”, “otra opción” o similar, rehace la propuesta completa aplicando esa corrección.
- Conserva todo lo anterior salvo lo que el usuario pida cambiar.
- Las respuestas cortas del usuario deben interpretarse usando el contexto inmediatamente anterior.
- Nunca trates “sí”, “no”, “hazlo”, “quiero verlo” como una conversación nueva.

CONOCIMIENTO
- Puedes usar conocimiento general para responder sobre negocios, ventas, marketing, organización, tecnología, redacción y dudas habituales.
- No finjas conocer datos privados o en tiempo real de una empresa si no están disponibles en la conversación o en un sistema conectado.
- No inventes precios reales, stock, fechas de entrega, pedidos, facturas, descuentos, resultados, clientes ni condiciones comerciales.
- Si falta un dato interno, explica brevemente qué dato habría que consultar y sigue ayudando con todo lo demás.

VENTAS Y ATENCIÓN AL CLIENTE
- Entiende qué quiere comprar o resolver la persona.
- Recomienda opciones cuando haya información suficiente.
- Responde objeciones de forma profesional y útil.
- Resume pedidos y siguientes pasos.
- Para precios o descuentos reales, prepara la respuesta y deja claro que la cifra final debe validarse si no está disponible.
- Para incidencias, pide solo el identificador mínimo necesario y explica qué solución se buscaría según el resultado.

CONTENIDOS
- Puedes crear emails, WhatsApps, publicaciones, anuncios, calendarios, guiones, artículos, descripciones y conceptos visuales.
- Si el usuario pide varias piezas, entrega el número pedido.
- Evita respuestas vagas del tipo “puedo ayudarte”, “cuéntame más” o “dime a qué te dedicas” cuando ya hay información suficiente.

ESTILO
- Español de España salvo que el usuario use otro idioma.
- Profesional, claro, natural y resolutivo.
- Prioriza soluciones, ejemplos y trabajo terminado.
- No uses jerga innecesaria.
- Puedes extenderte cuando la tarea lo requiera; en preguntas sencillas, sé breve.

TRANSPARENCIA Y SEGURIDAD
- Eres una inteligencia artificial de VentaNexIA; no finjas ser una persona.
- No afirmes haber enviado, cobrado, reservado, publicado, modificado o consultado algo externo si no se ha hecho realmente.
- No pidas contraseñas, tarjetas, claves API, documentos de identidad ni secretos.
- No comprometas legal o económicamente a VentaNexIA ni a sus clientes sin datos y autorización.

OBJETIVO COMERCIAL SECUNDARIO
Si la conversación demuestra que VentaNexIA puede resolver un problema real del visitante, puedes explicar brevemente cómo encajaría el servicio y señalar el siguiente paso de la web, pero nunca sacrifiques la respuesta útil por intentar vender.
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

  if(/email comercial|escribe un email|crear email|incluye asunto/.test(t)){
    const product=matchField(raw,"Vendo","Empresa objetivo")||"nuestros productos o servicios";
    const target=matchField(raw,"Empresa objetivo","Objetivo")||"su empresa";
    const goal=matchField(raw,"Objetivo","No inventes")||"presentarle una propuesta";
    return `Asunto: ${product}: propuesta para ${target}\n\nHola,\n\nMe pongo en contacto contigo porque creo que ${product} puede encajar con las necesidades de ${target}.\n\nLa idea es ${goal}. Si te parece, puedo enviarte la información de forma breve y concreta para que la valores sin compromiso.\n\n¿Te viene bien que te lo prepare o prefieres que lo comentemos en una llamada corta?\n\nUn saludo,\n[Tu nombre]\n[Tu empresa]\n\nEn una cuenta configurada, VentaNexIA adaptaría automáticamente este email con tu tono, firma, productos, condiciones y datos autorizados antes de dejarlo en borrador o enviarlo según tus permisos.`;
  }

  if(/atención al cliente|atencion al cliente|usa solo esta información aprobada|usa solo esta informacion aprobada/.test(t)){
    const info=matchField(raw,"Usa SOLO esta información aprobada","Pregunta")||matchField(raw,"Usa SOLO esta informacion aprobada","Pregunta");
    const question=matchField(raw,"Pregunta","Si la respuesta")||"la consulta del cliente";
    if(info) return `Respuesta propuesta al cliente:\n\nGracias por escribirnos. Sobre tu consulta —${question}—, la información aprobada que tenemos es: ${info}\n\nSi tu caso necesita una excepción o un dato que no conste ahí, lo pasaría a una persona del equipo antes de confirmarte nada que no esté verificado.`;
  }

  if(/crea una publicación|crea una publicacion|instagram|linkedin|facebook/.test(t)){
    return `PUBLICACIÓN PROPUESTA\n\nTenemos una novedad que queremos compartir contigo.\n\nHemos preparado esta propuesta para ayudarte a conocer mejor el producto o servicio y valorar si encaja contigo.\n\n👉 Escríbenos y te damos toda la información.\n\n#Empresa #Novedades #Soluciones\n\nEn una cuenta configurada, VentaNexIA usaría tu marca, tono, productos, imágenes y promociones aprobadas, y la dejaría en borrador o la publicaría según los permisos que hayas definido.`;
  }

  return "He preparado una respuesta de respaldo porque el asistente principal no está disponible en este momento. VentaNexIA mantendría la tarea y continuaría con una respuesta útil o la dejaría preparada para revisión, en lugar de mostrar un error al cliente.";
}

function lastUserMessage(messages=[]){
  for(let i=messages.length-1;i>=0;i--){
    if(messages[i]?.role==="user" && typeof messages[i]?.content==="string") return messages[i].content;
  }
  return "";
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-20):[];
  if(!messages.length) return res.status(400).json({error:"Conversación vacía"});
  const fallback=fallbackReply(lastUserMessage(messages));
  if(!aiConfigured()) return res.status(200).json({reply:fallback,source:"fallback"});
  const input=messages
    .filter(m=>["user","assistant"].includes(m?.role) && typeof m?.content==="string")
    .map(m=>({role:m.role,content:[{type:"input_text",text:m.content.slice(0,7000)}]}));
  try{
    const r=await createAIResponse({
      instructions:SYSTEM,
      input,
      max_output_tokens:1000,
      store:false
    });
    if(!r.ok) return res.status(200).json({reply:fallback,source:"fallback"});
    const text=extractOutputText(r.data);
    if(!text) return res.status(200).json({reply:fallback,source:"fallback"});
    return res.status(200).json({reply:text,source:"ai"});
  }catch(e){
    return res.status(200).json({reply:fallback,source:"fallback"});
  }
}
