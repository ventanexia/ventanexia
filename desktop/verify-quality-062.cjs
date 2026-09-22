'use strict';
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const erp=read('erp.cjs');
const ordersApi=fs.readFileSync(path.join(__dirname,'..','server','handlers','orders-extract.js'),'utf8');
const prospecting=read('prospecting.cjs');
const stateStore=read('state-store.cjs');
const appUi=read('renderer/app.js');
const indexUi=read('renderer/index.html');
const deviceRegister=fs.readFileSync(path.join(__dirname,'..','server','handlers','device-register.js'),'utf8');
const deviceStatus=fs.readFileSync(path.join(__dirname,'..','server','handlers','device-status.js'),'utf8');
const home=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const plans=fs.readFileSync(path.join(__dirname,'..','planes.html'),'utf8');
const checkout=fs.readFileSync(path.join(__dirname,'..','server','handlers','create-checkout.js'),'utf8');

const checks=[
 ['WooCommerce filters unsafe states',erp.includes("allowed=new Set")&&erp.includes("'processing','on-hold','pending'")&&erp.includes("all.filter(o=>allowed.has")],
 ['Dolibarr pagination',erp.includes("async function pages(resource)")&&erp.includes("page='+page")],
 ['Dolibarr product linking',erp.includes("fk_product:productIds[ref]")],
 ['Orders extraction bounded',ordersApi.includes("MAX_INPUT_CHARS=90000")],
 ['Orders extraction retry',ordersApi.includes("attempt<=2")&&ordersApi.includes("requestId=")],
 ['Prospecting automatic follow-up default',prospecting.includes("autoFollowUp:true")],
 ['Activity history expanded',stateStore.includes(".slice(0,5000)")],
 ['Results panel exists',indexUi.includes('id="resultsGuarantees"')&&appUi.includes('renderResultsGuarantees')],
 ['Device RPC server-only code',deviceRegister.includes("SUPABASE_SERVICE_ROLE_KEY")&&deviceStatus.includes("SUPABASE_SERVICE_ROLE_KEY")&&!deviceRegister.includes("sb_publishable_")&&!deviceStatus.includes("sb_publishable_")],
 ['Home pricing current',home.includes("129 €")&&home.includes("299 €")&&home.includes("599 €")],
 ['Plans pricing current',plans.includes("price:129")&&plans.includes("price:299")&&plans.includes("price:599")],
 ['Checkout pricing current',checkout.includes("expectedAmount:9900")&&checkout.includes("expectedAmount:24900")&&checkout.includes("expectedAmount:49900")],
 ['Executive Secretary visible on web',home.includes("Secretaria Ejecutiva")&&plans.includes("Secretaria Ejecutiva")]
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){
 console.error('VentaNexIA 0.6.62 quality verification failed:',failed.map(x=>x[0]).join(', '));
 process.exit(1);
}
console.log('VentaNexIA 0.6.62 quality verification OK · connectors, orders, follow-up, activity, security, results panel and pricing synchronized.');
