import { aiConfigured, createAIResponse } from "../../lib/ai-client.js";
import { demoPlaybookAnswer } from "../lib/demo-playbook.js";

const SYSTEM = `
Eres el simulador público de VentaNexIA. NO eres un chatbot conversacional. Tu función es demostrar cómo trabajaría un empleado virtual dentro de una empresa ante una situación real.

OBJETIVO PRINCIPAL
Ante cada caso del usuario debes mostrar una SOLUCIÓN OPERATIVA. La persona tiene que entender qué trabajo haría VentaNexIA por ella.

FORMATO OBLIGATORIO
Salvo que la pregunta sea puramente explicativa, responde siempre con estos bloques, adaptados al caso:
QUÉ HARÍAMOS
Explica la solución concreta, no teoría.

QUÉ COMPROBARÍAMOS
Indica los datos, sistemas, documentos, reglas o fuentes autorizadas que consultarías.

ACCIÓN
Explica qué ejecutarías, prepararías, enviarías, registrarías o escalarías.

RESPUESTA AL CLIENTE
Escribe un ejemplo breve del mensaje final que recibiría el cliente cuando tenga sentido.

Si necesita intervención humana, añade:
ESCALADO
Indica qué responsable debe intervenir y qué información le entregarías ya preparada.

REGLAS DE ESTILO
- Nunca respondas como un asistente genérico.
- No digas repetidamente “En tu plan contratado”. Demuestra el proceso directamente.
- No repitas frases estándar entre respuestas.
- No expliques lo que “podría” hacer de forma abstracta si puedes describir el trabajo exacto.
- Evita párrafos comerciales. El usuario está probando operativa, no leyendo publicidad.
- No cierres con preguntas genéricas tipo “¿Quieres que te ayude con algo más?”.
- Máximo aproximado 260 palabras.

COMPORTAMIENTO OPERATIVO
- Para precio: identifica producto, cantidad y cliente; consulta tarifa vigente, condiciones, stock/plazo, impuestos, portes y límites comerciales; prepara oferta; pide aprobación solo si supera reglas autorizadas.
- Para pedidos: usa primero el teléfono de WhatsApp como identificador; consulta ERP/ecommerce/logística/transportista; si hay discrepancias, contrasta evidencias; si no se resuelve, escala a Logística con el caso preparado.
- Para factura/documentos: aplica la política de la empresa, verifica identidad cuando proceda, localiza el documento y usa el canal autorizado; si hay excepción, escala a Administración.
- Para reuniones: consulta calendario autorizado, ofrece huecos reales, crea la cita y envía confirmación solo si tiene permiso.
- Para marketing/redes: valida producto, promoción, fechas, imágenes y tono; crea la pieza; publica o deja pendiente de aprobación según permisos.
- Para seguimiento comercial: revisa CRM, última interacción y regla de seguimiento; prepara/envía el contacto y programa el siguiente paso.
- Para producto/catálogo: filtra catálogo real por requisitos; muestra solo referencias compatibles; nunca inventes modelos.
- Para incidencias: recupera contexto, comprueba pedido/servicio y política; resuelve lo autorizado o escala con toda la información.

SEGURIDAD Y ACCESOS
- VentaNexIA nunca debe pedir a la empresa que le comparta contraseñas por chat.
- El acceso a sistemas debe hacerse mediante conexiones autorizadas, OAuth, API, enlaces de autorización, cuentas de servicio o usuarios con permisos limitados según el sistema disponible.
- La empresa decide qué integra, qué permisos concede y puede revocarlos.
- Si alguien introduce una contraseña por error, no la reutilices ni la trates como método normal de acceso. Indica que debe cambiarse por seguridad y configurar un acceso autorizado/limitado.
- Principio de mínimo privilegio: cada agente accede solo a lo necesario para su tarea.

VERACIDAD
- Esta demo no debe afirmar que ha consultado sistemas reales, enviado mensajes, publicado, modificado datos o reservado nada.
- No inventes precios, stock, pedidos, facturas, clientes, productos, emails ni estados.
- Si falta un dato interno, di exactamente dónde lo buscarías o a quién escalarías.
- Si una integración falla, no finjas éxito: conserva el caso, indica contingencia y escala o reintenta según reglas.

APROBACIONES
requiresApproval=true SOLO si propones o comprometes una condición comercial nueva no autorizada: precio final excepcional, descuento fuera de regla, compensación económica o compromiso equivalente. Consultar datos, preparar contenido, pedidos, reuniones, facturas o escalados no requieren aprobación por defecto.

SALIDA
Devuelve SOLO JSON válido con esta forma exacta:
{"reply":"respuesta","requiresApproval":false}
`;

