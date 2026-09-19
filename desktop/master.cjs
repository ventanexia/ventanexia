const {app,BrowserWindow,ipcMain,shell,Menu,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const {normalizeChatScope,parseGmailContext,emailAgentDirectReply}=require('./agent-email.cjs');
const {AGENT_CATALOG,isAgentIncluded,assertAgentIncluded,isMaster}=require('./agent-policy.cjs');
const {readState,writeState,updateState,audit}=require('./state-store.cjs');
const {gmailCall}=require('./gmail-auth.cjs');
let prospecting=null;
try{prospecting=require('./prospecting.cjs')}catch(e){console.error('prospecting_load_error',String(e?.message||e).slice(0,180))}

require('./main.cjs');

const CLOUD='https://www.ventanexia.es';
const TEXT_EXTENSIONS=new Set(['.txt','.csv','.json','.md','.log']);
const MAX_CONTEXT_FILES=80;
const MAX_CONTEXT_CHARS=120000;
const MAX_FILE_CHARS=20000;
const PORTAL_PAGE_CHARS=20000;
const PORTAL_MAX_PAGES=4;

function clean(v,n=500){return String(v||'').trim().slice(0,n)}
function norm(v=''){return String(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function portalId(url){return crypto.createHash('sha256').update(String(url||'')).digest('hex').slice(0,16)}
function partitionFor(id){return `persist:vnx-portal-${String(id||'portal').replace(/[^a-z0-9_-]/gi,'')}`}
function validHttps(url){try{return new URL(url).protocol==='https:'}catch{return false}}
function isShopifyAdminUrl(url=''){
  try{
    const u=new URL(String(url||''));
    const h=u.hostname.toLowerCase(),p=u.pathname.toLowerCase();
    return h==='admin.shopify.com'||(h.endsWith('.myshopify.com')&&(/^\/admin(?:\/|$)/.test(p)||/\/settings(?:\/|$)/.test(p)));
  }catch{return false}
}
function sameOrigin(a,b){try{return new URL(a).origin===new URL(b).origin}catch{return false}}
function looksAuthenticated(text=''){
  const t=norm(text).slice(0,8000);
  return /cerrar sesion|logout|dashboard|pedidos web|facturas|productos|clientes|tarifas/.test(t);
}
function likelyLogin(url,text=''){
  if(looksAuthenticated(text))return false;
  const u=norm(url),t=norm(text).slice(0,3500);
  return /\/login(?:\/|\?|$)|\/signin(?:\/|\?|$)|\/sign-in(?:\/|\?|$)|\/iniciar-sesion(?:\/|\?|$)/.test(u)||(/iniciar sesion|sign in|acceder/.test(t)&&/contrasena|password/.test(t));
}
function portalStartUrl(portal,{forLogin=false}={}){
  if(forLogin)return portal.url;
  try{
    if(portal.lastUrl&&sameOrigin(portal.lastUrl,portal.url)&&!likelyLogin(portal.lastUrl,''))return portal.lastUrl;
    const u=new URL(portal.url);
    return `${u.origin}/`;
  }catch{return portal.url}
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));

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
      template.push({label:'Deshacer',role:'undo',enabled:params.editFlags?.canUndo!==false},{label:'Rehacer',role:'redo',enabled:params.editFlags?.canRedo!==false},{type:'separator'},{label:'Cortar',role:'cut',enabled:params.editFlags?.canCut!==false},{label:'Copiar',role:'copy',enabled:params.editFlags?.canCopy!==false},{label:'Pegar',role:'paste',enabled:params.editFlags?.canPaste!==false},{label:'Seleccionar todo',role:'selectAll'});
    }else if(params.selectionText)template.push({label:'Copiar',role:'copy'});
    if(template.length)Menu.buildFromTemplate(template).popup({window:win});
  });
}

app.on('browser-window-created',(_event,win)=>{installEditing(win);});

async function listPortals(){
  const s=await readState();
  const all=Array.isArray(s.portals)?s.portals:[];
  const valid=all.filter(p=>!isShopifyAdminUrl(p.url)&&!isShopifyAdminUrl(p.lastUrl));
  if(valid.length!==all.length){
    s.portals=valid;await writeState(s);
    audit('portal.cleanup','Se eliminaron conexiones Shopify Admin guardadas erróneamente como portal genérico').catch(()=>{});
  }
  return valid.map(p=>({id:p.id,name:p.name,url:p.url,mode:p.mode||'read',connectedAt:p.connectedAt||null,lastCheckedAt:p.lastCheckedAt||null,lastStatus:p.lastStatus||'not_connected',lastUrl:p.lastUrl||null}));
}
async function savePortal(payload={}){
  const name=clean(payload.name,120),url=clean(payload.url,1000),mode=payload.mode==='write'?'write':'read';
  if(!name||!validHttps(url))throw new Error('Indica un nombre y una URL segura https://');
  if(isShopifyAdminUrl(url))throw new Error('Shopify no debe conectarse como portal del navegador. Usa “Conexiones > Shopify” para crear una conexión real y verificada por API.');
  const s=await readState();s.portals=Array.isArray(s.portals)?s.portals:[];
  const id=clean(payload.id,80)||portalId(url),i=s.portals.findIndex(p=>p.id===id||p.url===url),old=i>=0?s.portals[i]:{};
  const next={...old,id,name,url,mode,createdAt:old.createdAt||new Date().toISOString()};
  if(i>=0)s.portals[i]=next;else s.portals.push(next);
  await writeState(s);await audit('portal.saved',`${name} · ${mode==='read'?'solo lectura':'lectura/escritura'}`);return next;
}
async function patchPortal(id,patch){
  const s=await readState();s.portals=Array.isArray(s.portals)?s.portals:[];const i=s.portals.findIndex(p=>p.id===id);if(i<0)return null;
  s.portals[i]={...s.portals[i],...patch};await writeState(s);return s.portals[i];
}
async function getPortal(id){return (await readState()).portals?.find(p=>p.id===id)||null}

