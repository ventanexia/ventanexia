import crypto from "node:crypto";
import {activatePaid,suspendTenant,reactivateAgents,db as entitlementDb} from "../../lib/entitlement.js";

function sb(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key,headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation"}};
}
async function sbFetch(path,options={}){
  const c=sb();
  const r=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{...c.headers,...(options.headers||{})}});
  const txt=await r.text(); let data=null;
  try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error(`SUPABASE_${r.status}:${typeof data==="string"?data:JSON.stringify(data)}`);
  return data;
}
async function stripeGet(path){
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key) return null;
  const r=await fetch(`https://api.stripe.com/v1${path}`,{headers:{Authorization:`Bearer ${key}`}});
  if(!r.ok) return null;
  return r.json().catch(()=>null);
}
function money(amount,currency="eur"){
  try{return new Intl.NumberFormat("es-ES",{style:"currency",currency:String(currency||"eur").toUpperCase()}).format((Number(amount)||0)/100)}catch{return `${((Number(amount)||0)/100).toFixed(2)} €`}
}
function cleanPhone(v){return String(v||"").replace(/[^+0-9]/g,"").slice(0,30)}
async function sendPaymentFailedEmail({email,company="",amountText,payUrl,invoiceNumber=""}){
  const key=process.env.RESEND_API_KEY;
  if(!key||!email) return false;
  const from=process.env.BILLING_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"facturacion@ventanexia.es";
  const subject=`No hemos podido cobrar tu cuota de VentaNexIA${invoiceNumber?` · ${invoiceNumber}`:""}`;
  const text=`Hola${company?` ${company}`:""},\n\nNo hemos podido realizar el cargo automático de tu cuota de VentaNexIA por ${amountText}. Puede deberse, entre otros motivos, a saldo insuficiente, tarjeta caducada o rechazo de la entidad emisora.\n\nPuedes regularizar la factura de forma segura con otra tarjeta o método de pago desde este enlace de Stripe:\n${payUrl||"Consulta tu factura en el área de facturación."}\n\nMientras el pago permanezca pendiente, el servicio puede quedar suspendido conforme al contrato. Si ya has realizado el pago, ignora este mensaje.\n\nVentaNexIA · ECOJAFER S.L.`;
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[email],subject,text})});
  return r.ok;
}
async function sendPaymentFailedWhatsApp({phone,amountText,payUrl}){
  const token=process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template=process.env.WHATSAPP_PAYMENT_FAILED_TEMPLATE;
  const language=process.env.WHATSAPP_PAYMENT_FAILED_LANGUAGE||"es";
  const to=cleanPhone(phone).replace(/^\+/,"");
  if(!token||!phoneNumberId||!template||!to||!payUrl) return false;
  const body={messaging_product:"whatsapp",to,type:"template",template:{name:template,language:{code:language},components:[{type:"body",parameters:[{type:"text",text:amountText},{type:"text",text:payUrl}]}]}};
  const r=await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  return r.ok;
}
async function notifyPaymentFailed(invoice){
  let meta=invoice?.metadata||{};
  if((!meta.customer_phone||!meta.customer_email)&&invoice?.subscription){
    const sub=await stripeGet(`/subscriptions/${encodeURIComponent(invoice.subscription)}`);
    if(sub?.metadata) meta={...sub.metadata,...meta};
  }
  const email=String(invoice?.customer_email||meta.customer_email||"").trim();
  const phone=String(meta.customer_phone||"").trim();
  const company=String(invoice?.customer_name||"").trim();
  const amountText=money(invoice?.amount_due,invoice?.currency);
  const payUrl=String(invoice?.hosted_invoice_url||"").trim();
  const invoiceNumber=String(invoice?.number||"").trim();
  const [emailSent,whatsappSent]=await Promise.all([
    sendPaymentFailedEmail({email,company,amountText,payUrl,invoiceNumber}).catch(()=>false),
    sendPaymentFailedWhatsApp({phone,amountText,payUrl}).catch(()=>false)
  ]);
  console.log(JSON.stringify({event:"payment_failed_notification",invoiceId:invoice?.id||null,emailSent,whatsappSent,hasPayUrl:Boolean(payUrl),ts:new Date().toISOString()}));
  return {emailSent,whatsappSent,payUrl};
}

