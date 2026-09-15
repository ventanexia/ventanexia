import {clearAdminCookie,revokeAdminSession} from "../../lib/admin-auth.js";
import {requireSameOrigin} from "../../lib/request-security.js";
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  if(!requireSameOrigin(req))return res.status(403).json({error:"Origen no permitido"});
  try{await revokeAdminSession(req)}catch{}
  clearAdminCookie(res);
  return res.status(200).json({ok:true});
}
