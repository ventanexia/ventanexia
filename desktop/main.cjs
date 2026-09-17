const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const crypto=require('node:crypto');

const CLOUD='https://www.ventanexia.es';
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
let discoveryCandidates=new Set();
const storeFile=()=>path.join(app.getPath('userData'),'secure-state.json');

async function readState(){
  try{
    const raw=JSON.parse(await fs.readFile(storeFile(),'utf8'));
    if(raw.secret&&safeStorage.isEncryptionAvailable()){
      raw.secret=JSON.parse(safeStorage.decryptString(Buffer.from(raw.secret,'base64')));
    } else raw.secret={};
    raw.permissions=raw.permissions||{folders:[]};
    raw.activity=raw.activity||[];
    raw.license=raw.license||{};
    return raw;
  }catch{return {permissions:{folders:[]},activity:[],license:{},secret:{deviceToken:null}}}
}
async function writeState(state){
  const out={...state,secret:state.secret||{}};
  if(safeStorage.isEncryptionAvailable()){
    out.secret=Buffer.from(safeStorage.encryptString(JSON.stringify(state.secret||{}))).toString('base64');
  }
  await fs.writeFile(storeFile(),JSON.stringify(out,null,2),'utf8');
}
async function audit(type,detail){
  const s=await readState();
  s.activity=[{at:new Date().toISOString(),type,detail},...(s.activity||[])].slice(0,200);
  await writeState(s);
}
async function postJson(url,body){
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':`VentaNexIA-Desktop/${app.getVersion()}`},body:JSON.stringify(body||{})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(j.error||j.message||`Error ${r.status}`);e.code=j.code;e.data=j;throw e;}
  return j;
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
function publicLicenseState(s){
  const l=s.license||{};
  return {
    activated:Boolean(s.secret?.customerId&&s.secret?.activationCode&&l.deviceId),
    customerId:s.secret?.customerId||l.customerId||null,
    deviceId:l.deviceId||null,
    plan:l.plan||null,
    activeCount:Number(l.activeCount||0),
    limit:Number(l.limit||0),
    available:Number(l.available||0),
    extraDeviceMonthlyEur:Number(l.extraDeviceMonthlyEur||49),
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
      devTools:true
    }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname,'renderer','index.html'));
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//i.test(url)||/^ms-quick-assist:/i.test(url)){shell.openExternal(url);return {action:'deny'}}return {action:'deny'}});
  mainWindow.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith('file://'))e.preventDefault()});
}

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
  s.license={customerId,deviceId:result.deviceId||null,plan:result.planKey||null,activeCount:result.activeCount||0,limit:result.limit||0,available:result.available||0,extraDeviceMonthlyEur:result.extraDeviceMonthlyEur||49,lastCheckedAt:new Date().toISOString()};
  await writeState(s);await audit('license.device_activated',`Cliente ${customerId}; dispositivo ${result.deviceId||deviceKey}`);
  return publicLicenseState(await readState());
});
ipcMain.handle('license:status',async()=>{
  const s=await readState();
  if(!s.secret?.customerId||!s.secret?.activationCode)return publicLicenseState(s);
  const deviceKey=await ensureDeviceKey();
  const result=await postJson(`${CLOUD}/api/device-status`,{customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey});
  const fresh=await readState();
  fresh.license={...(fresh.license||{}),customerId:result.customerId||s.secret.customerId,deviceId:result.deviceId||fresh.license?.deviceId||null,plan:result.planKey||fresh.license?.plan||null,activeCount:result.activeCount||0,limit:result.limit||0,available:result.available||0,extraDeviceMonthlyEur:result.extraDeviceMonthlyEur||49,lastCheckedAt:new Date().toISOString()};
  await writeState(fresh);
  return publicLicenseState(fresh);
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

ipcMain.handle('support:quick-assist',async()=>{await audit('support.requested','Asistencia rápida abierta por el cliente');await shell.openExternal('ms-quick-assist:');return true});
ipcMain.handle('support:stop',async()=>{await audit('support.stopped','Cliente pulsó detener asistencia');return true});
ipcMain.handle('chat:send',async(_e,messages)=>{
  const localContext=await collectAuthorizedContext();
  const s=await readState();
  const r=await fetch(`${CLOUD}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':`VentaNexIA-Desktop/${app.getVersion()}`},body:JSON.stringify({messages:(messages||[]).slice(-20),localContext,desktop:{customerId:s.secret?.customerId||null,deviceId:s.license?.deviceId||null}})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'No se pudo contactar con VentaNexIA');
  await audit('ai.chat',`Consulta realizada con ${localContext.length} archivo(s) textual(es) autorizados`);return j;
});
ipcMain.handle('device:pair-demo',async()=>{const s=await readState();s.secret=s.secret||{};s.secret.deviceToken=crypto.randomBytes(32).toString('base64url');await writeState(s);await audit('device.paired','Equipo vinculado en modo de prueba local');return {ok:true,deviceId:crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0,12)}});

app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