const AGENTS=[
["guardian","VNX Guardian","EXECUTE_WITHIN_POLICY"],["scout","VNX Scout","AUTONOMOUS"],
["enrich","VNX Enrich","AUTONOMOUS"],["outreach","VNX Outreach","EXECUTE_WITHIN_POLICY"],
["inbox","VNX Inbox","EXECUTE_WITHIN_POLICY"],["qualify","VNX Qualify","AUTONOMOUS"],
["scheduler","VNX Scheduler","EXECUTE_WITHIN_POLICY"],["crm","VNX CRM","EXECUTE_WITHIN_POLICY"],
["proposal","VNX Proposal","PREPARE"],["content","VNX Content","EXECUTE_WITHIN_POLICY"],
["analyst","VNX Analyst","AUTONOMOUS"],["provision","VNX Provision","PREPARE"]
];
function inferConnections(bp={}){
 const t=JSON.stringify(bp).toLowerCase(),out=[];
 const add=(provider,purpose)=>out.push({provider,purpose});
 if(/crm|pipeline|hubspot|salesforce|zoho/.test(t))add("crm","pipeline");
 if(/email|correo|outreach|inbox|seguimiento/.test(t))add("email","commercial_email");
 if(/agenda|calendar|reuni|scheduler|cita/.test(t))add("calendar","scheduling");
 if(/social|linkedin|instagram|redes/.test(t))add("social","publishing");
 add("analytics","measurement"); add("website","widget_or_tracking");
 return out;
}
async function startProvisioning(solutionId,paymentMeta={}){
  if(!solutionId) return null;
  const rows=await sbFetch(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}&select=*`);
  const sol=rows?.[0]; if(!sol) return null;
  if(["provisioning","active"].includes(sol.status)) return {alreadyStarted:true};
  const created=await sbFetch("vnx_tenants",{method:"POST",body:JSON.stringify([{
    name:sol.company,status:"provisioning",autonomy_level:"execute_within_policy",
    settings:{solution_request_id:sol.id,blueprint:sol.blueprint,owner_email:sol.email,payment:paymentMeta}
  }])});
  const tenant=created?.[0]; if(!tenant?.id) throw new Error("TENANT_CREATE_FAILED");
  await sbFetch("vnx_onboarding_profiles",{method:"POST",body:JSON.stringify([{
    tenant_id:tenant.id,company_profile:{company:sol.company,owner_email:sol.email,solution_request_id:sol.id},desired_channels:inferConnections(sol.blueprint).map(x=>x.provider),status:"started"
  }])}).catch(()=>{});
  await sbFetch("vnx_agents",{method:"POST",body:JSON.stringify(AGENTS.map(([agent_key,name,mode])=>({tenant_id:tenant.id,agent_key,name,mode,enabled:true,policy:{source_blueprint:sol.id}})))});
  const connections=inferConnections(sol.blueprint);
  await sbFetch("vnx_connections",{method:"POST",body:JSON.stringify(connections.map(c=>({...c,tenant_id:tenant.id,status:"authorization_needed"})))});
  await sbFetch("vnx_jobs",{method:"POST",body:JSON.stringify([
    {tenant_id:tenant.id,job_type:"knowledge_onboarding",status:"queued",payload:{solution_request_id:sol.id}},
    {tenant_id:tenant.id,job_type:"configure_agents",status:"queued",payload:{blueprint:sol.blueprint}},
    {tenant_id:tenant.id,job_type:"connection_plan",status:"queued",payload:{connections}},
    {tenant_id:tenant.id,job_type:"prepare_installation",status:"waiting_approval",payload:{}}
  ])});
  await sbFetch("vnx_installations",{method:"POST",body:JSON.stringify([{tenant_id:tenant.id,install_type:"commercial_os",target:sol.company,status:"waiting_authorization",manifest:{solution_request_id:sol.id,blueprint:sol.blueprint,connections,payment:paymentMeta},rollback_manifest:{strategy:"disable_agents_disconnect_connectors_remove_widget"}}])});
  await sbFetch("vnx_approvals",{method:"POST",body:JSON.stringify([{tenant_id:tenant.id,agent_key:"provision",action_type:"production_install",title:`Autorizar instalación de ${sol.company}`,rationale:"El pago ha sido confirmado. VNX ha preparado el entorno aislado; falta autorizar conexiones e instalación productiva.",risk:"high",status:"pending",payload:{solution_request_id:sol.id,connections}}])});
  await sbFetch(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}`,{method:"PATCH",body:JSON.stringify({status:"provisioning",updated_at:new Date().toISOString()})});
  return {tenantId:tenant.id,connections};
}

