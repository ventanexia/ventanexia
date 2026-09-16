import crypto from "node:crypto";

function secret(){
  return String(process.env.CONTRACT_SIGNING_SECRET||process.env.AUTOMATION_WEBHOOK_SECRET||"").trim();
}
function b64url(v){return Buffer.from(v).toString("base64url")}
function unb64url(v){return Buffer.from(v,"base64url").toString("utf8")}
export function signContract(payload){
  const s=secret();
  if(!s) throw new Error("CONTRACT_SIGNING_NOT_CONFIGURED");
  const body=b64url(JSON.stringify(payload));
  const sig=crypto.createHmac("sha256",s).update(body).digest("base64url");
  return `${body}.${sig}`;
}
export function verifyContract(token,maxAgeMs=24*60*60*1000){
  const s=secret();
  if(!s||!token||!String(token).includes(".")) return null;
  const [body,sig]=String(token).split(".");
  const expected=crypto.createHmac("sha256",s).update(body).digest("base64url");
  const a=Buffer.from(sig||""); const b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) return null;
  try{
    const data=JSON.parse(unb64url(body));
    const ts=Date.parse(data.acceptedAt||"");
    if(!Number.isFinite(ts)||Date.now()-ts>maxAgeMs||ts-Date.now()>5*60*1000) return null;
    return data;
  }catch{return null}
}