function portalWindowOptions(portal,{show=true}={}){
  return {width:1180,height:820,minWidth:900,minHeight:650,show,title:`VentaNexIA · ${portal.name}`,backgroundColor:'#ffffff',webPreferences:{partition:partitionFor(portal.id),contextIsolation:true,nodeIntegration:false,sandbox:true,devTools:false}};
}
async function markConnectedIfAuthenticated(portal,win,url){
  if(!sameOrigin(url,portal.url))return;
  try{
    await delay(250);
    const text=await win.webContents.executeJavaScript(`String(document.body?.innerText||'').slice(0,8000)`,true);
    if(likelyLogin(url,text))return;
    try{await session.fromPartition(partitionFor(portal.id)).cookies.flushStore()}catch{}
    await patchPortal(portal.id,{connectedAt:new Date().toISOString(),lastStatus:'connected',lastUrl:url,lastCheckedAt:new Date().toISOString()});
    await audit('portal.connected',`${portal.name} · sesión autenticada localmente`);
  }catch{}
}
async function openPortalLogin(id){
  const portal=await getPortal(id);if(!portal)throw new Error('Portal no encontrado');
  const win=new BrowserWindow(portalWindowOptions(portal,{show:true}));installEditing(win);win.removeMenu();
  win.webContents.setWindowOpenHandler(({url})=>{if(sameOrigin(url,portal.url)){win.loadURL(url);return {action:'deny'}}if(/^https:\/\//i.test(url))shell.openExternal(url);return {action:'deny'}});
  win.webContents.on('did-navigate',(_e,url)=>markConnectedIfAuthenticated(portal,win,url));
  win.webContents.on('did-navigate-in-page',(_e,url)=>markConnectedIfAuthenticated(portal,win,url));
  await win.loadURL(portalStartUrl(portal,{forLogin:portal.lastStatus!=='connected'}));
  return {ok:true,id:portal.id,message:'Ventana de conexión abierta. Inicia sesión y vuelve a VentaNexIA cuando termines.'};
}

async function extractPage(win){
  return win.webContents.executeJavaScript(`(()=>{const clean=s=>String(s||'').replace(/\\s+/g,' ').trim();const links=[...document.querySelectorAll('a[href]')].slice(0,500).map(a=>({text:clean(a.innerText||a.textContent),href:a.href})).filter(x=>x.href);const images=[...document.images].map(img=>({src:img.currentSrc||img.src,alt:clean(img.alt),w:img.naturalWidth||0,h:img.naturalHeight||0})).filter(x=>x.src&&(x.w>=100||x.h>=100)).slice(0,30);return {title:document.title||'',text:String(document.body?.innerText||'').slice(0,35000),links,images,url:location.href};})()`,true);
}
function queryTerms(question=''){
  const q=norm(question),groups=[['pedido',['pedido','pedidos','order','orders']],['factura',['factura','facturas','invoice','invoices','facturacion','facturado']],['producto',['producto','productos','product','products','catalogo']],['cliente',['cliente','clientes','customer','customers']],['tarifa',['tarifa','tarifas','precio','precios','price','prices']],['alerta',['alerta','alertas']],['dashboard',['dashboard','resumen','facturado','ventas','venta','hoy','semana','mes']]],wanted=[];
  for(const [key,words] of groups)if(words.some(w=>q.includes(w)))wanted.push(...words,key);
  const free=q.split(/[^a-z0-9]+/).filter(w=>w.length>=5).slice(0,8);return [...new Set([...wanted,...free])];
}
function chooseLinks(baseUrl,links=[],question=''){
  const terms=queryTerms(question),origin=new URL(baseUrl).origin,ranked=[];
  for(const l of links){try{const u=new URL(l.href,baseUrl);if(u.origin!==origin||!['http:','https:'].includes(u.protocol))continue;const hay=norm(`${l.text} ${u.pathname} ${u.search}`);let score=0;for(const term of terms)if(hay.includes(term))score+=3;if(/logout|cerrar sesion|delete|eliminar|borrar|remove|cancel|anular|editar|edit|nuevo|new|crear|create/.test(hay))score-=12;if(score>0)ranked.push({url:u.href,text:l.text,score})}catch{}}
  ranked.sort((a,b)=>b.score-a.score);const seen=new Set(),out=[];for(const x of ranked){if(seen.has(x.url))continue;seen.add(x.url);out.push(x);if(out.length>=PORTAL_MAX_PAGES-1)break}return out;
}
async function readPortal(portal,question=''){
  const win=new BrowserWindow(portalWindowOptions(portal,{show:false}));win.removeMenu();
  try{
    const start=portalStartUrl(portal);await win.loadURL(start);await delay(350);let page=await extractPage(win);
    if(likelyLogin(page.url,page.text)){
      await patchPortal(portal.id,{lastStatus:'login_required',lastCheckedAt:new Date().toISOString(),lastUrl:page.url});
      return {name:portal.name,url:portal.url,status:'login_required',mode:portal.mode,pages:[],images:[]};
    }
    const pages=[{title:page.title,url:page.url,text:page.text.slice(0,PORTAL_PAGE_CHARS)}],images=[...(page.images||[])];
    const targets=chooseLinks(page.url,page.links||[],question);
    for(const target of targets){try{await win.loadURL(target.url);await delay(250);const p=await extractPage(win);if(likelyLogin(p.url,p.text))break;pages.push({title:p.title,url:p.url,text:p.text.slice(0,PORTAL_PAGE_CHARS)});images.push(...(p.images||[]))}catch{}}
    try{await session.fromPartition(partitionFor(portal.id)).cookies.flushStore()}catch{}
    await patchPortal(portal.id,{connectedAt:portal.connectedAt||new Date().toISOString(),lastStatus:'connected',lastCheckedAt:new Date().toISOString(),lastUrl:page.url});
    return {name:portal.name,url:portal.url,status:'connected',mode:portal.mode,pages,images:images.slice(0,12)};
  }finally{if(!win.isDestroyed())win.destroy()}
}
async function collectPortalContext(question=''){
  const s=await readState(),connected=(s.portals||[]).filter(p=>!isShopifyAdminUrl(p.url)&&!isShopifyAdminUrl(p.lastUrl)&&(p.mode==='read'||p.mode==='write')),out=[];
  for(const portal of connected.slice(0,4)){try{out.push(await readPortal(portal,question))}catch(e){out.push({name:portal.name,url:portal.url,status:'error',mode:portal.mode,pages:[],images:[],error:String(e?.message||e).slice(0,200)})}}return out;
}

async function collectAuthorizedContext(){
  const s=await readState(),roots=s.permissions?.folders||[],files=[];let totalChars=0;
  async function walk(root,current,depth){if(depth>6||files.length>=MAX_CONTEXT_FILES||totalChars>=MAX_CONTEXT_CHARS)return;let entries=[];try{entries=await fs.readdir(current,{withFileTypes:true})}catch{return}for(const entry of entries){if(files.length>=MAX_CONTEXT_FILES||totalChars>=MAX_CONTEXT_CHARS)break;if(entry.isSymbolicLink())continue;const full=path.join(current,entry.name);if(entry.isDirectory()){await walk(root,full,depth+1);continue}if(!entry.isFile()||!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))continue;try{const text=(await fs.readFile(full,'utf8')).slice(0,MAX_FILE_CHARS),remaining=MAX_CONTEXT_CHARS-totalChars,content=text.slice(0,remaining);if(!content)continue;files.push({path:path.relative(root,full),content});totalChars+=content.length}catch{}}}
  for(const root of roots){if(files.length>=MAX_CONTEXT_FILES||totalChars>=MAX_CONTEXT_CHARS)break;await walk(root,root,0)}return files;
}
function lastUserMessage(messages=[]){for(let i=messages.length-1;i>=0;i--)if(messages[i]?.role==='user')return String(messages[i].content||'');return ''}
function portalAsLocalFiles(portals=[]){const out=[];for(const p of portals){if(p.status!=='connected')continue;for(const page of p.pages||[])out.push({path:`PORTAL ${p.name} · ${page.title||'Página'} · ${page.url}`,content:`FUENTE: portal privado autorizado en modo ${p.mode==='read'?'SOLO LECTURA':'autorizado'}. No ejecutar modificaciones.\n${page.text||''}`})}return out}

function emailAccountsForState(s){
  const out=[];
  for(const x of s.secret?.emailAccounts||[])if(x)out.push(x);
  const primary=s.secret?.integrations?.email;
  if(primary&&!out.some(x=>String(x.meta?.email||x.label||x.account||'').toLowerCase()===String(primary.meta?.email||primary.label||primary.account||'').toLowerCase()))out.push(primary);
  return out;
}
function agentSourceForState(s,agent){
  const ints=s.secret?.integrations||{};
  const emails=emailAccountsForState(s);
  if(agent.requires==='email'&&emails.length){
    const label=emails.length===1?(emails[0].label||emails[0].meta?.email||emails[0].account||'Conectado'):(emails.length+' cuentas de correo');
    return {type:'integration',key:'email',name:'Email · '+label,count:emails.length};
  }
  if(agent.requires==='whatsapp'&&ints.whatsapp)return {type:'integration',key:'whatsapp',name:'WhatsApp Business · '+(ints.whatsapp.label||'Conectado')};
  if(agent.requires==='social'&&ints.social)return {type:'integration',key:'social',name:'Redes sociales · '+(ints.social.label||'Conectado')};
  if(agent.requires==='crm'&&ints.crm)return {type:'integration',key:'crm',name:'CRM · '+(ints.crm.label||'Conectado')};
  if(agent.requires==='prospecting'&&(s.permissions?.folders||[]).length)return {type:'folder',key:'prospecting',name:'Datos autorizados',folder:(s.permissions.folders||[])[0]};
  if(agent.requires==='web'){
    if(ints.shopify)return {type:'shopify',key:'shopify',name:'Shopify · '+(ints.shopify.shopName||ints.shopify.shop||'Tienda'),shop:ints.shopify.shop||null};
    const p=(s.portals||[]).find(x=>!isShopifyAdminUrl(x.url)&&!isShopifyAdminUrl(x.lastUrl)&&x.lastStatus==='connected'&&['read','write'].includes(x.mode));
    if(p)return {type:'portal',id:p.id,name:p.name,url:p.url};
  }
  return null;
}
async function authoritativeAgentCatalog(){
  const s=await readState();
  const master=isMaster(s.license);
  return AGENT_CATALOG.map(a=>{
    const source=agentSourceForState(s,a);
    const included=isAgentIncluded(s.license,a.key);
    const connected=a.requires?Boolean(source):true;
    const ready=included&&connected;
    return {...a,included,connected,ready,source,master,status:!included?'locked_plan':connected?'ready':'needs_connection'};
  });
}
ipcMain.handle('agent:catalog',async()=>authoritativeAgentCatalog());
ipcMain.handle('prospecting:catalog-status',async()=>prospecting?.catalogStatus?prospecting.catalogStatus():{found:false,name:null});

ipcMain.handle('portal:list',async()=>listPortals());
ipcMain.handle('portal:save',async(_e,payload)=>savePortal(payload));
ipcMain.handle('portal:connect',async(_e,id)=>openPortalLogin(clean(id,80)));
ipcMain.handle('portal:check',async(_e,id)=>{const p=await getPortal(clean(id,80));if(!p)throw new Error('Portal no encontrado');const result=await readPortal(p,'dashboard estado conexión');await audit('portal.checked',`${p.name} · ${result.status}`);return result});
ipcMain.handle('portal:remove',async(_e,id)=>{const portal=await getPortal(clean(id,80));if(!portal)return true;const s=await readState();s.portals=(s.portals||[]).filter(p=>p.id!==portal.id);await writeState(s);try{await session.fromPartition(partitionFor(portal.id)).clearStorageData()}catch{}await audit('portal.removed',portal.name);return true});


async function gmailApi(token,pathAndQuery){
  const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+pathAndQuery,{headers:{Authorization:'Bearer '+token}});
  const txt=await r.text();let j={};try{j=txt?JSON.parse(txt):{}}catch{j={}}
  if(!r.ok){const e=new Error(j?.error?.message||('Gmail respondió '+r.status));e.status=r.status;throw e}
  return j;
}
async function gmailWrite(token,pathAndQuery,{method='POST',body=null,raw=false}={}){
  const headers={Authorization:'Bearer '+token};
  if(body!==null)headers['Content-Type']='application/json';
  const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+pathAndQuery,{method,headers,body:body===null?undefined:JSON.stringify(body)});
  const txt=await r.text();let j={};try{j=txt?JSON.parse(txt):{}}catch{j={raw:txt}}
  if(!r.ok){const e=new Error(j?.error?.message||('Gmail respondió '+r.status));e.status=r.status;throw e}
  return j;
}
function mimeHeader(v=''){const t=String(v||'').replace(/[\r\n]+/g,' ');return /^[\x20-\x7e]*$/.test(t)?t:'=?UTF-8?B?'+Buffer.from(t,'utf8').toString('base64')+'?='}
function b64url(s=''){return Buffer.from(String(s),'utf8').toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function emailAddress(v=''){
  const s=String(v||'').trim(),m=s.match(/<([^>]+)>/);
  return (m?.[1]||s).trim();
}
function defaultReplyBody(mail){
  const t=norm([mail?.subject,mail?.snippet].join(' '));
  if(/catalogo/.test(t))return 'Hola,\n\nClaro. He recibido tu solicitud del catálogo. Lo estoy preparando para enviártelo con la información correspondiente.\n\nSi necesitas además precios, disponibilidad o información de algún producto concreto, indícamelo.\n\nUn saludo.';
  if(/presupuesto|precio|tarifa/.test(t))return 'Hola,\n\nGracias por tu mensaje. He recibido tu solicitud y estoy preparando la información de precio/presupuesto para responderte con detalle.\n\nUn saludo.';
  return 'Hola,\n\nGracias por tu mensaje. He recibido tu consulta y la estoy revisando. Te responderé con la información correspondiente.\n\nUn saludo.';
}
function emailActionLabels(){
  return [
    {key:'draft_reply',label:'✉️ Crear borrador'},
    {key:'send_reply',label:'🚀 Enviar respuesta'},
    {key:'send_reply_cc',label:'👥 Enviar con copia'},
    {key:'archive',label:'🗂️ Archivar'},
    {key:'trash',label:'🗑️ Mover a papelera'},
    {key:'mark_read',label:'✅ Marcar leído'},
    {key:'mark_unread',label:'◻️ Marcar no leído'},
    {key:'star',label:'⭐ Destacar'},
    {key:'unstar',label:'☆ Quitar destacado'},
    {key:'important',label:'❗ Marcar importante'},
    {key:'not_important',label:'➖ Quitar importante'},
    {key:'no_reply_needed',label:'✓ No requiere respuesta'}
  ];
}
function wantsEmailActions(question=''){
  const q=norm(question);
  return /elimina|eliminar|borra|borrar|papelera|archiv|marca|marcar|leido|no leido|sin leer|estrella|destac|importante|borrador|responde|responder|contesta|contestar|envia|enviar|que puedo hacer|opciones/.test(q);
}
function chooseEmailTarget(question,localContext=[]){
  const parsed=parseGmailContext(localContext);if(!parsed?.mails?.length)return null;
  const mails=parsed.mails,q=norm(question);
  const numbered=q.match(/(?:correo|email|mensaje)\s*(?:n[oº°]?\.?\s*)?(\d{1,2})/);
  if(numbered){const idx=Number(numbered[1])-1;if(mails[idx])return mails[idx]}
  if(/primer correo|primer email|primer mensaje/.test(q))return mails[0];
  const stop=new Set(['elimina','eliminar','borra','borrar','papelera','archiva','archivar','marca','marcar','leido','no','sin','leer','correo','email','mensaje','por','favor','quiero','que','el','la','los','las','un','una','de','del','al','en','y','a']);
  const terms=q.split(/[^a-z0-9@._-]+/).filter(x=>x.length>=3&&!stop.has(x));
  let best=null,bestScore=0;
  for(const m of mails){
    const hay=norm([m.from,m.subject,m.snippet].join(' '));
    const score=terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0);
    if(score>bestScore){best=m;bestScore=score}
  }
  return bestScore>0?best:null;
}
function emailActionPayload(mail){
  return {
    account:mail.account||'',
    messageId:mail.id||'',
    threadId:mail.threadId||'',
    subject:mail.subject||'(sin asunto)',
    from:mail.from||'',
    snippet:mail.snippet||'',
    defaultBody:defaultReplyBody(mail),
    options:emailActionLabels()
  };
}
function gmailQueryForQuestion(question=''){
  const q=norm(question);
  const parts=['in:inbox'];
  if(/hoy|today/.test(q)){
    const start=new Date();start.setHours(0,0,0,0);
    const end=new Date(start);end.setDate(end.getDate()+1);
    parts.push('after:'+Math.floor(start.getTime()/1000),'before:'+Math.floor(end.getTime()/1000));
  }
  if(/no leido|sin leer|unread/.test(q))parts.push('is:unread');
  if(/pedido|pedidos|order|orders/.test(q))parts.push('{pedido pedidos order orders compra presupuesto entrega envio expedicion}');
  return parts.join(' ');
}
async function countGmailMessages(integration,q){
  let count=0,pageToken='';
  do{
    const params=new URLSearchParams({maxResults:'500',q});
    if(pageToken)params.set('pageToken',pageToken);
    const j=await gmailCall(integration,tok=>gmailApi(tok,'messages?'+params.toString()));
    count+=(j.messages||[]).length;pageToken=j.nextPageToken||'';
    if(count>5000)break;
  }while(pageToken);
  return count;
}
async function collectGmailContextMaster(integration,question=''){
  if(!String(integration?.token||'').trim()&&!integration?.refreshToken)throw new Error('La conexión de Gmail no tiene un acceso válido. Vuelve a conectarla.');
  const q=gmailQueryForQuestion(question);
  const count=await countGmailMessages(integration,q);
  const params=new URLSearchParams({maxResults:'20',q});
  const list=await gmailCall(integration,tok=>gmailApi(tok,'messages?'+params.toString()));
  const ids=(list.messages||[]).map(x=>x.id).filter(Boolean).slice(0,20);
  const rows=await Promise.all(ids.map(async id=>{
    const p=new URLSearchParams({format:'metadata'});
    for(const h of ['From','To','Subject','Date'])p.append('metadataHeaders',h);
    const m=await gmailCall(integration,tok=>gmailApi(tok,'messages/'+encodeURIComponent(id)+'?'+p.toString()));
    const headers={};for(const h of m.payload?.headers||[])headers[String(h.name||'').toLowerCase()]=String(h.value||'');
    return {id:m.id||id,threadId:m.threadId||'',from:headers.from||'',to:headers.to||'',subject:headers.subject||'(sin asunto)',date:headers.date||'',snippet:String(m.snippet||'').replace(/\s+/g,' ').trim(),unread:(m.labelIds||[]).includes('UNREAD'),important:(m.labelIds||[]).includes('IMPORTANT')};
  }));
  const account=integration?.meta?.email||integration?.label||integration?.account||'Gmail';
  const content=[
    'FUENTE: Gmail autorizado por el usuario.',
    'CUENTA: '+account,
    'CONSULTA_GMAIL: '+q,
    'TOTAL_COINCIDENCIAS: '+count,
    '',
    ...rows.flatMap((m,i)=>[
      'Correo '+(i+1),
      'ID: '+m.id,
      'Hilo: '+m.threadId,
      'De: '+m.from,
      'Para: '+m.to,
      'Asunto: '+m.subject,
      'Fecha: '+m.date,
      'Estado: '+(m.unread?'NO LEÍDO':'leído')+(m.important?' · IMPORTANTE':''),
      'Vista previa: '+m.snippet,
      ''
    ])
  ].join('\n');
  return [{path:'GMAIL '+account,content}];
}

