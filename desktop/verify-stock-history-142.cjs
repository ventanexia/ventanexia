'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const backend=read('master.cjs');
const desktopMain=read('main.cjs');
const preload=read('preload.cjs');
const master=read('renderer/master.js');
const home=read('renderer/agent-home.js');
const html=read('renderer/index.html');
function need(src,re,msg){if(!re.test(src)){console.error('STOCK_HISTORY_142_VERIFY_FAIL:',msg);process.exit(1)}}
function forbid(src,re,msg){if(re.test(src)){console.error('STOCK_HISTORY_142_VERIFY_FAIL:',msg);process.exit(1)}}

// Root cause: historical sales must be searched broadly and matched independently from stock.
need(backend,/qtyStrong:[/,'strong historical-sales quantity aliases missing');
need(backend,/qtyGeneric:[/,'generic quantity aliases for order/invoice history missing');
need(backend,/fecha pedido|fecha albaran|fecha factura/,'historical date aliases missing');
need(backend,/pedidos anteriores|albaranes facturas|salidas consumo/,'portal historical-sales navigation terms missing');
need(backend,/function portalSalesQtyForProduct/,'normalized SKU/EAN/name historical-sales matcher missing');
need(backend,/noSalesData:!hit\.match/,'true no-history must require failure of the normalized matcher');

// Fail closed: zero matches across a meaningful catalog is not equivalent to "all products have no history".
need(backend,/const salesLookReliable=!(products.length>=5&&withSalesCount===0)/,'zero-match historical-sales reliability guard missing');
need(backend,/salesPagesScanned:/,'sales scan page diagnostics missing');
need(backend,/salesTablesSeen:/,'sales scan table diagnostics missing');
need(backend,/salesRowsSeen:/,'sales scan row diagnostics missing');
need(master,/summary.salesLookReliable===false/,'master chat must check historical-sales reliability');
need(master,/No he generado un pedido de compra/,'portal chat must refuse a purchase order when history is unread');
need(master,/Presentar todas como “sin histórico” sería incorrecto/,'portal chat must distinguish unread history from genuine no-history');
need(home,/summary?.salesLookReliable===false/,'Stock y compras page must check historical-sales reliability');
need(home,/HISTÓRICO NO LEÍDO/,'Stock y compras page must label unread history explicitly');
need(home,/Histórico de ventas no verificado/,'Stock y compras page must show a visible hard warning');
need(home,/0 pedidos calculados/,'unverified history must display zero calculated orders');

// Full policy: sales period and urgency are not hard-coded.
need(backend,/function normalizeStockPolicy(options={})/,'full stock policy normalizer missing');
need(backend,/windowDays,urgentDays,urgentAuto/,'sales window and urgency missing from stock policy');
need(preload,/windowDays:options?.windowDays,urgentDays:options?.urgentDays/,'renderer must pass full stock policy through preload');
need(html,/id="vnxAhSalesWindowDays"/,'sales-window selector missing');
need(html,/id="vnxAhUrgentDays"/,'urgent-threshold control missing');
need(home,/windowDays:Math.max(30/,'sales window must persist per company/source');
need(home,/urgentDays:Math.max(0/,'urgent threshold must persist per company/source');
need(master,/samePurchasePolicy/,'cached purchase analysis must be policy-aware');
need(desktopMain,/windowDays:windowDays||null,urgentDays:urgentDays||null,noHistoryMin/,'persisted purchase analysis must store the full policy');

// Download / recovery paths must be visible on the same Stock y compras result.
need(home,/data-home-stock-export="excel"/,'direct Excel download missing under Stock y compras');
need(home,/data-home-stock-export="csv"/,'direct importable CSV download missing under Stock y compras');
need(home,/data-home-stock-export="pdf"/,'direct PDF download missing under Stock y compras');
need(home,/Importar ventas Excel/CSV/,'historical-sales import fallback missing');
need(preload,/stockImportFile:(options={})=>ipcRenderer.invoke('stock:import-file',options)/,'policy-aware historical-sales import bridge missing');
need(master,/ventas_periodo/,'generic sales-period export column missing');
forbid(home,/347 referencias|676 unidades/,'no screenshot-specific quantities may be hard-coded');

console.log('STOCK_HISTORY_142_VERIFY_OK');
