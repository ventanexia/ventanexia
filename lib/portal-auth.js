import crypto from "node:crypto";

function cfg(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key};
}
export async function pdb(path,options={}){
  const {url,key}=cfg();
  const r=await fetch(`${url}/rest/v1/${path}`,{
    ...options,
    headers:{
      "apikey":key,"Authorization":`Bearer ${key}`,
      "Content-Type":"application/json","Prefer":"return=representation",
      ...(options.headers||{})
    }
  });
  const txt=await r.text();let data=null;
  try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok) throw new Error(`SUPABASE_${r.status}`);
  return data;
}
function b64(v){return Buffer.from(v).toString("base64url")}
function parseCookies(req){
  return Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];
  }));
}
function sessionSecret(){
  const s=process.env.PORTAL_SESSION_SECRET||process.env.ADMIN_SESSION_SECRET;
  if(!s) throw new Error("PORTAL_SESSION_SECRET_NOT_CONFIGURED");
  return s;
}
export function hash(v){
  return crypto.createHmac("sha256",sessionSecret()).update(String(v)).digest("hex");
}
export function createPortalSession({tenantId,email,ttlMs=7*24*60*60*1000}){
  const payload=b64(JSON.stringify({tenantId,email,role:"client",exp:Date.now()+ttlMs}));
  const sig=crypto.createHmac("sha256",sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function readPortalSession(req){
  try{
    const token=parseCookies(req).vnx_portal;if(!token)return null;
    const [payload,sig]=token.split(".");if(!payload||!sig)return null;
    const expected=crypto.createHmac("sha256",sessionSecret()).update(payload).digest("base64url");
    if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if(data.role!=="client"||Date.now()>data.exp)return null;
    return data;
  }catch{return null}
}
export function setPortalCookie(res,token){
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  res.setHeader("Set-Cookie",`vnx_portal=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`);
}
export function clearPortalCookie(res){
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  res.setHeader("Set-Cookie",`vnx_portal=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}
