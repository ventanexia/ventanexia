import {authenticateAdmin} from "../../lib/admin-auth.js";

function stripeKey(){return String(process.env.STRIPE_SECRET_KEY||"")}
function sb(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) return null;
  return {url,key,headers:{apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"}};
}
async function sbGet(path){
  const c=sb(); if(!c) return [];
  const r=await fetch(`${c.url}/rest/v1/${path}`,{headers:c.headers});
  if(!r.ok) return [];
  return r.json().catch(()=>[]);
}
async function stripeGet(path){
  const key=stripeKey();
  if(!key) throw new Error("STRIPE_NOT_CONFIGURED");
  const r=await fetch(`https://api.stripe.com/v1${path}`,{headers:{Authorization:`Bearer ${key}`}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data?.error?.message||`Stripe ${r.status}`);
  return data;
}
function money(cents=0,currency="eur"){return {amount:Number(cents||0)/100,currency:String(currency||"eur").toUpperCase()}}
function periodAmount(sub){
  return (sub?.items?.data||[]).reduce((sum,item)=>{
    const p=item?.price||{}; const qty=Number(item?.quantity||1);
    if(p.recurring?.interval==="month") return sum+Number(p.unit_amount||0)*qty;
    if(p.recurring?.interval==="year") return sum+Math.round(Number(p.unit_amount||0)*qty/12);
    return sum;
  },0);
}
function safeEmail(v){return String(v||"").trim().toLowerCase()}
function cardSummary(pm){
  const c=pm?.card;
  if(!c) return null;
  return {brand:c.brand||null,last4:c.last4||null,exp_month:c.exp_month||null,exp_year:c.exp_year||null};
}

export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  if(!await authenticateAdmin(req)) return res.status(401).json({error:"No autorizado"});
  try{
    const customerId=String(req.query?.customer||"").trim();
    if(customerId){
      const [customer,subs,invoices,pms,contracts,events]=await Promise.all([
        stripeGet(`/customers/${encodeURIComponent(customerId)}`),
        stripeGet(`/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`),
        stripeGet(`/invoices?customer=${encodeURIComponent(customerId)}&limit=100`),
        stripeGet(`/payment_methods?customer=${encodeURIComponent(customerId)}&type=card&limit=20`),
        sbGet(`vnx_contracts?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=*&order=accepted_at.desc&limit=20`),
        sbGet(`vnx_customer_events?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=*&order=created_at.desc&limit=200`)
      ]);
      return res.status(200).json({ok:true,customer:{id:customer.id,name:customer.name||null,email:customer.email||null,phone:customer.phone||null,created:customer.created||null,metadata:customer.metadata||{}},paymentMethods:(pms.data||[]).map(pm=>({id:pm.id,card:cardSummary(pm)})),subscriptions:(subs.data||[]).map(s=>({id:s.id,status:s.status,current_period_start:s.current_period_start,current_period_end:s.current_period_end,cancel_at_period_end:!!s.cancel_at_period_end,monthly_amount:money(periodAmount(s),s.currency||"eur"),metadata:s.metadata||{}})),invoices:(invoices.data||[]).map(i=>({id:i.id,number:i.number||null,status:i.status||null,paid:!!i.paid,amount_due:money(i.amount_due,i.currency),amount_paid:money(i.amount_paid,i.currency),created:i.created,due_date:i.due_date||null,hosted_invoice_url:i.hosted_invoice_url||null,invoice_pdf:i.invoice_pdf||null,attempt_count:i.attempt_count||0})),contracts,events});
    }

    const [customers,subs,invoices,contracts]=await Promise.all([
      stripeGet("/customers?limit=100"),
      stripeGet("/subscriptions?status=all&limit=100"),
      stripeGet("/invoices?limit=100"),
      sbGet("vnx_contracts?select=*&order=accepted_at.desc&limit=200")
    ]);
    const customerMap=new Map((customers.data||[]).map(c=>[c.id,{id:c.id,name:c.name||c.email||c.id,email:safeEmail(c.email),phone:c.phone||null,created:c.created||null,status:"sin suscripción",mrr:0,open:0,paid:0,lastInvoice:null,contracts:[]} ]));
    for(const s of subs.data||[]){
      const id=typeof s.customer==="string"?s.customer:s.customer?.id; if(!id) continue;
      if(!customerMap.has(id)) customerMap.set(id,{id,name:id,email:"",phone:null,created:null,status:"sin suscripción",mrr:0,open:0,paid:0,lastInvoice:null,contracts:[]});
      const c=customerMap.get(id); c.status=s.status; if(["active","trialing","past_due"].includes(s.status)) c.mrr+=periodAmount(s);
    }
    for(const i of invoices.data||[]){
      const id=typeof i.customer==="string"?i.customer:i.customer?.id; if(!id||!customerMap.has(id)) continue;
      const c=customerMap.get(id); if(i.paid)c.paid+=Number(i.amount_paid||0); else if(["open","past_due"].includes(i.status))c.open+=Number(i.amount_due||0);
      if(!c.lastInvoice||Number(i.created||0)>Number(c.lastInvoice.created||0))c.lastInvoice={id:i.id,number:i.number||null,status:i.status||null,created:i.created,amount:money(i.amount_due,i.currency)};
    }
    for(const ct of contracts||[]){
      let target=null; if(ct.stripe_customer_id)target=customerMap.get(ct.stripe_customer_id);
      if(!target&&ct.email){target=[...customerMap.values()].find(c=>c.email===safeEmail(ct.email));}
      if(target) target.contracts.push(ct);
    }
    const rows=[...customerMap.values()].map(c=>({...c,mrr:money(c.mrr,"eur"),open:money(c.open,"eur"),paid:money(c.paid,"eur")}));
    const mrr=rows.reduce((s,c)=>s+Math.round(c.mrr.amount*100),0);
    const open=rows.reduce((s,c)=>s+Math.round(c.open.amount*100),0);
    const paid=rows.reduce((s,c)=>s+Math.round(c.paid.amount*100),0);
    return res.status(200).json({ok:true,summary:{customers:rows.length,active:rows.filter(c=>["active","trialing"].includes(c.status)).length,past_due:rows.filter(c=>c.status==="past_due"||c.open.amount>0).length,mrr:money(mrr,"eur"),open:money(open,"eur"),paid:money(paid,"eur")},customers:rows});
  }catch(e){
    const code=String(e?.message||e)==="STRIPE_NOT_CONFIGURED"?503:500;
    return res.status(code).json({error:code===503?"Stripe no está configurado":"No se pudo cargar facturación",detail:String(e?.message||e).slice(0,300)});
  }
}
