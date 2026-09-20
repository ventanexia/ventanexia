'use strict';
const {app}=require('electron');
const {readState,updateState}=require('./state-store.cjs');

const CLOUD='https://www.ventanexia.es';
const SAFETY_MS=2*60*1000;

function clean(v,n=1000){return String(v==null?'':v).trim().slice(0,n)}
function expiryMs(x){const secs=Number(x?.tokenExpiresIn||3600);const from=Number(x?.tokenObtainedAt)||Date.parse(x?.connectedAt||'')||0;return from?from+secs*1000:0}
function expired(x){const e=expiryMs(x);return Boolean(e)&&Date.now()>=e-SAFETY_MS}
function tzOffsetIso(d=new Date()){
  const off=-d.getTimezoneOffset(),sign=off>=0?'+':'-',h=String(Math.floor(Math.abs(off)/60)).padStart(2,'0'),m=String(Math.abs(off)%60).padStart(2,'0');
  return sign+h+':'+m;
}
function localDayBounds(day=new Date()){
  const a=new Date(day);a.setHours(0,0,0,0);
  const b=new Date(a);b.setDate(b.getDate()+1);
  return {start:a,end:b};
}
async function persistToken(provider,patch){
  await updateState(s=>{
    const x=s.secret?.integrations?.agenda;
    if(x&&x.provider===provider)Object.assign(x,patch);
    return s;
  });
}
async function refresh(integration){
  const rt=clean(integration?.refreshToken,4096);
  if(!rt)throw new Error('El acceso de la agenda ha caducado. Vuelve a conectar el calendario.');
  const s=await readState(),body={provider:integration.provider,refreshToken:rt,customerId:s.secret?.customerId||'',activationCode:s.secret?.activationCode||'',deviceKey:s.secret?.deviceKey||''};
  const r=await fetch(CLOUD+'/api/oauth-refresh',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'VentaNexIA-Desktop/'+app.getVersion()},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.access_token)throw new Error(j.error||'No se pudo renovar el acceso de la agenda.');
  const patch={token:j.access_token,tokenObtainedAt:Date.now(),tokenExpiresIn:Number(j.expires_in||3600)};
  Object.assign(integration,patch);await persistToken(integration.provider,patch);return j.access_token;
}
async function tokenFor(integration){
  let token=clean(integration?.token,4096);
  if(integration?.refreshToken&&(!token||expired(integration)))token=await refresh(integration);
  if(!token)throw new Error('La agenda no tiene un acceso válido. Vuelve a conectarla.');
  return token;
}
async function api(integration,url,opts={}){
  let token=await tokenFor(integration);
  const call=async t=>{
    const r=await fetch(url,{...opts,headers:{Accept:'application/json',Authorization:'Bearer '+t,...(opts.headers||{})}});
    const txt=await r.text();let j={};try{j=txt?JSON.parse(txt):{}}catch{j={raw:txt}}
    if(!r.ok){const e=new Error(j?.error?.message||j?.error_description||('Calendario respondió '+r.status));e.status=r.status;throw e}
    return j;
  };
  try{return await call(token)}catch(e){if(e.status!==401||!integration.refreshToken)throw e;token=await refresh(integration);return call(token)}
}
function googleEvent(x){
  const start=x.start?.dateTime||x.start?.date||'',end=x.end?.dateTime||x.end?.date||'';
  return {id:x.id||'',provider:'google_calendar',title:x.summary||'(sin título)',start,end,allDay:Boolean(x.start?.date&&!x.start?.dateTime),location:x.location||'',meetingUrl:x.hangoutLink||x.conferenceData?.entryPoints?.find(p=>p.entryPointType==='video')?.uri||'',attendees:(x.attendees||[]).map(a=>({name:a.displayName||'',email:a.email||'',status:a.responseStatus||''})).slice(0,30),organizer:x.organizer?.displayName||x.organizer?.email||'',status:x.status||'',description:clean(x.description,1500),htmlLink:x.htmlLink||''};
}
function microsoftDate(v={}){
  const d=String(v?.dateTime||'');if(!d)return '';
  if(/[zZ]$|[+-]\d\d:\d\d$/.test(d))return d;
  return String(v?.timeZone||'').toUpperCase()==='UTC'?d+'Z':d;
}
function microsoftEvent(x){
  return {id:x.id||'',provider:'microsoft_calendar',title:x.subject||'(sin título)',start:microsoftDate(x.start),end:microsoftDate(x.end),allDay:Boolean(x.isAllDay),location:x.location?.displayName||'',meetingUrl:x.onlineMeeting?.joinUrl||x.onlineMeetingUrl||'',attendees:(x.attendees||[]).map(a=>({name:a.emailAddress?.name||'',email:a.emailAddress?.address||'',status:a.status?.response||''})).slice(0,30),organizer:x.organizer?.emailAddress?.name||x.organizer?.emailAddress?.address||'',status:x.isCancelled?'cancelled':'confirmed',description:clean(String(x.bodyPreview||'').replace(/\s+/g,' '),1500),htmlLink:x.webLink||''};
}
async function listRange(integration,start,end){
  const p=integration?.provider;
  if(p==='google_calendar'){
    const q=new URLSearchParams({timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'100'});
    const j=await api(integration,'https://www.googleapis.com/calendar/v3/calendars/primary/events?'+q.toString());
    return (j.items||[]).filter(x=>x.status!=='cancelled').map(googleEvent);
  }
  if(p==='microsoft_calendar'){
    const q=new URLSearchParams({startDateTime:start.toISOString(),endDateTime:end.toISOString(),'$top':'100','$orderby':'start/dateTime'});
    const j=await api(integration,'https://graph.microsoft.com/v1.0/me/calendarView?'+q.toString(),{headers:{Prefer:'outlook.timezone="UTC"'}});
    return (j.value||[]).filter(x=>!x.isCancelled).map(microsoftEvent);
  }
  throw new Error('Proveedor de agenda no compatible.');
}
async function today(){
  const s=await readState(),integration=s.secret?.integrations?.agenda;
  if(!integration)return {connected:false,events:[],provider:null,label:null};
  const {start,end}=localDayBounds();
  const events=await listRange(integration,start,end);
  return {connected:true,provider:integration.provider,label:integration.label||'Agenda',date:start.toISOString().slice(0,10),timezoneOffset:tzOffsetIso(),events};
}
async function upcoming(minutes=180){
  const s=await readState(),integration=s.secret?.integrations?.agenda;
  if(!integration)return {connected:false,events:[]};
  const start=new Date(),end=new Date(start.getTime()+Math.max(15,Number(minutes||180))*60000);
  const events=await listRange(integration,start,end);
  return {connected:true,provider:integration.provider,label:integration.label||'Agenda',events};
}
module.exports={today,upcoming,listRange,localDayBounds};
