import crypto from "node:crypto";
function clean(v,n=6000){return String(v||"").trim().slice(0,n)}
function auth(req){
  const exp=process.env.AUTOMATION_WEBHOOK_SECRET;
  const got=clean(req.headers["authorization"]||req.headers["x-vnx-automation-key"]||"",500).replace(/^Bearer\s+/i,"");
  if(!exp||!got)return false;
  try{return exp.length===got.length&&crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(got))}catch{return false}
}
async function callAI(input){
  const key=process.env.OPENAI_API_KEY;if(!key)throw new Error("AI_NOT_CONFIGURED");
  const model=process.env.OPENAI_MODEL||"gpt-5.6-terra";
  const instructions=`Eres VNX Builder. Diseña un módulo software por tenant para satisfacer una necesidad empresarial.
No inventes accesos. No incluyas secretos. Usa acciones reversibles cuando sea posible.
Devuelve SOLO JSON válido con:
module_key,name,version,capabilities[],triggers[],actions[],approval_policy{},config{},rollback{}.
Las acciones sensibles, irreversibles, contractuales, financieras, de credenciales o publicación masiva deben quedar como approval_required.`;
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model,store:false,max_output_tokens:1100,instructions,input:JSON.stringify(input)})});
  const j=await r.json();if(!r.ok)throw new Error("AI_ERROR");
  const t=j.output_text||"";const a=t.indexOf("{"),b=t.lastIndexOf("}");if(a<0||b<a)throw new Error("BAD_JSON");
  return JSON.parse(t.slice(a,b+1));
}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!auth(req)) return res.status(401).json({error:"No autorizado"});
  try{
    const manifest=await callAI({
      tenantId:clean(req.body?.tenantId,100),
      company:clean(req.body?.company,250),
      requirement:clean(req.body?.requirement,6000),
      existingCapabilities:req.body?.existingCapabilities||[],
      connectedProviders:req.body?.connectedProviders||[]
    });
    return res.status(200).json({ok:true,manifest,status:"DRAFT_REQUIRES_TEST"});
  }catch(e){return res.status(500).json({error:"No se pudo diseñar el módulo"});}
}
