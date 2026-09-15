import {verifyAdmin} from "../../lib/admin-auth.js";
import {requireSameOrigin} from "../../lib/request-security.js";

function sb(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key,headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation"}};
}
async function sbFetch(path,options={}){
  const c=sb();
  const r=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{...c.headers,...(options.headers||{})}});
  const txt=await r.text();
  let data=null; try{data=txt?JSON.parse(txt):null}catch{data=txt}
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
export default async function handler(req,res){
  if(!verifyAdmin(req)) return res.status(401).json({error:"No autorizado"});
  try{
    if(req.method==="GET"){
      const rows=await sbFetch("vnx_tenants?select=*&order=created_at.desc&limit=100");
      return res.status(200).json({ok:true,tenants:rows});
    }
    if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  if(!requireSameOrigin(req))return res.status(403).json({error:"Origen no permitido"});
    const name=clean(req.body?.name), domain=clean(req.body?.domain), autonomy=clean(req.body?.autonomy_level||"execute_within_policy");
    if(!name) return res.status(400).json({error:"Nombre obligatorio"});
    const created=await sbFetch("vnx_tenants",{
      method:"POST",body:JSON.stringify([{name,domain:domain||null,status:"provisioning",autonomy_level:autonomy}])
    });
    const tenant=created?.[0];
    if(!tenant?.id) throw new Error("TENANT_CREATE_FAILED");
    await sbFetch("vnx_agents",{
      method:"POST",
      body:JSON.stringify(AGENTS.map(([agent_key,name,mode])=>({tenant_id:tenant.id,agent_key,name,mode,enabled:true,policy:{}})))
    });
    await sbFetch("vnx_jobs",{
      method:"POST",
      body:JSON.stringify([
        {tenant_id:tenant.id,job_type:"knowledge_onboarding",status:"queued",payload:{domain}},
        {tenant_id:tenant.id,job_type:"crm_connect",status:"waiting_approval",payload:{}},
        {tenant_id:tenant.id,job_type:"calendar_connect",status:"waiting_approval",payload:{}},
        {tenant_id:tenant.id,job_type:"email_connect",status:"waiting_approval",payload:{}},
        {tenant_id:tenant.id,job_type:"install_widget",status:"waiting_approval",payload:{domain}}
      ])
    });
    await sbFetch("vnx_approvals",{
      method:"POST",
      body:JSON.stringify([{
        tenant_id:tenant.id,agent_key:"provision",action_type:"tenant_activate",
        title:`Activar ${name} en producción`,
        rationale:"La infraestructura base se prepara automáticamente; la activación final espera autorización explícita.",
        risk:"high",status:"pending",payload:{domain}
      }])
    });
    return res.status(201).json({ok:true,tenant,install:{publicKey:tenant.public_key,script:`<script async src="https://www.ventanexia.es/assets/vnx-client.js" data-vnx-key="${tenant.public_key}"></script>`}});
  }catch(e){
    return res.status(500).json({error:"No se pudo crear el cliente",detail:String(e?.message||e).slice(0,300)});
  }
}
