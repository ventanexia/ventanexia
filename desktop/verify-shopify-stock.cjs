// 0.6.108 build gate
'use strict';
const fs=require('node:fs'),path=require('node:path');
const backend=fs.readFileSync(path.join(__dirname,'master.cjs'),'utf8');
const renderer=fs.readFileSync(path.join(__dirname,'renderer','master.js'),'utf8');
function need(src,re,msg){if(!re.test(src)){console.error('SHOPIFY_STOCK_VERIFY_FAIL:',msg);process.exit(1)}}
need(backend,/const SHOPIFY_SALES_WINDOW_DAYS=180;/,'sales window must stay at 180 days');
need(backend,/const SHOPIFY_URGENT_DAYS=5;/,'urgent threshold must stay at 5 days');
need(backend,/orders\(first:100, after:\$cursor[\s\S]*created_at:>=\$\{since\}/,'sales query must paginate by date');
need(backend,/if\(o\.cancelledAt\)\{cancelledSkipped\+\+;continue\}/,'cancelled orders must be excluded');
need(renderer,/function isShopifyStockRequest/,'renderer must detect Shopify stock requests');
need(renderer,/shopifyReplenishmentSummary\(\)/,'renderer must use calculated stock summary directly');
need(renderer,/\| SKU \/ EAN \| Producto \| Stock actual \| Ventas 6 meses \| Media diaria \| Días de cobertura \| Cantidad a pedir \| Estado \|/,'deterministic stock table must be present');
need(renderer,/Menos de 5 días de cobertura/,'visible urgent rule must stay at 5 days');
need(renderer,/purchaseData:m\.purchaseData\|\|null/,'structured purchase data must persist with chat state');
need(renderer,/CSV importable/,'purchase actions must expose importable CSV');
need(renderer,/headers:\['sku_ean','producto','stock_actual','ventas_180_dias','media_diaria','dias_cobertura','cantidad_a_pedir','estado'\]/,'import columns must stay stable');
const exportCode=fs.readFileSync(path.join(__dirname,'export.cjs'),'utf8');
need(exportCode,/function csvBuffer\(data\)/,'CSV exporter must exist');
need(exportCode,/payload\.format==='csv'/,'CSV format must be routed by exporter');
console.log('SHOPIFY_STOCK_VERIFY_OK');
