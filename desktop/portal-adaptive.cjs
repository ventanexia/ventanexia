const {app,BrowserWindow,ipcMain,safeStorage,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');

const CLOUD='https://www.ventanexia.es';
const MAX_FILES=80,MAX_CHARS=120000,MAX_FILE_CHARS=20000;
const TEXT_EXTENSIONS=new Set(['.txt','.csv','.json','.md','.log']);
const storeFile=()=>path.join(app.getPath('userData'),'secure-state.json');
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

async function readState(){
  try{
    const raw=JSON.parse(await fs.readFile(storeFile(),'utf8'));
    if(raw.secret&&safeStorage.isEncryptionAvailable()) raw.secret=JSON.parse(safeStorage.decryptString(Buffer.from(raw.secret,'base64'))); else raw.secret={};
    raw.permissions=raw.permissions||{folders:[]};raw.activity=raw.activity||[];raw.license=raw.license||{};raw.portals=Array.isArray(raw.portals)?raw.portals:[];
    return raw;
  }catch{return {permissions:{folders:[]},activity:[],license:{},portals:[],secret:{}}}
}
async function writeState(state){
  const out={...state,secret:state.secret||{}};
  if(safeStorage.isEncryptionAvailable()) out.secret=Buffer.from(safeStorage.encryptString(JSON.stringify(state.secret||{}))).toString('base64');
  await fs.writeFile(storeFile(),JSON.stringify(out,null,2),'utf8');
}
async function audit(type,detail){const s=await readState();s.activity=[{at:new Date().toISOString(),type,detail},...(s.activity||[])].slice(0,200);await writeState(s)}
async function getPortal(id){return (await readState()).portals.find(p=>p.id===id)||null}
async function patchPortal(id,patch){const s=await readState(),i=s.portals.findIndex(p=>p.id===id);if(i<0)return null;s.portals[i]={...s.portals[i],...patch};await writeState(s);return s.portals[i]}

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

async function collectLocalContext(){
  const s=await readState(),roots=s.permissions?.folders||[],files=[];let chars=0;
  async function walk(root,dir,depth){if(depth>6||files.length>=MAX_FILES||chars>=MAX_CHARS)return;let es=[];try{es=await fs.readdir(dir,{withFileTypes:true})}catch{return}for(const e of es){if(files.length>=MAX_FILES||chars>=MAX_CHARS)break;if(e.isSymbolicLink())continue;const full=path.join(dir,e.name);if(e.isDirectory()){await walk(root,full,depth+1);continue}if(!e.isFile()||!TEXT_EXTENSIONS.has(path.extname(e.name).toLowerCase()))continue;try{const text=(await fs.readFile(full,'utf8')).slice(0,MAX_FILE_CHARS),content=text.slice(0,MAX_CHARS-chars);if(content){files.push({path:path.relative(root,full),content});chars+=content.length}}catch{}}}
  for(const r of roots)await walk(r,r,0);return files;
}
function lastUser(messages=[]){for(let i=messages.length-1;i>=0;i--)if(messages[i]?.role==='user')return String(messages[i].content||'');return ''}

ipcMain.handle('portal:calibrate',async(_e,id)=>calibratePortal(clean(id,80)));
ipcMain.handle('portal:profile',async(_e,id)=>{const p=await getPortal(clean(id,80));return p?.profile||null});
ipcMain.handle('portal:adaptive-query',async(_e,id,question)=>{const p=await getPortal(clean(id,80));if(!p)throw new Error('Portal no encontrado');return queryPortal(p,String(question||''))});

ipcMain.removeHandler('chat:send');
ipcMain.handle('chat:send',async(_e,messages)=>{
  const question=lastUser(messages),s=await readState(),portals=(s.portals||[]).filter(p=>['read','write'].includes(p.mode)).slice(0,4),results=[];
  for(const p of portals){try{results.push(await queryPortal(p,question))}catch(e){results.push({status:'error',name:p.name,error:String(e?.message||e).slice(0,180)})}}
  const direct=deterministicReply(question,results);
  const images=[];for(const r of results)for(const img of r.images||[]){if(img?.src&&!images.some(x=>x.src===img.src))images.push({src:img.src,alt:img.alt||r.name})}
  if(direct){await audit('ai.chat',`Respuesta estructurada desde portal: ${categoryForQuestion(question)}`);return {reply:direct,source:'portal-structured',images:images.slice(0,8),portalStatus:results.map(r=>({name:r.name,status:r.status}))}}
  const local=await collectLocalContext();
  const portalFiles=results.filter(r=>r.status==='connected').map(r=>({path:`PORTAL ESTRUCTURADO ${r.name} · ${r.category}`,content:JSON.stringify({source:'portal_private_read_only',category:r.category,total:r.total,headers:r.headers,rows:r.rows,text:r.text},null,2)}));
  const combined=[...local,...portalFiles].slice(0,MAX_FILES);
  const response=await fetch(`${CLOUD}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':`VentaNexIA-Desktop/${app.getVersion()}`},body:JSON.stringify({messages:(messages||[]).slice(-20),localContext:combined,desktop:{customerId:s.secret?.customerId||null,deviceId:s.license?.deviceId||null,portalCount:portalFiles.length}})});
  const j=await response.json().catch(()=>({}));if(!response.ok)throw new Error(j.error||'No se pudo contactar con VentaNexIA');
  j.images=images.slice(0,8);j.portalStatus=results.map(r=>({name:r.name,status:r.status}));await audit('ai.chat',`Consulta adaptativa: ${portalFiles.length} portal(es), ${local.length} archivo(s)`);return j;
});

module.exports={calibratePortal};
