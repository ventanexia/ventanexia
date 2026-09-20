import crypto from "node:crypto";
import {activatePaid,suspendTenant,reactivateAgents,db as entitlementDb} from "../../lib/entitlement.js";

function sb(){const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");return {url,key,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation"}}}
async function sbFetch(path,options={}){const c=sb();const r=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{...c.headers,...(options.headers||{})}});const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}if(!r.ok)throw new Error(`SUPABASE_${r.status}:${typeof data==="string"?data:JSON.stringify(data)}`);return data}
async function stripeGet(path){const key=process.env.STRIPE_SECRET_KEY;if(!key)return null;const r=await fetch(`https://api.stripe.com/v1${path}`,{headers:{Authorization:`Bearer ${key}`}});if(!r.ok)return null;return r.json().catch(()=>null)}
function money(amount,currency="eur"){try{return new Intl.NumberFormat("es-ES",{style:"currency",currency:String(currency||"eur").toUpperCase()}).format((Number(amount)||0)/100)}catch{return `${((Number(amount)||0)/100).toFixed(2)} €`}}
function cleanPhone(v){return String(v||"").replace(/[^+0-9]/g,"").slice(0,30)}
async function recordCustomerEvent({customerId="",contractId="",tenantId=null,eventType,title="",details={}}){try{await sbFetch("vnx_customer_events",{method:"POST",body:JSON.stringify([{stripe_customer_id:customerId||null,contract_id:contractId||null,tenant_id:tenantId||null,event_type:eventType,title:title||eventType,details}])})}catch{}}
async function linkContract({contractId,customerId,subscriptionId,sessionId}){if(!contractId)return;try{await sbFetch(`vnx_contracts?contract_id=eq.${encodeURIComponent(contractId)}`,{method:"PATCH",body:JSON.stringify({stripe_customer_id:customerId||null,stripe_subscription_id:subscriptionId||null,stripe_checkout_session_id:sessionId||null,status:"active",updated_at:new Date().toISOString()})})}catch{}}
async function sendPaymentFailedEmail({email,company="",amountText,payUrl,invoiceNumber=""}){const key=process.env.RESEND_API_KEY;if(!key||!email)return false;const from=process.env.BILLING_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"facturacion@ventanexia.es";const subject=`No hemos podido cobrar tu cuota de VentaNexIA${invoiceNumber?` · ${invoiceNumber}`:""}`;const text=`Hola${company?` ${company}`:""},\n\nNo hemos podido realizar el cargo automático de tu cuota de VentaNexIA por ${amountText}. Puede deberse, entre otros motivos, a saldo insuficiente, tarjeta caducada o rechazo de la entidad emisora.\n\nPuedes regularizar la factura de forma segura con otra tarjeta o método de pago desde este enlace de Stripe:\n${payUrl||"Consulta tu factura en el área de facturación."}\n\nMientras el pago permanezca pendiente, el servicio puede quedar suspendido conforme al contrato. Si ya has realizado el pago, ignora este mensaje.\n\nVentaNexIA · ECOJAFER S.L.`;const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[email],subject,text})});return r.ok}
const MANUAL_PROVISIONING=new Set(["conexion","email_account","storage_pack","extra_device"]);
async function createProvisioningTask({tenantId,itemKey,sessionId}){
  if(!MANUAL_PROVISIONING.has(itemKey)||!tenantId)return null;
  const x=EXTRA_ACTIONS[itemKey]||{label:itemKey,provider:"Revisar",action:"Revisar y activar manualmente."};
  const dueAt=new Date(Date.now()+48*60*60*1000).toISOString();
  try{
    const rows=await sbFetch("vnx_provisioning_tasks",{method:"POST",body:JSON.stringify([{
      tenant_id:tenantId,item_key:itemKey,title:x.label,provider:x.provider||null,instructions:x.action||null,
      status:"pending",source:"stripe",source_ref:sessionId||null,due_at:dueAt
    }])});
    return rows?.[0]||null;
  }catch(e){
    if(String(e?.message||e).includes("SUPABASE_409"))return null;
    throw e;
  }
}
async function sendCustomerActivationEmail({tenantId,items=[],sessionId=""}){
  const key=process.env.RESEND_API_KEY;if(!key||!tenantId||!items.length)return false;
  const tenant=await tenantSummary(tenantId),email=String(tenant.settings?.owner_email||tenant.settings?.email||"").trim();
  if(!email)return false;
  const manual=items.filter(x=>MANUAL_PROVISIONING.has(x)),instant=items.filter(x=>!MANUAL_PROVISIONING.has(x));
  const from=process.env.BILLING_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"facturacion@ventanexia.es";
  const parts=[];
  if(instant.length)parts.push("Ya tienes disponibles: "+instant.map(k=>(EXTRA_ACTIONS[k]?.label||k)).join(", ")+".");
  if(manual.length)parts.push("Estamos activando: "+manual.map(k=>(EXTRA_ACTIONS[k]?.label||k)).join(", ")+". Esta activación puede tardar hasta 24–48 horas porque requiere comprobar o ampliar capacidad con el proveedor correspondiente. Te avisaremos en cuanto esté lista.");
  const subject=manual.length?"VentaNexIA · Hemos recibido tu ampliación":"VentaNexIA · Tus créditos ya están disponibles";
  const text="Hola,\n\nHemos recibido correctamente tu pago adicional.\n\n"+parts.join("\n\n")+"\n\nNo necesitas hacer nada ahora. Si alguna ampliación requiere una activación manual, no la mostraremos como operativa hasta que esté realmente disponible.\n\nReferencia: "+(sessionId||"—")+"\n\nVentaNexIA";
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[email],subject,text})});
  return r.ok;
}

