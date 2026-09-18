import crypto from "node:crypto";

export function sb(){
  const url=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return {url,key,headers:{"apikey":key,"Authorization":`Bearer ${key}`,"Content-Type":"application/json","Prefer":"return=representation"}};
}
export async function sbFetch(path,options={}){
  const c=sb();
  const r=await fetch(`${c.url}/rest/v1/${path}`,{...options,headers:{...c.headers,...(options.headers||{})}});
  const txt=await r.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok)throw new Error(`SUPABASE_${r.status}:${typeof data==="string"?data:JSON.stringify(data)}`);
  return data;
}
export function randState(){return crypto.randomBytes(32).toString("base64url")}
export function pkce(){
  const verifier=crypto.randomBytes(48).toString("base64url");
  const challenge=crypto.createHash("sha256").update(verifier).digest("base64url");
  return {verifier,challenge};
}
export function callbackUrl(provider){return `https://www.ventanexia.es/api/oauth-callback?provider=${encodeURIComponent(provider)}`}
export function connector(provider,extra={}){
  const p=String(provider||"").trim();
  if(p==="gmail")return {clientId:process.env.GOOGLE_OAUTH_CLIENT_ID,clientSecret:process.env.GOOGLE_OAUTH_CLIENT_SECRET,auth:"https://accounts.google.com/o/oauth2/v2/auth",token:"https://oauth2.googleapis.com/token",scope:"openid email https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send",extra:{access_type:"offline",prompt:"consent"}};
  if(p==="microsoft_365")return {clientId:process.env.MICROSOFT_OAUTH_CLIENT_ID,clientSecret:process.env.MICROSOFT_OAUTH_CLIENT_SECRET,auth:"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",token:"https://login.microsoftonline.com/common/oauth2/v2.0/token",scope:"openid offline_access User.Read Mail.ReadWrite Mail.Send"};
  if(p==="hubspot")return {clientId:process.env.HUBSPOT_CLIENT_ID,clientSecret:process.env.HUBSPOT_CLIENT_SECRET,auth:"https://app.hubspot.com/oauth/authorize",token:"https://api.hubapi.com/oauth/v1/token",scope:"oauth crm.objects.contacts.read crm.objects.contacts.write crm.objects.deals.read crm.objects.deals.write"};
  if(["instagram","facebook","whatsapp_business"].includes(p))return {clientId:process.env.META_APP_ID,clientSecret:process.env.META_APP_SECRET,auth:"https://www.facebook.com/v20.0/dialog/oauth",token:"https://graph.facebook.com/v20.0/oauth/access_token",scope:p==="whatsapp_business"?"business_management,whatsapp_business_management,whatsapp_business_messaging":"pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management"};
  if(p==="linkedin")return {clientId:process.env.LINKEDIN_CLIENT_ID,clientSecret:process.env.LINKEDIN_CLIENT_SECRET,auth:"https://www.linkedin.com/oauth/v2/authorization",token:"https://www.linkedin.com/oauth/v2/accessToken",scope:"openid profile email w_member_social"};
  if(p==="x_twitter")return {clientId:process.env.X_OAUTH_CLIENT_ID,clientSecret:process.env.X_OAUTH_CLIENT_SECRET,auth:"https://twitter.com/i/oauth2/authorize",token:"https://api.twitter.com/2/oauth2/token",scope:"tweet.read tweet.write users.read offline.access",pkce:true};
  if(p==="shopify"){
    const shop=String(extra.shop||"").trim().toLowerCase().replace(/^https?:\/\//,"").replace(/\/$/,"");
    if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))throw new Error("SHOPIFY_SHOP_REQUIRED");
    return {clientId:process.env.SHOPIFY_CLIENT_ID,clientSecret:process.env.SHOPIFY_CLIENT_SECRET,auth:`https://${shop}/admin/oauth/authorize`,token:`https://${shop}/admin/oauth/access_token`,scope:"read_products,write_products,read_orders,write_orders,read_customers,write_customers,read_inventory,write_inventory",shop};
  }
  throw new Error("UNSUPPORTED_PROVIDER");
}
export async function exchangeCode(cfg,{code,redirectUri,verifier}){
  const params=new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:redirectUri,client_id:cfg.clientId||""});
  if(cfg.clientSecret)params.set("client_secret",cfg.clientSecret);
  if(verifier)params.set("code_verifier",verifier);
  const r=await fetch(cfg.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","Accept":"application/json"},body:params});
  const txt=await r.text();let j={};try{j=JSON.parse(txt)}catch{j={raw:txt}}
  if(!r.ok||j.error)throw new Error(j.error_description||j.error||j.raw||`TOKEN_HTTP_${r.status}`);
  return j;
}
