const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell,Notification}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const crypto=require('node:crypto');
const {ImapFlow}=require('imapflow');
const nodemailer=require('nodemailer');
const {EDITION,assertModuleIncluded,isMaster,connectionLimit,ownAgentLimit,employeeSlotLimit,orderChannelLimit,orderWebLevel}=require('./agent-policy.cjs');
const {storeFile,readState,writeState,updateState,audit}=require('./state-store.cjs');
const {gmailCall}=require('./gmail-auth.cjs');
const {shopifyCall,requestOwnedToken}=require('./shopify-auth.cjs');
const {listShopifyStores,getShopifyStore,hasShopifyStore,upsertShopifyStore,setActiveShopifyStore,removeShopifyStore,publicShopifyStore}=require('./shopify-stores.cjs');
const calendar=require('./calendar.cjs');
const externalAgents=require('./external-agent.cjs');
const erpConnectors=require('./erp.cjs');
const {staticRuntimeChecks,sanitizeState}=require('./runtime-health.cjs');
const direction=require('./direction-control.cjs');

const CLOUD='https://www.ventanexia.es';
const META_GRAPH_BASE='https://graph.facebook.com/v26.0';
const TEXT_EXTENSIONS=new Set(['.txt','.csv','.json','.md','.log']);
const BUSINESS_EXTENSIONS=new Set(['.csv','.xlsx','.xls','.xml','.json','.db','.sqlite','.sqlite3','.mdb','.accdb','.dbf','.fdb','.bak','.txt']);
const MAX_CONTEXT_FILES=80;
const MAX_CONTEXT_CHARS=120000;
const MAX_FILE_CHARS=20000;
const DISCOVERY_MAX_DIRS=6500;
const DISCOVERY_MAX_DEPTH=6;
const DISCOVERY_MAX_RESULTS=30;

const BUSINESS_WORDS=[
  'facturaplus','contaplus','sage','grupo sp','gruposp','a3','wolters','factusol','contasol','holded',
  'navision','dynamics','sap','odoo','crm','erp','factura','facturas','invoice','invoices','cliente','clientes',
  'venta','ventas','pedido','pedidos','contabilidad','accounting','empresa','empresas','data','datos','database',
  'backup','backups','copia','copias','export','exportacion','exportación'
];
const SKIP_DIRS=new Set([
  'windows','system volume information','$recycle.bin','node_modules','.git','temp','tmp','cache','caches',
  'inetcache','code cache','gpu cache','crashpad','logs','packages','package cache','npm-cache','pip','mozilla','chrome','edge'
]);

let mainWindow;
let workbenchWindow;

app.on('session-created',ses=>{
  try{ses.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false))}catch{}
  try{ses.setPermissionCheckHandler(()=>false)}catch{}
});
let discoveryCandidates=new Set();
async function postJson(url,body,timeoutMs=20000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':`VentaNexIA-Desktop/${app.getVersion()}`},body:JSON.stringify(body||{}),signal:controller.signal});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){const e=new Error(j.error||j.message||`Error ${r.status}`);e.code=j.code;e.data=j;throw e;}
    return j;
  }catch(e){
    if(e?.name==='AbortError'){const err=new Error('La conexión con el servidor ha tardado demasiado. Vuelve a intentarlo.');err.code='REQUEST_TIMEOUT';throw err;}
    throw e;
  }finally{clearTimeout(timer)}
}
async function ensureDeviceKey(){
  const s=await readState();
  s.secret=s.secret||{};
  if(!s.secret.deviceKey){s.secret.deviceKey=crypto.randomUUID();await writeState(s);}
  return s.secret.deviceKey;
}
function fingerprintHash(){
  const raw=[os.hostname(),os.platform(),os.arch(),os.homedir()].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}
function externalConnectionCount(s){
  const emails=emailAccountsFromState(s).length;
  const ints=Object.entries(s.secret?.integrations||{}).filter(([k,v])=>!['email','shopify'].includes(k)&&v).length;
  const portals=(Array.isArray(s.portals)?s.portals:[]).filter(p=>p&&p.url).length;
  return emails+ints+portals;
}
function assertConnectionCapacity(s,{adding=1}={}){
  if(isMaster(s.license))return true;
  const limit=connectionLimit(s.license),used=externalConnectionCount(s);
  if(used+adding<=limit)return true;
  const err=new Error('Has usado todas las conexiones incluidas en tu plan. Añade una conexión extra por 49 €/mes o cambia de plan.');
  err.code='CONNECTION_LIMIT';err.used=used;err.limit=limit;throw err;
}
function orderChannelUsageFromState(s){
  const items=[];
  for(const x of listShopifyStores(s))items.push({type:'shopify',label:'Shopify · '+(x.shopName||x.shop),shop:x.shop});
  for(const [key,x] of Object.entries(s.secret?.ordersErp?.stores||{})){
    const type=String(x?.id||String(key).split(':')[0]||'tienda');
    let host='';try{host=new URL(String(x?.url||'')).host}catch{}
    items.push({type,label:(type==='woocommerce'?'WooCommerce':type)+(host?' · '+host:'')});
  }
  return {used:items.length,items};
}
function assertOrderChannelCapacity(s,{adding=1}={}){
  if(isMaster(s.license))return true;
  const limit=orderChannelLimit(s.license),used=orderChannelUsageFromState(s).used;
  if(used+adding<=limit)return true;
  const err=new Error('Has usado '+used+' de '+limit+' canales de pedidos incluidos en tu plan. Para añadir otro canal, cambia a un plan con más canales.');
  err.code='ORDER_CHANNEL_LIMIT';err.used=used;err.limit=limit;throw err;
}
function publicLicenseState(s){
  const l=s.license||{},master=isMaster(l);
  return {
    activated:Boolean(s.secret?.customerId&&s.secret?.activationCode&&l.deviceId),
    customerId:s.secret?.customerId||l.customerId||null,
    deviceId:l.deviceId||null,
    edition:EDITION,
    master,
    unlimited:master,
    plan:master?'master':(l.plan||null),
    activeCount:Number(l.activeCount||0),
    limit:Number(l.limit||0),
    available:Number(l.available||0),
    extraDeviceMonthlyEur:Number(l.extraDeviceMonthlyEur||49),
    featurePolicy:l.featurePolicy||{},
    connectionLimit:master?null:connectionLimit(l),
    employeeSlotLimit:master?null:employeeSlotLimit(l),
    ownAgentLimit:master?null:ownAgentLimit(l),
    orderChannelLimit:master?null:orderChannelLimit(l),
    orderWebLevel:orderWebLevel(l),
    billingStatus:l.billingStatus||l.featurePolicy?.billing_status||null,
    paymentGraceUntil:l.paymentGraceUntil||l.featurePolicy?.payment_grace_until||null,
    paymentUrl:l.paymentUrl||l.featurePolicy?.payment_url||null,
    blocked:Boolean(l.blocked),
    blockReason:l.blockReason||null,
    lastCheckedAt:l.lastCheckedAt||null
  };
}
function createWindow(){
  mainWindow=new BrowserWindow({
    width:1220,height:820,minWidth:980,minHeight:680,
    backgroundColor:'#081a2d',
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,
      webSecurity:true,allowRunningInsecureContent:false,
      backgroundThrottling:false,
      devTools:false
    }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname,'renderer','index.html'));
  if(process.argv.includes('--background'))mainWindow.hide();
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url)||/^ms-quick-assist:/i.test(url)){shell.openExternal(url);return {action:'deny'}}return {action:'deny'}});
  mainWindow.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('file://'))e.preventDefault()});
}


ipcMain.handle('ui:set-zoom',async(event,factor=1)=>{
  const win=BrowserWindow.fromWebContents(event.sender);
  if(!win)return {ok:false};
  const safe=Math.max(0.9,Math.min(1.35,Number(factor)||1));
  win.webContents.setZoomFactor(safe);
  return {ok:true,factor:safe};
});
ipcMain.handle('ui:get-zoom',async(event)=>{
  const win=BrowserWindow.fromWebContents(event.sender);
  return {factor:win?.webContents?.getZoomFactor?.()||1};
});
ipcMain.handle('ui:open-workbench-window',async()=>{
  if(workbenchWindow&&!workbenchWindow.isDestroyed()){
    workbenchWindow.show();workbenchWindow.focus();
    return {ok:true,existing:true};
  }
  workbenchWindow=new BrowserWindow({
    width:1450,height:930,minWidth:1050,minHeight:720,
    show:false,
    title:'VentaNexIA · Carla',
    backgroundColor:'#031523',
    autoHideMenuBar:true,
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,
      webSecurity:true,allowRunningInsecureContent:false,
      backgroundThrottling:false,
      devTools:false
    }
  });
  workbenchWindow.removeMenu();
  await workbenchWindow.loadFile(path.join(__dirname,'renderer','index.html'),{query:{detached:'workbench'}});
  workbenchWindow.webContents.setZoomFactor(1.05);
  // Abre a tamaño cómodo; el usuario puede maximizar/restaurar con los controles nativos de Windows.
  workbenchWindow.show();
  workbenchWindow.focus();
  workbenchWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url)||/^ms-quick-assist:/i.test(url)){shell.openExternal(url);return {action:'deny'}}return {action:'deny'}});
  workbenchWindow.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('file://'))e.preventDefault()});
  workbenchWindow.on('closed',()=>{workbenchWindow=null});
  return {ok:true,existing:false};
});

function authorizedRootFor(target,folders=[]){
  const resolvedTarget=path.resolve(String(target||''));
  for(const folder of folders){
    const root=path.resolve(folder);
    const rel=path.relative(root,resolvedTarget);
    if(rel===''||(!rel.startsWith('..')&&!path.isAbsolute(rel)))return root;
  }
  return null;
}

async function collectAuthorizedContext(){
  const s=await readState();
  const roots=s.permissions?.folders||[];
  const files=[];
  let totalChars=0;
  async function walk(root,current,depth){
    if(depth>6||files.length>=MAX_CONTEXT_FILES||totalChars>=MAX_CONTEXT_CHARS)return;
    let entries=[];
    try{entries=await fs.readdir(current,{withFileTypes:true})}catch{return}
    for(const entry of entries){
      if(files.length>=MAX_CONTEXT_FILES||totalChars>=MAX_CONTEXT_CHARS)break;
      if(entry.isSymbolicLink())continue;
      const full=path.join(current,entry.name);
      if(entry.isDirectory()){await walk(root,full,depth+1);continue;}
      if(!entry.isFile()||!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))continue;
      try{
        const text=(await fs.readFile(full,'utf8')).slice(0,MAX_FILE_CHARS);
        const remaining=MAX_CONTEXT_CHARS-totalChars;
        const content=text.slice(0,remaining);
        if(!content)continue;
        files.push({path:path.relative(root,full),content});
        totalChars+=content.length;
      }catch{}
    }
  }
  for(const root of roots){
    if(files.length>=MAX_CONTEXT_FILES||totalChars>=MAX_CONTEXT_CHARS)break;
    await walk(root,root,0);
  }
  return files;
}

