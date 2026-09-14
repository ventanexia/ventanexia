import {pdb,hash,createPortalSession,setPortalCookie} from "../lib/portal-auth.js";
export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).send("Método no permitido");
  const raw=String(req.query?.token||"").slice(0,500);
  if(!raw) return res.redirect(302,"/portal.html?login=invalid");
  try{
    const rows=await pdb(`vnx_portal_login_tokens?token_hash=eq.${encodeURIComponent(hash(raw))}&used_at=is.null&select=*`);
    const row=rows?.[0];
    if(!row||Date.now()>=new Date(row.expires_at).getTime()) return res.redirect(302,"/portal.html?login=expired");
    const tenants=await pdb(`vnx_tenants?id=eq.${encodeURIComponent(row.tenant_id)}&select=id,name,settings`);
    const tenant=tenants?.[0];if(!tenant)return res.redirect(302,"/portal.html?login=invalid");
    await pdb(`vnx_portal_login_tokens?id=eq.${encodeURIComponent(row.id)}`,{method:"PATCH",body:JSON.stringify({used_at:new Date().toISOString()})});
    const email=String(tenant.settings?.owner_email||"");
    setPortalCookie(res,createPortalSession({tenantId:tenant.id,email}));
    return res.redirect(302,"/portal.html");
  }catch{return res.redirect(302,"/portal.html?login=error");}
}
