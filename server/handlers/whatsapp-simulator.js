import {aiConfigured,createAIResponse} from "../../lib/ai-client.js";

const SYSTEM=`Eres el empleado virtual de WhatsApp de una empresa que usa VentaNexIA. Estás en una demostración. Tu regla principal es resolver, no limitarte a explicar lo que podrías hacer. Si piden una publicación, escríbela completa con titular, texto, llamada a la acción y propuesta visual. Si piden un mockup, entrega un mockup textual concreto con composición, texto visible, imagen sugerida y copy. Si piden ideas, da ideas concretas. Si quieren hacer un pedido, pide solo los datos que falten y resume el pedido cuando ya los tengas. Si quieren una reunión, ofrece horarios de ejemplo y continúa. Si piden seguimiento o factura, pide solo el identificador mínimo necesario. Usa toda la conversación, no repitas preguntas y recuerda los datos ya dados. No inventes stock real, precios reales, fechas reales de entrega ni datos privados. Para precios, descuentos o compromisos comerciales, prepara un borrador pero deja claro que necesita aprobación antes de enviarse. Habla en español de España, natural, útil, directo y sin jerga. Prioriza entregar algo terminado sobre decir lo que podrías hacer. Máximo 180 palabras salvo que pidan detalle.`;

function text(data){if(typeof data?.output_text==="string"&&data.output_text.trim())return data.output_text.trim();for(const item of (Array.isArray(data?.output)?data.output:[])){for(const c of (Array.isArray(item?.content)?item.content:[])){if(c?.type==="output_text"&&typeof c.text==="string"&&c.text.trim())return c.text.trim();}}return "";}
const sensitive=/\b(precio|precios|descuento|descuentos|tarifa|rebaja|condiciones comerciales|devoluci[oó]n|abono|compensaci[oó]n)\b/i;

export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
 const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-16):[];
 if(!messages.length)return res.status(400).json({error:"Conversación vacía"});
 if(!aiConfigured())return res.status(503).json({code:"NOT_CONFIGURED",error:"Asistente no configurado"});
 const last=[...messages].reverse().find(m=>m?.role==="user"&&typeof m?.content==="string")?.content||"";
 const requiresApproval=sensitive.test(last);
 const input=messages.filter(m=>["user","assistant"].includes(m?.role)&&typeof m?.content==="string").map(m=>({role:m.role,content:[{type:"input_text",text:m.content.slice(0,5000)}]}));
 try{
  const instructions=SYSTEM+(requiresApproval?" El último mensaje trata un asunto sensible: prepara una respuesta útil pero indica que queda pendiente de aprobación antes de enviarse.":"");
  const r=await createAIResponse({instructions,input,max_output_tokens:500,store:false});
  if(!r.ok)return res.status(502).json({error:"No se pudo obtener respuesta"});
  const reply=text(r.data);if(!reply)return res.status(502).json({error:"Respuesta vacía"});
  return res.status(200).json({reply,requiresApproval});
 }catch{return res.status(500).json({error:"Error temporal del asistente"});}
}
