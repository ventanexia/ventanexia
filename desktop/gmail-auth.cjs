'use strict';
const {app}=require('electron');
const crypto=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
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

// ---------------------------------------------------------------------------
// Control de cuota de Gmail
// Google limita cada usuario a 6.000 unidades por minuto (proyectos nuevos desde el 1-may-2026) y cada
// llamada cuesta unidades distintas: messages.get 20, threads.get 40, messages.list 5, labels.list 1...
// Sin control, abrir el panel de correo gastaba más de 6.000 unidades de golpe y Gmail respondía
// "Quota exceeded for quota metric 'Total Query Cost'...". Ahora TODAS las llamadas a Gmail pasan por aquí:
//   - cada cuenta tiene su propio presupuesto por minuto y un máximo de peticiones simultáneas;
//   - si Gmail aun así responde con límite de uso, se espera y se reintenta con espera exponencial;
//   - si sigue sin poder, el usuario recibe un mensaje claro (nunca el texto técnico de Google).
// Costes: https://developers.google.com/workspace/gmail/api/reference/quota (actualizado 2026-09-10).
// ------------------------------------------------------------------
const GMAIL_COSTS={
  'messages.list':5,'messages.get':20,'messages.modify':5,'messages.send':100,'messages.trash':20,'messages.untrash':5,
  'messages.batchModify':50,'threads.get':40,'threads.list':10,'threads.modify':10,'threads.trash':20,
  'drafts.create':10,'drafts.get':20,'drafts.list':5,'drafts.send':100,'drafts.update':15,'drafts.delete':10,
  'labels.list':1,'labels.get':1,'labels.create':5,'labels.update':5,'labels.delete':5,'getProfile':1,'history.list':2,'other':10
};
const GMAIL_BUDGET_PER_MIN=Number(process.env.VNX_GMAIL_BUDGET||4200); // margen bajo el límite oficial de 6.000
const GMAIL_MAX_CONCURRENT=6;
const GMAIL_MAX_RETRIES=4;
const gmailContext=new AsyncLocalStorage();
const gmailLimiters=new Map();
const sleepMs=ms=>new Promise(r=>setTimeout(r,ms));

function gmailMethodOf(method,pathAndQuery){
  const p=String(pathAndQuery||'').split('?')[0].replace(/^\/+/,'');
  const m=String(method||'GET').toUpperCase();
  if(/^threads\/[^/]+$/.test(p))return m==='GET'?'threads.get':(m==='DELETE'?'threads.delete':'threads.modify');
  if(/^threads\/[^/]+\/modify$/.test(p))return 'threads.modify';
  if(/^threads\/[^/]+\/trash$/.test(p))return 'threads.trash';
  if(p==='threads')return 'threads.list';
  if(p==='messages/send')return 'messages.send';
  if(/^messages\/[^/]+\/modify$/.test(p))return 'messages.modify';
  if(/^messages\/[^/]+\/trash$/.test(p))return 'messages.trash';
  if(/^messages\/[^/]+\/untrash$/.test(p))return 'messages.untrash';
  if(p==='messages')return 'messages.list';
  if(/^messages\/[^/]+$/.test(p))return 'messages.get';
  if(p==='drafts')return m==='GET'?'drafts.list':'drafts.create';
  if(p==='drafts/send')return 'drafts.send';
  if(/^drafts\/[^/]+$/.test(p))return m==='GET'?'drafts.get':(m==='DELETE'?'drafts.delete':'drafts.update');
  if(p==='labels')return m==='POST'?'labels.create':'labels.list';
  if(/^labels\/[^/]+$/.test(p))return m==='GET'?'labels.get':(m==='DELETE'?'labels.delete':'labels.update');
  if(p==='profile')return 'getProfile';
  if(p==='history')return 'history.list';
  return 'other';
}
function gmailCost(method,pathAndQuery){return GMAIL_COSTS[gmailMethodOf(method,pathAndQuery)]||GMAIL_COSTS.other}