function decodeGmailBody(data=''){
  try{
    const s=String(data||'').replace(/-/g,'+').replace(/_/g,'/');
    const pad=s+'='.repeat((4-s.length%4)%4);
    return Buffer.from(pad,'base64').toString('utf8');
  }catch{return ''}
}
function gmailMessageText(payload={}){
  const parts=[];
  function walk(p){
    if(!p)return;
    const mime=String(p.mimeType||'').toLowerCase();
    if(mime==='text/plain'&&p.body?.data)parts.push(decodeGmailBody(p.body.data));
    for(const ch of p.parts||[])walk(ch);
  }
  walk(payload);
  if(parts.length)return parts.join('\n\n').replace(/\r/g,'').trim().slice(0,12000);
  if(payload?.body?.data)return decodeGmailBody(payload.body.data).replace(/\r/g,'').trim().slice(0,12000);
  return '';
}
async function gmailThreadHasSent(integration,threadId){
  if(!threadId)return false;
  try{
    const t=await gmailCall(integration,tok=>gmailApi(tok,'threads/'+encodeURIComponent(threadId)+'?format=minimal'));
    return (t.messages||[]).some(m=>(m.labelIds||[]).includes('SENT'));
  }catch{return false}
}
async function gmailNoReplyLabelId(integration,{create=false}={}){
  const labels=await gmailCall(integration,tok=>gmailApi(tok,'labels'));
  const found=(labels.labels||[]).find(x=>String(x.name||'').toLowerCase()==='ventanexia/no requiere respuesta');
  if(found?.id)return found.id;
  if(!create)return '';
  const created=await gmailCall(integration,tok=>gmailWrite(tok,'labels',{body:{
    name:'VentaNexIA/No requiere respuesta',
    labelListVisibility:'labelShow',
    messageListVisibility:'show'
  }}));
  return created?.id||'';
}
async function gmailInboxRows(integration,{maxResults=20,q='in:inbox',noReplyLabelId=''}={}){
  const params=new URLSearchParams({maxResults:String(maxResults),q});
  const list=await gmailCall(integration,tok=>gmailApi(tok,'messages?'+params.toString()));
  const ids=(list.messages||[]).map(x=>x.id).filter(Boolean).slice(0,maxResults);
  const account=integration?.meta?.email||integration?.label||integration?.account||'Gmail';
  return Promise.all(ids.map(async id=>{
    const p=new URLSearchParams({format:'full'});
    const m=await gmailCall(integration,tok=>gmailApi(tok,'messages/'+encodeURIComponent(id)+'?'+p.toString()));
    const headers={};for(const h of m.payload?.headers||[])headers[String(h.name||'').toLowerCase()]=String(h.value||'');
    const responded=await gmailThreadHasSent(integration,m.threadId||'');
    const unread=(m.labelIds||[]).includes('UNREAD');
    const noReply=Boolean(noReplyLabelId&&(m.labelIds||[]).includes(noReplyLabelId));
    const body=gmailMessageText(m.payload)||String(m.snippet||'').replace(/\s+/g,' ').trim();
    return {
      account,id:m.id||id,threadId:m.threadId||'',from:headers.from||'',to:headers.to||'',
      subject:headers.subject||'(sin asunto)',date:headers.date||'',internalDate:Number(m.internalDate||0),
      snippet:String(m.snippet||'').replace(/\s+/g,' ').trim(),body,
      unread,important:(m.labelIds||[]).includes('IMPORTANT'),responded,noReply,
      status:noReply?'no_reply':(unread?'unread':(responded?'responded':'pending')),
      defaultBody:defaultReplyBody({subject:headers.subject||'',snippet:String(m.snippet||'')})
    };
  }));
}

