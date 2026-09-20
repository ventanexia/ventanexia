function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
async function sb(path){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/"+path,{headers:{apikey:key,Authorization:"Bearer "+key}});
  const j=await r.json().catch(()=>[]);if(!r.ok)throw new Error("DB_"+r.status);return j;
}
async function rpc(name,body){
  const {url,key}=cfg();
  const r=await fetch(url+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>null);if(!r.ok)throw new Error("RPC_"+r.status);return j;
}
async function validateMaster(body={}){
  const customerId=String(body.customerId||"").trim(),activationCode=String(body.activationCode||"").trim(),deviceKey=String(body.deviceKey||"").trim();
  const d=await rpc("vnx_device_status_public",{p_customer_code:customerId,p_activation_code:activationCode,p_device_key:deviceKey});
  return Boolean(d?.ok&&String(d.planKey||d.plan||"").toLowerCase()==="master");
}
async function stripeGet(path){
  const key=String(process.env.STRIPE_SECRET_KEY||"");if(!key)return {data:[]};
  const r=await fetch("https://api.stripe.com/v1"+path,{headers:{Authorization:"Bearer "+key}});
  const j=await r.json().catch(()=>({data:[]}));if(!r.ok)throw new Error("STRIPE_"+r.status);return j;
}
function money(c=0,cur="eur"){return {amount:Number(c||0)/100,currency:String(cur||"eur").toUpperCase()}}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    if(!await validateMaster(req.body||{}))return res.status(403).json({error:"Solo disponible en la edición maestra"});
    const [tenants,contracts,events,customers,invoices,subs]=await Promise.all([
      sb("vnx_tenants?select=id,name,status,customer_code,created_at,settings&order=created_at.desc&limit=100"),
      sb("vnx_contracts?select=*&order=accepted_at.desc&limit=200"),
      sb("vnx_customer_events?select=*&order=created_at.desc&limit=200"),
      stripeGet("/customers?limit=100"),
      stripeGet("/invoices?limit=100"),
      stripeGet("/subscriptions?status=all&limit=100")
    ]);
    const inv=(invoices.data||[]).map(i=>({id:i.id,number:i.number||null,status:i.status||null,paid:!!i.paid,amount_due:money(i.amount_due,i.currency),amount_paid:money(i.amount_paid,i.currency),created:i.created,due_date:i.due_date||null,hosted_invoice_url:i.hosted_invoice_url||null,invoice_pdf:i.invoice_pdf||null,customer:typeof i.customer==="string"?i.customer:i.customer?.id||null}));
    const su=(subs.data||[]).map(s=>({id:s.id,status:s.status,customer:typeof s.customer==="string"?s.customer:s.customer?.id||null,created:s.created||null,cancel_at_period_end:!!s.cancel_at_period_end,metadata:s.metadata||{}}));
    return res.status(200).json({ok:true,tenants,contracts,events,customers:(customers.data||[]).map(c=>({id:c.id,name:c.name||null,email:c.email||null,created:c.created||null})),invoices:inv,subscriptions:su});
  }catch(e){return res.status(500).json({error:"No se pudo cargar el panel maestro",detail:String(e?.message||e).slice(0,180)})}
}
