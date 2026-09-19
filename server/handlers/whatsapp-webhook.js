import crypto from "node:crypto";
import {pdb} from "../../lib/portal-auth.js";
import {buildWhatsAppReply,sendWhatsAppText} from "../lib/whatsapp-core.js";

function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function db(path,{method="GET",body=null,prefer="return=representation"}={}){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/"+path,{method,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json",Prefer:prefer},body:body===null?undefined:JSON.stringify(body)});
  const txt=await r.text();let j=null;try{j=txt?JSON.parse(txt):null}catch{j=txt}
  if(!r.ok)throw new Error("DB_"+r.status);return j;
}
async function rawBody(req){
  const chunks=[];for await(const chunk of req)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function signatureOk(raw,header){
  const secret=String(process.env.META_APP_SECRET||"");if(!secret||!header)return false;
  const expected="sha256="+crypto.createHmac("sha256",secret).update(raw).digest("hex");
  const a=Buffer.from(String(header)),b=Buffer.from(expected);return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function persistInbound(channel,msg,contact,value){
  const text=msg?.text?.body||"";
  await db("vnx_whatsapp_messages?on_conflict=wa_message_id",{method:"POST",body:[{tenant_id:channel.tenant_id,phone_number_id:channel.phone_number_id,wa_message_id:String(msg.id),direction:"inbound",from_number:String(msg.from||""),to_number:channel.display_phone||null,contact_name:contact?.profile?.name||null,message_type:msg.type||"unknown",body:text,status:"received",raw:{message:msg,contact:contact||null,metadata:value?.metadata||null}}],prefer:"resolution=ignore-duplicates,return=minimal"});
  await db("vnx_whatsapp_channels?id=eq."+encodeURIComponent(channel.id),{method:"PATCH",body:{webhook_ready:true,last_webhook_at:new Date().toISOString(),updated_at:new Date().toISOString()}});
  if(msg.type!=="text"||!text.trim())return;
  const suggestion=await buildWhatsAppReply({tenantId:channel.tenant_id,inboundText:text,customerName:contact?.profile?.name||""});
  const mustApprove=channel.reply_mode!=="automatic"||!channel.billing_acknowledged||suggestion.requiresApproval;
  const draftRow={tenant_id:channel.tenant_id,phone_number_id:channel.phone_number_id,inbound_message_id:String(msg.id),customer_number:String(msg.from||""),customer_name:contact?.profile?.name||null,inbound_text:text,proposed_text:suggestion.reply,requires_approval:mustApprove,status:"pending"};
  const drafts=await db("vnx_whatsapp_drafts?on_conflict=phone_number_id,inbound_message_id",{method:"POST",body:[draftRow],prefer:"resolution=ignore-duplicates,return=representation"});
  const draft=drafts?.[0];
  if(!mustApprove&&draft){
    try{
      const sent=await sendWhatsAppText(channel,msg.from,suggestion.reply);
      const waId=sent?.messages?.[0]?.id||null;
      await db("vnx_whatsapp_drafts?id=eq."+encodeURIComponent(draft.id),{method:"PATCH",body:{status:"sent",sent_at:new Date().toISOString()}});
      if(waId)await db("vnx_whatsapp_messages?on_conflict=wa_message_id",{method:"POST",body:[{tenant_id:channel.tenant_id,phone_number_id:channel.phone_number_id,wa_message_id:waId,direction:"outbound",to_number:String(msg.from||""),message_type:"text",body:suggestion.reply,status:"sent",raw:sent}],prefer:"resolution=ignore-duplicates,return=minimal"});
    }catch(e){
      await db("vnx_whatsapp_drafts?id=eq."+encodeURIComponent(draft.id),{method:"PATCH",body:{status:"error",error_text:String(e?.message||e).slice(0,500)}});
    }
  }
}
export default async function handler(req,res){
  if(req.method==="GET"){
    const mode=String(req.query?.["hub.mode"]||""),token=String(req.query?.["hub.verify_token"]||""),challenge=String(req.query?.["hub.challenge"]||"");
    if(mode==="subscribe"&&token&&token===String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN||""))return res.status(200).send(challenge);
    return res.status(403).send("Verificación rechazada");
  }
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const raw=await rawBody(req);
    if(!signatureOk(raw,req.headers["x-hub-signature-256"]))return res.status(401).json({error:"Firma no válida"});
    const payload=JSON.parse(raw.toString("utf8")||"{}");
    for(const entry of payload.entry||[])for(const change of entry.changes||[]){
      const value=change?.value||{},phoneNumberId=String(value?.metadata?.phone_number_id||"");
      if(!phoneNumberId)continue;
      const channels=await db("vnx_whatsapp_channels?phone_number_id=eq."+encodeURIComponent(phoneNumberId)+"&select=*&limit=1");
      const channel=channels?.[0];if(!channel)continue;
      const contacts=Array.isArray(value.contacts)?value.contacts:[];
      for(const msg of value.messages||[]){
        const contact=contacts.find(c=>String(c.wa_id||"")===String(msg.from||""))||contacts[0]||null;
        await persistInbound(channel,msg,contact,value);
      }
    }
    return res.status(200).json({ok:true});
  }catch(e){console.error("whatsapp_webhook",String(e?.message||e).slice(0,500));return res.status(200).json({ok:true});}
}
