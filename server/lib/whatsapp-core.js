import crypto from "node:crypto";
import {pdb} from "../../lib/portal-auth.js";
import {createAIResponse,aiConfigured} from "../../lib/ai-client.js";

export const META_GRAPH_VERSION="v26.0";
const META_GRAPH_BASE=`https://graph.facebook.com/${META_GRAPH_VERSION}`;

function secretKey(){
  const raw=String(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY||"");
  if(raw.length<32) throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY_NOT_CONFIGURED");
  return crypto.createHash("sha256").update(raw).digest();
}
export function encryptToken(token){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",secretKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(String(token),"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return {token_ciphertext:ciphertext.toString("base64"),token_iv:iv.toString("base64"),token_tag:tag.toString("base64")};
}
export function decryptToken(row){
  const decipher=crypto.createDecipheriv("aes-256-gcm",secretKey(),Buffer.from(row.token_iv,"base64"));
  decipher.setAuthTag(Buffer.from(row.token_tag,"base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.token_ciphertext,"base64")),decipher.final()]).toString("utf8");
}
export async function sendWhatsAppText(channel,to,text){
  const token=decryptToken(channel);
  const r=await fetch(META_GRAPH_BASE+"/"+encodeURIComponent(channel.phone_number_id)+"/messages",{
    method:"POST",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({messaging_product:"whatsapp",to:String(to),type:"text",text:{preview_url:false,body:String(text).slice(0,4000)}})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j?.error?.message||("META_"+r.status));
  return j;
}
function outputText(data){
  if(typeof data?.output_text==="string"&&data.output_text.trim())return data.output_text.trim();
  const out=Array.isArray(data?.output)?data.output:[];
  for(const item of out)for(const c of Array.isArray(item?.content)?item.content:[])if(c?.type==="output_text"&&c.text)return String(c.text).trim();
  return "";
}
export async function buildWhatsAppReply({tenantId,inboundText,customerName=""}){
  let profile={};
  try{
    const rows=await pdb("vnx_onboarding_profiles?tenant_id=eq."+encodeURIComponent(tenantId)+"&select=company_profile,brand_voice,commercial_rules&limit=1");
    profile=rows?.[0]||{};
  }catch{}
  const fallback="Gracias por tu mensaje. Lo hemos recibido y lo revisaremos para darte una respuesta adecuada.";
  if(!aiConfigured())return {reply:fallback,requiresApproval:true};
  const instructions=`Eres el agente de WhatsApp de una empresa que usa VentaNexIA.
Redacta una respuesta breve, natural y profesional en español.
Usa únicamente el mensaje recibido y la información empresarial proporcionada.
Si faltan datos para resolver, pide solo los datos necesarios.
No inventes precios, stock, plazos, descuentos, pedidos ni condiciones.
No comprometas dinero, descuentos, devoluciones, contratos ni condiciones comerciales sin aprobación.
Si el caso es sensible, ambiguo, reclama dinero, exige una excepción o necesita una decisión humana, requiresApproval=true.
Si el cliente pide dejar de recibir mensajes, confirma brevemente la baja y requiresApproval=false.
No solicites números completos de tarjeta, contraseñas ni datos especialmente sensibles.
Devuelve SOLO JSON válido: {"reply":"texto","requiresApproval":true|false}.`;
  const input=[
    {role:"user",content:[{type:"input_text",text:"Cliente: "+(customerName||"No indicado")+"\nMensaje: "+String(inboundText||"").slice(0,6000)+"\nContexto empresa: "+JSON.stringify(profile).slice(0,9000)}]}
  ];
  try{
    const r=await createAIResponse({instructions,input,max_output_tokens:700,store:false});
    if(!r.ok)return {reply:fallback,requiresApproval:true};
    const raw=outputText(r.data).replace(/^\`\`\`json\s*/i,"").replace(/\`\`\`$/,"").trim();
    const j=JSON.parse(raw);
    const reply=String(j.reply||"").trim();
    return reply?{reply:reply.slice(0,4000),requiresApproval:Boolean(j.requiresApproval)}:{reply:fallback,requiresApproval:true};
  }catch{return {reply:fallback,requiresApproval:true}}
}
