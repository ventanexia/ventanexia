import crypto from "node:crypto";
function parseCookies(req){
  return Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf("="); return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];
  }));
}
function verifyAdmin(req){
  const secret=process.env.ADMIN_SESSION_SECRET;
  if(!secret) return false;
  const token=parseCookies(req).vnx_admin;
  if(!token) return false;
  const [payload,sig]=token.split(".");
  if(!payload||!sig) return false;
  const expected=crypto.createHmac("sha256",secret).update(payload).digest("base64url");
  try{
    if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return false;
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    return data?.exp>Date.now() && data?.role==="admin";
  }catch{return false}
}

function sb(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key,headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation"}};
}
async function sbFetch(path,options={}){
  const c=sb();
  const r=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{...c.headers,...(options.headers||{})}});
  const txt=await r.text(); let data=null;
  try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error(`SUPABASE_${r.status}:${typeof data==="string"?data:JSON.stringify(data)}`);
  return data;
}

const AGENTS=[
["guardian","VNX Guardian","EXECUTE_WITHIN_POLICY"],["scout","VNX Scout","AUTONOMOUS"],
["enrich","VNX Enrich","AUTONOMOUS"],["outreach","VNX Outreach","EXECUTE_WITHIN_POLICY"],
["inbox","VNX Inbox","EXECUTE_WITHIN_POLICY"],["qualify","VNX Qualify","AUTONOMOUS"],
["scheduler","VNX Scheduler","EXECUTE_WITHIN_POLICY"],["crm","VNX CRM","EXECUTE_WITHIN_POLICY"],
["proposal","VNX Proposal","PREPARE"],["content","VNX Content","EXECUTE_WITHIN_POLICY"],
["analyst","VNX Analyst","AUTONOMOUS"],["provision","VNX Provision","PREPARE"]
];
function clean(v,n=250){return String(v||"").trim().slice(0,n)}
function providersFromBlueprint(bp={}){
  const hay=(...words)=>JSON.stringify(bp).toLowerCase().match(new RegExp(words.join("|")));
  const rows=[
    {provider:"crm",purpose:"pipeline",needed:hay("crm","hubspot","salesforce","zoho")},
    {provider:"email",purpose:"commercial_email",needed:hay("email","correo","outreach","inbox","seguimiento")},
    {provider:"calendar",purpose:"scheduling",needed:hay("agenda","calendar","reuni","scheduler","cita")},
    {provider:"payments",purpose:"billing",needed:hay("pago","stripe","factur","billing","cobro")},
    {provider:"social",purpose:"publishing",needed:hay("social","linkedin","instagram","redes")},
    {provider:"analytics",purpose:"measurement",needed:true},
    {provider:"website",purpose:"widget_or_tracking",needed:true}
  ];
  return rows.filter(x=>x.needed).map(({provider,purpose})=>({provider,purpose}));
}
async function queueAutomation(payload){
  const url=process.env.N8N_AUTOMATION_WEBHOOK;
  if(!url) return {forwarded:false};
  const key=process.env.AUTOMATION_WEBHOOK_SECRET||"";
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify(payload)});
  return {forwarded:r.ok,status:r.status};
}
export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!verifyAdmin(req)) return res.status(401).json({error:"No autorizado"});
  const solutionId=clean(req.body?.solutionId,100);
  const domain=clean(req.body?.domain,300);
  if(!solutionId) return res.status(400).json({error:"solutionId obligatorio"});
  try{
    const rows=await sbFetch(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}&select=*`);
    const sol=rows?.[0];
    if(!sol) return res.status(404).json({error:"Solicitud no encontrada"});
    if(["provisioning","active"].includes(sol.status)) return res.status(409).json({error:"La solicitud ya está provisionada"});

    const created=await sbFetch("vnx_tenants",{method:"POST",body:JSON.stringify([{
      name:sol.company,domain:domain||null,status:"provisioning",autonomy_level:"execute_within_policy",
      settings:{solution_request_id:sol.id,blueprint:sol.blueprint,owner_email:sol.email}
    }])});
    const tenant=created?.[0];
    if(!tenant?.id) throw new Error("TENANT_CREATE_FAILED");

    await sbFetch("vnx_agents",{method:"POST",body:JSON.stringify(
      AGENTS.map(([agent_key,name,mode])=>({
        tenant_id:tenant.id,agent_key,name,mode,enabled:true,
        policy:{source_blueprint:sol.id}
      }))
    )});

    const connections=providersFromBlueprint(sol.blueprint);
    if(connections.length){
      await sbFetch("vnx_connections",{method:"POST",body:JSON.stringify(
        connections.map(c=>({...c,tenant_id:tenant.id,status:"authorization_needed"}))
      )});
    }

    const jobs=[
      {tenant_id:tenant.id,job_type:"knowledge_onboarding",status:"queued",payload:{solution_request_id:sol.id}},
      {tenant_id:tenant.id,job_type:"connection_plan",status:"queued",payload:{connections}},
      {tenant_id:tenant.id,job_type:"generate_playbook",status:"queued",payload:{blueprint:sol.blueprint}},
      {tenant_id:tenant.id,job_type:"configure_agents",status:"queued",payload:{blueprint:sol.blueprint}},
      {tenant_id:tenant.id,job_type:"prepare_installation",status:"waiting_approval",payload:{domain:domain||null}}
    ];
    await sbFetch("vnx_jobs",{method:"POST",body:JSON.stringify(jobs)});

    await sbFetch("vnx_installations",{method:"POST",body:JSON.stringify([{
      tenant_id:tenant.id,install_type:"commercial_os",target:domain||sol.company,
      status:"waiting_authorization",
      manifest:{solution_request_id:sol.id,blueprint:sol.blueprint,connections},
      rollback_manifest:{strategy:"disable_agents_disconnect_connectors_remove_widget"}
    }])});

    await sbFetch("vnx_approvals",{method:"POST",body:JSON.stringify([{
      tenant_id:tenant.id,agent_key:"provision",action_type:"production_install",
      title:`Autorizar instalación de ${sol.company}`,
      rationale:"Blueprint y entorno aislado preparados. La conexión a sistemas y activación productiva requieren autorización explícita.",
      risk:"high",status:"pending",
      payload:{solution_request_id:sol.id,domain:domain||null,connections}
    }])});

    await sbFetch(`vnx_solution_requests?id=eq.${encodeURIComponent(solutionId)}`,{
      method:"PATCH",body:JSON.stringify({status:"provisioning",updated_at:new Date().toISOString()})
    });

    const orchestration=await queueAutomation({
      source:"vnx-control",type:"tenant.provisioning_started",
      tenantId:tenant.id,solutionId:sol.id,company:sol.company,connections,blueprint:sol.blueprint
    });

    return res.status(201).json({
      ok:true,tenantId:tenant.id,publicKey:tenant.public_key,
      connectionRequirements:connections,
      status:"PROVISIONING_AWAITING_AUTHORIZATION",
      orchestration
    });
  }catch(e){
    console.error("promote_solution_error",String(e?.message||e).slice(0,700));
    return res.status(500).json({error:"No se pudo iniciar el provisionamiento",detail:String(e?.message||e).slice(0,300)});
  }
}
