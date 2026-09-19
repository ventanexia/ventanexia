(()=>{
  const $m=s=>document.querySelector(s),$$m=s=>[...document.querySelectorAll(s)];
  const escM=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let masterPortals=[];
  let masterMessages=[];
  let runtimeConnections=[];
  let runtimeAgents=[];
  const AGENT_INPUT_EXAMPLES={
    core_ai:'Ej.: analiza estos datos, resume este documento, prepara una propuesta o ayúdame a resolver este problema',
    prospecting:'Ej.: busca 10 clínicas en Barcelona que puedan comprar portasueros · después: prepara los emails · envía los emails · seguimiento',
    crm:'Ej.: qué oportunidades debo seguir hoy, prepara un plan comercial o revisa los clientes del CRM conectado',
    customer_service:'Ej.: qué consultas necesitan respuesta, prepara una respuesta o crea un guion para atender una llamada',
    quotes:'Ej.: prepara una propuesta para una clínica con 5 portasueros y 2 mesas Mayo',
    social:'Ej.: crea una campaña para Instagram y LinkedIn y mejora el SEO de la página del producto',
    web_ecommerce:'Ej.: cuántos pedidos han entrado hoy, cuánto hemos facturado esta semana o revisa productos y stock',
    administration:'Ej.: organiza mis tareas de esta semana, prepara seguimientos y ordena estos documentos',
    reports:'Ej.: compara este mes con el anterior y prepara un informe de ventas con conclusiones',
    automation:'Ej.: crea un flujo para avisarme de nuevos pedidos y dime qué tareas repetitivas podemos automatizar'
  };
  const GUIDED_AGENT_FORMS={
    core_ai:{
      subtitle:'Analiza, redacta y resuelve tareas de negocio con ayuda de IA.',
      primary:'✨ Pedir ayuda a VentaNexIA',
      fields:[
        {key:'goal',label:'¿QUÉ NECESITAS?',type:'textarea',wide:true,placeholder:'Ej. analiza este problema, prepara una propuesta o resume esta información',required:true},
        {key:'context',label:'CONTEXTO',type:'textarea',wide:true,placeholder:'Añade los datos importantes que deba tener en cuenta'},
        {key:'result',label:'¿CÓMO QUIERES EL RESULTADO?',type:'text',wide:true,placeholder:'Ej. breve y ejecutivo, paso a paso, tabla, propuesta comercial'}
      ],
      capabilities:['Analizar información','Redactar documentos y propuestas','Resumir y organizar ideas','Ayudarte a tomar decisiones con los datos disponibles'],
      steps:['Pedir','Revisar','Ajustar']
    },
    prospecting:{
      subtitle:'Encuentra nuevas oportunidades de negocio y llega a más clientes.',
      primary:'✨ Buscar oportunidades reales',
      consent:true,catalog:true,
      fields:[
        {key:'company',label:'EMPRESA',type:'text',placeholder:'Nombre de tu empresa',required:true},
        {key:'email',label:'EMAIL DE ENVÍO',type:'email',placeholder:'tu@email.com'},
        {key:'offer',label:'¿QUÉ VENDES?',type:'text',wide:true,placeholder:'Ej. portasueros, camillas eléctricas, software de gestión',required:true},
        {key:'buyer',label:'¿QUIÉN PODRÍA COMPRARLO?',type:'text',placeholder:'Ej. clínicas privadas, hospitales, residencias',required:true},
        {key:'zone',label:'¿DÓNDE?',type:'text',placeholder:'Ej. Barcelona, Cataluña, toda España',required:true},
        {key:'condition',label:'¿QUIERES AÑADIR ALGUNA CONDICIÓN?',type:'textarea',wide:true,placeholder:'Opcional. Ej. que sean empresas privadas, con varias sedes o de un sector concreto'},
        {key:'count',label:'NÚMERO DE EMPRESAS',type:'number',placeholder:'10',value:'10'},
        {key:'signature',label:'FIRMA COMERCIAL',type:'text',placeholder:'Ej. Javier'},
        {key:'web',label:'WEB',type:'text',wide:true,placeholder:'Ej. mobiliariosanitario.com'}
      ],
      capabilities:['Buscar empresas reales con datos públicos','Localizar web, teléfono y email corporativo cuando estén publicados','Ordenar resultados por encaje comercial','Preparar emails personalizados','Adjuntar catálogo autorizado automáticamente','Hacer seguimiento evitando duplicados'],
      steps:['Buscar','Preparar emails','Enviar','Seguimiento']
    },
    crm:{
      subtitle:'Organiza oportunidades comerciales y decide a quién hacer seguimiento.',
      primary:'✨ Preparar plan comercial',
      fields:[
        {key:'goal',label:'¿QUÉ QUIERES CONSEGUIR?',type:'text',wide:true,placeholder:'Ej. priorizar oportunidades, recuperar clientes o preparar seguimientos',required:true},
        {key:'segment',label:'CLIENTES / SEGMENTO',type:'text',placeholder:'Ej. clínicas privadas, clientes sin compra 90 días'},
        {key:'stage',label:'ETAPA',type:'text',placeholder:'Ej. oportunidad abierta, propuesta enviada'},
        {key:'context',label:'DATOS O CONTEXTO',type:'textarea',wide:true,placeholder:'Añade nombres, importes, notas o criterios importantes'}
      ],
      capabilities:['Priorizar oportunidades','Preparar seguimientos comerciales','Usar el CRM conectado cuando exista','Proponer próximos pasos sin inventar datos'],
      steps:['Analizar','Priorizar','Seguimiento']
    },
    customer_service:{
      subtitle:'Responde mejor a tus clientes y organiza incidencias y consultas.',
      primary:'✨ Preparar respuesta',
      fields:[
        {key:'customer',label:'CLIENTE',type:'text',placeholder:'Nombre o empresa'},
        {key:'channel',label:'CANAL',type:'select',options:['Email','WhatsApp','Teléfono','Web','Otro']},
        {key:'request',label:'¿QUÉ HA PEDIDO O QUÉ PROBLEMA TIENE?',type:'textarea',wide:true,placeholder:'Describe la consulta o incidencia',required:true},
        {key:'desired',label:'¿QUÉ RESULTADO QUIERES?',type:'textarea',wide:true,placeholder:'Ej. responder con una solución, pedir más datos, calmar una reclamación'}
      ],
      capabilities:['Preparar respuestas profesionales','Clasificar incidencias','Usar Email o WhatsApp conectados cuando estén disponibles','Crear guiones de llamada','Detectar cuándo debe intervenir una persona'],
      steps:['Entender','Responder','Resolver']
    },
    quotes:{
      subtitle:'Crea presupuestos y propuestas comerciales con una estructura profesional.',
      primary:'✨ Preparar propuesta',
      fields:[
        {key:'client',label:'CLIENTE',type:'text',placeholder:'Nombre o empresa',required:true},
        {key:'products',label:'PRODUCTOS / SERVICIOS',type:'textarea',wide:true,placeholder:'Ej. 5 portasueros P616 y 2 mesas Mayo M930',required:true},
        {key:'prices',label:'PRECIOS O TARIFA',type:'textarea',wide:true,placeholder:'Añade precios si los conoces. Si faltan, VentaNexIA los marcará como pendientes.'},
        {key:'conditions',label:'CONDICIONES',type:'text',placeholder:'Ej. portes, plazo de entrega, validez'},
        {key:'tax',label:'IVA',type:'text',placeholder:'Ej. 21%'}
      ],
      capabilities:['Estructurar presupuestos','Preparar propuestas comerciales','Calcular subtotales cuando hay tarifas','Marcar claramente los precios que faltan','No inventar precios'],
      steps:['Datos','Propuesta','Revisión']
    },
    social:{
      subtitle:'Crea campañas, contenido y mejoras de visibilidad para tu negocio.',
      primary:'✨ Crear campaña',
      fields:[
        {key:'channel',label:'CANAL',type:'select',options:['Instagram','Facebook','LinkedIn','X','Web / SEO','Multicanal']},
        {key:'goal',label:'OBJETIVO',type:'text',placeholder:'Ej. conseguir leads, vender un producto, ganar visibilidad',required:true},
        {key:'product',label:'PRODUCTO / SERVICIO',type:'text',placeholder:'Qué quieres promocionar'},
        {key:'audience',label:'PÚBLICO',type:'text',placeholder:'Ej. clínicas, fisioterapeutas, responsables de compras'},
        {key:'style',label:'ESTILO Y CONDICIONES',type:'textarea',wide:true,placeholder:'Ej. profesional, cercano, sin emojis, CTA final'}
      ],
      capabilities:['Crear publicaciones y campañas','Preparar calendarios de contenido','Mejorar títulos, descripciones y SEO','Adaptar mensajes a cada red','Usar datos reales de redes conectadas cuando existan'],
      steps:['Objetivo','Contenido','Publicar']
    },
    web_ecommerce:{
      subtitle:'Consulta y trabaja con tu web o tienda conectada.',
      primary:'✨ Ejecutar consulta',
      fields:[
        {key:'task',label:'¿QUÉ QUIERES HACER?',type:'select',options:['Consultar pedidos','Consultar facturación','Consultar clientes','Consultar productos y stock','Preparar cambios de producto','Preparar cambio de contenido','Otra tarea']},
        {key:'target',label:'¿SOBRE QUÉ?',type:'text',placeholder:'Ej. pedidos de hoy, producto P616, página de inicio'},
        {key:'detail',label:'DETALLE',type:'textarea',wide:true,placeholder:'Explica exactamente qué necesitas',required:true},
        {key:'expected',label:'RESULTADO ESPERADO',type:'text',wide:true,placeholder:'Ej. una tabla, el total, una propuesta de cambio'}
      ],
      capabilities:['Consultar pedidos, clientes y productos','Revisar stock y precios','Usar Shopify conectado con datos reales','Preparar cambios de contenido','No aplicar cambios importantes sin permiso'],
      steps:['Consultar','Preparar','Confirmar']
    },
    administration:{
      subtitle:'Organiza tareas, documentos, agenda y seguimientos internos.',
      primary:'✨ Organizar trabajo',
      fields:[
        {key:'task',label:'TAREA',type:'text',wide:true,placeholder:'Ej. organizar facturas, preparar agenda, ordenar pendientes',required:true},
        {key:'period',label:'FECHA / PERIODO',type:'text',placeholder:'Ej. esta semana, mañana, septiembre'},
        {key:'priority',label:'PRIORIDAD',type:'select',options:['Normal','Alta','Urgente']},
        {key:'details',label:'DETALLES',type:'textarea',wide:true,placeholder:'Añade personas, documentos, plazos o condiciones'}
      ],
      capabilities:['Ordenar tareas y prioridades','Preparar agendas y seguimientos','Organizar información administrativa','Trabajar con archivos autorizados'],
      steps:['Organizar','Priorizar','Seguimiento']
    },
    reports:{
      subtitle:'Convierte tus datos en informes claros y decisiones accionables.',
      primary:'✨ Crear informe',
      fields:[
        {key:'source',label:'DATOS A ANALIZAR',type:'text',wide:true,placeholder:'Ej. ventas Shopify, clientes, pedidos, archivo autorizado',required:true},
        {key:'period',label:'PERIODO',type:'text',placeholder:'Ej. esta semana, agosto vs septiembre'},
        {key:'question',label:'¿QUÉ QUIERES SABER?',type:'textarea',wide:true,placeholder:'Ej. qué ha cambiado, qué productos venden más, dónde estamos perdiendo margen',required:true},
        {key:'format',label:'FORMATO',type:'select',options:['Resumen ejecutivo','Informe detallado','Tabla comparativa','Conclusiones y acciones']}
      ],
      capabilities:['Comparar periodos','Resumir tendencias','Preparar tablas y conclusiones','Usar únicamente cifras disponibles'],
      steps:['Datos','Análisis','Conclusiones']
    },
    automation:{
      subtitle:'Convierte tareas repetitivas en flujos claros y controlados.',
      primary:'✨ Diseñar automatización',
      fields:[
        {key:'trigger',label:'¿CUÁNDO DEBE EMPEZAR?',type:'text',wide:true,placeholder:'Ej. cuando entra un pedido, llega un email o cambia un estado',required:true},
        {key:'condition',label:'CONDICIONES',type:'textarea',wide:true,placeholder:'Ej. solo pedidos superiores a 500 €'},
        {key:'action',label:'¿QUÉ DEBE HACER?',type:'textarea',wide:true,placeholder:'Ej. avisarme, crear una tarea, preparar un email',required:true},
        {key:'tools',label:'HERRAMIENTAS IMPLICADAS',type:'text',wide:true,placeholder:'Ej. Shopify, Gmail, CRM'}
      ],
      capabilities:['Diseñar flujos paso a paso','Detectar tareas repetitivas','Definir disparadores y condiciones','Separar lo que se puede automatizar de lo que requiere aprobación'],
      steps:['Disparador','Condiciones','Acciones']
    }
  };

  const guidedStorageKey=key=>'vnx_guided_'+key;
  function guidedConfig(key){return GUIDED_AGENT_FORMS[key]||GUIDED_AGENT_FORMS.core_ai}
  function guidedSaved(key){try{return JSON.parse(localStorage.getItem(guidedStorageKey(key))||'{}')}catch{return {}}}
  function guidedSave(key,data){try{localStorage.setItem(guidedStorageKey(key),JSON.stringify(data))}catch{}}
  function guidedFieldHtml(field,value=''){
    const cls=field.wide?' guided-field wide':' guided-field';
    const req=field.required?' <em>obligatorio</em>':'';
    if(field.type==='textarea')return '<label class="'+cls.trim()+'"><span>'+escM(field.label)+req+'</span><textarea data-guided-field="'+escM(field.key)+'" rows="3" placeholder="'+escM(field.placeholder||'')+'">'+escM(value||field.value||'')+'</textarea></label>';
    if(field.type==='select')return '<label class="'+cls.trim()+'"><span>'+escM(field.label)+req+'</span><select data-guided-field="'+escM(field.key)+'">'+(field.options||[]).map(o=>'<option value="'+escM(o)+'"'+(value===o?' selected':'')+'>'+escM(o)+'</option>').join('')+'</select></label>';
    return '<label class="'+cls.trim()+'"><span>'+escM(field.label)+req+'</span><input data-guided-field="'+escM(field.key)+'" type="'+escM(field.type||'text')+'" value="'+escM(value||field.value||'')+'" placeholder="'+escM(field.placeholder||'')+'"></label>';
  }
  function guidedRead(key){
    const data={};$$m('[data-guided-field]').forEach(el=>data[el.dataset.guidedField]=el.value.trim());guidedSave(key,data);return data;
  }
  function guidedPrompt(key,data){
    const lines=Object.entries(data).filter(([,v])=>String(v||'').trim()).map(([k,v])=>{
      const f=(guidedConfig(key).fields||[]).find(x=>x.key===k);return (f?.label||k)+': '+v;
    });
    const names={core_ai:'Ayúdame con esta tarea',crm:'Prepara el mejor plan de ventas y CRM con estos datos',customer_service:'Prepara la mejor respuesta de atención al cliente con estos datos',quotes:'Prepara un presupuesto y propuesta profesional con estos datos',social:'Prepara una campaña de marketing y visibilidad con estos datos',web_ecommerce:'Realiza esta consulta o prepara esta tarea de Web & Ecommerce',administration:'Organiza esta tarea de administración y agenda',reports:'Prepara un informe y análisis con estos datos',automation:'Diseña una automatización segura y clara con estos datos'};
    return (names[key]||'Ayúdame con esta tarea')+':\n'+lines.join('\n');
  }
  function guidedConnectedLabels(key){
    const matches=[];
    const wants={prospecting:['email'],crm:['crm','email'],customer_service:['email','whatsapp'],social:['social'],web_ecommerce:['shopify','wordpress','github_vercel'],administration:['email'],reports:['shopify','crm'],automation:['shopify','email','crm','whatsapp']}[key]||[];
    for(const x of runtimeConnections||[]){const k=x.module||x.key;if(wants.includes(k))matches.push(x.label||k)}
    return [...new Set(matches)];
  }
  function selectAgentKey(key){
    const sel=$m('#chatConnectionSelect');if(!sel)return;
    const value='agent:'+key;
    if([...sel.options].some(o=>o.value===value)){sel.value=value;sel.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  function renderGuidedAgentTabs(items,selected){
    const root=$m('#guidedAgentTabs');if(!root)return;
    root.innerHTML=items.map(a=>'<button type="button" class="guided-agent-tab '+(selected?.key===a.key?'active':'')+'" data-guided-agent="'+escM(a.key)+'"><span>'+escM(a.icon||'🤖')+'</span><b>'+escM(a.name)+'</b></button>').join('');
    $$m('[data-guided-agent]').forEach(btn=>btn.onclick=()=>selectAgentKey(btn.dataset.guidedAgent));
  }
  function renderGuidedOtherCards(items,selected){
    const root=$m('#guidedOtherCards');if(!root)return;
    const list=items.filter(x=>x.key!==selected?.key).slice(0,5);
    root.innerHTML=list.map(a=>{const cfg=guidedConfig(a.key);const labels=(cfg.fields||[]).slice(0,3).map(f=>f.label.toLowerCase()).join(', ');return '<button type="button" data-guided-other="'+escM(a.key)+'"><span>'+escM(a.icon||'🤖')+'</span><b>'+escM(a.name)+'</b><small>'+escM(labels)+'</small><i>›</i></button>'}).join('');
    $$m('[data-guided-other]').forEach(btn=>btn.onclick=()=>selectAgentKey(btn.dataset.guidedOther));
  }
  async function refreshGuidedCatalog(){
    const row=$m('#guidedCatalogRow'),txt=$m('#guidedCatalogText');if(!row||row.style.display==='none'||!txt)return;
    txt.textContent='Buscando catálogo autorizado…';
    try{const r=await window.vnx.prospectingCatalogStatus();txt.textContent=r?.found?'Catálogo detectado: '+r.name:'No hay un PDF con “catálogo” en las carpetas autorizadas.';}
    catch{txt.textContent='No se ha podido comprobar el catálogo.'}
  }
  function renderGuidedWorkspace(chosen){
    if(!chosen)return;
    const cfg=guidedConfig(chosen.key),saved=guidedSaved(chosen.key);
    const title=$m('#guidedAgentTitle'),sub=$m('#guidedAgentSubtitle'),host=$m('#guidedFormHost'),caps=$m('#guidedCapabilities'),primary=$m('#guidedPrimaryAction'),steps=$m('#guidedSteps'),consent=$m('#guidedConsentRow'),cat=$m('#guidedCatalogRow'),summary=$m('#guidedConnectionSummary');
    if(title)title.textContent=(chosen.icon||'🤖')+' '+chosen.name;
    if(sub)sub.textContent=cfg.subtitle||'';
    if(host)host.innerHTML='<div class="guided-form-grid">'+(cfg.fields||[]).map(f=>guidedFieldHtml(f,saved[f.key]||'')).join('')+'</div>';
    if(caps)caps.innerHTML=(cfg.capabilities||[]).map(x=>'<div><span>✓</span><p>'+escM(x)+'</p></div>').join('');
    if(primary){primary.textContent=cfg.primary||'✨ Empezar';primary.dataset.agentKey=chosen.key}
    if(steps)steps.innerHTML=(cfg.steps||[]).map((x,i)=>'<div><span>'+(i+1)+'</span><b>'+escM(x)+'</b></div>').join('<i>→</i>');
    if(consent)consent.style.display=cfg.consent?'flex':'none';
    if(cat)cat.style.display=cfg.catalog?'flex':'none';
    if(summary){const connected=guidedConnectedLabels(chosen.key);summary.innerHTML='<b>Estado</b><span>'+(chosen.ready?'🟢 Agente listo':'🟠 Falta una conexión')+'</span>'+(connected.length?'<small>Conectado: '+escM(connected.join(' · '))+'</small>':'<small>Puede trabajar con IA. Las conexiones añaden datos reales cuando están disponibles.</small>')}
    $$m('[data-guided-field]').forEach(el=>el.addEventListener('input',()=>guidedRead(chosen.key)));
    if(chosen.key==='prospecting'){
      const email=$m('[data-guided-field="email"]');if(email&&!email.value){const e=(runtimeConnections||[]).find(x=>(x.module||x.key)==='email');if(e)email.value=e.label||''}
      refreshGuidedCatalog();
    }
    renderGuidedOtherCards(chatConnections(),chosen);
  }
  async function runGuided(){
    const scope=selectedChatScope(),out=$m('#guidedResult'),btn=$m('#guidedPrimaryAction');if(!scope||!btn||!out)return;
    const cfg=guidedConfig(scope.key),data=guidedRead(scope.key);
    const missing=(cfg.fields||[]).filter(f=>f.required&&!String(data[f.key]||'').trim());
    if(missing.length){out.style.display='block';out.innerHTML='<b>Falta completar:</b> '+escM(missing.map(x=>x.label).join(', '));return}
    if(cfg.consent&&!$m('#guidedConsent')?.checked){out.style.display='block';out.textContent='Confirma primero los criterios de búsqueda.';return}
    if(scope.included===false){out.style.display='block';out.textContent='Este agente no está incluido en tu plan.';return}
    if(scope.connected===false){out.style.display='block';out.textContent='Este agente necesita una conexión. Configúrala en Conexiones y vuelve aquí.';return}
    btn.disabled=true;const old=btn.textContent;btn.textContent='Trabajando…';out.style.display='block';out.innerHTML='<div class="guided-loading">VentaNexIA está trabajando con tus datos…</div>';
    try{
      let r;
      if(scope.key==='prospecting'){
        const profile=['mi empresa: '+data.company,'vendemos: '+data.offer,data.web?'web: '+data.web:'',data.signature?'firma: '+data.signature:''].filter(Boolean).join('; ');
        await window.vnx.sendChat([{role:'user',content:profile}],scope);
        const search='busca '+(data.count||10)+' '+data.buyer+' en '+data.zone+(data.condition?'. Condición: '+data.condition:'');
        r=await window.vnx.sendChat([{role:'user',content:search}],scope);
      }else{
        const prompt=guidedPrompt(scope.key,data);
        r=await window.vnx.sendChat([{role:'user',content:prompt}],scope);
      }
      out.innerHTML='<div class="guided-result-head"><b>Resultado</b><button type="button" data-guided-continue-free class="mini">Continuar en modo libre</button></div><div class="guided-result-copy">'+escM(r?.reply||'Sin respuesta').replace(/\n/g,'<br>')+'</div>';
      const cont=out.querySelector('[data-guided-continue-free]');if(cont)cont.onclick=()=>{setWorkspaceMode('free');masterMessages=[{role:'assistant',content:r?.reply||'Sin respuesta'}];renderMasterMessages();};
    }catch(e){out.textContent='No he podido completar la tarea: '+(e.message||e)}
    finally{btn.disabled=false;btn.textContent=old}
  }
  function setWorkspaceMode(mode){
    const guided=$m('#guidedModePanel'),free=$m('#freeModePanel'),gbtn=$m('#guidedModeBtn'),fbtn=$m('#freeModeBtn');
    const isGuided=mode!=='free';
    if(guided)guided.style.display=isGuided?'block':'none';
    if(free)free.style.display=isGuided?'none':'block';
    gbtn?.classList.toggle('active',isGuided);fbtn?.classList.toggle('active',!isGuided);
    localStorage.setItem('vnx_workspace_mode',isGuided?'guided':'free');
    if(!isGuided)setTimeout(()=>ensureChatInputEditable()?.focus(),30);
  }
  function setupGuidedUi(){
    const g=$m('#guidedModeBtn'),f=$m('#freeModeBtn'),primary=$m('#guidedPrimaryAction');
    if(g)g.onclick=()=>setWorkspaceMode('guided');
    if(f)f.onclick=()=>setWorkspaceMode('free');
    if(primary)primary.onclick=runGuided;
    setWorkspaceMode(localStorage.getItem('vnx_workspace_mode')==='free'?'free':'guided');
  }

  function ensureChatInputEditable(){
    const input=$m('#chatInput');if(!input)return null;
    input.disabled=false;
    input.readOnly=false;
    input.removeAttribute('disabled');
    input.removeAttribute('readonly');
    input.style.pointerEvents='auto';
    input.style.userSelect='text';
    input.style.webkitUserSelect='text';
    input.style.webkitAppRegion='no-drag';
    input.tabIndex=0;
    return input;
  }
  function updateAgentInputExample(chosen){
    const input=ensureChatInputEditable();if(!input)return;
    input.placeholder=chosen?AGENT_INPUT_EXAMPLES[chosen.key]||'Escribe aquí lo que necesitas que haga este agente':'Elige un agente arriba y te mostraré ejemplos de lo que puedes pedirle';
  }

  function statusLabel(p){
    if(p.lastStatus==='connected')return '🟢 Conectado';
    if(p.lastStatus==='login_required')return '🟠 La conexión se ha cerrado · vuelve a entrar';
    if(p.lastStatus==='error')return '🔴 No se pudo conectar';
    return '⚪ No conectado';
  }
  function isProductCountQuestion(text=''){
    const q=String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return /(?:cuantos?|numero|total).*productos|productos.*(?:tenemos|hay|total)/.test(q);
  }
  async function migrateLegacyPortals(){
    try{
      const legacy=JSON.parse(localStorage.getItem('vnx_portals')||'[]');
      for(const p of legacy||[]){if(p?.name&&p?.url)await window.vnx.savePortal({name:p.name,url:p.url,mode:p.mode||'read'});}
      if((legacy||[]).length)localStorage.removeItem('vnx_portals');
    }catch{}
  }
  async function renderMasterPortals(){
    const root=$m('#portalList');if(!root)return;
    try{masterPortals=await window.vnx.listPortals()}catch{masterPortals=[]}
    root.innerHTML=masterPortals.length?masterPortals.map(p=>`<div class="listrow"><div><b>${escM(p.name)}</b><span>${escM(p.url)} · ${p.mode==='read'?'🔒 Solo lectura':'Lectura y escritura'} · ${statusLabel(p)}</span>${p.lastCheckedAt?`<small>Última comprobación: ${new Date(p.lastCheckedAt).toLocaleString('es-ES')}</small>`:''}</div><div class="row"><button class="mini master-portal-connect" data-id="${escM(p.id)}">${p.lastStatus==='connected'?'Abrir':'Conectar'}</button><button class="mini master-portal-check" data-id="${escM(p.id)}">Revisar</button><button class="mini master-portal-remove" data-id="${escM(p.id)}">Quitar</button></div></div>`).join(''):'<div class="empty">Todavía no hay portales configurados.</div>';
    $$m('.master-portal-connect').forEach(b=>b.onclick=async()=>{
      b.disabled=true;b.textContent='Abriendo…';
      try{await window.vnx.connectPortal(b.dataset.id);$m('#portalMsg').textContent='Se ha abierto una ventana segura de VentaNexIA. Inicia sesión ahí una sola vez; la sesión quedará guardada localmente en este ordenador.';}
      catch(e){$m('#portalMsg').textContent=e.message||'No se pudo abrir el portal'}
      finally{b.disabled=false;setTimeout(renderMasterPortals,1200)}
    });
    $$m('.master-portal-check').forEach(b=>b.onclick=async()=>{
      b.disabled=true;b.textContent='Comprobando…';
      try{const r=await window.vnx.checkPortal(b.dataset.id);$m('#portalMsg').textContent=r.status==='connected'?'Ya está conectado. VentaNexIA puede consultar esta información desde “Habla con tu equipo”.':'La conexión se ha cerrado. Vuelve a entrar.';}
      catch(e){$m('#portalMsg').textContent=e.message||'No se pudo comprobar el portal'}
      finally{b.disabled=false;b.textContent='Revisar';await renderMasterPortals();refreshChatConnections()}
    });
    $$m('.master-portal-remove').forEach(b=>b.onclick=async()=>{
      if(!confirm('¿Quitar esta conexión y borrar su sesión guardada de este ordenador?'))return;
      await window.vnx.removePortal(b.dataset.id);await renderMasterPortals();refreshChatConnections();
    });
  }
  async function savePortalFromFields(connectAfter=false){
    const name=$m('#portalName')?.value.trim(),url=$m('#portalUrl')?.value.trim(),mode=$m('#portalMode')?.value||'read',msg=$m('#portalMsg');
    if(!name||!/^https:\/\//i.test(url||'')){if(msg)msg.textContent='Indica un nombre y una URL válida que empiece por https://';return;}
    try{
      const p=await window.vnx.savePortal({name,url,mode});
      if(msg)msg.textContent=mode==='read'?'Conexión guardada. VentaNexIA solo podrá mirar, no cambiar nada.':'Conexión guardada.';
      await renderMasterPortals();refreshChatConnections();
      if(connectAfter){await window.vnx.connectPortal(p.id);if(msg)msg.textContent='Se ha abierto la página. Inicia sesión y, cuando vuelvas, pulsa “Revisar”.';}
    }catch(e){if(msg)msg.textContent=e.message||'No se pudo guardar la conexión'}
  }
  function setupMasterPortalUi(){
    const toggle=$m('#showPortalSetup'),box=$m('#portalSetup');if(!toggle||!box)return;
    toggle.onclick=()=>{box.style.display=box.style.display==='none'?'block':'none';renderMasterPortals()};
    const save=$m('#savePortal'),open=$m('#openPortal');
    if(save)save.onclick=()=>savePortalFromFields(false);
    if(open){open.textContent='Conectar / iniciar sesión';open.onclick=()=>savePortalFromFields(true);}
  }

  function getRealSourcesForChat(){
    try{return JSON.parse(localStorage.getItem('vnx_real_module_sources')||'{}')}catch{return {}}
  }
  async function refreshRuntimeConnections(){
    try{runtimeConnections=await window.vnx.listConnections()||[]}catch{runtimeConnections=[]}
    try{runtimeAgents=await window.vnx.agentCatalog()||[]}catch{runtimeAgents=[]}
    return runtimeConnections;
  }
  function connectedDataSources(){
    const out=[];
    for(const p of masterPortals||[]){
      const url=String(p.url||p.lastUrl||'').toLowerCase();
      const shopifyAdmin=/^https:\/\/admin\.shopify\.com\//.test(url)||(/\.myshopify\.com\//.test(url)&&(/\/admin(?:\/|$)/.test(url)||/\/settings(?:\/|$)/.test(url)));
      if(!shopifyAdmin&&['read','write'].includes(p.mode))out.push({type:'portal',id:p.id,name:p.name,url:p.url});
    }
    const labels={email:'Email',whatsapp:'WhatsApp Business',social:'Redes sociales',prospecting:'Captación',crm:'CRM',shopify:'Shopify',wordpress:'WordPress / WooCommerce',github_vercel:'GitHub / Vercel'};
    for(const x of runtimeConnections||[]){
      const moduleKey=x.module||x.key;
      if(!moduleKey)continue;
      if(moduleKey==='shopify')out.push({type:'shopify',key:'shopify',connectionKey:x.key||'integration:shopify',name:'Shopify · '+(x.label||'Tienda'),shop:x.shop||x.label||null});
      else if(['email','whatsapp','social','crm'].includes(moduleKey))out.push({type:'integration',key:moduleKey,connectionKey:x.key||('integration:'+moduleKey),accountIndex:Number.isInteger(x.accountIndex)?x.accountIndex:null,name:(labels[moduleKey]||moduleKey)+' · '+(x.label||'Conectado')});
      else if(x.type==='folder')out.push({type:'folder',key:x.key||moduleKey,connectionKey:x.key||moduleKey,name:'Datos locales · '+(x.label||'Carpeta'),folder:x.path||x.folder||x.label});
    }
    const seen=new Set();
    return out.filter(x=>{
      const k=x.type==='portal'?'p:'+x.id:x.type==='integration'?'i:'+(x.connectionKey||x.key):x.type==='shopify'?'s:'+(x.connectionKey||x.shop):'f:'+(x.connectionKey||x.folder);
      if(seen.has(k))return false;seen.add(k);return true;
    });
  }
  function agentDisplayName(x){
    return (x.icon||'🤖')+' '+(x.name||x.key||'');
  }
  function chatConnections(){
    const out=[];
    for(const agent of runtimeAgents||[]){
      if(agent.key==='web_ecommerce'&&agent.included){
        const sh=(runtimeConnections||[]).find(x=>(x.module||x.key)==='shopify');
        if(sh){
          out.push({...agent,connected:true,ready:true,source:{type:'shopify',key:'shopify',name:'Shopify · '+(sh.label||'Tienda'),shop:sh.shop||sh.label||null}});
          continue;
        }
      }
      out.push(agent);
    }
    return out;
  }
  function chatConnectionValue(x){
    if(!x?.key)return '';
    if(x.key==='email'&&Number.isInteger(x.accountIndex))return 'agent:email:'+x.accountIndex;
    return 'agent:'+x.key;
  }
  function agentStatusText(x){
    if(!x?.included)return '🔒 No incluido en tu plan';
    if(!x?.connected)return '🟠 Incluido · falta conectar';
    return '🟢 Listo para usar';
  }
  function renderConnectionAgentCards(items){
    const root=$m('#allAgentConnections');if(!root)return;
    const descriptions={
      core_ai:'Análisis, redacción y apoyo general con el motor IA.',
      prospecting:'Busca empresas reales y prepara la prospección comercial.',
      crm:'Ventas, oportunidades, seguimiento y CRM.',
      customer_service:'Atención al cliente usando Email, WhatsApp o voz cuando estén conectados.',
      quotes:'Presupuestos y propuestas comerciales con datos reales.',
      social:'Redes sociales, contenido, campañas y SEO.',
      web_ecommerce:'Pedidos, clientes, productos, stock y contenido web.',
      administration:'Documentos, tareas, agenda y seguimiento interno.',
      reports:'Informes, comparativas, tendencias y conclusiones.',
      automation:'Diseño de flujos y automatización de procesos.'
    };
    root.innerHTML=items.map(a=>{
      const status=!a.included?'🔒 No incluido':a.ready?'🟢 Listo para usar':'🟠 Necesita una conexión';
      const source=a.source?.name?'<small class="agent-source">Usará: '+escM(a.source.name)+'</small>':'';
      return '<article class="agent-overview-card"><div class="agent-overview-icon">'+escM(a.icon||'🤖')+'</div><div><b>'+escM(a.name)+'</b><span>'+escM(descriptions[a.key]||'Agente de VentaNexIA.')+'</span>'+source+'<small class="agent-state">'+escM(status)+'</small></div></article>';
    }).join('');
  }
  function renderHomeAgents(items){
    const root=$m('#homeAgentsList'),summary=$m('#homeAgentsSummary');if(!root)return;
    const ready=items.filter(x=>x.ready),pending=items.filter(x=>x.included&&!x.connected),locked=items.filter(x=>!x.included);
    if(summary)summary.textContent=ready.length+' listo'+(ready.length===1?'':'s')+' para usar · '+pending.length+' pendiente'+(pending.length===1?'':'s')+' de conectar'+(locked.length?' · '+locked.length+' no incluido'+(locked.length===1?'':'s')+' en el plan':'');
    root.innerHTML=items.map(x=>{
      const status=agentStatusText(x);
      const detail=!x.included
        ?'<small>Disponible contratando este agente o cambiando de plan.</small>'
        :!x.connected
          ?'<small>Conéctalo en “Conexiones” para poder usarlo con datos reales.</small>'
          :'<small>Preparado para trabajar.</small>';
      return '<article class="modulecard"><b>'+escM(agentDisplayName(x))+'</b><span><strong>'+status+'</strong><br>'+detail+'</span></article>';
    }).join('');
  }
  function updateAgentHint(chosen,hint){
    if(!hint)return;
    if(!chosen){hint.textContent='Elige el especialista que mejor encaja con lo que quieres conseguir.';return}
    if(!chosen.included){hint.textContent='🔒 '+agentDisplayName(chosen)+' no está incluido en este plan. Puedes verlo, pero no conectarlo ni utilizarlo hasta contratarlo.';return}
    if(!chosen.connected){hint.textContent='🟠 '+agentDisplayName(chosen)+' está incluido, pero necesita una conexión. Ve a “Conexiones” para activarlo.';return}
    hint.textContent='🟢 '+agentDisplayName(chosen)+' está listo para usar.';
  }
  async function refreshChatConnections(){
    const sel=$m('#chatConnectionSelect'),hint=$m('#chatConnectionHint');if(!sel)return;
    await refreshRuntimeConnections();
    const items=chatConnections(),previous=sel.value,saved=localStorage.getItem('vnx_master_chat_agent')||'';
    sel.innerHTML='<option value="">Elige un agente…</option>'+items.map(x=>'<option value="'+escM(chatConnectionValue(x))+'">'+escM(agentDisplayName(x)+' — '+agentStatusText(x))+'</option>').join('');
    const values=[...sel.options].map(o=>o.value);
    if(previous&&values.includes(previous))sel.value=previous;
    else if(saved&&values.includes(saved))sel.value=saved;
    else if(items.some(x=>x.key==='email'&&x.ready))sel.value=chatConnectionValue(items.find(x=>x.key==='email'&&x.ready));
    else if(items.some(x=>x.ready))sel.value=chatConnectionValue(items.find(x=>x.ready));
    else sel.value='';
    if(sel.value)localStorage.setItem('vnx_master_chat_agent',sel.value);
    let activeAgentValue=sel.value;
    sel.onchange=()=>{
      const nextValue=sel.value;
      const input=ensureChatInputEditable();
      const hasCurrentWork=masterMessages.length>0||Boolean(input?.value?.trim());
      if(nextValue!==activeAgentValue&&hasCurrentWork){
        const ok=confirm('Vas a cambiar de agente. ¿Quieres cerrar el trabajo actual y eliminar esta conversación para empezar uno nuevo?');
        if(!ok){sel.value=activeAgentValue;return;}
        masterMessages=[];
        if(input)input.value='';
        renderMasterMessages();
      }
      activeAgentValue=nextValue;
      if(nextValue)localStorage.setItem('vnx_master_chat_agent',nextValue);
      const chosen=items.find(x=>chatConnectionValue(x)===nextValue);
      updateAgentHint(chosen,hint);
      updateAgentInputExample(chosen);
      renderGuidedAgentTabs(items,chosen);
      renderGuidedWorkspace(chosen);
      if(nextValue&&input&&$m('#freeModePanel')?.style.display!=='none')setTimeout(()=>input.focus(),30);
    };
    const selectedAgent=items.find(x=>chatConnectionValue(x)===sel.value);
    ensureChatInputEditable();
    updateAgentHint(selectedAgent,hint);
    updateAgentInputExample(selectedAgent);
    renderGuidedAgentTabs(items,selectedAgent);
    renderGuidedWorkspace(selectedAgent);
    renderHomeAgents(items);
    renderConnectionAgentCards(items);
    if($m('#masterSourceSelect'))renderMasterCenterSources();
  }
  window.vnxRefreshAgentUi=refreshChatConnections;
  function selectedChatScope(){
    const sel=$m('#chatConnectionSelect'),items=chatConnections();if(!sel||!sel.value)return null;
    const item=items.find(x=>chatConnectionValue(x)===sel.value);if(!item)return null;
    return {type:'agent',key:item.key,name:agentDisplayName(item),included:item.included,connected:item.connected,ready:item.ready,source:item.source||null,accountIndex:Number.isInteger(item.accountIndex)?item.accountIndex:null};
  }

  function masterCenterItems(){
    return connectedDataSources();
  }
  function renderMasterCenterSources(){
    const sel=$m('#masterSourceSelect'),hint=$m('#masterSourceHint');if(!sel)return;
    const items=masterCenterItems(),previous=sel.value;
    sel.innerHTML='<option value="">Elige una cuenta o programa…</option>'+items.map((x,i)=>'<option value="'+i+'">'+escM(x.name)+'</option>').join('');
    if(previous!==''&&Number(previous)<items.length)sel.value=previous;
    if(hint){
      hint.textContent=items.length?'Elige una sola fuente. Así nunca mezclamos datos de empresas distintas.':'Todavía no hay ninguna cuenta o programa conectado.';
    }
  }
  function masterCenterScope(){
    const sel=$m('#masterSourceSelect'),items=masterCenterItems();if(!sel||sel.value==='')return null;
    const item=items[Number(sel.value)];if(!item)return null;
    if(item.type==='portal')return {type:'portal',id:item.id,name:item.name};
    if(item.type==='url')return {type:'url',key:item.key,name:item.name,url:item.url};
    if(item.type==='folder')return {type:'folder',key:item.key,name:item.name,folder:item.folder};
    if(item.type==='shopify')return {type:'shopify',key:item.key,name:item.name,shop:item.shop};
    if(item.type==='integration')return {type:'integration',key:item.key,name:item.name,accountIndex:item.accountIndex,connectionKey:item.connectionKey};
    return null;
  }
  function setupMasterCenter(){
    const root=$m('#masterDataResult'),title=$m('#masterResultTitle'),clear=$m('#masterResultClear');if(!root)return;
    const prompts={
      clientes:'Muéstrame los clientes que puedes ver en esta conexión. Incluye nombre, empresa, email y teléfono cuando estén disponibles. No inventes datos.',
      facturas:'Muéstrame las facturas que puedes ver en esta conexión. Incluye número, fecha, cliente, importe y estado cuando estén disponibles. No inventes datos.',
      pedidos:'Muéstrame los pedidos que puedes ver en esta conexión. Incluye número, fecha, cliente, importe y estado cuando estén disponibles. No inventes datos.',
      datos:'Resume y muestra la información empresarial disponible en esta conexión: clientes, pedidos, facturas, productos, ventas y otros datos que realmente puedas consultar. No inventes nada.'
    };
    const titles={clientes:'Clientes',facturas:'Facturas',pedidos:'Pedidos',datos:'Todos los datos'};
    $$m('[data-master-query]').forEach(btn=>btn.onclick=async()=>{
      const key=btn.dataset.masterQuery,scope=masterCenterScope();
      if(!scope){
        root.innerHTML='<div class="empty">Primero elige arriba la cuenta o programa que quieres consultar.</div>';return;
      }
      const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<b>Mirándolo…</b>';
      title.textContent=titles[key]+' · '+scope.name;
      root.innerHTML='<div class="empty">Consultando datos reales de '+escM(scope.name)+'…</div>';
      try{
        const r=await window.vnx.sendChat([{role:'user',content:prompts[key]}],scope);
        const reply=escM(r.reply||'No hay datos disponibles.').replace(/\n/g,'<br>');
        const imgs=(r.images||[]).slice(0,8).map(img=>'<img src="'+escM(img.src)+'" alt="'+escM(img.alt||'Imagen')+'" style="max-width:180px;max-height:140px;object-fit:contain;border-radius:9px;margin:8px 8px 0 0;border:1px solid #1b507a;background:#fff">').join('');
        root.innerHTML='<div class="msg ai" style="max-width:100%">'+reply+(imgs?'<div>'+imgs+'</div>':'')+'</div>';
      }catch(e){
        root.innerHTML='<div class="empty">No he podido mostrar estos datos: '+escM(e.message||String(e))+'</div>';
      }finally{btn.disabled=false;btn.innerHTML=old}
    });
    if(clear)clear.onclick=()=>{title.textContent='Información de tu empresa';root.innerHTML='<div class="empty">Elige una cuenta arriba y después pulsa Clientes, Facturas, Pedidos o Todos los datos.</div>'};
    renderMasterCenterSources();
  }

  function openReplyEditor({meta,action}){
    return new Promise(resolve=>{
      const okLabel=action==='draft_reply'?'Crear borrador':action==='send_reply_cc'?'Enviar con copia':'Enviar respuesta';
      const subj=/^re:/i.test(meta.subject||'')?(meta.subject||''):'Re: '+(meta.subject||'');
      const overlay=document.createElement('div');
      overlay.id='vnxReplyOverlay';
      overlay.style.cssText='position:fixed;inset:0;background:rgba(2,11,19,.82);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML='<div style="width:min(720px,96vw);max-height:92vh;overflow:auto;background:#061c31;border:1px solid #2eb7ef;border-radius:16px;padding:20px;color:#fff">'
        +'<h3 style="margin:0 0 6px">'+escM(okLabel)+'</h3>'
        +'<div style="opacity:.8;font-size:13px;margin-bottom:12px">Para: '+escM(meta.from||'')+'<br>Asunto: '+escM(subj)+'</div>'
        +(action==='send_reply_cc'?'<label style="display:block;font-size:12px;margin-bottom:10px">Copia (CC)<input id="vnxReplyCc" type="email" style="width:100%;margin-top:4px;padding:10px;border-radius:8px;border:1px solid #286b93;background:#031522;color:#fff"></label>':'')
        +'<label style="display:block;font-size:12px">Texto de la respuesta<textarea id="vnxReplyBody" rows="10" style="width:100%;margin-top:4px;padding:10px;border-radius:8px;border:1px solid #286b93;background:#031522;color:#fff;font:inherit"></textarea></label>'
        +(meta.attachment?'<div style="margin-top:10px;font-size:13px">📎 Se adjuntará: <b>'+escM(meta.attachment.name)+'</b></div>':'')
        +'<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button type="button" id="vnxReplyCancel" class="mini">Cancelar</button><button type="button" id="vnxReplyOk" class="mini" style="background:#1d7dff;border-color:#1d7dff">'+escM(okLabel)+'</button></div></div>';
      document.body.appendChild(overlay);
      const ta=overlay.querySelector('#vnxReplyBody');ta.value=meta.defaultBody||'';ta.focus();
      const close=v=>{overlay.remove();resolve(v)};
      overlay.querySelector('#vnxReplyCancel').onclick=()=>close(null);
      overlay.onclick=e=>{if(e.target===overlay)close(null)};
      overlay.querySelector('#vnxReplyOk').onclick=()=>{
        const body=ta.value.trim();if(!body){ta.focus();return}
        let cc='';const ccEl=overlay.querySelector('#vnxReplyCc');
        if(ccEl){cc=ccEl.value.trim();if(!cc){ccEl.focus();return}}
        close({body,cc});
      };
    });
  }

  function renderMasterMessages(){
    const root=$m('#messages');if(!root)return;
    const intro='<div class="msg ai">Estoy listo para ayudarte. Elige arriba el agente de VentaNexIA con el que quieres trabajar. El agente utilizará únicamente las conexiones que tengas autorizadas.</div>';
    root.innerHTML=intro+masterMessages.map(m=>{
      const imgs=(m.images||[]).slice(0,6).map(img=>`<a href="${escM(img.src)}" target="_blank" rel="noreferrer"><img src="${escM(img.src)}" alt="${escM(img.alt||'Imagen')}" style="max-width:220px;max-height:180px;object-fit:contain;border-radius:10px;margin:8px 8px 0 0;background:#fff;border:1px solid #d8e2ea"></a>`).join('');
      const actions=m.emailActions?.options?.length?'<div class="row" style="flex-wrap:wrap;margin-top:10px;gap:8px">'+m.emailActions.options.map(a=>'<button class="mini email-action-btn" data-msg-id="'+escM(m.emailActions.messageId||'')+'" data-action="'+escM(a.key)+'">'+escM(a.label)+'</button>').join('')+'</div>':'';
      return `<div class="msg ${m.role==='user'?'user':'ai'}"><div>${escM(m.content).replace(/\n/g,'<br>')}</div>${imgs?`<div>${imgs}</div>`:''}${actions}</div>`;
    }).join('');
    $m('#messages')&&$$m('.email-action-btn').forEach(btn=>btn.onclick=async()=>{
      const msg=masterMessages.find(x=>x.emailActions?.messageId===btn.dataset.msgId);if(!msg)return;
      const meta=msg.emailActions,action=btn.dataset.action;
      const destructive=action==='trash'||action==='send_reply'||action==='send_reply_cc';
      let body='',cc='';
      if(['draft_reply','send_reply','send_reply_cc'].includes(action)){
        const edited=await openReplyEditor({meta,action});
        if(!edited)return;
        body=edited.body;cc=edited.cc||'';
      }
      if(destructive&&!confirm(action==='trash'?'¿Mover este correo a la papelera?':'¿Enviar esta respuesta ahora?'))return;
      const label=meta.options.find(x=>x.key===action)?.label||action;
      btn.disabled=true;btn.textContent='Procesando…';
      try{
        const out=await window.vnx.emailAction({account:meta.account,messageId:meta.messageId,threadId:meta.threadId,subject:meta.subject,from:meta.from,action,body,cc});
        masterMessages.push({role:'assistant',content:(out?.message||'Acción completada.')+'\n\nAcción: '+label});
        msg.emailActions=null;
        renderMasterMessages();
      }catch(e){
        masterMessages.push({role:'assistant',content:'No he podido completar la acción: '+(e.message||e)});
        renderMasterMessages();
      }
    });
    root.scrollTop=root.scrollHeight;
  }
  function setupMasterChat(){
    const form=$m('#chatForm');if(!form)return;
    const chatInput=ensureChatInputEditable();
    if(chatInput){
      ['pointerdown','mousedown','click'].forEach(ev=>chatInput.addEventListener(ev,()=>{ensureChatInputEditable();setTimeout(()=>chatInput.focus(),0)},true));
      chatInput.addEventListener('focus',ensureChatInputEditable,true);
    }
    const clearConversation=()=>{
      masterMessages=[];
      const input=ensureChatInputEditable();if(input)input.value='';
      renderMasterMessages();
      if(input)input.focus();
    };
    const clearBtn=$m('#chatClearBtn');if(clearBtn)clearBtn.onclick=clearConversation;
    const newBtn=$m('#chatNewConversation');if(newBtn)newBtn.onclick=clearConversation;
    renderMasterMessages();
    form.onsubmit=async e=>{
      e.preventDefault();const input=ensureChatInputEditable(),text=input?.value.trim();if(!text)return;
      const connections=chatConnections(),scope=selectedChatScope();
      if(!scope){
        masterMessages.push({role:'assistant',content:'Elige arriba el agente de VentaNexIA con el que quieres trabajar.'});renderMasterMessages();return;
      }
      if(scope.included===false){
        masterMessages.push({role:'assistant',content:'Este agente aparece en tu equipo, pero no está incluido en tu plan actual. Para usarlo debes contratarlo o cambiar de plan.'});renderMasterMessages();return;
      }
      if(scope.connected===false){
        masterMessages.push({role:'assistant',content:'Este agente está incluido, pero todavía necesita conectar su herramienta o fuente de datos. Ve a “Conexiones”, actívala y vuelve aquí.'});renderMasterMessages();return;
      }
      masterMessages.push({role:'user',content:text});input.value='';renderMasterMessages();
      const btn=e.submitter||form.querySelector('button');btn.disabled=true;btn.textContent='Mirándolo…';
      try{
        const payload=masterMessages.map(({role,content})=>({role,content}));
        const r=await window.vnx.sendChat(payload,scope);
        let reply=r.reply||'Sin respuesta';
        if(isProductCountQuestion(text)&&window.vnx.verifiedProductCount){
          try{
            const verified=await window.vnx.verifiedProductCount(text,scope&&scope.type==='portal'?{portalId:scope.id}:null);
            if(verified.status==='verified')reply=`${verified.name} tiene ${verified.count} productos según el portal conectado. Total verificado${verified.pagesScanned>1?` recorriendo ${verified.pagesScanned} páginas`:''}.`;
            else if(verified.status==='uncertain')reply=`He encontrado ${verified.visible||verified.rowsSeen||0} productos visibles, pero no puedo confirmar todavía que sea el total completo del catálogo. No voy a presentar ese número como total hasta verificar toda la paginación.`;
          }catch{}
        }
        const expired=(r.portalStatus||[]).filter(x=>x.status==='login_required');
        if(expired.length)reply+=`\n\n⚠️ La conexión con ${expired.map(x=>x.name).join(', ')} se ha cerrado. Vuelve a conectarla.`;
        masterMessages.push({role:'assistant',content:reply,images:r.images||[],emailActions:r.emailActions||null});renderMasterMessages();
      }catch(err){masterMessages.push({role:'assistant',content:`No he podido conectar: ${err.message||err}`});renderMasterMessages()}
      finally{btn.disabled=false;btn.textContent='Enviar'}
    };
  }

  async function start(){
    await migrateLegacyPortals();
    setupMasterPortalUi();
    setupMasterChat();
    setupGuidedUi();
    setupMasterCenter();
    await renderMasterPortals();
    await refreshChatConnections();
    setInterval(()=>{if($m('#portalList')&&document.visibilityState==='visible')renderMasterPortals()},12000);
  }
  setTimeout(start,350);
})();
