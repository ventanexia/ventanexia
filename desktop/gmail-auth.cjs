'use strict';
const {app}=require('electron');
const {readState,updateState}=require('./state-store.cjs');

const CLOUD='https://www.ventanexia.es';
const SAFETY_MS=2*60*1000;
const inflight=new Map();

function accountKey(x){return String(x?.meta?.email||x?.label||x?.account||x?.username||'').trim().toLowerCase()}
function expiryMs(x){const secs=Number(x?.tokenExpiresIn||3600);const from=Number(x?.tokenObtainedAt)||Date.parse(x?.connectedAt||'')||0;return from?from+secs*1000:0}
function expired(x,now=Date.now()){const e=expiryMs(x);return Boolean(e)&&now>=e-SAFETY_MS}
function fail(message,code){const e=new Error(message);e.code=code;return e}

async function persist(key,patch){
  await updateState(s=>{
    const apply=e=>{if(e&&e.provider==='gmail'&&accountKey(e)===key)Object.assign(e,patch)};
    for(const e of s.secret?.emailAccounts||[])apply(e);
    apply(s.secret?.integrations?.email);
    return s;
  });
}

async function refreshGmailToken(integration,{failedToken=null}={}){
  const key=accountKey(integration);
  if(failedToken&&integration.token&&integration.token!==failedToken)return integration.token;
  if(inflight.has(key))return inflight.get(key);
  const run=(async()=>{
    const rt=String(integration.refreshToken||'').trim();
    if(!rt)throw fail('El acceso de Gmail ha caducado y esta conexión no se puede renovar sola. Vuelve a conectar la cuenta en Conexiones.','REAUTH_REQUIRED');
    const st=await readState();
    const {customerId,activationCode,deviceKey}=st.secret||{};
    if(!customerId||!activationCode||!deviceKey)throw fail('El acceso de Gmail ha caducado. Activa la licencia de este equipo para que pueda renovarse.','LICENSE_REQUIRED');
    let r,j={};
    try{
      r=await fetch(CLOUD+'/api/oauth-refresh',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'VentaNexIA-Desktop/'+app.getVersion()},body:JSON.stringify({provider:'gmail',refreshToken:rt,customerId,activationCode,deviceKey})});
      j=await r.json().catch(()=>({}));
    }catch{throw fail('No se pudo renovar el acceso de Gmail: sin conexión con el servidor de VentaNexIA.','REFRESH_OFFLINE')}
    if(!r.ok||!j.access_token){
      if(j.code==='REFRESH_TOKEN_REVOKED')throw fail('Google ha revocado el acceso de esta cuenta. Vuelve a conectarla en Conexiones.','REAUTH_REQUIRED');
      throw fail(String(j.error||('No se pudo renovar el acceso de Gmail (error '+r.status+').')),j.code||'REFRESH_FAILED');
    }
    const patch={token:j.access_token,tokenObtainedAt:Date.now(),tokenExpiresIn:Number(j.expires_in||3600)};
    Object.assign(integration,patch);
    await persist(key,patch);
    return j.access_token;
  })().finally(()=>inflight.delete(key));
  inflight.set(key,run);
  return run;
}

async function gmailCall(integration,fn){
  let token=String(integration?.token||'').trim();
  if(integration?.refreshToken&&(!token||expired(integration)))token=await refreshGmailToken(integration);
  if(!token)throw fail('La conexión de Gmail no tiene un acceso válido. Vuelve a conectarla.','REAUTH_REQUIRED');
  try{return await fn(token)}
  catch(e){
    if(e?.status!==401)throw e;
    if(!integration.refreshToken)throw fail('Gmail ya no acepta el acceso. Vuelve a conectar la cuenta en Conexiones.','REAUTH_REQUIRED');
    const fresh=await refreshGmailToken(integration,{failedToken:token});
    return fn(fresh);
  }
}

module.exports={accountKey,expired,expiryMs,refreshGmailToken,gmailCall};
