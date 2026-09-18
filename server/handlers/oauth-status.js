import {sbFetch} from "./oauth-common.js";

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  const state=String(req.body?.state||"").trim();
  const deviceId=String(req.body?.deviceId||"").trim();
  if(!state)return res.status(400).json({error:"Falta state"});
  try{
    const rows=await sbFetch(`vnx_oauth_sessions?state=eq.${encodeURIComponent(state)}&select=*`);
    const row=rows?.[0];
    if(!row)return res.status(404).json({error:"Autorización no encontrada"});
    if(row.device_id&&deviceId&&row.device_id!==deviceId)return res.status(403).json({error:"Esta autorización pertenece a otro dispositivo"});
    if(new Date(row.expires_at).getTime()<Date.now()&&row.status==="pending")return res.status(200).json({status:"expired"});
    if(row.status!=="completed")return res.status(200).json({status:row.status,error:row.error||null});
    if(row.consumed_at)return res.status(410).json({error:"Autorización ya recogida",code:"OAUTH_ALREADY_CONSUMED"});
    const token=row.token_payload||{};
    await sbFetch(`vnx_oauth_sessions?state=eq.${encodeURIComponent(state)}`,{method:"PATCH",body:JSON.stringify({consumed_at:new Date().toISOString(),token_payload:null})});
    return res.status(200).json({status:"completed",provider:row.provider,module:row.module,shop:row.shop||null,token});
  }catch(e){return res.status(500).json({error:"No se pudo comprobar la autorización",detail:String(e?.message||e).slice(0,180)})}
}