function normalized(s=''){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function hasBusinessWord(s=''){
  const n=normalized(s);
  return BUSINESS_WORDS.filter(w=>n.includes(normalized(w)));
}
function commonDiscoveryRoots(){
  const candidates=[
    app.getPath('documents'),app.getPath('desktop'),
    process.env.OneDrive,process.env.OneDriveCommercial,
    process.env.PROGRAMDATA,process.env.APPDATA,process.env.LOCALAPPDATA,
    process.env.ProgramFiles,process.env['ProgramFiles(x86)']
  ].filter(Boolean).map(x=>path.resolve(x));
  return [...new Set(candidates)];
}
function shouldSkipDir(name){return SKIP_DIRS.has(normalized(name));}
function probabilityLabel(score){return score>=24?'Muy probable':score>=13?'Probable':'Posible';}

async function scanBusinessData(roots){
  discoveryCandidates=new Set();
  const results=[];
  let visited=0;
  const rootSet=[...new Set((roots||[]).filter(Boolean).map(x=>path.resolve(x)))];

  async function walk(root,current,depth){
    if(depth>DISCOVERY_MAX_DEPTH||visited>=DISCOVERY_MAX_DIRS)return;
    visited++;
    let entries=[];
    try{entries=await fs.readdir(current,{withFileTypes:true})}catch{return}

    let score=0;
    const reasons=[];
    let businessFiles=0;
    let recentFiles=0;
    let newest=0;
    const pathWords=hasBusinessWord(current);
    if(pathWords.length){
      score+=Math.min(14,pathWords.length*5);
      reasons.push(`Nombre relacionado: ${pathWords.slice(0,3).join(', ')}`);
    }

    for(const entry of entries.slice(0,600)){
      if(entry.isSymbolicLink())continue;
      if(entry.isFile()){
        const ext=path.extname(entry.name).toLowerCase();
        const words=hasBusinessWord(entry.name);
        if(BUSINESS_EXTENSIONS.has(ext)){
          businessFiles++;
          score+=ext==='.dbf'||ext==='.mdb'||ext==='.accdb'||ext==='.db'||ext==='.sqlite'||ext==='.fdb'?3:1;
        }
        if(words.length)score+=Math.min(5,words.length*2);
        if(BUSINESS_EXTENSIONS.has(ext)||words.length){
          try{
            const st=await fs.stat(path.join(current,entry.name));
            newest=Math.max(newest,st.mtimeMs||0);
            if(Date.now()-(st.mtimeMs||0)<180*24*3600*1000)recentFiles++;
          }catch{}
        }
      }
    }
    if(businessFiles>=3){score+=4;reasons.push(`${businessFiles} archivos de datos compatibles`);}
    if(businessFiles>=10){score+=5;}
    if(recentFiles>=2){score+=4;reasons.push('Datos modificados recientemente');}
    if(score>=7){
      const item={path:current,score,level:probabilityLabel(score),businessFiles,recentFiles,lastModified:newest||null,reasons:[...new Set(reasons)].slice(0,4)};
      results.push(item);
    }

    for(const entry of entries){
      if(visited>=DISCOVERY_MAX_DIRS)break;
      if(!entry.isDirectory()||entry.isSymbolicLink()||shouldSkipDir(entry.name))continue;
      const next=path.join(current,entry.name);
      const rootName=normalized(path.basename(root));
      const heavy=rootName.includes('program files')||rootName.includes('appdata')||rootName.includes('programdata');
      if(heavy&&depth>=3&&!hasBusinessWord(next).length)continue;
      await walk(root,next,depth+1);
    }
  }

  for(const root of rootSet){
    if(visited>=DISCOVERY_MAX_DIRS)break;
    await walk(root,root,0);
  }
  const unique=new Map();
  results.sort((a,b)=>b.score-a.score);
  for(const r of results){
    if(!unique.has(r.path))unique.set(r.path,r);
    if(unique.size>=DISCOVERY_MAX_RESULTS)break;
  }
  const final=[...unique.values()];
  discoveryCandidates=new Set(final.map(x=>path.resolve(x.path)));
  await audit('discovery.scan',`Búsqueda local por metadatos: ${visited} carpetas revisadas, ${final.length} candidatas`);
  return {roots:rootSet,visited,results:final};
}

ipcMain.handle('system:status',async()=>({platform:process.platform,hostname:os.hostname(),version:app.getVersion(),encrypted:safeStorage.isEncryptionAvailable(),cloud:CLOUD}));
ipcMain.handle('secretary:notify',async(_event,payload={})=>{
  const title=String(payload.title||'VentaNexIA').replace(/[\r\n]+/g,' ').slice(0,100);
  const body=String(payload.body||'').replace(/[\r\n]+/g,' ').slice(0,260);
  if(!body)return {ok:false};
  try{if(Notification.isSupported())new Notification({title,body}).show();return {ok:true}}catch{return {ok:false}}
});
ipcMain.handle('state:get',async()=>{const s=await readState();return {permissions:s.permissions||{folders:[]},activity:s.activity||[],paired:Boolean(s.secret?.deviceToken),license:publicLicenseState(s)}});

ipcMain.handle('license:activate',async(_e,payload={})=>{
  const customerId=String(payload.customerId||'').trim().toUpperCase();
  const activationCode=String(payload.activationCode||'').trim();
  if(!customerId||!activationCode)throw new Error('Introduce el ID de cliente y el código de activación');
  const deviceKey=await ensureDeviceKey();
  const result=await postJson(`${CLOUD}/api/device-register`,{customerId,activationCode,deviceKey,fingerprintHash:fingerprintHash(),deviceName:os.hostname(),platform:`${os.platform()} ${os.release()} ${os.arch()}`,appVersion:app.getVersion()});
  const s=await readState();
  s.secret=s.secret||{};
  s.secret.customerId=customerId;
  s.secret.activationCode=activationCode;
  s.license={customerId,deviceId:result.deviceId||null,plan:result.planKey||null,featurePolicy:result.featurePolicy||{},activeCount:result.activeCount||0,limit:result.limit||0,available:result.available||0,extraDeviceMonthlyEur:result.extraDeviceMonthlyEur||49,lastCheckedAt:new Date().toISOString()};
  s.support=s.support||{};if(s.support.autoMode===undefined)s.support.autoMode=true;
  if(s.support.autoMode)app.setLoginItemSettings({openAtLogin:true,args:['--background']});
  await writeState(s);await audit('license.device_activated',`Cliente ${customerId}; dispositivo ${result.deviceId||deviceKey}`);
  return publicLicenseState(await readState());
});
ipcMain.handle('license:status',async()=>{
  const s=await readState();
  if(!s.secret?.customerId||!s.secret?.activationCode)return publicLicenseState(s);
  const deviceKey=await ensureDeviceKey();
  try{
    const result=await postJson(`${CLOUD}/api/device-status`,{customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey});
    const fresh=await readState();
    fresh.license={...(fresh.license||{}),customerId:result.customerId||s.secret.customerId,deviceId:result.deviceId||fresh.license?.deviceId||null,plan:result.planKey||fresh.license?.plan||null,featurePolicy:result.featurePolicy||fresh.license?.featurePolicy||{},billingStatus:result.featurePolicy?.billing_status||null,paymentGraceUntil:result.featurePolicy?.payment_grace_until||null,paymentUrl:result.featurePolicy?.payment_url||null,blocked:false,blockReason:null,activeCount:result.activeCount||0,limit:result.limit||0,available:result.available||0,extraDeviceMonthlyEur:result.extraDeviceMonthlyEur||49,lastCheckedAt:new Date().toISOString()};
    await writeState(fresh);
    return publicLicenseState(fresh);
  }catch(e){
    if(['PAYMENT_REQUIRED','LICENSE_NOT_ACTIVE'].includes(String(e?.code||''))){
      const fresh=await readState(),old=fresh.license||{},fp=old.featurePolicy||{};
      fresh.license={...old,billingStatus:fp.billing_status||old.billingStatus||'payment_due',paymentGraceUntil:fp.payment_grace_until||old.paymentGraceUntil||null,paymentUrl:e?.data?.paymentUrl||fp.payment_url||old.paymentUrl||null,blocked:true,blockReason:String(e.code),lastCheckedAt:new Date().toISOString()};
      await writeState(fresh);return publicLicenseState(fresh);
    }
    throw e;
  }
});

const VNX_WORK_FOLDERS=['Clientes','Pedidos','Compras','Informes','Documentos','Captacion','Exportaciones','Historial'];
async function ensureVentaNexiaWorkspace(){
  const root=path.join(app.getPath('documents'),'VentaNexIA');
  await fs.mkdir(root,{recursive:true});
  for(const name of VNX_WORK_FOLDERS)await fs.mkdir(path.join(root,name),{recursive:true});
  const s=await readState();s.permissions=s.permissions||{folders:[]};
  if(!s.permissions.folders.includes(root))s.permissions.folders.push(root);
  s.workspace={...(s.workspace||{}),root,createdAt:s.workspace?.createdAt||new Date().toISOString()};
  await writeState(s);return {root,folders:VNX_WORK_FOLDERS.map(name=>({name,path:path.join(root,name)}))};
}
function safeWorkText(v=''){return String(v||'').replace(/\b(?:password|contrase(?:n|ñ)a|token|secret|api[_ -]?key|authorization|cookie|credencial(?:es)?)\b\s*[:=]?\s*[^\s,;]+/gi,'[DATO SEGURO OMITIDO]')}
function safeWorkName(v='trabajo'){return String(v||'trabajo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._ -]+/g,'').trim().replace(/\s+/g,'-').slice(0,70)||'trabajo'}
async function uniqueWorkFile(dir,base,ext='.md'){
  let file=path.join(dir,base+ext),n=2;while(true){try{await fs.access(file);file=path.join(dir,base+'-'+n+++ext)}catch{return file}}
}
ipcMain.handle('workspace:ensure',async()=>ensureVentaNexiaWorkspace());
ipcMain.handle('workspace:save',async(_e,payload={})=>{
  const ws=await ensureVentaNexiaWorkspace(),category=VNX_WORK_FOLDERS.includes(payload.category)?payload.category:'Documentos';
  const dir=path.join(ws.root,category),stamp=new Date().toISOString().replace(/[:.]/g,'-'),base=safeWorkName(payload.name||category+'-'+stamp);
  const file=await uniqueWorkFile(dir,base,'.md'),content=safeWorkText(payload.content||'');await fs.writeFile(file,content,'utf8');await audit('workspace.saved',category+' · '+path.basename(file));return {ok:true,file,category};
});
ipcMain.handle('workspace:history',async()=>{
  const ws=await ensureVentaNexiaWorkspace(),out=[];for(const f of ws.folders){let names=[];try{names=await fs.readdir(f.path)}catch{}for(const name of names.slice(-100)){const full=path.join(f.path,name);try{const st=await fs.stat(full);if(st.isFile())out.push({category:f.name,name,path:full,updatedAt:st.mtime.toISOString()})}catch{}}}return out.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,250);
});

ipcMain.handle('folder:choose',async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{properties:['openDirectory'],title:'Autorizar carpeta para VentaNexIA'});
  if(r.canceled||!r.filePaths[0])return null;
  const folder=r.filePaths[0],s=await readState();
  s.permissions=s.permissions||{folders:[]};
  if(!s.permissions.folders.includes(folder))s.permissions.folders.push(folder);
  await writeState(s);await audit('permission.granted',`Carpeta autorizada: ${folder}`);return folder;
});
ipcMain.handle('folder:revoke',async(_e,folder)=>{const s=await readState();s.permissions.folders=(s.permissions?.folders||[]).filter(x=>x!==folder);await writeState(s);await audit('permission.revoked',`Carpeta revocada: ${folder}`);return true});
ipcMain.handle('folder:list',async(_e,folder)=>{
  const s=await readState();const root=authorizedRootFor(folder,s.permissions?.folders||[]);if(!root)throw new Error('Carpeta no autorizada');
  const current=path.resolve(folder);const items=await fs.readdir(current,{withFileTypes:true});await audit('folder.read',`Listado leído: ${current}`);
  return {root,folder:current,items:items.slice(0,200).filter(x=>!x.isSymbolicLink()).map(x=>({name:x.name,type:x.isDirectory()?'folder':'file',path:path.join(current,x.name)}))};
});
ipcMain.handle('folder:create-test',async(_e,folder)=>{const s=await readState();if(!(s.permissions?.folders||[]).includes(folder))throw new Error('Carpeta no autorizada');const file=path.join(folder,`ventanexia-prueba-${Date.now()}.txt`);await fs.writeFile(file,'Archivo creado por VentaNexIA Desktop tras autorización explícita.\n','utf8');await audit('file.created',file);return file});

ipcMain.handle('discovery:scan-common',async()=>scanBusinessData(commonDiscoveryRoots()));
ipcMain.handle('discovery:choose-scan',async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{properties:['openDirectory','multiSelections'],title:'Elige dónde quieres que VentaNexIA busque datos empresariales'});
  if(r.canceled||!r.filePaths.length)return null;
  return scanBusinessData(r.filePaths);
});
ipcMain.handle('discovery:authorize',async(_e,candidate)=>{
  const resolved=path.resolve(String(candidate||''));
  if(!discoveryCandidates.has(resolved))throw new Error('Esta carpeta no pertenece a la búsqueda actual');
  const st=await fs.stat(resolved);if(!st.isDirectory())throw new Error('La ruta no es una carpeta');
  const s=await readState();s.permissions=s.permissions||{folders:[]};
  if(!s.permissions.folders.includes(resolved))s.permissions.folders.push(resolved);
  await writeState(s);await audit('permission.granted',`Carpeta autorizada desde detección: ${resolved}`);return true;
});

