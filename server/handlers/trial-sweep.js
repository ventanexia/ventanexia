import crypto from "node:crypto";
import {db,suspendTenant} from "../../lib/entitlement.js";
function authorized(req){
  const exp=process.env.CRON_SECRET||process.env.AUTOMATION_WEBHOOK_SECRET;
  const got=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!exp||!got)return false;
  try{return exp.length===got.length&&crypto.timingSafeEqual(Buffer.from(exp),Buffer.from(got))}catch{return false}
}
function appUrl(){return String(process.env.PUBLIC_APP_URL||"https://ventanexia.es").replace(/\/$/,"")}
async function eventExists(tenantId,type){
  try{const rows=await db(`vnx_customer_events?tenant_id=eq.${encodeURIComponent(tenantId)}&event_type=eq.${encodeURIComponent(type)}&select=id&limit=1`);return Boolean(rows?.length)}catch{return false}
}
async function recordEvent(tenantId,type,title,details={}){
  try{await db("vnx_customer_events",{method:"POST",body:JSON.stringify([{tenant_id:tenantId,event_type:type,title,details}])})}catch{}
}
async function tenantInfo(tenantId){
  const rows=await db(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}&select=id,name,settings`);
  const t=rows?.[0]||{};return {name:t.name||"",email:String(t.settings?.owner_email||"").trim()};
}
async function sendMail(to,subject,text){
  const key=process.env.RESEND_API_KEY;if(!key||!to)return false;
  const from=process.env.TRIAL_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"ventas@ventanexia.es";
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject,text})});
  return r.ok;
}
async function remindTrial(ent){
  if(await eventExists(ent.tenant_id,"trial_expiring_reminder"))return false;
  const t=await tenantInfo(ent.tenant_id);if(!t.email)return false;
  const url=`${appUrl()}/portal.html`;
  const ok=await sendMail(t.email,"Tu prueba de VentaNexIA termina pronto",`Hola${t.name?` ${t.name}`:""},

Tu prueba gratuita de 15 días de VentaNexIA está a punto de terminar.

No hemos guardado ninguna tarjeta y no se realizará ningún cobro automático.

Cuando termine, el servicio quedará pausado. Si quieres seguir, entra en tu zona de VentaNexIA y pulsa “Quiero seguir con VentaNexIA”. Allí podrás revisar el plan, aceptar el contrato y añadir tu tarjeta.

${url}

Si no quieres continuar, no tienes que hacer nada y no se cobrará nada.

VentaNexIA · ECOJAFER S.L.`);
  if(ok)await recordEvent(ent.tenant_id,"trial_expiring_reminder","Aviso de fin de prueba enviado",{trial_ends_at:ent.trial_ends_at});
  return ok;
}
async function expireTrial(ent){
  await suspendTenant(ent.tenant_id,"TRIAL_EXPIRED");
  if(await eventExists(ent.tenant_id,"trial_expired_email"))return;
  const t=await tenantInfo(ent.tenant_id);if(!t.email)return;
  const url=`${appUrl()}/portal.html`;
  const ok=await sendMail(t.email,"Tu prueba ha terminado · decide si quieres seguir",`Hola${t.name?` ${t.name}`:""},

Tus 15 días gratuitos de VentaNexIA han terminado y el servicio ha quedado pausado. Tus datos y configuración se conservan.

No se ha realizado ningún cobro y no tenemos que cargar ninguna tarjeta porque no te la pedimos durante la prueba.

Si te ha gustado y quieres continuar:
1. Entra en tu zona de VentaNexIA.
2. Pulsa “Quiero seguir con VentaNexIA”.
3. Revisa y firma el contrato.
4. Añade tu método de pago.
5. La suscripción se activa y recuperas el acceso.

${url}

Si no quieres continuar, no tienes que hacer nada.

VentaNexIA · ECOJAFER S.L.`);
  if(ok)await recordEvent(ent.tenant_id,"trial_expired_email","Email de prueba finalizada enviado",{trial_ends_at:ent.trial_ends_at});
}
export default async function handler(req,res){
  if(!["GET","POST"].includes(req.method)) return res.status(405).json({error:"Método no permitido"});
  if(!authorized(req)) return res.status(401).json({error:"No autorizado"});
  try{
    const now=Date.now(),soon=new Date(now+48*60*60*1000).toISOString(),nowIso=new Date(now).toISOString();
    const expiring=await db(`vnx_entitlements?state=eq.trial&trial_ends_at=gt.${encodeURIComponent(nowIso)}&trial_ends_at=lte.${encodeURIComponent(soon)}&select=tenant_id,trial_ends_at,plan_key`);
    let reminders=0;for(const x of expiring||[]){if(await remindTrial(x))reminders++}
    const expired=await db(`vnx_entitlements?state=eq.trial&trial_ends_at=lt.${encodeURIComponent(nowIso)}&select=tenant_id,trial_ends_at,plan_key`);
    let suspended=0;for(const x of expired||[]){await expireTrial(x);suspended++}
    return res.status(200).json({ok:true,reminders,suspended});
  }catch(e){console.error("trial_sweep",String(e?.message||e).slice(0,500));return res.status(500).json({error:"Sweep failed"});}
}
