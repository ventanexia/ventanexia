function clean(v,max=500){return String(v||"").trim().slice(0,max)}
function authorized(req){
  const expected=process.env.AUTOMATION_WEBHOOK_SECRET;
  const got=clean(req.headers["x-vnx-automation-key"]||req.headers["authorization"]||"",500).replace(/^Bearer\s+/i,"");
  if(!expected||!got) return false;
  try{
    const a=Buffer.from(got),b=Buffer.from(expected);
    return a.length===b.length && require("node:crypto").timingSafeEqual(a,b);
  }catch{return false}
}
async function stripePost(path,params){
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key) throw new Error("STRIPE_NOT_CONFIGURED");
  const body=new URLSearchParams();
  Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=="")body.append(k,String(v))});
  const r=await fetch(`https://api.stripe.com/v1${path}`,{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded"},body});
  const j=await r.json();
  if(!r.ok) throw new Error(j?.error?.message||`Stripe ${r.status}`);
  return j;
}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!authorized(req)) return res.status(401).json({error:"No autorizado"});
  const customer=clean(req.body?.customerId,100);
  if(!customer) return res.status(400).json({error:"customerId obligatorio"});
  try{
    const session=await stripePost("/billing_portal/sessions",{
      customer,
      return_url:process.env.CUSTOMER_PORTAL_RETURN_URL||"https://www.ventanexia.es/"
    });
    return res.status(200).json({ok:true,url:session.url});
  }catch(e){
    console.error("portal_error",String(e?.message||e).slice(0,400));
    return res.status(500).json({error:"No se pudo abrir el portal de facturación"});
  }
}
