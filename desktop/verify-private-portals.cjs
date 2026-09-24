'use strict';
const fs=require('node:fs');
const path=require('node:path');
const renderer=fs.readFileSync(path.join(__dirname,'renderer','master.js'),'utf8');
const backend=fs.readFileSync(path.join(__dirname,'master.cjs'),'utf8');
const styles=fs.readFileSync(path.join(__dirname,'renderer','styles.css'),'utf8');
function need(source,re,msg){if(!re.test(source)){console.error('PRIVATE_PORTAL_VERIFY_FAIL:',msg);process.exit(1)}}
need(renderer,/async function refreshRuntimeConnections\(\)[\s\S]*listPortals\(\)/,'refreshRuntimeConnections must refresh private portals');
need(renderer,/async function renderMasterPortals\(\)[\s\S]*listPortals\(\)[\s\S]*if\(!root\)return masterPortals/,'portal state must load even when Connections UI is absent');
need(renderer,/if\(key==='core_ai'\|\|key==='web_ecommerce'\|\|key==='orders'\)[\s\S]*module:'portal'/,'Carla/Web/Pedidos must expose connected private portals as sources');
need(backend,/scope\?\.selectedSources[\s\S]*scope\?\.selectedSource[\s\S]*src\?\.module==='portal'\|\|src\?\.type==='portal'/,'selected private portal must route through strict source isolation');
need(backend,/if\(!explicit\.length\)[\s\S]*hubContext/,'other connection metadata must stay out when an explicit source is selected');
need(backend,/const livePortalWindows=new Map\(\)/,'private portals must keep a live authenticated window registry');
need(backend,/function livePortalWindow\(id\)/,'live private portal window lookup must exist');
need(backend,/function registerLivePortalWindow\(portal,win\)/,'private portal windows must be registered');
need(backend,/event\.preventDefault\(\);[\s\S]*win\.hide\(\)/,'closing a private portal must hide it instead of destroying authenticated state');
need(backend,/async function readLivePortal\(portal\)/,'Carla must be able to read the live private portal view');
need(backend,/async function ensureLivePortalWindow\(portal,\{show=false,focus=false\}=\{\}\)/,'connected private portals must be rehydrated automatically after app restart');
need(backend,/portal\.lastStatus==='connected'&&portal\.lastUrl/,'portal rehydration must reuse the persisted authenticated location');
need(backend,/async function readPortal\(portal,question='',preferredUrl=null,existingWin=null\)/,'automatic navigation must be able to reuse the persistent live portal window');
need(backend,/const ownsWindow=!existingWin/,'reused live portal windows must not be destroyed by automatic navigation');
need(backend,/const docs=\[document\]/,'portal extraction must include same-origin iframe documents');
need(backend,/autoRehydrated/,'stock diagnostics must expose automatic portal rehydration');
need(backend,/portalOpened/,'failed automatic stock discovery must surface the real portal window directly');

need(backend,/const liveRead=await readLivePortal\(portal\)/,'stock analysis must inspect the live portal before hidden navigation');
need(backend,/usedLiveWindow/,'stock result must report when the live portal supplied the data');
need(backend,/\.ant-table,[\s\S]*\.el-table,[\s\S]*\.p-datatable,[\s\S]*\.k-grid/,'private portal reader must support common ERP grid frameworks');

const hidden=styles.lastIndexOf('.vnx-carla-window #chatSourceHint{display:none!important}');
const restoredBlock=styles.match(/\.vnx-carla-window:not\(:has\(\.email-dashboard-mode\)\) #chatSourceHint\{[\s\S]*?display:block!important;[\s\S]*?\}/);
if(!restoredBlock){console.error('PRIVATE_PORTAL_VERIFY_FAIL: restored Carla source hint visibility rule missing');process.exit(1)}
const restored=styles.indexOf(restoredBlock[0]);
if(restored<hidden){console.error('PRIVATE_PORTAL_VERIFY_FAIL: Carla source isolation hint restore must come after legacy hide rule');process.exit(1)}
console.log('PRIVATE_PORTAL_VERIFY_OK');
