'use strict';
const {app}=require('electron');
const {readState,updateState}=require('./state-store.cjs');

const CLOUD='https://www.ventanexia.es';
const SAFETY_MS=5*60*1000;
let inflight=null;

function fail(message,code,extra){const e=new Error(message);e.code=code;if(extra)e.data=extra;return e}
function expired(cfg,now=Date.now()){
  if(!cfg||cfg.authMode!=='client_credentials')return false;
  const e=Date.parse(cfg.expiresAt||'');
  return Number.isFinite(e)&&now>=e-SAFETY_MS;
}
function friendlyOwnedError(e,shop){
  const code=String(e?.code||e?.data?.code||'');
  if(code==='SHOPIFY_SHOP_NOT_FOUND'||code==='SHOPIFY_TOKEN_FAILED'){
    return fail('Shopify no reconoce la tienda «'+shop+'». Revisa que esté bien escrita. Si no recuerdas el dominio interno, escribe la dirección de tu web y VentaNexIA intentará localizarla.','SHOPIFY_SHOP_NOT_FOUND');
  }
  return e;
}
async function postJsonDefault(url,body,timeoutMs=20000){
  const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),timeoutMs);
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'VentaNexIA-Desktop/'+app.getVersion()},body:JSON.stringify(body||{}),signal:ac.signal});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(j.error||j.message||('Error '+r.status));e.code=j.code;e.data=j;throw e}
    return j;
  }catch(e){
    if(e?.name==='AbortError')throw fail('La conexión con el servidor ha tardado demasiado. Vuelve a intentarlo.','REQUEST_TIMEOUT');
    throw e;
  }finally{clearTimeout(timer)}
}
async function requestOwnedToken(shop,postJson=postJsonDefault){
  const st=await readState();
  const {customerId,activationCode,deviceKey}=st.secret||{};
  if(!customerId||!activationCode)throw fail('Activa primero la licencia de VentaNexIA','LICENSE_REQUIRED');
  let result;
  try{result=await postJson(CLOUD+'/api/shopify-own-connect',{shop,customerId,activationCode,deviceKey},20000)}
  catch(e){throw friendlyOwnedError(e,shop)}
  const token=String(result.accessToken||result.access_token||'').trim();
  if(!token)throw fail('El servidor conectó con Shopify pero no entregó el token a VentaNexIA.','SHOPIFY_TOKEN_MISSING_IN_RESPONSE',{tokenReceived:Boolean(result.tokenReceived),shop:result.shop||shop});
  return {token,expiresIn:Number(result.expiresIn||result.expires_in||86399),raw:result};
}
async function persist(patch){
  await updateState(s=>{const x=s.secret?.integrations?.shopify;if(x)Object.assign(x,patch);return s});
}
async function refreshShopifyToken(cfg,{failedToken=null,postJson=postJsonDefault}={}){
  if(cfg.authMode!=='client_credentials')throw fail('El acceso a Shopify ya no es válido. Vuelve a conectar la tienda en Conexiones.','REAUTH_REQUIRED');
  if(failedToken&&cfg.token&&cfg.token!==failedToken)return cfg.token;
  if(inflight)return inflight;
  inflight=(async()=>{
    const {token,expiresIn}=await requestOwnedToken(cfg.shop,postJson);
    const patch={token,expiresAt:new Date(Date.now()+expiresIn*1000).toISOString()};
    Object.assign(cfg,patch);await persist(patch);return token;
  })().finally(()=>{inflight=null});
  return inflight;
}
async function shopifyCall(cfg,fn){
  let token=String(cfg?.token||'').trim();
  if(cfg&&(!token||expired(cfg)))token=await refreshShopifyToken(cfg);
  try{return await fn(token)}
  catch(e){
    if(e?.status!==401||cfg?.authMode!=='client_credentials')throw e;
    const fresh=await refreshShopifyToken(cfg,{failedToken:token});
    return fn(fresh);
  }
}
module.exports={expired,requestOwnedToken,refreshShopifyToken,shopifyCall,friendlyOwnedError};
