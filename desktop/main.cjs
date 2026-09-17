const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const crypto=require('node:crypto');

const CLOUD='https://www.ventanexia.es';
const TEXT_EXTENSIONS=new Set(['.txt','.csv','.json','.md','.log']);
const MAX_CONTEXT_FILES=80;
const MAX_CONTEXT_CHARS=120000;
const MAX_FILE_CHARS=20000;
let mainWindow;
const storeFile=()=>path.join(app.getPath('userData'),'secure-state.json');

async function readState(){
  try{
    const raw=JSON.parse(await fs.readFile(storeFile(),'utf8'));
    if(raw.secret&&safeStorage.isEncryptionAvailable()){
      raw.secret=JSON.parse(safeStorage.decryptString(Buffer.from(raw.secret,'base64')));
    } else raw.secret={};
    return raw;
  }catch{return {permissions:{folders:[]},activity:[],secret:{deviceToken:null}}}
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
      if(entry.isDirectory()){
        await walk(root,full,depth+1);
        continue;
      }
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

ipcMain.handle('system:status',async()=>({platform:process.platform,hostname:os.hostname(),version:app.getVersion(),encrypted:safeStorage.isEncryptionAvailable(),cloud:CLOUD}));
ipcMain.handle('state:get',async()=>{const s=await readState();return {permissions:s.permissions||{folders:[]},activity:s.activity||[],paired:Boolean(s.secret?.deviceToken)}});
ipcMain.handle('folder:choose',async()=>{
  const r=await dialog.showOpenDialog(mainWindow,{properties:['openDirectory'],title:'Autorizar carpeta para VentaNexIA'});
  if(r.canceled||!r.filePaths[0])return null;
  const folder=r.filePaths[0],s=await readState();
  s.permissions=s.permissions||{folders:[]};
  if(!s.permissions.folders.includes(folder))s.permissions.folders.push(folder);
  await writeState(s);
  await audit('permission.granted',`Carpeta autorizada: ${folder}`);
  return folder;
});
ipcMain.handle('folder:revoke',async(_e,folder)=>{const s=await readState();s.permissions.folders=(s.permissions?.folders||[]).filter(x=>x!==folder);await writeState(s);await audit('permission.revoked',`Carpeta revocada: ${folder}`);return true});
ipcMain.handle('folder:list',async(_e,folder)=>{
  const s=await readState();
  const root=authorizedRootFor(folder,s.permissions?.folders||[]);
  if(!root)throw new Error('Carpeta no autorizada');
  const current=path.resolve(folder);
  const items=await fs.readdir(current,{withFileTypes:true});
  await audit('folder.read',`Listado leído: ${current}`);
  return {
    root,
    folder:current,
    items:items.slice(0,200).filter(x=>!x.isSymbolicLink()).map(x=>({name:x.name,type:x.isDirectory()?'folder':'file',path:path.join(current,x.name)}))
  };
});
ipcMain.handle('folder:create-test',async(_e,folder)=>{
  const s=await readState();if(!(s.permissions?.folders||[]).includes(folder))throw new Error('Carpeta no autorizada');
  const file=path.join(folder,`ventanexia-prueba-${Date.now()}.txt`);await fs.writeFile(file,'Archivo creado por VentaNexIA Desktop tras autorización explícita.\n','utf8');await audit('file.created',file);return file;
});
ipcMain.handle('support:quick-assist',async()=>{await audit('support.requested','Asistencia rápida abierta por el cliente');await shell.openExternal('ms-quick-assist:');return true});
ipcMain.handle('support:stop',async()=>{await audit('support.stopped','Cliente pulsó detener asistencia');return true});
ipcMain.handle('chat:send',async(_e,messages)=>{
  const localContext=await collectAuthorizedContext();
  const r=await fetch(`${CLOUD}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':'VentaNexIA-Desktop/0.1'},body:JSON.stringify({messages:(messages||[]).slice(-20),localContext})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'No se pudo contactar con VentaNexIA');
  await audit('ai.chat',`Consulta realizada con ${localContext.length} archivo(s) textual(es) autorizados`);return j;
});
ipcMain.handle('device:pair-demo',async()=>{const s=await readState();s.secret=s.secret||{};s.secret.deviceToken=crypto.randomBytes(32).toString('base64url');await writeState(s);await audit('device.paired','Equipo vinculado en modo de prueba local');return {ok:true,deviceId:crypto.createHash('sha256').update(os.hostname()).digest('hex').slice(0,12)}});

app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