const EXTRA_ACTIONS={
  video_pack:{label:"10 créditos de vídeo",billing:"Pago único",provider:"Proveedor de IA/vídeo",action:"No ampliar manualmente a un cliente si usamos una cuenta central por API. Verificar que el saldo/límite global del proveedor admite el nuevo consumo y que el monedero del cliente se ha acreditado."},
  image_pack:{label:"100 créditos de imagen",billing:"Pago único",provider:"Proveedor de IA/imágenes",action:"No requiere alta individual si trabajamos con API central. Verificar presupuesto/límites globales y saldo acreditado al cliente."},
  voice_pack:{label:"250 minutos de voz",billing:"Pago único",provider:"Proveedor de telefonía/voz",action:"Comprobar que la cuenta/proyecto de voz tiene capacidad y presupuesto suficientes. Si el proveedor trabaja por subcuenta o número dedicado, ampliar esa subcuenta; si factura por uso central, no hay compra manual por cliente."},
  whatsapp_pack:{label:"1.000 mensajes automatizados",billing:"Pago único",provider:"Meta / proveedor WhatsApp",action:"No existe normalmente un paquete que se active manualmente en Meta. Confirmar WABA/número operativo, límites y método de facturación. El saldo de VentaNexIA controla el consumo; revisar costes reales de Meta para mantener margen."},
  lead_pack:{label:"500 créditos de captación",billing:"Pago único",provider:"Fuentes/APIs de captación",action:"Comprobar cuota y presupuesto de las APIs usadas. Si son cuentas centrales, no se amplía cliente a cliente; se controla el consumo por tenant y el presupuesto global."},
  storage_pack:{label:"10 GB de espacio adicional",billing:"Mensual",provider:"Almacenamiento / Supabase u otro proveedor",action:"Asignar 10 GB adicionales al tenant mientras la ampliación esté activa y comprobar que el proyecto global tiene capacidad suficiente."},
  conexion:{label:"Conexión externa adicional",billing:"Mensual",provider:"Conector correspondiente",action:"Activar una plaza de conexión adicional para el cliente. Si el proveedor externo cobra licencia/conexión recurrente, contratarla o asignarla antes de marcarla como disponible."},
  email_account:{label:"Cuenta de correo adicional",billing:"Mensual",provider:"Google/Microsoft u otro correo",action:"Activar una plaza de cuenta adicional en VentaNexIA y completar su autorización OAuth. Si el proveedor exige licencia propia, confirmar que el cliente ya la tiene o que está contratada."}
};
async function tenantSummary(tenantId){
  if(!tenantId)return {};
  try{const rows=await sbFetch(`vnx_tenants?id=eq.${encodeURIComponent(tenantId)}&select=id,name,customer_code,settings`);return rows?.[0]||{}}catch{return {}}
}
async function sendOpsExtraPurchaseEmail({tenantId,customerId="",items=[],sessionId="",amountTotal=0,currency="eur"}){
  const key=process.env.RESEND_API_KEY;if(!key||!items.length)return false;
  const tenant=await tenantSummary(tenantId);
  const to=process.env.OPS_ALERT_EMAIL||process.env.SALES_EMAIL||"ventas@ventanexia.es";
  const from=process.env.BILLING_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"facturacion@ventanexia.es";
  const lines=items.map(k=>{const x=EXTRA_ACTIONS[k]||{label:k,billing:"",provider:"Revisar",action:"Revisar manualmente antes de activar."};return `• ${x.label} · ${x.billing}\n  Proveedor: ${x.provider}\n  Acción: ${x.action}`}).join("\n\n");
  const subject=`VentaNexIA · Extra pagado · ${tenant.name||tenant.customer_code||customerId||"cliente"}`;
  const text=`Se ha confirmado un pago de capacidad/consumo adicional en VentaNexIA.\n\nCLIENTE\nEmpresa: ${tenant.name||"—"}\nCódigo: ${tenant.customer_code||customerId||"—"}\nTenant: ${tenantId||"—"}\nStripe session: ${sessionId||"—"}\nImporte del checkout: ${money(amountTotal,currency)}\n\nEXTRAS PAGADOS\n${lines}\n\nIMPORTANTE\nNo marques una ampliación como lista si depende de un proveedor externo hasta comprobar que la capacidad real está disponible. Los créditos internos pueden acreditarse automáticamente, pero debemos vigilar saldo, límites y costes globales de los proveedores para no vender capacidad que luego falle.\n\nVentaNexIA · Operaciones`;
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject,text})});
  return r.ok;
}

