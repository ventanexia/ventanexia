// VentaNexIA Desktop 0.6.141 · Agent Workspace Home
(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const alias={
    core_ai:'core_ai',email:'email',orders:'orders',stock:'web_ecommerce',web_ecommerce:'web_ecommerce',
    crm:'crm',prospecting:'prospecting',content:'social',social:'social',campaigns:'social',
    administration:'administration',agenda:'core_ai',reports:'reports',automation:'automation',whatsapp:'whatsapp'
  };
  const configs={
    prospecting:{
      chatKey:'prospecting',crumb:'Marketing y redes › Captación de clientes',icon:'◎',title:'Agente de Captación de Clientes',
      subtitle:'Encuentra, analiza y contacta con nuevos clientes de forma automática y personalizada.',
      help:'Me encargo de buscar y preparar la captación para que tú solo te centres en tu negocio.',
      capabilities:['Busca nuevos clientes','Analiza sus necesidades','Genera mensajes personalizados','Usa tu estilo de marca','Los deja listos para revisar o enviar'],
      tabs:['Resumen','Emails de captación','Buscar empresas','Listas de contactos','Campañas','Resultados'],
      chips:['Farmacias','Clínicas','Hospitales','Distribuidores','Residencias','Otros'],
      objective:'Tipo de clientes objetivo',itemLabel:'Productos o servicios a promocionar',itemPlaceholder:'Ej.: tu producto o servicio',
      searchTitle:'2. Selecciona o genera la lista de contactos',searchSub:'Puedes usar tus propias listas o pedir a Carla que busque nuevas empresas.',
      searchPlaceholder:'Ej.: farmacias en Barcelona',searchButton:'Buscar',
      previewTitle:'3. Genera los correos con IA',previewSub:'Carla analiza cada empresa y crea un mensaje adaptado a sus necesidades.',
      action:'Ver y revisar correos',metric:'Empresas encontradas',review:'Correos preparados',cta:'Automatiza tu captación',
      ctaText:'Haz que Carla busque nuevos contactos, prepare mensajes y deje el trabajo listo para tu revisión.',
      primaryPrompt:'Busca nuevos clientes adecuados para mi producto o servicio y prepara mensajes de captación personalizados.',
      previewType:'email'
    },
    core_ai:{
      chatKey:'core_ai',crumb:'Inicio › Carla',icon:'✦',title:'Carla · Secretaria Ejecutiva',
      subtitle:'Organiza tu empresa, prioriza lo importante y deja trabajo preparado para que tú decidas.',
      help:'Reviso lo conectado, ordeno prioridades y preparo el trabajo que puedo adelantar.',
      capabilities:['Organiza el día','Resume lo importante','Prepara respuestas y tareas','Cruza solo fuentes autorizadas','Te pide decisión cuando hace falta'],
      tabs:['Resumen','Prioridades','Pendientes','Agenda','Trabajo preparado','Resultados'],
      chips:['Hoy','Urgente','Clientes','Pedidos','Cobros','Reuniones'],
      objective:'Qué quieres priorizar',itemLabel:'Contexto o asunto',itemPlaceholder:'Ej.: pedidos urgentes o reunión con cliente',
      searchTitle:'2. Dime qué necesitas',searchSub:'Carla revisará únicamente las fuentes que tengas autorizadas.',
      searchPlaceholder:'Ej.: prepárame el día y dime por dónde empiezo',searchButton:'Analizar',
      previewTitle:'3. Carla prepara el trabajo',previewSub:'Verás prioridades, tareas preparadas y decisiones pendientes en un solo sitio.',
      action:'Abrir Carla',metric:'Tareas preparadas',review:'Necesitan tu decisión',cta:'Automatiza tu jornada',
      ctaText:'Programa revisiones periódicas para que Carla te deje el día organizado antes de empezar.',
      primaryPrompt:'Prepárame el día. Revisa lo importante, dime qué requiere mi decisión y adelanta lo que puedas.',
      previewType:'priorities'
    },
    email:{
      chatKey:'email',crumb:'Correo › Agente de email',icon:'✉',title:'Agente de Correo con IA',
      subtitle:'Lee, organiza y prepara respuestas de tus cuentas de correo conectadas.',
      help:'Separo lo importante, preparo respuestas y creo borradores para que tú los revises.',
      capabilities:['Lee correos autorizados','Detecta cuáles requieren respuesta','Traduce cuando hace falta','Prepara respuestas personalizadas','Crea borradores sin enviar solo'],
      tabs:['Resumen','Bandeja','Necesitan respuesta','Borradores','Seguimientos','Resultados'],
      chips:['Clientes','Pedidos','Facturas','Cobros','Reclamaciones','Informativos'],
      objective:'Qué correos quieres revisar',itemLabel:'Cuenta o asunto',itemPlaceholder:'Ej.: ventas@empresa.com o pedido 301',
      searchTitle:'2. Selecciona qué correo revisar',searchSub:'Puedes filtrar por cuenta, remitente, asunto o prioridad.',
      searchPlaceholder:'Ej.: correos de hoy que necesitan respuesta',searchButton:'Revisar',
      previewTitle:'3. Prepara la respuesta con IA',previewSub:'Carla redacta una respuesta basada en el correo real y la deja lista para aprobar.',
      action:'Ver y revisar borradores',metric:'Correos revisados',review:'Borradores preparados',cta:'Automatiza tu correo',
      ctaText:'Haz que Carla revise el correo y te deje solo lo que necesita tu atención.',
      primaryPrompt:'Revisa mis correos recientes, detecta cuáles necesitan respuesta y prepara borradores para revisarlos.',
      previewType:'emailReply'
    },
    orders:{
      chatKey:'orders',crumb:'Pedidos › Agente de pedidos',icon:'▣',title:'Agente de Pedidos',
      subtitle:'Detecta pedidos, comprueba datos y prepara el trabajo para su gestión.',
      help:'Leo los pedidos desde las fuentes autorizadas y te indico qué está completo y qué falta.',
      capabilities:['Detecta pedidos','Comprueba cliente y referencias','Señala datos que faltan','Prepara el alta o la gestión','No confirma nada sin tu permiso'],
      tabs:['Resumen','Pedidos nuevos','Pendientes','Preparados','Incidencias','Resultados'],
      chips:['Nuevos','Urgentes','Pendientes','Incompletos','Preparados','Incidencias'],
      objective:'Qué pedidos quieres revisar',itemLabel:'Cliente, pedido o referencia',itemPlaceholder:'Ej.: pedido 301 o cliente Clínica Norte',
      searchTitle:'2. Localiza los pedidos',searchSub:'Carla consulta la fuente elegida y separa los pedidos que necesitan atención.',
      searchPlaceholder:'Ej.: pedidos nuevos de hoy',searchButton:'Revisar',
      previewTitle:'3. Comprueba y prepara con IA',previewSub:'Verás cliente, líneas, incidencias y siguiente acción antes de confirmar nada.',
      action:'Ver pedidos preparados',metric:'Pedidos encontrados',review:'Listos para revisar',cta:'Automatiza tus pedidos',
      ctaText:'Haz que Carla detecte nuevos pedidos y te los deje preparados para gestionar.',
      primaryPrompt:'Revisa los pedidos nuevos, comprueba si falta algún dato y déjame preparados los que estén completos.',
      previewType:'order'
    },
    web_ecommerce:{
      chatKey:'web_ecommerce',crumb:'Stock y compras › Reposición',icon:'◫',title:'Agente de Stock y Compras',
      subtitle:'Cruza stock y ventas para detectar roturas y preparar la reposición.',
      help:'Analizo existencias y rotación por producto y preparo lo que necesitas comprar.',
      capabilities:['Lee stock autorizado','Cruza ventas por SKU','Calcula cobertura','Detecta riesgo de rotura','Prepara una propuesta de compra'],
      tabs:['Resumen','Stock','Riesgo de rotura','Compras','Importar / Exportar','Resultados'],
      chips:['Sin stock','< 5 días','Bajo stock','Reposición','Exceso','Todos'],
      objective:'Qué stock quieres analizar',itemLabel:'Producto, SKU o familia',itemPlaceholder:'Ej.: SKU PRO0010 o todos los productos',
      searchTitle:'2. Elige la fuente y el alcance',searchSub:'Cada fuente se consulta por separado para no mezclar negocios.',
      searchPlaceholder:'Ej.: dime qué tengo que comprar esta semana',searchButton:'Analizar',
      previewTitle:'3. Calcula la reposición con IA',previewSub:'Carla ordena los productos por urgencia y deja una propuesta editable.',
      action:'Ver propuesta de compras',metric:'Productos analizados',review:'Necesitan reposición',cta:'Automatiza la reposición',
      ctaText:'Programa revisiones de stock para detectar roturas antes de que ocurran.',
      primaryPrompt:'Analiza stock y ventas por producto y prepara la reposición necesaria, priorizando roturas y menos de 5 días.',
      previewType:'stock'
    },
    crm:{
      chatKey:'crm',crumb:'Ventas y clientes › Seguimiento',icon:'♙',title:'Agente de Ventas y Clientes',
      subtitle:'Ordena oportunidades, seguimientos y acciones comerciales para no perder ninguna venta.',
      help:'Te indico a quién seguir, qué preparar y qué oportunidad necesita una acción hoy.',
      capabilities:['Ordena oportunidades','Prioriza seguimientos','Prepara propuestas','Resume historial disponible','Deja acciones listas para revisar'],
      tabs:['Resumen','Oportunidades','Seguimientos','Clientes','Propuestas','Resultados'],
      chips:['Nuevos','Seguimiento','Oferta','Negociación','Ganados','Dormidos'],
      objective:'Qué clientes quieres trabajar',itemLabel:'Cliente u oportunidad',itemPlaceholder:'Ej.: clínicas interesadas en camillas',
      searchTitle:'2. Selecciona clientes u oportunidades',searchSub:'Carla trabaja con los datos comerciales que tengas conectados.',
      searchPlaceholder:'Ej.: oportunidades que debo seguir hoy',searchButton:'Buscar',
      previewTitle:'3. Prepara la acción comercial',previewSub:'Verás la siguiente acción recomendada y el material preparado para revisarlo.',
      action:'Ver acciones comerciales',metric:'Oportunidades',review:'Acciones preparadas',cta:'Automatiza el seguimiento',
      ctaText:'Haz que Carla revise periódicamente tus oportunidades y prepare los siguientes pasos.',
      primaryPrompt:'Revisa mis oportunidades y dime cuáles debo seguir hoy. Prepara la siguiente acción para cada una.',
      previewType:'crm'
    },
    content:{
      chatKey:'social',crumb:'Marketing y redes › Producción de contenidos',icon:'✎',title:'Agente de Producción de Contenidos',
      subtitle:'Convierte tus productos, servicios e ideas en contenido listo para revisar.',
      help:'Preparo textos y piezas adaptadas a cada canal manteniendo tu tono de marca.',
      capabilities:['Genera ideas','Adapta el tono','Crea versiones por canal','Mantiene mensajes coherentes','Deja todo listo para aprobar'],
      tabs:['Resumen','Ideas','Contenido','Calendario','Aprobación','Resultados'],
      chips:['Blog','LinkedIn','Instagram','Email','Ficha producto','Landing'],
      objective:'Qué contenido quieres crear',itemLabel:'Producto, servicio o tema',itemPlaceholder:'Ej.: nueva camilla eléctrica',
      searchTitle:'2. Define el contenido',searchSub:'Indica el tema, público y canal; Carla prepara una primera versión.',
      searchPlaceholder:'Ej.: publicación de LinkedIn sobre nuestro nuevo producto',searchButton:'Crear',
      previewTitle:'3. Genera contenido con IA',previewSub:'Obtendrás una versión editable preparada con tu estilo de marca.',
      action:'Ver contenido preparado',metric:'Piezas creadas',review:'Pendientes de revisión',cta:'Automatiza contenidos',
      ctaText:'Crea un calendario periódico y deja que Carla prepare las piezas antes de publicarlas.',
      primaryPrompt:'Crea contenido profesional para mi empresa sobre el tema indicado y déjalo listo para revisar.',
      previewType:'content'
    },
    social:{
      chatKey:'social',crumb:'Marketing y redes › Redes sociales',icon:'◎',title:'Agente de Redes Sociales',
      subtitle:'Planifica, redacta y adapta publicaciones para tus canales sociales.',
      help:'Preparo publicaciones por canal y las dejo listas para que tú decidas cuándo publicarlas.',
      capabilities:['Planifica publicaciones','Adapta formato por red','Propone llamadas a la acción','Mantiene tono de marca','No publica sin autorización'],
      tabs:['Resumen','Calendario','Publicaciones','Creatividades','Aprobación','Resultados'],
      chips:['LinkedIn','Instagram','Facebook','Google','X','Otros'],
      objective:'Canales objetivo',itemLabel:'Campaña o tema',itemPlaceholder:'Ej.: lanzamiento de producto',
      searchTitle:'2. Define la publicación',searchSub:'Elige el canal y el objetivo de la comunicación.',
      searchPlaceholder:'Ej.: post para LinkedIn sobre lanzamiento',searchButton:'Preparar',
      previewTitle:'3. Genera la publicación con IA',previewSub:'Carla crea el texto, estructura y llamada a la acción.',
      action:'Ver publicaciones',metric:'Publicaciones',review:'Pendientes de aprobación',cta:'Automatiza redes',
      ctaText:'Programa la preparación de contenido para tener siempre publicaciones listas.',
      primaryPrompt:'Prepara publicaciones para mis redes sobre el tema indicado, adaptadas a cada canal y listas para aprobar.',
      previewType:'content'
    },
    campaigns:{
      chatKey:'social',crumb:'Marketing y redes › Campañas',icon:'⌁',title:'Agente de Campañas',
      subtitle:'Estructura campañas, mensajes y acciones para captar demanda de forma ordenada.',
      help:'Te ayudo a convertir un objetivo comercial en una campaña concreta y medible.',
      capabilities:['Define público','Prepara mensajes','Organiza canales','Crea calendario','Resume resultados disponibles'],
      tabs:['Resumen','Campañas','Audiencias','Mensajes','Calendario','Resultados'],
      chips:['Captación','Lanzamiento','Reactivación','Promoción','Fidelización','Marca'],
      objective:'Objetivo de campaña',itemLabel:'Producto o campaña',itemPlaceholder:'Ej.: campaña de lanzamiento',
      searchTitle:'2. Define la campaña',searchSub:'Indica el objetivo y el público para preparar la estructura.',
      searchPlaceholder:'Ej.: campaña para captar clínicas privadas',searchButton:'Diseñar',
      previewTitle:'3. Genera la campaña con IA',previewSub:'Carla prepara mensajes, acciones y calendario para que los revises.',
      action:'Ver campaña preparada',metric:'Acciones creadas',review:'Pendientes de revisión',cta:'Automatiza campañas',
      ctaText:'Haz que Carla prepare periódicamente nuevas acciones según tus objetivos.',
      primaryPrompt:'Diseña una campaña para mi objetivo comercial, con público, mensajes, canales y calendario.',
      previewType:'campaign'
    },
    administration:{
      chatKey:'administration',crumb:'Documentos e IA › Análisis',icon:'▤',title:'Agente de Documentos e IA',
      subtitle:'Lee documentos, extrae información y convierte archivos en trabajo útil.',
      help:'Analizo solo los documentos autorizados y te explico qué contienen sin inventar.',
      capabilities:['Lee PDF, Excel y Word','Extrae datos','Resume documentos','Detecta puntos importantes','Prepara acciones a partir del contenido'],
      tabs:['Resumen','Documentos','Análisis','Extracciones','Trabajo preparado','Resultados'],
      chips:['PDF','Excel','Word','Imagen','Contrato','Informe'],
      objective:'Qué quieres hacer con el documento',itemLabel:'Archivo o instrucción',itemPlaceholder:'Ej.: analiza el último PDF',
      searchTitle:'2. Selecciona el documento',searchSub:'Usa un archivo autorizado o indícale a Carla cuál quieres analizar.',
      searchPlaceholder:'Ej.: analiza este contrato y dime los puntos importantes',searchButton:'Analizar',
      previewTitle:'3. Analiza con IA',previewSub:'Carla resume lo que realmente aparece y propone acciones concretas.',
      action:'Ver análisis completo',metric:'Documentos',review:'Análisis preparados',cta:'Automatiza documentos',
      ctaText:'Haz que Carla revise documentos repetitivos y prepare siempre la misma extracción.',
      primaryPrompt:'Analiza el documento seleccionado, resume su contenido y destaca datos, riesgos y acciones concretas sin inventar.',
      previewType:'document'
    },
    agenda:{
      chatKey:'core_ai',crumb:'Agenda › Reuniones',icon:'▦',title:'Agente de Agenda y Reuniones',
      subtitle:'Organiza reuniones, prepara contexto y deja claras las acciones posteriores.',
      help:'Reviso tu agenda conectada y preparo lo que necesitas antes y después de cada reunión.',
      capabilities:['Lee agenda autorizada','Resume reuniones de hoy','Prepara contexto','Crea recordatorios','Organiza siguientes acciones'],
      tabs:['Hoy','Semana','Reuniones','Preparación','Seguimiento','Resultados'],
      chips:['Hoy','Esta semana','Clientes','Internas','Pendientes','Seguimiento'],
      objective:'Qué reuniones quieres revisar',itemLabel:'Reunión o persona',itemPlaceholder:'Ej.: reunión con cliente a las 12:00',
      searchTitle:'2. Selecciona una reunión',searchSub:'Carla usa tu agenda conectada y el contexto autorizado disponible.',
      searchPlaceholder:'Ej.: prepárame la reunión de esta tarde',searchButton:'Preparar',
      previewTitle:'3. Prepara la reunión con IA',previewSub:'Verás objetivo, contexto, temas a tratar y próximos pasos.',
      action:'Ver preparación',metric:'Reuniones hoy',review:'Preparaciones listas',cta:'Automatiza tu agenda',
      ctaText:'Haz que Carla te prepare automáticamente el día y las reuniones importantes.',
      primaryPrompt:'Revisa mi agenda de hoy y prepárame las reuniones con contexto y próximos pasos.',
      previewType:'agenda'
    },
    reports:{
      chatKey:'reports',crumb:'Informes › Análisis',icon:'▥',title:'Agente de Informes',
      subtitle:'Convierte datos conectados en informes claros, comparables y exportables.',
      help:'Ordeno los datos, destaco cambios y preparo conclusiones verificables.',
      capabilities:['Resume indicadores','Compara periodos','Detecta cambios','Explica resultados','Prepara informes exportables'],
      tabs:['Resumen','Ventas','Clientes','Operaciones','Comparativas','Exportar'],
      chips:['Ventas','Clientes','Stock','Pedidos','Email','Actividad'],
      objective:'Qué quieres medir',itemLabel:'Periodo o pregunta',itemPlaceholder:'Ej.: este mes frente al anterior',
      searchTitle:'2. Define el informe',searchSub:'Elige datos, periodo y comparación para generar un informe útil.',
      searchPlaceholder:'Ej.: compara ventas de este mes con el anterior',searchButton:'Generar',
      previewTitle:'3. Genera el informe con IA',previewSub:'Carla presenta datos, variaciones y conclusiones sin ocultar la fuente.',
      action:'Ver informe completo',metric:'Indicadores',review:'Informes preparados',cta:'Automatiza informes',
      ctaText:'Programa informes semanales o mensuales para tenerlos listos cuando los necesites.',
      primaryPrompt:'Prepara un informe con los datos disponibles, comparando el periodo indicado y destacando cambios y conclusiones.',
      previewType:'report'
    },
    automation:{
      chatKey:'automation',crumb:'Automatizaciones › Flujos',icon:'↻',title:'Agente de Automatizaciones',
      subtitle:'Convierte tareas repetitivas en flujos controlados y fáciles de revisar.',
      help:'Te ayudo a definir qué se repite, cuándo debe ejecutarse y qué necesita tu aprobación.',
      capabilities:['Detecta tareas repetitivas','Define disparadores','Prepara flujos','Incluye puntos de aprobación','Muestra qué hizo cada automatización'],
      tabs:['Resumen','Flujos','Disparadores','Aprobaciones','Historial','Resultados'],
      chips:['Correo','Pedidos','Stock','Clientes','Informes','Recordatorios'],
      objective:'Qué quieres automatizar',itemLabel:'Tarea repetitiva',itemPlaceholder:'Ej.: revisar stock cada lunes',
      searchTitle:'2. Describe la tarea repetitiva',searchSub:'Carla te ayuda a convertirla en pasos claros y controlados.',
      searchPlaceholder:'Ej.: avísame cuando haya pedidos nuevos',searchButton:'Diseñar',
      previewTitle:'3. Diseña la automatización con IA',previewSub:'Verás disparador, pasos, permisos y puntos de aprobación antes de activarla.',
      action:'Ver automatización',metric:'Flujos activos',review:'Pendientes de aprobar',cta:'Activa tu automatización',
      ctaText:'Revisa el flujo y actívalo solo cuando estés conforme con cada paso.',
      primaryPrompt:'Diseña una automatización para la tarea indicada, con disparador, pasos, permisos y aprobación donde sea necesaria.',
      previewType:'automation'
    }
  };

  function cfgFor(key){return configs[key]||configs[alias[key]]||configs.core_ai}
  function companyName(){
    const active=window.vnxBusiness?.activeProfile?.();
    if(active)return active.tradeName||active.legalName||'Empresa activa';
    const txt=$('#homeCompanyName')?.textContent?.trim();
    return txt&&txt!=='Tu empresa'?txt:'Tu empresa';
  }
  const HOME_SOURCE_KEY='vnx_home_selected_source_v1';
  const STOCK_POLICY_KEY='vnx_stock_policy_by_source_v1';
  const PROSPECT_PROFILE_KEY='vnx_prospect_profile_by_source_v1';
  function normalizedText(v=''){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}
  function tagTexts(selector){return $$(selector+' .vnx-ah-tag').map(el=>{const c=el.cloneNode(true);c.querySelector('button')?.remove();return String(c.textContent||'').trim()}).filter(x=>x&&x!=='Tu producto o servicio')}
  function selectedHomeSource(){try{return JSON.parse(localStorage.getItem(HOME_SOURCE_KEY)||'null')}catch{return null}}
  function stockPolicyKeys(src={}){
    const keys=[],raw=src?.raw||{};
    const id=String(src?.id||raw.id||'').trim(),shop=String(src?.shop||raw.shop||'').trim(),label=String(src?.label||src?.name||raw.shopName||shop||'').trim();
    if(id)keys.push('id:'+id);if(shop)keys.push('shop:'+shop.toLowerCase());if(label)keys.push('label:'+normalizedText(label));
    return [...new Set(keys)];
  }
  function stockPolicyStore(){try{const x=JSON.parse(localStorage.getItem(STOCK_POLICY_KEY)||'{}');return x&&typeof x==='object'?x:{}}catch{return {}}}
  function prospectProfileStore(){try{const x=JSON.parse(localStorage.getItem(PROSPECT_PROFILE_KEY)||'{}');return x&&typeof x==='object'?x:{}}catch{return {}}}
  function prospectProfileForSource(src={}){
    const store=prospectProfileStore();
    for(const key of stockPolicyKeys(src)){if(store[key])return store[key]}
    return {targetSegments:''};
  }
  function saveProspectProfileForSource(src={},profile={}){
    const keys=stockPolicyKeys(src);if(!keys.length)return false;
    const next={targetSegments:String(profile.targetSegments||'').trim().slice(0,500),updatedAt:new Date().toISOString()};
    const store=prospectProfileStore();for(const key of keys)store[key]=next;
    try{localStorage.setItem(PROSPECT_PROFILE_KEY,JSON.stringify(store));return true}catch{return false}
  }
  function prospectSegmentInput(){return $('#vnxAhFilters input[data-vnx-filter-text="Tipo de cliente / sector objetivo"]')}
  function restoreProspectProfile(){
    if(document.body.dataset.vnxHomeAgent!=='prospecting')return;
    const input=prospectSegmentInput();if(!input)return;
    const src=selectedHomeSource(),profile=prospectProfileForSource(src||{}),business=window.vnxBusiness?.activeProfile?.();
    input.value=profile.targetSegments||business?.targetCustomers||'';
    input.onchange=()=>{if(src)saveProspectProfileForSource(src,{targetSegments:input.value})};
    input.onblur=input.onchange;
  }
  function businessValues(v='',max=6){
    return String(v||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).slice(0,max);
  }
  function applyBusinessAgentDefaults(key){
    const business=window.vnxBusiness?.activeProfile?.();if(!business)return;
    if(['prospecting','content','social','campaigns'].includes(key)){
      const items=businessValues(business.productsServices,6),brands=businessValues(business.brands,6);
      const itemBox=$('#vnxAhItems'),brandBox=$('#vnxAhBrands');
      if(itemBox&&items.length)itemBox.innerHTML=items.map(x=>'<span class="vnx-ah-tag">'+esc(x)+' <button type="button" class="vnx-ah-remove-tag">×</button></span>').join('');
      if(brandBox&&brands.length)brandBox.innerHTML=brands.map(x=>'<span class="vnx-ah-tag">'+esc(x)+' <button type="button" class="vnx-ah-remove-brand">×</button></span>').join('');
      document.querySelectorAll('#vnxAhItems .vnx-ah-remove-tag').forEach(b=>b.onclick=()=>b.parentElement?.remove());
      document.querySelectorAll('#vnxAhBrands .vnx-ah-remove-brand').forEach(b=>b.onclick=()=>b.parentElement?.remove());
    }
    restoreProspectProfile();
  }
  function stockPolicyForSource(src={}){
    const store=stockPolicyStore();
    for(const key of stockPolicyKeys(src)){const x=store[key];if(x)return {targetDays:Math.max(1,Math.min(365,Number(x.targetDays)||25)),noHistoryMin:Math.max(0,Math.min(100000,Number(x.noHistoryMin)||0))}}
    return {targetDays:25,noHistoryMin:0};
  }
  function saveStockPolicyForSource(src={},policy={}){
    const keys=stockPolicyKeys(src);if(!keys.length)return false;
    const next={targetDays:Math.max(1,Math.min(365,Math.round(Number(policy.targetDays)||25))),noHistoryMin:Math.max(0,Math.min(100000,Math.round(Number(policy.noHistoryMin)||0))),updatedAt:new Date().toISOString()};
    const store=stockPolicyStore();for(const key of keys)store[key]=next;
    try{localStorage.setItem(STOCK_POLICY_KEY,JSON.stringify(store));return true}catch{return false}
  }
  function renderStockPolicyUi(){
    const panel=$('#vnxAhStockPolicy');if(!panel)return;
    const active=document.body.dataset.vnxHomeAgent==='web_ecommerce';panel.style.display=active?'grid':'none';if(!active)return;
    const src=selectedHomeSource(),policy=stockPolicyForSource(src||{});
    const source=$('#vnxAhStockPolicySource'),days=$('#vnxAhTargetDays'),min=$('#vnxAhNoHistoryMin'),save=$('#vnxAhSaveStockPolicy'),example=$('#vnxAhStockPolicyExample');
    if(source)source.textContent=src?.label||'Selecciona “Tu empresa” arriba';
    if(days)days.value=String(policy.targetDays);if(min)min.value=String(policy.noHistoryMin);
    if(save)save.disabled=!src;
    const paint=()=>{
      const d=Math.max(1,Math.min(365,Math.round(Number(days?.value)||25))),m=Math.max(0,Math.min(100000,Math.round(Number(min?.value)||0)));
      if(example)example.textContent=m>0?'Sin histórico: se propondrá stock hasta alcanzar '+m+' unidad'+(m===1?'':'es')+'. Objetivo con histórico: '+d+' días.':'Sin histórico: no se propondrá una cantidad automática. Objetivo con histórico: '+d+' días.';
    };
    if(days)days.oninput=paint;if(min)min.oninput=paint;paint();
    if(save)save.onclick=()=>{
      const selected=selectedHomeSource();
      if(!selected){alert('Selecciona primero la empresa o conexión que quieres analizar.');return}
      const ok=saveStockPolicyForSource(selected,{targetDays:days?.value,noHistoryMin:min?.value});
      if(!ok){alert('No se ha podido guardar la política de stock.');return}
      lastStockRun=null;
      const old=save.textContent;save.textContent='Guardado ✓';setTimeout(()=>{if(save.isConnected)save.textContent=old},1400);
    };
    populateStockSourceSelect().catch(()=>{});
  }
  function saveHomeSource(src){try{src?localStorage.setItem(HOME_SOURCE_KEY,JSON.stringify(src)):localStorage.removeItem(HOME_SOURCE_KEY)}catch{}renderStockPolicyUi();restoreProspectProfile()}
  function agentKeyForRequest(question='',fallback='core_ai'){
    const q=normalizedText(question);
    if(/\b(email|emails|correo|correos|gmail|bandeja)\b/.test(q))return 'email';
    if(/\b(stock|inventario|existencias|compras|comprar|reponer|reposicion|rotura|cobertura)\b/.test(q))return 'web_ecommerce';
    if(/\b(pedido|pedidos|orden de compra|ordenes de compra)\b/.test(q))return 'orders';
    if(/\b(captacion|captar|prospectar|prospeccion|lead|leads|buscar empresas|buscar clientes nuevos)\b/.test(q))return 'prospecting';
    if(/\b(cliente|clientes|venta|ventas|crm|oportunidad|oportunidades|seguimiento comercial)\b/.test(q))return 'crm';
    if(/\b(redes|instagram|facebook|linkedin|publicacion|publicaciones|post|posts|marketing|campana|campanas|contenido)\b/.test(q))return 'social';
    if(/\b(documento|documentos|pdf|excel|csv|word|ocr|archivo|archivos|factura)\b/.test(q))return 'administration';
    if(/\b(informe|informes|resultado|resultados|margen|margenes|rentabilidad|beneficio|beneficios)\b/.test(q))return 'reports';
    if(/\b(automatiza|automatizacion|automatizaciones|flujo|flujos|cada dia|cada semana|recurrente)\b/.test(q))return 'automation';
    if(/\b(agenda|reunion|reuniones|cita|citas|calendario)\b/.test(q))return 'agenda';
    return configs[fallback]?fallback:'core_ai';
  }
  function promptWithHomeContext(key,prompt=''){
    const parts=[String(prompt||'').trim()],src=selectedHomeSource(),brands=tagTexts('#vnxAhBrands'),items=tagTexts('#vnxAhItems');
    if(src?.label)parts.push('Trabaja únicamente con la conexión/empresa seleccionada en la pantalla de inicio: '+src.label+'. No mezcles otras fuentes salvo que yo lo pida expresamente.');
    if(key==='web_ecommerce'){const p=stockPolicyForSource(src||{});parts.push('Política de reposición de esta empresa: objetivo '+p.targetDays+' días; si una referencia no tiene histórico, stock mínimo '+p.noHistoryMin+' unidades. Si el mínimo es 0, no inventes cantidad y marca la referencia para revisión.');}
    if(key==='prospecting'){
      const typed=String(prospectSegmentInput()?.value||'').trim(),saved=prospectProfileForSource(src||{}).targetSegments||'',segments=typed||saved;
      if(segments)parts.push('Tipo de cliente / sector objetivo indicado por el usuario: '+segments+'. Respeta estos segmentos y no los sustituyas por sectores genéricos.');
    }
    if(items.length)parts.push('Productos o servicios indicados: '+items.join(', ')+'.');
    if(brands.length&&['prospecting','content','social','campaigns'].includes(key))parts.push('Marca o marcas indicadas: '+brands.join(', ')+'. Usa estos nombres tal como se han introducido; no inventes marcas.');
    return parts.filter(Boolean).join('\n');
  }
  function selectHomeSourceInWorkbench(){
    const src=selectedHomeSource();if(!src?.label)return;
    setTimeout(()=>{const sel=$('#chatSourceSelect');if(!sel)return;const w=normalizedText(src.label),opt=[...sel.options].find(o=>normalizedText(o.textContent).includes(w)||w.includes(normalizedText(o.textContent)));if(opt){sel.value=opt.value;sel.dispatchEvent(new Event('change',{bubbles:true}))}const second=$('#chatSourceSecondSelect');if(second){second.value='';second.dispatchEvent(new Event('change',{bubbles:true}))}},240);
  }
  async function homeCompanySources(){
    const rows=[];
    try{for(const x of await window.vnx.listConnections()||[]){const module=String(x.module||x.key||'').toLowerCase(),label=String(x.label||x.account||x.shopName||x.shop||module||'Conexión').trim();if(label)rows.push({id:String(x.id||x.key||x.shop||module||label),type:'connection',module,label,shop:String(x.shop||''),raw:x})}}catch{}
    try{for(const p of await window.vnx.listPortals()||[]){if(p?.id&&p.lastStatus==='connected'&&['read','write'].includes(p.mode||'read'))rows.push({id:String(p.id),type:'portal',module:'portal',label:String(p.name||p.url||'Portal privado'),raw:p})}}catch{}
    const seen=new Set(),unique=rows.filter(x=>{const k=x.type+':'+x.id+':'+x.label.toLowerCase();if(seen.has(k))return false;seen.add(k);return true});
    const profile=window.vnxBusiness?.activeProfile?.(),refs=new Set(profile?.connectionRefs||[]);
    if(!refs.size)return unique;
    return unique.filter(x=>refs.has((x.type==='portal'?'portal:':'connection:')+String(x.id||'')));
  }
  let lastOrdersRun=null;
  function orderFilterValues(){
    const out={};
    document.querySelectorAll('#vnxAhFilters label').forEach(label=>{
      const name=String(label.querySelector('small')?.textContent||'').trim(),value=String(label.querySelector('select')?.value||'').trim();
      if(name)out[name]=value;
    });
    return out;
  }
  function orderTimestamp(o){
    const n=Number(o?.createdAt||0);if(n>0)return n;
    const d=Date.parse(String(o?.sourceDate||o?.orderDate||o?.createdDate||''));return Number.isFinite(d)?d:0;
  }
  function orderMatches(snapshotOrder,query=''){
    const q=normalizedText(query),f=orderFilterValues(),status=normalizedText(f.Estado||'Todos'),date=normalizedText(f.Fecha||'Hoy'),channel=normalizedText(f.Canal||'Todos');
    const st=String(snapshotOrder?.status||''),hay=normalizedText([
      snapshotOrder?.internalRef,snapshotOrder?.orderRef,snapshotOrder?.customer,snapshotOrder?.email,snapshotOrder?.sourceSubject,
      ...(snapshotOrder?.lines||[]).flatMap(x=>[x.ref,x.description])
    ].filter(Boolean).join(' '));
    if(/pedidos?\s+nuevos?/.test(q)&&st!=='nuevo')return false;
    if(/pedidos?\s+(?:preparados?|listos?)/.test(q)&&st!=='listo')return false;
    if(/pedidos?\s+pendientes?/.test(q)&&['introducido','descartado','listo'].includes(st))return false;
    if(/incidencias?/.test(q)&&!snapshotOrder?.issues?.length&&!['revisar','falta_datos','sin_stock','esperando_compras','esperando_cliente','error'].includes(st))return false;
    if(q&&!/pedidos?\s+(nuevos?|pendientes?|listos?|preparados?)\s*(de\s+)?(hoy)?/.test(q)&&!/incidencias?/.test(q)&&!hay.includes(q))return false;
    if(status!=='todos'){
      if(status==='nuevos'&&st!=='nuevo')return false;
      if(status==='pendientes'&&['introducido','descartado','listo'].includes(st))return false;
      if(status==='incompletos'&&!['revisar','falta_datos','sin_stock','esperando_compras','esperando_cliente','error'].includes(st))return false;
      if(status==='preparados'&&st!=='listo')return false;
    }
    const age=Date.now()-orderTimestamp(snapshotOrder),day=86400000;
    if(date==='hoy'&&age>day)return false;
    if(date==='7 dias'&&age>7*day)return false;
    if(date==='30 dias'&&age>30*day)return false;
    if(channel!=='todos'){
      const web=snapshotOrder?.sourceKind==='web';
      if(channel==='tienda online'&&!web)return false;
      if(channel==='email'&&web)return false;
      if(channel==='portal'&&snapshotOrder?.sourceKind!=='portal')return false;
    }
    const active=[...document.querySelectorAll('#vnxAhChips .vnx-ah-chip.active')].map(x=>normalizedText(x.textContent));
    if(active.length){
      const wantsNew=active.includes('nuevos'),wantsUrgent=active.includes('urgentes'),wantsPending=active.includes('pendientes'),
        wantsIncomplete=active.includes('incompletos'),wantsPrepared=active.includes('preparados'),wantsIssues=active.includes('incidencias');
      if(wantsNew&&st!=='nuevo')return false;
      if(wantsPending&&['introducido','descartado','listo'].includes(st))return false;
      if(wantsIncomplete&&!['revisar','falta_datos','sin_stock','esperando_compras','esperando_cliente','error'].includes(st))return false;
      if(wantsPrepared&&st!=='listo')return false;
      if(wantsIssues&&!snapshotOrder?.issues?.length&&!['revisar','falta_datos','sin_stock','esperando_compras','esperando_cliente','error'].includes(st))return false;
      if(wantsUrgent&&!['sin_stock','esperando_compras','error'].includes(st))return false;
    }
    return true;
  }
  function orderChannelLabel(o){
    if(o?.sourceKind==='web')return o?.sourceStore?String(o.sourceStore):'Tienda online';
    if(o?.sourceKind==='portal')return 'Portal';
    return o?.sourceAccount?String(o.sourceAccount):'Email';
  }
  function orderStatusLabel(o){
    const map={nuevo:'NUEVO',listo:'LISTO',revisar:'REVISAR',falta_datos:'FALTAN DATOS',sin_stock:'SIN STOCK',esperando_compras:'ESPERANDO COMPRAS',esperando_cliente:'ESPERANDO CLIENTE',introducido:'INTRODUCIDO',error:'ERROR',descartado:'DESCARTADO'};
    return map[o?.status]||String(o?.statusText||o?.status||'');
  }
  function orderMoney(o){
    if(o?.total==null)return '—';
    const n=Number(o.total);if(!Number.isFinite(n))return '—';
    return n.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(o.currency||'€');
  }
  function renderOrdersResult(snapshot,query=''){
    const preview=$('#vnxAhPreview');if(!preview)return;
    const rows=(snapshot?.orders||[]).filter(o=>orderMatches(o,query));
    const c=snapshot?.counts||{},newNow=Number(snapshot?.scan?.found?.length||0),errors=Array.isArray(snapshot?.scan?.errors)?snapshot.scan.errors:[];
    preview.innerHTML='<div class="vnx-orders-live">'
      +'<div class="vnx-orders-live-head"><div><small>PEDIDOS RECIBIDOS</small><b>'+rows.length+' pedido'+(rows.length===1?'':'s')+' mostrados</b><span>Revisión real de correo y tiendas online conectadas · últimos '+Number(snapshot?.settings?.scanDays||14)+' días.</span></div>'
      +'<div class="vnx-orders-kpis"><span><b>'+newNow+'</b><small>Nuevos ahora</small></span><span><b>'+Number(c.pending||0)+'</b><small>Pendientes</small></span><span><b>'+Number(c.ready||0)+'</b><small>Listos</small></span><span><b>'+Number(c.issues||0)+'</b><small>Incidencias</small></span></div></div>'
      +(errors.length?'<div class="vnx-orders-warning"><b>Alguna fuente no se ha podido revisar:</b> '+errors.map(esc).join(' · ')+'</div>':'')
      +'<div class="vnx-orders-table"><table><thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Canal</th><th>Líneas</th><th>Total</th><th>Estado</th><th>Incidencias</th></tr></thead><tbody>'
      +(rows.length?rows.map(o=>{
        const dt=orderTimestamp(o)?new Date(orderTimestamp(o)).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
        const ref=String(o.orderRef||o.internalRef||('#'+o.seq)||'—'),issues=(o.issues||[]).slice(0,3);
        const lines=(o.lines||[]).slice(0,8).map(x=>esc((x.ref||'sin ref.')+' × '+(x.qty==null?'?':x.qty)+(x.description?' · '+x.description:''))).join('<br>');
        return '<tr class="status-'+esc(String(o.status||''))+'"><td>'+esc(dt)+'</td><td><b>'+esc(ref)+'</b><small>'+esc(o.sourceSubject||'')+'</small></td><td>'+esc(o.customer||'—')+'</td><td>'+esc(orderChannelLabel(o))+'</td><td><details><summary>'+Number(o.lineCount||0)+' línea'+(Number(o.lineCount||0)===1?'':'s')+'</summary><div>'+lines+'</div></details></td><td>'+esc(orderMoney(o))+'</td><td><strong>'+esc(orderStatusLabel(o))+'</strong></td><td>'+(issues.length?issues.map(x=>'<span>'+esc(x)+'</span>').join(''):'—')+'</td></tr>';
      }).join(''):'<tr><td colspan="8"><div class="vnx-orders-empty"><b>No hay pedidos que coincidan con este filtro.</b><span>Si acaba de llegar uno, pulsa Revisar para volver a leer correo y tiendas conectadas.</span></div></td></tr>')
      +'</tbody></table></div>'
      +'<div class="vnx-orders-foot"><span>'+Number(c.total||0)+' pedidos guardados</span><span>'+Number(snapshot?.scan?.accounts||0)+' cuentas de correo revisadas</span><span>'+(snapshot?.settings?.webOrders?'Tiendas online activas':'Tiendas online desactivadas')+'</span></div>'
      +'</div>';
    const metric=$('#vnxAhMetricValue'),review=$('#vnxAhReviewValue');
    if(metric)metric.textContent=String(rows.length);if(review)review.textContent=String(c.ready||0);
    const pt=$('#vnxAhPreviewTitle'),ps=$('#vnxAhPreviewSub');
    if(pt)pt.textContent='3. Pedidos recibidos y estado';
    if(ps)ps.textContent='Estos son los pedidos detectados realmente en tus canales conectados.';
  }
  async function runOrdersReview(mode=''){
    const btn=$('#vnxAhSearchBtn'),preview=$('#vnxAhPreview');
    try{
      if(btn){btn.disabled=true;btn.textContent='Revisando…'}
      if(preview)preview.innerHTML='<div class="vnx-stock-loading">Revisando correo y tiendas online para detectar pedidos nuevos…</div>';
      const snapshot=await window.vnx?.ordersReview?.({force:true,max:250});
      if(!snapshot?.ok)throw new Error('El agente de Pedidos no ha devuelto datos.');
      lastOrdersRun=snapshot;
      const input=$('#vnxAhSearchInput'),old=input?.value||'';
      if(input&&mode)input.value=mode;
      renderOrdersResult(snapshot,mode||old);
      if(input&&mode)input.value=old;
    }catch(e){
      if(preview)preview.innerHTML='<div class="vnx-stock-error"><b>No se han podido revisar los pedidos.</b><span>'+esc(String(e?.message||e))+'</span></div>';
    }finally{if(btn){btn.disabled=false;btn.textContent='Revisar'}}
  }

  let lastStockRun=null;
  function sameHomeSource(a,b){return Boolean(a&&b&&a.type===b.type&&String(a.id||'')===String(b.id||''))}
  async function stockCapableSources(){
    const all=await homeCompanySources();
    return all.filter(x=>x.type==='portal'||x.module==='portal'||x.module==='shopify');
  }
  async function populateStockSourceSelect(){
    const sel=$('#vnxAhStockSourceSelect');if(!sel||document.body.dataset.vnxHomeAgent!=='web_ecommerce')return [];
    const sources=await stockCapableSources();let selected=selectedHomeSource();
    let match=sources.find(x=>sameHomeSource(x,selected));
    if(!match&&sources.length===1){
      match=sources[0];selected=match;
      try{localStorage.setItem(HOME_SOURCE_KEY,JSON.stringify(match))}catch{}
      const m=$('#vnxAhCompanyName');if(m)m.textContent=match.label;
    }
    sel.innerHTML='<option value="">Selecciona una conexión…</option>'+sources.map((src,i)=>'<option value="'+i+'">'+esc(src.label)+' · '+esc(src.module==='shopify'?'Shopify':'Portal privado')+'</option>').join('');
    if(match){const index=sources.findIndex(x=>sameHomeSource(x,match));if(index>=0)sel.value=String(index)}
    sel.onchange=()=>{
      const src=sources[Number(sel.value)];
      if(src){saveHomeSource(src);lastStockRun=null}
    };
    const sourceLabel=$('#vnxAhStockPolicySource');if(sourceLabel)sourceLabel.textContent=match?.label||(sources.length?'Selecciona una conexión':'No hay fuente de stock conectada');
    return sources;
  }
  function stockPolicyFromForm(src){
    const stored=stockPolicyForSource(src||{}),days=$('#vnxAhTargetDays'),min=$('#vnxAhNoHistoryMin');
    return {
      targetDays:Math.max(1,Math.min(365,Math.round(Number(days?.value)||stored.targetDays||25))),
      noHistoryMin:Math.max(0,Math.min(100000,Math.round(Number(min?.value)||stored.noHistoryMin||0)))
    };
  }
  async function resolveStockSource(){
    const sources=await stockCapableSources(),selected=selectedHomeSource();
    let src=sources.find(x=>sameHomeSource(x,selected));
    if(!src&&sources.length===1){
      src=sources[0];
      try{localStorage.setItem(HOME_SOURCE_KEY,JSON.stringify(src))}catch{}
      const m=$('#vnxAhCompanyName');if(m)m.textContent=src.label;
    }
    if(!src){
      if(!sources.length)throw new Error('No hay ninguna conexión de stock disponible. Conecta Shopify o un portal privado primero.');
      throw new Error('Selecciona la empresa o conexión que quieres analizar en “Empresa / conexión a analizar”.');
    }
    return src;
  }
  function stockSortRows(rows=[]){
    return [...rows].sort((a,b)=>{
      const am=String(a?.manufacturer||'').trim(),bm=String(b?.manufacturer||'').trim();
      if(am&&!bm)return -1;if(!am&&bm)return 1;
      const by=am.localeCompare(bm,'es',{sensitivity:'base'});if(by)return by;
      return String(a?.product||'').localeCompare(String(b?.product||''),'es',{sensitivity:'base'});
    });
  }
  function stockFmt(n){const v=Number(n);return Number.isFinite(v)?v.toLocaleString('es-ES',{maximumFractionDigits:3}):'—'}
  function stockQtyLabel(r,summary){
    if(Number(r?.qty||0)>0)return stockFmt(r.qty);
    if(r?.noSalesData&&Number(summary?.noHistoryMin||0)===0&&Number(r?.stock||0)<=0)return 'REVISAR';
    return '0';
  }
  function stockSalesLabel(r){return r?.noSalesData?'Sin histórico':stockFmt(r?.soldWindow||0)}
  function stockCoverageLabel(r){return r?.noSalesData?'—':r?.daysRemaining==null?'Sin ventas':String(r.daysRemaining)}
  function stockStateLabel(r,summary){
    if(r?.noSalesData){
      if(Number(summary?.noHistoryMin||0)>0)return Number(r?.qty||0)>0?'MÍNIMO SIN HISTÓRICO':'MÍNIMO CUBIERTO';
      return Number(r?.stock||0)<=0?'REVISAR · SIN HISTÓRICO':'SIN HISTÓRICO';
    }
    if(Number(r?.stock||0)<=0)return 'SIN STOCK';
    if(r?.urgent)return 'ROTURA < 5 DÍAS';
    if(Number(r?.qty||0)>0)return 'REPONER';
    return 'CORRECTO';
  }
  function stockRowsForView(summary,question='',orderMode=false){
    const rows=Array.isArray(summary?.rows)?summary.rows:[],q=normalizedText(question);
    if(orderMode)return rows.filter(r=>Number(r.qty||0)>0||(r.noSalesData&&Number(summary?.noHistoryMin||0)===0&&Number(r.stock||0)<=0));
    if(/sin stock|stock 0|agotad/.test(q))return rows.filter(r=>Number(r.stock||0)<=0);
    if(/menos de 5|< ?5|rotura/.test(q))return rows.filter(r=>r.urgent);
    if(/reponer|comprar|compra|pedido/.test(q))return rows.filter(r=>Number(r.qty||0)>0||(r.noSalesData&&Number(summary?.noHistoryMin||0)===0&&Number(r.stock||0)<=0));
    return rows;
  }
  function renderStockResult(summary,question='',orderMode=false){
    const preview=$('#vnxAhPreview');if(!preview)return;
    const rows=stockSortRows(stockRowsForView(summary,question,orderMode));
    const all=Array.isArray(summary?.rows)?summary.rows:[],toBuy=all.filter(r=>Number(r.qty||0)>0||(r.noSalesData&&Number(summary?.noHistoryMin||0)===0&&Number(r.stock||0)<=0));
    const totalUnits=toBuy.reduce((n,r)=>n+Math.max(0,Number(r.qty||0)),0);
    const source=esc(summary?.sourceLabel||'Fuente seleccionada'),target=Number(summary?.targetDays||25),min=Number(summary?.noHistoryMin||0);
    const title=orderMode?'Pedido propuesto':'Análisis de stock';
    const note=min>0?'Sin histórico: mínimo configurado de '+min+' uds.':'Sin histórico: se marca REVISAR y no se inventa cantidad.';
    preview.innerHTML='<div class="vnx-stock-live">'
      +'<div class="vnx-stock-live-head"><div><small>'+esc(title.toUpperCase())+'</small><b>'+source+'</b><span>Objetivo '+target+' días · '+esc(note)+'</span></div><div><strong>'+stockFmt(orderMode?totalUnits:all.length)+'</strong><small>'+(orderMode?'unidades propuestas':'productos analizados')+'</small></div></div>'
      +'<div class="vnx-stock-live-table"><table><thead><tr><th>Fabricante</th><th>SKU</th><th>EAN</th><th>Producto</th><th>Stock</th><th>Ventas 6 meses</th><th>Cobertura</th><th>A comprar</th><th>Estado</th></tr></thead><tbody>'
      +(rows.length?rows.map(r=>'<tr class="'+(Number(r.stock||0)<=0?'loss':'')+'"><td>'+esc(String(r.manufacturer||'—'))+'</td><td>'+esc(String(r.sku||'—'))+'</td><td>'+esc(String(r.ean||'—'))+'</td><td><b>'+esc(String(r.product||''))+'</b></td><td>'+stockFmt(r.stock)+'</td><td>'+esc(stockSalesLabel(r))+'</td><td>'+esc(stockCoverageLabel(r))+'</td><td><strong>'+esc(stockQtyLabel(r,summary))+'</strong></td><td>'+esc(stockStateLabel(r,summary))+'</td></tr>').join(''):'<tr><td colspan="9">No hay referencias que cumplan este filtro.</td></tr>')
      +'</tbody></table></div>'
      +'<div class="vnx-stock-live-foot"><span>'+rows.length+' referencias mostradas</span><span>'+toBuy.length+' necesitan compra/revisión</span><span>'+stockFmt(totalUnits)+' unidades propuestas</span></div>'
      +'</div>';
    const metric=$('#vnxAhMetricValue'),review=$('#vnxAhReviewValue'),metricLabel=$('#vnxAhMetricLabel'),reviewLabel=$('#vnxAhReviewLabel');
    if(metric)metric.textContent=String(all.length);if(review)review.textContent=String(toBuy.length);
    if(metricLabel)metricLabel.textContent='Productos analizados';if(reviewLabel)reviewLabel.textContent='Necesitan compra/revisión';
    const previewTitle=$('#vnxAhPreviewTitle'),previewSub=$('#vnxAhPreviewSub');
    if(previewTitle)previewTitle.textContent=orderMode?'3. Pedido de compra calculado':'3. Resultado del análisis real';
    if(previewSub)previewSub.textContent=orderMode?'Cantidades calculadas con la política de esta empresa.':'Stock y ventas reales de la conexión seleccionada, por SKU/EAN.';
  }
  async function fetchStockSummary(src,policy,force=true){
    if(src.type==='portal'||src.module==='portal'){
      const r=await window.vnx?.portalReplenishmentSummary?.(src.id,{force,targetDays:policy.targetDays,noHistoryMin:policy.noHistoryMin});
      if(!r?.ok){
        const why=r?.reason==='login_required'?'La sesión del portal necesita volver a iniciarse.':r?.reason==='catalog_scan_incomplete'?'No he podido verificar el catálogo completo.':r?.reason==='stock_not_structured'?'No encuentro una tabla verificable de stock en el portal.':'No he podido leer los datos de stock.';
        throw new Error(why);
      }
      return {...r,sourceLabel:src.label};
    }
    if(src.module==='shopify'){
      const shop=src.shop||src.raw?.shop||null;
      const r=await window.vnx?.shopifyReplenishmentSummary?.(shop,{force,targetDays:policy.targetDays,noHistoryMin:policy.noHistoryMin});
      if(!r?.rows)throw new Error('Shopify no ha devuelto el catálogo de stock.');
      return {...r,sourceLabel:src.label||r.sourceLabel};
    }
    throw new Error('La conexión seleccionada no admite todavía análisis estructurado de stock.');
  }
  async function runStockAnalysis(orderMode=false){
    const analyze=$('#vnxAhSearchBtn'),order=$('#vnxAhGenerateOrder'),preview=$('#vnxAhPreview');
    try{
      const src=await resolveStockSource(),policy=stockPolicyFromForm(src);
      saveStockPolicyForSource(src,policy);
      const question=$('#vnxAhSearchInput')?.value?.trim()||'';
      if(analyze){analyze.disabled=true;analyze.textContent=orderMode?'Calculando…':'Analizando…'}
      if(order){order.disabled=true;order.textContent=orderMode?'Generando…':'Generar pedido'}
      if(preview)preview.innerHTML='<div class="vnx-stock-loading">Leyendo stock y ventas reales de '+esc(src.label)+'…</div>';
      const sameRun=lastStockRun&&sameHomeSource(lastStockRun.src,src)&&lastStockRun.policy.targetDays===policy.targetDays&&lastStockRun.policy.noHistoryMin===policy.noHistoryMin;
      const summary=orderMode&&sameRun?lastStockRun.summary:await fetchStockSummary(src,policy,true);
      lastStockRun={src,policy,summary,at:Date.now()};
      renderStockResult(summary,question,orderMode);
    }catch(e){
      if(preview)preview.innerHTML='<div class="vnx-stock-error"><b>No se ha podido completar el análisis.</b><span>'+esc(String(e?.message||e))+'</span></div>';
    }finally{
      if(analyze){analyze.disabled=false;analyze.textContent='Analizar'}
      if(order){order.disabled=false;order.textContent='Generar pedido'}
    }
  }
  function closeCompanyMenu(){const menu=$('#vnxAhCompanyMenu');if(menu){menu.hidden=true;menu.innerHTML=''}}
  async function toggleCompanyMenu(){
    const existing=$('#vnxAhCompanyMenu');if(existing&&!existing.hidden){closeCompanyMenu();return}
    const btn=$('#vnxAhCompanyBtn');if(!btn)return;
    const menu=existing||document.createElement('div');menu.id='vnxAhCompanyMenu';menu.className='vnx-ah-company-menu';menu.hidden=false;menu.innerHTML='<div class="vnx-ah-company-menu-head"><b>Tu empresa / conexión</b><small>Cada fuente se mantiene separada.</small></div><div class="vnx-ah-company-loading">Cargando conexiones reales…</div>';if(!existing)document.body.appendChild(menu);
    const r=btn.getBoundingClientRect();menu.style.top=(r.bottom+7)+'px';menu.style.right=Math.max(10,window.innerWidth-r.right)+'px';
    const sources=await homeCompanySources(),selected=selectedHomeSource();
    const body=sources.length?sources.map(src=>'<button type="button" class="'+(selected?.id===src.id&&selected?.type===src.type?'active':'')+'" data-home-source="'+esc(src.type+':'+src.id)+'"><span>●</span><p><b>'+esc(src.label)+'</b><small>'+esc(src.module==='portal'?'Portal privado conectado':src.module||'Conexión')+'</small></p><i>✓</i></button>').join(''):'<div class="vnx-ah-company-empty">No hay conexiones activas. Ve a Conexiones para añadir una.</div>';
    menu.innerHTML='<div class="vnx-ah-company-menu-head"><b>Tu empresa / conexión</b><small>Seleccionar una fuente no mezcla las demás.</small></div><div class="vnx-ah-company-list">'+body+'</div><button type="button" class="vnx-ah-company-manage" data-manage-connections>⚙ Gestionar conexiones</button>';
    menu.querySelectorAll('[data-home-source]').forEach(el=>el.onclick=()=>{const [type,...rest]=String(el.dataset.homeSource||'').split(':'),id=rest.join(':'),src=sources.find(x=>x.type===type&&x.id===id);if(src)saveHomeSource(src);closeCompanyMenu()});
    menu.querySelector('[data-manage-connections]').onclick=()=>{closeCompanyMenu();openAppTab('agents')};
    const outside=e=>{if(!menu.contains(e.target)&&e.target!==btn&&!btn.contains(e.target)){closeCompanyMenu();document.removeEventListener('mousedown',outside,true)}};setTimeout(()=>document.addEventListener('mousedown',outside,true),0);
  }
  function previewHtml(cfg){
    const t=cfg.previewType;
    if(t==='email')return '<div class="vnx-ah-email"><div class="vnx-ah-email-subject"><b>Asunto:</b> Una propuesta pensada para [Empresa]</div><div class="vnx-ah-email-paper"><div class="vnx-ah-mail-copy"><div class="vnx-ah-mini-logo"><span>V</span><b>Venta<span>NexIA</span></b></div><p>Hola [Nombre],</p><p>Me pongo en contacto contigo porque creemos que nuestra propuesta puede encajar con las necesidades de [Empresa].</p><p>Carla adaptará este mensaje usando únicamente la información real disponible sobre el destinatario y tu producto o servicio.</p><p>¿Te parece bien que te envíe más información?</p><p>Un saludo,<br><b>[Tu nombre]</b><br>[Cargo]</p></div><div class="vnx-ah-product-card"><small>TU PRODUCTO</small><strong>Presentación</strong><p>Imagen, beneficios y mensaje de marca configurables.</p><div class="vnx-ah-product-boxes"><i></i><i></i></div></div></div></div>';
    if(t==='emailReply')return '<div class="vnx-ah-mail-thread"><div class="vnx-ah-incoming"><small>MENSAJE RECIBIDO</small><b>Cliente · Consulta sobre pedido</b><p>Buenos días, ¿podéis confirmarme el plazo previsto de entrega?</p></div><div class="vnx-ah-ai-draft"><small>RESPUESTA PREPARADA POR IA</small><p>Hola [Nombre],</p><p>Gracias por escribirnos. He revisado la información disponible del pedido y te preparo una respuesta basada en los datos reales de la fuente conectada.</p><p>Antes de enviar, podrás revisar y modificar el texto.</p><b>Estado: borrador · no enviado</b></div></div>';
    if(t==='stock')return '<div class="vnx-ah-stock-table"><div class="head"><span>Producto</span><span>Stock</span><span>Cobertura</span><span>Acción</span></div><div><b>SKU / Producto A</b><span>0</span><span>0 días</span><strong>Comprar</strong></div><div><b>SKU / Producto B</b><span>8</span><span>3,6 días</span><strong>Reponer</strong></div><div><b>SKU / Producto C</b><span>42</span><span>18 días</span><em>Correcto</em></div><p>Ejemplo visual. Al ejecutar el análisis se sustituyen por datos reales de la conexión elegida.</p></div>';
    if(t==='order')return '<div class="vnx-ah-order-preview"><div><small>PEDIDO DETECTADO</small><b>Pedido #[número]</b><span>Cliente: [Cliente]</span></div><div class="vnx-ah-order-lines"><p><b>2</b> líneas comprobadas</p><p><b>✓</b> referencias reconocidas</p><p><b>!</b> 1 dato por confirmar</p></div><div class="vnx-ah-review-note">Carla deja preparado el trabajo, pero no confirma ni modifica el pedido sin autorización.</div></div>';
    if(t==='crm')return '<div class="vnx-ah-crm-preview"><div><small>OPORTUNIDAD</small><b>[Cliente / empresa]</b><span>Etapa: seguimiento</span></div><div class="vnx-ah-next-action"><small>SIGUIENTE ACCIÓN PREPARADA</small><b>Retomar contacto con contexto</b><p>Resumen del historial disponible + propuesta de mensaje + fecha sugerida de seguimiento.</p></div></div>';
    if(t==='content')return '<div class="vnx-ah-content-preview"><small>PUBLICACIÓN PREPARADA</small><h3>[Título adaptado al canal]</h3><p>Texto claro, profesional y centrado en el beneficio real de tu producto o servicio.</p><div class="vnx-ah-content-visual">Vista previa de creatividad</div><div class="vnx-ah-hashtags">#TuMarca · #TuSector · #TuProducto</div></div>';
    if(t==='campaign')return '<div class="vnx-ah-campaign-preview"><div><small>OBJETIVO</small><b>Captar oportunidades cualificadas</b></div><div class="vnx-ah-campaign-grid"><span>1 · Público</span><span>2 · Mensaje</span><span>3 · Canal</span><span>4 · Seguimiento</span></div><p>La IA prepara el plan y tú decides qué acciones se activan.</p></div>';
    if(t==='document')return '<div class="vnx-ah-doc-preview"><div class="vnx-ah-doc-sheet"><b>PDF</b><span>Documento autorizado</span></div><div><small>ANÁLISIS PREPARADO</small><h3>Qué contiene</h3><p>Resumen basado exclusivamente en el archivo.</p><h3>Puntos importantes</h3><p>Datos, riesgos, fechas o conclusiones localizadas.</p><h3>Qué puedo hacer después</h3><p>Acciones concretas que VentaNexIA puede preparar.</p></div></div>';
    if(t==='agenda')return '<div class="vnx-ah-agenda-preview"><div><time>09:30</time><span><b>Reunión de equipo</b><small>Objetivo y asuntos preparados</small></span></div><div><time>12:00</time><span><b>Reunión con cliente</b><small>Contexto, pedidos y siguientes pasos</small></span></div><div><time>16:30</time><span><b>Seguimiento</b><small>Acciones pendientes</small></span></div></div>';
    if(t==='report')return '<div class="vnx-ah-report-preview"><div class="vnx-ah-kpis"><span><small>VENTAS</small><b>—</b></span><span><small>PEDIDOS</small><b>—</b></span><span><small>CLIENTES</small><b>—</b></span></div><h3>Conclusiones</h3><p>Los valores aparecen cuando Carla lee una fuente real. No se muestran cifras inventadas.</p><div class="vnx-ah-report-chart"><i></i><i></i><i></i><i></i><i></i></div></div>';
    if(t==='automation')return '<div class="vnx-ah-flow-preview"><div><span>1</span><b>Cuando ocurra…</b><small>Disparador definido por ti</small></div><i>→</i><div><span>2</span><b>Carla prepara…</b><small>Acción permitida</small></div><i>→</i><div><span>3</span><b>Tú autorizas</b><small>Cuando la acción lo requiera</small></div></div>';
    return '<div class="vnx-ah-priority-preview"><div><span>1</span><b>Lo urgente</b><small>Lo que necesita atención hoy</small></div><div><span>2</span><b>Lo que Carla puede adelantar</b><small>Trabajo preparado para revisar</small></div><div><span>3</span><b>Lo que necesita tu decisión</b><small>Nada importante se decide por ti</small></div></div>';
  }
  function renderChips(cfg){
    return cfg.chips.map((x,i)=>'<button type="button" class="vnx-ah-chip '+(i===0?'active':'')+'">'+esc(x)+'</button>').join('');
  }
  function renderCapabilities(cfg){
    return cfg.capabilities.map(x=>'<li><span>✓</span>'+esc(x)+'</li>').join('');
  }
  function renderTabs(cfg){
    return cfg.tabs.map((x,i)=>'<button type="button" class="'+(i===1&&cfg===configs.prospecting?'active':i===0?'active':'')+'">'+esc(x)+'</button>').join('');
  }
  function renderRecipients(cfg){
    const rows=cfg.previewType==='email'
      ?['Empresa / contacto 1','Empresa / contacto 2','Empresa / contacto 3','Empresa / contacto 4','Empresa / contacto 5']
      :['Trabajo preparado 1','Trabajo preparado 2','Trabajo preparado 3','Trabajo preparado 4'];
    return rows.map((x,i)=>'<div><span class="vnx-ah-recipient-icon">'+(cfg.icon||'•')+'</span><p><b>'+esc(x)+'</b><small>'+esc(cfg.crumb.split('›').pop().trim())+'</small></p><em>'+(i<2?'Listo':'Pendiente')+'</em></div>').join('');
  }
  function agentScreenUi(key){
    const commonAction=['Dejarlo preparado para revisar','Ejecutar solo lo que tenga autorización','Preparar y avisarme','Solo generar, sin ejecutar'];
    const map={
      core_ai:{configTitle:'1. Define el foco',configSub:'Elige qué quieres priorizar y qué puede adelantar Carla.',sourceTabs:['Fuentes conectadas','Prioridades','Pendientes'],filters:[['Periodo',['Hoy','Esta semana','Este mes']],['Área',['Todas','Correo','Pedidos','Stock','Clientes']],['Prioridad',['Todas','Urgente','Importante','Normal']]],showStyle:false,showLanguage:false,showBrand:false,styleLabel:'Estilo del trabajo',frequency:['Una vez','Cada día','Cada semana','Personalizada'],actions:commonAction,previewActions:['↻ Recalcular prioridades','✦ Ajustar criterio','▧ Guardar enfoque'],switches:['Preparar ahora','Programar revisión','Avisarme al terminar'],itemDefault:'Contexto o asunto'},
      email:{configTitle:'1. Configura la revisión',configSub:'Define qué correos revisar y cómo quieres que Carla prepare las respuestas.',sourceTabs:['Bandeja conectada','Necesitan respuesta','Buscar correo'],filters:[['Cuenta',['Todas las cuentas','Cuenta seleccionada']],['Estado',['Todos','Sin leer','Necesita respuesta','Informativo']],['Fecha',['Hoy','Últimas 24 h','7 días','30 días']]],showStyle:true,showLanguage:true,showBrand:true,styleLabel:'Estilo de la respuesta',frequency:['Cada día (recomendado)','Una vez','Cada hora','Personalizada'],actions:['Dejar respuesta en borrador','Crear borrador solo con autorización','Preparar y avisarme','Solo clasificar, sin redactar'],previewActions:['↻ Redactar otro enfoque','✦ Ajustar respuesta','▧ Guardar como plantilla'],switches:['Revisar ahora','Programar','Dejar en borrador'],itemDefault:'Cuenta o asunto'},
      orders:{configTitle:'1. Define qué pedidos revisar',configSub:'Filtra pedidos y decide qué puede preparar Carla antes de que los confirmes.',sourceTabs:['Pedidos conectados','Incidencias','Importar Excel/CSV'],filters:[['Estado',['Todos','Nuevos','Pendientes','Incompletos','Preparados']],['Fecha',['Hoy','7 días','30 días']],['Canal',['Todos','Tienda online','Email','Portal','Archivo']]],showStyle:false,showLanguage:false,showBrand:false,styleLabel:'Estilo',frequency:['Cada día','Cada hora','Una vez','Personalizada'],actions:['Dejar pedidos preparados','Procesar solo los autorizados','Preparar y avisarme','Solo detectar incidencias'],previewActions:['↻ Volver a comprobar','✦ Ajustar pedido','▧ Exportar / guardar'],switches:['Revisar nuevos','Programar revisión','Dejar preparados'],itemDefault:'Pedido o referencia'},
      web_ecommerce:{configTitle:'1. Define el análisis de stock',configSub:'Elige qué productos revisar y el criterio de reposición que quieres controlar.',sourceTabs:['Stock actual','Ventas 6 meses','Importar Excel/CSV'],filters:[['Estado',['Todos','Sin stock','< 5 días','Bajo stock','Exceso']],['Fabricante',['Todos los fabricantes','Fabricante seleccionado']],['Cobertura',['Todas','0 días','< 5 días','< 20 días','≥ 20 días']]],showStyle:false,showLanguage:false,showBrand:false,styleLabel:'Estilo',frequency:['Cada día','Cada semana','Una vez','Personalizada'],actions:['Dejar propuesta de compra para revisar','Generar pedido solo con autorización','Preparar y avisarme','Solo analizar, sin generar pedido'],previewActions:['↻ Recalcular stock','✦ Ajustar cobertura','▧ Exportar pedido'],switches:['Calcular ahora','Programar revisión','Dejar como propuesta'],itemDefault:'Producto, SKU o familia'},
      crm:{configTitle:'1. Define el seguimiento comercial',configSub:'Elige clientes u oportunidades y cómo quieres preparar la siguiente acción.',sourceTabs:['Clientes conectados','Oportunidades','Importar Excel/CSV'],filters:[['Estado',['Todos','Nuevo','Seguimiento','Oferta','Negociación','Ganado']],['Responsable',['Todos','Yo','Sin responsable']],['Actividad',['Hoy','7 días','30 días','Sin actividad']]],showStyle:true,showLanguage:true,showBrand:false,styleLabel:'Estilo comercial',frequency:['Cada día','Cada semana','Una vez','Personalizada'],actions:commonAction,previewActions:['↻ Otra propuesta','✦ Ajustar seguimiento','▧ Guardar plantilla'],switches:['Preparar ahora','Programar','Dejar borrador'],itemDefault:'Cliente u oportunidad'},
      prospecting:{configTitle:'1. Configura tu estrategia',configSub:'Define qué vendes, a qué tipo de cliente quieres llegar y con qué marca.',sourceTabs:['Mis listas','Buscar con IA','Desde archivo (Excel/CSV)'],filters:[['Ubicación',['Toda España','Barcelona','Madrid','Valencia']],{label:'Tipo de cliente / sector objetivo',type:'text',placeholder:'Ej.: hospitales, clínicas, geriátricos, farmacias, herbolarios…'},['Tamaño',['Todos','Pequeña','Mediana','Grande']]],showStyle:true,showLanguage:true,showBrand:true,styleLabel:'Estilo del trabajo',frequency:['Cada día (recomendado)','Una vez','Cada semana','Personalizada'],actions:commonAction,previewActions:['↻ Regenerar con otro enfoque','✦ Ajustar para este caso','▧ Guardar como plantilla'],switches:['Ejecutar hoy','Programar','Dejar en borrador'],itemDefault:'Tu producto o servicio'},
      content:{configTitle:'1. Define qué contenido crear',configSub:'Indica tema, marca, canal y tono antes de generar la pieza.',sourceTabs:['Ideas','Contenido de marca','Desde archivo'],filters:[['Canal',['Todos','Blog','LinkedIn','Instagram','Email']],['Formato',['Todos','Texto corto','Artículo','Ficha producto','Landing']],['Estado',['Todos','Idea','Borrador','Aprobado']]],showStyle:true,showLanguage:true,showBrand:true,styleLabel:'Tono del contenido',frequency:['Una vez','Cada semana','Cada día','Personalizada'],actions:['Dejar contenido para revisar','Preparar solo lo autorizado','Preparar y avisarme','Solo generar ideas'],previewActions:['↻ Crear otra versión','✦ Ajustar contenido','▧ Guardar como plantilla'],switches:['Generar ahora','Programar','Dejar borrador'],itemDefault:'Producto, servicio o tema'},
      social:{configTitle:'1. Configura la publicación',configSub:'Elige red, marca, tema y estilo antes de preparar las publicaciones.',sourceTabs:['Calendario','Publicaciones','Creatividades'],filters:[['Red',['Todas','LinkedIn','Instagram','Facebook','X']],['Estado',['Todos','Borrador','Pendiente','Aprobado']],['Fecha',['Hoy','Esta semana','Este mes']]],showStyle:true,showLanguage:true,showBrand:true,styleLabel:'Tono de la publicación',frequency:['Cada semana','Cada día','Una vez','Personalizada'],actions:['Dejar publicaciones para revisar','Publicar solo con autorización','Preparar y avisarme','Solo generar borradores'],previewActions:['↻ Crear otra versión','✦ Adaptar a esta red','▧ Guardar como plantilla'],switches:['Preparar ahora','Programar','Dejar borrador'],itemDefault:'Campaña o tema'},
      campaigns:{configTitle:'1. Define la campaña',configSub:'Marca, objetivo, audiencia y canales quedan separados antes de generar acciones.',sourceTabs:['Campañas','Audiencias','Desde archivo'],filters:[['Canal',['Todos','Email','LinkedIn','Instagram','Web']],['Audiencia',['Todas','Clientes','Prospectos','Inactivos']],['Estado',['Todos','Diseño','Activa','Pausada','Finalizada']]],showStyle:true,showLanguage:true,showBrand:true,styleLabel:'Estilo de campaña',frequency:['Una vez','Cada semana','Mensual','Personalizada'],actions:commonAction,previewActions:['↻ Otro enfoque','✦ Ajustar campaña','▧ Guardar plantilla'],switches:['Preparar ahora','Programar','Dejar borrador'],itemDefault:'Producto o campaña'},
      administration:{configTitle:'1. Define el trabajo documental',configSub:'Selecciona qué archivo analizar y qué resultado necesitas.',sourceTabs:['Archivos autorizados','Documentos recientes','Seleccionar archivo'],filters:[['Tipo',['Todos','PDF','Excel','Word','Imagen']],['Fecha',['Hoy','7 días','30 días','Todos']],['Origen',['Todas las carpetas','Carpeta seleccionada','Archivo seleccionado']]],showStyle:false,showLanguage:true,showBrand:false,styleLabel:'Estilo',frequency:['Una vez','Cada día','Cada semana','Personalizada'],actions:['Dejar análisis para revisar','Procesar solo lo autorizado','Preparar y avisarme','Solo extraer datos'],previewActions:['↻ Reanalizar','✦ Ajustar extracción','▧ Exportar resultado'],switches:['Analizar ahora','Programar','Guardar resultado'],itemDefault:'Archivo o instrucción'},
      agenda:{configTitle:'1. Elige las reuniones',configSub:'Define periodo y tipo de reunión para que Carla prepare el contexto.',sourceTabs:['Agenda conectada','Reuniones de hoy','Pendientes'],filters:[['Periodo',['Hoy','Mañana','Esta semana','Este mes']],['Tipo',['Todas','Clientes','Internas','Seguimiento']],['Estado',['Todas','Confirmada','Pendiente','Realizada']]],showStyle:false,showLanguage:false,showBrand:false,styleLabel:'Estilo',frequency:['Cada día','Una vez','Cada semana','Personalizada'],actions:['Dejar preparación para revisar','Crear recordatorios autorizados','Preparar y avisarme','Solo resumir agenda'],previewActions:['↻ Actualizar contexto','✦ Ajustar preparación','▧ Guardar notas'],switches:['Preparar hoy','Programar','Avisarme'],itemDefault:'Reunión o persona'},
      reports:{configTitle:'1. Define qué quieres medir',configSub:'Selecciona área, periodo y comparación antes de generar el informe.',sourceTabs:['Datos conectados','Comparativas','Importar Excel/CSV'],filters:[['Área',['Todas','Ventas','Clientes','Stock','Pedidos']],['Periodo',['Hoy','Este mes','Mes anterior','Este año']],['Comparación',['Sin comparar','Periodo anterior','Año anterior']]],showStyle:false,showLanguage:true,showBrand:false,styleLabel:'Estilo',frequency:['Una vez','Cada semana','Cada mes','Personalizada'],actions:['Dejar informe para revisar','Generar solo con autorización','Preparar y avisarme','Solo calcular indicadores'],previewActions:['↻ Actualizar informe','✦ Ajustar comparación','▧ Exportar informe'],switches:['Generar ahora','Programar','Guardar informe'],itemDefault:'Periodo o pregunta'},
      automation:{configTitle:'1. Define la automatización',configSub:'Elige módulo, disparador y nivel de autorización antes de activarla.',sourceTabs:['Flujos','Disparadores','Historial'],filters:[['Módulo',['Todos','Correo','Pedidos','Stock','Clientes','Informes']],['Estado',['Todos','Borrador','Activo','Pausado']],['Frecuencia',['Todas','Horaria','Diaria','Semanal','Mensual']]],showStyle:false,showLanguage:false,showBrand:false,styleLabel:'Estilo',frequency:['Cada hora','Cada día','Cada semana','Personalizada'],actions:['Dejar flujo para revisar','Activar solo tras autorización','Preparar y avisarme','Solo diseñar el flujo'],previewActions:['↻ Rediseñar flujo','✦ Ajustar pasos','▧ Guardar como plantilla'],switches:['Activar autorizado','Programar','Dejar en borrador'],itemDefault:'Tarea repetitiva'}
    };
    return map[key]||map.core_ai;
  }
  function renderFilterField(field){
    if(field&&typeof field==='object'&&!Array.isArray(field)){
      const label=field.label||'Filtro';
      if(field.type==='text')return '<label><small>'+esc(label)+'</small><input type="text" data-vnx-filter-text="'+esc(label)+'" placeholder="'+esc(field.placeholder||'Escribe aquí…')+'"></label>';
    }
    const label=field?.[0]||'Filtro',options=Array.isArray(field?.[1])?field[1]:['Todos'];
    return '<label><small>'+esc(label)+'</small><select>'+options.map(x=>'<option>'+esc(x)+'</option>').join('')+'</select></label>';
  }
  function applyAgentScreenUi(key,cfg){
    const ui=agentScreenUi(key);
    const configTitle=$('#vnxAhConfigTitle'),configSub=$('#vnxAhConfigSub');
    if(configTitle)configTitle.textContent=ui.configTitle;if(configSub)configSub.textContent=ui.configSub;
    const style=$('#vnxAhStyleField'),language=$('#vnxAhLanguageField'),brandToggle=$('#vnxAhBrandToggle'),brandPreview=$('#vnxAhBrandPreview');
    if(style)style.style.display=ui.showStyle?'':'none';if(language)language.style.display=ui.showLanguage?'':'none';
    if(brandToggle)brandToggle.style.display=ui.showBrand?'':'none';if(brandPreview)brandPreview.style.display=ui.showBrand?'':'none';
    const styleLabel=$('#vnxAhStyleLabel');if(styleLabel)styleLabel.textContent=ui.styleLabel||'Estilo del trabajo';
    const frequency=$('#vnxAhFrequencySelect');if(frequency)frequency.innerHTML=(ui.frequency||[]).map(x=>'<option>'+esc(x)+'</option>').join('');
    const radios=$('#vnxAhActionRadios');if(radios)radios.innerHTML=(ui.actions||[]).map((x,i)=>'<label><input type="radio" name="ahAction"'+(i===0?' checked':'')+'> '+esc(x)+'</label>').join('');
    const sourceTabs=$('#vnxAhSourceTabs');if(sourceTabs)sourceTabs.innerHTML=(ui.sourceTabs||[]).map((x,i)=>'<button type="button" class="'+(i===0?'active':'')+'">'+esc(x)+'</button>').join('');
    const filters=$('#vnxAhFilters');if(filters)filters.innerHTML=(ui.filters||[]).map(renderFilterField).join('')+'<button type="button" id="vnxAhMoreFilters">✦ Más filtros</button>';
    renderStockPolicyUi();
    restoreProspectProfile();
    const previewActions=$('#vnxAhPreviewActions button');(ui.previewActions||[]).forEach((x,i)=>{if(previewActions[i])previewActions[i].textContent=x});
    const switches=$('#vnxAhSwitches label span');(ui.switches||[]).forEach((x,i)=>{if(switches[i])switches[i].textContent=x});
    const items=$('#vnxAhItems');if(items)items.innerHTML='<span class="vnx-ah-tag">'+esc(ui.itemDefault||cfg.itemLabel||'Contexto')+' <button type="button" class="vnx-ah-remove-tag">×</button></span>';
    document.querySelectorAll('#vnxAhItems .vnx-ah-remove-tag').forEach(b=>b.addEventListener('click',()=>b.parentElement?.remove()));
    applyBusinessAgentDefaults(key);
    document.querySelectorAll('#vnxAhSourceTabs button').forEach(btn=>btn.addEventListener('click',()=>{
      document.querySelectorAll('#vnxAhSourceTabs button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
      const label=String(btn.textContent||'').trim();
      if(/archivo|excel|csv|documento/i.test(label)){openAppTab('files');return}
      const input=$('#vnxAhSearchInput');if(input){input.focus();input.select?.()}
    }));
    $('#vnxAhMoreFilters')?.addEventListener('click',()=>{const first=$('#vnxAhFilters select');if(first)first.focus()});
  }

  function applyConfig(key){
    const cfg=cfgFor(key);
    document.body.dataset.vnxHomeAgent=key;
    applyAgentScreenUi(key,cfg);
    $('#vnxAhBreadcrumb').textContent=cfg.crumb;
    $('#vnxAhAgentIcon').textContent=cfg.icon;
    $('#vnxAhAgentTitle').textContent=cfg.title;
    $('#vnxAhAgentSubtitle').textContent=cfg.subtitle;
    $('#vnxAhCarlaHelp').textContent=cfg.help;
    $('#vnxAhCapabilities').innerHTML=renderCapabilities(cfg);
    $('#vnxAhTabs').innerHTML=renderTabs(cfg);
    $('#vnxAhObjectiveLabel').textContent=cfg.objective;
    $('#vnxAhChips').innerHTML=renderChips(cfg);
    $('#vnxAhItemLabel').textContent=cfg.itemLabel;
    $('#vnxAhItemInput').placeholder=cfg.itemPlaceholder;
    const brandBlock=$('#vnxAhBrandBlock');if(brandBlock)brandBlock.style.display=['prospecting','content','social','campaigns'].includes(key)?'block':'none';
    const orderBtn=$('#vnxAhGenerateOrder');if(orderBtn)orderBtn.style.display=key==='web_ecommerce'?'':'none';
    $('#vnxAhSearchTitle').textContent=cfg.searchTitle;
    $('#vnxAhSearchSub').textContent=cfg.searchSub;
    $('#vnxAhSearchInput').placeholder=cfg.searchPlaceholder;
    $('#vnxAhSearchBtn').textContent=cfg.searchButton;
    $('#vnxAhPreviewTitle').textContent=cfg.previewTitle;
    $('#vnxAhPreviewSub').textContent=cfg.previewSub;
    $('#vnxAhPreview').innerHTML=previewHtml(cfg);
    $('#vnxAhPrimary').textContent=cfg.action;
    $('#vnxAhMetricLabel').textContent=cfg.metric;
    $('#vnxAhReviewLabel').textContent=cfg.review;
    $('#vnxAhCtaTitle').textContent=cfg.cta;
    $('#vnxAhCtaText').textContent=cfg.ctaText;
    $('#vnxAhRecipients').innerHTML=renderRecipients(cfg);
    $('#vnxAhMetricValue').textContent='—';
    $('#vnxAhReviewValue').textContent='—';
    $$('.vnx-agent-side-btn').forEach(b=>b.classList.toggle('active',b.dataset.agentHome===key));
    const homeNav=$('.nav[data-tab="home"]');if(homeNav)homeNav.classList.toggle('active',key==='core_ai');
    $$('#vnxAhTabs button').forEach((b,index)=>b.addEventListener('click',()=>{
      $$('#vnxAhTabs button').forEach(x=>x.classList.remove('active'));b.classList.add('active');
      const label=String(b.textContent||'').trim(),key=document.body.dataset.vnxHomeAgent||'prospecting',cfg=cfgFor(key);
      if(index===0)return;
      if(key==='orders'){
        if(/nuevo/i.test(label)){runOrdersReview('pedidos nuevos');return}
        if(/pendiente/i.test(label)){runOrdersReview('pedidos pendientes');return}
        if(/preparado|listo/i.test(label)){runOrdersReview('pedidos preparados');return}
        if(/incidencia/i.test(label)){runOrdersReview('incidencias');return}
        if(/resultado/i.test(label)&&lastOrdersRun){renderOrdersResult(lastOrdersRun,$('#vnxAhSearchInput')?.value||'');return}
      }
      if(/buscar|localiza|selecciona/i.test(label)){const q=$('#vnxAhSearchInput');if(q){q.focus();q.select?.()}return}
      if(/lista|archivo|document/i.test(label)&&!/an[aá]lisis/i.test(label)){openAppTab('files');return}
      if(/campa[nñ]a/i.test(label)&&key!=='campaigns'){applyConfig('campaigns');return}
      if(/agenda|reuni[oó]n/i.test(label)&&key!=='agenda'){applyConfig('agenda');return}
      const prompt='Quiero trabajar en la sección “'+label+'” de '+cfg.title+'. Usa solo datos reales de mis conexiones autorizadas y muéstrame o prepara lo correspondiente.';
      openWorkbench(key,prompt,false);
    }));
    document.querySelectorAll('#vnxAhChips .vnx-ah-chip').forEach(b=>b.addEventListener('click',()=>b.classList.toggle('active')));
    try{localStorage.setItem('vnx_agent_home_key',key)}catch{}
  }
  function openAppTab(name){
    const nav=$('.nav[data-tab="'+name+'"]');
    if(nav){nav.click();return true}
    $$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
    $$('.tab').forEach(x=>x.classList.toggle('active',x.id===name));
    return Boolean($('#'+name));
  }
  function selectAgentInWorkbench(chatKey){
    const sel=$('#chatConnectionSelect');
    if(!sel)return false;
    const wanted=String(chatKey||'').trim();
    const opt=[...sel.options].find(o=>{
      const v=String(o.value||'');
      return v===wanted||v==='agent:'+wanted||v.startsWith('agent:'+wanted+':');
    });
    if(!opt)return false;
    sel.value=opt.value;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  function openWorkbench(key,prompt='',guided=false){
    const cfg=cfgFor(key),finalPrompt=promptWithHomeContext(key,prompt);
    openAppTab('chat');
    setTimeout(()=>{
      selectAgentInWorkbench(cfg.chatKey||alias[key]||key);
      selectHomeSourceInWorkbench();
      const mode=guided?$('#guidedModeBtn'):$('#freeModeBtn');if(mode)mode.click();
      const input=$('#chatInput');if(input&&finalPrompt){input.value=finalPrompt;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus()}
    },180);
  }
  function reconcileSourceWithBusiness(event){
    const profile=window.vnxBusiness?.activeProfile?.(),current=selectedHomeSource();
    if(!profile){return}
    const refs=new Set(profile.connectionRefs||[]);
    if(event?.detail?.changed&&current){
      const ref=(current.type==='portal'?'portal:':'connection:')+String(current.id||'');
      if(!refs.size||!refs.has(ref)){
        try{localStorage.removeItem(HOME_SOURCE_KEY)}catch{}
      }
    }
    const mirror=$('#vnxAhCompanyName');if(mirror)mirror.textContent=companyName();
    renderStockPolicyUi();restoreProspectProfile();applyBusinessAgentDefaults(document.body.dataset.vnxHomeAgent||'core_ai');
  }
  window.addEventListener('vnx-business-changed',reconcileSourceWithBusiness);

  function bind(){
    document.querySelectorAll('.vnx-agent-side-btn').forEach(btn=>btn.addEventListener('click',()=>{
      openAppTab('home');
      applyConfig(btn.dataset.agentHome);
    }));
    $$('.vnx-main-nav .nav').forEach(btn=>btn.addEventListener('click',()=>{
      if(btn.dataset.tab==='home'){applyConfig('core_ai');return}
      $$('.vnx-agent-side-btn').forEach(x=>x.classList.remove('active'));
    }));
    $('#vnxAhSearchBtn')?.addEventListener('click',()=>{
      const key=document.body.dataset.vnxHomeAgent||'prospecting';
      if(key==='orders'){runOrdersReview();return}
      if(key==='web_ecommerce'){runStockAnalysis(false);return}
      const cfg=cfgFor(key),q=$('#vnxAhSearchInput')?.value?.trim();
      openWorkbench(key,q||cfg.primaryPrompt,false);
    });
    $('#vnxAhGenerateOrder')?.addEventListener('click',()=>runStockAnalysis(true));
    $('#vnxAhSearchInput')?.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();$('#vnxAhSearchBtn')?.click()}
    });
    const runPrimary=()=>{const key=document.body.dataset.vnxHomeAgent||'prospecting';if(key==='orders'){runOrdersReview('pedidos preparados');return}if(key==='web_ecommerce'){runStockAnalysis(true);return}openWorkbench(key,cfgFor(key).primaryPrompt,true)};
    $('#vnxAhPrimary')?.addEventListener('click',runPrimary);
    $('#vnxAhPrimaryMirror')?.addEventListener('click',runPrimary);
    $$('.vnx-ah-preview-actions button').forEach((b,i)=>b.addEventListener('click',()=>{const key=document.body.dataset.vnxHomeAgent||'prospecting';const cfg=cfgFor(key);const prompts=['Regenera este trabajo con otro enfoque manteniendo los datos reales y sin inventar.','Quiero ajustar este trabajo para un caso concreto. Pregúntame solo lo imprescindible.','Ayúdame a guardar este enfoque como plantilla reutilizable.'];openWorkbench(key,prompts[i]||cfg.primaryPrompt,false)}));
    $('#vnxAhCtaBtn')?.addEventListener('click',()=>{
      const key=document.body.dataset.vnxHomeAgent||'automation';
      openWorkbench(key,'Quiero automatizar esta tarea. Ayúdame a definir frecuencia, permisos, pasos y qué debo autorizar.',true);
    });
    $$('.vnx-ah-remove-tag').forEach(b=>b.addEventListener('click',()=>b.parentElement?.remove()));
    $('#vnxAhAddItem')?.addEventListener('click',()=>{
      const input=$('#vnxAhItemInput'),v=input?.value?.trim();if(!v)return;
      const box=$('#vnxAhItems');
      const chip=document.createElement('span');chip.className='vnx-ah-tag';chip.innerHTML=esc(v)+' <button type="button" class="vnx-ah-remove-tag">×</button>';
      chip.querySelector('button').addEventListener('click',()=>chip.remove());box?.appendChild(chip);input.value='';
    });
    $('#vnxAhItemInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#vnxAhAddItem')?.click()}});
    $('#vnxAhAddBrand')?.addEventListener('click',()=>{const input=$('#vnxAhBrandInput'),v=input?.value?.trim();if(!v)return;const box=$('#vnxAhBrands'),existing=tagTexts('#vnxAhBrands');if(existing.some(x=>normalizedText(x)===normalizedText(v))){input.value='';return}const chip=document.createElement('span');chip.className='vnx-ah-tag';chip.innerHTML=esc(v)+' <button type="button" class="vnx-ah-remove-brand">×</button>';chip.querySelector('button').addEventListener('click',()=>chip.remove());box?.appendChild(chip);input.value=''});
    $('#vnxAhBrandInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#vnxAhAddBrand')?.click()}});
    $('#vnxAhCompanyBtn')?.addEventListener('click',toggleCompanyMenu);
    $('#vnxAhBell')?.addEventListener('click',()=>openAppTab('activity'));
    $('#vnxAhAccount')?.addEventListener('click',()=>openAppTab('license'));
    $('.vnx-ah-brand-preview>button')?.addEventListener('click',()=>openAppTab('license'));
    $('.vnx-ah-see-all')?.addEventListener('click',()=>{const key=document.body.dataset.vnxHomeAgent||'prospecting';openWorkbench(key,cfgFor(key).primaryPrompt,false)});
    const quick=$('#vnxAhGlobalInput'),send=$('#vnxAhGlobalSend');
    const globalSend=()=>{
      const q=quick?.value?.trim();if(!q)return;
      const current=document.body.dataset.vnxHomeAgent||'core_ai',key=agentKeyForRequest(q,current);
      if(key!==current)applyConfig(key);
      openWorkbench(key,q,false);
    };
    if(send)send.addEventListener('click',globalSend);
    if(quick)quick.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();globalSend()}});
  }
  function syncCompany(){
    const mirror=$('#vnxAhCompanyName'),source=$('#homeCompanyName'),paint=()=>{const selected=selectedHomeSource();if(mirror)mirror.textContent=selected?.label||companyName()};
    paint();if(source&&window.MutationObserver)new MutationObserver(paint).observe(source,{childList:true,subtree:true,characterData:true});
  }
  function start(){
    const saved=(()=>{try{return localStorage.getItem('vnx_agent_home_key')}catch{return null}})();
    applyConfig(configs[saved]?saved:'prospecting');
    bind();
    syncCompany();
    window.vnxAgentHome={open:(key)=>{const k=configs[key]?key:'core_ai';openAppTab('home');applyConfig(k)},openWorkbench};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();