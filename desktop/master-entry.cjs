const {app,ipcMain}=require('electron');
const {readState}=require('./state-store.cjs');
const {isAgentIncluded}=require('./agent-policy.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');

// --- Enrutado único del chat -------------------------------------------------
// master.cjs y portal-adaptive.cjs registran ambos 'chat:send'.
// Si se cargan sin arbitraje, portal-adaptive.cjs elimina el handler anterior
// y termina atendiendo también los agentes de "Habla con tu equipo".
// Capturamos ambos handlers durante la carga y registramos UN solo router final.
const originalHandle=ipcMain.handle.bind(ipcMain);
const registered=new Map();

ipcMain.handle=function(channel,listener){
  registered.set(channel,listener);
  return originalHandle(channel,listener);
};

let agentChat=null;
let portalChat=null;

try{
  require('./master.cjs');
  agentChat=registered.get('chat:send')||null;

  require('./portal-adaptive.cjs');
  portalChat=registered.get('chat:send')||null;

  require('./portal-pagination-fix.cjs');
  require('./export.cjs');
}finally{
  ipcMain.handle=originalHandle;
}

const PORTAL_SCOPE_TYPES=new Set(['portal','url','folder','shopify','integration']);

function scopeOf(payload){
  return Array.isArray(payload)?null:(payload&&payload.scope)||null;
}
function scopeTypeOf(payload){
  const scope=scopeOf(payload);
  return scope&&typeof scope==='object'?String(scope.type||''):'';
}

if(typeof agentChat==='function'&&typeof portalChat==='function'){
  ipcMain.removeHandler('chat:send');

  originalHandle('chat:send',async(event,payload)=>{
    const scope=scopeOf(payload);
    const type=scopeTypeOf(payload);

    // El agente Web & Ecommerce debe usar la fuente Shopify real cuando está conectada.
    if(type==='agent'&&String(scope?.key||'')==='web_ecommerce'&&scope?.source?.type==='shopify'){
      return portalChat(event,{...(payload||{}),scope:{...scope.source,name:scope.source.name||scope.name||'Shopify'}});
    }

    // CRM, Redes y WhatsApp usan su conexión real cuando existe.
    if(type==='agent'&&['crm','social','whatsapp'].includes(String(scope?.key||''))){
      const key=String(scope.key);
      try{
        const s=await readState();
        if(isAgentIncluded(s.license,key)&&s.secret?.integrations?.[key]?.token){
          return portalChat(event,{...(payload||{}),scope:{type:'integration',key,name:scope.name||key,agentKey:key}});
        }
      }catch(e){console.error('agent_route_error',String(e?.message||e).slice(0,160))}
    }

    // El resto de agentes pasan por master.cjs.
    if(type==='agent'||!type)return agentChat(event,payload);

    // Las consultas directas del Centro Maestro usan portal-adaptive.cjs.
    // Excepción: Email individual debe usar master.cjs porque allí se respeta
    // accountIndex y las múltiples cuentas ilimitadas de la edición Maestro.
    if(type==='integration'&&String(scope?.key||'')==='email'){
      return agentChat(event,payload);
    }

    if(PORTAL_SCOPE_TYPES.has(type))return portalChat(event,payload);

    // Scope desconocido: no lo mandamos a portales por defecto.
    // master.cjs dará un error explícito sin mezclar fuentes.
    return agentChat(event,payload);
  });
}else{
  console.error('chat_route_error','No se pudieron capturar los manejadores de chat:send',{
    agentChat:typeof agentChat,
    portalChat:typeof portalChat
  });
}

// --- Inyección de la interfaz ------------------------------------------------
app.on('browser-window-created',(_event,win)=>{
  win.webContents.on('did-finish-load',async()=>{
    const url=win.webContents.getURL();
    if(!url.startsWith('file://')||!url.toLowerCase().includes('renderer/index.html'))return;
    try{
      const adaptive=await fs.readFile(path.join(__dirname,'renderer','adaptive.js'),'utf8');
      await win.webContents.executeJavaScript(adaptive,true);
      const exportsUi=await fs.readFile(path.join(__dirname,'renderer','export.js'),'utf8');
      await win.webContents.executeJavaScript(exportsUi,true);
    }catch(e){
      console.error('master_renderer_inject_error',String(e?.message||e).slice(0,300));
    }
  });
});
