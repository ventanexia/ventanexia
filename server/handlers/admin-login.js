import crypto from "node:crypto";
function b64url(v){return Buffer.from(v).toString("base64url")}
function sign(v,secret){return crypto.createHmac("sha256",secret).update(v).digest("base64url")}
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
  const expected=sign(payload,secret);
  try{
    if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return false;
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    return data?.exp>Date.now() && data?.role==="admin";
  }catch{return false}
}
function newSession(){
  const secret=process.env.ADMIN_SESSION_SECRET;
  const payload=b64url(JSON.stringify({role:"admin",exp:Date.now()+8*60*60*1000}));
  return `${payload}.${sign(payload,secret)}`;
}
function safeEqual(a,b){
  if(!a||!b) return false;
  try{return a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))}catch{return false}
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const expected=process.env.ADMIN_PASSWORD;
  const secret=process.env.ADMIN_SESSION_SECRET;
  if(!expected||!secret) return res.status(503).json({code:"NOT_CONFIGURED",error:"Control Center no configurado"});
  const password=String(req.body?.password||"");
  if(!safeEqual(password,expected)) return res.status(401).json({error:"Credenciales no válidas"});
  const token=newSession();
  res.setHeader("Set-Cookie",`vnx_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
  return res.status(200).json({ok:true});
}
