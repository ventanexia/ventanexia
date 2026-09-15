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

export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  if(!verifyAdmin(req)) return res.status(401).json({error:"No autorizado"});
  try{
    const [tenants,approvals,jobs]=await Promise.all([
      sbFetch("vnx_tenants?select=id,public_key,name,domain,status,autonomy_level,created_at&order=created_at.desc&limit=50"),
      sbFetch("vnx_approvals?select=id,tenant_id,agent_key,action_type,title,rationale,risk,status,requested_at&status=eq.pending&order=requested_at.asc&limit=100"),
      sbFetch("vnx_jobs?select=id,tenant_id,job_type,status,correlation_id,created_at&order=created_at.desc&limit=100")
    ]);
    return res.status(200).json({
      ok:true,tenants,approvals,jobs,
      integrations:{
        hubspot:!!process.env.HUBSPOT_ACCESS_TOKEN,
        openai:!!process.env.OPENAI_API_KEY,
        calendar:!!process.env.BOOKING_URL,
        stripe:!!process.env.STRIPE_SECRET_KEY,
        supabase:!!process.env.SUPABASE_SERVICE_ROLE_KEY,
        orchestration:!!process.env.N8N_AUTOMATION_WEBHOOK
      }
    });
  }catch(e){
    return res.status(e?.message==="SUPABASE_NOT_CONFIGURED"?503:500).json({error:"No se pudo cargar el centro de control",detail:String(e?.message||e).slice(0,300)});
  }
}
