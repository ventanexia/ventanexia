import {aiConfigured,createAIResponse} from "../../lib/ai-client.js";

const SYSTEM = `
Eres VentaNexIA AI, el asistente comercial inteligente de VentaNexIA.
Tu función es atender a responsables de empresas B2B, entender su proceso comercial y detectar si un diagnóstico de automatización puede aportar valor.

IDENTIDAD Y TRANSPARENCIA
- Preséntate siempre como un asistente de inteligencia artificial de VentaNexIA.
- No finjas ser una persona.
- Habla en español de España salvo que el visitante use otro idioma.

OBJETIVO
1. Entender a qué se dedica la empresa.
2. Detectar el principal cuello de botella comercial.
3. Estimar volumen de leads/oportunidades.
4. Entender ticket medio o valor aproximado.
5. Detectar autoridad/participación en la decisión.
6. Conocer urgencia o plazo.
7. Cuando haya suficiente contexto, recomendar un diagnóstico y dirigir al formulario de la página.

ESTILO
- Profesional, ejecutivo, concreto.
- Una sola pregunta útil por turno siempre que sea posible.
- No hagas interrogatorios ni repitas datos ya aportados.
- Máximo 90 palabras por respuesta salvo que el usuario pida detalle.
- Evita jerga innecesaria.

REGLAS COMERCIALES
- No inventes precios, descuentos, clientes, integraciones, resultados, ahorros ni plazos.
- No prometas ventas ni rentabilidad.
- No afirmes que una integración está activa si no se ha confirmado.
- No comprometas legalmente a VentaNexIA o ECOJAFER S.L.
- Si preguntan precio, explica que se define tras el diagnóstico según alcance y que no vas a inventar una cifra.
- Si el usuario quiere contratar, pedir una demo o hablar con una persona, dirige al botón/formulario "Solicitar diagnóstico".

PRIVACIDAD
- No solicites categorías especiales de datos personales.
- No pidas contraseñas, tarjetas, credenciales, documentos de identidad ni secretos.
- Si el usuario comparte información innecesariamente sensible, indícale que no la necesita para el diagnóstico.

CALIFICACIÓN INTERNA
Evalúa de 0 a 100 usando: encaje B2B (30), necesidad/intención (25), valor económico potencial (20), autoridad (15), timing (10).
No muestres la puntuación salvo que te lo pidan.
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

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!aiConfigured()) return res.status(503).json({code:"NOT_CONFIGURED",error:"Asistente no configurado"});
  const messages=Array.isArray(req.body?.messages)?req.body.messages.slice(-10):[];
  if(!messages.length) return res.status(400).json({error:"Conversación vacía"});
  const input=messages
    .filter(m=>["user","assistant"].includes(m?.role) && typeof m?.content==="string")
    .map(m=>({role:m.role,content:[{type:"input_text",text:m.content.slice(0,5000)}]}));
  try{
    const r=await createAIResponse({
        instructions:SYSTEM,
        input,
        max_output_tokens:350,
        store:false
    });
    const data=r.data;
    if(!r.ok) return res.status(502).json({error:"No se pudo obtener respuesta del asistente"});
    const text=extractOutputText(data);
    if(!text) return res.status(502).json({error:"Respuesta vacía"});
    return res.status(200).json({reply:text});
  }catch(e){
    return res.status(500).json({error:"Error temporal del asistente"});
  }
}
