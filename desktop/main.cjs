const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const crypto=require('node:crypto');
const {ImapFlow}=require('imapflow');
const nodemailer=require('nodemailer');
const {assertModuleIncluded,isMaster}=require('./agent-policy.cjs');

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
    featurePolicy:l.featurePolicy||{},
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
  if(process.argv.includes('--background'))mainWindow.hide();
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
  const result=await postJson(`${CLOUD}/api/device-status`,{customerId:s.secret.customerId,activationCode:s.secret.activationCode,deviceKey});
  const fresh=await readState();
  fresh.license={...(fresh.license||{}),customerId:result.customerId||s.secret.customerId,deviceId:result.deviceId||fresh.license?.deviceId||null,plan:result.planKey||fresh.license?.plan||null,featurePolicy:result.featurePolicy||fresh.license?.featurePolicy||{},activeCount:result.activeCount||0,limit:result.limit||0,available:result.available||0,extraDeviceMonthlyEur:result.extraDeviceMonthlyEur||49,lastCheckedAt:new Date().toISOString()};
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

function normalizeShopifyShop(value=''){
  let v=String(value||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(v.includes('/'))v=v.split('/')[0];
  return v;
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
  if(provider==='hubspot'){
    const j=await providerFetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1',{headers:{Authorization:'Bearer '+token}});
    return {label:'HubSpot',meta:{sampleCount:Array.isArray(j.results)?j.results.length:0}};
  }
  if(provider==='instagram'){
    let id=accountId;
    if(!id){
      const pages=await providerFetch('https://graph.facebook.com/v20.0/me/accounts?fields=id,name,instagram_business_account{id,username,name}&access_token='+encodeURIComponent(token));
      const matches=(pages.data||[]).filter(x=>x.instagram_business_account?.id);
      if(!matches.length)throw new Error('No se encontró ninguna cuenta profesional de Instagram vinculada a esta autorización');
      id=matches[0].instagram_business_account.id;
    }
    const j=await providerFetch('https://graph.facebook.com/v20.0/'+encodeURIComponent(id)+'?fields=id,username,name&access_token='+encodeURIComponent(token));
    return {label:j.username?'@'+j.username:(j.name||'Instagram'),meta:{id:j.id||id,username:j.username||'',name:j.name||''},accountId:j.id||id};
  }
  if(provider==='facebook'){
    let id=accountId;
    if(!id){
      const pages=await providerFetch('https://graph.facebook.com/v20.0/me/accounts?fields=id,name&access_token='+encodeURIComponent(token));
      if(!(pages.data||[]).length)throw new Error('No se encontró ninguna página de Facebook vinculada a esta autorización');
      id=pages.data[0].id;
    }
    const j=await providerFetch('https://graph.facebook.com/v20.0/'+encodeURIComponent(id)+'?fields=id,name&access_token='+encodeURIComponent(token));
    return {label:j.name||'Facebook',meta:{id:j.id||id,name:j.name||''},accountId:j.id||id};
  }
  if(provider==='whatsapp_business'){
    let id=accountId;
    if(!id){
      const businesses=await providerFetch('https://graph.facebook.com/v20.0/me/businesses?fields=id,name&access_token='+encodeURIComponent(token));
      const business=businesses.data?.[0];if(!business)throw new Error('No se encontró un Business Manager autorizado');
      const wabas=await providerFetch('https://graph.facebook.com/v20.0/'+encodeURIComponent(business.id)+'/owned_whatsapp_business_accounts?fields=id,name&access_token='+encodeURIComponent(token));
      const waba=wabas.data?.[0];if(!waba)throw new Error('No se encontró una cuenta de WhatsApp Business autorizada');
      const phones=await providerFetch('https://graph.facebook.com/v20.0/'+encodeURIComponent(waba.id)+'/phone_numbers?fields=id,display_phone_number,verified_name&access_token='+encodeURIComponent(token));
      id=phones.data?.[0]?.id;if(!id)throw new Error('No se encontró un número de WhatsApp Business autorizado');
    }
    const j=await providerFetch('https://graph.facebook.com/v20.0/'+encodeURIComponent(id)+'?fields=id,display_phone_number,verified_name&access_token='+encodeURIComponent(token));
    return {label:j.verified_name||j.display_phone_number||'WhatsApp Business',meta:{phoneNumberId:j.id||id,displayPhone:j.display_phone_number||'',verifiedName:j.verified_name||''},accountId:j.id||id};
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
ipcMain.handle('email:connect-generic',async(_e,payload={})=>{
  const policyState=await readState();assertModuleIncluded(policyState.license,'email');
  const email=String(payload.email||'').trim();
  const username=String(payload.username||email).trim();
  const password=String(payload.password||'');
  const imapHost=String(payload.imapHost||'').trim();
  const smtpHost=String(payload.smtpHost||'').trim();
  const imapPort=Number(payload.imapPort||993);
  const smtpPort=Number(payload.smtpPort||465);
  const provider=normalizeProviderKey(payload.provider||'generic_imap');
  if(!email||!username||!password||!imapHost||!smtpHost)throw new Error('Faltan datos de conexión del correo');
  const imapSecure=imapPort===993;
  const smtpSecure=smtpPort===465;
  const imap=new ImapFlow({host:imapHost,port:imapPort,secure:imapSecure,auth:{user:username,pass:password},logger:false});
  try{await imap.connect();await imap.logout()}catch(e){try{await imap.logout()}catch{};throw new Error('No se pudo conectar al correo entrante (IMAP): '+String(e?.message||e).slice(0,180))}
  const transport=nodemailer.createTransport({host:smtpHost,port:smtpPort,secure:smtpSecure,requireTLS:!smtpSecure,auth:{user:username,pass:password}});
  try{await transport.verify()}catch(e){throw new Error('El correo entrante funciona, pero no se pudo verificar el envío (SMTP): '+String(e?.message||e).slice(0,180))}
  const s=await readState();
  addMasterEmailAccount(s,{provider,module:'email',account:email,label:email,mode:'write',connectedAt:new Date().toISOString(),genericMail:{email,username,password,imapHost,imapPort,smtpHost,smtpPort}});
  await writeState(s);await audit('integration.connected','email · '+provider+' · '+email);
  return {connected:true,label:email,provider,mode:'write'};
});

ipcMain.handle('oauth:start',async(_e,payload={})=>{
  const s=await readState();
  const provider=normalizeProviderKey(payload.provider),module=normalizeProviderKey(payload.module||provider);
  assertModuleIncluded(s.license,module);
  const result=await postJson(CLOUD+'/api/oauth-start',{provider,module,shop:String(payload.shop||'').trim(),account:String(payload.account||'').trim(),customerId:s.secret?.customerId||null,deviceId:s.license?.deviceId||null});
  if(!result.authUrl||!result.state)throw new Error('No se pudo iniciar la autorización');
  shell.openExternal(result.authUrl).catch(()=>{});
  audit('oauth.started',module+' · '+provider).catch(()=>{});
  return {state:result.state,provider,module,authUrl:result.authUrl,expiresIn:result.expiresIn||900};
});
ipcMain.handle('oauth:status',async(_e,payload={})=>{
  const s=await readState();
  const result=await postJson(CLOUD+'/api/oauth-status',{state:String(payload.state||''),deviceId:s.license?.deviceId||null});
  if(result.status!=='completed')return result;
  const provider=normalizeProviderKey(result.provider),module=normalizeProviderKey(result.module||provider),token=String(result.token?.access_token||'').trim();
  assertModuleIncluded(s.license,module);
  if(!token)throw new Error('El proveedor no devolvió un token de acceso');
  if(provider==='shopify'){
    const shop=String(result.shop||'').trim();
    const data=await shopifyGraphql(shop,token,`query VentaNexIAConnectionCheck { shop { name myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`);
    const scopes=(data.currentAppInstallation?.accessScopes||[]).map(x=>x.handle).filter(Boolean);
    const fresh=await readState();fresh.secret=fresh.secret||{};fresh.secret.integrations=fresh.secret.integrations||{};
    fresh.secret.integrations.shopify={shop,token,refreshToken:result.token?.refresh_token||null,mode:'write',connectedAt:new Date().toISOString(),shopName:data.shop?.name||shop,scopes};
    await writeState(fresh);await audit('integration.shopify_connected',(data.shop?.name||shop)+' · OAuth');
    return {status:'connected',module:'shopify',provider:'shopify',label:data.shop?.name||shop,shop,shopName:data.shop?.name||shop,mode:'write',scopes};
  }
  const verified=await verifyIntegration(provider,{token,account:'',accountId:'',username:''});
  const fresh=await readState();fresh.secret=fresh.secret||{};fresh.secret.integrations=fresh.secret.integrations||{};
  const entry={provider,module,account:'',accountId:verified.accountId||verified.meta?.id||verified.meta?.phoneNumberId||'',username:verified.username||verified.meta?.username||'',token,refreshToken:result.token?.refresh_token||null,tokenType:result.token?.token_type||'Bearer',tokenExpiresIn:Number(result.token?.expires_in||0),mode:'write',label:verified.label,meta:verified.meta||{},connectedAt:new Date().toISOString()};
  if(module==='email')addMasterEmailAccount(fresh,entry);else fresh.secret.integrations[module]=entry;
  await writeState(fresh);await audit('integration.connected',module+' · '+provider+' · '+verified.label+' · OAuth');
  return {status:'connected',module,provider,label:verified.label,mode:'write',meta:verified.meta||{}};
});

ipcMain.handle('integration:connect',async(_e,payload={})=>{
  const provider=normalizeProviderKey(payload.provider),module=normalizeProviderKey(payload.module||provider);
  const s=await readState();assertModuleIncluded(s.license,module);
  const verified=await verifyIntegration(provider,payload);s.secret=s.secret||{};s.secret.integrations=s.secret.integrations||{};
  const entry={provider,module,account:String(payload.account||'').trim(),accountId:String(payload.accountId||'').trim(),username:String(payload.username||'').trim(),token:String(payload.token||'').trim(),mode:payload.mode==='write'?'write':'read',label:verified.label,meta:verified.meta||{},connectedAt:new Date().toISOString()};
  if(module==='email')addMasterEmailAccount(s,entry);else s.secret.integrations[module]=entry;
  await writeState(s);await audit('integration.connected',module+' · '+provider+' · '+verified.label);
  return {connected:true,module,provider,label:verified.label,mode:s.secret.integrations[module].mode,meta:verified.meta||{}};
});
ipcMain.handle('integration:status',async(_e,module)=>{
  const key=normalizeProviderKey(module),s=await readState();
  if(key==='email'){
    const accounts=emailAccountsFromState(s);
    if(!accounts.length)return {connected:false,module:key,accounts:[]};
    return {connected:true,module:key,provider:accounts[0].provider,label:accounts.length===1?(accounts[0].label||accounts[0].account||accounts[0].provider):(accounts.length+' cuentas de correo'),mode:'write',meta:accounts[0].meta||{},connectedAt:accounts[0].connectedAt||null,accounts:accounts.map(x=>({label:x.label||x.meta?.email||x.account||'Correo',provider:x.provider,connectedAt:x.connectedAt||null}))};
  }
  const x=s.secret?.integrations?.[key];
  if(!x)return {connected:false,module:key};
  return {connected:true,module:key,provider:x.provider,label:x.label||x.account||x.provider,mode:x.mode||'read',meta:x.meta||{},connectedAt:x.connectedAt||null};
});
ipcMain.handle('integration:disconnect',async(_e,module)=>{
  const key=normalizeProviderKey(module),s=await readState();
  if(key==='email'){if(s.secret?.integrations?.email)delete s.secret.integrations.email;s.secret.emailAccounts=[];}
  else if(s.secret?.integrations?.[key])delete s.secret.integrations[key];
  await writeState(s);await audit('integration.disconnected',key);return true;
});

ipcMain.handle('shopify:connect',async(_e,payload={})=>{
  const policyState=await readState();assertModuleIncluded(policyState.license,'shopify');
  const shop=normalizeShopifyShop(payload.shop);
  const token=String(payload.token||'').trim();
  const mode=payload.mode==='write'?'write':'read';
  if(!shop||!token)throw new Error('Indica la tienda .myshopify.com y el token de Admin API');
  const data=await shopifyGraphql(shop,token,`query VentaNexIAConnectionCheck { shop { name myshopifyDomain } currentAppInstallation { accessScopes { handle } } }`);
  const scopes=(data.currentAppInstallation?.accessScopes||[]).map(x=>x.handle).filter(Boolean);
  const s=await readState();s.secret=s.secret||{};s.secret.integrations=s.secret.integrations||{};
  s.secret.integrations.shopify={shop,token,mode,connectedAt:new Date().toISOString(),shopName:data.shop?.name||shop,scopes};
  await writeState(s);await audit('integration.shopify_connected',`${data.shop?.name||shop} · ${mode==='write'?'lectura/escritura':'solo lectura'}`);
  return {connected:true,shop,shopName:data.shop?.name||shop,mode,scopes};
});
ipcMain.handle('shopify:status',async()=>{
  const s=await readState(),x=s.secret?.integrations?.shopify;
  if(!x)return {connected:false};
  return {connected:true,shop:x.shop,shopName:x.shopName||x.shop,mode:x.mode||'read',scopes:x.scopes||[],connectedAt:x.connectedAt||null};
});
ipcMain.handle('shopify:disconnect',async()=>{
  const s=await readState();if(s.secret?.integrations?.shopify)delete s.secret.integrations.shopify;await writeState(s);await audit('integration.shopify_disconnected','Shopify desconectado');return true;
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

async function runHealthCheck(){
  const checks=[];
  const add=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),detail:String(detail||'').slice(0,500)});
  let state=null;
  try{state=await readState();add('Configuración de VentaNexIA',true)}catch(e){add('Configuración de VentaNexIA',false,e.message)}
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
  const ints=state?.secret?.integrations||{};
  for(const [key,x] of Object.entries(ints).slice(0,15)){
    let ok=Boolean(x.token||key==='shopify'),detail=x.connectedAt?'Conectada':'Sin fecha de conexión';
    if(ok&&x.token&&x.provider){
      try{await verifyIntegration(x.provider,{token:x.token,account:x.account||'',accountId:x.accountId||'',username:x.username||''});detail='Conexión comprobada'}
      catch(e){ok=false;detail='La autorización puede haber caducado'}
    }else if(ok&&key==='shopify'){
      try{await shopifyGraphql(x.shop,x.token,`query VentaNexIAHealth { shop { name } }`);detail='Conexión comprobada'}catch{ok=false;detail='La autorización puede haber caducado'}
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
    const s=await readState();
    s.permissions=s.permissions||{folders:[]};
    if(!Array.isArray(s.permissions.folders))s.permissions.folders=[];
    s.activity=Array.isArray(s.activity)?s.activity:[];
    s.license=s.license||{};
    s.secret=s.secret||{};
    await writeState(s);
    actions.push('Configuración local revisada.');
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

ipcMain.handle('connection:list',async()=>{
  const s=await readState(),out=[];
  const emailAccounts=emailAccountsFromState(s);
  for(let i=0;i<emailAccounts.length;i++){
    const x=emailAccounts[i];out.push({key:'integration:email:'+i,type:'integration',module:'email',provider:x.provider||'',label:x.label||x.meta?.email||x.account||('Correo '+(i+1))});
  }
  for(const [module,x] of Object.entries(s.secret?.integrations||{})){
    if(!x||module==='email')continue;
    out.push({key:'integration:'+module,type:'integration',module,provider:x.provider||'',label:x.label||x.meta?.email||x.account||module});
  }
  for(const folder of s.permissions?.folders||[])out.push({key:'folder:'+folder,type:'folder',folder,label:'Carpeta · '+path.basename(folder)});
  return out;
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