function normalizeShopifyShop(value=''){
  let v=String(value||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const admin=v.match(/^admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/);
  if(admin)return admin[1]+'.myshopify.com';
  if(v.includes('/'))v=v.split('/')[0];
  if(/^[a-z0-9][a-z0-9-]*$/.test(v))v+='.myshopify.com';
  return v;
}
async function resolveShopifyShop(input=''){
  const v=normalizeShopifyShop(input);
  if(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(v))return v;
  if(!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v))throw new Error('Indica el nombre de tu tienda Shopify o su dominio interno, por ejemplo tienda.myshopify.com.');
  let html='';
  try{
    const ac=new AbortController();const timer=setTimeout(()=>ac.abort(),12000);
    const r=await fetch('https://'+v,{headers:{'User-Agent':'Mozilla/5.0 VentaNexIA'},signal:ac.signal,redirect:'follow'});
    clearTimeout(timer);html=await r.text();
  }catch{}
  const m=html.match(/Shopify\.shop\s*=\s*"([a-z0-9][a-z0-9-]*\.myshopify\.com)"/i)||html.match(/"myshopifyDomain"\s*:\s*"([a-z0-9][a-z0-9-]*\.myshopify\.com)"/i);
  if(!m)throw new Error('No he encontrado una tienda Shopify en «'+v+'». Escribe su dominio interno (termina en .myshopify.com); lo ves en Shopify > Configuración > Dominios.');
  return m[1].toLowerCase();
}
async function shopifyGraphql(shop,token,query,variables={}){
  const host=normalizeShopifyShop(shop);
  if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host))throw new Error('Usa el dominio interno de Shopify, por ejemplo tienda.myshopify.com');
  const r=await fetch(`https://${host}/admin/api/2026-07/graphql.json`,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-Shopify-Access-Token':token,'User-Agent':`VentaNexIA-Desktop/${app.getVersion()}`},
    body:JSON.stringify({query,variables})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.errors){const msg=j?.errors?.[0]?.message||`Shopify respondió ${r.status}`;throw new Error(msg)}
  return j.data||{};
}

function normalizeProviderKey(v=''){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_')}
async function providerFetch(url,opts={}){
  const r=await fetch(url,opts);const text=await r.text();let j={};try{j=JSON.parse(text)}catch{j={raw:text.slice(0,500)}}
  if(!r.ok){const msg=j?.error?.message||j?.message||j?.error_description||('HTTP '+r.status);throw new Error(msg)}
  return j;
}
async function verifyIntegration(provider,payload){
  const token=String(payload.token||'').trim(),account=String(payload.account||'').trim(),accountId=String(payload.accountId||'').trim(),username=String(payload.username||'').trim();
  if(!token)throw new Error('Falta el token de acceso');
  if(provider==='gmail'){
    const j=await providerFetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+token}});
    return {label:j.emailAddress||account||'Gmail',meta:{email:j.emailAddress||account||'',messagesTotal:j.messagesTotal||0,threadsTotal:j.threadsTotal||0}};
  }
  if(provider==='microsoft_365'){
    const j=await providerFetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',{headers:{Authorization:'Bearer '+token}});
    return {label:j.displayName||j.mail||account||'Microsoft 365',meta:{id:j.id||'',email:j.mail||j.userPrincipalName||account||''}};
  }
  if(provider==='google_calendar'){
    const j=await providerFetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:'Bearer '+token}});
    return {label:j.email||account||'Google Calendar',meta:{id:j.id||'',email:j.email||account||'',name:j.name||''}};
  }
  if(provider==='microsoft_calendar'){
    const j=await providerFetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName',{headers:{Authorization:'Bearer '+token}});
    return {label:j.displayName||j.mail||account||'Microsoft Calendar',meta:{id:j.id||'',email:j.mail||j.userPrincipalName||account||''}};
  }
  if(provider==='hubspot'){
    const j=await providerFetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1',{headers:{Authorization:'Bearer '+token}});
    return {label:'HubSpot',meta:{sampleCount:Array.isArray(j.results)?j.results.length:0}};
  }
  if(provider==='meta_social'){
    const pages=await providerFetch(META_GRAPH_BASE+'/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username,name}&access_token='+encodeURIComponent(token));
    const list=Array.isArray(pages.data)?pages.data.filter(x=>x?.id):[];
    if(!list.length)throw new Error('No se encontró ninguna página de Facebook administrada por esta autorización');
    const page=list.find(x=>x.instagram_business_account?.id)||list[0];
    const pageToken=String(page.access_token||token);
    let ig=page.instagram_business_account||null;
    if(ig?.id){
      try{ig=await providerFetch(META_GRAPH_BASE+'/'+encodeURIComponent(ig.id)+'?fields=id,username,name&access_token='+encodeURIComponent(pageToken))}catch{}
    }
    const pageName=page.name||'Página de Facebook';
    const igLabel=ig?.username?'@'+ig.username:(ig?.name||'');
    return {
      label:'Meta · '+pageName+(igLabel?' + '+igLabel:''),
      meta:{
        pageId:page.id,pageName,pageTasks:Array.isArray(page.tasks)?page.tasks:[],
        instagramId:ig?.id||'',instagramUsername:ig?.username||'',instagramName:ig?.name||'',
        capabilities:{facebook:true,instagram:Boolean(ig?.id)}
      },
      secret:{pageAccessToken:pageToken},
      accountId:page.id
    };
  }
  if(provider==='instagram'){
    const pages=await providerFetch(META_GRAPH_BASE+'/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token='+encodeURIComponent(token));
    const list=(pages.data||[]).filter(x=>x.instagram_business_account?.id);
    let page=list[0]||null;
    if(accountId)page=list.find(x=>x.instagram_business_account?.id===accountId)||page;
    if(!page)throw new Error('No se encontró ninguna cuenta profesional de Instagram vinculada a una página de Facebook');
    const id=accountId||page.instagram_business_account.id;
    const pageToken=String(page.access_token||token);
    const j=await providerFetch(META_GRAPH_BASE+'/'+encodeURIComponent(id)+'?fields=id,username,name&access_token='+encodeURIComponent(pageToken));
    return {label:j.username?'@'+j.username:(j.name||'Instagram'),meta:{id:j.id||id,username:j.username||'',name:j.name||'',pageId:page.id||'',pageName:page.name||''},secret:{pageAccessToken:pageToken},accountId:j.id||id};
  }
  if(provider==='facebook'){
    const pages=await providerFetch(META_GRAPH_BASE+'/me/accounts?fields=id,name,access_token,tasks&access_token='+encodeURIComponent(token));
    const list=(pages.data||[]).filter(x=>x?.id);
    let page=accountId?list.find(x=>x.id===accountId):list[0];
    if(!page)throw new Error('No se encontró ninguna página de Facebook vinculada a esta autorización');
    const pageToken=String(page.access_token||token);
    const j=await providerFetch(META_GRAPH_BASE+'/'+encodeURIComponent(page.id)+'?fields=id,name&access_token='+encodeURIComponent(pageToken));
    return {label:j.name||'Facebook',meta:{id:j.id||page.id,name:j.name||page.name||'',tasks:Array.isArray(page.tasks)?page.tasks:[]},secret:{pageAccessToken:pageToken},accountId:j.id||page.id};
  }
  if(provider==='whatsapp_business'){
    let id=accountId,business=null,waba=null;
    const businesses=await providerFetch(META_GRAPH_BASE+'/me/businesses?fields=id,name&access_token='+encodeURIComponent(token));
    business=businesses.data?.[0]||null;
    if(!id){
      if(!business)throw new Error('No se encontró un portfolio empresarial de Meta autorizado');
      const wabas=await providerFetch(META_GRAPH_BASE+'/'+encodeURIComponent(business.id)+'/owned_whatsapp_business_accounts?fields=id,name&access_token='+encodeURIComponent(token));
      waba=wabas.data?.[0]||null;if(!waba)throw new Error('No se encontró una cuenta de WhatsApp Business autorizada');
      const phones=await providerFetch(META_GRAPH_BASE+'/'+encodeURIComponent(waba.id)+'/phone_numbers?fields=id,display_phone_number,verified_name&access_token='+encodeURIComponent(token));
      id=phones.data?.[0]?.id;if(!id)throw new Error('No se encontró un número de WhatsApp Business autorizado');
    }
    const j=await providerFetch(META_GRAPH_BASE+'/'+encodeURIComponent(id)+'?fields=id,display_phone_number,verified_name&access_token='+encodeURIComponent(token));
    return {label:j.verified_name||j.display_phone_number||'WhatsApp Business',meta:{phoneNumberId:j.id||id,displayPhone:j.display_phone_number||'',verifiedName:j.verified_name||'',businessId:business?.id||'',businessName:business?.name||'',wabaId:waba?.id||'',wabaName:waba?.name||''},accountId:j.id||id};
  }
  if(provider==='linkedin'){
    const j=await providerFetch('https://api.linkedin.com/v2/userinfo',{headers:{Authorization:'Bearer '+token}});
    return {label:j.name||j.email||'LinkedIn',meta:{sub:j.sub||'',email:j.email||''}};
  }
  if(provider==='x_twitter'){
    const j=await providerFetch(username?'https://api.x.com/2/users/by/username/'+encodeURIComponent(username):'https://api.x.com/2/users/me',{headers:{Authorization:'Bearer '+token}});
    return {label:j?.data?.name||(j?.data?.username?'@'+j.data.username:'X'),meta:{id:j?.data?.id||'',username:j?.data?.username||username||''},username:j?.data?.username||username||''};
  }
  throw new Error('Proveedor todavía no soportado');
}

function emailAccountsFromState(s){
  const out=[];
  for(const x of s.secret?.emailAccounts||[])if(x)out.push(x);
  const primary=s.secret?.integrations?.email;
  if(primary&&!out.some(x=>(x.meta?.email||x.label||x.account)===(primary.meta?.email||primary.label||primary.account)))out.push(primary);
  return out;
}
function addMasterEmailAccount(s,entry){
  s.secret=s.secret||{};s.secret.integrations=s.secret.integrations||{};
  if(!isMaster(s.license)){s.secret.integrations.email=entry;return;}
  s.secret.emailAccounts=Array.isArray(s.secret.emailAccounts)?s.secret.emailAccounts:[];
  const id=String(entry.meta?.email||entry.label||entry.account||entry.username||'').trim().toLowerCase();
  const i=s.secret.emailAccounts.findIndex(x=>String(x.meta?.email||x.label||x.account||x.username||'').trim().toLowerCase()===id);
  if(i>=0)s.secret.emailAccounts[i]=entry;else s.secret.emailAccounts.push(entry);
  s.secret.integrations.email=s.secret.emailAccounts[0]||entry;
}


