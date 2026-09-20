// Validación de licencia y dispositivo para las llamadas de VentaNexIA Desktop
// a /api/chat. Usa las mismas funciones RPC que /api/usage-meter.
import {isAgentIncluded,isMasterPlan,isModuleIncluded,parseScope} from "./agent-policy.js";

function clean(v,n=300){return String(v||"").trim().slice(0,n)}

function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}

async function rpc(name,body){
  const {url,key}=cfg();
  const r=await fetch(`${url}/rest/v1/rpc/${name}`,{
    method:"POST",
    headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const j=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(`RPC_${name}_${r.status}`);
  return j;
}

// "enforce": se rechaza lo que no cumple. "log": solo se registra (por defecto,
// para poder desplegar sin cortar a las apps ya instaladas).
export function authMode(){
  return String(process.env.CHAT_AUTH_MODE||"enforce").trim().toLowerCase()==="log"?"log":"enforce";
}

export function logChatAuth(fields){
  try{console.log(JSON.stringify({event:"chat_auth",mode:authMode(),...fields}))}catch{}
}

export async function authenticateDesktop(body){
  const d=body?.desktop&&typeof body.desktop==="object"?body.desktop:{};
  const customerId=clean(d.customerId,80),activationCode=clean(d.activationCode,500),deviceKey=clean(d.deviceKey,120);
  if(!customerId||!activationCode||!deviceKey){
    return {ok:false,status:401,code:"LICENSE_CREDENTIALS_MISSING",message:"Activa tu licencia en VentaNexIA Desktop para usar el chat.",customerId:customerId||null};
  }
  try{
    const r=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
    if(!r?.ok){
      return {ok:false,status:401,code:clean(r?.code,60)||"LICENSE_INVALID",message:r?.message||"Licencia o dispositivo no válidos.",customerId};
    }
    return {ok:true,license:{customerId:r.customerId||customerId,deviceId:r.deviceId||null,planKey:r.planKey||null,featurePolicy:r.featurePolicy||{}}};
  }catch(e){
    return {ok:false,status:503,code:"LICENSE_SERVICE_UNAVAILABLE",message:"El servicio de licencias no está disponible ahora mismo.",customerId,detail:String(e?.message||e).slice(0,160)};
  }
}

// Comprueba que el plan incluye el agente/conexión del scope ("agent:email", "integration:email").
export function checkScopeAllowed(license,scope){
  const {type,key}=parseScope(scope);
  if(type==="agent"){
    if(!isAgentIncluded(license,key)){
      return {ok:false,status:403,code:"AGENT_NOT_INCLUDED",message:"Este agente no está incluido en tu plan actual. Puedes verlo, pero para usarlo debes contratarlo o cambiar de plan."};
    }
  }else if(type==="integration"){
    if(!isModuleIncluded(license,key)){
      return {ok:false,status:403,code:"FEATURE_NOT_INCLUDED",message:"Esta conexión pertenece a un agente que no está incluido en tu plan actual."};
    }
  }
  return {ok:true};
}

// Consume una unidad del contador mensual del plan. Los planes "master" no tienen límite.
export async function consumeMeter(license,meter,quantity=1,metadata={}){
  if(isMasterPlan(license?.planKey))return {ok:true,unlimited:true};
  try{
    const out=await rpc("vnx_consume_meter",{p_customer_code:license.customerId,p_device_id:license.deviceId||null,p_meter:meter,p_quantity:quantity,p_metadata:metadata});
    return out?.ok?{ok:true}:{ok:false,limit:true,message:out?.error||out?.message||null};
  }catch(e){
    // En modo de control real no dejamos pasar consumos si el contador no puede verificar el saldo.
    return {ok:false,infrastructure:true,meterError:String(e?.message||e).slice(0,160),message:"No se ha podido verificar el uso disponible."};
  }
}
