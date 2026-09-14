import crypto from "node:crypto";
function clean(v,n=6000){return String(v||"").trim().slice(0,n)}
function auth(req){
  const exp=process.env.AUTOMATION_WEBHOOK_SECRET;
  const got=clean(req.headers.authorization||"",500).replace(/^Bearer\s+/i,"");
  if(!exp||!got)return false;
  try{return exp.length===got.length&&crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(got))}catch{return false}
}
async function ai(input){
  const key=process.env.OPENAI_API_KEY;if(!key)throw new Error("AI_NOT_CONFIGURED");
  const model=process.env.OPENAI_MODEL||"gpt-5.6-terra";
  const instructions=`Eres VNX Social Strategist. Diseña un calendario social B2B útil y creíble.
No inventes clientes, resultados, métricas, testimonios ni certificaciones.
Respeta brand_voice, forbidden_topics y claims_policy.
Adapta el contenido a cada canal. No reutilices el mismo texto literalmente en todos.
Devuelve SOLO JSON válido con:
strategy_summary:string,
content_pillars:string[],
recommended_cadence:object,
posts:array de objetos con channel,post_type,topic,copy,hashtags[],cta,scheduled_offset_days:number,approval_mode.
approval_mode debe ser approval_required salvo que input.policy permita autonomous.
No generes contenido político, sanitario o financiero sensible salvo que la marca lo requiera y exista política aprobada.`;
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({
    model,store:false,max_output_tokens:2400,instructions,input:JSON.stringify(input)
  })});
  const j=await r.json();if(!r.ok)throw new Error("AI_ERROR");
  const t=j.output_text||"",a=t.indexOf("{"),b=t.lastIndexOf("}");
  if(a<0||b<a)throw new Error("BAD_JSON");
  return JSON.parse(t.slice(a,b+1));
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  if(!auth(req))return res.status(401).json({error:"No autorizado"});
  try{
    const input={
      company:clean(req.body?.company,250),
      objective:clean(req.body?.objective,1000),
      audiences:req.body?.audiences||[],
      channels:req.body?.channels||["linkedin"],
      brand_voice:req.body?.brandVoice||{},
      pillars:req.body?.pillars||[],
      forbidden_topics:req.body?.forbiddenTopics||[],
      claims_policy:req.body?.claimsPolicy||{},
      cadence:req.body?.cadence||{},
      policy:req.body?.policy||{autonomous:false},
      horizon_days:Math.min(90,Math.max(7,Number(req.body?.horizonDays||30)))
    };
    const plan=await ai(input);
    return res.status(200).json({ok:true,plan});
  }catch(e){return res.status(500).json({error:"No se pudo generar el plan social"});}
}
