import {pdb} from "../../lib/portal-auth.js";
import {encryptToken,sendWhatsAppText} from "../lib/whatsapp-core.js";

function clean(v,n=4000){return String(v||"").trim().slice(0,n)}
function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function rpc(name,body){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>null);if(!r.ok)throw new Error("RPC_"+r.status);return j;
}
async function db(path,{method="GET",body=null,prefer="return=representation"}={}){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/"+path,{method,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:prefer},body:body===null?undefined:JSON.stringify(body)});
  const txt=await r.text();let j=null;try{j=txt?JSON.parse(txt):null}catch{j=txt}
  if(!r.ok)throw new Error("DB_"+r.status);return j;
}
async function auth(req){
  const customerId=clean(req.body?.customerId,100),activationCode=clean(req.body?.activationCode,700),deviceKey=clean(req.body?.deviceKey,160);
  if(!customerId||!activationCode||!deviceKey)return null;
  const device=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
  if(!device?.ok)return null;
  const tenants=await db("vnx_tenants?customer_code=eq."+encodeURIComponent(customerId)+"&select=id,customer_code&limit=1");
  return tenants?.[0]||null;
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const tenant=await auth(req);if(!tenant)return res.status(401).json({error:"Licencia no válida"});
    const action=clean(req.body?.action||"status",40);
    if(action==="register"){
      const phoneNumberId=clean(req.body?.phoneNumberId,120),token=clean(req.body?.token,12000);
      if(!phoneNumberId||!token)return res.status(400).json({error:"Falta la conexión de WhatsApp Business"});
      const enc=encryptToken(token);
      const row={tenant_id:tenant.id,phone_number_id:phoneNumberId,waba_id:clean(req.body?.wabaId,120)||null,display_phone:clean(req.body?.displayPhone,80)||null,verified_name:clean(req.body?.verifiedName,200)||null,...enc,billing_model:"customer_meta_account",updated_at:new Date().toISOString()};
      const out=await db("vnx_whatsapp_channels?on_conflict=phone_number_id",{method:"POST",body:[row],prefer:"resolution=merge-duplicates,return=representation"});
      return res.status(200).json({ok:true,channel:{phoneNumberId,replyMode:out?.[0]?.reply_mode||"approval",webhookReady:Boolean(out?.[0]?.webhook_ready),billingModel:"customer_meta_account"}});
    }
    const rows=await db("vnx_whatsapp_channels?tenant_id=eq."+encodeURIComponent(tenant.id)+"&select=*&order=updated_at.desc&limit=1");
    const channel=rows?.[0];if(!channel)return res.status(404).json({error:"WhatsApp todavía no está registrado en VentaNexIA"});
    if(action==="set_mode"){
      const mode=clean(req.body?.mode,20)==="automatic"?"automatic":"approval";
      const billingAcknowledged=Boolean(req.body?.billingAcknowledged);
      if(mode==="automatic"&&!billingAcknowledged)return res.status(400).json({error:"Confirma primero que los cargos externos de Meta corresponden a tu empresa"});
      const updated=await db("vnx_whatsapp_channels?id=eq."+encodeURIComponent(channel.id),{method:"PATCH",body:{reply_mode:mode,billing_acknowledged:billingAcknowledged||channel.billing_acknowledged,updated_at:new Date().toISOString()}});
      return res.status(200).json({ok:true,replyMode:updated?.[0]?.reply_mode||mode,webhookReady:Boolean(updated?.[0]?.webhook_ready),billingModel:"customer_meta_account"});
    }
    if(action==="metrics"){
      const start=new Date();start.setHours(0,0,0,0);
      const iso=encodeURIComponent(start.toISOString());
      const [incoming,outgoing,pendingRows]=await Promise.all([
        db("vnx_whatsapp_messages?tenant_id=eq."+encodeURIComponent(tenant.id)+"&direction=eq.inbound&created_at=gte."+iso+"&select=id"),
        db("vnx_whatsapp_messages?tenant_id=eq."+encodeURIComponent(tenant.id)+"&direction=eq.outbound&created_at=gte."+iso+"&select=id"),
        db("vnx_whatsapp_drafts?tenant_id=eq."+encodeURIComponent(tenant.id)+"&status=eq.pending&select=id")
      ]);
      return res.status(200).json({ok:true,connected:true,received:(incoming||[]).length,responded:(outgoing||[]).length,pending:(pendingRows||[]).length,label:"Hoy"});
    }
    if(action==="pending"){
      const drafts=await db("vnx_whatsapp_drafts?tenant_id=eq."+encodeURIComponent(tenant.id)+"&status=eq.pending&select=id,customer_number,customer_name,inbound_text,proposed_text,requires_approval,created_at&order=created_at.desc&limit=30");
      return res.status(200).json({ok:true,drafts:drafts||[]});
    }
    if(action==="approve"){
      const id=clean(req.body?.draftId,100),text=clean(req.body?.text,4000);
      const drafts=await db("vnx_whatsapp_drafts?id=eq."+encodeURIComponent(id)+"&tenant_id=eq."+encodeURIComponent(tenant.id)+"&status=eq.pending&select=*&limit=1");
      const draft=drafts?.[0];if(!draft)return res.status(404).json({error:"Respuesta pendiente no encontrada"});
      const body=text||draft.proposed_text;
      const sent=await sendWhatsAppText(channel,draft.customer_number,body);
      const waId=sent?.messages?.[0]?.id||null;
      await db("vnx_whatsapp_drafts?id=eq."+encodeURIComponent(id),{method:"PATCH",body:{status:"sent",proposed_text:body,sent_at:new Date().toISOString(),error_text:null}});
      if(waId)await db("vnx_whatsapp_messages?on_conflict=wa_message_id",{method:"POST",body:[{tenant_id:tenant.id,phone_number_id:channel.phone_number_id,wa_message_id:waId,direction:"outbound",to_number:draft.customer_number,message_type:"text",body,status:"sent",raw:sent}],prefer:"resolution=ignore-duplicates,return=minimal"});
      return res.status(200).json({ok:true,message:"Respuesta enviada por WhatsApp."});
    }
    if(action==="reject"){
      const id=clean(req.body?.draftId,100);
      await db("vnx_whatsapp_drafts?id=eq."+encodeURIComponent(id)+"&tenant_id=eq."+encodeURIComponent(tenant.id),{method:"PATCH",body:{status:"rejected"}});
      return res.status(200).json({ok:true});
    }
    const pending=await db("vnx_whatsapp_drafts?tenant_id=eq."+encodeURIComponent(tenant.id)+"&status=eq.pending&select=id",{});
    return res.status(200).json({ok:true,channel:{phoneNumberId:channel.phone_number_id,displayPhone:channel.display_phone,verifiedName:channel.verified_name,replyMode:channel.reply_mode,webhookReady:Boolean(channel.webhook_ready),lastWebhookAt:channel.last_webhook_at,billingModel:"customer_meta_account",billingAcknowledged:Boolean(channel.billing_acknowledged),pendingCount:(pending||[]).length,externalCosts:"Los cargos de Meta se facturan en la cuenta de WhatsApp Business del cliente."}});
  }catch(e){console.error("whatsapp_channel",String(e?.message||e).slice(0,400));return res.status(503).json({error:"No se pudo gestionar WhatsApp Business"});}
}