const CONNECTION_HEALTH_TTL=90*1000;
const connectionHealthCache=new Map();
function integrationAccountKey(x={}){
  return String(x.meta?.email||x.label||x.account||x.username||x.accountId||x.meta?.id||x.meta?.phoneNumberId||'').trim().toLowerCase();
}
function clearConnectionHealth(){connectionHealthCache.clear()}
function healthCacheKey(module,x={},index=0){
  return [module,integrationAccountKey(x)||index,String(x.connectedAt||''),String(x.tokenObtainedAt||''),String(x.shop||'')].join('|');
}
async function withHealthTimeout(promise,ms=12000){
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error('La comprobación ha tardado demasiado.');e.code='HEALTH_TIMEOUT';reject(e)},ms)})
  ]).finally(()=>clearTimeout(timer));
}
function integrationExpiryMs(x={}){
  const secs=Number(x.tokenExpiresIn||0),from=Number(x.tokenObtainedAt)||Date.parse(x.connectedAt||'')||0;
  return secs>0&&from>0?from+secs*1000:0;
}
async function persistIntegrationPatch(module,target,patch){
  const key=integrationAccountKey(target);
  await updateState(st=>{
    st.secret=st.secret||{};st.secret.integrations=st.secret.integrations||{};
    if(module==='email'){
      for(const x of st.secret.emailAccounts||[])if(integrationAccountKey(x)===key)Object.assign(x,patch);
      const primary=st.secret.integrations.email;if(primary&&integrationAccountKey(primary)===key)Object.assign(primary,patch);
    }else{
      const x=st.secret.integrations[module];if(x)Object.assign(x,patch);
    }
    return st;
  });
}
async function refreshStoredOAuth(module,entry){
  const rt=String(entry?.refreshToken||'').trim();
  if(!rt)throw new Error('La autorización ha caducado y necesita volver a conectarse.');
  const st=await readState();
  const j=await postJson(CLOUD+'/api/oauth-refresh',{
    provider:entry.provider,refreshToken:rt,
    customerId:st.secret?.customerId||'',activationCode:st.secret?.activationCode||'',deviceKey:st.secret?.deviceKey||''
  });
  if(!j?.access_token)throw new Error('No se pudo renovar la autorización.');
  const patch={token:j.access_token,tokenObtainedAt:Date.now(),tokenExpiresIn:Number(j.expires_in||3600)};
  Object.assign(entry,patch);await persistIntegrationPatch(module,entry,patch);
  return j.access_token;
}
async function verifyGenericMailHealth(entry){
  const gm=entry?.genericMail||{};
  if(!gm.username||!gm.password||!gm.imapHost||!gm.smtpHost)throw new Error('Faltan datos para comprobar este correo.');
  const imapPort=Number(gm.imapPort||993),smtpPort=Number(gm.smtpPort||465);
  const imap=new ImapFlow({host:gm.imapHost,port:imapPort,secure:imapPort===993,auth:{user:gm.username,pass:gm.password},logger:false});
  try{await withHealthTimeout(imap.connect(),9000);await imap.logout()}catch(e){try{await imap.logout()}catch{};throw new Error('No responde el correo entrante: '+String(e?.message||e).slice(0,150))}
  const transport=nodemailer.createTransport({host:gm.smtpHost,port:smtpPort,secure:smtpPort===465,requireTLS:smtpPort!==465,auth:{user:gm.username,pass:gm.password}});
  try{await withHealthTimeout(transport.verify(),9000)}catch(e){throw new Error('No responde el envío de correo: '+String(e?.message||e).slice(0,150))}
  return true;
}
async function verifyStoredIntegration(module,entry){
  if(!entry)return {connected:false,state:'disconnected',reason:'No configurado'};
  const provider=normalizeProviderKey(entry.provider||module);
  try{
    if(module==='email'&&entry.genericMail){
      await verifyGenericMailHealth(entry);
    }else if(provider==='gmail'){
      await withHealthTimeout(gmailCall(entry,tok=>verifyIntegration('gmail',{...entry,token:tok})),12000);
    }else{
      const exp=integrationExpiryMs(entry);
      if(entry.refreshToken&&exp&&Date.now()>=exp-120000)await refreshStoredOAuth(module,entry);
      try{await withHealthTimeout(verifyIntegration(provider,entry),12000)}
      catch(first){
        if(!entry.refreshToken)throw first;
        await refreshStoredOAuth(module,entry);
        await withHealthTimeout(verifyIntegration(provider,entry),12000);
      }
    }
    return {connected:true,state:'connected',reason:'Conexión verificada',checkedAt:new Date().toISOString()};
  }catch(e){
    return {connected:false,state:'reconnect',reason:String(e?.message||e).replace(/^Error invoking remote method[^:]*:\s*/i,'').slice(0,180),checkedAt:new Date().toISOString()};
  }
}
async function liveIntegrationHealth(module,entry,index=0,{force=false}={}){
  const key=healthCacheKey(module,entry,index),cached=connectionHealthCache.get(key);
  if(!force&&cached&&Date.now()-cached.at<CONNECTION_HEALTH_TTL)return cached.value;
  const value=await verifyStoredIntegration(module,entry);
  connectionHealthCache.set(key,{at:Date.now(),value});
  return value;
}
async function liveShopifyHealth(store,{force=false}={}){
  if(!store)return {connected:false,state:'disconnected',reason:'No configurado'};
  const key='shopify|'+String(store.shop||'')+'|'+String(store.connectedAt||'')+'|'+String(store.expiresAt||'');
  const cached=connectionHealthCache.get(key);
  if(!force&&cached&&Date.now()-cached.at<CONNECTION_HEALTH_TTL)return cached.value;
  let value;
  try{
    const data=await withHealthTimeout(shopifyCall(store,tok=>shopifyGraphql(store.shop,tok,`query VentaNexIAHealth { shop { name myshopifyDomain } }`)),12000);
    value={connected:true,state:'connected',reason:'Conexión verificada',checkedAt:new Date().toISOString(),shopName:data?.shop?.name||store.shopName||store.shop};
  }catch(e){
    value={connected:false,state:'reconnect',reason:String(e?.message||e).slice(0,180),checkedAt:new Date().toISOString(),shopName:store.shopName||store.shop};
  }
  connectionHealthCache.set(key,{at:Date.now(),value});
  return value;
}
ipcMain.handle('email:connect-generic',async(_e,payload={})=>{
  const preState=await readState();
  const policyState=await readState();assertModuleIncluded(policyState.license,'email');
  const email=String(payload.email||'').trim();
  const username=String(payload.username||email).trim();
  const password=String(payload.password||'');
  const imapHost=String(payload.imapHost||'').trim();
  const smtpHost=String(payload.smtpHost||'').trim();
  const imapPort=Number(payload.imapPort||993);
  const smtpPort=Number(payload.smtpPort||465);
  const provider=normalizeProviderKey(payload.provider||'generic_imap');
  const exists=emailAccountsFromState(preState).some(x=>integrationAccountKey(x)===email.toLowerCase()&&email);
  if(!exists)assertConnectionCapacity(preState);
  if(!email||!username||!password||!imapHost||!smtpHost)throw new Error('Faltan datos de conexión del correo');
  const imapSecure=imapPort===993;
  const smtpSecure=smtpPort===465;
  const imap=new ImapFlow({host:imapHost,port:imapPort,secure:imapSecure,auth:{user:username,pass:password},logger:false});
  try{await imap.connect();await imap.logout()}catch(e){try{await imap.logout()}catch{};throw new Error('No se pudo conectar al correo entrante (IMAP): '+String(e?.message||e).slice(0,180))}
  const transport=nodemailer.createTransport({host:smtpHost,port:smtpPort,secure:smtpSecure,requireTLS:!smtpSecure,auth:{user:username,pass:password}});
  try{await transport.verify()}catch(e){throw new Error('El correo entrante funciona, pero no se pudo verificar el envío (SMTP): '+String(e?.message||e).slice(0,180))}
  const s=await readState();
  addMasterEmailAccount(s,{provider,module:'email',account:email,label:email,mode:'write',connectedAt:new Date().toISOString(),genericMail:{email,username,password,imapHost,imapPort,smtpHost,smtpPort}});
  await writeState(s);clearConnectionHealth();await audit('integration.connected','email · '+provider+' · '+email);
  return {connected:true,label:email,provider,mode:'write'};
});

ipcMain.handle('oauth:start',async(_e,payload={})=>{
  const s=await readState();
  const provider=normalizeProviderKey(payload.provider),module=normalizeProviderKey(payload.module||provider);
  assertModuleIncluded(s.license,module);
  if(module!=='email'&&!s.secret?.integrations?.[module])assertConnectionCapacity(s);
  const shopValue=provider==='shopify'?await resolveShopifyShop(payload.shop):String(payload.shop||'').trim();
  const result=await postJson(CLOUD+'/api/oauth-start',{provider,module,shop:shopValue,account:String(payload.account||'').trim(),customerId:s.secret?.customerId||null,deviceId:s.license?.deviceId||null});
  if(!result.authUrl||!result.state)throw new Error('No se pudo iniciar la autorización');
  shell.openExternal(result.authUrl).catch(()=>{});
  audit('oauth.started',module+' · '+provider).catch(()=>{});
  return {state:result.state,provider,module,authUrl:result.authUrl,expiresIn:result.expiresIn||900};
});
const oauthCollected=new Map();
const oauthBusy=new Map();
function pruneOauthCollected(){const limit=Date.now()-20*60*1000;for(const [k,v] of oauthCollected)if(v.at<limit)oauthCollected.delete(k)}
ipcMain.handle('oauth:status',(_e,payload={})=>{
  const key=String(payload?.state||'');
  if(oauthBusy.has(key))return oauthBusy.get(key);
  const run=oauthStatusOnce(payload).finally(()=>oauthBusy.delete(key));
  oauthBusy.set(key,run);
  return run;
});
async function oauthStatusOnce(payload={}){
  const s=await readState(),stateKey=String(payload.state||'');
  pruneOauthCollected();
  const kept=oauthCollected.get(stateKey);
  if(kept?.final)return kept.final;
  let result=kept?.result;
  if(!result){
    result=await postJson(CLOUD+'/api/oauth-status',{state:stateKey,deviceId:s.license?.deviceId||null});
    if(result.status!=='completed')return result;
    oauthCollected.set(stateKey,{result,final:null,at:Date.now()});
  }
  const done=out=>{oauthCollected.set(stateKey,{result,final:out,at:Date.now()});return out};
  const provider=normalizeProviderKey(result.provider),module=normalizeProviderKey(result.module||provider),token=String(result.token?.access_token||'').trim();
  assertModuleIncluded(s.license,module);
  if(!token)throw new Error('El proveedor no devolvió un token de acceso');
  if(provider==='shopify'){
    const shop=String(result.shop||'').trim();
    if(!hasShopifyStore(s,shop))assertOrderChannelCapacity(s);
    const data=await shopifyGraphql(shop,token,`query VentaNexIAConnectionCheck { shop { name myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`);
    const scopes=(data.currentAppInstallation?.accessScopes||[]).map(x=>x.handle).filter(Boolean);
    await updateState(fresh=>{upsertShopifyStore(fresh,{shop,token,refreshToken:result.token?.refresh_token||null,mode:'write',connectedAt:new Date().toISOString(),shopName:data.shop?.name||shop,scopes},{makeActive:true});return fresh});
    clearConnectionHealth();await audit('integration.shopify_connected',(data.shop?.name||shop)+' · OAuth');
    return done({status:'connected',module:'shopify',provider:'shopify',label:data.shop?.name||shop,shop,shopName:data.shop?.name||shop,mode:'write',scopes});
  }
  const verified=await verifyIntegration(provider,{token,account:'',accountId:'',username:''});
  if(module==='email'){
    const actual=String(verified.meta?.email||verified.label||'').trim().toLowerCase();
    const already=emailAccountsFromState(s).some(x=>integrationAccountKey(x)===actual&&actual);
    if(!already)assertConnectionCapacity(s);
  }
  const entry={provider,module,account:'',accountId:verified.accountId||verified.meta?.id||verified.meta?.phoneNumberId||'',username:verified.username||verified.meta?.username||'',token,refreshToken:result.token?.refresh_token||null,tokenType:result.token?.token_type||'Bearer',tokenExpiresIn:Number(result.token?.expires_in||0),tokenObtainedAt:Date.now(),mode:'write',label:verified.label,meta:verified.meta||{},providerData:verified.secret||{},connectedAt:new Date().toISOString()};
  await updateState(fresh=>{fresh.secret=fresh.secret||{};fresh.secret.integrations=fresh.secret.integrations||{};if(module==='email')addMasterEmailAccount(fresh,entry);else fresh.secret.integrations[module]=entry;return fresh});
  clearConnectionHealth();await audit('integration.connected',module+' · '+provider+' · '+verified.label+' · OAuth');
  if(module==='whatsapp'){
    try{
      await postJson(CLOUD+'/api/whatsapp-channel',{
        action:'register',
        customerId:s.secret?.customerId||'',
        activationCode:s.secret?.activationCode||'',
        deviceKey:s.secret?.deviceKey||'',
        phoneNumberId:verified.meta?.phoneNumberId||entry.accountId||'',
        wabaId:verified.meta?.wabaId||'',
        displayPhone:verified.meta?.displayPhone||'',
        verifiedName:verified.meta?.verifiedName||verified.label||'',
        token
      });
      await audit('integration.whatsapp_runtime','Webhook runtime registrado · costes Meta a cargo del cliente');
    }catch(e){await audit('integration.whatsapp_runtime_error',String(e?.message||e).slice(0,180));}
  }
  return done({status:'connected',module,provider,label:verified.label,mode:'write',meta:verified.meta||{}});
}

