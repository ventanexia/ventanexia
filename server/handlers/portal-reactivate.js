import {authenticatePortal,pdb} from "../../lib/portal-auth.js";
import {requireSameOrigin} from "../../lib/request-security.js";
async function stripePost(params,idempotencyKey){
  const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("STRIPE_NOT_CONFIGURED");
  const body=new URLSearchParams();for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=="")body.append(k,String(v));
  const r=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":idempotencyKey},body});
  const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||`Stripe ${r.status}`);return j;
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  if(!requireSameOrigin(req))return res.status(403).json({error:"Origen no permitido"});
  const s=await authenticatePortal(req);if(!s)return res.status(401).json({error:"No autorizado"});
  try{
    const ents=await pdb(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=state,plan_key,stripe_customer_id`);
    const ent=ents?.[0];if(!ent)return res.status(404).json({error:"Licencia no encontrada"});
    if(ent.state==="active")return res.status(409).json({error:"La suscripción ya está activa"});
    if(!ent.stripe_customer_id)return res.status(409).json({code:"INITIAL_ACTIVATION_REQUIRED",error:"Esta cuenta todavía no tiene una suscripción previa. Actívala desde la página de planes."});
    const prices={start:process.env.STRIPE_PRICE_START_MONTHLY,core:process.env.STRIPE_PRICE_CORE_MONTHLY||process.env.STRIPE_PRICE_MONTHLY,scale:process.env.STRIPE_PRICE_SCALE_MONTHLY};
    const price=prices[ent.plan_key];if(!price)return res.status(503).json({error:"Precio del plan no configurado"});
    const base=process.env.PUBLIC_APP_URL||"https://www.ventanexia.es";
    const session=await stripePost({mode:"subscription",customer:ent.stripe_customer_id,success_url:`${base}/portal.html?reactivated=1`,cancel_url:`${base}/portal.html?reactivated=0`,"line_items[0][price]":price,"line_items[0][quantity]":"1","metadata[tenant_id]":s.tenantId,"metadata[plan]":ent.plan_key,"metadata[reactivation]":"true","subscription_data[metadata][tenant_id]":s.tenantId,"subscription_data[metadata][plan]":ent.plan_key,integration_identifier:"ventanexia_reactivate_rjfnuzke"},`vnx-reactivate-${s.tenantId}-${ent.plan_key}`);
    return res.status(200).json({ok:true,url:session.url});
  }catch(e){console.error("portal_reactivate",String(e?.message||e).slice(0,300));return res.status(500).json({error:"No se pudo iniciar la reactivación"})}
}