export const config={api:{bodyParser:false}};
async function readRaw(req){const chunks=[];for await(const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return Buffer.concat(chunks)}
function verifyStripe(raw,header,secret){
  if(!header||!secret) return false;const parts={};for(const p of header.split(",")){const [k,v]=p.split("=",2);if(!parts[k]) parts[k]=[];parts[k].push(v)}
  const t=parts.t?.[0],sigs=parts.v1||[];if(!t||!sigs.length)return false;const age=Math.abs(Math.floor(Date.now()/1000)-Number(t));if(!Number.isFinite(age)||age>300)return false;
  const expected=crypto.createHmac("sha256",secret).update(`${t}.${raw.toString("utf8")}`).digest("hex");return sigs.some(sig=>{try{return sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))}catch{return false}})
}
async function hubspotPatch(dealId,properties){const token=process.env.HUBSPOT_ACCESS_TOKEN;if(!token||!dealId)return;const r=await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`,{method:"PATCH",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({properties})});if(!r.ok)throw new Error(`HubSpot ${r.status}`)}
async function forward(event){const url=process.env.N8N_AUTOMATION_WEBHOOK;if(!url)return;const key=process.env.AUTOMATION_WEBHOOK_SECRET||"";await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({source:"stripe",event})}).catch(()=>{})}
async function claimWebhookEvent(event){if(!event?.id)return{claimed:true};try{await sbFetch("vnx_webhook_events",{method:"POST",body:JSON.stringify([{provider:"stripe",event_id:event.id,event_type:event.type,status:"processing"}])});return{claimed:true}}catch(e){if(String(e?.message||e).includes("SUPABASE_409"))return{claimed:false,duplicate:true};throw e}}
async function finishWebhookEvent(event,status,lastError=null){if(!event?.id)return;await sbFetch(`vnx_webhook_events?provider=eq.stripe&event_id=eq.${encodeURIComponent(event.id)}`,{method:"PATCH",body:JSON.stringify({status,last_error:lastError,processed_at:status==="processed"?new Date().toISOString():null})}).catch(()=>{})}
async function resolveTenantId({tenantId="",solutionRequestId="",subscriptionId="",customerId=""}={}){if(tenantId)return tenantId;if(solutionRequestId){const rows=await entitlementDb(`vnx_tenants?settings->>solution_request_id=eq.${encodeURIComponent(solutionRequestId)}&select=id`);if(rows?.[0]?.id)return rows[0].id}if(subscriptionId){const rows=await entitlementDb(`vnx_entitlements?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=tenant_id`);if(rows?.[0]?.tenant_id)return rows[0].tenant_id}if(customerId){const rows=await entitlementDb(`vnx_entitlements?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=tenant_id`);if(rows?.[0]?.tenant_id)return rows[0].tenant_id}return null}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).send("Method not allowed");
  const raw=await readRaw(req),sig=req.headers["stripe-signature"],secret=process.env.STRIPE_WEBHOOK_SECRET;
  if(!verifyStripe(raw,sig,secret)) return res.status(400).send("Invalid signature");
  let event;try{event=JSON.parse(raw.toString("utf8"))}catch{return res.status(400).send("Invalid JSON")}
  try{
    const claim=await claimWebhookEvent(event);if(!claim.claimed)return res.status(200).json({received:true,duplicate:true});
    const obj=event.data?.object||{};
    const dealId=String(obj.metadata?.deal_id||obj.client_reference_id||"");
    const solutionRequestId=String(obj.metadata?.solution_request_id||"");
    const metadataTenantId=String(obj.metadata?.tenant_id||"");
    if(event.type==="checkout.session.completed"&&dealId){const paid=["paid","no_payment_required"].includes(obj.payment_status);if(paid){await hubspotPatch(dealId,{dealstage:"closedwon",hs_priority:"high",hs_next_step:"Iniciar onboarding y provisionamiento de VentaNexIA"});if(solutionRequestId)await startProvisioning(solutionRequestId,{stripe_session_id:obj.id,customer:obj.customer||null,subscription:obj.subscription||null})}}
    else if(event.type==="invoice.paid"&&dealId) await hubspotPatch(dealId,{hs_next_step:"Servicio activo · revisar onboarding/entrega"});
    else if(event.type==="customer.subscription.deleted"&&dealId) await hubspotPatch(dealId,{hs_next_step:"Revisar cancelación, motivo y plan de retención"});

    const subscriptionId=String(obj.subscription||(event.type.startsWith("customer.subscription.")?obj.id:"")||"");
    const customerId=String(obj.customer||"");
    const tenantId=await resolveTenantId({tenantId:metadataTenantId,solutionRequestId,subscriptionId,customerId});
    if(event.type==="checkout.session.completed"&&tenantId&&["paid","no_payment_required"].includes(obj.payment_status)){await activatePaid(tenantId,{customerId:customerId||null,subscriptionId:String(obj.subscription||"")||null,invoiceId:String(obj.invoice||"")||null,planKey:String(obj.metadata?.plan||"core")});await reactivateAgents(tenantId)}
    if(event.type==="invoice.paid"&&tenantId){await activatePaid(tenantId,{customerId:customerId||null,subscriptionId:String(obj.subscription||"")||null,invoiceId:String(obj.id||"")||null});await reactivateAgents(tenantId)}
    if(event.type==="invoice.payment_failed"){
      if(tenantId) await suspendTenant(tenantId,"PAYMENT_FAILED");
      await notifyPaymentFailed(obj);
    }
    if(event.type==="customer.subscription.updated"&&tenantId){const status=String(obj.status||"");if(["active","trialing"].includes(status)){await activatePaid(tenantId,{customerId:customerId||null,subscriptionId:subscriptionId||null,planKey:String(obj.metadata?.plan||"core")});await reactivateAgents(tenantId)}else if(["past_due","unpaid","paused","incomplete_expired","canceled"].includes(status))await suspendTenant(tenantId,`SUBSCRIPTION_${status.toUpperCase()}`)}
    if(event.type==="customer.subscription.deleted"&&tenantId) await suspendTenant(tenantId,"SUBSCRIPTION_CANCELLED");
    await forward(event);await finishWebhookEvent(event,"processed");
    console.log(JSON.stringify({event:"stripe_event_processed",type:event.type,dealId:dealId||null,ts:new Date().toISOString()}));
    return res.status(200).json({received:true});
  }catch(e){
    await finishWebhookEvent(event,"failed",String(e?.message||e).slice(0,400));
    console.error(JSON.stringify({event:"stripe_event_error",type:event?.type,error:String(e?.message||e).slice(0,400)}));
    return res.status(500).send("Processing error");
  }
}
