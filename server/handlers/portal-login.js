import {pdb,hash,createPortalSession,registerPortalSession,setPortalCookie} from "../../lib/portal-auth.js";
export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).send("Método no permitido");
  const raw=String(req.query?.token||"").slice(0,500);
  if(!raw) return res.redirect(302,"/portal.html?login=invalid");
  try{
    const rows=await pdb("rpc/vnx_consume_portal_login_token",{method:"POST",body:JSON.stringify({p_token_hash:hash(raw)})});
    const row=rows?.[0];
    if(!row) return res.redirect(302,"/portal.html?login=expired");
    const tenants=await pdb(`vnx_tenants?id=eq.${encodeURIComponent(row.tenant_id)}&select=id,name,settings`);
    const tenant=tenants?.[0];if(!tenant)return res.redirect(302,"/portal.html?login=invalid");
    const email=String(tenant.settings?.owner_email||"");
    const session=createPortalSession({tenantId:tenant.id,email});
    await registerPortalSession(session);
    setPortalCookie(res,session.token);
    return res.redirect(302,"/portal.html");
  }catch{return res.redirect(302,"/portal.html?login=error");}
}
