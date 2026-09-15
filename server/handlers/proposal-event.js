import crypto from "node:crypto";

function clean(v,max=5000){return String(v||"").trim().slice(0,max)}
function auth(req){
  const expected=process.env.AUTOMATION_WEBHOOK_SECRET;
  const got=clean(req.headers["x-vnx-automation-key"]||req.headers["authorization"]||"",500).replace(/^Bearer\s+/i,"");
  if(!expected||!got) return false;
  try{return expected.length===got.length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(got))}catch{return false}
}
async function hsPatch(dealId,properties){
  const token=process.env.HUBSPOT_ACCESS_TOKEN;
  if(!token) throw new Error("HUBSPOT_NOT_CONFIGURED");
  const r=await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}`,{
    method:"PATCH",headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({properties})
  });
  if(!r.ok) throw new Error(`HubSpot ${r.status}`);
}
async function stripeCheckout(dealId,email,solutionRequestId){
  const key=process.env.STRIPE_SECRET_KEY, monthly=process.env.STRIPE_PRICE_MONTHLY;
  if(!key||!monthly||!email) return null;
  const priceResponse=await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(monthly)}`,{headers:{"Authorization":`Bearer ${key}`}});
  const configuredPrice=await priceResponse.json();
  if(!priceResponse.ok||configuredPrice.currency!=="eur"||configuredPrice.unit_amount!==90000||configuredPrice.recurring?.interval!=="month"){
    throw new Error("STRIPE_PRICE_MISMATCH");
  }
  const p=new URLSearchParams();
  const success=process.env.CHECKOUT_SUCCESS_URL||"https://www.ventanexia.es/?payment=success";
  const cancel=process.env.CHECKOUT_CANCEL_URL||"https://www.ventanexia.es/?payment=cancelled";
  Object.entries({
    mode:"subscription",customer_email:email,client_reference_id:dealId,success_url:success,cancel_url:cancel,
    "line_items[0][price]":monthly,"line_items[0][quantity]":"1",
    "metadata[deal_id]":dealId,"subscription_data[metadata][deal_id]":dealId,
    ...(solutionRequestId?{"metadata[solution_request_id]":solutionRequestId,"subscription_data[metadata][solution_request_id]":solutionRequestId}:{})
  }).forEach(([k,v])=>p.append(k,v));
  const r=await fetch("https://api.stripe.com/v1/checkout/sessions",{
    method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":`vnx-accepted-${dealId}`},body:p
  });
  const j=await r.json();
  if(!r.ok) throw new Error(j?.error?.message||`Stripe ${r.status}`);
  return j.url;
}
async function forward(payload){
  const url=process.env.N8N_AUTOMATION_WEBHOOK;
  if(!url) return;
  const key=process.env.AUTOMATION_WEBHOOK_SECRET||"";
  await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(payload)}).catch(()=>{});
}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!auth(req)) return res.status(401).json({error:"No autorizado"});

  const dealId=clean(req.body?.dealId,100);
  const eventType=clean(req.body?.eventType,50);
  const email=clean(req.body?.email,320).toLowerCase();
  const solutionRequestId=clean(req.body?.solutionRequestId,100);
  if(!dealId||!eventType) return res.status(400).json({error:"dealId y eventType son obligatorios"});

  const map={
    sent:{dealstage:"contractsent",hs_next_step:"Confirmar recepción y resolver dudas de la propuesta"},
    accepted:{dealstage:"6048857294",hs_next_step:"Completar pago seguro e iniciar onboarding"},
    revision_requested:{dealstage:"6048857294",hs_next_step:"Revisar cambios solicitados y responder"},
    rejected_final:{dealstage:"closedlost",hs_next_step:"Registrar motivo de pérdida y aprendizaje"}
  };
  if(!map[eventType]) return res.status(400).json({error:"eventType no soportado"});

  try{
    await hsPatch(dealId,map[eventType]);
    const checkoutUrl=eventType==="accepted"?await stripeCheckout(dealId,email,solutionRequestId):null;
    const payload={source:"ventanexia",type:`proposal.${eventType}`,dealId,email:email||null,checkoutUrl,ts:new Date().toISOString()};
    await forward(payload);
    console.log(JSON.stringify({event:"proposal_event",eventType,dealId,checkoutCreated:!!checkoutUrl,ts:payload.ts}));
    return res.status(200).json({ok:true,eventType,dealId,checkoutUrl});
  }catch(e){
    console.error(JSON.stringify({event:"proposal_event_error",eventType,dealId,error:String(e?.message||e).slice(0,400)}));
    return res.status(500).json({error:"No se pudo procesar la propuesta"});
  }
}
