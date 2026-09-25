const {app,ipcMain,BrowserWindow}=require('electron');
const {readState}=require('./state-store.cjs');
const {isAgentIncluded}=require('./agent-policy.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const diagnostics=require('./runtime-diagnostics.cjs');

diagnostics.install({app});
const singleInstance=app.requestSingleInstanceLock();
if(!singleInstance){
  app.quit();
  process.exit(0);
}
app.on('second-instance',()=>{
  const windows=BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed());
  const win=windows.find(w=>w.isVisible())||windows[0];
  if(!win)return;
  try{if(win.isMinimized())win.restore();win.show();win.focus()}catch{}
});
let orders=null;
try{orders=require('./orders.cjs')}catch(e){console.error('orders_load_error',String(e?.message||e).slice(0,200))}
let calendar=null;
try{calendar=require('./calendar.cjs')}catch(e){console.error('calendar_load_error',String(e?.message||e).slice(0,200))}
let externalAgents=null;
try{externalAgents=require('./external-agent.cjs')}catch(e){console.error('external_agent_load_error',String(e?.message||e).slice(0,200))}

// --- Enrutado único del chat -------------------------------------------------
// Los módulos exportan funciones puras; solo este entrypoint registra chat:send.
let agentChat=null;
let portalChat=null;
let portalAdaptive=null;
try{
  const master=require('./master.cjs');
  agentChat=master.chatSendHandler||null;
  portalAdaptive=require('./portal-adaptive.cjs');
  portalChat=portalAdaptive.chatSendHandler||null;
  require('./portal-pagination-fix.cjs');
  require('./export.cjs');
}catch(e){
  console.error('chat_module_load_error',String(e?.message||e).slice(0,300));
}

const PORTAL_SCOPE_TYPES=new Set(['portal','url','folder','shopify','integration']);

function scopeOf(payload){
  return Array.isArray(payload)?null:(payload&&payload.scope)||null;
}
function scopeTypeOf(payload){
  const scope=scopeOf(payload);
  return scope&&typeof scope==='object'?String(scope.type||''):'';
}

