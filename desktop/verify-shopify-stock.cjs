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
console.log('SHOPIFY_STOCK_VERIFY_OK');
