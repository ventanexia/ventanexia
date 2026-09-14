import {readPortalSession,pdb} from "../lib/portal-auth.js";
function stripeBody(obj){return Object.entries(obj).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
 const s=readPortalSession(req);if(!s)return res.status(401).json({error:"No autorizado"});
 const key=process.env.STRIPE_SECRET_KEY;if(!key)return res.status(503).json({error:"Facturación no configurada"});
 try{
   const rows=await pdb(`vnx_entitlements?tenant_id=eq.${encodeURIComponent(s.tenantId)}&select=stripe_customer_id`);
   const customer=rows?.[0]?.stripe_customer_id;
   if(!customer)return res.status(409).json({error:"Todavía no existe una cuenta de facturación activa"});
   const returnUrl=process.env.CUSTOMER_PORTAL_RETURN_URL||`${process.env.PUBLIC_APP_URL||"https://www.ventanexia.es"}/portal.html`;
   const r=await fetch("https://api.stripe.com/v1/billing_portal/sessions",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded"},body:stripeBody({customer,return_url:returnUrl})});
   const j=await r.json();if(!r.ok)throw new Error("STRIPE_PORTAL_ERROR");
   return res.status(200).json({ok:true,url:j.url});
 }catch{return res.status(500).json({error:"No se pudo abrir el portal de facturación"});}
}