function limiterFor(key){
  let l=gmailLimiters.get(key);
  if(l)return l;
  l={log:[],inflight:0,queue:[],pausedUntil:0,timer:null};
  gmailLimiters.set(key,l);
  return l;
}
function limiterUsed(l,now){
  l.log=l.log.filter(x=>now-x.t<60000);
  return l.log.reduce((s,x)=>s+x.c,0);
}
function pump(l){
  if(l.timer){clearTimeout(l.timer);l.timer=null}
  while(l.queue.length&&l.inflight<GMAIL_MAX_CONCURRENT){
    const now=Date.now();
    if(now<l.pausedUntil){l.timer=setTimeout(()=>pump(l),l.pausedUntil-now+20);return}
    const next=l.queue[0];
    const used=limiterUsed(l,now);
    if(used>0&&used+next.cost>GMAIL_BUDGET_PER_MIN){
      const oldest=l.log[0];
      l.timer=setTimeout(()=>pump(l),Math.max(50,oldest.t+60000-now+20));
      return;
    }
    l.queue.shift();
    l.log.push({t:now,c:next.cost});
    l.inflight++;
    Promise.resolve().then(next.run).then(next.resolve,next.reject).finally(()=>{l.inflight--;pump(l)});
  }
}
function scheduleGmail(key,cost,run){
  const l=limiterFor(key);
  return new Promise((resolve,reject)=>{l.queue.push({cost,run,resolve,reject});pump(l)});
}
function pauseGmail(key,ms){
  const l=limiterFor(key);
  l.pausedUntil=Math.max(l.pausedUntil,Date.now()+ms);
  // Gmail ya nos ha dicho que estamos al límite: contamos el minuto como gastado para no volver a chocar.
  l.log.push({t:Date.now(),c:Math.max(0,GMAIL_BUDGET_PER_MIN-limiterUsed(l,Date.now()))});
}

function isGmailQuotaText(text=''){
  return /quota exceeded|rate ?limit|too many (concurrent )?requests|user-rate limit|units per minute|total query cost|resource_exhausted/i.test(String(text||''));
}
function isGmailQuotaResponse(status,text=''){
  if(status===429)return true;
  return status===403&&isGmailQuotaText(text);
}
function retryWaitMs(response,text,attempt){
  const header=Number(response?.headers?.get?.('retry-after')||0);
  if(header>0)return Math.min(30000,Math.max(1000,header*1000));
  const m=String(text||'').match(/retry after\s+(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)/i);
  if(m){const ms=Date.parse(m[1])-Date.now();if(Number.isFinite(ms))return Math.min(30000,Math.max(1000,ms+500))}
  return Math.min(16000,1000*Math.pow(2,attempt-1))+Math.floor(Math.random()*700);
}
function gmailQuotaError(){
  const e=new Error('Gmail está limitando temporalmente las consultas de esta cuenta (límite de uso de Google). Espera un minuto y vuelve a intentarlo.');
  e.code='GMAIL_QUOTA';e.status=429;return e;
}
function tokenKey(headers){
  const auth=String(headers?.Authorization||headers?.authorization||'');
  return 'to:'+crypto.createHash('sha1').update(auth).digest('hex').slice(0,12);
}
// Sustituye a fetch() para cualquier llamada a Gmail: reparte el gasto y reintenta si Gmail pide esperar.
async function gmailFetch(url,opts={}){
  const u=String(url);
  const idx=u.indexOf('/users/me/');
  const pathAndQuery=idx>=0?u.slice(idx+'/users/me/'.length):'';
  const cost=gmailCost(opts.method||'GET',pathAndQuery);
  const key=(gmailContext.getStore()||{}).key||tokenKey(opts.headers);
  let attempt=0;
  for(;;){
    const r=await scheduleGmail(key,cost,()=>fetch(u,opts));
    if(r.status!==429&&r.status!==403)return r;
    const text=await r.clone().text().catch(()=>'');
    if(!isGmailQuotaResponse(r.status,text))return r;
    attempt++;
    if(attempt>GMAIL_MAX_RETRIES)return r;
    const wait=retryWaitMs(r,text,attempt);
    pauseGmail(key,wait);
    await sleepMs(wait);
  }
}
// Convierte cualquier error de cuota (raw de Google) en un mensaje claro para el usuario.
function friendlyGmailError(e){
  if(e&&e.code==='GMAIL_QUOTA')return e;
  if(e&&(e.status===429||((e.status===403||!e.status)&&isGmailQuotaText(e.message)))return gmailQuotaError();
  return e;
}

async function gmailCall(integration,fn){
  let token=String(integration?.token||'').trim();
  if(integration?.refreshToken&&(!token||expired(integration)))token=await refreshGmailToken(integration);
  if(!token)throw fail('La conexión de Gmail no tiene un acceso válido. Vuelve a conectarla.','REAUTH_REQUIRED');
  const ctx={key:'acct:'+(accountKey(integration)||tokenKey({Authorization:'Bearer '+token}))};
  try{
    try{return await gmailContext.run(ctx,()=>fn(token))}
    catch(e){
      if(e?.status!==401)throw e;
      if(!integration.refreshToken)throw fail('Gmail ya no acepta el acceso. Vuelve a conectar la cuenta en Conexiones.','REAUTH_REQUIRED');
      const fresh=await refreshGmailToken(integration,{failedToken:token});
      return await gmailContext.run(ctx,()=>fn(fresh));
    }
  }catch(e){throw friendlyGmailError(e)}
}

module.exports={accountKey,expired,expiryMs,refreshGmailToken,gmailCall,gmailFetch,gmailCost,gmailMethodOf,friendlyGmailError,isGmailQuotaText,isGmailQuotaResponse};
