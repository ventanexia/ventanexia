import {createAdminSession,isAdminLoginBlocked,recordAdminLogin,registerAdminSession,setAdminCookie,verifyAdminPassword} from "../../lib/admin-auth.js";
import {requireSameOrigin} from "../../lib/request-security.js";

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  if(!requireSameOrigin(req))return res.status(403).json({error:"Origen no permitido"});
  if(!process.env.ADMIN_SESSION_SECRET||(!process.env.ADMIN_PASSWORD_HASH&&!process.env.ADMIN_PASSWORD)){
    return res.status(503).json({code:"NOT_CONFIGURED",error:"Control Center no configurado"});
  }
  try{
    if(await isAdminLoginBlocked(req)){
      res.setHeader("Retry-After","900");
      return res.status(429).json({error:"Demasiados intentos. Vuelve a intentarlo en 15 minutos."});
    }
    const ok=verifyAdminPassword(String(req.body?.password||""));
    await recordAdminLogin(req,ok);
    if(!ok)return res.status(401).json({error:"Credenciales no válidas"});
    const session=createAdminSession();
    await registerAdminSession(session);
    setAdminCookie(res,session.token);
    return res.status(200).json({ok:true});
  }catch(e){
    console.error("admin_login",String(e?.message||e).slice(0,200));
    return res.status(503).json({error:"Autenticación temporalmente no disponible"});
  }
}