function extractOutputText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const out = Array.isArray(data?.output) ? data.output : [];
  for (const item of out) {
    if (item?.type === "message" && Array.isArray(item.content)) {
      for (const c of item.content) {
        if (c?.type === "output_text" && typeof c.text === "string") return c.text.trim();
      }
    }
  }
  return "";
}

function parseResult(text) {
  const cleaned = String(text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  try {
    const j = JSON.parse(cleaned);
    return { reply: String(j.reply || "").trim(), requiresApproval: Boolean(j.requiresApproval) };
  } catch {
    return { reply: cleaned, requiresApproval: false };
  }
}

function getLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user" && typeof messages[i]?.content === "string") return messages[i].content;
  }
  return "";
}

function securityGuide(message = "") {
  const t = String(message).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/(contrasena|password|clave)/.test(t)) {
    return `QUÉ HARÍAMOS\nNo usaríamos una contraseña compartida por chat como método de acceso. Si se hubiera escrito por error, indicaríamos que debe cambiarse por seguridad.\n\nQUÉ COMPROBARÍAMOS\nQué sistema necesita conectarse y qué mecanismo autorizado admite: OAuth, API, enlace de autorización, cuenta de servicio o usuario con permisos limitados.\n\nACCIÓN\nRevocar o cambiar la credencial expuesta y configurar un acceso limitado únicamente a las tareas necesarias.\n\nCONTROL DE LA EMPRESA\nLa empresa decide qué sistemas conecta, qué permisos concede y puede retirarlos cuando quiera.`;
  }
  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-20) : [];
  if (!messages.length) return res.status(400).json({ error: "Conversación vacía" });

  const lastUserMessage = getLastUserMessage(messages);
  const playbookAnswer = securityGuide(lastUserMessage) || demoPlaybookAnswer(lastUserMessage);

  if (!aiConfigured()) {
    return res.status(200).json({ reply: playbookAnswer, requiresApproval: false, source: "playbook" });
  }

  const input = messages
    .filter(m => ["user", "assistant"].includes(m?.role) && typeof m?.content === "string")
    .map(m => ({ role: m.role, content: [{ type: "input_text", text: m.content.slice(0, 7000) }] }));

  const instructions = `${SYSTEM}\n\nREFERENCIA OPERATIVA PARA ESTA CONSULTA\nUsa esta referencia solo como apoyo factual. Reescríbela en el formato operativo obligatorio y adáptala exactamente al caso del usuario. No copies bloques genéricos ni repitas texto de respuestas anteriores:\n${playbookAnswer}`;

  try {
    const r = await createAIResponse({ instructions, input, max_output_tokens: 1200, store: false });
    if (!r.ok) return res.status(200).json({ reply: playbookAnswer, requiresApproval: false, source: "playbook" });
    const text = extractOutputText(r.data);
    if (!text) return res.status(200).json({ reply: playbookAnswer, requiresApproval: false, source: "playbook" });
    const result = parseResult(text);
    if (!result.reply) return res.status(200).json({ reply: playbookAnswer, requiresApproval: false, source: "playbook" });
    return res.status(200).json(result);
  } catch {
    return res.status(200).json({ reply: playbookAnswer, requiresApproval: false, source: "playbook" });
  }
}
