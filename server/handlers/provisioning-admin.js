import {db as entitlementDb} from "../../lib/entitlement.js";

function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function sbFetch(path,options={}){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/"+path,{...options,headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json","Prefer":"return=representation",...(options.headers||{})}});
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch{j=t}
  if(!r.ok)throw new Error("SUPABASE_"+r.status);
  return j;
}
async function rpc(name,body){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>null);if(!r.ok)throw new Error("RPC_"+r.status);return j;
}
async function validateMaster({customerId,activationCode,deviceKey}){
  const device=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
  if(!device?.ok||String(device.planKey||device.plan||"").toLowerCase()!=="master")return false;
  return true;
}
async function sendReadyEmail(tenantId,title){
  const key=process.env.RESEND_API_KEY;if(!key)return false;
  const rows=await sbFetch("vnx_tenants?id=eq."+encodeURIComponent(tenantId)+"&select=name,settings");
  const tenant=rows?.[0]||{},email=String(tenant.settings?.owner_email||tenant.settings?.email||"").trim();
  if(!email)return false;
  const from=process.env.BILLING_FROM_EMAIL||process.env.CONTRACT_FROM_EMAIL||"facturacion@ventanexia.es";
  const subject="VentaNexIA · Tu ampliación ya está activa";
  const text="Hola,\n\nYa hemos terminado la activación de: "+title+".\n\nYa puedes utilizarla en VentaNexIA.\n\nGracias,\nVentaNexIA";
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[email],subject,text})});
  return r.ok;
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const customerId=String(req.body?.customerId||"").trim(),activationCode=String(req.body?.activationCode||"").trim(),deviceKey=String(req.body?.deviceKey||"").trim();
    if(!(await validateMaster({customerId,activationCode,deviceKey})))return res.status(403).json({error:"Solo disponible en la edición maestra"});
    const action=String(req.body?.action||"list");
    if(action==="list"){
      const rows=await sbFetch("vnx_provisioning_tasks?status=in.(pending,in_progress)&select=id,tenant_id,item_key,title,provider,instructions,status,due_at,created_at&order=created_at.asc");
      const tenantIds=[...new Set((rows||[]).map(x=>x.tenant_id).filter(Boolean))];
      const tenants=tenantIds.length?await sbFetch("vnx_tenants?id=in.("+tenantIds.map(encodeURIComponent).join(",")+")&select=id,name,customer_code"):[];
      const map=Object.fromEntries((tenants||[]).map(x=>[x.id,x]));
      return res.status(200).json({ok:true,tasks:(rows||[]).map(x=>({...x,tenant:map[x.tenant_id]||null}))});
    }
    if(action==="complete"){
      const id=String(req.body?.taskId||"").trim();if(!id)return res.status(400).json({error:"Falta la tarea"});
      const rows=await sbFetch("vnx_provisioning_tasks?id=eq."+encodeURIComponent(id)+"&select=*");
      const task=rows?.[0];if(!task)return res.status(404).json({error:"Tarea no encontrada"});
      const ents=await entitlementDb("vnx_entitlements?tenant_id=eq."+encodeURIComponent(task.tenant_id)+"&select=id,feature_policy");
      const ent=ents?.[0];if(ent){
        const p=ent.feature_policy&&typeof ent.feature_policy==="object"?ent.feature_policy:{};
        const current=Array.isArray(p.provisioned_extras)?p.provisioned_extras:[];
        const next=[...new Set([...current,task.item_key])];
        await entitlementDb("vnx_entitlements?id=eq."+encodeURIComponent(ent.id),{method:"PATCH",body:JSON.stringify({feature_policy:{...p,provisioned_extras:next}})});
      }
      await sbFetch("vnx_provisioning_tasks?id=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:"completed",completed_at:new Date().toISOString()})});
      await sendReadyEmail(task.tenant_id,task.title).catch(()=>false);
      return res.status(200).json({ok:true});
    }
    if(action==="start"){
      const id=String(req.body?.taskId||"").trim();if(!id)return res.status(400).json({error:"Falta la tarea"});
      await sbFetch("vnx_provisioning_tasks?id=eq."+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:"in_progress"})});
      return res.status(200).json({ok:true});
    }
    return res.status(400).json({error:"Acción no válida"});
  }catch(e){return res.status(500).json({error:"No se pudo gestionar la activación"});}
}