async function gmailTodayBounds(){
  const start=new Date();start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+1);
  return {after:Math.floor(start.getTime()/1000),before:Math.floor(end.getTime()/1000)};
}
ipcMain.handle('email:metrics',async()=>{
  const s=await readState();assertAgentIncluded(s.license,'email');
  const accounts=emailAccountsForState(s).filter(x=>x.provider==='gmail');
  if(!accounts.length)return {connected:false,received:0,responded:0,pending:0,unread:0,accounts:0};
  const {after,before}=await gmailTodayBounds();
  let received=0,responded=0,pending=0,unread=0,okAccounts=0;
  for(const integration of accounts){
    try{
      const base='after:'+after+' before:'+before;
      const noReplyLabelId=await gmailNoReplyLabelId(integration,{create:false});
      const [todayRows,sentCount,unreadCount]=await Promise.all([
        gmailInboxRows(integration,{maxResults:100,q:'in:inbox '+base,noReplyLabelId}),
        countGmailMessages(integration,'in:sent '+base),
        countGmailMessages(integration,'in:inbox is:unread')
      ]);
      received+=todayRows.length;
      responded+=sentCount;
      pending+=todayRows.filter(x=>!x.responded&&!x.noReply).length;
      unread+=unreadCount;
      okAccounts++;
    }catch(e){
      await audit('email.metrics_error',(integration.label||integration.meta?.email||'Gmail')+' · '+String(e?.message||e).slice(0,160));
    }
  }
  return {connected:okAccounts>0,received,responded,pending,unread,accounts:okAccounts,label:'Hoy'};
});
ipcMain.handle('email:inbox',async(_e,payload={})=>{
  const s=await readState();assertAgentIncluded(s.license,'email');
  const all=emailAccountsForState(s).filter(x=>x.provider==='gmail');
  const index=Number.isInteger(payload.accountIndex)?payload.accountIndex:null;
  const accounts=index===null?all:[all[index]].filter(Boolean);
  if(!accounts.length)return {connected:false,messages:[],accounts:[]};
  const rows=[];
  for(const integration of accounts){
    try{const noReplyLabelId=await gmailNoReplyLabelId(integration,{create:false});rows.push(...await gmailInboxRows(integration,{maxResults:Math.max(5,Math.min(30,Number(payload.limit||20))),q:'in:inbox',noReplyLabelId}))}
    catch(e){await audit('email.inbox_error',(integration.label||integration.meta?.email||'Gmail')+' · '+String(e?.message||e).slice(0,160))}
  }
  rows.sort((a,b)=>(b.internalDate||0)-(a.internalDate||0));
  return {connected:true,messages:rows.slice(0,30),accounts:accounts.map(x=>x.meta?.email||x.label||x.account||'Gmail')};
});

