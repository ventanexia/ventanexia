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
const DAY=86400;
function monthsOf(price){
  const iv=price?.recurring?.interval,n=Number(price?.recurring?.interval_count||1);
  return iv==="year"?12*n:iv==="month"?n:iv==="week"?n/4.345:iv==="day"?n/30.4:1;
}
function discountFactor(s){
  const c=s?.discount?.coupon||s?.discounts?.[0]?.coupon;
  if(c&&Number(c.percent_off)>0)return 1-Number(c.percent_off)/100;
  return 1;
}
function subscriptionAmounts(s){
  const items=s?.items?.data||[];let period=0,monthly=0;
  for(const it of items){
    const p=it.price||{},unit=Number(p.unit_amount||0)*Number(it.quantity||1);
    period+=unit;monthly+=unit/monthsOf(p);
  }
  const f=discountFactor(s);
  return {period:period*f/100,monthly:monthly*f/100,currency:String(s?.currency||items[0]?.price?.currency||"eur").toUpperCase()};
}
function periodEnd(s){return Number(s?.current_period_end||s?.items?.data?.[0]?.current_period_end||0)||null}
function priceKey(s){return s?.items?.data?.[0]?.price?.lookup_key||s?.metadata?.plan||null}
const round=n=>Math.round(Number(n||0)*100)/100;
const tsOf=v=>{const t=typeof v==="number"?v*1000:Date.parse(v||"");return Number.isFinite(t)?t:0};

