import {sbFetch,callbackUrl,connector,exchangeCode} from "./oauth-common.js";

function html(title,message,ok=true){
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui;background:#081a2d;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:620px;background:#fff;color:#102033;padding:32px;border-radius:20px;box-shadow:0 30px 80px #0008}h1{margin-top:0;color:${ok?"#3b25c7":"#a21caf"}}button{padding:12px 18px;border:0;border-radius:10px;background:#3b25c7;color:#fff;font-weight:700}</style></head><body><div class="card"><h1>${title}</h1><p>${message}</p><p>Puedes cerrar esta ventana y volver a VentaNexIA.</p><button onclick="window.close()">Cerrar</button></div></body></html>`;
}

export default async function handler(req,res){
  const state=String(req.query?.state||"").trim();
  const provider=String(req.query?.provider||"").trim();
  const code=String(req.query?.code||"").trim();
  const denied=String(req.query?.error||"").trim();
  res.setHeader("Content-Type","text/html; charset=utf-8");
  if(!state)return res.status(400).send(html("Autorización no válida","Falta el identificador de autorización.",false));
  try{
    const rows=await sbFetch(`vnx_oauth_sessions?state=eq.${encodeURIComponent(state)}&select=*`);
    const row=rows?.[0];
    if(!row||new Date(row.expires_at).getTime()<Date.now())return res.status(400).send(html("Autorización caducada","Vuelve a iniciar la conexión desde VentaNexIA.",false));
    if(denied){
      await sbFetch(`vnx_oauth_sessions?state=eq.${encodeURIComponent(state)}`,{method:"PATCH",body:JSON.stringify({status:"denied",error:denied,completed_at:new Date().toISOString()})});
      return res.status(200).send(html("Autorización cancelada","No se ha concedido acceso a VentaNexIA.",false));
    }
    if(!code)return res.status(400).send(html("Autorización incompleta","El proveedor no devolvió un código de autorización.",false));
    const cfg=connector(provider||row.provider,{shop:row.shop||""});
    const token=await exchangeCode(cfg,{code,redirectUri:callbackUrl(provider||row.provider),verifier:row.code_verifier||null});
    await sbFetch(`vnx_oauth_sessions?state=eq.${encodeURIComponent(state)}`,{method:"PATCH",body:JSON.stringify({status:"completed",token_payload:token,completed_at:new Date().toISOString(),error:null})});
    return res.status(200).send(html("Cuenta autorizada","La autorización se ha completado correctamente."));
  }catch(e){
    try{await sbFetch(`vnx_oauth_sessions?state=eq.${encodeURIComponent(state)}`,{method:"PATCH",body:JSON.stringify({status:"error",error:String(e?.message||e).slice(0,500),completed_at:new Date().toISOString()})})}catch{}
    return res.status(500).send(html("No se pudo completar","VentaNexIA no pudo terminar la autorización. Vuelve al programa para ver el detalle.",false));
  }
}
