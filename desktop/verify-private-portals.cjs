'use strict';
const fs=require('node:fs');
const js=fs.readFileSync(require('node:path').join(__dirname,'renderer','master.js'),'utf8');
function need(re,msg){if(!re.test(js)){console.error('PRIVATE_PORTAL_VERIFY_FAIL:',msg);process.exit(1)}}
need(/async function refreshRuntimeConnections\(\)[\s\S]*listPortals\(\)/,'refreshRuntimeConnections must refresh private portals');
need(/async function renderMasterPortals\(\)[\s\S]*listPortals\(\)[\s\S]*if\(!root\)return masterPortals/,'portal state must load even when Connections UI is absent');
need(/if\(key==='core_ai'\|\|key==='web_ecommerce'\|\|key==='orders'\)[\s\S]*module:'portal'/,'Carla/Web/Pedidos must expose connected private portals as sources');
need(/src\.module==='portal'\|\|src\.type==='portal'/,'selected private portal must route through strict source isolation');
console.log('PRIVATE_PORTAL_VERIFY_OK');