async function sendPaidInvoiceEmail(invoice){const key=process.env.RESEND_API_KEY,email=String(invoice?.customer_email||"").trim();if(!key||!email)return false;const from=process.env.BILLING_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"facturacion@ventanexia.es";const amountText=money(invoice?.amount_paid,invoice?.currency);const subject=`Pago recibido VentaNexIA${invoice?.number?` · ${invoice.number}`:""}`;const text=`Hemos recibido correctamente tu pago de ${amountText}.\n\nDocumento de Stripe: ${invoice?.invoice_pdf||invoice?.hosted_invoice_url||"disponible en tu área de facturación"}\n\nLos datos completos de tu tarjeta son procesados y custodiados por Stripe; VentaNexIA no recibe el número completo ni el CVC.\n\nVentaNexIA · ECOJAFER S.L.`;const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[email],subject,text})});return r.ok}
async function forwardFiscalInvoice(invoice){const url=process.env.INVOICING_WEBHOOK_URL;if(!url)return false;const secret=process.env.INVOICING_WEBHOOK_SECRET||"";const payload={source:"stripe",event:"invoice.paid",invoice:{id:invoice.id,number:invoice.number,status:invoice.status,currency:invoice.currency,amount_paid:invoice.amount_paid,customer:invoice.customer,customer_email:invoice.customer_email,customer_name:invoice.customer_name,customer_tax_ids:invoice.customer_tax_ids||[],hosted_invoice_url:invoice.hosted_invoice_url,invoice_pdf:invoice.invoice_pdf,created:invoice.created,metadata:invoice.metadata||{}}};const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${secret}`},body:JSON.stringify(payload)});return r.ok}
async function sendPaymentFailedWhatsApp({phone,amountText,payUrl}){const token=process.env.WHATSAPP_ACCESS_TOKEN,phoneNumberId=process.env.WHATSAPP_PHONE_NUMBER_ID,template=process.env.WHATSAPP_PAYMENT_FAILED_TEMPLATE,language=process.env.WHATSAPP_PAYMENT_FAILED_LANGUAGE||"es",to=cleanPhone(phone).replace(/^\+/,"");if(!token||!phoneNumberId||!template||!to||!payUrl)return false;const body={messaging_product:"whatsapp",to,type:"template",template:{name:template,language:{code:language},components:[{type:"body",parameters:[{type:"text",text:amountText},{type:"text",text:payUrl}]}]}};const r=await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});return r.ok}
async function notifyPaymentFailed(invoice){let meta=invoice?.metadata||{};if((!meta.customer_phone||!meta.customer_email)&&invoice?.subscription){const sub=await stripeGet(`/subscriptions/${encodeURIComponent(invoice.subscription)}`);if(sub?.metadata)meta={...sub.metadata,...meta}}const email=String(invoice?.customer_email||meta.customer_email||"").trim(),phone=String(meta.customer_phone||"").trim(),company=String(invoice?.customer_name||"").trim(),amountText=money(invoice?.amount_due,invoice?.currency),payUrl=String(invoice?.hosted_invoice_url||"").trim(),invoiceNumber=String(invoice?.number||"").trim();const [emailSent,whatsappSent]=await Promise.all([sendPaymentFailedEmail({email,company,amountText,payUrl,invoiceNumber}).catch(()=>false),sendPaymentFailedWhatsApp({phone,amountText,payUrl}).catch(()=>false)]);return {emailSent,whatsappSent,payUrl}}

const AGENTS=[["guardian","VNX Guardian","EXECUTE_WITHIN_POLICY"],["scout","VNX Scout","AUTONOMOUS"],["enrich","VNX Enrich","AUTONOMOUS"],["outreach","VNX Outreach","EXECUTE_WITHIN_POLICY"],["inbox","VNX Inbox","EXECUTE_WITHIN_POLICY"],["qualify","VNX Qualify","AUTONOMOUS"],["scheduler","VNX Scheduler","EXECUTE_WITHIN_POLICY"],["crm","VNX CRM","EXECUTE_WITHIN_POLICY"],["proposal","VNX Proposal","PREPARE"],["content","VNX Content","EXECUTE_WITHIN_POLICY"],["analyst","VNX Analyst","AUTONOMOUS"],["provision","VNX Provision","PREPARE"]];
function inferConnections(bp={}){const t=JSON.stringify(bp).toLowerCase(),out=[];const add=(provider,purpose)=>out.push({provider,purpose});if(/crm|pipeline|hubspot|salesforce|zoho/.test(t))add("crm","pipeline");if(/email|correo|outreach|inbox|seguimiento/.test(t))add("email","commercial_email");if(/agenda|calendar|reuni|scheduler|cita/.test(t))add("calendar","scheduling");if(/social|linkedin|instagram|redes/.test(t))add("social","publishing");add("analytics","measurement");add("website","widget_or_tracking");return out}
async function startProvisioning(solutionId,paymentMeta={}){if(!solutionId)return null;const rows=await sbFetch(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}&select=*`);const sol=rows?.[0];if(!sol)return null;if(["provisioning","active"].includes(sol.status))return{alreadyStarted:true};const created=await sbFetch("vnx_tenants",{method:"POST",body:JSON.stringify([{name:sol.company,status:"provisioning",autonomy_level:"execute_within_policy",settings:{solution_request_id:sol.id,blueprint:sol.blueprint,owner_email:sol.email,payment:paymentMeta}}])});const tenant=created?.[0];if(!tenant?.id)throw new Error("TENANT_CREATE_FAILED");await sbFetch("vnx_onboarding_profiles",{method:"POST",body:JSON.stringify([{tenant_id:tenant.id,company_profile:{company:sol.company,owner_email:sol.email,solution_request_id:sol.id},desired_channels:inferConnections(sol.blueprint).map(x=>x.provider),status:"started"}])}).catch(()=>{});await sbFetch("vnx_agents",{method:"POST",body:JSON.stringify(AGENTS.map(([agent_key,name,mode])=>({tenant_id:tenant.id,agent_key,name,mode,enabled:true,policy:{source_blueprint:sol.id}})))});const connections=inferConnections(sol.blueprint);await sbFetch("vnx_connections",{method:"POST",body:JSON.stringify(connections.map(c=>({...c,tenant_id:tenant.id,status:"authorization_needed"})))});await sbFetch("vnx_jobs",{method:"POST",body:JSON.stringify([{tenant_id:tenant.id,job_type:"knowledge_onboarding",status:"queued",payload:{solution_request_id:sol.id}},{tenant_id:tenant.id,job_type:"configure_agents",status:"queued",payload:{blueprint:sol.blueprint}},{tenant_id:tenant.id,job_type:"connection_plan",status:"queued",payload:{connections}},{tenant_id:tenant.id,job_type:"prepare_installation",status:"waiting_approval",payload:{}}])});await sbFetch("vnx_installations",{method:"POST",body:JSON.stringify([{tenant_id:tenant.id,install_type:"commercial_os",target:sol.company,status:"waiting_authorization",manifest:{solution_request_id:sol.id,blueprint:sol.blueprint,connections,payment:paymentMeta},rollback_manifest:{strategy:"disable_agents_disconnect_connectors_remove_widget"}}])});await sbFetch("vnx_approvals",{method:"POST",body:JSON.stringify([{tenant_id:tenant.id,agent_key:"provision",action_type:"production_install",title:`Autorizar instalación de ${sol.company}`,rationale:"El pago ha sido confirmado. VNX ha preparado el entorno aislado; falta autorizar conexiones e instalación productiva.",risk:"high",status:"pending",payload:{solution_request_id:sol.id,connections}}])});await sbFetch(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}`,{method:"PATCH",body:JSON.stringify({status:"provisioning",updated_at:new Date().toISOString()})});return{tenantId:tenant.id,connections}}

export const config={api:{bodyParser:false}};
async function readRaw(req){const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));return Buffer.concat(chunks)}
function verifyStripe(raw,header,secret){if(!header||!secret)return false;const parts={};for(const p of header.split(",")){const[k,v]=p.split("=",2);if(!parts[k])parts[k]=[];parts[k].push(v)}const t=parts.t?.[0],sigs=parts.v1||[];if(!t||!sigs.length)return false;const age=Math.abs(Math.floor(Date.now()/1000)-Number(t));if(!Number.isFinite(age)||age>300)return false;const expected=crypto.createHmac("sha256",secret).update(`${t}.${raw.toString("utf8")}`).digest("hex");return sigs.some(sig=>{try{return sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))}catch{return false}})}
async function hubspotPatch(dealId,properties){const token=process.env.HUBSPOT_ACCESS_TOKEN;if(!token||!dealId)return;const r=await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`,{method:"PATCH",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({properties})});if(!r.ok)throw new Error(`HubSpot ${r.status}`)}
async function forward(event){const url=process.env.N8N_AUTOMATION_WEBHOOK;if(!url)return;const key=process.env.AUTOMATION_WEBHOOK_SECRET||"";await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify({source:"stripe",event})}).catch(()=>{})}
async function claimWebhookEvent(event){if(!event?.id)return{claimed:true};try{await sbFetch("vnx_webhook_events",{method:"POST",body:JSON.stringify([{provider:"stripe",event_id:event.id,event_type:event.type,status:"processing"}])});return{claimed:true}}catch(e){if(String(e?.message||e).includes("SUPABASE_409"))return{claimed:false,duplicate:true};throw e}}
async function finishWebhookEvent(event,status,lastError=null){if(!event?.id)return;await sbFetch(`vnx_webhook_events?provider=eq.stripe&event_id=eq.${encodeURIComponent(event.id)}`,{method:"PATCH",body:JSON.stringify({status,last_error:lastError,processed_at:status==="processed"?new Date().toISOString():null})}).catch(()=>{})}
function featurePolicyFromMeta(meta={}){
  const split=v=>String(v||"").split(",").map(x=>x.trim()).filter(Boolean);
  const included=new Set(split(meta.included));if(String(meta.orders_included||'')==='pedidos')included.add('pedidos');
  const extras=split(meta.extras);
  const plan=String(meta.plan||'').toLowerCase();
  const baseConnections=["start","inicio"].includes(plan)?3:["core","crecimiento"].includes(plan)?8:["scale","empresa","premium"].includes(plan)?15:0;
  const baseEmployees=["start","inicio"].includes(plan)?1:["core","crecimiento"].includes(plan)?3:["scale","empresa","premium"].includes(plan)?8:0;
  const baseOrderChannels=["start","inicio"].includes(plan)?1:["core","crecimiento"].includes(plan)?2:["scale","empresa","premium"].includes(plan)?4:0;
  const baseOrderLevel=["scale","empresa","premium"].includes(plan)?"auto":["core","crecimiento"].includes(plan)?"pro":"basic";
  const extraConnections=Math.max(0,Number(meta.extra_connections||0)||0),extraEmployees=Math.max(0,Number(meta.extra_employee_slots||0)||0),ownAgents=Math.max(0,Number(meta.own_agents||0)||0),extraOrderChannels=Math.max(0,Number(meta.extra_order_channels||0)||0);
  const orderLevel=extras.includes("order_web_auto")?"auto":extras.includes("order_web_pro")&&baseOrderLevel==="basic"?"pro":baseOrderLevel;
  return {
    purchased_included:[...included],
    purchased_extras:extras.filter(x=>x!=="conexion"),
    extra_agents:0,
    own_agent_limit:0,
    employee_slot_limit:baseEmployees,
    connection_limit:baseConnections+extraConnections,
    extra_connections:extraConnections,
    order_channel_limit:baseOrderChannels+extraOrderChannels,
    extra_order_channels:extraOrderChannels,
    order_web_level:orderLevel,
    order_monthly_limit:Math.max(0,Number(meta.order_monthly_limit||0)||0)
  };
}
const CREDIT_PACKS={
  video_pack:{meter:"video_credits",quantity:10,amount:9900},
  voice_pack:{meter:"voice_minutes",quantity:250,amount:4900},
  whatsapp_pack:{meter:"whatsapp_messages",quantity:1000,amount:5900}
};
async function grantCreditPack(tenantId,packKey,sessionId){
  const p=CREDIT_PACKS[packKey];if(!tenantId||!p||!sessionId)return false;
  await sbFetch("rpc/vnx_grant_usage_credits",{method:"POST",body:JSON.stringify({p_tenant:tenantId,p_meter:p.meter,p_pack_key:packKey,p_quantity:p.quantity,p_amount_cents:p.amount,p_stripe_session_id:sessionId+":"+packKey})});
  return true;
}
async function resolveTenantId({tenantId="",solutionRequestId="",subscriptionId="",customerId=""}={}){if(tenantId)return tenantId;if(solutionRequestId){const rows=await entitlementDb(`vnx_tenants?settings->>solution_request_id=eq.${encodeURIComponent(solutionRequestId)}&select=id`);if(rows?.[0]?.id)return rows[0].id}if(subscriptionId){const rows=await entitlementDb(`vnx_entitlements?stripe_subscription_id=eq.${encodeURIComponent(subscriptionId)}&select=tenant_id`);if(rows?.[0]?.tenant_id)return rows[0].tenant_id}if(customerId){const rows=await entitlementDb(`vnx_entitlements?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=tenant_id`);if(rows?.[0]?.tenant_id)return rows[0].tenant_id}return null}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).send("Method not allowed");
  const raw=await readRaw(req),sig=req.headers["stripe-signature"],secret=process.env.STRIPE_WEBHOOK_SECRET;if(!verifyStripe(raw,sig,secret))return res.status(400).send("Invalid signature");
  let event;try{event=JSON.parse(raw.toString("utf8"))}catch{return res.status(400).send("Invalid JSON")}
  try{
    const claim=await claimWebhookEvent(event);if(!claim.claimed)return res.status(200).json({received:true,duplicate:true});
    const obj=event.data?.object||{},dealId=String(obj.metadata?.deal_id||obj.client_reference_id||""),contractId=String(obj.metadata?.contract_id||dealId||""),solutionRequestId=String(obj.metadata?.solution_request_id||""),metadataTenantId=String(obj.metadata?.tenant_id||"");
    const subscriptionId=String(obj.subscription||(event.type.startsWith("customer.subscription.")?obj.id:"")||""),customerId=String(obj.customer||"");
    const tenantId=await resolveTenantId({tenantId:metadataTenantId,solutionRequestId,subscriptionId,customerId});

    if(event.type==="checkout.session.completed"){
      const paid=["paid","no_payment_required"].includes(obj.payment_status);
      const singlePack=String(obj.metadata?.credit_pack||"");
      if(paid&&singlePack&&tenantId){
        await grantCreditPack(tenantId,singlePack,obj.id);
        await sendCustomerActivationEmail({tenantId,items:[singlePack],sessionId:obj.id}).catch(()=>false);
        await recordCustomerEvent({customerId,contractId,tenantId,eventType:"credit_pack_purchased",title:"Créditos adicionales comprados",details:{session_id:obj.id,pack:singlePack}});
      }else if(dealId){
        await linkContract({contractId,customerId,subscriptionId:String(obj.subscription||""),sessionId:obj.id});
        await recordCustomerEvent({customerId,contractId,tenantId,eventType:"checkout_completed",title:"Primera contratación completada",details:{session_id:obj.id,payment_status:obj.payment_status,subscription:obj.subscription||null}});
        if(paid){
          await hubspotPatch(dealId,{dealstage:"closedwon",hs_priority:"high",hs_next_step:"Iniciar onboarding y provisionamiento de VentaNexIA"});
          let activeTenantId=tenantId;
          if(solutionRequestId){
            const provisioned=await startProvisioning(solutionRequestId,{stripe_session_id:obj.id,customer:obj.customer||null,subscription:obj.subscription||null});
            activeTenantId=activeTenantId||provisioned?.tenantId||null;
          }
          if(activeTenantId){
            await activatePaid(activeTenantId,{customerId:customerId||null,subscriptionId:String(obj.subscription||"")||null,invoiceId:String(obj.invoice||"")||null,planKey:String(obj.metadata?.plan||"core"),featurePolicy:featurePolicyFromMeta(obj.metadata||{})});
            await reactivateAgents(activeTenantId);
            const packs=String(obj.metadata?.credit_packs||"").split(",").map(x=>x.trim()).filter(Boolean);
            for(const pack of packs)await grantCreditPack(activeTenantId,pack,obj.id);
            const recurringExtras=String(obj.metadata?.extras||"").split(",").map(x=>x.trim()).filter(x=>["conexion","email_account","storage_pack","capacity_pack"].includes(x));
            const customerItems=[...packs,...recurringExtras];
            if(customerItems.length){
              for(const itemKey of recurringExtras)await createProvisioningTask({tenantId:activeTenantId,itemKey,sessionId:obj.id}).catch(()=>null);
              if(recurringExtras.length)await sendOpsExtraPurchaseEmail({tenantId:activeTenantId,customerId,items:recurringExtras,sessionId:obj.id,amountTotal:Number(obj.amount_total||0),currency:obj.currency||"eur"}).catch(()=>false);
              await sendCustomerActivationEmail({tenantId:activeTenantId,items:customerItems,sessionId:obj.id}).catch(()=>false);
            }
          }
        }
      }
    }

    if(event.type==="invoice.paid"){if(dealId)await hubspotPatch(dealId,{hs_next_step:"Servicio activo · revisar onboarding/entrega"});if(tenantId){await activatePaid(tenantId,{customerId:customerId||null,subscriptionId:String(obj.subscription||"")||null,invoiceId:String(obj.id||"")||null});await reactivateAgents(tenantId)}const [mailSent,fiscalForwarded]=await Promise.all([sendPaidInvoiceEmail(obj).catch(()=>false),forwardFiscalInvoice(obj).catch(()=>false)]);await recordCustomerEvent({customerId,contractId,tenantId,eventType:"invoice_paid",title:"Cuota cobrada",details:{invoice_id:obj.id,number:obj.number||null,amount_paid:obj.amount_paid,currency:obj.currency,invoice_pdf:obj.invoice_pdf||null,mail_sent:mailSent,fiscal_forwarded:fiscalForwarded}})}

    if(event.type==="invoice.payment_failed"){if(tenantId)await suspendTenant(tenantId,"PAYMENT_FAILED");const n=await notifyPaymentFailed(obj);await recordCustomerEvent({customerId,contractId,tenantId,eventType:"payment_failed",title:"Cobro fallido",details:{invoice_id:obj.id,number:obj.number||null,amount_due:obj.amount_due,currency:obj.currency,pay_url:n.payUrl,email_sent:n.emailSent,whatsapp_sent:n.whatsappSent}})}

    if(event.type==="customer.subscription.updated"){const status=String(obj.status||"");if(tenantId){if(["active","trialing"].includes(status)){await activatePaid(tenantId,{customerId:customerId||null,subscriptionId:subscriptionId||null,planKey:String(obj.metadata?.plan||"core"),featurePolicy:featurePolicyFromMeta(obj.metadata||{})});await reactivateAgents(tenantId)}else if(["past_due","unpaid","paused","incomplete_expired","canceled"].includes(status))await suspendTenant(tenantId,`SUBSCRIPTION_${status.toUpperCase()}`)}await recordCustomerEvent({customerId,contractId,tenantId,eventType:"subscription_updated",title:"Suscripción actualizada",details:{subscription_id:obj.id,status}})}

    if(event.type==="customer.subscription.deleted"){if(dealId)await hubspotPatch(dealId,{hs_next_step:"Revisar cancelación, motivo y plan de retención"});if(tenantId)await suspendTenant(tenantId,"SUBSCRIPTION_CANCELLED");await recordCustomerEvent({customerId,contractId,tenantId,eventType:"subscription_deleted",title:"Suscripción cancelada",details:{subscription_id:obj.id}});if(contractId)await sbFetch(`vnx_contracts?contract_id=eq.${encodeURIComponent(contractId)}`,{method:"PATCH",body:JSON.stringify({status:"cancelled",updated_at:new Date().toISOString()})}).catch(()=>{})}

    await forward(event);await finishWebhookEvent(event,"processed");console.log(JSON.stringify({event:"stripe_event_processed",type:event.type,dealId:dealId||null,ts:new Date().toISOString()}));return res.status(200).json({received:true});
  }catch(e){await finishWebhookEvent(event,"failed",String(e?.message||e).slice(0,400));console.error(JSON.stringify({event:"stripe_event_error",type:event?.type,error:String(e?.message||e).slice(0,400)}));return res.status(500).send("Processing error")}
}
