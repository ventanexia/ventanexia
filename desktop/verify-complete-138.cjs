'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const master=read('renderer/master.js');
const home=read('renderer/agent-home.js');
const html=read('renderer/index.html');
const app=read('renderer/app.js');
const main=read('main.cjs');
const backend=read('master.cjs');
const web=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function need(src,re,msg){if(!re.test(src)){console.error('COMPLETE_138_VERIFY_FAIL:',msg);process.exit(1)}}
function forbid(src,re,msg){if(re.test(src)){console.error('COMPLETE_138_VERIFY_FAIL:',msg);process.exit(1)}}

// Agent home/navigation: querySelector must never be treated as a list.
forbid(home,/(?<!\$)\$\([^\n;]*?\)\.forEach/,'agent-home still uses single-element selector as a list');
need(home,/title:'Agente de Stock y Compras'/,'Stock y compras needs its dedicated agent screen');
need(home,/title:'Agente de Redes Sociales'/,'Redes sociales needs its dedicated agent screen');
need(home,/title:'Agente de Informes'/,'Informes needs its dedicated agent screen');
need(home,/agentKeyForRequest/,'top command bar must route natural-language requests to the right agent');
need(home,/email\|emails\|correo\|correos\|gmail/,'top command bar must recognize email requests');
need(home,/stock\|inventario\|existencias\|compras/,'top command bar must recognize stock/purchase requests');
need(home,/redes\|instagram\|facebook\|linkedin/,'top command bar must recognize social requests');
need(home,/window\.vnx\.listConnections\(\)/,'Tu empresa dropdown must read real connections');
need(home,/window\.vnx\.listPortals\(\)/,'Tu empresa dropdown must include connected private portals');
need(home,/selectHomeSourceInWorkbench/,'selected company/source must be handed to the workbench');
need(html,/id="vnxAhBrandBlock"/,'Captación must expose a separate brand field');
need(html,/id="vnxAhBrandInput"/,'brand input missing');
need(home,/Marca o marcas indicadas/,'brands must be passed to the working agent without invention');

// Branding/version/window behavior.
need(html,/assets\/ventanexia-logo-real\.svg/,'official logo must be visible in desktop');
need(html,/data-brand-app-version/,'version must be visible beside VentaNexIA');
need(app,/data-brand-app-version/,'brand version must be populated from app.getVersion');
forbid(main,/workbenchWindow\.maximize\(\)/,'Carla popup must not force maximize; native maximize remains available');

// Reports/finance selector regression that broke the first 0.6.138 build.
need(master,/\$\$m\('\[data-guided-field\]'\)\.forEach\(el=>el\.addEventListener\('input',\(\)=>guidedRead\('reports'\)\)\)/,'Reports fields must use the list selector helper');
forbid(master,/(?<!\$)\$m\([^\n;]*?\)\.forEach/,'master.js still uses querySelector helper as a list');

// Gmail: one-click mark-all-read must mutate Gmail and verify completion.
need(master,/data-email-mark-all-read/,'email dashboard must show Mark all as read');
need(backend,/email:mark-all-read/,'backend mark-all-read handler missing');
need(backend,/messages\/batchModify/,'Gmail mark-all-read must use Gmail write API');
need(backend,/in:inbox is:unread/,'Gmail unread state must be rechecked after the bulk mutation');

// Stock: complete catalog, real manufacturer/EAN, ordered by manufacturer, no invention.
need(backend,/PORTAL_REPLENISHMENT_MAX_PAGES=120/,'private portal full catalog scan limit missing');
need(backend,/fullCollection:true/,'stock scan must request the complete collection');
need(backend,/catalog_scan_incomplete/,'partial catalog must fail closed');
need(backend,/manufacturer:\['fabricante','marca','laboratorio'/,'manufacturer must come from real source columns');
need(master,/\| Fabricante \| SKU \| EAN \| Producto \|/,'stock/purchase tables must expose manufacturer SKU and EAN separately');
need(master,/stockManufacturerSort/,'stock output must be sorted by manufacturer');
need(master,/VentaNexIA no los deduce ni los inventa/,'stock UI must explicitly avoid invented manufacturer/EAN');

// Protected finance/reporting.
need(backend,/FINANCE_PIN_ITERATIONS=210000/,'protected finance PIN hashing missing');
need(backend,/unitProfit=sale-purchase/,'profit calculation must be deterministic');
need(backend,/finance:startup-check/,'persistent negative margin check missing');
need(backend,/finance:send-alert/,'responsible-person alert handoff missing');
need(web,/Rentabilidad, márgenes y alertas/,'website FAQ must explain protected profitability');
need(web,/margen negativo crea una alerta roja persistente/,'website Carla must explain negative-margin alert behavior');

console.log('COMPLETE_138_VERIFY_OK');
