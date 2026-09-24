'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const master=read('master.cjs');
const preload=read('preload.cjs');
const orders=read('orders.cjs');
const home=read('renderer/agent-home.js');
const html=read('renderer/index.html');
function need(src,re,msg){if(!re.test(src)){console.error('VERIFY_140_FAIL:',msg);process.exit(1)}}
function forbid(src,re,msg){if(re.test(src)){console.error('VERIFY_140_FAIL:',msg);process.exit(1)}}

// Stock policy per company.
need(master,/const SHOPIFY_TARGET_COVER_DAYS=25/,'default coverage must be 25 days');
need(master,/const STOCK_NO_HISTORY_DEFAULT_MIN=0/,'no-history default must be review, not invented stock');
need(master,/normalizeStockPolicy/,'stock policy normalizer missing');
need(master,/noHistoryMin:policy\.noHistoryMin/,'stock summaries must return no-history minimum');
need(preload,/shopifyReplenishmentSummary:[\s\S]*targetDays:options\?\.targetDays[\s\S]*noHistoryMin:options\?\.noHistoryMin/,'renderer must pass Shopify stock policy');
need(preload,/portalReplenishmentSummary:[\s\S]*targetDays:options\?\.targetDays[\s\S]*noHistoryMin:options\?\.noHistoryMin/,'renderer must pass portal stock policy');
need(html,/id="vnxAhTargetDays"/,'coverage-days control missing');
need(html,/id="vnxAhNoHistoryMin"/,'no-history minimum control missing');
need(home,/saveStockPolicyForSource/,'stock policy must be saved by company/source');
need(home,/id:\s*String\(x\.id\|\|x\.key\|\|x\.shop/,'real connection identity must be preserved');
need(home,/runStockAnalysis\(false\)/,'Analyze must execute direct stock analysis');
need(home,/runStockAnalysis\(true\)/,'Generate order must execute direct purchase calculation');
need(html,/id="vnxAhGenerateOrder"/,'Generate order button missing');
need(home,/Empresa \/ conexión a analizar|vnxAhStockSourceSelect/,'direct stock source selector missing');

// Real sales history.
need(master,/fecha venta|fecha pedido|fecha albaran/,'private portal sales date columns missing');
need(master,/unidades vendidas|cantidad servida/,'private portal sales quantity columns missing');
need(master,/rowsInWindow/,'six-month sales window metadata missing');
need(master,/soldWindow:sold/,'sold units must be exposed per SKU/EAN');
need(master,/noSalesData:\!skuHit&&\!eanHit&&\!nameHit/,'no-history must be distinguished from zero units after SKU, EAN and exact-name matching');

// Orders: direct review path.
need(orders,/async function reviewOrders/,'direct incoming-order snapshot missing');
need(master,/orders=require\('\.\/orders\.cjs'\)/,'orders engine not loaded by master');
need(master,/ipcMain\.handle\('orders:review'/,'orders review IPC missing');
need(master,/orders\.handleChat\(question\)/,'orders agent must route through real orders engine');
need(master,/orders\.startScheduler\(\)/,'orders scheduler must start');
need(preload,/ordersReview:\(payload=\{\}\)=>ipcRenderer\.invoke\('orders:review'/,'orders review not exposed to renderer');
need(home,/runOrdersReview/,'Orders Review button must run direct data path');
need(home,/PEDIDOS RECIBIDOS/,'orders result table missing');
need(home,/sourceSubject/,'orders result must show real source subject');

// Captación: sector/client type must be free text and remembered per company.
need(home,/Tipo de cliente \/ sector objetivo/,'free-text target segment field missing');
need(home,/type:'text',placeholder:'Ej\.: hospitales, clínicas, geriátricos, farmacias, herbolarios…'/,'target segment example missing');
need(home,/PROSPECT_PROFILE_KEY/,'prospecting profile persistence missing');
need(home,/saveProspectProfileForSource/,'target segments must be saved per company');
need(home,/Respeta estos segmentos y no los sustituyas por sectores genéricos/,'captation prompt must honor user segments');
forbid(home,/\['Sector',\['Todos','Farmacias','Clínicas','Distribuidores'\]\]/,'closed generic Sector dropdown must be removed');

console.log('VERIFY_140_OK');
