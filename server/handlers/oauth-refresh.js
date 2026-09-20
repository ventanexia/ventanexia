import {connector} from "./oauth-common.js";

// Renueva accesos OAuth de un dispositivo con licencia válida.
// El client secret de Google solo existe en el servidor, por eso la app de escritorio
// no puede renovar el token por su cuenta.
function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function rpc(name,body){
  const {url,key}=cfg();
  const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>null);
  if(!r.ok)throw new Error(`RPC_${r.status}`);
  return j;
}
function clean(v,n=300){return String(v||"").trim().slice(0,n)}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const provider=clean(req.body?.provider||"gmail",40);
    const refreshToken=clean(req.body?.refreshToken,4096);
    const customerId=clean(req.body?.customerId,80),activationCode=clean(req.body?.activationCode,500),deviceKey=clean(req.body?.deviceKey,120);
    if(!["gmail","google_calendar","microsoft_365","microsoft_calendar"].includes(provider))return res.status(400).json({error:"Proveedor no compatible con la renovación automática",code:"PROVIDER_NOT_SUPPORTED"});
    if(!refreshToken||!customerId||!activationCode||!deviceKey)return res.status(400).json({error:"Faltan datos para renovar el acceso",code:"MISSING_FIELDS"});

    const device=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
    if(!device?.ok)return res.status(401).json({error:device?.message||"Licencia o dispositivo no válidos",code:device?.code||"LICENSE_INVALID"});

    const c=connector(provider);
    if(!c.clientId||!c.clientSecret)return res.status(503).json({error:"Conector todavía no configurado en VentaNexIA",code:"CONNECTOR_NOT_CONFIGURED",provider});

    const params=new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken,client_id:c.clientId,client_secret:c.clientSecret});
    const r=await fetch(c.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Accept:"application/json"},body:params});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.access_token){
      const revoked=j.error==="invalid_grant";
      console.error(JSON.stringify({event:"oauth_refresh_failed",provider,status:r.status,error:String(j.error||"").slice(0,80)}));
      return res.status(revoked?401:502).json({
        error:revoked?"El acceso ha caducado o ha sido revocado. Vuelve a conectar la cuenta.":"No se pudo renovar el acceso ahora mismo.",
        code:revoked?"REFRESH_TOKEN_REVOKED":"REFRESH_FAILED"
      });
    }
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ok:true,access_token:j.access_token,expires_in:Number(j.expires_in||3600),token_type:j.token_type||"Bearer"});
  }catch(e){
    console.error(JSON.stringify({event:"oauth_refresh_error",detail:String(e?.message||e).slice(0,200)}));
    return res.status(503).json({error:"No se pudo renovar el acceso ahora mismo.",code:"REFRESH_UNAVAILABLE"});
  }
}
