import crypto from "node:crypto";
import {pdb} from "./portal-auth.js";

function b64(v){return Buffer.from(v).toString("base64url")}
function sign(v){
  const secret=String(process.env.ADMIN_SESSION_SECRET||"");
  if(secret.length<32) throw new Error("ADMIN_SESSION_SECRET_NOT_CONFIGURED");
  return crypto.createHmac("sha256",secret).update(v).digest("base64url");
}
function cookies(req){
  return Object.fromEntries(String(req.headers?.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];
  }));
}
function equal(a,b){
  try{
    const aa=Buffer.isBuffer(a)?a:Buffer.from(String(a));
    const bb=Buffer.isBuffer(b)?b:Buffer.from(String(b));
    return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
  }catch{return false}
}
function readAdminSession(req){
  try{
    const token=cookies(req).vnx_admin;
    const [payload,sig]=String(token||"").split(".");
    if(!payload||!sig||!equal(sig,sign(payload)))return false;
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    return data?.role==="admin"&&Number(data.exp)>Date.now();
  }catch{return false}
}
export function createAdminSession(){
  const sid=crypto.randomBytes(32).toString("base64url"),exp=Date.now()+8*60*60*1000;
  const payload=b64(JSON.stringify({role:"admin",sid,iat:Date.now(),exp}));
  return {token:`${payload}.${sign(payload)}`,sid,exp};
}
export async function registerAdminSession(session){
  await pdb("vnx_admin_sessions",{method:"POST",body:JSON.stringify([{session_hash:sign(session.sid),expires_at:new Date(session.exp).toISOString()}])});
}
export async function authenticateAdmin(req){
  const data=readAdminSession(req);if(!data?.sid)return null;
  const rows=await pdb(`vnx_admin_sessions?session_hash=eq.${encodeURIComponent(sign(data.sid))}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id`);
  return rows?.[0]?data:null;
}
export async function revokeAdminSession(req){
  const data=readAdminSession(req);if(!data?.sid)return;
  await pdb(`vnx_admin_sessions?session_hash=eq.${encodeURIComponent(sign(data.sid))}`,{method:"PATCH",body:JSON.stringify({revoked_at:new Date().toISOString()})});
}
export function setAdminCookie(res,token){
  res.setHeader("Set-Cookie",`vnx_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);
}
export function clearAdminCookie(res){
  res.setHeader("Set-Cookie","vnx_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
}
function attemptKey(req){
  const raw=String(req.headers?.["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
  return crypto.createHmac("sha256",String(process.env.ADMIN_SESSION_SECRET||"")).update(raw).digest("hex");
}
export async function isAdminLoginBlocked(req){
  const key=attemptKey(req);
  const since=new Date(Date.now()-15*60*1000).toISOString();
  const rows=await pdb(`vnx_auth_attempts?attempt_key=eq.${encodeURIComponent(key)}&created_at=gte.${encodeURIComponent(since)}&success=eq.false&select=id`);
  return (rows||[]).length>=5;
}
export async function recordAdminLogin(req,success){
  const key=attemptKey(req);
  if(success){
    await pdb(`vnx_auth_attempts?attempt_key=eq.${encodeURIComponent(key)}`,{method:"DELETE"});
    return;
  }
  await pdb("vnx_auth_attempts",{method:"POST",body:JSON.stringify([{attempt_key:key,success:false}])});
}
export function verifyAdminPassword(password){
  const encoded=String(process.env.ADMIN_PASSWORD_HASH||"");
  if(encoded){
    const [kind,saltHex,hashHex]=encoded.split("$");
    if(kind!=="scrypt"||!saltHex||!hashHex)return false;
    const actual=crypto.scryptSync(String(password),Buffer.from(saltHex,"hex"),Buffer.from(hashHex,"hex").length);
    return equal(actual,Buffer.from(hashHex,"hex"));
  }
  const legacy=String(process.env.ADMIN_PASSWORD||"");
  return Boolean(legacy)&&equal(String(password),legacy);
}
