import crypto from "node:crypto";
import {db,suspendTenant} from "../../lib/entitlement.js";

function authorized(req){
  const exp=process.env.CRON_SECRET||process.env.AUTOMATION_WEBHOOK_SECRET;
  const got=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!exp||!got)return false;
  try{return exp.length===got.length&&crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(got))}catch{return false}
}
async function eventExists(tenantId,type){
  try{const rows=await db(`vnx_customer_events?tenant_id=eq.${encodeURIComponent(tenantId)}&event_type=eq.${encodeURIComponent(type)}&select=id&limit=1`);return Boolean(rows?.length)}catch{return false}
}
async function recordEvent(tenantId,type,title,details={}){
  try{await db("vnx_customer_events",{method:"POST",body:JSON.stringify([{tenant_id:tenantId,event_type:type,title,details}])})}catch{}
}
async function tenantInfo(tenantId){
  const rows=await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}&select=id,name,settings`);
  const t=rows?.[0]||{};return {name:t.name||"",email:String(t.settings?.owner_email||t.settings?.email||"").trim()};
}
async function sendMail(to,subject,text){
  const key=process.env.RESEND_API_KEY;if(!key||!to)return false;
  const from=process.env.BILLING_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"facturacion@ventanexia.es";
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject,text})});
  return r.ok;
}
async function blockExpired(ent){
  const policy=ent.feature_policy&&typeof ent.feature_policy==="object"?ent.feature_policy:{};
  const until=Date.parse(policy.payment_grace_until||"");
  if(!Number.isFinite(until)||Date.now()<until)return false;
  await suspendTenant(ent.tenant_id,"PAYMENT_GRACE_EXPIRED");
  if(ent.stripe_customer_id)await db(`vnx_contracts?stripe_customer_id=eq.${encodeURIComponent(ent.stripe_customer_id)}`,{method:"PATCH",body:JSON.stringify({status:"suspended",updated_at:new Date().toISOString()})}).catch(()=>{});
  if(await eventExists(ent.tenant_id,"payment_grace_blocked"))return true;
  const t=await tenantInfo(ent.tenant_id),payUrl=String(policy.payment_url||"").trim();
  const text=`Hola${t.name?` ${t.name}`:""},

Han pasado las 24 horas de cortesía y la cuota de VentaNexIA sigue pendiente. Por seguridad, el software ha quedado temporalmente pausado.

No has perdido tu configuración ni tus datos. Puedes recuperar el acceso en cuanto regularices el pago desde el enlace seguro de Stripe:

${payUrl||"Abre tu factura pendiente desde tu zona de facturación."}

En cuanto Stripe confirme el pago, VentaNexIA se reactivará automáticamente.

Si ya lo has pagado hace unos minutos, no necesitas hacer nada más; la confirmación puede tardar un poco en llegar.

VentaNexIA · ECOJAFER S.L.`;
  const sent=await sendMail(t.email,"VentaNexIA está pausado temporalmente · pago pendiente",text).catch(()=>false);
  await recordEvent(ent.tenant_id,"payment_grace_blocked","Licencia pausada tras 24 h de pago pendiente",{payment_grace_until:policy.payment_grace_until,payment_url:payUrl,email_sent:sent});
  return true;
}
export default async function handler(req,res){
  if(!["GET","POST"].includes(req.method))return res.status(405).json({error:"Método no permitido"});
  if(!authorized(req))return res.status(401).json({error:"No autorizado"});
  try{
    const rows=await db("vnx_entitlements?state=eq.active&select=tenant_id,state,feature_policy,stripe_customer_id");
    const due=(rows||[]).filter(x=>x.feature_policy?.billing_status==="payment_due"&&x.feature_policy?.payment_grace_until);
    let blocked=0;for(const x of due)if(await blockExpired(x))blocked++;
    return res.status(200).json({ok:true,checked:due.length,blocked});
  }catch(e){console.error("billing_grace_sweep",String(e?.message||e).slice(0,500));return res.status(500).json({error:"Sweep failed"})}
}
