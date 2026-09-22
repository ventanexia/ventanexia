'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const html=read('renderer/index.html'),js=read('renderer/master.js'),css=read('renderer/styles.css'),appUi=read('renderer/app.js'),master=read('master.cjs'),orders=read('orders.cjs'),ordersCore=read('orders-core.cjs'),policy=read('agent-policy.cjs'),main=read('main.cjs');
const plans=fs.readFileSync(path.join(__dirname,'..','planes.html'),'utf8');
const contract=fs.readFileSync(path.join(__dirname,'..','contrato-servicio.html'),'utf8');
const contractApi=fs.readFileSync(path.join(__dirname,'..','server','handlers','contract-accept.js'),'utf8');
const checkout=fs.readFileSync(path.join(__dirname,'..','server','handlers','create-checkout.js'),'utf8');
const webhook=fs.readFileSync(path.join(__dirname,'..','server','handlers','stripe-webhook.js'),'utf8');

const checks=[
 ['Mi trabajo button',html.includes('id="vnxMyWorkBtn"')],
 ['Mi trabajo overlay logic',js.includes('function openWorkQueue')&&js.includes('function renderWorkQueue')],
 ['Email work tabs',js.includes('data-work-tab="automatic"')&&js.includes('data-work-tab="review"')&&js.includes('data-work-tab="decision"')&&js.includes('data-work-tab="resolved"')],
 ['Review can send and edit',js.includes("data-work-send")&&js.includes("data-work-edit")&&js.includes("action:'send_reply'")],
 ['Decision workflow',js.includes('Preparar con mi decisión')&&js.includes('aiReplyForWorkItem')],
 ['Resolved shows sent reply',master.includes('sentBody:responseInfo.sentBody')&&js.includes('Última respuesta enviada')],
 ['Secretary links to work queue',js.includes('secretaryActions:true')&&js.includes('data-secretary-workqueue')],
 ['Work queue grouped by email account',js.includes('groupWorkByAccount')],
 ['Order plans have channel limits',plans.includes("orderChannels:1")&&plans.includes("orderChannels:2")&&plans.includes("orderChannels:4")],
 ['Order web tiers configured by plan',plans.includes("orderLevel:'basic'")&&plans.includes("orderLevel:'pro'")&&plans.includes("orderLevel:'auto'")],
 ['Pedidos included in all plans',plans.includes("const ALWAYS_INCLUDED=['pedidos']")&&plans.includes("pedidos:{icon:'📦',name:'Pedidos',price:0")],
 ['Contract carries fixed order-channel capacity',contract.includes('orderPlans')&&contractApi.includes('orderChannelsIncluded:p.orderChannels')],
 ['Checkout does not sell obsolete extra order channels',!checkout.includes('Canal adicional de pedidos online')&&checkout.includes('extraOrderChannelPrice=0')],
 ['Webhook provisions order level',webhook.includes('order_channel_limit')&&webhook.includes('order_web_level')],
 ['Work queue responsive CSS',css.includes('0.6.65 — Mi trabajo')],
 ['Order channel plan limits',policy.includes('function orderChannelLimit')&&policy.includes("return 1")&&policy.includes("return 2")&&policy.includes("return 4")],
 ['Multiple web stores supported',orders.includes("storeKey=S.id+':'+host")&&orders.includes('orderStoreId(key,x)')],
 ['Order channel capacity enforced',orders.includes('assertOrderChannelCapacity')&&orders.includes('cambia a un plan con más canales')],
 ['Shopify excluded from generic connection count',main.includes("!['email','shopify'].includes(k)")&&main.includes('assertOrderChannelCapacity(preState)')],
 ['Shopify UI belongs to Pedidos',appUi.includes("shopify:'orders'")&&!appUi.includes("shopify:'web_ecommerce'")],
 ['Shopify module policy belongs to Pedidos',policy.includes("if(m==='shopify')return 'pedidos'")],
 ['Automatic web delivery gated',ordersCore.includes("o.source?.kind!=='web'||webLevel==='auto'")]
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){console.error('0.6.65 verification failed:',failed.map(x=>x[0]).join(', '));process.exit(1)}
console.log('VentaNexIA workflow verification OK · Mi trabajo, fixed channel limits and controlled order automation enabled.');
