'use strict';
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const entry=read('master-entry.cjs');
const master=read('master.cjs');
const adaptive=read('portal-adaptive.cjs');
const ui=read(path.join('renderer','master.js'));

function must(cond,msg){if(!cond){console.error('Central assistant verification failed: '+msg);process.exit(1)}}

must(entry.includes("String(scope?.key||'')==='core_ai'"),'missing core_ai router');
must(entry.includes("AGENTE Pedidos · estado de solo lectura"),'missing read-only Orders snapshot');
must(entry.includes("orders._get().store.load()"),'Orders must be read from store without executing a command');
must(!/core_ai[\s\S]{0,2500}orders\.handleChat\(/.test(entry),'central assistant must not execute Orders commands');
must(entry.includes("queryReadOnlyScope"),'missing read-only connector query');
must(master.includes("FUENTE INTERNA DE SOLO LECTURA"),'hub context is not marked as untrusted read-only data');
must(master.includes("collectGmailContextMaster(integration,question)"),'central assistant cannot read connected Gmail');
must(adaptive.includes("async function queryReadOnlyScope"),'read-only connector API is missing');
must(adaptive.includes("module.exports={calibratePortal,queryReadOnlyScope"),'read-only connector API is not exported');
must(ui.includes("Tu centro de mando:"),'UI does not explain central assistant');

console.log('VentaNexIA central assistant verification OK · cross-agent read-only hub enabled.');
