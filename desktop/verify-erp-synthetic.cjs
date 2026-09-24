'use strict';
const {holded,odoo,parseArgs}=require('./erp.cjs');
function response(data,status=200){return {ok:status>=200&&status<300,status,text:async()=>JSON.stringify(data)}}
function need(v,msg){if(!v){console.error('ERP_SYNTHETIC_VERIFY_FAIL:',msg);process.exit(1)}}

(async()=>{
  const holdedCalls=[];
  const holdedFetch=async(url,opts={})=>{
    holdedCalls.push(String(url));
    if(String(url).includes('/products'))return response([
      {id:'p1',sku:'SKU-1',name:'Producto Uno',price:12.5,stock:4},
      {id:'p2',sku:'SKU-2',name:'Producto Dos',price:8,stock:9}
    ]);
    if(String(url).includes('/documents/invoice'))return response([
      {id:'i1',status:1,items:[{sku:'SKU-1',units:7},{productId:'p2',units:3}]}
    ]);
    if(String(url).includes('/contacts'))return response([{id:'c1',name:'Cliente Prueba'}]);
    return response([]);
  };
  const h=holded({key:'TEST_KEY'},{fetch:holdedFetch});
  const hc=await h.catalog();
  need(hc.length===3&&hc[1][0]==='SKU-1'&&hc[1][3]===4,'Holded catálogo simulado incorrecto');
  const hs=await h.salesHistory({windowDays:180});
  need(hs.salesBySku['SKU-1']===7&&hs.salesBySku['SKU-2']===3,'Holded histórico por SKU simulado incorrecto');
  need(hs.documentsSeen===1&&hs.rowsSeen===2,'Holded diagnóstico de ventas simulado incorrecto');
  need(holdedCalls.some(x=>x.includes('starttmp='))&&holdedCalls.some(x=>x.includes('endtmp=')),'Holded no limita el histórico por ventana temporal');

  const odooCalls=[];
  const odooFetch=async(url,opts={})=>{
    const u=String(url),body=opts.body?JSON.parse(opts.body):{};
    odooCalls.push({url:u,body});
    if(u.includes('/json/2/res.partner/search_read'))return response([{id:1}]);
    if(u.includes('/json/2/sale.order.line/search_read'))return response([
      {id:1,product_id:[101,'Producto A'],product_uom_qty:5,qty_delivered:4,state:'sale',order_id:[501,'S001']},
      {id:2,product_id:[102,'Producto B'],product_uom_qty:2,qty_delivered:0,state:'sale',order_id:[502,'S002']}
    ]);
    if(u.includes('/json/2/product.product/search_read')){
      const fields=Array.isArray(body.fields)?body.fields:[];
      if(fields.includes('list_price'))return response([
        {id:101,default_code:'SKU-A',name:'Producto A',list_price:15,free_qty:6},
        {id:102,default_code:'SKU-B',name:'Producto B',list_price:9,free_qty:11}
      ]);
      return response([
        {id:101,default_code:'SKU-A',name:'Producto A'},
        {id:102,default_code:'SKU-B',name:'Producto B'}
      ]);
    }
    return response([]);
  };
  const o=odoo({url:'https://demo.odoo.test',key:'TEST_KEY',db:'demo'},{fetch:odooFetch});
  const oc=await o.catalog();
  need(oc.length===3&&oc[1][0]==='SKU-A'&&oc[1][3]===6,'Odoo catálogo simulado incorrecto');
  const os=await o.salesHistory({windowDays:180});
  need(os.salesBySku['SKU-A']===4,'Odoo debe priorizar cantidad entregada cuando existe');
  need(os.salesBySku['SKU-B']===2,'Odoo debe usar cantidad pedida si no hay cantidad entregada');
  need(os.documentsSeen===2&&os.rowsSeen===2,'Odoo diagnóstico de ventas simulado incorrecto');
  const saleCall=odooCalls.find(x=>x.url.includes('/sale.order.line/search_read'));
  need(JSON.stringify(saleCall?.body||{}).includes('date_order'),'Odoo no aplica ventana temporal al histórico');

  const parsed=parseArgs('programa: odoo https://miempresa.odoo.com base demo usuario yo@empresa.es clave ABC confirmar');
  need(parsed.id==='odoo'&&parsed.url==='https://miempresa.odoo.com'&&parsed.db==='demo'&&parsed.user==='yo@empresa.es'&&parsed.key==='ABC'&&parsed.confirm===true,'Parser de conexión ERP incorrecto');

  console.log('ERP_SYNTHETIC_VERIFY_OK · Holded y Odoo: catálogo, ventas por SKU, ventana temporal y parser simulados.');
})().catch(e=>{console.error('ERP_SYNTHETIC_VERIFY_FAIL:',e?.stack||e);process.exit(1)});