export function buildKpis({tenants=[],contracts=[],entitlements=[],usage=[],customers=[],invoices=[],subscriptions=[]},nowMs=Date.now()){
  const now=Math.floor(nowMs/1000),d30=now-30*DAY,startMonth=Math.floor(Date.UTC(new Date(nowMs).getUTCFullYear(),new Date(nowMs).getUTCMonth(),1)/1000);
  const nameOf={};for(const t of tenants)nameOf[t.id]=t.name;
  const custName={};for(const c of customers)custName[c.id]=c.name||c.email||c.id;
  const contractByCust={};for(const c of contracts)if(c.stripe_customer_id)contractByCust[c.stripe_customer_id]=c;
  const label=id=>contractByCust[id]?.company||custName[id]||id||"—";

  const live=subscriptions.filter(s=>["active","past_due"].includes(s.status));
  const trialing=subscriptions.filter(s=>s.status==="trialing");
  let mrr=0;const byPlan={};
  for(const s of live){const a=subscriptionAmounts(s);mrr+=a.monthly;const k=priceKey(s)||"otro";byPlan[k]=byPlan[k]||{clientes:0,mrr:0};byPlan[k].clientes++;byPlan[k].mrr+=a.monthly}
  const mrrTrial=trialing.reduce((a,s)=>a+subscriptionAmounts(s).monthly,0);
  const renewals=live.filter(s=>!s.cancel_at_period_end&&periodEnd(s)).map(s=>({subscription:s.id,customer:s.customer,name:label(s.customer),date:periodEnd(s),amount:round(subscriptionAmounts(s).period),status:s.status}))
    .filter(r=>r.date>=now-DAY&&r.date<=now+60*DAY).sort((a,b)=>a.date-b.date);
  const sum=(arr,limit)=>round(arr.filter(r=>r.date<=limit).reduce((a,r)=>a+r.amount,0));
  const cancelling=live.filter(s=>s.cancel_at_period_end).map(s=>({subscription:s.id,name:label(s.customer),date:periodEnd(s),amount:round(subscriptionAmounts(s).monthly)}));
  const canceled30=subscriptions.filter(s=>s.status==="canceled"&&(s.canceled_at||0)>=d30).length;

  const paid=invoices.filter(i=>i.status==="paid");
  const paidAt=i=>Number(i.status_transitions?.paid_at||i.created||0);
  const cobradoMes=paid.filter(i=>paidAt(i)>=startMonth).reduce((a,i)=>a+Number(i.amount_paid||0),0)/100;
  const cobrado30=paid.filter(i=>paidAt(i)>=d30).reduce((a,i)=>a+Number(i.amount_paid||0),0)/100;
  const cobradoTotal=paid.reduce((a,i)=>a+Number(i.amount_paid||0),0)/100;
  const pendientes=invoices.filter(i=>i.status==="open"&&Number(i.amount_due||0)>0).map(i=>({invoice:i.id,number:i.number,name:label(i.customer),amount:round(Number(i.amount_due)/100),due:i.due_date||null,url:i.hosted_invoice_url||null,overdue:!!(i.due_date&&i.due_date<now)||live.some(s=>s.customer===i.customer&&s.status==="past_due")}));

  const ent={};for(const e of entitlements)ent[e.state]=(ent[e.state]||0)+1;
  const trialsEnding=entitlements.filter(e=>e.state==="trial"&&e.trial_ends_at&&tsOf(e.trial_ends_at)<=nowMs+7*DAY*1000&&tsOf(e.trial_ends_at)>=nowMs-DAY*1000)
    .map(e=>({name:nameOf[e.tenant_id]||e.tenant_id,ends:e.trial_ends_at,plan:e.plan_key})).sort((a,b)=>tsOf(a.ends)-tsOf(b.ends));
  const suspended=entitlements.filter(e=>e.state==="suspended").map(e=>({name:nameOf[e.tenant_id]||e.tenant_id,reason:e.suspend_reason||null}));
  const newTenants30=tenants.filter(t=>tsOf(t.created_at)>=d30*1000).length;
  const newContracts30=contracts.filter(c=>tsOf(c.accepted_at)>=d30*1000).length;
  const contractsMonthly=contracts.filter(c=>["accepted","active"].includes(String(c.status||"accepted"))).reduce((a,c)=>a+Number(c.total_monthly||0),0);

  const byTenant={};for(const u of usage){const k=u.tenant_id;if(!k||!u.capability)continue;byTenant[k]=byTenant[k]||{};byTenant[k][u.capability]=(byTenant[k][u.capability]||0)+Number(u.quantity||0)}
  const usageByTenant=Object.entries(byTenant).map(([id,caps])=>({tenant:id,name:nameOf[id]||id,total:Object.values(caps).reduce((a,b)=>a+b,0),
    top:Object.entries(caps).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([capability,quantity])=>({capability,quantity}))})).sort((a,b)=>b.total-a.total);

  return {
    money:{mrr:round(mrr),arr:round(mrr*12),mrrInTrial:round(mrrTrial),cobradoMes:round(cobradoMes),cobrado30:round(cobrado30),cobradoTotal:round(cobradoTotal),
      proximos7:sum(renewals,now+7*DAY),proximos30:sum(renewals,now+30*DAY),pendienteDeCobro:round(pendientes.reduce((a,p)=>a+p.amount,0)),contratosMensual:round(contractsMonthly),currency:"EUR"},
    clients:{tenants:tenants.length,nuevos30:newTenants30,activos:ent.active||0,enPrueba:ent.trial||0,suspendidos:ent.suspended||0,cancelados:ent.cancelled||0,suscripcionesVivas:live.length,enPruebaStripe:trialing.length,bajas30:canceled30},
    contracts:{total:contracts.length,firmados30:newContracts30},
    byPlan:Object.entries(byPlan).map(([plan,v])=>({plan,clientes:v.clientes,mrr:round(v.mrr)})),
    renewals,cancelling,pendingInvoices:pendientes,trialsEnding,suspended,usageByTenant,
    limits:{note:"Stripe: se leen las últimas 100 facturas y 100 suscripciones. Los cupones de importe fijo no se descuentan del MRR. El uso muestra solo acciones que pasan por contadores del servidor; no incluye actividad puramente local del ordenador del cliente."}
  };
}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    if(!await validateMaster(req.body||{}))return res.status(403).json({error:"Solo disponible en la edición maestra"});
    const monthStart=new Date(Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),1)).toISOString();
    const jobs={
      tenants:()=>sb("vnx_tenants?select=id,name,status,customer_code,created_at,settings&order=created_at.desc&limit=500"),
      contracts:()=>sb("vnx_contracts?select=*&order=accepted_at.desc&limit=500"),
      events:()=>sb("vnx_customer_events?select=*&order=created_at.desc&limit=200"),
      entitlements:()=>sb("vnx_entitlements?select=tenant_id,state,plan_key,trial_ends_at,paid_started_at,suspend_reason,stripe_customer_id&limit=1000"),
      usage:()=>sb("vnx_metered_usage?created_at=gte."+encodeURIComponent(monthStart)+"&select=tenant_id,meter_key,quantity&limit=5000"),
      customers:()=>stripeGet("/customers?limit=100"),
      invoices:()=>stripeGet("/invoices?limit=100"),
      subscriptions:()=>stripeGet("/subscriptions?status=all&limit=100")
    };
    const names=Object.keys(jobs),results=await Promise.allSettled(names.map(n=>jobs[n]()));
    const data={},warnings=[];
    names.forEach((n,i)=>{const r=results[i];if(r.status==="fulfilled")data[n]=r.value;else{data[n]=null;warnings.push({source:n,error:String(r.reason?.message||r.reason).slice(0,80)})}});
    if(!process.env.STRIPE_SECRET_KEY)warnings.push({source:"stripe",error:"STRIPE_SECRET_KEY no configurada: sin datos de cobros"});
    const list=x=>Array.isArray(x)?x:[];
    const stripeList=x=>list(x?.data);
    const invRaw=stripeList(data.invoices),subRaw=stripeList(data.subscriptions),custRaw=stripeList(data.customers);
    const inv=invRaw.map(i=>({id:i.id,number:i.number||null,status:i.status||null,paid:!!i.paid,amount_due:money(i.amount_due,i.currency),amount_paid:money(i.amount_paid,i.currency),created:i.created,due_date:i.due_date||null,hosted_invoice_url:i.hosted_invoice_url||null,invoice_pdf:i.invoice_pdf||null,customer:typeof i.customer==="string"?i.customer:i.customer?.id||null}));
    const su=subRaw.map(s=>{const a=subscriptionAmounts(s);return {id:s.id,status:s.status,customer:typeof s.customer==="string"?s.customer:s.customer?.id||null,created:s.created||null,cancel_at_period_end:!!s.cancel_at_period_end,metadata:s.metadata||{},
      plan:priceKey(s),amount_period:round(a.period),amount_monthly:round(a.monthly),currency:a.currency,current_period_end:periodEnd(s),trial_end:s.trial_end||null}});
    const entByCustomer=new Map(list(data.entitlements).filter(e=>e.stripe_customer_id).map(e=>[e.stripe_customer_id,e]));
    const subByCustomer=new Map();for(const s of subRaw){const id=typeof s.customer==="string"?s.customer:s.customer?.id;if(id&&!subByCustomer.has(id))subByCustomer.set(id,s)}
    const openByCustomer=new Map();for(const i of invRaw){const id=typeof i.customer==="string"?i.customer:i.customer?.id;if(id&&i.status==="open"&&Number(i.amount_due||0)>0)openByCustomer.set(id,i)}
    const customers=custRaw.map(c=>{
      const ent=entByCustomer.get(c.id),sub=subByCustomer.get(c.id),open=openByCustomer.get(c.id);
      let billingStatus="no_subscription";
      if(ent?.state==="suspended")billingStatus="suspended";
      else if(open||sub?.status==="past_due")billingStatus="payment_due";
      else if(["active","trialing"].includes(String(sub?.status||""))||ent?.state==="active")billingStatus="active";
      else if(ent?.state==="trial")billingStatus="trialing";
      return {id:c.id,name:c.name||null,email:c.email||null,created:c.created||null,billingStatus,paymentUrl:open?.hosted_invoice_url||null,entitlementState:ent?.state||null};
    });
    const kpis=buildKpis({
      tenants:list(data.tenants),contracts:list(data.contracts),entitlements:list(data.entitlements),usage:list(data.usage).map(u=>({tenant_id:u.tenant_id,capability:u.capability||u.meter_key,quantity:u.quantity})),customers,
      invoices:invRaw.map(i=>({...i,customer:typeof i.customer==="string"?i.customer:i.customer?.id||null})),
      subscriptions:subRaw.map(s=>({...s,customer:typeof s.customer==="string"?s.customer:s.customer?.id||null}))
    });
    return res.status(200).json({ok:true,tenants:list(data.tenants),contracts:list(data.contracts),events:list(data.events),customers,invoices:inv,subscriptions:su,kpis,warnings,generatedAt:new Date().toISOString()});
  }catch(e){return res.status(500).json({error:"No se pudo cargar el panel maestro",detail:String(e?.message||e).slice(0,180)})}
}
