import crypto from "node:crypto";
import {db} from "./entitlement.js";

const FREE_DOMAINS=new Set([
  "gmail.com","googlemail.com","hotmail.com","outlook.com","live.com","yahoo.com",
  "icloud.com","me.com","proton.me","protonmail.com","gmx.com","aol.com"
]);

function secret(){
  const s=process.env.TRIAL_ABUSE_SECRET;
  if(!s) throw new Error("TRIAL_ABUSE_SECRET_NOT_CONFIGURED");
  return s;
}
export function hmac(v){
  if(!v) return null;
  return crypto.createHmac("sha256",secret()).update(String(v).trim().toLowerCase()).digest("hex");
}
function networkPrefix(ip=""){
  ip=String(ip).trim();
  if(!ip) return "";
  // IPv4: /24-like prefix. IPv6: first 4 hextets.
  if(ip.includes(".")){
    const p=ip.split(".");
    return p.length===4?`${p[0]}.${p[1]}.${p[2]}.0/24`:ip;
  }
  if(ip.includes(":")) return ip.split(":").slice(0,4).join(":")+"::/64";
  return ip;
}
export function requestSignals(req,{email="",deviceId=""}={}){
  const forwarded=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim();
  const ip=forwarded||String(req.headers["x-real-ip"]||"").trim();
  const ua=String(req.headers["user-agent"]||"").slice(0,600);
  const domain=String(email).split("@")[1]?.toLowerCase()||"";
  return {
    emailHash:hmac(email),
    domainHash:domain?hmac(domain):null,
    deviceHash:deviceId?hmac(deviceId):null,
    networkHash:ip?hmac(networkPrefix(ip)):null,
    userAgentHash:ua?hmac(ua):null,
    domain,
    freeEmail:FREE_DOMAINS.has(domain)
  };
}
async function count(path){
  const rows=await db(path);
  return Array.isArray(rows)?rows.length:0;
}
export async function evaluateTrialRisk(signals){
  const now=Date.now();
  const d180=new Date(now-180*86400000).toISOString();
  const d90=new Date(now-90*86400000).toISOString();
  const d30=new Date(now-30*86400000).toISOString();
  const d1=new Date(now-86400000).toISOString();

  const [sameEmail,sameDevice,sameDomain,sameNetwork,recentNetworkAttempts]=await Promise.all([
    count(`vnx_trial_attempts?email_hash=eq.${signals.emailHash}&decision=eq.allow&created_at=gte.${encodeURIComponent(d180)}&select=id`),
    signals.deviceHash?count(`vnx_trial_attempts?device_hash=eq.${signals.deviceHash}&decision=eq.allow&created_at=gte.${encodeURIComponent(d180)}&select=id`):0,
    signals.domainHash?count(`vnx_trial_attempts?domain_hash=eq.${signals.domainHash}&decision=eq.allow&created_at=gte.${encodeURIComponent(d90)}&select=id`):0,
    signals.networkHash?count(`vnx_trial_attempts?network_hash=eq.${signals.networkHash}&decision=eq.allow&created_at=gte.${encodeURIComponent(d30)}&select=id`):0,
    signals.networkHash?count(`vnx_trial_attempts?network_hash=eq.${signals.networkHash}&created_at=gte.${encodeURIComponent(d1)}&select=id`):0
  ]);

  if(sameEmail>=1) return {decision:"deny",reason:"EMAIL_ALREADY_USED"};
  if(sameDevice>=1) return {decision:"deny",reason:"DEVICE_ALREADY_USED"};
  if(recentNetworkAttempts>=8) return {decision:"deny",reason:"TOO_MANY_ATTEMPTS"};
  // Allow normal offices/homes to have more than one user, but stop serial abuse.
  if(sameNetwork>=3) return {decision:"deny",reason:"NETWORK_TRIAL_LIMIT"};
  if(!signals.freeEmail && sameDomain>=3) return {decision:"review",reason:"COMPANY_DOMAIN_TRIAL_LIMIT"};
  // Free email + repeated network is more suspicious, but one legitimate attempt is allowed.
  if(signals.freeEmail && sameNetwork>=1) return {decision:"review",reason:"FREE_EMAIL_REPEATED_NETWORK"};
  return {decision:"allow",reason:"OK"};
}
export async function recordTrialAttempt({solutionRequestId=null,tenantId=null,signals,decision,reason}){
  await db("vnx_trial_attempts",{method:"POST",body:JSON.stringify([{
    solution_request_id:solutionRequestId||null,
    email_hash:signals.emailHash,
    domain_hash:signals.domainHash,
    device_hash:signals.deviceHash,
    network_hash:signals.networkHash,
    user_agent_hash:signals.userAgentHash,
    decision,reason,tenant_id:tenantId||null
  }])});
}