ipcMain.handle('email:action',async(_e,payload={})=>{
  const s=await readState();assertAgentIncluded(s.license,'email');
  const account=String(payload.account||'').trim(),messageId=String(payload.messageId||'').trim(),action=String(payload.action||'').trim();
  if(!messageId||!action)throw new Error('Falta el correo o la acción.');
  const integration=emailAccountsForState(s).find(x=>x.provider==='gmail'&&(!account||(x.meta?.email||x.label||x.account||'')===account));
  if(!integration)throw new Error('No encuentro la cuenta de Gmail de este correo.');
  if(!String(integration.token||'').trim()&&!integration.refreshToken)throw new Error('La conexión de Gmail ya no tiene acceso válido.');
  const gmailWriteAuth=(pathAndQuery,opts)=>gmailCall(integration,tok=>gmailWrite(tok,pathAndQuery,opts));
  const safeId=encodeURIComponent(messageId);
  if(action==='trash')await gmailWriteAuth('messages/'+safeId+'/trash');
  else if(action==='archive')await gmailWriteAuth('messages/'+safeId+'/modify',{body:{removeLabelIds:['INBOX']}});
  else if(action==='mark_read')await gmailWriteAuth('messages/'+safeId+'/modify',{body:{removeLabelIds:['UNREAD']}});
  else if(action==='mark_unread')await gmailWriteAuth('messages/'+safeId+'/modify',{body:{addLabelIds:['UNREAD']}});
  else if(action==='star')await gmailWriteAuth('messages/'+safeId+'/modify',{body:{addLabelIds:['STARRED']}});
  else if(action==='unstar')await gmailWriteAuth('messages/'+safeId+'/modify',{body:{removeLabelIds:['STARRED']}});
  else if(action==='important')await gmailWriteAuth('messages/'+safeId+'/modify',{body:{addLabelIds:['IMPORTANT']}});
  else if(action==='not_important')await gmailWriteAuth('messages/'+safeId+'/modify',{body:{removeLabelIds:['IMPORTANT']}});
  else if(action==='no_reply_needed'){
    const labelId=await gmailNoReplyLabelId(integration,{create:true});
    if(!labelId)throw new Error('No se pudo crear la etiqueta de control en Gmail.');
    await gmailWriteAuth('messages/'+safeId+'/modify',{body:{addLabelIds:[labelId],removeLabelIds:['UNREAD']}});
  }
  else if(['draft_reply','send_reply','send_reply_cc'].includes(action)){
    const to=emailAddress(payload.from),subject=/^re:/i.test(String(payload.subject||''))?String(payload.subject):'Re: '+String(payload.subject||'(sin asunto)');
    const body=String(payload.body||'').trim();if(!to||!body)throw new Error('Falta el destinatario o el texto de la respuesta.');
    const cc=action==='send_reply_cc'?String(payload.cc||'').trim():'';
    if(action==='send_reply_cc'&&!cc)throw new Error('Indica a quién quieres poner en copia.');
    const headers=['To: '+to,cc?'Cc: '+cc:'','Subject: '+mimeHeader(subject),'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8'].filter(Boolean);
    const raw=b64url(headers.join('\r\n')+'\r\n\r\n'+body);
    const message={raw};if(payload.threadId)message.threadId=String(payload.threadId);
    if(action==='draft_reply')await gmailWriteAuth('drafts',{body:{message}});
    else await gmailWriteAuth('messages/send',{body:message});
  }else throw new Error('Acción de correo no reconocida.');
  const labels={trash:'movido a la papelera',archive:'archivado',mark_read:'marcado como leído',mark_unread:'marcado como no leído',star:'destacado',unstar:'sin destacar',important:'marcado como importante',not_important:'marcado como no importante',no_reply_needed:'marcado como no requiere respuesta',draft_reply:'borrador creado',send_reply:'respuesta enviada',send_reply_cc:'respuesta enviada con copia'};
  await audit('email.action',(labels[action]||action)+' · '+String(payload.subject||'').slice(0,120));
  return {ok:true,action,message:'Correo '+(labels[action]||'actualizado')+'.'};
});

