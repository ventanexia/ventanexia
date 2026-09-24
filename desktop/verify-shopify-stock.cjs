// 0.6.108 build gate
'use strict';
const fs=require('node:fs'),path=require('node:path');
const backend=fs.readFileSync(path.join(__dirname,'master.cjs'),'utf8');
const desktopMain=fs.readFileSync(path.join(__dirname,'main.cjs'),'utf8');
const preload=fs.readFileSync(path.join(__dirname,'preload.cjs'),'utf8');
const renderer=fs.readFileSync(path.join(__dirname,'renderer','master.js'),'utf8');
const stores=fs.readFileSync(path.join(__dirname,'shopify-stores.cjs'),'utf8');
function need(src,re,msg){if(!re.test(src)){console.error('SHOPIFY_STOCK_VERIFY_FAIL:',msg);process.exit(1)}}
need(backend,/const SHOPIFY_SALES_WINDOW_DAYS=180;/,'sales window must stay at 180 days');
need(backend,/const SHOPIFY_TARGET_COVER_DAYS=25;/,'default purchase provisioning target must be 25 days');
need(backend,/function normalizeStockPolicy\(options=\{\}\)/,'coverage days and no-history minimum must be configurable');
need(backend,/function autoUrgentDays\(targetDays\)/,'urgent threshold must be derived from the active coverage target unless explicitly configured');
need(backend,/windowDays,urgentDays,urgentAuto/,'full stock policy must include sales window and urgent threshold');
need(backend,/orders\(first:100, after:\$cursor[\s\S]*created_at:>=\$\{since\}/,'sales query must paginate by date');
need(backend,/if\(o\.cancelledAt\)\{cancelledSkipped\+\+;continue\}/,'cancelled orders must be excluded');
need(renderer,/function isShopifyStockRequest/,'renderer must detect Shopify stock requests');
if((renderer.match(/compr\\w\*/g)||[]).length<2){console.error('SHOPIFY_STOCK_VERIFY_FAIL: comprar stem must be applied in both stock-intent regexes');process.exit(1)}
if(/compras\?/.test(renderer)){console.error('SHOPIFY_STOCK_VERIFY_FAIL: legacy compras? detector must not remain');process.exit(1)}
{
  const m=renderer.match(/function stockIntentText\(text=''\)\{[\s\S]*?\n  \}/);
  if(!m){console.error('SHOPIFY_STOCK_VERIFY_FAIL: stockIntentText function could not be extracted');process.exit(1)}
  const fn=(0,eval)('('+m[0]+')');
  if(!fn('dime qué tengo que comprar')){console.error('SHOPIFY_STOCK_VERIFY_FAIL: phrase "dime qué tengo que comprar" must trigger stock analysis');process.exit(1)}
}

need(renderer,/function isStockListingRequest\(text=''\)/,'stock listing intent must be separated from replenishment');
need(renderer,/function stockInventoryTable\(summary=\{\}\)/,'full stock table renderer must exist');
need(renderer,/function stockExportData\(summary=\{\}\)/,'full stock export data must exist');
need(renderer,/data-stock-excel/,'full stock Excel action must exist');
need(renderer,/stockListing\?stockInventoryTable\(summary\):shopifyStockTable\(summary\)/,'Shopify must route plain stock requests to the full inventory table');
need(renderer,/stockListing\?stockInventoryTable\(portalSummary\):shopifyStockTable\(portalSummary\)/,'private portals must route plain stock requests to the full inventory table');
{
  const m=renderer.match(/function isStockListingRequest\(text=''\)\{[\s\S]*?\n  \}/);
  if(!m){console.error('SHOPIFY_STOCK_VERIFY_FAIL: isStockListingRequest function could not be extracted');process.exit(1)}
  const fn=(0,eval)('('+m[0]+')');
  if(!fn('mírame el stock')){console.error('SHOPIFY_STOCK_VERIFY_FAIL: phrase "mírame el stock" must request the full stock list');process.exit(1)}
  if(!fn('dime el stock')){console.error('SHOPIFY_STOCK_VERIFY_FAIL: phrase "dime el stock" must request the full stock list');process.exit(1)}
  if(fn('analiza el stock')){console.error('SHOPIFY_STOCK_VERIFY_FAIL: phrase "analiza el stock" must stay in replenishment analysis, not plain listing');process.exit(1)}
  if(fn('dime qué tengo que comprar')){console.error('SHOPIFY_STOCK_VERIFY_FAIL: purchase intent must not be treated as a plain stock listing');process.exit(1)}
}
need(renderer,/async function latestPurchaseAnalysis\(scopeKey,policy=\{\}\)/,'purchase analysis loader must support the full active policy');
need(renderer,/purchaseAnalysisGet\?\.\(scopeKey\)/,'purchase order must restore persisted analysis');
need(renderer,/rememberPurchaseAnalysis/,'verified purchase analysis must be persisted');
need(renderer,/Sin un análisis válido para TODA la política actual, releemos la fuente/,'purchase request must auto-calculate a missing analysis using the full active policy');
need(renderer,/Basado en análisis verificado/,'purchase order must show analysis timestamp');
need(renderer,/ageHours>=24/,'stale analysis must be visibly flagged without being discarded');
need(preload,/purchaseAnalysisGet:\(scopeKey\)=>ipcRenderer\.invoke\('purchase-analysis:get',scopeKey\)/,'preload must expose purchase analysis read');
need(preload,/purchaseAnalysisSet:\(payload\)=>ipcRenderer\.invoke\('purchase-analysis:set',payload\)/,'preload must expose purchase analysis write');
need(desktopMain,/ipcMain\.handle\('purchase-analysis:get'/,'desktop main must expose encrypted purchase analysis read');
need(desktopMain,/ipcMain\.handle\('purchase-analysis:set'/,'desktop main must expose encrypted purchase analysis write');
need(renderer,/const direct=\/\\b\(haz/,'direct "hazme el pedido" intent must be detected before stock analysis');
need(renderer,/shopifyReplenishmentSummary\(selectedShop,\{force:true,targetDays:policy\.targetDays,noHistoryMin:policy\.noHistoryMin,windowDays:policy\.windowDays,urgentDays:policy\.urgentDays\|\|undefined\}\)/,'renderer must calculate stock from the selected Shopify store with the full policy');
need(renderer,/stockOptions=\{force:true,targetDays:policy\.targetDays,noHistoryMin:policy\.noHistoryMin,windowDays:policy\.windowDays,urgentDays:policy\.urgentDays\|\|undefined\}/,'direct purchase requests must calculate with the complete active policy');
need(renderer,/Ventas del periodo \('\+windowDays\+' días\)/,'purchase table must expose the configured sales period');
need(renderer,/URGENTE · < '\+urgentDays\+' DÍAS/i,'visible urgent rule must use the configured threshold');
need(renderer,/REPONER · < '\+targetDays\+' DÍAS/,'purchase table must include non-urgent rows that still need stock to reach the configured target');
need(renderer,/purchaseData:m\.purchaseData\|\|null/,'structured purchase data must persist with chat state');
need(renderer,/CSV importable/,'purchase actions must expose importable CSV');
need(stores,/function listShopifyStores\(state\)/,'multi-store Shopify state helper must list all connected stores');
need(stores,/function getShopifyStore\(state,shop=null\)/,'multi-store Shopify state helper must resolve an exact store');
need(stores,/persistShopifyStorePatch/,'renewed Shopify tokens must persist into the matching store');
need(desktopMain,/ipcMain\.handle\('shopify:list'/,'desktop main must expose the Shopify store list');
need(desktopMain,/ipcMain\.handle\('shopify:set-active'/,'desktop main must allow an explicit active Shopify store');
need(desktopMain,/integration:shopify:'\+encodeURIComponent\(x\.shop\)/,'connection list must expose each Shopify store separately');
need(preload,/shopifyStores:\(\)=>ipcRenderer\.invoke\('shopify:list'\)/,'preload must expose all Shopify stores');
need(renderer,/function combinedStockSources\(scope\)/,'renderer must support explicit two-source stock analysis');
need(renderer,/function buildCombinedStockSummary\(a,b,sources\)/,'renderer must build a deterministic two-source stock cross');
need(renderer,/supplierMatched:Boolean\(supplierRow\)/,'two-source stock cross must preserve supplier catalog match state');
need(renderer,/NO APARECE EN CATÁLOGO/,'combined stock must report products absent from supplier catalog');
need(renderer,/No he hecho un cruce parcial/,'combined stock must fail closed if either selected source cannot be read');
need(renderer,/function wantsFreshStock\(text=''\)/,'renderer must recognize an explicit stock refresh request');
need(renderer,/function purchasePanelHtml\(msg=\{\}\)/,'visual Stock and Compras panel renderer must exist');
need(renderer,/m\.purchaseExport&&m\.purchaseData\?\.headers\?\.length\?purchasePanelHtml\(m\)/,'structured purchase data must render through the visual purchase panel');
need(renderer,/Qué necesitas comprar ahora/,'visual purchase panel title must stay present');
need(renderer,/Fabricante y EAN.*nunca se inventan/s,'stock UI must state that manufacturer and EAN are never invented');
need(backend,/catalog_scan_incomplete/,'private portal stock analysis must fail closed when the full catalog cannot be verified');

need(backend,/const PORTAL_MAX_PAGES=12;/,'ordinary private portal reads must remain bounded');
need(backend,/const PORTAL_REPLENISHMENT_MAX_PAGES=120;/,'stock and sales replenishment must be able to scan the full paginated portal');
need(backend,/\[role="grid"\],\[role="table"\],\.ag-root,\.MuiDataGrid-root,\.dx-datagrid/,'private portal reader must extract modern ERP grids');
need(backend,/choosePortalActions/,'private portal reader must navigate safe dynamic menus');
need(backend,/stockUrl:stockExtract\.sourceUrl/,'private portal reader must learn the verified stock route');
need(backend,/portal\.stockUrl&&sameOrigin\(portal\.stockUrl,portal\.url\)/,'verified private portal stock route must be reused when it belongs to the same portal');
need(backend,/pagesScanned/,'private portal stock failure must expose scan diagnostics');
need(backend,/liveWindowChecked/,'private portal stock diagnostics must say whether the live portal was checked');
need(renderer,/he reconstruido automáticamente su ventana/,'user-facing stock failure must explain automatic portal rehydration');
need(renderer,/He abierto \*\*'\+sourceLabel\+'\*\* automáticamente/,'failed automatic discovery must tell the user the portal was opened directly');


need(renderer,/function printPurchaseProposal\(msg\)[\s\S]*purchaseExportDataFromMessage\(msg\)/,'print must use structured purchase data, not legacy text parsing');
need(renderer,/headers:\['sku','ean','fabricante','producto','stock_actual','ventas_periodo','media_diaria','dias_cobertura','cantidad_a_pedir','estado'\]/,'import columns must keep manufacturer, SKU, EAN and generic sales-period field separate and stable');
const exportCode=fs.readFileSync(path.join(__dirname,'export.cjs'),'utf8');
need(exportCode,/function csvBuffer\(data\)/,'CSV exporter must exist');
need(exportCode,/payload\.format==='csv'/,'CSV format must be routed by exporter');
console.log('SHOPIFY_STOCK_VERIFY_OK');

need(backend,/const STOCK_NO_HISTORY_DEFAULT_MIN=0;/,'no-history default must never invent a quantity');
need(renderer,/Sin histórico/,'stock UI must distinguish missing sales history from real zero sales');
