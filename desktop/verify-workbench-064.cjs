'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const html=read('renderer/index.html'),js=read('renderer/master.js'),css=read('renderer/styles.css');
const main=read('main.cjs'),entry=read('master-entry.cjs'),preload=read('preload.cjs'),policy=read('agent-policy.cjs'),external=read('external-agent.cjs');
const contract=fs.readFileSync(path.join(__dirname,'..','server','handlers','contract-accept.js'),'utf8');
const checkout=fs.readFileSync(path.join(__dirname,'..','server','handlers','create-checkout.js'),'utf8');
const webhook=fs.readFileSync(path.join(__dirname,'..','server','handlers','stripe-webhook.js'),'utf8');
const plans=fs.readFileSync(path.join(__dirname,'..','planes.html'),'utf8');

const checks=[
 ['expand button',html.includes('id="vnxExpandWorkbench"')&&js.includes('setWorkbenchExpanded')],
 ['four status counters',html.includes('vnxCountPending')&&html.includes('vnxCountReview')&&html.includes('vnxCountApproval')&&html.includes('vnxCountSolved')],
 ['shared multi-connection selector',html.includes('id="chatSourceSelect"')&&js.includes('Todas, separadas')&&js.includes('sendSeparatedBySources')],
 ['writes blocked in all-connections mode',js.includes('Para realizar una acción elige una conexión concreta')],
 ['guided mode respects source selector',js.includes('scope.needsSourceChoice')&&js.includes('scope.separateSources?await sendSeparatedBySources')],
 ['Secretary groups multiple connections',js.includes('NO mezcles sus datos: crea un bloque claramente titulado para cada conexión')],
 ['own-agent card and modal',html.includes('Mis agentes propios')&&js.includes('openOwnAgentManager')],
 ['own-agent secure runtime',external.includes("safeStorage?.isEncryptionAvailable")&&external.includes("u.protocol!=='https:'")],
 ['own-agent IPC',main.includes("external-agent:list")&&preload.includes('externalAgentSave')],
 ['own-agent chat route',entry.includes("type==='external_agent'")],
 ['connection limit policy',policy.includes('function connectionLimit')&&main.includes('assertConnectionCapacity')],
 ['connection capacity message',main.includes('conexión extra por 49 €/mes')],
 ['commercial extra connection quantity',plans.includes('teamExtraConnections')&&plans.includes('cart.extraConnections*49')],
 ['signed contract extra connections',contract.includes('extraConnections')&&contract.includes('extraConnectionPrice=49')],
 ['Stripe extra connection line',checkout.includes('Conexión externa adicional')&&checkout.includes('extra_connections')],
 ['feature policy connection limit',webhook.includes('connection_limit:baseConnections+extraConnections')],
 ['responsive fullscreen CSS',css.includes('.vnx-focus-chat #chat.tab.active')&&css.includes('.vnx-status-strip')]
];
const bad=checks.filter(([,ok])=>!ok);
if(bad.length){console.error('0.6.64 verification failed:',bad.map(x=>x[0]).join(', '));process.exit(1)}
console.log('VentaNexIA 0.6.64 verification OK · fullscreen, counters, multi-connections, own agents and connection limits enabled.');