function normText(v=''){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
function centralActionHandoff(question=''){
  const q=normText(question);
  const explicitAction=/\b(responde|contesta|envia|manda|archiva|marca|elimina|borra|publica|programa|introduce|registra|entrega|pide|solicita|modifica|cambia|actualiza|llama|contacta|gestiona|tramita)\b/.test(q)
    ||/\b(crea|prepara)\b[^\n]{0,45}\b(borrador|respuesta|pedido|publicacion|post|campana|presupuesto|oferta|seguimiento|tarea|cita)\b/.test(q);
  if(!explicitAction)return null;
  const defs=[
    {key:'email',name:'Email y bandeja',icon:'✉️',re:/correo|correos|email|emails|gmail|bandeja|borrador|archiv|remitente|asunto/},
    {key:'orders',name:'Pedidos',icon:'📦',re:/pedido|pedidos|orden de compra|stock|compras|entrega|referencia|sku/},
    {key:'whatsapp',name:'WhatsApp',icon:'💬',re:/whatsapp|mensaje|mensajes|chat con cliente/},
    {key:'crm',name:'Ventas y clientes',icon:'🤝',re:/cliente|clientes|venta|ventas|oportunidad|seguimiento|pipeline|contacto comercial/},
    {key:'social',name:'Redes y publicidad',icon:'📣',re:/instagram|facebook|linkedin|redes|publicacion|post|campana|anuncio/},
    {key:'web_ecommerce',name:'Web y tienda',icon:'🌐',re:/shopify|tienda|web|producto|productos|precio|contenido web/},
    {key:'quotes',name:'Presupuestos y ofertas',icon:'🧾',re:/presupuesto|oferta|propuesta comercial/},
    {key:'customer_service',name:'Atención al cliente',icon:'🎧',re:/reclamacion|incidencia|atencion al cliente|queja/},
    {key:'administration',name:'Administración y agenda',icon:'🗂️',re:/agenda|tarea|documento|administracion|factura interna/},
    {key:'reports',name:'Informes y resultados',icon:'📊',re:/informe|reporte|resultados|comparativa/}
  ];
  const hit=defs.find(x=>x.re.test(q));
  return hit?{...hit,task:String(question||'').trim().slice(0,1200)}:null;
}

if(typeof agentChat==='function'&&typeof portalChat==='function'){
  ipcMain.removeHandler('chat:send');

  ipcMain.handle('chat:send',async(event,payload)=>{
    const scope=scopeOf(payload);
    const type=scopeTypeOf(payload);

    if(type==='external_agent'&&externalAgents){
      const messages=Array.isArray(payload?.messages)?payload.messages:[];
      return externalAgents.chat(String(scope?.id||scope?.key||''),messages);
    }

    // El Asistente IA es el centro de mando: consulta en SOLO LECTURA las fuentes
    // de los agentes incluidos y entrega todo el contexto al asistente general.
    if(type==='agent'&&String(scope?.key||'')==='core_ai'){
      const s=await readState();
      const messages=Array.isArray(payload?.messages)?payload.messages:[];
      const last=[...messages].reverse().find(m=>m?.role==='user');
      const question=String(last?.content||'').trim();
      const q=question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const broad=/resumen|general|todo|todos|pendiente|hoy|dia|empresa|situacion|estado|prioridad|que tengo|como va|preparame|recomendacion|secretaria|organiza/.test(q);
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

      const agendaIntegration=s.secret?.integrations?.agenda||null;
      if(broad||/agenda|calendario|reunion|reuniones|cita|citas/.test(q)){
        if(agendaIntegration&&calendar){
          try{
            const day=await calendar.today();
            add('CONEXION Agenda · solo lectura',{
              connected:day.connected,provider:day.provider,label:day.label,date:day.date,timezoneOffset:day.timezoneOffset,
              events:(day.events||[]).slice(0,40).map(e=>({title:e.title,start:e.start,end:e.end,allDay:e.allDay,location:e.location,meetingUrl:e.meetingUrl,organizer:e.organizer,attendees:e.attendees,status:e.status}))
            });
          }catch(e){add('ESTADO Agenda no disponible','La agenda está conectada pero no se ha podido leer: '+String(e?.message||e).slice(0,180)+'. No inventes citas.')}
        }else add('ESTADO Agenda','Agenda no conectada. No inventes reuniones, citas ni horarios. Indica claramente que falta conectar Google Calendar o Microsoft Calendar para incluirlos en el plan del día.');
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

      const response=await agentChat(event,{...(payload||{}),hubContext});
      const handoff=centralActionHandoff(question);
      if(handoff&&isAgentIncluded(s.license,handoff.key)){
        response.handoff={
          agentKey:handoff.key,
          agentName:handoff.name,
          icon:handoff.icon,
          task:handoff.task,
          prompt:'¿Quieres que te conecte con tu empleado de '+handoff.name+' para que realice esta tarea?'
        };
      }
      return response;
    }

    // Pedidos usa su motor local especializado: correo completo, adjuntos, validación y entrega real.
    if(type==='agent'&&String(scope?.key||'')==='orders'&&orders){
      const messages=Array.isArray(payload?.messages)?payload.messages:[];
      const last=[...messages].reverse().find(m=>m?.role==='user');
      const text=String(last?.content||'').trim();
      const done=await orders.handleChat(text);
      if(done)return done;                 // órdenes que Pedidos entiende (revisa, introduce, programa: …)
      return agentChat(event,payload);     // el resto (preguntas libres) va al asistente con el rol de Pedidos
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

// Renderer modules are loaded directly by renderer/index.html; no post-load code injection.

if(orders)app.whenReady().then(()=>orders.startScheduler()).catch(e=>console.error('orders_scheduler_error',String(e?.message||e).slice(0,180)));

// Auto-update is initialized only in packaged builds. Internal/dev builds stay offline.
app.whenReady().then(()=>{try{require('./updater.cjs').start()}catch(e){console.error('updater_start_error',String(e?.message||e).slice(0,240))}});