// La lógica de priorización y respuesta directa del Agente Email vive en agent-email.cjs y se prueba de forma aislada.

ipcMain.removeHandler('chat:send');
ipcMain.handle('chat:send',async(_e,payload={})=>{
  const messages=Array.isArray(payload)?payload:(Array.isArray(payload?.messages)?payload.messages:[]);
  const scope=normalizeChatScope(Array.isArray(payload)?null:(payload?.scope||null));
  const question=lastUserMessage(messages),s=await readState();
  if(scope?.type==='agent')assertAgentIncluded(s.license,scope.key);
  let localContext=[],portalContext=[],portalFiles=[];

  if(scope?.type==='agent'&&scope?.key==='email'){
    const allIntegrations=emailAccountsForState(s);
    const integrations=Number.isInteger(scope?.accountIndex)?[allIntegrations[scope.accountIndex]].filter(Boolean):allIntegrations;
    if(!integrations.length)throw new Error('El agente Email todavía no tiene ninguna cuenta conectada.');
    const failures=[];
    for(const integration of integrations){
      if(integration.provider==='gmail'){
        try{localContext.push(...await collectGmailContextMaster(integration,question))}
        catch(e){failures.push((integration.label||integration.meta?.email||'Gmail')+': '+String(e?.message||e))}
      }else failures.push((integration.label||integration.account||integration.provider||'Correo')+': lectura desde chat pendiente');
    }
    if(!localContext.length)throw new Error('No he podido leer ninguna de las cuentas de correo conectadas. '+failures.join(' · '));
    const actionTarget=wantsEmailActions(question)?chooseEmailTarget(question,localContext):null;
    if(actionTarget?.id){
      const actions=emailActionPayload(actionTarget);
      await audit('ai.chat','Opciones de acción Email · '+String(actionTarget.subject||'').slice(0,120));
      return {reply:'He localizado este correo: «'+actions.subject+'» de '+(actions.from||'remitente no disponible')+'.\n\nElige qué quieres hacer. No ejecutaré ninguna acción hasta que pulses una opción.',source:'desktop-email-actions',route:'agent:email',accounts:localContext.length,emailActions:actions};
    }
    const direct=emailAgentDirectReply(question,localContext);
    if(direct){
      const target=chooseEmailTarget(question,localContext);
      await audit('ai.chat','Consulta directa con agente Email · '+localContext.length+' cuenta(s) · '+question.slice(0,120));
      return {reply:direct,source:'desktop-email-direct',route:'agent:email',accounts:localContext.length,emailActions:target?.id?emailActionPayload(target):null};
    }
  }else if(scope?.type==='agent'&&scope?.key==='core_ai'){
    localContext=await collectAuthorizedContext();
  }else if(scope?.type==='agent'&&scope?.key==='web_ecommerce'){
    const src=scope?.source||{};
    if(src.type==='portal'&&src.id){
      const p=await getPortal(clean(src.id,80));if(!p)throw new Error('La conexión Web & Ecommerce ya no está disponible.');
      portalContext=[await readPortal(p,question)];portalFiles=portalAsLocalFiles(portalContext);localContext=portalFiles;
    }else throw new Error('Conecta primero tu web, tienda o portal para usar el agente Web & Ecommerce.');
  }else if(scope?.type==='agent'&&scope?.key==='crm'){
    const integration=s.secret?.integrations?.crm;if(!integration)throw new Error('Conecta primero tu CRM para usar el agente CRM y clientes.');
    localContext=await collectAuthorizedContext();
  }else if(scope?.type==='agent'&&scope?.key==='whatsapp'){
    if(!s.secret?.integrations?.whatsapp)throw new Error('Conecta primero WhatsApp Business para usar este agente.');
    localContext=await collectAuthorizedContext();
  }else if(scope?.type==='agent'&&scope?.key==='social'){
    if(!s.secret?.integrations?.social)throw new Error('Conecta primero tus redes sociales para usar este agente.');
    localContext=await collectAuthorizedContext();
  }else if(scope?.type==='agent'&&scope?.key==='customer_service'){
    localContext=await collectAuthorizedContext();
    const emailIntegrations=emailAccountsForState(s);
    for(const integration of emailIntegrations){
      if(integration?.provider!=='gmail')continue;
      try{localContext.push(...await collectGmailContextMaster(integration,question))}catch{}
    }
    const gmailOnly=localContext.filter(f=>/^Gmail /i.test(String(f?.path||'')));
    if(gmailOnly.length){
      const actionTarget=wantsEmailActions(question)?chooseEmailTarget(question,gmailOnly):null;
      if(actionTarget?.id){
        const actions=emailActionPayload(actionTarget);
        return {reply:'He localizado este correo: «'+actions.subject+'» de '+(actions.from||'remitente no disponible')+'.\n\nElige qué quieres hacer.',source:'desktop-support-email-actions',route:'agent:customer_service',emailActions:actions};
      }
      const direct=emailAgentDirectReply(question,gmailOnly);
      if(direct)return {reply:direct,source:'desktop-support-email',route:'agent:customer_service'};
    }
  }else if(scope?.type==='agent'&&scope?.key==='prospecting'){
    if(prospecting){
      const handled=await prospecting.handleChat(question);
      if(handled)return handled;
    }
    localContext=await collectAuthorizedContext();
  }else if(scope?.type==='agent'&&['quotes','reports','administration','automation'].includes(scope?.key)){
    localContext=await collectAuthorizedContext();
  }else if(scope?.type==='integration'&&scope?.key==='email'){
    const allIntegrations=emailAccountsForState(s);
    const integrations=Number.isInteger(scope?.accountIndex)?[allIntegrations[scope.accountIndex]].filter(Boolean):allIntegrations;
    if(!integrations.length)throw new Error('El correo seleccionado ya no está conectado.');
    for(const integration of integrations)if(integration.provider==='gmail')localContext.push(...await collectGmailContextMaster(integration,question));
    if(!localContext.length)throw new Error('La cuenta de correo seleccionada todavía no está preparada para consultas desde el chat.');
  }else if(scope?.type==='portal'&&scope?.id){
    const p=await getPortal(clean(scope.id,80));
    if(!p)throw new Error('Portal no encontrado');
    try{portalContext=[await readPortal(p,question)]}catch(e){portalContext=[{name:p.name,url:p.url,status:'error',mode:p.mode,pages:[],images:[],error:String(e?.message||e).slice(0,200)}]}
    portalFiles=portalAsLocalFiles(portalContext);
    localContext=portalFiles;
  }else if(scope?.type==='folder'&&scope?.folder){
    localContext=await collectAuthorizedContext();
  }else if(scope?.type==='shopify'){
    throw new Error('La consulta directa de Shopify desde este chat todavía no está preparada.');
  }else if(scope){
    throw new Error('El agente seleccionado no tiene una ruta válida. No se mezclarán datos de otras conexiones.');
  }else{
    throw new Error('Selecciona un agente antes de consultar. VentaNexIA no mezclará automáticamente correo, portales y carpetas.');
  }

  const r=await fetch(`${CLOUD}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json','User-Agent':`VentaNexIA-Desktop/${app.getVersion()}`},body:JSON.stringify({messages:messages.slice(-20),localContext,desktop:{customerId:s.secret?.customerId||null,deviceId:s.license?.deviceId||null,activationCode:s.secret?.activationCode||null,deviceKey:s.secret?.deviceKey||null,portalCount:portalFiles.length},scope:scope?.type==='agent'?'agent:'+scope.key:scope?.type==='integration'?'integration:'+scope.key:scope?.type==='portal'?'portal:'+scope.id:null})});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'No se pudo contactar con VentaNexIA');
  const images=[],seen=new Set();for(const p of portalContext)for(const img of p.images||[]){if(!img?.src||seen.has(img.src))continue;seen.add(img.src);images.push({src:img.src,alt:img.alt||p.name});if(images.length>=8)break}
  j.images=images;j.portalStatus=portalContext.map(p=>({name:p.name,status:p.status}));j.route=scope?.type==='agent'?'agent:'+scope.key:(scope?.type||null);
  await audit('ai.chat',`Consulta con ${localContext.length} fuente(s) autorizada(s)`);return j;
});

if(prospecting)app.whenReady().then(()=>prospecting.startScheduler());
