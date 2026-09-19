function clean(v,n=500){return String(v||"").trim().slice(0,n)}
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
function normalizeShop(value=""){
  let v=clean(value,180).toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");
  if(v.includes("/"))v=v.split("/")[0];
  if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v))throw new Error("SHOPIFY_SHOP_REQUIRED");
  return v;
}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  res.setHeader("Cache-Control","no-store");
  try{
    const customerId=clean(req.body?.customerId,80);
    const activationCode=clean(req.body?.activationCode,500);
    const deviceKey=clean(req.body?.deviceKey,120);
    const shop=normalizeShop(req.body?.shop);
    if(!customerId||!activationCode||!deviceKey)return res.status(400).json({error:"Faltan datos de licencia",code:"MISSING_LICENSE"});

    const device=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
    if(!device?.ok)return res.status(401).json({error:device?.message||"Licencia o dispositivo no válidos",code:device?.code||"LICENSE_INVALID"});
    const plan=String(device.planKey||device.plan||"").toLowerCase();
    if(plan!=="master")return res.status(403).json({error:"La conexión directa de tienda propia solo está disponible en la edición Maestro.",code:"MASTER_REQUIRED"});

    const clientId=String(process.env.SHOPIFY_CLIENT_ID||"").trim();
    const clientSecret=String(process.env.SHOPIFY_CLIENT_SECRET||"").trim();
    if(!clientId||!clientSecret)return res.status(503).json({error:"Conector de Shopify todavía no configurado en VentaNexIA",code:"CONNECTOR_NOT_CONFIGURED"});

    const params=new URLSearchParams({grant_type:"client_credentials",client_id:clientId,client_secret:clientSecret});
    const r=await fetch(`https://${shop}/admin/oauth/access_token`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:params});
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!j.access_token){
      const code=String(j.error||j.error_code||"SHOPIFY_TOKEN_FAILED");
      const description=String(j.error_description||j.message||"").slice(0,300);
      console.error(JSON.stringify({event:"shopify_owned_token_failed",shop,status:r.status,code}));
      if(/shop_not_permitted/i.test(code+" "+description)){
        return res.status(409).json({
          error:"Shopify no permite la conexión directa con esta tienda. La app VentaNexIA debe estar instalada y la tienda debe pertenecer a la misma organización del Dev Dashboard.",
          code:"SHOPIFY_SHOP_NOT_PERMITTED"
        });
      }
      if(r.status===404){
        return res.status(404).json({error:"Shopify no reconoce esa tienda. Revisa el dominio interno o escribe el dominio público de tu web desde VentaNexIA.",code:"SHOPIFY_SHOP_NOT_FOUND"});
      }
      return res.status(502).json({error:description||"Shopify no ha entregado un token de acceso.",code:"SHOPIFY_TOKEN_FAILED"});
    }

    return res.status(200).json({
      ok:true,
      shop,
      accessToken:j.access_token,
      expiresIn:Number(j.expires_in||86399),
      scope:String(j.scope||""),
      tokenReceived:true
    });
  }catch(e){
    const code=String(e?.message||"");
    if(code==="SHOPIFY_SHOP_REQUIRED")return res.status(400).json({error:"Indica el dominio interno de Shopify terminado en .myshopify.com",code});
    console.error(JSON.stringify({event:"shopify_owned_connect_error",detail:code.slice(0,240)}));
    return res.status(503).json({error:"No se pudo conectar con Shopify ahora mismo.",code:"SHOPIFY_CONNECT_UNAVAILABLE"});
  }
}