ipcMain.handle('integration:connect',async(_e,payload={})=>{
  const preState=await readState();const preKey=normalizeProviderKey(payload.module||payload.provider||'');
  if(preKey==='email'){
    const requested=String(payload.account||payload.username||'').trim().toLowerCase();
    const exists=emailAccountsFromState(preState).some(x=>String(x.meta?.email||x.label||x.account||x.username||'').trim().toLowerCase()===requested&&requested);
    if(!exists)assertConnectionCapacity(preState);
  }else if(preKey==='shopify'){
    const requestedShop=String(payload.shop||payload.account||'').trim();
    if(!requestedShop||!hasShopifyStore(preState,requestedShop))assertOrderChannelCapacity(preState);
  }else if(preKey&&!preState.secret?.integrations?.[preKey])assertConnectionCapacity(preState);
  const provider=normalizeProviderKey(payload.provider),module=normalizeProviderKey(payload.module||provider);
  const s=await readState();assertModuleIncluded(s.license,module);
  const verified=await verifyIntegration(provider,payload);s.secret=s.secret||{};s.secret.integrations=s.secret.integrations||{};
  const entry={provider,module,account:String(payload.account||'').trim(),accountId:verified.accountId||String(payload.accountId||'').trim(),username:verified.username||String(payload.username||'').trim(),token:String(payload.token||'').trim(),mode:payload.mode==='write'?'write':'read',label:verified.label,meta:verified.meta||{},providerData:verified.secret||{},connectedAt:new Date().toISOString()};
  if(module==='email')addMasterEmailAccount(s,entry);else s.secret.integrations[module]=entry;
  await writeState(s);clearConnectionHealth();await audit('integration.connected',module+' · '+provider+' · '+verified.label);
  return {connected:true,module,provider,label:verified.label,mode:s.secret.integrations[module].mode,meta:verified.meta||{}};
});
ipcMain.handle('integration:status',async(_e,module)=>{
  const key=normalizeProviderKey(module),s=await readState();
  if(key==='email'){
    const accounts=emailAccountsFromState(s);
    if(!accounts.length)return {connected:false,configured:false,state:'disconnected',module:key,accounts:[]};
    const checked=await Promise.all(accounts.map(async(x,i)=>{
      const h=await liveIntegrationHealth('email',x,i);
      return {label:x.label||x.meta?.email||x.account||('Correo '+(i+1)),account:x.meta?.email||x.account||x.username||x.label||'',provider:x.provider,connectedAt:x.connectedAt||null,mode:x.mode||'write',...h};
    }));
    const live=checked.filter(x=>x.connected);
    return {
      connected:live.length>0,configured:true,state:live.length===checked.length?'connected':live.length?'partial':'reconnect',module:key,
      provider:live[0]?.provider||checked[0]?.provider||null,
      label:live.length===1?live[0].label:(live.length?live.length+' cuentas de correo verificadas':'Correo necesita reconexión'),
      mode:'write',accounts:checked
    };
  }
  const x=s.secret?.integrations?.[key];
  if(!x)return {connected:false,configured:false,state:'disconnected',module:key};
  const h=await liveIntegrationHealth(key,x,0);
  return {configured:true,module:key,provider:x.provider,label:x.label||x.account||x.provider,mode:x.mode||'read',meta:x.meta||{},connectedAt:x.connectedAt||null,...h};
});
ipcMain.handle('agenda:today',async()=>{
  const s=await readState();assertModuleIncluded(s.license,'agenda');return calendar.today();
});
ipcMain.handle('agenda:upcoming',async(_e,minutes=180)=>{
  const s=await readState();assertModuleIncluded(s.license,'agenda');return calendar.upcoming(minutes);
});

const DIRECTION_SESSION_MS=30*60*1000;
const DIRECTION_PIN_ITERATIONS=210000;
const directionSessions=new Map();

function directionAccess(d){
  d.access=d.access&&typeof d.access==='object'?d.access:{};
  return d.access;
}
function directionConfigured(d){
  const a=directionAccess(d);return Boolean(a.pinHash&&a.pinSalt);
}
function directionHashPin(pin,salt){
  return crypto.pbkdf2Sync(String(pin),String(salt),DIRECTION_PIN_ITERATIONS,32,'sha256').toString('hex');
}
function directionSafeEqual(a,b){
  const aa=Buffer.from(String(a||''),'hex'),bb=Buffer.from(String(b||''),'hex');
  return aa.length===bb.length&&aa.length>0&&crypto.timingSafeEqual(aa,bb);
}
function directionSessionCreate(){
  const token=crypto.randomBytes(32).toString('hex');
  directionSessions.set(token,Date.now()+DIRECTION_SESSION_MS);
  return token;
}
function directionSessionValid(token=''){
  const t=String(token||''),expires=directionSessions.get(t)||0;
  if(!expires||expires<=Date.now()){if(t)directionSessions.delete(t);return false}
  directionSessions.set(t,Date.now()+DIRECTION_SESSION_MS);
  return true;
}
function directionRequireSession(payload={}){
  if(!directionSessionValid(payload?.token)){
    const e=new Error('Dirección está bloqueada. Introduce el PIN.');e.code='DIRECTION_LOCKED';throw e;
  }
}
function directionAccessStatus(d){
  const a=directionAccess(d);
  return {configured:directionConfigured(d),lockedUntil:Number(a.lockedUntil||0)>Date.now()?Number(a.lockedUntil):null};
}

ipcMain.handle('direction:access-status',async()=>{
  const s=await readState(),d=direction.ensureDirection(s);
  return directionAccessStatus(d);
});
ipcMain.handle('direction:set-pin',async(_e,payload={})=>{
  const pin=String(payload.pin||''),currentPin=String(payload.currentPin||'');
  if(!/^\d{4}$/.test(pin))throw new Error('El PIN de Dirección debe tener exactamente 4 dígitos.');
  const s=await readState(),d=direction.ensureDirection(s),a=directionAccess(d);
  if(directionConfigured(d)){
    if(Number(a.lockedUntil||0)>Date.now())throw new Error('Dirección está bloqueada temporalmente por demasiados intentos.');
    const currentHash=/^\d{4}$/.test(currentPin)?directionHashPin(currentPin,a.pinSalt):'';
    if(!currentHash||!directionSafeEqual(currentHash,a.pinHash))throw new Error('El PIN actual de Dirección no es correcto.');
  }
  const salt=crypto.randomBytes(24).toString('hex');
  d.access={pinSalt:salt,pinHash:directionHashPin(pin,salt),failedAttempts:0,lockedUntil:null,updatedAt:new Date().toISOString()};
  await writeState(s);await audit('direction.pin_configured','Acceso privado de Dirección configurado');
  return {ok:true,configured:true};
});
ipcMain.handle('direction:unlock',async(_e,payload={})=>{
  const pin=String(payload.pin||''),s=await readState(),d=direction.ensureDirection(s),a=directionAccess(d);
  if(!directionConfigured(d))throw new Error('Configura primero el PIN de Dirección.');
  if(Number(a.lockedUntil||0)>Date.now())throw new Error('Dirección está bloqueada temporalmente. Inténtalo más tarde.');
  const hash=/^\d{4}$/.test(pin)?directionHashPin(pin,a.pinSalt):'';
  if(!hash||!directionSafeEqual(hash,a.pinHash)){
    a.failedAttempts=Number(a.failedAttempts||0)+1;
    if(a.failedAttempts>=5){a.failedAttempts=0;a.lockedUntil=Date.now()+5*60*1000}
    await writeState(s);await audit('direction.unlock_failed','Intento de acceso a Dirección rechazado');
    throw new Error(a.lockedUntil?'Demasiados intentos. Dirección bloqueada durante 5 minutos.':'PIN de Dirección incorrecto.');
  }
  a.failedAttempts=0;a.lockedUntil=null;a.lastUnlockedAt=new Date().toISOString();await writeState(s);
  const token=directionSessionCreate();await audit('direction.unlocked','Agente de Dirección desbloqueado');
  return {ok:true,token,expiresInMs:DIRECTION_SESSION_MS};
});
ipcMain.handle('direction:lock',async(_e,payload={})=>{
  if(payload?.token)directionSessions.delete(String(payload.token));
  await audit('direction.locked','Agente de Dirección bloqueado');
  return {ok:true};
});

function directionBusinessId(state,payload={}){
  return String(payload.businessId||state?.secret?.activeBusinessProfileId||'').trim().slice(0,120);
}
ipcMain.handle('direction:summary',async(_e,payload={})=>{
  directionRequireSession(payload);
  const s=await readState(),d=direction.ensureDirection(s);
  return direction.summarize(d,{businessId:directionBusinessId(s,payload),now:new Date().toISOString()});
});
ipcMain.handle('direction:employees',async(_e,payload={})=>{
  directionRequireSession(payload);
  const s=await readState(),d=direction.ensureDirection(s),businessId=directionBusinessId(s,payload);
  return d.employees.filter(x=>!businessId||x.businessId===businessId);
});

ipcMain.handle('direction:update-employee-context',async(_e,payload={})=>{
  directionRequireSession(payload);
  let employee=null;
  await updateState(s=>{
    const d=direction.ensureDirection(s);
    employee=direction.updateEmployeeContext(d,String(payload.employeeId||''),payload.context||{});
    return s;
  });
  await audit('direction.employee_context_updated',(employee?.name||'Empleado')+' · contexto laboral actualizado');
  return employee;
});

ipcMain.handle('direction:import-cv',async(_e,payload={})=>{
  directionRequireSession(payload);
  let employee=null;
  await updateState(s=>{
    const d=direction.ensureDirection(s);
    employee=direction.importEmployeeCv(d,String(payload.employeeId||''),{fileName:payload.fileName||'',text:payload.text||''});
    return s;
  });
  await audit('direction.cv_imported',(employee?.name||'Empleado')+' · '+String(employee?.cvProfile?.fileName||'CV').slice(0,160));
  return employee;
});
ipcMain.handle('direction:update-cv',async(_e,payload={})=>{
  directionRequireSession(payload);
  let employee=null;
  await updateState(s=>{
    const d=direction.ensureDirection(s);
    employee=direction.updateEmployeeCv(d,String(payload.employeeId||''),payload.cv||{});
    return s;
  });
  await audit('direction.cv_updated',(employee?.name||'Empleado')+' · expediente profesional actualizado');
  return employee;
});

ipcMain.handle('direction:compare-team-role',async(_e,payload={})=>{
  directionRequireSession(payload);
  const s=await readState(),d=direction.ensureDirection(s),businessId=directionBusinessId(s,payload);
  return direction.compareTeamToRole(d,{
    businessId,
    roleTarget:String(payload.roleTarget||'').trim().slice(0,180),
    requirements:Array.isArray(payload.requirements)?payload.requirements:[]
  });
});

ipcMain.handle('direction:add-employee-observation',async(_e,payload={})=>{
  directionRequireSession(payload);
  let event=null,employeeName='';
  await updateState(s=>{
    const d=direction.ensureDirection(s),employeeId=String(payload.employeeId||'');
    const employee=d.employees.find(x=>x.id===employeeId);employeeName=employee?.name||'Empleado';
    event=direction.addEmployeeObservation(d,employeeId,{...(payload.observation||{}),businessId:directionBusinessId(s,payload)});
    return s;
  });
  await audit('direction.employee_observation_added',employeeName+' · '+(event?.type||'evidencia laboral'));
  return event;
});
ipcMain.handle('direction:management-policy',async(_e,payload={})=>{
  directionRequireSession(payload);
  if(payload.update===true){
    let policy=null;
    await updateState(s=>{
      const d=direction.ensureDirection(s);
      policy=direction.setManagementPolicy(d,payload.policy||{});
      return s;
    });
    await audit('direction.management_policy_updated','Criterio de Dirección actualizado');
    return policy;
  }
  const s=await readState(),d=direction.ensureDirection(s);
  return direction.sanitizeManagementPolicy(d.managementPolicy||{});
});

