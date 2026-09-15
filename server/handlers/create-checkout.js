import crypto from "node:crypto";

function clean(v,max=1000){return String(v||"").trim().slice(0,max)}
function authorized(req){
  const expected=process.env.AUTOMATION_WEBHOOK_SECRET;
  if(!expected) return false;
  const got=clean(req.headers["x-vnx-automation-key"]||req.headers["authorization"]||"",500).replace(/^Bearer\s+/i,"");
  return got && crypto.timingSafeEqual(Buffer.from(got),Buffer.from(expected));
}
async function stripePost(path,params,idempotencyKey){
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key) throw new Error("STRIPE_NOT_CONFIGURED");
  const body=new URLSearchParams();
  for(const [k,v] of Object.entries(params)){ if(v!==undefined && v!==null && v!=="") body.append(k,String(v)); }
  const r=await fetch(`https://api.stripe.com/v1${path}`,{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${key}`,
      "Content-Type":"application/x-www-form-urlencoded",
      ...(idempotencyKey?{"Idempotency-Key":idempotencyKey}:{})
    },
    body
  });
  const data=await r.json();
  if(!r.ok) throw new Error(data?.error?.message||`Stripe ${r.status}`);
  return data;
}
async function stripeGet(path){
  const key=process.env.STRIPE_SECRET_KEY;
  if(!key) throw new Error("STRIPE_NOT_CONFIGURED");
  const r=await fetch(`https://api.stripe.com/v1${path}`,{headers:{"Authorization":`Bearer ${key}`}});
  const data=await r.json();
  if(!r.ok) throw new Error(data?.error?.message||`Stripe ${r.status}`);
  return data;
}
async function resolvePrice(envId,lookupKey){
  const data=await stripeGet(`/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookupKey)}`);
  return data?.data?.[0]?.id||envId||null;
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!authorized(req)) return res.status(401).json({error:"No autorizado"});

  const dealId=clean(req.body?.dealId,100);
  const email=clean(req.body?.email,320).toLowerCase();
  const plan=clean(req.body?.plan||"core",80);
  const solutionRequestId=clean(req.body?.solutionRequestId,100);
  if(!dealId||!email) return res.status(400).json({error:"dealId y email son obligatorios"});

  const priceMap={
    start:{envId:process.env.STRIPE_PRICE_START_MONTHLY,lookupKey:"vnx_inicio_monthly",expectedAmount:35000},
    core:{envId:process.env.STRIPE_PRICE_CORE_MONTHLY||process.env.STRIPE_PRICE_MONTHLY,lookupKey:"vnx_crecimiento_monthly",expectedAmount:90000},
    scale:{envId:process.env.STRIPE_PRICE_SCALE_MONTHLY,lookupKey:"vnx_empresa_monthly",expectedAmount:175000}
  };
  const chosen=priceMap[plan];
  if(!chosen) return res.status(400).json({error:"Plan no válido"});
  let monthly=null;
  const extraAgents=Math.max(0,Math.min(20,Number(req.body?.extraAgents||0)||0));
  const extraAgentPrice=process.env.STRIPE_PRICE_EXTRA_AGENT;
  const appUrl=String(process.env.PUBLIC_APP_URL||"https://ventanexia.vercel.app").replace(/\/$/,"");
  const success=process.env.CHECKOUT_SUCCESS_URL||`${appUrl}/?payment=success`;
  const cancel=process.env.CHECKOUT_CANCEL_URL||`${appUrl}/?payment=cancelled`;
  try{
    monthly=await resolvePrice(chosen.envId,chosen.lookupKey);
    if(!monthly) return res.status(503).json({code:"NOT_CONFIGURED",error:"Precio recurrente no configurado"});
    const params={
    mode:"subscription",
    customer_email:email,
    client_reference_id:dealId,
    success_url:success,
    cancel_url:cancel,
    "line_items[0][price]":monthly,
    "line_items[0][quantity]":"1",
    "metadata[deal_id]":dealId,
    "metadata[plan]":plan,
    ...(solutionRequestId?{"metadata[solution_request_id]":solutionRequestId}:{}),
    "subscription_data[metadata][deal_id]":dealId,
    ...(solutionRequestId?{"subscription_data[metadata][solution_request_id]":solutionRequestId}:{}),
    "subscription_data[metadata][plan]":plan,
    integration_identifier:"ventanexia_checkout_kqmdxvpa",
    allow_promotion_codes:"false"
    };
    let line=1;
    if(extraAgents>0&&extraAgentPrice){
      params[`line_items[${line}][price]`]=extraAgentPrice;
      params[`line_items[${line}][quantity]`]=String(extraAgents);
      params["metadata[extra_agents]"]=String(extraAgents);
      params["subscription_data[metadata][extra_agents]"]=String(extraAgents);
    }
    const configuredPrice=await stripeGet(`/prices/${encodeURIComponent(monthly)}`);
    if(configuredPrice.currency!=="eur"||configuredPrice.unit_amount!==chosen.expectedAmount||configuredPrice.recurring?.interval!=="month"){
      throw new Error("STRIPE_PRICE_MISMATCH");
    }
    const session=await stripePost("/checkout/sessions",params,`vnx-${dealId}-${plan}`);
    console.log(JSON.stringify({event:"checkout_created",dealId,sessionId:session.id,ts:new Date().toISOString()}));
    return res.status(200).json({ok:true,sessionId:session.id,checkoutUrl:session.url});
  }catch(e){
    console.error(JSON.stringify({event:"checkout_error",dealId,error:String(e?.message||e).slice(0,400)}));
    return res.status(e?.message==="STRIPE_NOT_CONFIGURED"?503:500).json({error:"No se pudo crear el pago seguro"});
  }
}
