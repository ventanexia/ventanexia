import crypto from "node:crypto";

function secret(){
  const s=String(process.env.TRIAL_SIGNING_SECRET||"");
  if(s.length<32) throw new Error("TRIAL_SIGNING_SECRET_NOT_CONFIGURED");
  return s;
}
function b64(v){return Buffer.from(v).toString("base64url")}
function signPart(payload){return crypto.createHmac("sha256",secret()).update(payload).digest("base64url")}
function emailHash(email){return crypto.createHash("sha256").update(String(email||"").trim().toLowerCase()).digest("hex")}
export function issueTrialToken({solutionId,email,ttlMs=24*60*60*1000}){
  const payload=b64(JSON.stringify({sid:String(solutionId),eh:emailHash(email),exp:Date.now()+ttlMs,v:1}));
  return `${payload}.${signPart(payload)}`;
}
export function verifyTrialToken(token,{solutionId,email}){
  try{
    const [payload,sig]=String(token||"").split(".");
    if(!payload||!sig) return {ok:false,reason:"TOKEN_MISSING"};
    const expected=signPart(payload);
    if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return {ok:false,reason:"TOKEN_INVALID"};
    const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if(data.v!==1||Date.now()>Number(data.exp||0)) return {ok:false,reason:"TOKEN_EXPIRED"};
    if(String(data.sid)!==String(solutionId)) return {ok:false,reason:"TOKEN_SCOPE"};
    if(String(data.eh)!==emailHash(email)) return {ok:false,reason:"TOKEN_IDENTITY"};
    return {ok:true,data};
  }catch{return {ok:false,reason:"TOKEN_INVALID"}}
}
