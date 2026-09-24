'use strict';
const fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const html=read('renderer/index.html');
const app=read('renderer/app.js');
const home=read('renderer/agent-home.js');
const masterUi=read('renderer/master.js');
const business=read('renderer/business-onboarding.js');
const preload=read('preload.cjs');
const backend=read('master.cjs');
const main=read('main.cjs');
const entry=read('master-entry.cjs');
const exporter=read('export.cjs');
const erp=read('erp.cjs');
const errors=[];
const ok=(v,msg)=>{if(!v)errors.push(msg)};

const expectedAgents=['email','orders','web_ecommerce','crm','prospecting','content','social','campaigns','administration','agenda','reports','automation'];
const menuAgents=[...html.matchAll(/data-agent-home="([^"]+)"/g)].map(m=>m[1]);
for(const key of expectedAgents){
  ok(menuAgents.filter(x=>x===key).length===1,'Menú lateral: '+key+' debe aparecer exactamente una vez');
  ok(new RegExp('\\n\\s{4}'+key+':\\{').test(home),'Workspace: falta configuración para '+key);
}
ok(menuAgents.length===expectedAgents.length,'Menú lateral: número inesperado de accesos ('+menuAgents.length+')');
ok(app.includes("[data-agent-home]"),'Navegación delegada de agentes ausente');
ok(home.includes("window.vnxAgentHome={open:"),'API de apertura de workspaces ausente');

const tabs=[...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]);
const tabJumps=[...html.matchAll(/data-tab-jump="([^"]+)"/g)].map(m=>m[1]);
for(const id of [...tabs,...tabJumps])ok(html.includes('id="'+id+'"'),'Navegación apunta a panel inexistente: '+id);

const requiredUiIds=[
  'vnxAhSearchBtn','vnxAhPrimary','vnxAhCompanyBtn','vnxAhPreviewActions','vnxAhFilters','vnxAhSwitches',
  'vnxAhStockSourceSelect','vnxAhSalesWindowDays','vnxAhTargetDays','vnxAhNoHistoryMin','vnxAhUrgentDays',
  'chatConnectionSelect','chatSourceSelect'
];
for(const id of requiredUiIds)ok(html.includes('id="'+id+'"'),'Elemento crítico de UI ausente: #'+id);

ok(home.includes("const previewActions=$$('#vnxAhPreviewActions button')"),'Los botones de acciones de vista previa no se tratan como lista');
ok(home.includes("const previewButtons=$$('#vnxAhPreviewActions button')"),'Los botones de exportación de vista previa no se tratan como lista');
ok(home.includes("const switches=$$('#vnxAhSwitches label span')"),'Los controles de ejecución no se tratan como lista');
ok(!/const preview(?:Actions|Buttons)=\$\('#vnxAhPreviewActions button'\)/.test(home),'Regresión: querySelector único usado para varias acciones');
ok(home.includes('data-home-stock-export="excel"')&&home.includes('data-home-stock-export="csv"')&&home.includes('data-home-stock-export="pdf"'),'Stock y Compras debe ofrecer Excel, CSV y PDF');
ok(home.includes('visibleRows=null')&&home.includes('lastStockView={summary,rows:[...rows]'),'La exportación de stock debe usar las filas visibles/filtradas');
ok(home.includes('data-home-stock-retry')&&home.includes('data-home-stock-continue'),'Histórico no verificado debe permitir reintentar o seguir solo con stock');
ok(home.includes("src.module==='erp'||src.type==='erp'"),'Stock y Compras no reconoce ERP como fuente');
ok(preload.includes('erpStatus:')&&preload.includes('erpReplenishmentSummary:'),'Bridge ERP de Stock y Compras incompleto');
ok(backend.includes("ipcMain.handle('erp:replenishment-summary'"),'Handler ERP de reposición ausente');
ok(/holded:[\s\S]*salesHistory:true/.test(erp)&&/odoo:[\s\S]*salesHistory:true/.test(erp),'Holded/Odoo deben declarar histórico de ventas');
ok(/async salesHistory\(\{windowDays=180\}=\{\}\)/.test(erp),'Conectores ERP sin implementación de histórico');

const requiredBridge=[
  'listConnections','ordersReview','ordersExportReady','shopifyReplenishmentSummary','portalReplenishmentSummary','erpStatus','erpReplenishmentSummary',
  'stockImportFile','exportData','businessList','businessSaveAll','businessSetActive','businessSuggestTargets',
  'emailMetrics','emailInbox','agendaToday','agendaUpcoming','financeReport','supportHealth','supportAutoRepair'
];
const exposed=new Set([...preload.matchAll(/\n\s*([A-Za-z0-9_]+):/g)].map(m=>m[1]));
for(const x of requiredBridge)ok(exposed.has(x),'Preload no expone función crítica: '+x);

