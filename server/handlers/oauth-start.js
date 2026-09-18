import {sbFetch,randState,pkce,callbackUrl,connector} from "./oauth-common.js";

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const provider=String(req.body?.provider||"").trim();
    const module=String(req.body?.module||provider).trim();
    const customerId=String(req.body?.customerId||"").trim();
    const deviceId=String(req.body?.deviceId||"").trim();
    const shop=String(req.body?.shop||"").trim();
    const cfg=connector(provider,{shop});
    if(!cfg.clientId)return res.status(503).json({error:"Conector todavía no configurado en VentaNexIA",code:"CONNECTOR_NOT_CONFIGURED",provider});
    const state=randState();
    const proof=cfg.pkce?pkce():{verifier:null,challenge:null};
    const redirect=callbackUrl(provider);
    const params=new URLSearchParams({
      client_id:cfg.clientId,
      redirect_uri:redirect,
      response_type:"code",
      scope:cfg.scope,
      state
    });
    for(const [k,v] of Object.entries(cfg.extra||{}))params.set(k,v);
    if(cfg.pkce){params.set("code_challenge",proof.challenge);params.set("code_challenge_method","S256")}
    const row={state,provider,module,customer_id:customerId||null,device_id:deviceId||null,shop:cfg.shop||shop||null,code_verifier:proof.verifier,status:"pending",expires_at:new Date(Date.now()+15*60*1000).toISOString()};
    await sbFetch("vnx_oauth_sessions",{method:"POST",body:JSON.stringify(row)});
    return res.status(200).json({ok:true,state,authUrl:cfg.auth+"?"+params.toString(),expiresIn:900});
  }catch(e){
    const code=String(e?.message||"");
    if(code==="SHOPIFY_SHOP_REQUIRED")return res.status(400).json({error:"Indica tu dominio .myshopify.com",code});
    return res.status(500).json({error:"No se pudo iniciar la autorización",detail:code.slice(0,180)});
  }
}
