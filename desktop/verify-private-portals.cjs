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
const hidden=styles.lastIndexOf('.vnx-carla-window #chatSourceHint{display:none!important}');
const restoredBlock=styles.match(/\.vnx-carla-window:not\(:has\(\.email-dashboard-mode\)\) #chatSourceHint\{[\s\S]*?display:block!important;[\s\S]*?\}/);
if(!restoredBlock){console.error('PRIVATE_PORTAL_VERIFY_FAIL: restored Carla source hint visibility rule missing');process.exit(1)}
const restored=styles.indexOf(restoredBlock[0]);
if(restored<hidden){console.error('PRIVATE_PORTAL_VERIFY_FAIL: Carla source isolation hint restore must come after legacy hide rule');process.exit(1)}
console.log('PRIVATE_PORTAL_VERIFY_OK');
