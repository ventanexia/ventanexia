const {app,BrowserWindow,ipcMain,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {readState,writeState,updateState,audit}=require('./state-store.cjs');
const {shopifyCall}=require('./shopify-auth.cjs');

const CLOUD='https://www.ventanexia.es';
const MAX_FILES=80,MAX_CHARS=120000,MAX_FILE_CHARS=20000;
const TEXT_EXTENSIONS=new Set(['.txt','.csv','.json','.md','.log']);
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const clean=(v,n=1000)=>String(v||'').trim().slice(0,n);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const partitionFor=id=>`persist:vnx-portal-${String(id||'portal').replace(/[^a-z0-9_-]/gi,'')}`;
function sameOrigin(a,b){try{return new URL(a).origin===new URL(b).origin}catch{return false}}

const CATEGORIES={
  products:['productos','producto','products','product','catalogo','catalog','articulos','articulo','items'],
  orders:['pedidos web','pedidos','pedido','orders','order','ventas web'],
  invoices:['facturas','factura','invoices','invoice','facturacion','billing'],
  customers:['clientes','cliente','customers','customer','contactos'],
  prices:['tarifas','tarifa','precios','precio','prices','price','rates'],
  stock:['stock','inventario','inventory','existencias'],
  alerts:['alertas','alerta','alerts'],
  dashboard:['dashboard','resumen','inicio','home','facturado','ventas']
};
const DANGEROUS=/logout|cerrar sesion|delete|eliminar|borrar|remove|cancel|anular|editar|edit|nuevo|new|crear|create|guardar|save|actualizar|update|publicar|publish|enviar|send/;

function categoryForQuestion(question=''){
  const q=norm(question);
  if(/cuantos? productos|numero de productos|total de productos|productos tenemos/.test(q))return 'products';
  if(/cuantos? clientes|numero de clientes|total de clientes|clientes tenemos/.test(q))return 'customers';
  if(/stock|inventario|existencias/.test(q))return 'stock';
  if(/precio|precios|tarifa|tarifas/.test(q))return 'prices';
  if(/factura|facturas|facturado|facturacion/.test(q))return 'invoices';
  if(/pedido|pedidos|orden|ordenes/.test(q))return 'orders';
  if(/alerta|alertas/.test(q))return 'alerts';
  return 'dashboard';
}
function scoreLink(category,link){
  const hay=norm(`${link.text||''} ${link.href||''}`);if(DANGEROUS.test(hay))return -100;
  let score=0;for(const word of CATEGORIES[category]||[])if(hay.includes(norm(word)))score+=word.includes(' ')?10:6;
  if(/^javascript:|^mailto:|^tel:/.test(String(link.href||'')))score=-100;
  return score;
}
function likelyLogin(url,text=''){
  const t=norm(text).slice(0,5000),u=norm(url);
  if(/cerrar sesion|logout|dashboard|pedidos web|facturas|productos|clientes|tarifas/.test(t))return false;
  return /\/login(?:\/|\?|$)|\/signin(?:\/|\?|$)|\/sign-in(?:\/|\?|$)/.test(u)||(/iniciar sesion|acceder|sign in/.test(t)&&/password|contrasena/.test(t));
}
function windowOptions(portal,show=false){return {width:1180,height:820,show,title:`VentaNexIA · Analizando ${portal.name}`,webPreferences:{partition:partitionFor(portal.id),contextIsolation:true,nodeIntegration:false,sandbox:true,devTools:false}}}

async function inspect(win){
  return win.webContents.executeJavaScript(`(()=>{
    const clean=s=>String(s||'').replace(/\\s+/g,' ').trim();
    const text=String(document.body?.innerText||'').slice(0,60000);
    const links=[...document.querySelectorAll('a[href]')].slice(0,1200).map(a=>({text:clean(a.innerText||a.textContent),href:a.href})).filter(x=>x.href);
    const tables=[...document.querySelectorAll('table')].slice(0,12).map((t,ti)=>{
      const headers=[...t.querySelectorAll('thead th')].map(x=>clean(x.innerText||x.textContent)).filter(Boolean);
      const rows=[...t.querySelectorAll('tbody tr')].slice(0,80).map(tr=>[...tr.querySelectorAll('th,td')].map(td=>clean(td.innerText||td.textContent)));
      return {index:ti,headers,rows,rowCount:rows.length};
    });
    const forms=[...document.forms].map(f=>({method:String(f.method||'get').toLowerCase(),action:f.action||'',inputs:[...f.querySelectorAll('input,select,textarea')].slice(0,30).map(i=>({name:i.name||'',type:i.type||i.tagName.toLowerCase(),placeholder:i.placeholder||''}))})).slice(0,20);
    const images=[...document.images].map(img=>({src:img.currentSrc||img.src,alt:clean(img.alt),w:img.naturalWidth||0,h:img.naturalHeight||0})).filter(x=>x.src&&(x.w>=100||x.h>=100)).slice(0,30);
    return {url:location.href,title:document.title||'',text,links,tables,forms,images};
  })()`,true);
}
function extractTotal(page,category){
  const text=String(page?.text||'');
  const patterns=[
    /mostrando\s+\d+\s+(?:a|hasta)\s+\d+\s+de\s+([\d.]+)\s+(?:registros|resultados|entradas|items|productos|clientes)/i,
    /showing\s+\d+\s+to\s+\d+\s+of\s+([\d,]+)\s+(?:entries|results|items)/i,
    /(?:total|totales)\s*[:\-]?\s*([\d.]+)\s*(?:productos|clientes|registros|resultados|items)?/i
  ];
  if(category==='products')patterns.push(/([\d.]+)\s+productos\b/i);
  if(category==='customers')patterns.push(/([\d.]+)\s+clientes\b/i);
  for(const re of patterns){const m=text.match(re);if(m){const n=Number(String(m[1]).replace(/[.,](?=\d{3}\b)/g,''));if(Number.isFinite(n)&&n>=0)return n}}
  const rows=(page?.tables||[]).reduce((n,t)=>n+(t.rowCount||0),0);
  return rows||null;
}
function classifyLinks(base,links=[]){
  const out={};
  for(const category of Object.keys(CATEGORIES)){
    const ranked=[];
    for(const l of links){try{const u=new URL(l.href,base);if(!sameOrigin(u.href,base))continue;const score=scoreLink(category,{...l,href:u.href});if(score>0)ranked.push({url:u.href,text:l.text,score})}catch{}}
    ranked.sort((a,b)=>b.score-a.score);if(ranked[0])out[category]=ranked[0];
  }
  return out;
}
async function loadPage(win,url){await win.loadURL(url);await delay(450);return inspect(win)}

async function calibratePortal(id){
  const portal=await getPortal(id);if(!portal)throw new Error('Portal no encontrado');
  const win=new BrowserWindow(windowOptions(portal,false));win.removeMenu();
  try{
    let start=portal.lastUrl&&sameOrigin(portal.lastUrl,portal.url)?portal.lastUrl:new URL(portal.url).origin+'/';
    let root=await loadPage(win,start);
    if(likelyLogin(root.url,root.text))return {status:'login_required',name:portal.name,capabilities:{}};
    const candidates=classifyLinks(root.url,root.links||[]),capabilities={};
    for(const category of Object.keys(CATEGORIES)){
      const target=candidates[category];if(!target)continue;
      try{
        const p=target.url===root.url?root:await loadPage(win,target.url);
        if(likelyLogin(p.url,p.text))continue;
        const total=extractTotal(p,category),tables=p.tables||[];
        capabilities[category]={
          detected:true,url:p.url,title:p.title||target.text||category,totalEstimate:total,
          tableCount:tables.length,headers:tables[0]?.headers||[],sampleRows:(tables[0]?.rows||[]).slice(0,5),
          hasSearch:(p.forms||[]).some(f=>(f.inputs||[]).some(i=>/search|buscar|q|query/.test(norm(`${i.name} ${i.placeholder}`)))),
          readOnlySafe:true,confidence:Math.min(100,55+target.score*3+(tables.length?15:0)+(total!==null?10:0))
        };
      }catch{}
    }
    if(!capabilities.dashboard)capabilities.dashboard={detected:true,url:root.url,title:root.title,totalEstimate:null,tableCount:(root.tables||[]).length,headers:root.tables?.[0]?.headers||[],sampleRows:(root.tables?.[0]?.rows||[]).slice(0,5),hasSearch:false,readOnlySafe:true,confidence:70};
    const profile={version:1,calibratedAt:new Date().toISOString(),origin:new URL(root.url).origin,capabilities};
    await patchPortal(portal.id,{profile,lastStatus:'connected',lastCheckedAt:new Date().toISOString(),lastUrl:root.url});
    try{await session.fromPartition(partitionFor(portal.id)).cookies.flushStore()}catch{}
    await audit('portal.calibrated',`${portal.name} · ${Object.keys(capabilities).length} áreas detectadas`);
    return {status:'connected',name:portal.name,profile};
  }finally{if(!win.isDestroyed())win.destroy()}
}

async function queryPortal(portal,question){
  let profile=portal.profile;
  const category=categoryForQuestion(question);
  if(!profile?.capabilities?.[category]){
    const c=await calibratePortal(portal.id);if(c.status!=='connected')return {status:c.status,name:portal.name,category};
    portal=await getPortal(portal.id);profile=portal.profile;
  }
  const cap=profile?.capabilities?.[category]||profile?.capabilities?.dashboard;
  if(!cap?.url)return {status:'not_mapped',name:portal.name,category};
  const win=new BrowserWindow(windowOptions(portal,false));win.removeMenu();
  try{
    const page=await loadPage(win,cap.url);if(likelyLogin(page.url,page.text))return {status:'login_required',name:portal.name,category};
    const total=extractTotal(page,category);
    return {status:'connected',name:portal.name,category,url:page.url,title:page.title,total,headers:page.tables?.[0]?.headers||[],rows:(page.tables?.[0]?.rows||[]).slice(0,30),text:page.text.slice(0,22000),images:(page.images||[]).slice(0,10)};
  }finally{if(!win.isDestroyed())win.destroy()}
}
function deterministicReply(question,results){
  const q=norm(question),r=results.find(x=>x.status==='connected');if(!r)return null;
  if(r.category==='products'&&/cuantos|numero|total|tenemos/.test(q)&&Number.isFinite(r.total))return `${r.name} tiene ${r.total} productos según el portal conectado.`;
  if(r.category==='customers'&&/cuantos|numero|total|tenemos/.test(q)&&Number.isFinite(r.total))return `${r.name} tiene ${r.total} clientes según el portal conectado.`;
  if(r.category==='orders'&&/ultimos|últimos/.test(question)&&r.rows?.length){const rows=r.rows.slice(0,10).map((row,i)=>`${i+1}. ${row.join(' · ')}`).join('\n');return `Últimos registros de pedidos encontrados en ${r.name}:\n${rows}`;}
  return null;
}

async function collectLocalContext(rootsOverride=null){
  const s=await readState(),roots=Array.isArray(rootsOverride)&&rootsOverride.length?rootsOverride:(s.permissions?.folders||[]),files=[];let chars=0;
  async function walk(root,dir,depth){if(depth>6||files.length>=MAX_FILES||chars>=MAX_CHARS)return;let es=[];try{es=await fs.readdir(dir,{withFileTypes:true})}catch{return}for(const e of es){if(files.length>=MAX_FILES||chars>=MAX_CHARS)break;if(e.isSymbolicLink())continue;const full=path.join(dir,e.name);if(e.isDirectory()){await walk(root,full,depth+1);continue}if(!e.isFile()||!TEXT_EXTENSIONS.has(path.extname(e.name).toLowerCase()))continue;try{const text=(await fs.readFile(full,'utf8')).slice(0,MAX_FILE_CHARS),content=text.slice(0,MAX_CHARS-chars);if(content){files.push({path:path.relative(root,full),content});chars+=content.length}}catch{}}}
  for(const r of roots)await walk(r,r,0);return files;
}
function lastUser(messages=[]){for(let i=messages.length-1;i>=0;i--)if(messages[i]?.role==='user')return String(messages[i].content||'');return ''}

async function shopifyAdminGraphql(shop,token,query,variables={}){
  const host=String(shop||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const r=await fetch('https://'+host+'/admin/api/2026-07/graphql.json',{method:'POST',headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token,'User-Agent':'VentaNexIA-Desktop/'+app.getVersion()},body:JSON.stringify({query,variables})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.errors){const e=new Error(j?.errors?.[0]?.message||('Shopify respondió '+r.status));e.status=r.status;throw e}
  return j.data||{};
}
async function apiJson(url,opts={}){
  const r=await fetch(url,opts);const text=await r.text();let j={};try{j=JSON.parse(text)}catch{j={raw:text.slice(0,800)}}
  if(!r.ok){const msg=j?.error?.message||j?.message||j?.error_description||('HTTP '+r.status);throw new Error(msg)}
  return j;
}
async function queryIntegrationData(scope,question,state){
  const cfg=state.secret?.integrations?.[scope?.key];
  if(!cfg?.token)return {status:'not_connected',name:scope?.name||scope?.key||'Integración'};
  const p=cfg.provider,auth={Authorization:'Bearer '+cfg.token},name=scope?.name||cfg.label||p;
  if(p==='gmail'){
    const list=await apiJson('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=newer_than:30d',{headers:auth});
    const ids=(list.messages||[]).slice(0,15).map(x=>x.id);
    const items=await Promise.all(ids.map(id=>apiJson('https://gmail.googleapis.com/gmail/v1/users/me/messages/'+encodeURIComponent(id)+'?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date',{headers:auth}).catch(()=>null)));
    const rows=items.filter(Boolean).map(m=>{const hs=Object.fromEntries((m.payload?.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));return [hs.date||'',hs.from||'',hs.subject||'',m.snippet||'',(m.labelIds||[]).includes('UNREAD')?'No leído':'Leído']});
    return {status:'connected',name,category:'email',headers:['Fecha','De','Asunto','Resumen','Estado'],rows,total:Number(list.resultSizeEstimate||rows.length),text:'Correos recientes de Gmail autorizados. Se muestran hasta 15 mensajes de los últimos 30 días.',images:[],source:'gmail_api',mode:cfg.mode||'read'};
  }
  if(p==='microsoft_365'){
    const j=await apiJson('https://graph.microsoft.com/v1.0/me/messages?$top=20&$orderby=receivedDateTime%20desc&$select=subject,from,receivedDateTime,isRead,bodyPreview',{headers:auth});
    const rows=(j.value||[]).map(m=>[m.receivedDateTime||'',m.from?.emailAddress?.address||'',m.subject||'',m.bodyPreview||'',m.isRead?'Leído':'No leído']);
    return {status:'connected',name,category:'email',headers:['Fecha','De','Asunto','Resumen','Estado'],rows,total:rows.length,text:'Últimos correos accesibles de Microsoft 365. Se muestran hasta 20 mensajes.',images:[],source:'microsoft_graph',mode:cfg.mode||'read'};
  }
  if(p==='hubspot'){
    const q=String(question||'').toLowerCase();
    if(/oportunidad|deal|negocio|pipeline|venta/.test(q)){
      const j=await apiJson('https://api.hubapi.com/crm/v3/objects/deals?limit=50&properties=dealname,amount,dealstage,pipeline,closedate',{headers:auth});
      const rows=(j.results||[]).map(x=>[x.properties?.dealname||'',x.properties?.amount||'',x.properties?.dealstage||'',x.properties?.pipeline||'',x.properties?.closedate||'']);
      return {status:'connected',name,category:'crm_deals',headers:['Oportunidad','Importe','Etapa','Pipeline','Cierre'],rows,total:rows.length,text:'Oportunidades de HubSpot accesibles con la cuenta conectada.',images:[],source:'hubspot_api',mode:cfg.mode||'read'};
    }
    const j=await apiJson('https://api.hubapi.com/crm/v3/objects/contacts?limit=50&properties=firstname,lastname,email,phone,company,lifecyclestage',{headers:auth});
    const rows=(j.results||[]).map(x=>[(x.properties?.firstname||'')+' '+(x.properties?.lastname||''),x.properties?.email||'',x.properties?.phone||'',x.properties?.company||'',x.properties?.lifecyclestage||'']);
    return {status:'connected',name,category:'customers',headers:['Contacto','Email','Teléfono','Empresa','Estado'],rows,total:rows.length,text:'Contactos de HubSpot accesibles. Se muestran hasta 50.',images:[],source:'hubspot_api',mode:cfg.mode||'read'};
  }
  if(p==='instagram'){
    const id=cfg.accountId;if(!id)throw new Error('Falta Instagram Business Account ID');
    const j=await apiJson('https://graph.facebook.com/v20.0/'+encodeURIComponent(id)+'/media?fields=id,caption,media_type,media_url,permalink,timestamp&limit=25&access_token='+encodeURIComponent(cfg.token));
    const rows=(j.data||[]).map(x=>[x.timestamp||'',x.media_type||'',x.caption||'',x.permalink||'']);
    const images=(j.data||[]).filter(x=>/^IMAGE|CAROUSEL_ALBUM$/.test(x.media_type||'')&&x.media_url).map(x=>({src:x.media_url,alt:(x.caption||'Publicación de Instagram').slice(0,100)}));
    return {status:'connected',name,category:'social',headers:['Fecha','Tipo','Texto','Enlace'],rows,total:rows.length,text:'Publicaciones recientes de Instagram accesibles con la cuenta conectada.',images:images.slice(0,10),source:'instagram_graph_api',mode:cfg.mode||'read'};
  }
  if(p==='facebook'){
    const id=cfg.accountId;if(!id)throw new Error('Falta Facebook Page ID');
    const j=await apiJson('https://graph.facebook.com/v20.0/'+encodeURIComponent(id)+'/posts?fields=id,message,created_time,permalink_url&limit=25&access_token='+encodeURIComponent(cfg.token));
    const rows=(j.data||[]).map(x=>[x.created_time||'',x.message||'',x.permalink_url||'']);
    return {status:'connected',name,category:'social',headers:['Fecha','Texto','Enlace'],rows,total:rows.length,text:'Publicaciones recientes de Facebook accesibles con la página conectada.',images:[],source:'facebook_graph_api',mode:cfg.mode||'read'};
  }
  if(p==='linkedin'){
    const j=await apiJson('https://api.linkedin.com/v2/userinfo',{headers:auth});
    return {status:'connected',name,category:'social',headers:['Cuenta','Email'],rows:[[j.name||cfg.label||'LinkedIn',j.email||'']],total:1,text:'Cuenta de LinkedIn conectada. El acceso a publicaciones depende de los productos y scopes aprobados para la aplicación de LinkedIn.',images:[],source:'linkedin_api',mode:cfg.mode||'read'};
  }
  if(p==='x_twitter'){
    const user=await apiJson('https://api.x.com/2/users/by/username/'+encodeURIComponent(cfg.username||cfg.meta?.username||''),{headers:auth});
    let rows=[];if(user?.data?.id){const t=await apiJson('https://api.x.com/2/users/'+encodeURIComponent(user.data.id)+'/tweets?max_results=20&tweet.fields=created_at,public_metrics',{headers:auth});rows=(t.data||[]).map(x=>[x.created_at||'',x.text||'',String(x.public_metrics?.like_count||0),String(x.public_metrics?.retweet_count||0)])}
    return {status:'connected',name,category:'social',headers:['Fecha','Texto','Me gusta','Reposts'],rows,total:rows.length,text:'Publicaciones recientes de X accesibles con la cuenta conectada.',images:[],source:'x_api',mode:cfg.mode||'read'};
  }
  if(p==='whatsapp_business'){
    return {status:'connected',name,category:'whatsapp',headers:['Cuenta','Número','Estado'],rows:[[cfg.label||'WhatsApp Business',cfg.meta?.displayPhone||'', 'Conectado a Cloud API']],total:1,text:'WhatsApp Business está conectado a la Cloud API. Para recibir conversaciones nuevas de clientes, la aplicación de Meta debe apuntar su webhook al backend de VentaNexIA; la API no ofrece un historial general para descargar conversaciones antiguas.',images:[],source:'whatsapp_cloud_api',mode:cfg.mode||'read'};
  }
  return {status:'connected',name,category:'integration',headers:[],rows:[],total:0,text:'Integración conectada, pero este proveedor todavía no tiene lector de datos configurado.',images:[],source:'external_api',mode:cfg.mode||'read'};
}

async function queryShopifyAdmin(scope,question,state){
  const cfg=state.secret?.integrations?.shopify;
  if(!cfg?.shop||(!cfg?.token&&cfg?.authMode!=='client_credentials'))return {status:'not_connected',name:'Shopify'};
  const sg=(query,variables)=>shopifyCall(cfg,tok=>shopifyAdminGraphql(cfg.shop,tok,query,variables));
  let category=categoryForQuestion(question);if(category==='invoices')category='orders';
  let data={},headers=[],rows=[],total=null,images=[],text='',title=cfg.shopName||cfg.shop;
  if(['products','prices','stock'].includes(category)){
    data=await sg(`query VentaNexIAProducts { productsCount { count } products(first: 50) { nodes { id title handle status totalInventory featuredMedia { preview { image { url altText } } } variants(first: 10) { nodes { sku price inventoryQuantity } } } pageInfo { hasNextPage endCursor } } }`);
    total=Number(data.productsCount?.count??0);
    headers=['Producto','Estado','Stock total','SKU','Precio'];
    for(const p of data.products?.nodes||[]){const vars=p.variants?.nodes||[];if(vars.length){for(const v of vars)rows.push([p.title,p.status,String(p.totalInventory??''),v.sku||'',v.price||''])}else rows.push([p.title,p.status,String(p.totalInventory??''),'','']);const src=p.featuredMedia?.preview?.image?.url;if(src)images.push({src,alt:p.featuredMedia?.preview?.image?.altText||p.title})}
    text='Catálogo Shopify. Total de productos: '+total+'. Se muestran hasta 50 productos en esta consulta.';
  }else if(category==='orders'){
    data=await sg(`query VentaNexIAOrders { ordersCount { count } orders(first: 50, sortKey: CREATED_AT, reverse: true) { nodes { name createdAt displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount currencyCode } } customer { displayName email } } } }`);
    total=Number(data.ordersCount?.count??0);
    headers=['Pedido','Fecha','Cliente','Email','Pago','Preparación','Total'];
    rows=(data.orders?.nodes||[]).map(o=>[o.name,o.createdAt,o.customer?.displayName||'',o.customer?.email||'',o.displayFinancialStatus||'',o.displayFulfillmentStatus||'',(o.totalPriceSet?.shopMoney?.amount||'')+' '+(o.totalPriceSet?.shopMoney?.currencyCode||'')]);
    text='Pedidos Shopify. Total de pedidos accesibles: '+total+'. Se muestran hasta 50 pedidos recientes.';
  }else if(category==='customers'){
    data=await sg(`query VentaNexIACustomers { customersCount { count } customers(first: 50) { nodes { displayName email phone numberOfOrders amountSpent { amount currencyCode } } } }`);
    total=Number(data.customersCount?.count??0);
    headers=['Cliente','Email','Teléfono','Pedidos','Gasto'];
    rows=(data.customers?.nodes||[]).map(x=>[x.displayName||'',x.email||'',x.phone||'',String(x.numberOfOrders??''),(x.amountSpent?.amount||'')+' '+(x.amountSpent?.currencyCode||'')]);
    text='Clientes Shopify. Total de clientes accesibles: '+total+'. Se muestran hasta 50 clientes.';
  }else{
    data=await sg(`query VentaNexIAShop { shop { name myshopifyDomain primaryDomain { url } } productsCount { count } }`);
    total=Number(data.productsCount?.count??0);headers=['Tienda','Dominio','Productos'];rows=[[data.shop?.name||title,data.shop?.primaryDomain?.url||data.shop?.myshopifyDomain||'',String(total)]];
    text='Tienda Shopify conectada: '+(data.shop?.name||title)+'. Productos: '+total+'.';
  }
  return {status:'connected',name:'Shopify · '+title,category,url:'https://'+cfg.shop,title,total,headers,rows,text,images:images.slice(0,10),source:'shopify_admin_api',mode:cfg.mode||'read'};
}

async function queryPublicWebsite(scope,question){
  const raw=String(scope?.url||'').trim();if(!/^https:\/\//i.test(raw))return {status:'invalid_url',name:scope?.name||'Web'};
  const portal={id:'public-'+String(scope?.key||'web').replace(/[^a-z0-9_-]/gi,''),name:scope?.name||new URL(raw).hostname,url:raw,mode:'read'};
  const win=new BrowserWindow(windowOptions(portal,false));win.removeMenu();
  try{
    const root=await loadPage(win,raw),category=categoryForQuestion(question),candidates=classifyLinks(root.url,root.links||[]),target=candidates[category];
    const page=target&&sameOrigin(target.url,raw)?await loadPage(win,target.url):root;
    return {status:'connected',name:portal.name,category,url:page.url,title:page.title,total:null,headers:page.tables?.[0]?.headers||[],rows:(page.tables?.[0]?.rows||[]).slice(0,30),text:page.text.slice(0,22000),images:(page.images||[]).slice(0,10)};
  }finally{if(!win.isDestroyed())win.destroy()}
}

ipcMain.handle('portal:calibrate',async(_e,id)=>calibratePortal(clean(id,80)));
ipcMain.handle('portal:profile',async(_e,id)=>{const p=await getPortal(clean(id,80));return p?.profile||null});
ipcMain.handle('portal:adaptive-query',async(_e,id,question)=>{const p=await getPortal(clean(id,80));if(!p)throw new Error('Portal no encontrado');return queryPortal(p,String(question||''))});

ipcMain.removeHandler('chat:send');
ipcMain.handle('chat:send',async(_e,payload)=>{
  const input=Array.isArray(payload)?{messages:payload,scope:null}:(payload||{}),messages=input.messages||[],scope=input.scope||null;
  const question=lastUser(messages),s=await readState();let portals=(s.portals||[]).filter(p=>['read','write'].includes(p.mode)).slice(0,4),results=[];
  if(scope?.type==='portal')portals=portals.filter(p=>p.id===scope.id);
  if(scope?.type==='url'){portals=[];try{results.push(await queryPublicWebsite(scope,question))}catch(e){results.push({status:'error',name:scope.name||'Web',error:String(e?.message||e).slice(0,180)})}}
  if(scope?.type==='shopify'){portals=[];try{results.push(await queryShopifyAdmin(scope,question,s))}catch(e){results.push({status:'error',name:scope.name||'Shopify',error:String(e?.message||e).slice(0,180)})}}
  if(scope?.type==='integration'){portals=[];try{results.push(await queryIntegrationData(scope,question,s))}catch(e){results.push({status:'error',name:scope.name||'Integración',error:String(e?.message||e).slice(0,180)})}}
  if(scope?.type==='folder')portals=[];
  for(const p of portals){try{results.push(await queryPortal(p,question))}catch(e){results.push({status:'error',name:p.name,error:String(e?.message||e).slice(0,180)})}}
  const direct=deterministicReply(question,results);
  const images=[];for(const r of results)for(const img of r.images||[]){if(img?.src&&!images.some(x=>x.src===img.src))images.push({src:img.src,alt:img.alt||r.name})}
  if(direct){await audit('ai.chat','Respuesta estructurada desde '+(scope?.name||'portal')+': '+categoryForQuestion(question));return {reply:direct,source:'portal-structured',images:images.slice(0,8),portalStatus:results.map(r=>({name:r.name,status:r.status}))}}
  const local=await collectLocalContext(scope?.type==='folder'&&scope.folder?[scope.folder]:scope?[]:null);
  const portalFiles=results.filter(r=>r.status==='connected').map(r=>({path:'CONEXION '+r.name+' · '+r.category,content:JSON.stringify({source:r.source||(scope?.type==='url'?'public_website_read_only':'portal_private_read_only'),category:r.category,total:r.total,headers:r.headers,rows:r.rows,text:r.text,mode:r.mode||'read'},null,2)}));
  const combined=[...local,...portalFiles].slice(0,MAX_FILES);
  const response=await fetch(CLOUD+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'VentaNexIA-Desktop/'+app.getVersion()},body:JSON.stringify({messages:(messages||[]).slice(-20),localContext:combined,desktop:{customerId:s.secret?.customerId||null,deviceId:s.license?.deviceId||null,activationCode:s.secret?.activationCode||null,deviceKey:s.secret?.deviceKey||null,portalCount:portalFiles.length,scope:scope?{type:scope.type,name:scope.name||null}:null}})});
  const j=await response.json().catch(()=>({}));if(!response.ok)throw new Error(j.error||'No se pudo contactar con VentaNexIA');
  j.images=images.slice(0,8);j.portalStatus=results.map(r=>({name:r.name,status:r.status}));await audit('ai.chat','Consulta dirigida a '+(scope?.name||'todas las conexiones')+': '+portalFiles.length+' fuente(s), '+local.length+' archivo(s)');return j;
});

module.exports={calibratePortal};
