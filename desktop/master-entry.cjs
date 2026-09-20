const {app,ipcMain}=require('electron');
const {readState}=require('./state-store.cjs');
const {isAgentIncluded}=require('./agent-policy.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
let orders=null;
try{orders=require('./orders.cjs')}catch(e){console.error('orders_load_error',String(e?.message||e).slice(0,200))}

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
let portalAdaptive=null;

try{
  require('./master.cjs');
  agentChat=registered.get('chat:send')||null;

  portalAdaptive=require('./portal-adaptive.cjs');
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

    // El Asistente IA es el centro de mando: consulta en SOLO LECTURA las fuentes
    // de los agentes incluidos y entrega todo el contexto al asistente general.
    if(type==='agent'&&String(scope?.key||'')==='core_ai'){
      const s=await readState();
      const messages=Array.isArray(payload?.messages)?payload.messages:[];
      const last=[...messages].reverse().find(m=>m?.role==='user');
      const question=String(last?.content||'').trim();
      const q=question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const broad=/resumen|general|todo|todos|pendiente|hoy|empresa|situacion|estado|prioridad|que tengo|como va/.test(q);
      const hubContext=[];
      const add=(path,data)=>hubContext.push({path,content:typeof data==='string'?data:JSON.stringify(data,null,2)});
      const safeResult=r=>r&&typeof r==='object'?{
        status:r.status,name:r.name,category:r.category,total:r.total,headers:r.headers,
        rows:Array.isArray(r.rows)?r.rows.slice(0,50):[],text:String(r.text||'').slice(0,12000),
        source:r.source,mode:r.mode||'read'
      }:r;

      // Pedidos: solo fotografía del estado local. No escanea, no envía y no entrega.
      if(orders&&isAgentIncluded(s.license,'orders')&&(broad||/pedido|orden|stock|compra|entrega/.test(q))){
        try{
          const st=await orders._get().store.load();
          const all=Object.values(st.orders||{}).sort((a,b)=>(b.seq||0)-(a.seq||0));
          const counts={};
          for(const o of all)counts[o.status]=(counts[o.status]||0)+1;
          add('AGENTE Pedidos · estado de solo lectura',{
            total:all.length,counts,destination:st.settings?.destination?.type||null,mode:st.settings?.mode||null,
            recent:all.slice(0,30).map(o=>({
              internalNumber:o.internalNumber||o.vnxNumber||('VNX-PED-'+String(o.seq||0).padStart(5,'0')),
              seq:o.seq,status:o.status,customer:o.extracted?.customer?.name||o.source?.fromEmail||'',
              customerOrder:o.extracted?.orderRef||'',source:o.source?.kind||'',
              lines:(o.extracted?.lines||[]).slice(0,20).map(l=>({ref:l.ref||'',description:l.description||'',qty:l.qty??null}))
            }))
          });
        }catch(e){add('ESTADO Pedidos no disponible',String(e?.message||e).slice(0,180))}
      }

      const query=portalAdaptive?.queryReadOnlyScope;
      if(typeof query==='function'){
        // Shopify / Web & Ecommerce.
        if(isAgentIncluded(s.license,'web_ecommerce')&&s.secret?.integrations?.shopify&&(broad||/shopify|tienda|web|producto|stock|precio|cliente|venta|factur|pedido/.test(q))){
          try{add('CONEXION Shopify · solo lectura',safeResult(await query({type:'shopify',name:'Shopify'},question,s)))}
          catch(e){add('ESTADO Shopify no disponible',String(e?.message||e).slice(0,180))}
        }

        // Ventas y clientes (CRM real conectado).
        if(isAgentIncluded(s.license,'crm')&&s.secret?.integrations?.crm&&(broad||/cliente|venta|oportunidad|crm|seguimiento|pipeline|contacto/.test(q))){
          try{add('CONEXION Ventas y clientes · solo lectura',safeResult(await query({type:'integration',key:'crm',name:'Ventas y clientes'},question,s)))}
          catch(e){add('ESTADO Ventas y clientes no disponible',String(e?.message||e).slice(0,180))}
        }

        // Redes conectadas.
        if(isAgentIncluded(s.license,'social')&&s.secret?.integrations?.social&&(broad||/red|instagram|facebook|linkedin|publicacion|marketing|campana/.test(q))){
          try{add('CONEXION Redes y publicidad · solo lectura',safeResult(await query({type:'integration',key:'social',name:'Redes y publicidad'},question,s)))}
          catch(e){add('ESTADO Redes no disponible',String(e?.message||e).slice(0,180))}
        }

        // WhatsApp: solo estado/datos que la API conectada permita leer.
        if(isAgentIncluded(s.license,'whatsapp')&&s.secret?.integrations?.whatsapp&&(broad||/whatsapp|mensaje|conversacion|cliente/.test(q))){
          try{add('CONEXION WhatsApp · solo lectura',safeResult(await query({type:'integration',key:'whatsapp',name:'WhatsApp'},question,s)))}
          catch(e){add('ESTADO WhatsApp no disponible',String(e?.message||e).slice(0,180))}
        }
      }

      return agentChat(event,{...(payload||{}),hubContext});
    }

    // Pedidos usa su motor local especializado: correo completo, adjuntos, validación y entrega real.
    if(type==='agent'&&String(scope?.key||'')==='orders'&&orders){
      const messages=Array.isArray(payload?.messages)?payload.messages:[];
      const last=[...messages].reverse().find(m=>m?.role==='user');
      const text=String(last?.content||'').trim();
      return orders.handleChat(text);
    }

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


if(orders)app.whenReady().then(()=>orders.startScheduler()).catch(e=>console.error('orders_scheduler_error',String(e?.message||e).slice(0,180)));
