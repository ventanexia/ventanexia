'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const master=read('master.cjs'),home=read('renderer/agent-home.js');
function need(src,re,msg){if(!re.test(src)){console.error('VERIFY_142_FAIL:',msg);process.exit(1)}}
need(master,/function portalCodeKey/,'normalized SKU matching missing');
need(master,/function portalEanKey/,'normalized EAN matching missing');
need(master,/function portalSalesQtyForProduct/,'robust portal sales matcher missing');
need(master,/salesMatchedBySku/,'sales match diagnostics missing');
need(master,/salesMatchedByEan/,'EAN match diagnostics missing');
need(master,/salesMatchedByFuzzyName/,'safe product-name fallback diagnostics missing');
need(home,/Histórico de ventas no verificado/,'UI must distinguish unread history from real no-history');
need(home,/Esto no significa que los productos no tengan histórico/,'UI must not mislabel unread history');
need(home,/data-home-stock-export="excel"/,'Excel stock export missing');
need(home,/data-home-stock-export="csv"/,'CSV stock export missing');
need(home,/data-home-stock-export="pdf"/,'PDF stock export missing');
need(home,/exportHomeStock\(lastStockRun\.summary,false,'excel'/,'stock preview export button must execute');
need(home,/const previewActions=\$\$\('#vnxAhPreviewActions button'\)/,'preview action NodeList bug must be fixed');
console.log('VERIFY_142_OK');