const runtime=[main,backend,entry,read('portal-adaptive.cjs'),read('portal-pagination-fix.cjs'),exporter].join('\n');
const invokes=[...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(m=>m[1]);
const handlers=new Set([...runtime.matchAll(/ipcMain\.(?:handle|on)\('([^']+)'/g)].map(m=>m[1]));
for(const ch of invokes)ok(handlers.has(ch),'Bridge IPC sin handler: '+ch);

ok(business.includes('data-biz-index="'+String.fromCharCode(39)+'+i+'+String.fromCharCode(39)+'">'),'Onboarding: las tarjetas deben poder capturar sus campos');
ok(!business.includes('data-biz-index="'+String.fromCharCode(39)+'+i+'+String.fromCharCode(39)+'>'),'Onboarding: queda markup mal formado que pierde los nombres de empresa');

function extractFn(src,name){
  const start=src.indexOf('function '+name+'(');
  if(start<0)throw new Error('No se encuentra '+name);
  const paren=src.indexOf('(',start);let pd=0,quote=null,escape=false,close=-1;
  for(let i=paren;i<src.length;i++){
    const ch=src[i];
    if(quote){
      if(escape){escape=false;continue}
      if(ch==='\\'){escape=true;continue}
      if(ch===quote)quote=null;
      continue;
    }
    if(ch==="'"||ch==='"'||ch.charCodeAt(0)===96){quote=ch;continue}
    if(ch==='(')pd++;
    else if(ch===')'&&--pd===0){close=i;break}
  }
  if(close<0)throw new Error('Firma incompleta '+name);
  const brace=src.indexOf('{',close);let depth=0;quote=null;escape=false;
  for(let i=brace;i<src.length;i++){
    const ch=src[i];
    if(quote){
      if(escape){escape=false;continue}
      if(ch==='\\'){escape=true;continue}
      if(ch===quote)quote=null;
      continue;
    }
    if(ch==="'"||ch==='"'||ch.charCodeAt(0)===96){quote=ch;continue}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return src.slice(start,i+1);
  }
  throw new Error('Función incompleta '+name);
}
try{
  const code=[
    'const SHOPIFY_SALES_WINDOW_DAYS=180;',
    'const SHOPIFY_TARGET_COVER_DAYS=25;',
    'const STOCK_NO_HISTORY_DEFAULT_MIN=0;',
    extractFn(backend,'autoUrgentDays'),
    extractFn(backend,'normalizeStockPolicy'),
    extractFn(backend,'buildReplenishmentFromRows'),
    'globalThis.__run=buildReplenishmentFromRows;'
  ].join('\n');
  const box={};vm.createContext(box);vm.runInContext(code,box);
  const calc=box.__run;
  const a=calc([{sku:'A',title:'A',stock:10,soldWindow:180,noSalesData:false}],{windowDays:180,targetDays:25,noHistoryMin:0})[0];
  ok(a.avgDaily===1&&a.qty===15&&a.daysRemaining===10&&!a.urgent,'Prueba ficticia stock A: cálculo de cobertura/reposición incorrecto');
  const b=calc([{sku:'B',title:'B',stock:3,soldWindow:180,noSalesData:false}],{windowDays:180,targetDays:25,noHistoryMin:0})[0];
  ok(b.qty===22&&b.urgent===true,'Prueba ficticia stock B: urgencia/reposición incorrecta');
  const c=calc([{sku:'C',title:'C',stock:0,soldWindow:0,noSalesData:true}],{windowDays:180,targetDays:25,noHistoryMin:0})[0];
  ok(c.qty===0&&c.replenishmentBasis==='review','Prueba ficticia stock C: no debe inventar compra sin histórico');
  const d=calc([{sku:'D',title:'D',stock:0,soldWindow:0,noSalesData:true}],{windowDays:180,targetDays:25,noHistoryMin:2})[0];
  ok(d.qty===2&&d.replenishmentBasis==='minimum','Prueba ficticia stock D: mínimo configurado no respetado');
}catch(e){errors.push('No se pudo ejecutar el motor sintético de Stock/Compras: '+e.message)}

ok(masterUi.includes('function isPurchaseOrderRequest')&&masterUi.includes('function isStockListingRequest'),'Detección de intenciones Stock/Pedidos incompleta');
ok(masterUi.includes('purchasePanelHtml')&&masterUi.includes('stockInventoryTable'),'Renderizado de resultados de compras/stock incompleto');
ok(exporter.includes("payload.format==='csv'")&&exporter.includes("payload.format==='pdf'")&&exporter.includes(":'excel'")&&exporter.includes("if(format==='excel')")&&exporter.includes("xlsxBuffer(data)")&&exporter.includes("printToPDF"),'Motor de exportación no enruta Excel/CSV/PDF');
ok(main.includes("ipcMain.handle('support:auto-repair'"),'Autoreparación no disponible');
ok(main.includes('runHealthCheck'),'Chequeo de salud no disponible');

if(errors.length){
  console.error('\nRELEASE_READINESS_VERIFY_FAIL\n- '+errors.join('\n- '));
  process.exit(1);
}
console.log('RELEASE_READINESS_VERIFY_OK · '+expectedAgents.length+' menús de agentes · '+tabs.length+' pestañas · '+new Set(invokes).size+' canales IPC · 4 escenarios ficticios de Stock/Compras.');
