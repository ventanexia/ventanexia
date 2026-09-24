'use strict';
const fs=require('node:fs'),path=require('node:path');

const EXPECTED_AGENTS=['email','orders','web_ecommerce','crm','prospecting','content','social','campaigns','administration','agenda','reports','automation'];
const CRITICAL_PRELOAD=[
  'listConnections','ordersReview','ordersExportReady','shopifyReplenishmentSummary','portalReplenishmentSummary',
  'erpStatus','erpReplenishmentSummary','stockImportFile','exportData','businessList','businessSaveAll','businessSetActive',
  'emailMetrics','emailInbox','agendaToday','agendaUpcoming','financeReport','supportHealth','supportAutoRepair'
];
const RUNTIME_FILES=[
  'main.cjs','master.cjs','master-entry.cjs','preload.cjs','erp.cjs','orders.cjs','export.cjs',
  'renderer/index.html','renderer/app.js','renderer/master.js','renderer/agent-home.js','renderer/business-onboarding.js'
];

function read(base,rel){return fs.readFileSync(path.join(base,rel),'utf8')}
function staticRuntimeChecks(base=__dirname){
  const checks=[];
  const add=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail:String(detail||'').slice(0,500)});
  for(const rel of RUNTIME_FILES){
    try{const st=fs.statSync(path.join(base,rel));add('Archivo interno · '+rel,st.isFile(),'Disponible')}
    catch(e){add('Archivo interno · '+rel,false,'Falta o no se puede leer')}
  }
  let html='',home='',preload='',mains='',business='';
  try{
    html=read(base,'renderer/index.html');home=read(base,'renderer/agent-home.js');preload=read(base,'preload.cjs');business=read(base,'renderer/business-onboarding.js');
    mains=['main.cjs','master.cjs','master-entry.cjs','portal-adaptive.cjs','portal-pagination-fix.cjs','export.cjs'].map(x=>read(base,x)).join('\n');
  }catch{return checks}
  const menu=[...html.matchAll(/data-agent-home="([^"]+)"/g)].map(m=>m[1]);
  const missingAgents=EXPECTED_AGENTS.filter(x=>!menu.includes(x)||!new RegExp('\\n\\s{4}'+x+':\\{').test(home));
  add('Menús y módulos',missingAgents.length===0&&menu.length===EXPECTED_AGENTS.length,missingAgents.length?'Faltan: '+missingAgents.join(', '):EXPECTED_AGENTS.length+' módulos visibles y configurados');
  const exposed=new Set([...preload.matchAll(/\n\s*([A-Za-z0-9_]+):/g)].map(m=>m[1]));
  const missingBridge=CRITICAL_PRELOAD.filter(x=>!exposed.has(x));
  add('Bridge seguro de funciones',missingBridge.length===0,missingBridge.length?'Faltan: '+missingBridge.join(', '):CRITICAL_PRELOAD.length+' funciones críticas disponibles');
  const invokes=[...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m=>m[1]);
  const handlers=new Set([...mains.matchAll(/ipcMain\.(?:handle|on)\('([^']+)'/g)].map(m=>m[1]));
  const orphan=invokes.filter(x=>!handlers.has(x));
  add('Canales internos',orphan.length===0,orphan.length?'Sin handler: '+orphan.join(', '):new Set(invokes).size+' canales enlazados');
  const regs=[];
  for(const rel of ['main.cjs','master.cjs','master-entry.cjs','portal-adaptive.cjs','portal-pagination-fix.cjs','export.cjs']){
    const src=read(base,rel);
    for(const m of src.matchAll(/ipcMain\.handle\(\s*['"]([^'"]+)['"]/g))regs.push({channel:m[1],rel});
  }
  const groups=new Map();
  for(const x of regs){if(!groups.has(x.channel))groups.set(x.channel,[]);groups.get(x.channel).push(x.rel)}
  const duplicates=[...groups.entries()].filter(([ch,where])=>where.length>1&&ch!=='chat:send');
  add('Registro único de comandos',duplicates.length===0,duplicates.length?duplicates.map(x=>x[0]+' ('+x[1].join(', ')+')').join(' · '):'Sin duplicados no autorizados');
  const bizOk=business.includes('data-biz-index="'+String.fromCharCode(39)+'+i+'+String.fromCharCode(39)+'">')
    &&!business.includes('data-biz-index="'+String.fromCharCode(39)+'+i+'+String.fromCharCode(39)+'>');
  add('Perfiles de empresa',bizOk,bizOk?'Captura de formularios correcta':'Markup de perfiles incoherente');
  const exportOk=home.includes('data-home-stock-export="excel"')&&home.includes('data-home-stock-export="csv"')&&home.includes('data-home-stock-export="pdf"')&&home.includes('visibleRows=null');
  add('Exportación Stock y Compras',exportOk,exportOk?'Excel, CSV y PDF sobre la vista actual':'Exportación incompleta');
  const erpOk=preload.includes('erpStatus:')&&preload.includes('erpReplenishmentSummary:')&&read(base,'master.cjs').includes("ipcMain.handle('erp:replenishment-summary'");
  add('Stock desde ERP',erpOk,erpOk?'Bridge y backend disponibles':'Integración ERP incompleta');
  return checks;
}

function sanitizeState(state){
  const s=state&&typeof state==='object'?state:{};
  const actions=[];let changed=false;
  const set=(msg)=>{changed=true;actions.push(msg)};
  if(!s.permissions||typeof s.permissions!=='object'){s.permissions={folders:[]};set('Se reconstruyó la configuración de permisos.')}
  if(!Array.isArray(s.permissions.folders)){s.permissions.folders=[];set('Se reparó la lista de carpetas autorizadas.')}
  if(!Array.isArray(s.activity)){s.activity=[];set('Se reparó el historial local de actividad.')}
  if(!s.license||typeof s.license!=='object'){s.license={};set('Se reconstruyó el estado local de licencia.')}
  if(!s.secret||typeof s.secret!=='object'){s.secret={};set('Se reconstruyó el almacén local protegido.')}
  if(!s.secret.integrations||typeof s.secret.integrations!=='object'||Array.isArray(s.secret.integrations)){s.secret.integrations={};set('Se reparó el índice de conexiones.')}
  if(!Array.isArray(s.portals)){s.portals=[];set('Se reparó el índice de portales privados.')}
  else{
    const clean=s.portals.filter(x=>x&&typeof x==='object'&&x.id&&x.url);
    if(clean.length!==s.portals.length){s.portals=clean;set('Se retiraron entradas de portal incompletas.')}
  }
  if(!Array.isArray(s.secret.businessProfiles)){s.secret.businessProfiles=[];set('Se reparó el índice de perfiles de empresa.')}
  else{
    for(const p of s.secret.businessProfiles){
      if(!p||typeof p!=='object')continue;
      if(!Array.isArray(p.connectionRefs)){p.connectionRefs=[];set('Se repararon asociaciones de conexiones de un perfil de empresa.')}
    }
    const ids=new Set(s.secret.businessProfiles.filter(Boolean).map(x=>x.id).filter(Boolean));
    if(s.secret.activeBusinessProfileId&&!ids.has(s.secret.activeBusinessProfileId)){
      s.secret.activeBusinessProfileId=s.secret.businessProfiles.find(x=>x&&x.id)?.id||null;
      set('Se corrigió la empresa activa porque apuntaba a un perfil inexistente.');
    }
  }
  const cache=s.secret.purchaseAnalyses;
  if(cache!==undefined&&(cache===null||typeof cache!=='object'||Array.isArray(cache))){
    s.secret.purchaseAnalyses={};set('Se reconstruyó la caché de análisis de compras.');
  }else if(cache&&typeof cache==='object'){
    const valid=Object.entries(cache).filter(([,v])=>v&&typeof v==='object'&&typeof v.scopeKey==='string'&&v.purchaseData&&Array.isArray(v.purchaseData.headers)&&Array.isArray(v.purchaseData.rows));
    valid.sort((a,b)=>String(b[1].savedAt||'').localeCompare(String(a[1].savedAt||'')));
    const trimmed=Object.fromEntries(valid.slice(0,20));
    if(Object.keys(trimmed).length!==Object.keys(cache).length){s.secret.purchaseAnalyses=trimmed;set('Se limpiaron análisis de compras antiguos o dañados.')}
  }
  if(s.secret.ordersErp!==undefined&&(s.secret.ordersErp===null||typeof s.secret.ordersErp!=='object'||Array.isArray(s.secret.ordersErp))){
    s.secret.ordersErp={};set('Se reconstruyó la configuración local del programa de gestión.');
  }
  if(!s.support||typeof s.support!=='object'){s.support={};set('Se reconstruyó la configuración de asistencia automática.')}
  return {state:s,changed,actions};
}

module.exports={EXPECTED_AGENTS,CRITICAL_PRELOAD,staticRuntimeChecks,sanitizeState};
