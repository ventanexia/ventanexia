function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function rpc(name,body){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>null);if(!r.ok)throw new Error("RPC_"+r.status);return j;
}
async function sb(path){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/"+path,{headers:{apikey:key,Authorization:"Bearer "+key}});
  const j=await r.json().catch(()=>null);if(!r.ok)throw new Error("DB_"+r.status);return j;
}
async function stripePost(path,params){
  const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("STRIPE_NOT_CONFIGURED");
  const body=new URLSearchParams();for(const[k,v]of Object.entries(params))if(v!==undefined&&v!==null&&v!=="")body.append(k,String(v));
  const r=await fetch("https://api.stripe.com/v1"+path,{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/x-www-form-urlencoded"},body});
  const j=await r.json();if(!r.ok)throw new Error(j?.error?.message||"Stripe "+r.status);return j;
}
const PACKS={
  video_pack:{name:"10 créditos de vídeo",amount:9900,meter:"video_credits",quantity:10},
  image_pack:{name:"100 créditos de imagen",amount:2900,meter:"image_credits",quantity:100},
  voice_pack:{name:"250 minutos de voz",amount:4900,meter:"voice_minutes",quantity:250},
  lead_pack:{name:"500 créditos de captación",amount:7900,meter:"lead_credits",quantity:500}
};
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const customerId=String(req.body?.customerId||"").trim(),activationCode=String(req.body?.activationCode||"").trim(),deviceKey=String(req.body?.deviceKey||"").trim(),packKey=String(req.body?.packKey||"").trim();
    const pack=PACKS[packKey];if(!customerId||!activationCode||!deviceKey||!pack)return res.status(400).json({error:"Compra no válida"});
    const device=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
    if(!device?.ok)return res.status(401).json({error:"Licencia no válida"});
    const tenants=await sb("vnx_tenants?customer_code=eq."+encodeURIComponent(customerId)+"&select=id,settings&limit=1");
    const tenant=tenants?.[0];if(!tenant?.id)return res.status(404).json({error:"Cliente no encontrado"});
    const email=String(tenant.settings?.owner_email||tenant.settings?.email||"").trim();
    const appUrl=String(process.env.PUBLIC_APP_URL||"https://ventanexia.es").replace(/\/$/,"");
    const params={
      mode:"payment",
      success_url:appUrl+"/planes.html?credits=success",
      cancel_url:appUrl+"/planes.html?credits=cancelled",
      "line_items[0][price_data][currency]":"eur",
      "line_items[0][price_data][unit_amount]":pack.amount,
      "line_items[0][price_data][product_data][name]":pack.name+" · VentaNexIA",
      "line_items[0][quantity]":"1",
      "metadata[credit_pack]":packKey,
      "metadata[meter]":pack.meter,
      "metadata[quantity]":pack.quantity,
      "metadata[tenant_id]":tenant.id,
      "metadata[customer_code]":customerId
    };
    if(email)params.customer_email=email;
    const session=await stripePost("/checkout/sessions",params);
    return res.status(200).json({ok:true,checkoutUrl:session.url});
  }catch(e){return res.status(503).json({error:"No se pudo preparar la compra de créditos"});}
}