ipcMain.handle('direction:standards',async(_e,payload={})=>{
  directionRequireSession(payload);
  const s=await readState(),d=direction.ensureDirection(s),businessId=directionBusinessId(s,payload);
  return {
    current:direction.standardSnapshot(direction.applicableDirectionStandard(d,{businessId,at:new Date().toISOString()})),
    versions:direction.listDirectionStandards(d,{businessId}).map(direction.standardSnapshot)
  };
});
ipcMain.handle('direction:create-standard',async(_e,payload={})=>{
  directionRequireSession(payload);
  let standard=null;
  await updateState(s=>{
    const d=direction.ensureDirection(s),businessId=directionBusinessId(s,payload);
    standard=direction.createDirectionStandardVersion(d,{...(payload.standard||{}),businessId,confirmed:payload.confirmed===true});
    return s;
  });
  await audit('direction.standard_created','Política general Dirección v'+standard.version+' · '+standard.directorName+' · '+standard.hash.slice(0,12));
  return direction.standardSnapshot(standard);
});
ipcMain.handle('direction:save-employee',async(_e,payload={})=>{
  directionRequireSession(payload);
  let saved=null;
  await updateState(s=>{
    const d=direction.ensureDirection(s),businessId=directionBusinessId(s,payload);
    const email=String(payload.email||'').trim().toLowerCase(),id=String(payload.id||'');
    const exists=d.employees.some(x=>x.id===id||(email&&x.email===email));
    if(!exists){
      const limit=employeeSlotLimit(s.license),used=d.employees.filter(x=>x.active!==false).length;
      if(used>=limit){const e=new Error('Has alcanzado el número de empleados incluidos en tu plan.');e.code='EMPLOYEE_LIMIT_REACHED';e.limit=limit;throw e}
    }
    saved=direction.addOrUpdateEmployee(d,{...payload,businessId:payload.businessId||businessId});
    return s;
  });
  await audit('direction.employee_saved',(saved?.name||'Empleado')+' · '+(saved?.role||'sin rol'));
  return saved;
});
ipcMain.handle('direction:create-task',async(_e,payload={})=>{
  directionRequireSession(payload);
  let task=null;
  await updateState(s=>{
    const d=direction.ensureDirection(s),businessId=directionBusinessId(s,payload);
    task=direction.addTask(d,{...payload,businessId:payload.businessId||businessId});
    return s;
  });
  await audit('direction.task_assigned',(task?.assigneeName||task?.assigneeId||'Responsable')+' · '+String(task?.title||'').slice(0,160));
  return task;
});
ipcMain.handle('direction:update-task',async(_e,payload={})=>{
  directionRequireSession(payload);
  let task=null;
  await updateState(s=>{
    const d=direction.ensureDirection(s);
    task=direction.updateTask(d,String(payload.id||''),payload.patch||{});
    return s;
  });
  await audit('direction.task_updated',String(task?.title||'').slice(0,160)+' · '+(task?.status||''));
  return task;
});
ipcMain.handle('direction:add-event',async(_e,payload={})=>{
  directionRequireSession(payload);
  let event=null;
  await updateState(s=>{
    const d=direction.ensureDirection(s);
    event=direction.recordEvent(d,String(payload.taskId||''),payload.event||{});
    return s;
  });
  return event;
});
ipcMain.handle('direction:resolve-task',async(_e,payload={})=>{
  directionRequireSession(payload);
  let task=null;
  const actor=payload.actor==='ai'?'ai':'human';
  await updateState(s=>{
    const d=direction.ensureDirection(s);
    task=direction.resolveTask(d,String(payload.taskId||''),{actor,detail:payload.detail||'',outcome:payload.outcome||'',evidence:payload.evidence||''});
    return s;
  });
  await audit(actor==='ai'?'direction.task_resolved_by_ai':'direction.task_resolved_by_human',(task?.assigneeName||'Responsable')+' · '+String(task?.title||'').slice(0,160));
  return task;
});
ipcMain.handle('direction:settings',async(_e,payload={})=>{
  directionRequireSession(payload);
  if(payload&&typeof payload==='object'&&payload.update===true){
    let settings=null;
    await updateState(s=>{
      const d=direction.ensureDirection(s);
      d.settings={
        ...d.settings,
        defaultSlaMinutes:Math.max(1,Math.min(525600,Number(payload.defaultSlaMinutes)||d.settings.defaultSlaMinutes||480)),
        aiTakeoverGraceMinutes:Math.max(0,Math.min(43200,Number(payload.aiTakeoverGraceMinutes)||0)),
        aiTakeoverEnabled:Boolean(payload.aiTakeoverEnabled)
      };
      settings={...d.settings};return s;
    });
    await audit('direction.settings_updated','Control Operativo de Dirección actualizado');
    return settings;
  }
  const s=await readState(),d=direction.ensureDirection(s);return {...d.settings};
});
ipcMain.handle('direction:ai-queue',async(_e,payload={})=>{
  directionRequireSession(payload);
  const s=await readState(),d=direction.ensureDirection(s);
  return direction.summarize(d,{businessId:directionBusinessId(s,payload)}).aiTakeoverQueue;
});

ipcMain.handle('direction:report',async(_e,payload={})=>{
  directionRequireSession(payload);
  const s=await readState(),d=direction.ensureDirection(s),businessId=directionBusinessId(s,payload);
  const report=direction.operationalReport(d,{
    businessId,
    employeeId:String(payload.employeeId||'').trim().slice(0,80),
    from:String(payload.from||'').trim().slice(0,40),
    to:String(payload.to||'').trim().slice(0,40),
    now:new Date().toISOString()
  });
  await audit('direction.report_generated',(payload.employeeId?'Informe individual':'Informe global')+' · '+report.totals.assigned+' tareas analizadas');
  return report;
});

ipcMain.handle('integration:disconnect',async(_e,module)=>{
  const key=normalizeProviderKey(module),s=await readState();
  if(key==='email'){if(s.secret?.integrations?.email)delete s.secret.integrations.email;s.secret.emailAccounts=[];}
  else if(s.secret?.integrations?.[key])delete s.secret.integrations[key];
  await writeState(s);clearConnectionHealth();await audit('integration.disconnected',key);return true;
});
ipcMain.handle('email:disconnect-account',async(_e,account)=>{
  const target=String(account||'').trim().toLowerCase(),s=await readState();
  if(!target)return {ok:false};
  s.secret=s.secret||{};s.secret.integrations=s.secret.integrations||{};
  const all=emailAccountsFromState(s);
  const kept=all.filter(x=>integrationAccountKey(x)!==target);
  if(isMaster(s.license)){
    s.secret.emailAccounts=kept;
    if(kept.length)s.secret.integrations.email=kept[0];else delete s.secret.integrations.email;
  }else{
    const primary=s.secret.integrations.email;
    if(primary&&integrationAccountKey(primary)===target)delete s.secret.integrations.email;
    s.secret.emailAccounts=[];
  }
  await writeState(s);clearConnectionHealth();await audit('integration.email_account_disconnected',target);
  return {ok:true,remaining:emailAccountsFromState(s).length};
});

ipcMain.handle('whatsapp:runtime',async(_e,payload={})=>{
  const s=await readState();
  if(!s.secret?.customerId||!s.secret?.activationCode||!s.secret?.deviceKey)throw new Error('Activa primero la licencia de VentaNexIA');
  const action=String(payload.action||'status').trim().slice(0,40);
  return postJson(CLOUD+'/api/whatsapp-channel',{
    ...payload,action,
    customerId:s.secret.customerId,
    activationCode:s.secret.activationCode,
    deviceKey:s.secret.deviceKey
  });
});

ipcMain.handle('shopify:connect-owned',async(_e,payload={})=>{
  const preState=await readState();
  const s=await readState();
  if(!isMaster(s.license))throw new Error('La conexión directa de tienda propia requiere la edición Maestro');
  assertModuleIncluded(s.license,'shopify');
  const shop=await resolveShopifyShop(payload.shop);if(!hasShopifyStore(preState,shop))assertOrderChannelCapacity(preState);
  if(!s.secret?.customerId||!s.secret?.activationCode)throw new Error('Activa primero la licencia de VentaNexIA');
  const {token,expiresIn}=await requestOwnedToken(shop,postJson);
  const data=await shopifyGraphql(shop,token,`query VentaNexIAConnectionCheck { shop { name myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`);
  const scopes=(data.currentAppInstallation?.accessScopes||[]).map(x=>x.handle).filter(Boolean);
  const fresh=await readState();upsertShopifyStore(fresh,{shop,token,mode:'write',connectedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+Number(expiresIn||86399)*1000).toISOString(),shopName:data.shop?.name||shop,scopes,authMode:'client_credentials'},{makeActive:true});
  await writeState(fresh);clearConnectionHealth();await audit('integration.shopify_connected',(data.shop?.name||shop)+' · client credentials');
  return {connected:true,shop,shopName:data.shop?.name||shop,mode:'write',scopes,expiresIn:Number(expiresIn||86399)};
});

ipcMain.handle('shopify:connect',async(_e,payload={})=>{
  const preState=await readState();
  const policyState=await readState();assertModuleIncluded(policyState.license,'shopify');
  const shop=await resolveShopifyShop(payload.shop);if(!hasShopifyStore(preState,shop))assertOrderChannelCapacity(preState);
  const token=String(payload.token||'').trim();
  const mode=payload.mode==='write'?'write':'read';
  if(!token)throw new Error('Indica el token de Admin API');
  const data=await shopifyGraphql(shop,token,`query VentaNexIAConnectionCheck { shop { name myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`);
  const scopes=(data.currentAppInstallation?.accessScopes||[]).map(x=>x.handle).filter(Boolean);
  const s=await readState();upsertShopifyStore(s,{shop,token,mode,connectedAt:new Date().toISOString(),shopName:data.shop?.name||shop,scopes},{makeActive:true});
  await writeState(s);clearConnectionHealth();await audit('integration.shopify_connected',`${data.shop?.name||shop} · ${mode==='write'?'lectura/escritura':'solo lectura'}`);
  return {connected:true,shop,shopName:data.shop?.name||shop,mode,scopes};
});
ipcMain.handle('shopify:list',async()=>{
  const s=await readState(),active=getShopifyStore(s),stores=listShopifyStores(s);
  return Promise.all(stores.map(async x=>{
    const h=await liveShopifyHealth(x);
    return {...publicShopifyStore(x),...h,active:Boolean(active?.shop&&String(active.shop).toLowerCase()===String(x.shop).toLowerCase())};
  }));
});
ipcMain.handle('shopify:set-active',async(_e,shop)=>{
  const s=await readState(),x=setActiveShopifyStore(s,shop);await writeState(s);clearConnectionHealth();
  const h=await liveShopifyHealth(x,{force:true});
  await audit('integration.shopify_active',(x.shopName||x.shop)+' · activa');
  return {...publicShopifyStore(x),...h};
});
ipcMain.handle('shopify:status',async()=>{
  const s=await readState(),x=getShopifyStore(s),stores=listShopifyStores(s);
  if(!x)return {connected:false,configured:false,state:'disconnected',stores:[]};
  const h=await liveShopifyHealth(x);
  return {configured:true,...publicShopifyStore(x),...h,stores:stores.map(publicShopifyStore)};
});
ipcMain.handle('shopify:disconnect',async(_e,shop)=>{
  const s=await readState(),target=shop||getShopifyStore(s)?.shop;
  if(!target)return {ok:true,connected:false,stores:[]};
  removeShopifyStore(s,target);await writeState(s);clearConnectionHealth();
  await audit('integration.shopify_disconnected','Shopify · '+target);
  const active=getShopifyStore(s),stores=listShopifyStores(s);
  return {ok:true,connected:Boolean(active),active:publicShopifyStore(active),stores:stores.map(publicShopifyStore)};
});

