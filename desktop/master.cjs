const {app,BrowserWindow,ipcMain,safeStorage,shell,Menu,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');

// Load the existing SecureCore Desktop. This file adds the Master-only capabilities
// without changing the stable local-folder/licensing implementation in main.cjs.
require('./main.cjs');

const CLOUD='https://www.ventanexia.es';
const TEXT_EXTENSIONS=new Set(['.txt','.csv','.json','.md','.log']);
const MAX_CONTEXT_FILES=80;
const MAX_CONTEXT_CHARS=120000;
const MAX_FILE_CHARS=20000;
const PORTAL_PAGE_CHARS=20000;
const PORTAL_MAX_PAGES=4;

const storeFile=()=>path.join(app.getPath('userData'),'secure-state.json');

async function readState(){
  try{
    const raw=JSON.parse(await fs.readFile(storeFile(),'utf8'));
    if(raw.secret&&safeStorage.isEncryptionAvailable()){
      raw.secret=JSON.parse(safeStorage.decryptString(Buffer.from(raw.secret,'base64')));
    }else raw.secret={};
    raw.permissions=raw.permissions||{folders:[]};
    raw.activity=raw.activity||[];
    raw.license=raw.license||{};
    raw.portals=Array.isArray(raw.portals)?raw.portals:[];
    return raw;
  }catch{return {permissions:{folders:[]},activity:[],license:{},portals:[],secret:{}}}
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
function clean(v,n=500){return String(v||'').trim().slice(0,n)}
function norm(v=''){return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function portalId(url){return crypto.createHash('sha256').update(String(url||'')).digest('hex').slice(0,16)}
function partitionFor(id){return `persist:vnx-portal-${String(id||'portal').replace(/[^a-z0-9_-]/gi,'')}`}
function validHttps(url){try{return new URL(url).protocol==='https:'}catch{return false}}
function sameOrigin(a,b){try{return new URL(a).origin===new URL(b).origin}catch{return false}}
function likelyLogin(url,text=''){
  const u=norm(url),t=norm(text).slice(0,2500);
  return /\/login|\/signin|\/sign-in|acceso|iniciar-sesion/.test(u)||(/iniciar sesion|sign in|acceder/.test(t)&&/contrasena|password/.test(t));
}

function installEditing(win){
  if(!win||win.isDestroyed())return;
  win.webContents.on('before-input-event',(event,input)=>{
    if(!(input.control||input.meta)||input.type!=='keyDown')return;
    const k=String(input.key||'').toLowerCase();
    if(k==='c'){win.webContents.copy();event.preventDefault()}
    else if(k==='v'){win.webContents.paste();event.preventDefault()}
    else if(k==='x'){win.webContents.cut();event.preventDefault()}
    else if(k==='a'){win.webContents.selectAll();event.preventDefault()}
    else if(k==='z'){win.webContents.undo();event.preventDefault()}
    else if(k==='y'){win.webContents.redo();event.preventDefault()}
  });
  win.webContents.on('context-menu',(_event,params)=>{
    const template=[];
    if(params.isEditable){
      template.push(
        {label:'Deshacer',role:'undo',enabled:params.editFlags?.canUndo!==false},
        {label:'Rehacer',role:'redo',enabled:params.editFlags?.canRedo!==false},
        {type:'separator'},
        {label:'Cortar',role:'cut',enabled:params.editFlags?.canCut!==false},
        {label:'Copiar',role:'copy',enabled:params.editFlags?.canCopy!==false},
        {label:'Pegar',role:'paste',enabled:params.editFlags?.canPaste!==false},
        {label:'Seleccionar todo',role:'selectAll'}
      );
    }else if(params.selectionText){
      template.push({label:'Copiar',role:'copy'});
    }
    if(template.length)Menu.buildFromTemplate(template).popup({window:win});
  });
}

// Every VentaNexIA window gets normal Windows editing shortcuts. The Master renderer
// is injected only in the local Desktop window, never in connected portals.
app.on('browser-window-created',(_event,win)=>{
  installEditing(win);
  win.webContents.on('did-finish-load',async()=>{
    const url=win.webContents.getURL();
    if(!url.startsWith('file://')||!url.toLowerCase().includes('renderer/index.html'))return;
    try{
      const script=await fs.readFile(path.join(__dirname,'renderer','master.js'),'utf8');
      await win.webContents.executeJavaScript(script,true);
    }catch(e){console.error('master_renderer_inject_error',String(e?.message||e).slice(0,300))}
  });
});

async function listPortals(){
  const s=await readState();
  return (s.portals||[]).map(p=>({
    id:p.id,name:p.name,url:p.url,mode:p.mode||'read',connectedAt:p.connectedAt||null,
    lastCheckedAt:p.lastCheckedAt||null,lastStatus:p.lastStatus||'not_connected',lastUrl:p.lastUrl||null
  }));
}
async function savePortal(payload={}){
  const name=clean(payload.name,120),url=clean(payload.url,1000),mode=payload.mode==='write'?'write':'read';
  if(!name||!validHttps(url))throw new Error('Indica un nombre y una URL segura https://');
  const s=await readState();
  s.portals=Array.isArray(s.portals)?s.portals:[];
  const id=clean(payload.id,80)||portalId(url);
  const i=s.portals.findIndex(p=>p.id===id||p.url===url);
  const old=i>=0?s.portals[i]:{};
  const next={...old,id,name,url,mode,createdAt:old.createdAt||new Date().toISOString()};
  if(i>=0)s.portals[i]=next;else s.portals.push(next);
  await writeState(s);await audit('portal.saved',`${name} · ${mode==='read'?'solo lectura':'lectura/escritura'}`);
  return next;
}
async function patchPortal(id,patch){
  const s=await readState();
  s.portals=Array.isArray(s.portals)?s.portals:[];
  const i=s.portals.findIndex(p=>p.id===id);
  if(i<0)return null;
  s.portals[i]={...s.portals[i],...patch};
  await writeState(s);return s.portals[i];
}
async function getPortal(id){return (await readState()).portals?.find(p=>p.id===id)||null}

function portalWindowOptions(portal,{show=true}={}){
  return {
    width:1180,height:820,minWidth:900,minHeight:650,show,
    title:`VentaNexIA · ${portal.name}`,
    backgroundColor:'#ffffff',
    webPreferences:{
      partition:partitionFor(portal.id),contextIsolation:true,nodeIntegration:false,sandbox:true,
      devTools:false
    }
  };
}
async function openPortalLogin(id){
  const portal=await getPortal(id);if(!portal)throw new Error('Portal no encontrado');
  const win=new BrowserWindow(portalWindowOptions(portal,{show:true}));
  installEditing(win);
  win.removeMenu();
  win.webContents.setWindowOpenHandler(({url})=>{
    if(sameOrigin(url,portal.url)){win.loadURL(url);return {action:'deny'}}
    if(/^https:\/\//i.test(url))shell.openExternal(url);
    return {action:'deny'};
  });
  win.webContents.on('did-navigate',async(_e,url)=>{
    if(!sameOrigin(url,portal.url))return;
    if(!likelyLogin(url,'')){
      await patchPortal(portal.id,{connectedAt:new Date().toISOString(),lastStatus:'connected',lastUrl:url,lastCheckedAt:new Date().toISOString()});
      await audit('portal.connected',`${portal.name} · sesión autenticada localmente`);
    }
  });
  await win.loadURL(portal.url);
  return {ok:true,id:portal.id,message:'Ventana de conexión abierta. Inicia sesión y vuelve a VentaNexIA cuando termines.'};
}

async function extractPage(win){
  return win.webContents.executeJavaScript(`(()=>{
    const clean=s=>String(s||'').replace(/\\s+/g,' ').trim();
    const links=[...document.querySelectorAll('a[href]')].slice(0,500).map(a=>({text:clean(a.innerText||a.textContent),href:a.href})).filter(x=>x.href);
    const images=[...document.images].map(img=>({src:img.currentSrc||img.src,alt:clean(img.alt),w:img.naturalWidth||0,h:img.naturalHeight||0})).filter(x=>x.src&&(x.w>=100||x.h>=100)).slice(0,30);
    return {title:document.title||'',text:String(document.body?.innerText||'').slice(0,35000),links,images,url:location.href};
  })()`,true);
}
function queryTerms(question=''){
  const q=norm(question);
  const groups=[
    ['pedido',['pedido','pedidos','order','orders']],['factura',['factura','facturas','invoice','invoices','facturacion']],
    ['producto',['producto','productos','product','products','catalogo']],['cliente',['cliente','clientes','customer','customers']],
    ['tarifa',['tarifa','tarifas','precio','precios','price','prices']],['alerta',['alerta','alertas']],
    ['dashboard',['dashboard','resumen','facturado','ventas','venta','hoy','semana','mes']]
  ];
  const wanted=[];
  for(const [key,words] of groups)if(words.some(w=>q.includes(w)))wanted.push(...words,key);
  const free=q.split(/[^a-z0-9]+/).filter(w=>w.length>=5).slice(0,8);
  return [...new Set([...wanted,...free])];
}
function chooseLinks(baseUrl,links=[],question=''){
  const terms=queryTerms(question);const origin=new URL(baseUrl).origin;
  const ranked=[];
  for(const l of links){
    try{
      const u=new URL(l.href,baseUrl);if(u.origin!==origin||!['http:','https:'].includes(u.protocol))continue;
      const hay=norm(`${l.text} ${u.pathname} ${u.search}`);
      let score=0;for(const term of terms)if(hay.includes(term))score+=3;
      if(/logout|cerrar sesion|delete|eliminar|borrar|remove|cancel|anular|editar|edit|nuevo|new|crear|create/.test(hay))score-=12;
      if(score>0)ranked.push({url:u.href,text:l.text,score});
    }catch{}
  }
  ranked.sort((a,b)=>b.score-a.score);
  const seen=new Set();const out=[];
  for(const x of ranked){if(seen.has(x.url))continue;seen.add(x.url);out.push(x);if(out.length>=PORTAL_MAX_PAGES-1)break;}
  return out;
}
async function readPortal(portal,question=''){
  const win=new BrowserWindow(portalWindowOptions(portal,{show:false}));
  win.removeMenu();
  try{
    await win.loadURL(portal.url);
    let page=await extractPage(win);
    if(likelyLogin(page.url,page.text)){
      await patchPortal(portal.id,{lastStatus:'login_required',lastCheckedAt:new Date().toISOString(),lastUrl:page.url});
      return {name:portal.name,url:portal.url,status:'login_required',mode:portal.mode,pages:[],images:[]};
    }
    const pages=[{title:page.title,url:page.url,text:page.text.slice(0,PORTAL_PAGE_CHARS)}];
    const images=[...(page.images||[])];
    const targets=chooseLinks(portal.url,page.links||[],question);
    for(const target of targets){
      try{
        await win.loadURL(target.url);
        const p=await extractPage(win);
        if(likelyLogin(p.url,p.text))break;
        pages.push({title:p.title,url:p.url,text:p.text.slice(0,PORTAL_PAGE_CHARS)});
        images.push(...(p.images||[]));
      }catch{}
    }
    await patchPortal(portal.id,{connectedAt:portal.connectedAt||new Date().toISOString(),lastStatus:'connected',lastCheckedAt:new Date().toISOString(),lastUrl:page.url});
    return {name:portal.name,url:portal.url,status:'connected',mode:portal.mode,pages,images:images.slice(0,12)};
  }finally{if(!win.isDestroyed())win.destroy()}
}
async function collectPortalContext(question=''){
  const s=await readState();const connected=(s.portals||[]).filter(p=>p.mode==='read'||p.mode==='write');
  const out=[];
  for(const portal of connected.slice(0,4)){
    try{out.push(await readPortal(portal,question))}catch(e){out.push({name:portal.name,url:portal.url,status:'error',mode:portal.mode,pages:[],images:[],error:String(e?.message||e).slice(0,200)})}
  }
  return out;
}

async function collectAuthorizedContext(){
  const s=await readState();const roots=s.permissions?.folders||[];const files=[];let totalChars=0;
  async function walk(root,current,depth){
    if(depth>6||files.length>=MAX_CONTEXT_FILES||totalChars>=MAX_CONTEXT_CHARS)return;
    let entries=[];try{entries=await fs.readdir(current,{withFileTypes:true})}catch{return}
    for(const entry of entries){
      if(files.length>=MAX_CONTEXT_FILES||totalChars>=MAX_CONTEXT_CHARS)break;
      if(entry.isSymbolicLink())continue;
      const full=path.join(current,entry.name);
      if(entry.isDirectory()){await walk(root,full,depth+1);continue;}
      if(!entry.isFile()||!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))continue;
      try{
        const text=(await fs.readFile(full,'utf8')).slice(0,MAX_FILE_CHARS);const remaining=MAX_CONTEXT_CHARS-totalChars;const content=text.slice(0,remaining);
        if(!content)continue;files.push({path:path.relative(root,full),content});totalChars+=content.length;
      }catch{}
    }
  }
  for(const root of roots){if(files.length>=MAX_CONTEXT_FILES||totalChars>=MAX_CONTEXT_CHARS)break;await walk(root,root,0)}
  return files;
}
function lastUserMessage(messages=[]){for(let i=messages.length-1;i>=0;i--)if(messages[i]?.role==='user')return String(messages[i].content||'');return ''}
function portalAsLocalFiles(portals=[]){
  const out=[];
  for(const p of portals){
    if(p.status!=='connected')continue;
    for(const page of p.pages||[]){
      out.push({path:`PORTAL ${p.name} · ${page.title||'Página'} · ${page.url}`,content:`FUENTE: portal privado autorizado en modo ${p.mode==='read'?'SOLO LECTURA':'autorizado'}. No ejecutar modificaciones.\n${page.text||''}`});
    }
  }
  return out;
}

ipcMain.handle('portal:list',async()=>listPortals());
ipcMain.handle('portal:save',async(_e,payload)=>savePortal(payload));
ipcMain.handle('portal:connect',async(_e,id)=>openPortalLogin(clean(id,80)));
ipcMain.handle('portal:check',async(_e,id)=>{
  const p=await getPortal(clean(id,80));if(!p)throw new Error('Portal no encontrado');
  const result=await readPortal(p,'dashboard estado conexión');
  await audit('portal.checked',`${p.name} · ${result.status}`);return result;
});
ipcMain.handle('portal:remove',async(_e,id)=>{
  const portal=await getPortal(clean(id,80));if(!portal)return true;
  const s=await readState();s.portals=(s.portals||[]).filter(p=>p.id!==portal.id);await writeState(s);
  try{await session.fromPartition(partitionFor(portal.id)).clearStorageData()}catch{}
  await audit('portal.removed',portal.name);return true;
});

// Replace the base chat transport so the AI receives both authorised local files and
// live, read-only pages from authenticated private portals.
ipcMain.removeHandler('chat:send');
ipcMain.handle('chat:send',async(_e,messages)=>{
  const localContext=await collectAuthorizedContext();
  const question=lastUserMessage(messages);
  const portalContext=await collectPortalContext(question);
  const portalFiles=portalAsLocalFiles(portalContext);
  const combined=[...localContext,...portalFiles].slice(0,MAX_CONTEXT_FILES);
  const s=await readState();
  const r=await fetch(`${CLOUD}/api/chat`,{
    method:'POST',headers:{'Content-Type':'application/json','User-Agent':`VentaNexIA-Desktop/${app.getVersion()}`},
    body:JSON.stringify({messages:(messages||[]).slice(-20),localContext:combined,desktop:{customerId:s.secret?.customerId||null,deviceId:s.license?.deviceId||null,portalCount:portalFiles.length}})
  });
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'No se pudo contactar con VentaNexIA');
  const images=[];const seen=new Set();
  for(const p of portalContext)for(const img of p.images||[]){if(!img?.src||seen.has(img.src))continue;seen.add(img.src);images.push({src:img.src,alt:img.alt||p.name});if(images.length>=8)break;}
  j.images=images;j.portalStatus=portalContext.map(p=>({name:p.name,status:p.status}));
  await audit('ai.chat',`Consulta con ${localContext.length} archivo(s) y ${portalFiles.length} página(s) de portal autorizadas`);
  return j;
});