ipcMain.handle('provisioning:list',async()=>{
  const s=await readState();
  if(!s.secret?.customerId||!s.secret?.activationCode)throw new Error('Activa primero tu licencia');
  return postJson(CLOUD+'/api/provisioning-admin',{action:'list',customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey:await ensureDeviceKey()});
});
ipcMain.handle('provisioning:start',async(_e,taskId)=>{
  const s=await readState();
  return postJson(CLOUD+'/api/provisioning-admin',{action:'start',taskId,customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey:await ensureDeviceKey()});
});
ipcMain.handle('provisioning:complete',async(_e,taskId)=>{
  const s=await readState();
  return postJson(CLOUD+'/api/provisioning-admin',{action:'complete',taskId,customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey:await ensureDeviceKey()});
});
ipcMain.handle('master:dashboard',async()=>{
  const s=await readState();
  if(!isMaster(s.license))throw new Error('Solo disponible en la edición maestra');
  if(!s.secret?.customerId||!s.secret?.activationCode)throw new Error('Activa primero tu licencia maestra');
  return postJson(CLOUD+'/api/master-dashboard',{customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey:await ensureDeviceKey()},30000);
});
ipcMain.handle('usage:buy-pack',async(_e,packKey)=>{
  const s=await readState();
  if(!s.secret?.customerId||!s.secret?.activationCode)throw new Error('Activa primero tu licencia');
  const result=await postJson(CLOUD+'/api/create-credit-checkout',{packKey:String(packKey||''),customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey:await ensureDeviceKey()});
  if(!result?.checkoutUrl)throw new Error('No se pudo abrir el pago');
  await shell.openExternal(result.checkoutUrl);
  return {ok:true};
});
ipcMain.handle('usage:overview',async()=>{
  const s=await readState();
  if(isMaster(s.license))return {ok:true,master:true,unlimited:true,items:{}};
  if(!s.secret?.customerId||!s.secret?.activationCode)return {ok:false,error:'Activa primero tu licencia'};
  const meters=['image_credits','voice_minutes','whatsapp_messages','lead_credits','ai_heavy_tasks','email_ai_actions','automation_runs','seo_pages','report_generations','storage_mb'];
  const deviceKey=await ensureDeviceKey(),items={};
  for(const meter of meters){
    try{items[meter]=await postJson(CLOUD+'/api/usage-meter',{action:'status',meter,customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey});}
    catch(e){items[meter]={ok:false,code:/FEATURE_NOT_INCLUDED/i.test(String(e?.message||''))?'FEATURE_NOT_INCLUDED':'UNAVAILABLE'};}
  }
  try{items.video_credits=await postJson(CLOUD+'/api/video-usage',{action:'status',customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey});}
  catch{items.video_credits={ok:false,code:'UNAVAILABLE'}}
  return {ok:true,items};
});
ipcMain.handle('usage:consume',async(_e,payload={})=>{
  const s=await readState();
  if(isMaster(s.license))return {ok:true,master:true,unlimited:true,meter:String(payload.meter||''),consumed:0};
  if(!s.secret?.customerId||!s.secret?.activationCode)throw new Error('Activa primero tu licencia');
  return postJson(CLOUD+'/api/usage-meter',{action:'consume',meter:String(payload.meter||''),quantity:Math.max(1,Number(payload.quantity||1)||1),metadata:payload.metadata||{},customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey:await ensureDeviceKey()});
});
ipcMain.handle('video:quota',async()=>{
  const s=await readState();
  if(isMaster(s.license))return {ok:true,master:true,unlimited:true,remaining:null};
  if(!s.secret?.customerId||!s.secret?.activationCode)return {ok:false,error:'Activa primero tu licencia'};
  return postJson(CLOUD+'/api/video-usage',{action:'status',customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey:await ensureDeviceKey()});
});
ipcMain.handle('video:consume',async(_e,durationSeconds)=>{
  const s=await readState();
  if(isMaster(s.license))return {ok:true,master:true,unlimited:true,consumed:0};
  if(!s.secret?.customerId||!s.secret?.activationCode)throw new Error('Activa primero tu licencia');
  const seconds=Math.max(1,Math.min(60,Number(durationSeconds||0)||0));
  return postJson(CLOUD+'/api/video-usage',{action:'consume',durationSeconds:seconds,customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey:await ensureDeviceKey()});
});
ipcMain.handle('update:check',async()=>{
  const s=await readState();
  if(!s.secret?.customerId||!s.secret?.activationCode)return {ok:false,error:'Activa primero tu licencia'};
  const deviceKey=await ensureDeviceKey();
  return postJson(CLOUD+'/api/desktop-update',{customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey,currentVersion:app.getVersion()});
});
ipcMain.handle('app:open-external',async(_e,url)=>{const u=String(url||'').trim();if(!/^https:\/\//i.test(u))throw new Error('Enlace no válido');await shell.openExternal(u);return true});

async function rendererRuntimeHealth(){
  const wins=BrowserWindow.getAllWindows().filter(w=>{
    try{return !w.isDestroyed()&&String(w.webContents?.getURL?.()||'').toLowerCase().includes('renderer/index.html')}catch{return false}
  });
  if(!wins.length)return {ok:true,detail:'Interfaz no abierta; se comprobará al abrirla'};
  const expected=['email','orders','web_ecommerce','crm','prospecting','content','social','campaigns','administration','agenda','reports','automation'];
  const required=['vnxAhSearchBtn','vnxAhPrimary','vnxAhCompanyBtn','vnxAhPreviewActions','chatConnectionSelect','vnxDirKpis','vnxDirTaskRows'];
  const probe='(()=>{const expected='+JSON.stringify(expected)+',required='+JSON.stringify(required)+';const missingAgents=expected.filter(k=>!document.querySelector(\'[data-agent-home="\'+k+\'"]\'));const missingIds=required.filter(id=>!document.getElementById(id));return {ok:missingAgents.length===0&&missingIds.length===0&&Boolean(window.vnxAgentHome)&&Boolean(window.vnx),missingAgents,missingIds,agentApi:Boolean(window.vnxAgentHome),bridge:Boolean(window.vnx)}})()';
  for(const win of wins){
    try{
      const result=await withHealthTimeout(win.webContents.executeJavaScript(probe,true),6000);
      if(!result?.ok)return {ok:false,detail:'Faltan '+([...(result?.missingAgents||[]),...(result?.missingIds||[])].join(', ')||'APIs de interfaz')};
    }catch(e){return {ok:false,detail:'No se pudo verificar la interfaz: '+String(e?.message||e).slice(0,180)}}
  }
  return {ok:true,detail:expected.length+' módulos y '+required.length+' controles críticos visibles'};
}
async function repairRendererState(){
  let repaired=0;
  const keys=['vnx_home_selected_source_v1','vnx_stock_policy_by_source_v1','vnx_prospect_profile_by_source_v1','vnx_master_chat_state_v1'];
  const script='(()=>{let n=0;for(const k of '+JSON.stringify(keys)+'){const raw=localStorage.getItem(k);if(!raw)continue;try{JSON.parse(raw)}catch{localStorage.removeItem(k);n++}}return n})()';
  for(const win of BrowserWindow.getAllWindows()){
    try{
      const url=String(win.webContents?.getURL?.()||'').toLowerCase();
      if(!url.includes('renderer/index.html'))continue;
      const n=await win.webContents.executeJavaScript(script,true);repaired+=Number(n||0);
      win.webContents.reloadIgnoringCache();
    }catch{}
  }
  return repaired;
}
async function erpRuntimeHealth(state){
  const p=state?.secret?.ordersErp?.program;
  if(!p)return null;
  const def=erpConnectors.PROGRAMS?.[p.id];
  if(!def)return {name:'Programa de gestión',ok:false,detail:'La configuración apunta a un conector que ya no existe'};
  if(def.kind==='files')return {name:'Programa de gestión · '+def.name,ok:true,detail:'Conector por archivos configurado'};
  if(typeof def.make!=='function')return {name:'Programa de gestión · '+def.name,ok:false,detail:'El conector no puede inicializarse'};
  try{
    const adapter=def.make(p.cfg||{},{fetch:(...args)=>fetch(...args)});
    if(typeof adapter.test==='function')await withHealthTimeout(adapter.test(),10000);
    return {name:'Programa de gestión · '+def.name,ok:true,detail:def.caps?.salesHistory?'Conexión verificada · histórico disponible para Stock y Compras':'Conexión verificada · histórico de stock no disponible por API'};
  }catch(e){return {name:'Programa de gestión · '+def.name,ok:false,detail:String(e?.message||e).slice(0,180)}}
}
async function runHealthCheck(){
  const checks=[];
  const add=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail:String(detail||'').slice(0,500)});
  let state=null;
  try{state=await readState();add('Configuración de VentaNexIA',true)}catch(e){add('Configuración de VentaNexIA',false,e.message)}
  try{for(const x of staticRuntimeChecks(__dirname))add('Integridad · '+x.name,x.ok,x.detail)}catch(e){add('Integridad interna',false,e.message)}
  try{const ui=await rendererRuntimeHealth();add('Interfaz y menús',ui.ok,ui.detail)}catch(e){add('Interfaz y menús',false,e.message)}
  try{const st=await fs.stat(storeFile());add('Archivo de configuración',st.isFile(),'Disponible')}catch{add('Archivo de configuración',false,'No se encuentra o no se puede abrir')}
  try{const probe=path.join(app.getPath('userData'),'.vnx-write-test');await fs.writeFile(probe,'ok','utf8');await fs.unlink(probe);add('Permiso para guardar cambios',true,'Correcto')}catch(e){add('Permiso para guardar cambios',false,'Windows está bloqueando la carpeta de VentaNexIA')}
  const clockDrift=Math.abs(Date.now()-new Date().getTime());add('Fecha y hora del equipo',clockDrift<60000,'Correctas');
  add('Protección de datos',safeStorage.isEncryptionAvailable(),safeStorage.isEncryptionAvailable()?'Activa':'Windows no permite cifrado local ahora');
  try{
    const drive=process.env.SystemDrive||'C:';
    const free=await fs.statfs(drive+'\\');
    const gb=Number(free.bavail||0)*Number(free.bsize||0)/1024/1024/1024;
    add('Espacio libre',gb>1,gb.toFixed(1)+' GB libres');
  }catch{add('Espacio libre',true,'No se pudo medir, sin bloqueo')}
  try{
    const r=await fetch(CLOUD+'/api/health',{headers:{'User-Agent':`VentaNexIA-Desktop/${app.getVersion()}`}});
    const j=await r.json().catch(()=>({}));
    add('Servicio VentaNexIA',r.ok&&j.ok!==false,r.ok?'Disponible':'No responde');
    add('Motor inteligente',Boolean(j?.checks?.ai),j?.checks?.ai?'Disponible':'No disponible en el servidor');
    add('Base de datos',Boolean(j?.checks?.database),j?.checks?.database?'Disponible':'No disponible');
    add('Pagos y licencias',Boolean(j?.checks?.stripe),j?.checks?.stripe?'Disponible':'No disponible');
  }catch(e){
    add('Servicio VentaNexIA',false,'No hay conexión con el servidor');
    add('Motor inteligente',false,'No se pudo comprobar');
    add('Base de datos',false,'No se pudo comprobar');
    add('Pagos y licencias',false,'No se pudo comprobar');
  }
  if(state?.secret?.customerId&&state?.secret?.activationCode){
    try{
      const result=await postJson(CLOUD+'/api/device-status',{customerId:state.secret.customerId,activationCode:state.secret.activationCode,deviceKey:await ensureDeviceKey()});
      add('Licencia',Boolean(result?.ok),'Activa');
    }catch(e){add('Licencia',false,e.message||'No se pudo comprobar')}
  }else add('Licencia',false,'Este equipo todavía no está activado');
  const folders=state?.permissions?.folders||[];
  for(const folder of folders.slice(0,20)){
    try{const st=await fs.stat(folder);add('Carpeta autorizada · '+path.basename(folder),st.isDirectory(),'Disponible')}
    catch{add('Carpeta autorizada · '+path.basename(folder),false,'Ya no existe o no es accesible')}
  }
  const portals=Array.isArray(state?.portals)?state.portals:[];
  for(const p of portals.slice(0,10)){
    add('Portal · '+String(p.name||'sin nombre'),p.lastStatus!=='error',p.lastStatus||'Pendiente de comprobar');
  }
  for(const store of listShopifyStores(state||{})){
    try{const h=await liveShopifyHealth(store,{force:true});add('Shopify · '+String(store.shopName||store.shop),h.connected,h.reason||h.state)}catch(e){add('Shopify · '+String(store.shopName||store.shop),false,e.message)}
  }
  try{const erpHealth=await erpRuntimeHealth(state);if(erpHealth)add(erpHealth.name,erpHealth.ok,erpHealth.detail)}catch(e){add('Programa de gestión',false,e.message)}
  const ints=state?.secret?.integrations||{};
  for(const [key,x] of Object.entries(ints).slice(0,15)){
    let ok=Boolean(x.token||key==='shopify'),detail=x.connectedAt?'Conectada':'Sin fecha de conexión';
    if(ok&&x.token&&x.provider){
      try{
        const args=tok=>({token:tok,account:x.account||'',accountId:x.accountId||'',username:x.username||''});
        if(x.provider==='gmail')await gmailCall(x,tok=>verifyIntegration('gmail',args(tok)));
        else await verifyIntegration(x.provider,args(x.token));
        detail='Conexión comprobada';
      }
      catch(e){ok=false;detail='La autorización puede haber caducado'}
    }else if(ok&&key==='shopify'){
      try{await shopifyCall(x,tok=>shopifyGraphql(x.shop,tok,`query VentaNexIAHealth { shop { name } }`));detail='Conexión comprobada'}catch(e){ok=false;detail=e?.code==='SHOPIFY_SHOP_NOT_FOUND'||e?.code==='REAUTH_REQUIRED'?String(e.message).slice(0,200):'La autorización puede haber caducado'}
    }
    add('Conexión · '+String(x.label||key),ok,detail);
  }
  return {ok:checks.every(x=>x.ok),checks,at:new Date().toISOString()};
}
async function escalateSupport(report,summary){
  const s=await readState();
  try{
    return await postJson(CLOUD+'/api/support-escalate',{
      customerId:s.secret?.customerId||'SIN-ID',
      deviceId:s.license?.deviceId||os.hostname(),
      version:app.getVersion(),
      summary:String(summary||'VentaNexIA no pudo reparar automáticamente todos los problemas.'),
      checks:report?.checks||[]
    });
  }catch(e){return {ok:false,error:e.message||'No se pudo avisar a soporte'}}
}
async function autoRepair(){
  const before=await runHealthCheck();
  const actions=[];
  try{
    const current=await readState(),fixed=sanitizeState(current);
    if(fixed.changed){await writeState(fixed.state);actions.push(...fixed.actions)}
    else actions.push('Estructura de configuración local correcta.');
    clearConnectionHealth();
  }catch{actions.push('No se pudo reparar la configuración local.')}
  try{
    const s=await readState();
    if(s.secret?.customerId&&s.secret?.activationCode){
      const deviceKey=await ensureDeviceKey();
      const result=await postJson(CLOUD+'/api/device-status',{customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey});
      const fresh=await readState();
      fresh.license={...(fresh.license||{}),customerId:result.customerId||s.secret.customerId,deviceId:result.deviceId||fresh.license?.deviceId||null,plan:result.planKey||fresh.license?.plan||null,featurePolicy:result.featurePolicy||fresh.license?.featurePolicy||{},activeCount:result.activeCount||0,limit:result.limit||0,available:result.available||0,extraDeviceMonthlyEur:result.extraDeviceMonthlyEur||49,lastCheckedAt:new Date().toISOString()};
      await writeState(fresh);
      actions.push('Licencia actualizada.');
    }
  }catch{actions.push('La licencia no se pudo actualizar automáticamente.')}
  try{
    const s=await readState(),valid=[];
    for(const folder of s.permissions?.folders||[]){
      try{const st=await fs.stat(folder);if(st.isDirectory())valid.push(folder)}catch{}
    }
    if(valid.length!==(s.permissions?.folders||[]).length){
      s.permissions.folders=valid;await writeState(s);actions.push('Se quitaron accesos a carpetas que ya no existen.');
    }
  }catch{}
  try{
    const ui=await rendererRuntimeHealth();
    if(!ui.ok){const cleaned=await repairRendererState();actions.push('Se recargó la interfaz para restaurar menús y controles'+(cleaned?' y se limpiaron '+cleaned+' estados locales dañados':'')+'.')}
  }catch{}
  const after=await runHealthCheck();
  let escalation=null;
  if(!after.ok){
    const s2=await readState();s2.support=s2.support||{};
    const last=Number(s2.support.lastEscalatedAt||0);
    if(Date.now()-last>=24*60*60*1000){
      escalation=await escalateSupport(after,'La reparación automática terminó pero siguen existiendo uno o más fallos.');
      if(escalation?.ok){s2.support.lastEscalatedAt=Date.now();await writeState(s2);}
      actions.push(escalation?.ok?'Se ha avisado al equipo de soporte. Si hace falta acceso remoto, contactarán con el cliente en un plazo habitual de 24 a 48 horas.':'No se pudo avisar automáticamente al equipo de soporte.');
    }else actions.push('El equipo de soporte ya ha sido avisado recientemente de este problema.');
  }
  await audit('support.auto_repair',actions.join(' '));
  return {before,after,actions,escalation};
}
async function maybeRunAutomaticSupport(){
  try{
    const s=await readState();
    if(!s.support?.autoMode)return;
    const report=await runHealthCheck();
    if(report.ok)return;
    const repaired=await autoRepair();
    if(repaired.after?.ok)return;
  }catch{}
}
ipcMain.handle('support:health',async()=>runHealthCheck());
ipcMain.handle('support:auto-repair',async()=>autoRepair());
ipcMain.handle('support:auto-mode',async(_e,enabled)=>{
  const on=Boolean(enabled);
  app.setLoginItemSettings({openAtLogin:on,args:on?['--background']:[]});
  const s=await readState();s.support=s.support||{};s.support.autoMode=on;await writeState(s);
  await audit('support.auto_mode',on?'Asistencia automática activada':'Asistencia automática desactivada');
  return {enabled:on};
});
ipcMain.handle('support:auto-mode-status',async()=>{const s=await readState();return {enabled:Boolean(s.support?.autoMode)};});
ipcMain.handle('support:quick-assist',async()=>{await audit('support.requested','Asistencia rápida abierta por el cliente');await shell.openExternal('ms-quick-assist:');return true});
ipcMain.handle('support:stop',async()=>{await audit('support.stopped','Cliente pulsó detener asistencia');return true});

ipcMain.handle('external-agent:list',async()=>externalAgents.list());
ipcMain.handle('external-agent:test',async(_e,payload={})=>externalAgents.test(payload));
ipcMain.handle('external-agent:save',async(_e,payload={})=>externalAgents.save(payload));
ipcMain.handle('external-agent:remove',async(_e,id)=>externalAgents.remove(String(id||'')));

ipcMain.handle('connection:capacity',async()=>{
  const s=await readState(),used=externalConnectionCount(s),limit=connectionLimit(s.license);
  return {used,limit:isMaster(s.license)?null:limit,available:isMaster(s.license)?null:Math.max(0,limit-used),extraMonthlyEur:49};
});
ipcMain.handle('orders:channel-capacity',async()=>{
  const s=await readState(),u=orderChannelUsageFromState(s),limit=orderChannelLimit(s.license);
  return {used:u.used,items:u.items,limit:isMaster(s.license)?null:limit,available:isMaster(s.license)?null:Math.max(0,limit-u.used),level:orderWebLevel(s.license),extraMonthlyEur:29};
});

ipcMain.handle('connection:list',async()=>{
  const s=await readState(),out=[];
  const emailAccounts=emailAccountsFromState(s);
  for(let i=0;i<emailAccounts.length;i++){
    const x=emailAccounts[i],h=await liveIntegrationHealth('email',x,i);
    if(h.connected)out.push({key:'integration:email:'+i,type:'integration',module:'email',accountIndex:i,provider:x.provider||'',label:x.label||x.meta?.email||x.account||('Correo '+(i+1)),status:'connected'});
  }
  for(const x of listShopifyStores(s)){
    const h=await liveShopifyHealth(x);
    if(h.connected)out.push({key:'integration:shopify:'+encodeURIComponent(x.shop),type:'integration',module:'shopify',provider:'shopify',label:x.shopName||x.shop,shop:x.shop,shopName:x.shopName||x.shop,mode:x.mode||'read',status:'connected'});
  }
  for(const [module,x] of Object.entries(s.secret?.integrations||{})){
    if(!x||module==='email'||module==='shopify')continue;
    const h=await liveIntegrationHealth(module,x,0);
    if(h.connected)out.push({key:'integration:'+module,type:'integration',module,provider:x.provider||'',label:x.label||x.meta?.email||x.account||module,status:'connected'});
  }
  for(const folder of s.permissions?.folders||[]){
    try{const st=await fs.stat(folder);if(st.isDirectory())out.push({key:'folder:'+folder,type:'folder',folder,label:'Carpeta · '+path.basename(folder),status:'connected'})}catch{}
  }
  return out;
});

function purchaseAnalysisCacheKey(scopeKey){
  return crypto.createHash('sha256').update(String(scopeKey||'')).digest('hex');
}
function sanitizePurchaseAnalysis(payload={}){
  const scopeKey=String(payload.scopeKey||'').trim().slice(0,400);
  if(!scopeKey)throw new Error('Falta la conexión del análisis de stock.');
  const sourceLabel=String(payload.sourceLabel||'Fuente seleccionada').trim().slice(0,180)||'Fuente seleccionada';
  const raw=payload.purchaseData||{},headers=Array.isArray(raw.headers)?raw.headers.slice(0,32).map(x=>String(x??'').slice(0,120)):[];
  const rows=Array.isArray(raw.rows)?raw.rows.slice(0,5000).map(row=>Array.isArray(row)?row.slice(0,32).map(cell=>{
    if(cell===null||cell===undefined)return '';
    if(typeof cell==='number'||typeof cell==='boolean')return cell;
    return String(cell).slice(0,500);
  }):[]):[];
  const parsed=new Date(payload.analyzedAt||Date.now()),analyzedAt=Number.isNaN(parsed.getTime())?new Date().toISOString():parsed.toISOString();
  const targetDays=Math.max(1,Math.min(365,Number(payload.targetDays||0)||0));
  const windowDays=Math.max(30,Math.min(730,Number(payload.windowDays||0)||0));
  const urgentDays=Math.max(1,Math.min(90,Number(payload.urgentDays||0)||0));
  const noHistoryMin=Math.max(0,Math.min(100000,Number(payload.noHistoryMin||0)||0));
  return {scopeKey,sourceLabel,purchaseData:{headers,rows},analyzedAt,targetDays:targetDays||null,windowDays:windowDays||null,urgentDays:urgentDays||null,noHistoryMin,savedAt:new Date().toISOString()};
}
ipcMain.handle('purchase-analysis:get',async(_e,scopeKey)=>{
  const rawKey=String(scopeKey||'').trim().slice(0,400);if(!rawKey)return null;
  const s=await readState(),cache=s.secret?.purchaseAnalyses||{};
  const hit=cache[purchaseAnalysisCacheKey(rawKey)];
  return hit&&hit.scopeKey===rawKey?hit:null;
});
ipcMain.handle('purchase-analysis:set',async(_e,payload={})=>{
  const record=sanitizePurchaseAnalysis(payload),cacheKey=purchaseAnalysisCacheKey(record.scopeKey);
  await updateState(s=>{
    s.secret=s.secret||{};
    const cache=s.secret.purchaseAnalyses&&typeof s.secret.purchaseAnalyses==='object'?s.secret.purchaseAnalyses:{};
    cache[cacheKey]=record;
    const newest=Object.entries(cache).sort((a,b)=>String(b[1]?.savedAt||'').localeCompare(String(a[1]?.savedAt||''))).slice(0,20);
    s.secret.purchaseAnalyses=Object.fromEntries(newest);
    return s;
  });
  return {ok:true,...record};
});

// chat:send se registra únicamente en master.cjs. No existe fallback paralelo en main.cjs.

ipcMain.handle('device:pair-demo',async()=>{const s=await readState();s.secret=s.secret||{};s.secret.deviceToken=crypto.randomBytes(32).toString('base64url');await writeState(s);await audit('device.paired','Equipo vinculado en modo de prueba local');return {ok:true,deviceId:crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0,12)}});

app.whenReady().then(async()=>{
  createWindow();
  setTimeout(maybeRunAutomaticSupport,15000);
  setInterval(maybeRunAutomaticSupport,60*60*1000);
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
