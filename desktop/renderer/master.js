// VentaNexIA Desktop 0.6.80 · Gmail quota-safe · OCR local
(()=>{
  const $m=s=>document.querySelector(s),$$m=s=>[...document.querySelectorAll(s)];
  const escM=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let masterPortals=[];
  let masterMessages=[];
  const CHAT_STATE_KEY='vnx_master_chat_state_v1';
  const CHAT_DRAFT_KEY='vnx_master_chat_draft_v1';
  const CHAT_CLEAR_ON_EXIT_KEY='vnx_master_chat_clear_on_exit';
  let restoringChatState=false;
  function serializableMessages(list=masterMessages){
    return (list||[]).slice(-50).map(m=>({
      role:m.role,content:m.content,images:Array.isArray(m.images)?m.images.slice(0,8):[],
      emailActions:m.emailActions||null,emailActionGroups:Array.isArray(m.emailActionGroups)?m.emailActionGroups.slice(0,12):[],handoff:m.handoff||null,secretaryActions:Boolean(m.secretaryActions),
      handoffInternal:Boolean(m.handoffInternal),scopeKey:m.scopeKey||null,purchaseExport:Boolean(m.purchaseExport),purchaseData:m.purchaseData||null
    }));
  }
  function persistMasterChatState(){
    if(restoringChatState)return;
    try{localStorage.setItem(CHAT_STATE_KEY,JSON.stringify({at:Date.now(),messages:serializableMessages()}))}catch{}
  }
  function loadMasterChatState(){
    try{
      const raw=JSON.parse(localStorage.getItem(CHAT_STATE_KEY)||'null');
      if(raw&&Array.isArray(raw.messages))masterMessages=raw.messages.slice(-50);
    }catch{}
  }
  function persistChatDraft(){
    const input=$m('#chatInput');if(!input)return;
    try{localStorage.setItem(CHAT_DRAFT_KEY,input.value||'')}catch{}
  }
  function loadChatDraft(){
    const input=ensureChatInputEditable();if(!input)return;
    try{const v=localStorage.getItem(CHAT_DRAFT_KEY);if(v!=null&&!input.value)input.value=v}catch{}
  }
  function clearPersistedChat(){
    try{localStorage.removeItem(CHAT_STATE_KEY);localStorage.removeItem(CHAT_DRAFT_KEY)}catch{}
  }
  let handoffAgentChange=false;
  let runtimeConnections=[];
  let runtimeAgents=[];
  let runtimeExternalAgents=[];
  let agentMetrics={};
  const AGENT_INPUT_EXAMPLES={
    core_ai:'Ej.: prepárame el día · ¿qué tengo pendiente? · dime por dónde empiezo · ¿qué puedes adelantar por mí?',
    email:'Ej.: revisa mis correos de hoy, dime cuáles necesitan respuesta, prepara la contestación y crea un borrador en Gmail',
    whatsapp:'Ej.: prepara una respuesta para este cliente y déjamela lista para autorizar antes de enviarla',
    prospecting:'Ej.: busca 10 clínicas en Barcelona que puedan comprar portasueros · después: prepara los emails · envía los emails · seguimiento',
    crm:'Ej.: qué oportunidades debo seguir hoy, prepara un plan comercial o revisa los clientes conectados',
    customer_service:'Ej.: qué consultas necesitan respuesta, prepara una respuesta o crea un guion para atender una llamada',
    quotes:'Ej.: prepara una propuesta para una clínica con 5 portasueros y 2 mesas Mayo',
    orders:'Ej.: revisa los pedidos recibidos por email o portal y prepara su alta en el programa de gestión',
    social:'Ej.: crea una campaña para Instagram y LinkedIn y mejora la visibilidad en Google de la página del producto',
    web_ecommerce:'Ej.: analiza stock y ventas por producto, calcula reposición mínima y déjame el Excel listo para Compras',
    administration:'Ej.: revisa facturas vencidas, prepara reclamaciones de cobro, comprueba confirmaciones de proveedores y organiza mis tareas de esta semana',
    reports:'Ej.: compara este mes con el anterior y prepara un informe de ventas con conclusiones',
    automation:'Ej.: crea un flujo para avisarme de nuevos pedidos y dime qué tareas repetitivas podemos hacer automáticamente'
  };
  const GUIDED_AGENT_FORMS={
    core_ai:{
      subtitle:'Tu secretaria ejecutiva: revisa la empresa, te organiza el día y te deja preparado el trabajo que puede adelantar.',
      primary:'☀️ Prepárame el día',
      fields:[
        {key:'task',label:'¿QUÉ QUIERES QUE REVISE?',type:'select',options:['Prepárame el día','Dime qué tengo pendiente','Dime por dónde empezar','Dime qué puedes adelantar por mí','Prepárame una reunión','Analiza stock y prepara reposición','Prepárame lo que tengo que autorizar','Hazme el cierre del día','Otra consulta']},
        {key:'focus',label:'¿ALGUNA PRIORIDAD?',type:'text',wide:true,placeholder:'Opcional. Ej. pedidos, clientes importantes, cobros o una reunión'},
        {key:'context',label:'ALGO QUE DEBA SABER',type:'textarea',wide:true,placeholder:'Opcional. Añade una condición o asunto especial para hoy'}
      ],
      capabilities:['Revisar desde un solo sitio Email, Pedidos, Ventas y clientes, Shopify, WhatsApp, Redes y demás conexiones permitidas','Separar lo que puede adelantar, lo que deja preparado para autorizar y lo que requiere tu decisión','Analizar stock frente a ventas/pedidos y preparar reposición para Compras','Preparar dossiers de reuniones cruzando agenda, cliente, pedidos, facturación y emails disponibles','Recomendarte por dónde empezar según urgencia e impacto','Prepararte respuestas, seguimientos y trabajo para que solo tengas que revisar y aprobar','Avisarte de correos nuevos que realmente necesitan atención','Indicar qué fuente falta conectar en vez de inventar datos'],
      steps:['Revisar','Priorizar','Adelantar']
    },
    email:{
      subtitle:'Lee, organiza y prepara respuestas de tu correo conectado.',
      primary:'✉️ Revisar correo',
      fields:[
        {key:'task',label:'¿QUÉ QUIERES HACER?',type:'select',options:['Ver los últimos correos','Ver los correos de hoy','Ver cuáles necesitan respuesta','Traducir correos recibidos','Preparar una respuesta','Pedir datos que faltan','Crear borrador en Gmail','Archivar o marcar un correo','Otra gestión']},
        {key:'translation',label:'SI EL CORREO ESTÁ EN OTRO IDIOMA',type:'select',options:['Traducirlo automáticamente al idioma elegido','Mostrar original y traducción','No traducir']},
        {key:'language',label:'IDIOMA EN EL QUE QUIERO LEERLO',type:'select',options:['Español','Català','English','Français','Deutsch','Italiano','Português']},
        {key:'target',label:'¿DE QUÉ CORREO?',type:'text',wide:true,placeholder:'Opcional. Ej. correo de Marta, asunto pedido 301, primer correo'},
        {key:'instruction',label:'¿QUÉ QUIERES QUE RESPONDA O PIDA?',type:'textarea',wide:true,placeholder:'Ej. agradecer el mensaje y pedir dirección de entrega y CIF'},
        {key:'result',label:'CÓMO QUIERES DEJARLO',type:'select',options:['Preparado para revisar','Crear borrador en Gmail','Mostrarme primero la respuesta']}
      ],
      capabilities:['Leer los correos de Gmail conectado','Mostrar los correos de hoy y los más recientes','Detectar cuáles necesitan respuesta','Traducir los correos recibidos al idioma que el cliente elija','Preparar respuestas y solicitudes de datos','Crear borradores directamente en Gmail','Enviar solo cuando confirmes la acción','Archivar, marcar leído o destacar correos'],
      steps:['Revisar','Preparar','Autorizar']
    },
    whatsapp:{
      subtitle:'Prepara respuestas para WhatsApp. Puedes usar tu WhatsApp normal o conectar WhatsApp para empresa.',
      primary:'💬 Preparar gestión de WhatsApp',
      fields:[
        {key:'mode',label:'MODO DE RESPUESTA',type:'select',options:['WhatsApp normal: enséñame la respuesta y yo la envío','WhatsApp para empresa: con autorización antes de enviar','WhatsApp para empresa: responder automáticamente según mis reglas']},
        {key:'task',label:'¿QUÉ QUIERES HACER?',type:'select',options:['Ver mensajes pendientes de autorización','Preparar respuesta a un cliente','Solicitar datos que faltan','Responder una consulta frecuente','Preparar seguimiento','Escalar a una persona','Otra gestión']},
        {key:'customer',label:'CLIENTE / TELÉFONO',type:'text',placeholder:'Ej. Marta o +34 600 000 000'},
        {key:'context',label:'MENSAJE O CONTEXTO',type:'textarea',wide:true,placeholder:'Pega aquí el mensaje recibido o explica qué necesita el cliente',required:true},
        {key:'instruction',label:'QUÉ DEBE CONSEGUIR LA RESPUESTA',type:'textarea',wide:true,placeholder:'Ej. pedir CIF y dirección de entrega, confirmar horario, resolver una duda'},
        {key:'billingAck',label:'Si conecto WhatsApp para empresa, entiendo que los posibles cargos de Meta se pagan desde la cuenta de mi empresa y no están incluidos en VentaNexIA.',type:'checkbox',wide:true}
      ],
      capabilities:['Preparar respuestas claras y profesionales','Solicitar al cliente los datos que falten','Mostrar el texto antes de enviar en modo autorización','Responder automáticamente solo cuando el webhook esté activo y las reglas lo permitan','Escalar casos sensibles o fuera de las reglas a una persona','Uso del agente sin límite propio: los posibles cargos de Meta los paga la cuenta del cliente'],
      steps:['Entender','Preparar','Autorizar / responder']
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
      subtitle:'Organiza tus posibles ventas y te dice a qué clientes debes seguir.',
      primary:'✨ Preparar plan comercial',
      fields:[
        {key:'goal',label:'¿QUÉ QUIERES CONSEGUIR?',type:'text',wide:true,placeholder:'Ej. priorizar oportunidades, recuperar clientes o preparar seguimientos',required:true},
        {key:'segment',label:'CLIENTES / SEGMENTO',type:'text',placeholder:'Ej. clínicas privadas, clientes sin compra 90 días'},
        {key:'stage',label:'ETAPA',type:'text',placeholder:'Ej. oportunidad abierta, propuesta enviada'},
        {key:'context',label:'DATOS O CONTEXTO',type:'textarea',wide:true,placeholder:'Añade nombres, importes, notas o criterios importantes'}
      ],
      capabilities:['Priorizar oportunidades','Preparar seguimientos comerciales','Usar los datos de ventas y clientes conectados cuando existan','Proponer próximos pasos sin inventar datos'],
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
    orders:{
      subtitle:'Detecta pedidos por email y en tu tienda online (Shopify o WooCommerce), comprueba cliente y referencias, revisa el stock, consulta a Compras y avisa al cliente. Entrega los pedidos al programa que uses.',
      primary:'📦 Revisar pedidos',
      fields:[
        {key:'task',label:'¿QUÉ QUIERES HACER?',type:'select',options:['Ver pedidos nuevos','Ver pedidos pendientes','Ver pedidos listos para introducir','Comprobar stock','Consultar a Compras los pedidos sin stock','Avisar a los clientes pendientes','Pedir al cliente los datos que faltan','Introducir los pedidos listos','Ver estado y configuración','Conectar mi programa de gestión o mi tienda','Guardar la configuración de stock y Compras','Otra orden (escríbela abajo)']},
        {key:'program',label:'MI PROGRAMA DE GESTIÓN O TIENDA',type:'select',options:['Sin cambios','Holded','Odoo','Dolibarr','Factusol','Tienda WooCommerce']},
        {key:'programUrl',label:'DIRECCIÓN WEB (Odoo, Dolibarr, WooCommerce) O CARPETA (Factusol)',type:'text',wide:true,placeholder:'Ej. https://miempresa.odoo.com · C:\\Importar-Factusol'},
        {key:'programKey',label:'CLAVE DE API (no se guarda en el formulario)',type:'password',placeholder:'La que te da tu programa'},
        {key:'programSecret',label:'SECRETO (solo WooCommerce)',type:'password',placeholder:'cs_…'},
        {key:'programExtra',label:'DATOS EXTRA (opcional)',type:'text',wide:true,placeholder:'Odoo: base mibase usuario yo@empresa.com · Factusol: serie 1 desde 900000 almacén GEN'},
        {key:'orderOutput',label:'¿QUÉ QUIERES HACER CON EL PEDIDO YA REVISADO?',type:'select',wide:true,options:['Sin cambios','Solo prepararlo para revisar','Excel / PDF / Imprimir','Preguntarme antes de pasarlo a mi programa','Pasarlo automáticamente a mi programa cuando todo coincida']},
        {key:'stockSource',label:'DE DÓNDE SALE EL STOCK',type:'select',options:['Sin cambios','Columna de stock de mi catálogo','Inventario de Shopify','No comprobar stock']},
        {key:'stockAvailable',label:'SI HAY STOCK',type:'select',options:['Sin cambios','Avisar al cliente automáticamente','Preparar el aviso y pedirme permiso','No avisar al cliente']},
        {key:'leadTime',label:'PLAZO A INDICAR CUANDO HAY STOCK',type:'text',placeholder:'Ej. 3 días laborables'},
        {key:'purchasingEmail',label:'EMAIL DE COMPRAS',type:'text',wide:true,placeholder:'Ej. compras@empresa.com'},
        {key:'noStock',label:'SI NO HAY STOCK',type:'select',options:['Sin cambios','Consultar automáticamente a Compras','Preparar la consulta y pedirme permiso','Dejar el pedido pendiente']},
        {key:'afterPurchasing',label:'CUANDO COMPRAS RESPONDA',type:'select',options:['Sin cambios','Crear el pedido e informar al cliente automáticamente','Crear el pedido y pedirme permiso antes de informar','Solo actualizar el pedido']},
        {key:'refPrefix',label:'FORMATO DEL NÚMERO INTERNO',type:'text',placeholder:'Ej. VNX-PED'},
        {key:'customerMessage',label:'MENSAJE AL CLIENTE (opcional)',type:'textarea',wide:true,placeholder:'Ej. Hola, su pedido {pedido} estará disponible en {plazo}. {firma}'},
        {key:'rules',label:'ORDEN O CONFIGURACIÓN (opcional)',type:'textarea',wide:true,placeholder:'Ej. destino: archivo en C:\\Pedidos · clientes: C:\\datos\\clientes.xlsx · catálogo: C:\\datos\\articulos.csv · modo: pedir permiso'}
      ],
      capabilities:[
        'Detectar pedidos recibidos por email (Gmail o cualquier correo IMAP) y por tu tienda (Shopify o WooCommerce)',
        'Leer el correo completo y sus adjuntos PDF, Excel, Word o CSV',
        'Asignar un número interno único a cada pedido desde que se detecta',
        'Extraer cliente, referencias, cantidades y direcciones sin inventar nada: lo que no aparece en el correo se descarta',
        'Conectar Holded, Odoo o Dolibarr pegando una clave: comprueba clientes, referencias y stock con tus datos y crea el pedido directamente',
        'Factusol: prepara los archivos oficiales de importación de pedidos (PCL, LPC y CLI)',
        'Cualquier otro programa: archivo a tu medida (CSV, XML, JSON) o webhook (Make, Zapier…)',
        'Comprobar el cliente y las referencias contra tus listas (Excel o CSV exportado de tu programa)',
        'Pedir al cliente por email solo los datos que falten y seguir con el mismo pedido',
        'Comprobar el stock (columna de tu catálogo, Shopify o la API de tu programa) antes de confirmar',
        'Si hay stock, avisar al cliente con el plazo que tú configures',
        'Si no hay stock, consultar a Compras con el número de pedido en el asunto y en el cuerpo',
        'Relacionar la respuesta de Compras solo con el pedido cuyo número coincide y avisar al cliente del plazo',
        'Elegir qué pasa al final: solo preparar, exportar a Excel/PDF/Imprimir, pedir permiso antes de pasarlo al programa o introducirlo automáticamente cuando todo coincide',
        'Entregar los pedidos como archivo para importar (CSV, XML, JSON), por webhook/API o como borrador de Shopify, conservando el número interno',
        'Modo automático solo cuando todo coincide y la lectura está verificada',
        'Conectores directos disponibles para Holded, Odoo y Dolibarr; Factusol mediante archivos oficiales. Las páginas privadas no se usan para teclear pedidos automáticamente.'
      ],
      steps:['Detectar','Leer','Validar','Revisar / completar','Entregar']
    },
    social:{
      subtitle:'Crea campañas, contenido y mejoras de visibilidad para tu negocio.',
      primary:'✨ Crear campaña',
      fields:[
        {key:'channel',label:'CANAL',type:'select',options:['Instagram','Facebook','LinkedIn','X','Web / visibilidad en Google','Multicanal']},
        {key:'goal',label:'OBJETIVO',type:'text',placeholder:'Ej. conseguir leads, vender un producto, ganar visibilidad',required:true},
        {key:'product',label:'PRODUCTO / SERVICIO',type:'text',placeholder:'Qué quieres promocionar'},
        {key:'audience',label:'PÚBLICO',type:'text',placeholder:'Ej. clínicas, fisioterapeutas, responsables de compras'},
        {key:'style',label:'ESTILO Y CONDICIONES',type:'textarea',wide:true,placeholder:'Ej. profesional, cercano, sin emojis, CTA final'}
      ],
      capabilities:['Crear publicaciones y campañas','Preparar calendarios de contenido','Mejorar títulos, descripciones y visibilidad en Google','Adaptar mensajes a cada red','Usar datos reales de redes conectadas cuando existan'],
      steps:['Objetivo','Contenido','Publicar']
    },
    web_ecommerce:{
      subtitle:'Consulta y trabaja con tu web o tienda conectada.',
      primary:'✨ Ejecutar consulta',
      fields:[
        {key:'task',label:'¿QUÉ QUIERES HACER?',type:'select',options:['Consultar pedidos','Consultar facturación','Consultar clientes','Consultar productos y stock','Analizar ventas + stock y preparar reposición','Preparar cambios de producto','Preparar cambio de contenido','Otra tarea']},
        {key:'target',label:'¿SOBRE QUÉ?',type:'text',placeholder:'Ej. pedidos de hoy, producto P616, página de inicio'},
        {key:'detail',label:'DETALLE',type:'textarea',wide:true,placeholder:'Explica exactamente qué necesitas',required:true},
        {key:'expected',label:'RESULTADO ESPERADO',type:'text',wide:true,placeholder:'Ej. una tabla, el total, una propuesta de cambio'}
      ],
      capabilities:['Consultar pedidos, clientes y productos','Cruzar ventas/pedidos históricos con stock por SKU','Proponer stock mínimo y cantidad de reposición con criterio transparente','Dejar el análisis listo para Excel y preparar el paso a Compras para autorización','Revisar stock y precios','Usar Shopify conectado con datos reales','Preparar cambios de contenido','No aplicar cambios importantes sin permiso'],
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
      capabilities:['Ordenar tareas y prioridades','Preparar agendas y seguimientos','Detectar facturas vencidas cuando la fecha y el estado estén disponibles','Preparar reclamaciones de cobro para revisar antes de enviar','Comprobar confirmaciones y respuestas de proveedores en el correo conectado','Organizar información administrativa','Trabajar con archivos autorizados'],
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
      subtitle:'Haz automáticamente tareas repetitivas siguiendo las reglas que tú decidas.',
      primary:'✨ Crear tarea automática',
      fields:[
        {key:'trigger',label:'¿CUÁNDO DEBE EMPEZAR?',type:'text',wide:true,placeholder:'Ej. cuando entra un pedido, llega un email o cambia un estado',required:true},
        {key:'condition',label:'CONDICIONES',type:'textarea',wide:true,placeholder:'Ej. solo pedidos superiores a 500 €'},
        {key:'action',label:'¿QUÉ DEBE HACER?',type:'textarea',wide:true,placeholder:'Ej. avisarme, crear una tarea, preparar un email',required:true},
        {key:'tools',label:'HERRAMIENTAS IMPLICADAS',type:'text',wide:true,placeholder:'Ej. Shopify, Gmail, Ventas y clientes'}
      ],
      capabilities:['Preparar tareas paso a paso','Detectar tareas repetitivas','Elegir cuándo debe empezar y qué condiciones debe cumplir','Decidir qué puede hacer solo y qué debe pedirte permiso'],
      steps:['Disparador','Condiciones','Acciones']
    }
  };

  const guidedStorageKey=key=>'vnx_guided_'+key;
  function guidedConfig(key){
    if(String(key||'').startsWith('external:'))return {
      subtitle:'Tu agente propio conectado a VentaNexIA.',
      primary:'🤖 Consultar mi agente',
      fields:[{key:'task',label:'¿QUÉ QUIERES QUE HAGA?',type:'textarea',wide:true,placeholder:'Explícale la tarea de forma sencilla',required:true}],
      capabilities:['Usar únicamente la conexión de este agente propio','Consultar o preparar trabajo según los permisos configurados','No recibe acceso automático al resto de tus conexiones'],
      steps:['Enviar','Revisar','Continuar']
    };
    return GUIDED_AGENT_FORMS[key]||GUIDED_AGENT_FORMS.core_ai
  }
  function guidedSaved(key){try{return JSON.parse(localStorage.getItem(guidedStorageKey(key))||'{}')}catch{return {}}}
  function guidedSave(key,data){try{localStorage.setItem(guidedStorageKey(key),JSON.stringify(data))}catch{}}
  function guidedFieldHtml(field,value=''){
    const cls=field.wide?' guided-field wide':' guided-field';
    const req=field.required?' <em>obligatorio</em>':'';
    if(field.type==='checkbox')return '<label class="'+cls.trim()+' guided-check-field"><input data-guided-field="'+escM(field.key)+'" type="checkbox"'+((value===true||value==='true'||field.value===true)?' checked':'')+'><span>'+escM(field.label)+req+'</span></label>';
    if(field.type==='textarea')return '<label class="'+cls.trim()+'"><span>'+escM(field.label)+req+'</span><textarea data-guided-field="'+escM(field.key)+'" rows="3" placeholder="'+escM(field.placeholder||'')+'">'+escM(value||field.value||'')+'</textarea></label>';
    if(field.type==='select')return '<label class="'+cls.trim()+'"><span>'+escM(field.label)+req+'</span><select data-guided-field="'+escM(field.key)+'">'+(field.options||[]).map(o=>'<option value="'+escM(o)+'"'+(value===o?' selected':'')+'>'+escM(o)+'</option>').join('')+'</select></label>';
    return '<label class="'+cls.trim()+'"><span>'+escM(field.label)+req+'</span><input data-guided-field="'+escM(field.key)+'" type="'+escM(field.type||'text')+'" value="'+escM(value||field.value||'')+'" placeholder="'+escM(field.placeholder||'')+'"></label>';
  }
  function guidedRead(key){
    const data={},toSave={};$$m('[data-guided-field]').forEach(el=>{const v=el.type==='checkbox'?el.checked:el.value.trim();data[el.dataset.guidedField]=v;if(el.type!=='password')toSave[el.dataset.guidedField]=v});guidedSave(key,toSave);return data;   // las claves no se guardan en el navegador
  }
  function whatsappManualModeEnabled(){
    try{const x=JSON.parse(localStorage.getItem('vnx_real_module_sources')||'{}')?.whatsapp;return x?.provider==='whatsapp_personal'&&x?.status==='manual_ready'}catch{return false}
  }
  function guidedPrompt(key,data){
    if(String(key||'').startsWith('external:'))return String(data.task||'').trim();
    if(key==='core_ai'){
      const task=String(data.task||'Prepárame el día').trim();
      const focus=String(data.focus||'').trim(),context=String(data.context||'').trim();
      return [
        'Actúa como mi Secretaria Ejecutiva de VentaNexIA.',
        'Tarea: '+task+'.',
        focus?'Prioridad especial: '+focus+'.':'',
        context?'Contexto adicional: '+context+'.':'',
        'Revisa únicamente las fuentes realmente conectadas que recibas. Cruza Email, Pedidos, Ventas y clientes, tienda, WhatsApp, redes y agenda solo cuando estén disponibles.',
        'FORMATO OBLIGATORIO: usa títulos y listas Markdown reales. Cada dato, pedido, tarea, alerta o decisión debe ocupar SU PROPIA LÍNEA. Nunca pongas dos datos seguidos en la misma línea. No escribas párrafos largos. Estructura: # Resumen rápido; ## 1. Lo más importante; ## 2. Situación por área; ## 3. Lo que ya está preparado; ## 4. Necesito tu decisión; ## 5. Alertas; ## 6. Siguiente paso recomendado. Bajo cada área usa una línea de subtítulo y después guiones, por ejemplo: ### Pedidos, - Total: 23, - Listos: 4, - Falta datos: 6. Si enumeras pedidos, CADA pedido debe ir en un guion distinto. Máximo una idea por línea.',
        'No inventes reuniones, correos, clientes, pedidos ni datos. No ejecutes acciones externas desde este panel; para actuar, ofrece conectarme automáticamente con el empleado especializado.'
      ].filter(Boolean).join('\n');
    }
    if(key==='email'){
      const task=String(data.task||'').toLowerCase(),target=String(data.target||'').trim(),instruction=String(data.instruction||'').trim(),result=String(data.result||'').trim();
      let lead='Gestiona mi correo.';
      if(task.includes('últimos'))lead='Dime los últimos 5 correos.';
      else if(task.includes('hoy'))lead='Dime los correos de hoy.';
      else if(task.includes('necesitan respuesta'))lead='Dime qué correos necesitan respuesta.';
      else if(task.includes('preparar una respuesta'))lead='Prepara una respuesta para '+(target||'el correo que mejor coincida')+'.';
      else if(task.includes('pedir datos'))lead='Prepara una respuesta para '+(target||'el correo que mejor coincida')+' solicitando los datos que faltan.';
      else if(task.includes('borrador'))lead='Crea un borrador de respuesta para '+(target||'el correo que mejor coincida')+'.';
      else if(task.includes('archivar'))lead='Muéstrame las opciones para archivar o marcar '+(target||'el correo indicado')+'.';
      return [lead,target?'Correo o referencia: '+target:'',instruction?'Instrucciones para la respuesta: '+instruction:'',result?'Resultado deseado: '+result:''].filter(Boolean).join('\n');
    }
    if(key==='whatsapp'){
      const mode=String(data.mode||''),task=String(data.task||''),customer=String(data.customer||'').trim(),context=String(data.context||'').trim(),instruction=String(data.instruction||'').trim();
      const manual=/^WhatsApp normal/i.test(mode);const automatic=/responder automáticamente/i.test(mode);
      return [
        'Prepara una gestión de WhatsApp Business.',
        'Modo: '+(manual?'WhatsApp normal. Prepara el texto y muéstralo; no envíes nada automáticamente.':automatic?'WhatsApp para empresa en automático. Solo ejecuta si la conexión está activa y las reglas autorizadas lo permiten.':'WhatsApp para empresa con autorización. Muestra el texto antes de enviar.'),
        task?'Tarea: '+task:'',
        customer?'Cliente: '+customer:'',
        context?'Mensaje o contexto: '+context:'',
        instruction?'Objetivo de la respuesta: '+instruction:'',
        'No envíes ni afirmes que se ha enviado nada sin una acción real de WhatsApp disponible.'
      ].filter(Boolean).join('\n');
    }
    if(key==='orders'){
      const own=String(data.rules||'').trim();
      const task=String(data.task||'').toLowerCase();
      if(task.includes('conectar')){
        const t=k=>String(data[k]||'').trim();
        const id=[['Holded','holded'],['Odoo','odoo'],['Dolibarr','dolibarr'],['Factusol','factusol'],['Tienda WooCommerce','woocommerce']].find(([k])=>String(data.program||'').startsWith(k));
        if(!id)return 'programas';
        if(id[1]==='woocommerce')return 'tienda: woocommerce '+t('programUrl')+' clave '+t('programKey')+' secreto '+t('programSecret');
        if(id[1]==='factusol')return 'programa: factusol'+(t('programUrl')?' carpeta '+t('programUrl'):'')+' '+t('programExtra');
        return ('programa: '+id[1]+' '+t('programUrl')+(t('programKey')?' clave '+t('programKey'):'')+' '+t('programExtra')).replace(/\s+/g,' ').trim();
      }
      if(task.includes('guardar')){
        const t=k=>String(data[k]||'').trim();
        const pick=(v,map)=>{for(const [k,c] of map)if(String(v||'').startsWith(k))return c;return ''};
        const L=[
          pick(data.orderOutput,[['Solo prepararlo','modo: solo preparar'],['Excel / PDF / Imprimir','modo: solo preparar'],['Preguntarme','modo: pedir permiso'],['Pasarlo automáticamente','modo: automático']]),
          pick(data.orderOutput,[['Excel / PDF / Imprimir','salida preferida: exportar a Excel, PDF o imprimir']]),
          pick(data.stockSource,[['Columna','stock: catálogo'],['Inventario','stock: shopify'],['No comprobar','stock: desactivar']]),
          pick(data.stockAvailable,[['Avisar','aviso de stock: automático'],['Preparar','aviso de stock: pedir permiso'],['No avisar','aviso de stock: no']]),
          t('leadTime')?'plazo: '+t('leadTime'):'',
          t('purchasingEmail')?'compras: '+t('purchasingEmail'):'',
          pick(data.noStock,[['Consultar','sin stock: consultar automáticamente'],['Preparar','sin stock: pedir permiso'],['Dejar','sin stock: dejar pendiente']]),
          pick(data.afterPurchasing,[['Crear el pedido e','respuesta de compras: crear e informar automáticamente'],['Crear el pedido y','respuesta de compras: crear y pedir permiso'],['Solo','respuesta de compras: solo actualizar']]),
          t('refPrefix')?'referencia interna: '+t('refPrefix'):'',
          t('customerMessage')?'mensaje al cliente: '+t('customerMessage').replace(/\s*\n+\s*/g,' '):'',
          ...(own?own.split(/\n+/):[])
        ].filter(Boolean);
        return L.length?L.join('\n'):'Estado de los pedidos';
      }
      if(own)return own;   // una orden escrita a mano («destino: …», «modo: automático», «pedido 3»…)
      const map=[['pedidos nuevos','Revisa los pedidos'],['pendientes','Muestra los pedidos pendientes'],['listos','Muestra los pedidos listos'],['comprobar stock','Comprueba el stock'],['consultar a compras','Consulta a Compras'],['avisar a los clientes','Avisa a los clientes'],['pedir al cliente','Pide los datos que faltan'],['introducir','Introduce los pedidos listos'],['estado','Estado de los pedidos']];
      const hit=map.find(([k])=>task.includes(k));
      return hit?hit[1]:'Ayuda';
    }
    const lines=Object.entries(data).filter(([,v])=>String(v||'').trim()).map(([k,v])=>{
      const f=(guidedConfig(key).fields||[]).find(x=>x.key===k);return (f?.label||k)+': '+v;
    });
    const names={core_ai:'Actúa como centro de mando de VentaNexIA. Responde usando todas las fuentes conectadas que recibas, cruza la información cuando sea útil, indica el origen de los datos y no ejecutes acciones desde este panel.',crm:'Prepara el mejor plan de ventas y clientes con estos datos',customer_service:'Prepara la mejor respuesta de atención al cliente con estos datos',quotes:'Prepara un presupuesto y propuesta profesional con estos datos',orders:'Gestiona Pedidos con el motor real. Puedes revisar pedidos, comprobar stock, consultar a Compras, pedir los datos que faltan y entregar pedidos listos mediante los destinos realmente configurados. Holded, Odoo y Dolibarr admiten conexión directa; Factusol usa archivos de importación. No afirmes que un pedido se ha introducido, enviado o importado hasta que exista confirmación real de la acción. No teclees pedidos en páginas privadas.',social:'Prepara una campaña de marketing y visibilidad con estos datos',web_ecommerce:'Realiza esta consulta o prepara esta tarea de Web y tienda',administration:'Gestiona esta tarea administrativa con datos reales. Si trata de facturas vencidas, identifica número, cliente, importe, vencimiento y estado solo cuando consten en los datos disponibles; prepara la reclamación pero no afirmes que se ha enviado salvo confirmación real. Si trata de proveedores, revisa las respuestas o confirmaciones disponibles, separa confirmado, pendiente y con incidencia, y no inventes fechas ni compromisos.',reports:'Prepara un informe y análisis con estos datos',automation:'Diseña una tarea automática segura y clara con estos datos'};
    return (names[key]||'Ayúdame con esta tarea')+':\n'+lines.join('\n');
  }
  function guidedConnectedLabels(key){
    const matches=[];
    const wants={email:['email'],whatsapp:['whatsapp'],prospecting:['email'],crm:['crm','email'],customer_service:['email','whatsapp'],orders:['email','shopify'],social:['social'],web_ecommerce:['shopify','wordpress','github_vercel'],administration:['email'],reports:['shopify','crm'],automation:['shopify','email','crm','whatsapp']}[key]||[];
    for(const x of runtimeConnections||[]){const k=x.module||x.key;if(wants.includes(k))matches.push(x.label||k)}
    return [...new Set(matches)];
  }
  function agentMetricHtml(key){
    const m=agentMetrics[key];if(!m||!m.connected)return '';
    return '<div class="agent-live-metrics">'
      +'<span title="Recibidos hoy"><i>'+Number(m.received||0)+'</i><em>recibidos</em></span>'
      +'<span title="'+(key==='email'?'Respondidos/enviados hoy':'Respondidos hoy')+'"><i>'+Number(m.responded||0)+'</i><em>respondidos</em></span>'
      +'<span class="'+(Number(m.pending||0)>0?'has-pending':'')+'" title="Pendientes"><i>'+Number(m.pending||0)+'</i><em>pendientes</em></span>'
      +'</div>';
  }
  async function refreshAgentMetrics(){
    const next={};
    const emailAgent=(runtimeAgents||[]).find(x=>x.key==='email');
    const waAgent=(runtimeAgents||[]).find(x=>x.key==='whatsapp');
    const jobs=[];
    if(emailAgent?.connected||emailAgent?.ready)jobs.push(
      window.vnx.emailMetrics().then(x=>{next.email=x||{}}).catch(()=>{next.email={connected:false}})
    );
    if(waAgent?.connected||waAgent?.ready)jobs.push(
      window.vnx.whatsappRuntime({action:'metrics'}).then(x=>{next.whatsapp=x||{}}).catch(()=>{next.whatsapp={connected:false}})
    );
    await Promise.all(jobs);
    agentMetrics=next;
    return next;
  }
  function agentShortFunction(key){
    return {
      core_ai:'organiza el día y adelanta trabajo',
      email:'leer, responder y borradores',
      whatsapp:'responder clientes y pedir datos',
      prospecting:'buscar posibles clientes',
      crm:'seguimiento y cierre',
      customer_service:'responder dudas e incidencias',
      quotes:'crear presupuestos y ofertas',
      orders:'leer, comprobar y entregar pedidos',
      social:'redes y campañas',
      web_ecommerce:'pedidos, productos y tienda',
      administration:'tareas, agenda y gestión',
      reports:'datos y resultados',
      automation:'ahorrar tiempo y repetir tareas'
    }[key]||'ayuda para tu negocio';
  }
  function selectAgentKey(key,{preserve=false}={}){
    const sel=$m('#chatConnectionSelect');if(!sel)return false;    const value=String(key||'').startsWith('external:')?String(key):'agent:'+key;
    if(![...sel.options].some(o=>o.value===value))return false;
    if(preserve)handoffAgentChange=true;
    sel.value=value;sel.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  function renderGuidedAgentTabs(items,selected){
    const root=$m('#guidedAgentTabs');if(!root)return;
    root.innerHTML=items.map(a=>'<button type="button" class="guided-agent-tab '+(selected?.key===a.key?'active':'')+'" data-guided-agent="'+escM(a.key)+'"><span class="agent-icon-wrap">'+escM(a.icon||'🤖')+(agentMetrics[a.key]?.pending>0?'<i class="agent-pending-badge">'+Number(agentMetrics[a.key].pending)+'</i>':'')+'</span><b>'+escM(a.name)+'</b><small>'+escM(agentShortFunction(a.key))+'</small>'+agentMetricHtml(a.key)+'</button>').join('');
    $$m('[data-guided-agent]').forEach(btn=>btn.onclick=()=>selectAgentKey(btn.dataset.guidedAgent));
  }
  function renderGuidedOtherCards(items,selected){
    const root=$m('#guidedOtherCards');if(!root)return;
    const list=items.filter(x=>x.key!==selected?.key).slice(0,5);
    root.innerHTML=list.map(a=>'<button type="button" data-guided-other="'+escM(a.key)+'"><span class="agent-icon-wrap">'+escM(a.icon||'🤖')+(agentMetrics[a.key]?.pending>0?'<i class="agent-pending-badge">'+Number(agentMetrics[a.key].pending)+'</i>':'')+'</span><b>'+escM(a.name)+'</b><small>'+escM(agentShortFunction(a.key))+'</small>'+agentMetricHtml(a.key)+'<i>›</i></button>').join('');
    $$m('[data-guided-other]').forEach(btn=>btn.onclick=()=>selectAgentKey(btn.dataset.guidedOther));
  }
  async function refreshGuidedCatalog(){
    const row=$m('#guidedCatalogRow'),txt=$m('#guidedCatalogText');if(!row||row.style.display==='none'||!txt)return;
    txt.textContent='Buscando catálogo autorizado…';
    try{const r=await window.vnx.prospectingCatalogStatus();txt.textContent=r?.found?'Catálogo detectado: '+r.name:'No hay un PDF con “catálogo” en las carpetas autorizadas.';}
    catch{txt.textContent='No se ha podido comprobar el catálogo.'}
  }
  function emailInitials(from=''){
    const name=String(from||'').replace(/<[^>]+>/g,'').trim();
    const bits=name.split(/\s+/).filter(Boolean);
    if(bits.length>=2)return (bits[0][0]+bits[1][0]).toUpperCase();
    const addr=(String(from).match(/<?([^<>\s]+@[^<>\s]+)>?/)||[])[1]||name;
    return String(addr).slice(0,2).toUpperCase();
  }
  function emailDisplayAddress(from=''){
    const m=String(from||'').match(/<?([^<>\s]+@[^<>\s]+)>?/);return m?.[1]||String(from||'');
  }
  function emailDateLabel(raw=''){
    const d=new Date(raw);if(Number.isNaN(d.getTime()))return String(raw||'');
    return d.toLocaleString('es-ES',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).replace(',','');
  }
  function emailStatusLabel(m){
    if(m.status==='unread')return '<span class="email-status unread">Sin leer</span>';
    if(m.status==='responded')return '<span class="email-status responded">Respondido</span>';
    if(m.status==='no_reply')return '<span class="email-status no-reply">No requiere respuesta</span>';
    return '<span class="email-status pending">Pendiente</span>';
  }
  const EMAIL_TOPICS=[
  {key:'reclamaciones',label:'Reclamaciones',urgent:true},
  {key:'cobros',label:'Cobros e impagos',urgent:true},
  {key:'pedidos',label:'Pedidos'},
  {key:'facturas',label:'Facturas y recibos'},
  {key:'consultas',label:'Consultas'},
  {key:'informativos',label:'Informativos'}
];
function normEs(v=''){return String(v).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')}
function emailTopic(m={}){
  if(m.noReply)return 'informativos';
  const from=normEs(m.from||''),t=normEs([m.subject,m.snippet,m.body].join(' '));
  if(/\\b(no[-_. ]?reply|noreply|do[-_. ]?not[-_. ]?reply|donotreply|mailer-daemon|notification[s]?|notifications|avisos?)\\b/.test(from))return 'informativos';
  if(/este es un mensaje automatico|no respondas a este (mensaje|correo)|mensaje generado automaticamente/.test(t))return 'informativos';
  if(/reclamacion|queja|devoluc|roto|defectuos|no ha llegado|problema|incidencia/.test(t))return 'reclamaciones';
  if(/impago|vencimiento|pago pendiente|cobro|payment failed|card declined/.test(t))return 'cobros';
  if(/factura|invoice|recibo/.test(t))return 'facturas';
  if(/pedido|order|compra|entrega|envio|expedicion|presupuesto/.test(t))return 'pedidos';
  if(Number(m.replyScore||0)>0||emailAsksForReply(m))return 'consultas';
  return 'informativos';
}
function emailTopicCounts(list=[]){const out={};for(const t of EMAIL_TOPICS)out[t.key]=0;for(const m of list)out[emailTopic(m)]=(out[emailTopic(m)]||0)+1;return out}
function emailTopicTabsHtml(counts={}){return '<div class="email-topic-tabs"><button class="active" data-email-topic="all">Todos <span class="n">'+Object.values(counts).reduce((a,b)=>a+b,0)+'</span></button>'+EMAIL_TOPICS.map(t=>'<button class="'+(t.urgent&&counts[t.key]?'urgent':'')+'" data-email-topic="'+t.key+'">'+escM(t.label)+' <span class="n">'+(counts[t.key]||0)+'</span></button>').join('')+'</div>'}
function emailListItem(m,i,selected){
    return '<button type="button" class="email-list-row '+(selected?'selected':'')+'" data-email-row="'+i+'">'
      +'<span class="email-avatar">'+escM(emailInitials(m.from))+'</span>'
      +'<span class="email-row-copy"><b>'+escM(emailDisplayAddress(m.from))+'</b><strong>'+escM(m.subject||'(sin asunto)')+'</strong><small>'+escM(m.snippet||'')+'</small></span>'
      +'<span class="email-row-side"><time>'+escM(emailDateLabel(m.date))+'</time>'+emailStatusLabel(m)+'</span>'
      +'</button>';
  }
  async function renderEmailDashboard(chosen){
    const layout=$m('.guided-layout'),host=$m('#guidedFormHost'),primary=$m('#guidedPrimaryAction'),steps=$m('#guidedSteps'),result=$m('#guidedResult'),cat=$m('#guidedCatalogRow'),consent=$m('#guidedConsentRow'),help=document.querySelector('.guided-help-card'),switcher=document.querySelector('.guided-card-head .mode-switch');
    layout?.classList.add('email-dashboard-mode');
    if(help)help.style.display='none';if(switcher)switcher.style.display='none';
    if(primary)primary.style.display='none';if(steps)steps.style.display='none';if(result)result.style.display='none';if(cat)cat.style.display='none';if(consent)consent.style.display='none';
    if(!host)return;
    host.innerHTML='<div class="email-dashboard-loading">Consultando Gmail y preparando tu bandeja…</div>';
    try{
      const allInbox=await window.vnx.emailInbox({limit:30});
      const accountNames=Array.isArray(allInbox?.accounts)?allInbox.accounts:[];
      let messages=[];
      let selected=0,filter='all',search='',topicFilter='all';
      const accountOptions=['Todas las cuentas',...accountNames];
      host.innerHTML='<div class="email-dashboard">'
        +'<div class="email-toolbar"><div><span class="email-work-icon">✉</span><div><h3>Correo y bandeja de entrada</h3><p>Gestiona tus correos con la ayuda de VentaNexIA.</p></div></div><div class="email-toolbar-controls"><label class="email-account-select"><span>Cuenta</span><select data-email-account>'+accountOptions.map((n,i)=>'<option value="'+(i===0?'':escM(n))+'">'+escM(n)+'</option>').join('')+'</select></label><label class="email-search">⌕<input data-email-search placeholder="Buscar correos, remitentes o asuntos…"></label></div></div>'
        +'<div class="email-metric-grid" data-email-metrics></div>'
        +'<div class="email-workspace"><div class="email-category-panel" data-email-topic-tabs></div><section class="email-list-panel"><div class="email-list-tabs"><button class="active" data-email-filter="all">✉ Recibidos</button><button data-email-filter="responded">✓ Respondidos</button><button data-email-filter="pending">◷ Pendientes</button><button data-email-filter="no_reply">✓ Sin respuesta</button></div><div class="email-list" data-email-list></div></section><section class="email-detail-panel" data-email-detail></section></div>'
        +'</div>';
      const list=host.querySelector('[data-email-list]'),detail=host.querySelector('[data-email-detail]');
      const visibleIndexes=()=>messages.map((m,i)=>({m,i})).filter(({m})=>{
        const statusOk=filter==='all'||m.status===filter;
        const topicOk=topicFilter==='all'||emailTopic(m)===topicFilter;
        const q=search.toLowerCase();
        const searchOk=!q||[m.from,m.subject,m.snippet].join(' ').toLowerCase().includes(q);
        return statusOk&&topicOk&&searchOk;
      }).map(x=>x.i);
      function renderTopicTabs(){
        const root=host.querySelector('[data-email-topic-tabs]');if(!root)return;
        root.innerHTML=emailTopicTabsHtml(emailTopicCounts(messages));
        root.querySelectorAll('[data-email-topic]').forEach(btn=>btn.onclick=()=>{topicFilter=btn.dataset.emailTopic;root.querySelectorAll('[data-email-topic]').forEach(x=>x.classList.toggle('active',x===btn));renderList();renderDetail();});
      }
      function renderList(){
        const idxs=visibleIndexes();
        if(!idxs.includes(selected)&&idxs.length)selected=idxs[0];
        if(!idxs.length){list.innerHTML='<div class="email-no-results">No hay correos con este filtro.</div>';detail.innerHTML='';return}
        list.innerHTML=idxs.map(i=>emailListItem(messages[i],i,i===selected)).join('');
        list.querySelectorAll('[data-email-row]').forEach(btn=>btn.onclick=()=>{selected=Number(btn.dataset.emailRow);renderList();renderDetail();});
      }
      function renderDetail(){
        const m=messages[selected];if(!m){detail.innerHTML='';return}
        detail.innerHTML='<div class="email-detail-head"><span class="email-avatar large">'+escM(emailInitials(m.from))+'</span><div><b>'+escM(emailDisplayAddress(m.from))+'</b><small>Para: '+escM(m.to||m.account||'')+'</small></div><time>'+escM(emailDateLabel(m.date))+'</time>'+emailStatusLabel(m)+'</div>'
          +'<h3>'+escM(m.subject||'(sin asunto)')+'</h3>'
          +'<div class="email-original-body">'+escM(m.body||m.snippet||'').replace(/\n/g,'<br>')+'</div>'
          +'<div class="email-reply-tabs"><button class="active">✦ Respuesta sugerida por IA</button><button>ⓘ Detalles del correo</button><button>◷ Historial</button></div>'
          +'<div class="email-suggestion"><div class="email-suggestion-head"><b>✦ Respuesta sugerida</b><button type="button" data-email-copy>Copiar texto</button></div><textarea data-email-reply rows="9">'+escM(m.defaultBody||'')+'</textarea></div>'
          +'<div class="email-action-bar"><button type="button" class="btn primary" data-email-prepare>✈ Preparar respuesta</button><button type="button" class="btn outline" data-email-draft>▤ Crear borrador</button><button type="button" class="btn outline" data-email-read>✉ Marcar leído</button><button type="button" class="btn outline email-no-reply-btn" data-email-no-reply>✓ No requiere respuesta</button><button type="button" class="btn outline" data-email-open>↗ Abrir en Gmail</button></div>'
          +'<div class="email-action-msg" data-email-msg></div>';
        const ta=detail.querySelector('[data-email-reply]'),msg=detail.querySelector('[data-email-msg]');
        detail.querySelector('[data-email-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(ta.value);msg.textContent='Texto copiado.'}catch{msg.textContent='No se pudo copiar.'}};
        detail.querySelector('[data-email-prepare]').onclick=()=>{ta.focus();ta.select();msg.textContent='Revisa o modifica el texto. Después puedes crear el borrador en Gmail.'};
        detail.querySelector('[data-email-draft]').onclick=async()=>{
          const btn=detail.querySelector('[data-email-draft]');btn.disabled=true;msg.textContent='Creando borrador en Gmail…';
          try{const r=await window.vnx.emailAction({account:m.account,messageId:m.id,threadId:m.threadId,subject:m.subject,from:m.from,action:'draft_reply',body:ta.value});msg.textContent=r?.message||'Borrador creado en Gmail.';await refreshAgentMetrics()}
          catch(err){msg.textContent=err.message||'No se pudo crear el borrador.'}finally{btn.disabled=false}
        };
        detail.querySelector('[data-email-read]').onclick=async()=>{
          const btn=detail.querySelector('[data-email-read]');btn.disabled=true;msg.textContent='Marcando como leído en Gmail…';
          try{
            const result=await window.vnx.emailAction({account:m.account,messageId:m.id,threadId:m.threadId,subject:m.subject,from:m.from,action:'mark_read'});
            if(!result?.ok)throw new Error(result?.message||'Gmail no confirmó la acción.');
            m.unread=false;if(m.status==='unread')m.status=m.responded?'responded':'pending';
            await refreshAccountData(m.id);
            await refreshAgentMetrics();
            const currentMsg=detail.querySelector('[data-email-msg]');
            if(currentMsg)currentMsg.textContent='Correo y conversación marcados como leídos en Gmail.';
          }catch(err){
            msg.textContent=err.message||'No se pudo actualizar el correo.';
            btn.disabled=false;
          }
        };
        detail.querySelector('[data-email-no-reply]').onclick=async()=>{
          const btn=detail.querySelector('[data-email-no-reply]');btn.disabled=true;msg.textContent='Marcando como no requiere respuesta…';
          try{
            const r=await window.vnx.emailAction({account:m.account,messageId:m.id,threadId:m.threadId,subject:m.subject,from:m.from,action:'no_reply_needed'});
            m.unread=false;m.noReply=true;m.status='no_reply';
            msg.textContent=r?.message||'Marcado como no requiere respuesta.';
            renderList();renderDetail();await refreshAgentMetrics();
          }catch(err){msg.textContent=err.message||'No se pudo actualizar el correo.'}finally{btn.disabled=false}
        };
        detail.querySelector('[data-email-open]').onclick=()=>{const u='https://mail.google.com/mail/u/0/#inbox/'+encodeURIComponent(m.threadId||m.id);window.open(u,'_blank','noopener,noreferrer')};
      }
      async function refreshAccountData(preferredMessageId=''){
        const metricsRoot=host.querySelector('[data-email-metrics]');
        const accountControl=host.querySelector('[data-email-account]');
        const selectedAccount=String(accountControl?.value||'').trim();
        const scope=selectedAccount?{account:selectedAccount}:{};
        const [inbox,metrics]=await Promise.all([
          window.vnx.emailInbox({limit:30,...scope}),
          window.vnx.emailMetrics(scope)
        ]);
        const backendErrors=[...(inbox?.errors||[]),...(metrics?.errors||[])].filter(Boolean);
        if(backendErrors.length&&!Array.isArray(inbox?.messages)?.length){
          list.innerHTML='<div class="email-no-results">No he podido leer esta cuenta.<br><small>'+escM(backendErrors[0])+'</small></div>';
          detail.innerHTML='';
          if(metricsRoot)metricsRoot.innerHTML='<article><span class="metric-ico amber">!</span><b>—</b><strong>Cuenta</strong><small>Revisa la conexión de Gmail</small></article>';
          return;
        }
        messages=Array.isArray(inbox?.messages)?inbox.messages:[];
        const keepIndex=preferredMessageId?messages.findIndex(x=>x.id===preferredMessageId):-1;
        selected=keepIndex>=0?keepIndex:0;
        if(metricsRoot)metricsRoot.innerHTML=
          '<article><span class="metric-ico blue">✉</span><b>'+Number(metrics?.received||0)+'</b><strong>Recibidos</strong><small>Hoy</small></article>'
          +'<article><span class="metric-ico green">✓</span><b>'+Number(metrics?.responded||0)+'</b><strong>Respondidos</strong><small>Enviados hoy</small></article>'
          +'<article><span class="metric-ico amber">◷</span><b>'+Number(metrics?.pending||0)+'</b><strong>Pendientes</strong><small>Requieren revisión</small></article>'
          +'<article><span class="metric-ico blue">◉</span><b>'+Number(metrics?.unread||0)+'</b><strong>Sin leer</strong><small>En bandeja</small></article>';
        const allBtn=host.querySelector('[data-email-filter="all"]');if(allBtn)allBtn.textContent='✉ Recibidos ('+messages.length+')';
        topicFilter='all';renderTopicTabs();renderList();renderDetail();
      }
      host.querySelectorAll('[data-email-filter]').forEach(btn=>btn.onclick=()=>{filter=btn.dataset.emailFilter;host.querySelectorAll('[data-email-filter]').forEach(x=>x.classList.toggle('active',x===btn));renderList();renderDetail()});
      const searchEl=host.querySelector('[data-email-search]');searchEl.oninput=()=>{search=searchEl.value.trim();renderList();renderDetail()};
      const accountControl=host.querySelector('[data-email-account]');if(accountControl)accountControl.onchange=()=>refreshAccountData();
      await refreshAccountData();
    }catch(err){
      host.innerHTML='<div class="email-dashboard-empty">No he podido cargar la bandeja: '+escM(err.message||err)+'</div>';
    }
  }

  function whatsappMetricsHtml(m,manual=false){
    const val=k=>manual?'—':Number(m?.[k]||0);
    return '<div class="wa-metric-wrap">'
      +'<div class="email-metric-grid wa-metric-grid">'
      +'<article><span class="metric-ico green">💬</span><b>'+val('received')+'</b><strong>Recibidos</strong><small>'+(manual?'Solo con WhatsApp para empresa':'Hoy')+'</small></article>'
      +'<article><span class="metric-ico blue">✓</span><b>'+val('responded')+'</b><strong>Respondidos</strong><small>'+(manual?'Sin lectura automática':'Hoy')+'</small></article>'
      +'<article><span class="metric-ico amber">◷</span><b>'+val('pending')+'</b><strong>Pendientes</strong><small>'+(manual?'No disponible':'Por autorizar')+'</small></article>'
      +'<article><span class="metric-ico red">!</span><b>'+val('unanswered')+'</b><strong>Sin responder</strong><small>'+(manual?'No disponible':'Conversaciones pendientes')+'</small></article>'
      +'</div>'
      +(manual?'<div class="wa-manual-counter-note"><b>WhatsApp normal:</b> VentaNexIA no puede leer tu bandeja automáticamente. Los contadores reales se activan al conectar WhatsApp para empresa.</div>':'')
      +'</div>';
  }
  async function refreshWhatsAppWorkspaceMetrics(){
    const root=document.querySelector('[data-whatsapp-workspace-metrics]');if(!root)return;
    const manual=whatsappManualModeEnabled();
    if(manual){root.innerHTML=whatsappMetricsHtml({},true);return}
    root.innerHTML='<div class="wa-metrics-loading">Consultando WhatsApp…</div>';
    try{
      const m=await window.vnx.whatsappRuntime({action:'metrics'});
      root.innerHTML=whatsappMetricsHtml(m,false);
    }catch{
      root.innerHTML='<div class="wa-manual-counter-note"><b>WhatsApp para empresa todavía no está conectado.</b> Cuando lo conectes aquí aparecerán los contadores reales.</div>';
    }
  }

  function renderGuidedWorkspace(chosen){
    if(!chosen)return;
    const layout=$m('.guided-layout'),help=document.querySelector('.guided-help-card'),switcher=document.querySelector('.guided-card-head .mode-switch'),primaryEl=$m('#guidedPrimaryAction'),stepsEl=$m('#guidedSteps');
    layout?.classList.remove('email-dashboard-mode');if(help)help.style.display='';if(switcher)switcher.style.display='';if(primaryEl)primaryEl.style.display='';if(stepsEl)stepsEl.style.display='';
    const cfg=guidedConfig(chosen.key),saved=guidedSaved(chosen.key);
    const title=$m('#guidedAgentTitle'),sub=$m('#guidedAgentSubtitle'),host=$m('#guidedFormHost'),caps=$m('#guidedCapabilities'),primary=$m('#guidedPrimaryAction'),steps=$m('#guidedSteps'),consent=$m('#guidedConsentRow'),cat=$m('#guidedCatalogRow'),summary=$m('#guidedConnectionSummary');
    if(title)title.textContent=chosen.key==='core_ai'?'👩‍💼 Carla · Secretaria ejecutiva':(chosen.icon||'🤖')+' '+chosen.name;
    if(sub)sub.textContent=cfg.subtitle||'';
    if(chosen.key==='email'){renderEmailDashboard(chosen);if(!document.body.classList.contains('vnx-carla-window'))renderGuidedOtherCards(chatConnections(),chosen);return;}
    if(host)host.innerHTML=(chosen.key==='whatsapp'?'<div data-whatsapp-workspace-metrics></div>':'')+'<div class="guided-form-grid">'+(cfg.fields||[]).map(f=>guidedFieldHtml(f,saved[f.key]||'')).join('')+'</div>';
    if(chosen.key==='whatsapp')refreshWhatsAppWorkspaceMetrics();
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
  function renderWhatsAppPending(out,drafts=[]){
    if(!drafts.length){
      out.innerHTML='<div class="guided-result-head"><b>WhatsApp</b></div><div class="guided-result-copy">No hay mensajes pendientes de autorización.</div>';
      return;
    }
    out.innerHTML='<div class="guided-result-head"><b>'+drafts.length+' respuesta'+(drafts.length===1?'':'s')+' pendiente'+(drafts.length===1?'':'s')+'</b></div>'
      +'<div class="wa-pending-list">'+drafts.map(d=>'<article class="wa-pending-card" data-wa-draft="'+escM(d.id)+'">'
        +'<div class="wa-pending-head"><b>'+escM(d.customer_name||d.customer_number||'Cliente')+'</b><small>'+escM(d.customer_number||'')+'</small></div>'
        +'<div class="wa-inbound"><span>Mensaje recibido</span><p>'+escM(d.inbound_text||'')+'</p></div>'
        +'<label><span>Respuesta preparada</span><textarea rows="4" data-wa-text>'+escM(d.proposed_text||'')+'</textarea></label>'
        +'<div class="wa-pending-actions"><button type="button" class="btn primary" data-wa-approve>Enviar esta respuesta</button><button type="button" class="btn outline" data-wa-reject>Descartar</button></div>'
        +'</article>').join('')+'</div>'
      +'<small class="guided-email-safety">En modo autorización nunca se envía nada hasta que pulses “Enviar esta respuesta”. Los cargos externos de Meta corresponden a la cuenta del cliente.</small>';
    out.querySelectorAll('[data-wa-draft]').forEach(card=>{
      const id=card.dataset.waDraft,approve=card.querySelector('[data-wa-approve]'),reject=card.querySelector('[data-wa-reject]'),ta=card.querySelector('[data-wa-text]');
      if(approve)approve.onclick=async()=>{if(!confirm('¿Enviar esta respuesta por WhatsApp?'))return;approve.disabled=true;try{const rr=await window.vnx.whatsappRuntime({action:'approve',draftId:id,text:ta?.value||''});card.innerHTML='<div class="guided-email-done">'+escM(rr?.message||'Respuesta enviada.')+'</div>';await refreshChatConnections();await refreshWhatsAppWorkspaceMetrics()}catch(e){alert(e.message||e)}finally{approve.disabled=false}};
      if(reject)reject.onclick=async()=>{if(!confirm('¿Descartar esta respuesta preparada?'))return;reject.disabled=true;try{await window.vnx.whatsappRuntime({action:'reject',draftId:id});card.remove();await refreshChatConnections();await refreshWhatsAppWorkspaceMetrics()}catch(e){alert(e.message||e)}finally{reject.disabled=false}};
    });
  }
  function prospectingPublicUrl(lead={}){
    const candidates=[lead.sourceUrl,lead.source_url,lead.source,lead.website,lead.url].filter(Boolean);
    return String(candidates.find(v=>/^https?:\/\//i.test(String(v)))||'');
  }
  function prospectingVerification(lead={}){
    const bits=['Empresa localizada en una información pública'];
    if(lead.email)bits.push('email corporativo publicado');
    if(lead.phone)bits.push('teléfono público localizado');
    if(lead.website)bits.push('web pública localizada');
    return bits.join(' · ')+'.';
  }
  function prospectingWhyFit(lead={},criteria={}){
    const activity=String(lead.activity||'su actividad').trim();
    const buyer=String(criteria.buyer||'el tipo de empresa buscado').trim();
    const zone=String(criteria.zone||'la zona indicada').trim();
    const offer=String(criteria.offer||'tu oferta').trim();
    return 'Su actividad pública ('+activity+') encaja con la búsqueda de '+buyer+' en '+zone+'. Por ese perfil puede ser una oportunidad para '+offer+'.';
  }
  function prospectingCardHtml(lead,index,criteria={},hidden=false){
    const source=prospectingPublicUrl(lead);
    const email=String(lead.email||'').trim(),phone=String(lead.phone||'').trim(),website=String(lead.website||'').trim();
    const meta=[
      '<div><span>Actividad</span><strong>'+escM(lead.activity||'No indicada')+'</strong></div>',
      '<div><span>Dirección</span><strong>'+escM(lead.address||criteria.zone||'No disponible')+'</strong></div>',
      phone?'<div><span>Teléfono</span><strong>'+escM(phone)+'</strong></div>':'',
      email?'<div><span>Email</span><strong>'+escM(email)+'</strong></div>':''
    ].filter(Boolean).join('');
    return '<article class="prospect-card'+(hidden?' is-hidden':'')+'" data-prospect-index="'+index+'">'
      +'<div class="prospect-card-kicker">OPORTUNIDAD '+(index+1)+'</div>'
      +'<h4>'+escM(lead.name||'Empresa')+'</h4>'
      +'<div class="prospect-meta">'+meta+'</div>'
      +'<div class="prospect-divider"></div>'
      +'<p><b>Por qué puede encajar:</b> '+escM(prospectingWhyFit(lead,criteria))+'</p>'
      +'<p class="prospect-check"><b>Comprobación:</b> '+escM(prospectingVerification(lead))+'</p>'
      +'<div class="prospect-card-actions">'
      +(source?'<button type="button" class="mini prospect-open-source" data-url="'+escM(source)+'">Comprobar información pública ↗</button>':'<span class="prospect-source-state">● Fuente pública comprobada</span>')
      +'<button type="button" class="mini prospect-copy" data-index="'+index+'">Copiar datos</button>'
      +(email?'<span class="prospect-email-state">✉ Email corporativo localizado</span>':'<span class="prospect-email-state muted">✉ Sin email público localizado</span>')
      +'</div>'
      +'</article>';
  }
  function renderProspectingResults(out,r={},criteria={},scope=null){
    const leads=Array.isArray(r.leads)?r.leads:[];
    if(!leads.length)return false;
    const withEmail=leads.filter(x=>String(x.email||'').trim()).length;
    const withPhone=leads.filter(x=>String(x.phone||'').trim()).length;
    const withAddress=leads.filter(x=>String(x.address||'').trim()).length;
    const cards=leads.map((lead,i)=>prospectingCardHtml(lead,i,criteria,i>=6)).join('');
    out.innerHTML='<div class="prospect-results">'
      +'<div class="prospect-results-head">'
      +'<div><span class="prospect-result-badge">RESULTADO DE LA BÚSQUEDA</span><h3>'+leads.length+' oportunidades encontradas</h3>'
      +'<p>He revisado datos públicos: '+withAddress+' con dirección · '+withEmail+' con email · '+withPhone+' con teléfono.</p></div>'
      +'<div class="prospect-trust">● Fuentes públicas comprobables</div>'
      +'</div>'
      +'<div class="prospect-toolbar">'
      +'<button type="button" class="btn primary" data-prospect-prepare>✦ Preparar emails comerciales</button>'
      +'<button type="button" class="btn outline" data-prospect-export>Exportar CSV</button>'
      +'<button type="button" class="btn outline" data-guided-continue-free>Continuar en modo libre</button>'
      +'</div>'
      +'<div class="prospect-grid">'+cards+'</div>'
      +(leads.length>6?'<div class="prospect-more-wrap"><button type="button" class="btn outline" data-prospect-more>Ver '+(leads.length-6)+' oportunidades más</button></div>':'')
      +'<div class="prospect-saved-note">✓ Estas oportunidades quedan guardadas en Buscar clientes para poder preparar emails y hacer seguimiento.</div>'
      +'</div>';

    out.querySelectorAll('.prospect-open-source').forEach(btn=>btn.onclick=()=>{
      const url=btn.dataset.url;if(url)window.open(url,'_blank','noopener,noreferrer');
    });
    out.querySelectorAll('.prospect-copy').forEach(btn=>btn.onclick=async()=>{
      const lead=leads[Number(btn.dataset.index)];if(!lead)return;
      const txt=[
        lead.name||'',
        lead.activity?'Actividad: '+lead.activity:'',
        lead.address?'Dirección: '+lead.address:'',
        lead.phone?'Teléfono: '+lead.phone:'',
        lead.email?'Email: '+lead.email:'',
        lead.website?'Web: '+lead.website:''
      ].filter(Boolean).join('\n');
      try{await navigator.clipboard.writeText(txt);const old=btn.textContent;btn.textContent='Copiado ✓';setTimeout(()=>btn.textContent=old,1400)}catch{}
    });
    const more=out.querySelector('[data-prospect-more]');
    if(more)more.onclick=()=>{out.querySelectorAll('.prospect-card.is-hidden').forEach(x=>x.classList.remove('is-hidden'));more.parentElement.remove();};
    const exportBtn=out.querySelector('[data-prospect-export]');
    if(exportBtn)exportBtn.onclick=()=>{
      const rows=[['Empresa','Actividad','Dirección','Teléfono','Email','Web']];
      leads.forEach(x=>rows.push([x.name||'',x.activity||'',x.address||'',x.phone||'',x.email||'',x.website||'']));
      const csv=rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\r\n');
      const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ventanexia-oportunidades.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
    };
    const prep=out.querySelector('[data-prospect-prepare]');
    if(prep)prep.onclick=async()=>{
      const old=prep.textContent;prep.disabled=true;prep.textContent='Preparando emails…';
      try{
        const rr=await window.vnx.sendChat([{role:'user',content:'prepara los emails'}],scope);
        setWorkspaceMode('free');
        masterMessages=[
          {role:'assistant',content:r.reply||('He encontrado '+leads.length+' oportunidades.')},
          {role:'assistant',content:rr?.reply||'Emails preparados.'}
        ];
        renderMasterMessages();
      }catch(e){alert('No he podido preparar los emails: '+(e.message||e))}
      finally{prep.disabled=false;prep.textContent=old}
    };
    const cont=out.querySelector('[data-guided-continue-free]');
    if(cont)cont.onclick=()=>{setWorkspaceMode('free');masterMessages=[{role:'assistant',content:r?.reply||('He encontrado '+leads.length+' oportunidades.')}];renderMasterMessages();};
    return true;
  }

  function documentFieldKey(label=''){
    return String(label||'').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'campo';
  }
  function documentFieldsFromText(text=''){
    const found=[],seen=new Set();
    const rx=/\[([^\]\n]{2,80})\]/g;let match;
    while((match=rx.exec(String(text||'')))!==null){
      const label=String(match[1]||'').trim();
      if(!label||/^https?:\/\//i.test(label))continue;
      const key=documentFieldKey(label);
      if(seen.has(key))continue;      seen.add(key);found.push({key,label,token:match[0]});
      if(found.length>=40)break;
    }
    return found;
  }
  function fillDocumentText(source='',values={}){
    let out=String(source||'');
    for(const field of documentFieldsFromText(source)){
      const value=String(values[field.key]||'').trim();
      if(!value)continue;
      out=out.split(field.token).join(value);
    }
    return out;
  }
  function markdownInline(text=''){
    let s=escM(String(text||''));
    s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/__([^_]+)__/g,'<strong>$1</strong>');
    s=s.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    return s;
  }
  function markdownTableCells(line=''){
    return String(line||'').trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim());
  }
  function isMarkdownTableSeparator(line=''){
    const cells=markdownTableCells(line);
    return cells.length>0&&cells.every(x=>/^:?-{3,}:?$/.test(x));
  }
  function documentHtmlFromMarkdown(text=''){
    const lines=String(text||'').replace(/\r/g,'').split('\n');
    const out=[];let listOpen=false;
    const closeList=()=>{if(listOpen){out.push('</ul>');listOpen=false}};
    for(let i=0;i<lines.length;i++){
      const raw=lines[i],line=String(raw||'').trimEnd();
      if(!line.trim()){closeList();continue}
      if(line.includes('|')&&i+1<lines.length&&isMarkdownTableSeparator(lines[i+1])){
        closeList();
        const headers=markdownTableCells(line);
        const rows=[];i+=2;
        while(i<lines.length&&String(lines[i]||'').includes('|')&&String(lines[i]||'').trim()){
          rows.push(markdownTableCells(lines[i]));i++;
        }
        i--;
        out.push('<div class="vnx-rich-table-wrap"><table class="vnx-rich-table"><thead><tr>'+headers.map(x=>'<th>'+markdownInline(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+headers.map((_,idx)=>'<td>'+markdownInline(row[idx]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>');
        continue;
      }
      const h=line.match(/^(#{1,4})\s+(.+)$/);
      if(h){closeList();const level=Math.min(4,h[1].length);out.push('<h'+level+'>'+markdownInline(h[2])+'</h'+level+'>');continue}
      const bullet=line.match(/^\s*[-*]\s+(.+)$/);
      if(bullet){if(!listOpen){out.push('<ul>');listOpen=true}out.push('<li>'+markdownInline(bullet[1])+'</li>');continue}
      const numbered=line.match(/^\s*\d+[.)]\s+(.+)$/);
      if(numbered){if(!listOpen){out.push('<ul>');listOpen=true}out.push('<li>'+markdownInline(numbered[1])+'</li>');continue}
      closeList();
      if(/^---+$/.test(line.trim())){out.push('<hr>');continue}
      out.push('<p>'+markdownInline(line)+'</p>');
    }
    closeList();
    return out.join('');
  }
  function downloadDocumentWord(title,text){
    const safeTitle=String(title||'Documento VentaNexIA').replace(/[<>:"/\\|?*]+/g,' ').trim()||'Documento VentaNexIA';
    const html='<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;line-height:1.55;color:#111;padding:36px}h1,h2,h3{color:#10263b}p{margin:0 0 10px}li{margin:4px 0}</style></head><body>'+documentHtmlFromMarkdown(text)+'</body></html>';
    const blob=new Blob(['\ufeff',html],{type:'application/msword;charset=utf-8'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=safeTitle+'.doc';document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1200);
  }
  function printDocumentPdf(text){
    const frame=document.createElement('iframe');
    frame.style.position='fixed';frame.style.right='0';frame.style.bottom='0';frame.style.width='1px';frame.style.height='1px';frame.style.opacity='0';frame.style.pointerEvents='none';
    document.body.appendChild(frame);
    const doc=frame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Documento VentaNexIA</title><style>@page{margin:18mm}body{font-family:Arial,sans-serif;line-height:1.55;color:#111;font-size:12pt}h1{font-size:22pt}h2{font-size:17pt}h3{font-size:14pt}p{margin:0 0 9pt}li{margin:3pt 0}hr{border:0;border-top:1px solid #bbb}</style></head><body>'+documentHtmlFromMarkdown(text)+'</body></html>');
    doc.close();
    setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}finally{setTimeout(()=>frame.remove(),1200)}},250);
  }
  function renderAiDocumentResult(out,reply=''){
    const source=String(reply||'Sin respuesta');
    const fields=documentFieldsFromText(source);
    const values={};
    const fieldsHtml=fields.length
      ?'<aside class="vnx-doc-fields"><div class="vnx-doc-fields-head"><b>✍️ Rellena el documento</b><span>'+fields.length+' campo'+(fields.length===1?'':'s')+'</span></div><p>Completa los datos y el documento de la izquierda se actualizará al momento.</p><div class="vnx-doc-fields-list">'+fields.map(f=>'<label><span>'+escM(f.label)+'</span><input type="text" data-doc-field="'+escM(f.key)+'" placeholder="'+escM(f.label)+'"></label>').join('')+'</div></aside>'
      :'<aside class="vnx-doc-fields empty"><b>✓ Documento preparado</b><p>No he detectado campos pendientes de rellenar.</p></aside>';
    out.innerHTML='<div class="guided-result-head vnx-doc-toolbar"><div><b>Documento preparado</b><small>Vista limpia · puedes completarlo antes de guardarlo</small></div><div class="vnx-doc-actions"><button type="button" class="mini" data-doc-copy>Copiar</button><button type="button" class="mini" data-doc-word>Guardar en Word</button><button type="button" class="mini" data-doc-pdf>Imprimir / PDF</button><button type="button" data-guided-continue-free class="mini">Modo libre</button></div></div>'
      +'<div class="vnx-doc-workspace"><section class="vnx-doc-preview"><div class="vnx-doc-paper" data-doc-preview>'+documentHtmlFromMarkdown(source)+'</div></section>'+fieldsHtml+'</div>';
    const preview=out.querySelector('[data-doc-preview]');
    const currentText=()=>fillDocumentText(source,values);
    const refresh=()=>{if(preview)preview.innerHTML=documentHtmlFromMarkdown(currentText())};
    out.querySelectorAll('[data-doc-field]').forEach(input=>input.addEventListener('input',()=>{values[input.dataset.docField]=input.value;refresh()}));
    const copy=out.querySelector('[data-doc-copy]');
    if(copy)copy.onclick=async()=>{try{await navigator.clipboard.writeText(currentText());const old=copy.textContent;copy.textContent='Copiado ✓';setTimeout(()=>copy.textContent=old,1200)}catch{copy.textContent='No se pudo copiar'}};
    const word=out.querySelector('[data-doc-word]');
    if(word)word.onclick=()=>downloadDocumentWord('Documento VentaNexIA',currentText());
    const pdf=out.querySelector('[data-doc-pdf]');
    if(pdf)pdf.onclick=()=>printDocumentPdf(currentText());
  }
  async function appendReadyOrdersExport(out){
    if(!out||!window.vnx?.ordersExportReady||!window.vnx?.exportData)return;
    let data;try{data=await window.vnx.ordersExportReady()}catch(e){return}
    const box=document.createElement('div');box.className='vnx-order-export-box';
    if(!data?.count){
      box.innerHTML='<b>Exportación de pedidos</b><small>No hay pedidos verificados y listos para exportar todavía.</small>';
      out.appendChild(box);return;
    }
    box.innerHTML='<div><b>'+data.count+' pedido'+(data.count===1?'':'s')+' listo'+(data.count===1?'':'s')+' para exportar</b><small>Son pedidos ya revisados. Exportar no los introduce en tu programa.</small></div><div class="row"><button type="button" class="mini" data-order-export="excel">Excel</button><button type="button" class="mini" data-order-export="pdf">PDF</button><button type="button" class="mini" data-order-export="print">Imprimir</button></div>';
    out.appendChild(box);
    box.querySelectorAll('[data-order-export]').forEach(b=>b.onclick=async()=>{
      const format=b.dataset.orderExport,old=b.textContent;b.disabled=true;b.textContent='Preparando…';
      try{
        const r=await window.vnx.exportData({format,title:'Pedidos listos - VentaNexIA',headers:data.headers,rows:data.rows});
        b.textContent=r?.ok?(format==='print'?'Impresión abierta ✓':'Guardado ✓'):old;
      }catch(e){alert('No he podido '+(format==='print'?'imprimir':'exportar')+': '+(e.message||e));b.textContent=old}
      finally{setTimeout(()=>{if(b.isConnected){b.disabled=false;if(/✓/.test(b.textContent))b.textContent=old}},1500)}
    });
  }

  async function runGuided(){
    const scope=selectedChatScope(),out=$m('#guidedResult'),btn=$m('#guidedPrimaryAction');if(!scope||!btn||!out)return;
    const cfg=guidedConfig(scope.key),data=guidedRead(scope.key);
    const missing=(cfg.fields||[]).filter(f=>f.required&&!String(data[f.key]||'').trim());
    if(missing.length){out.style.display='block';out.innerHTML='<b>Falta completar:</b> '+escM(missing.map(x=>x.label).join(', '));return}
    if(cfg.consent&&!$m('#guidedConsent')?.checked){out.style.display='block';out.textContent='Confirma primero los criterios de búsqueda.';return}
    if(scope.needsSourceChoice){out.style.display='block';out.textContent='Tienes varias conexiones para este empleado. Elige arriba una conexión o “Todas, separadas”.';return}
    if(scope.included===false){out.style.display='block';out.textContent='Este agente no está incluido en tu plan.';return}
    if(scope.connected===false){out.style.display='block';out.textContent='Este agente necesita una conexión. Configúrala en Conexiones y vuelve aquí.';return}
    btn.disabled=true;const old=btn.textContent;btn.textContent='Trabajando…';out.style.display='block';out.innerHTML='<div class="guided-loading">VentaNexIA está trabajando con tus datos…</div>';
    try{
      let r;
      if(scope.key==='whatsapp'){
        const manual=String(data.mode||'').startsWith('WhatsApp normal')||whatsappManualModeEnabled();
        const automatic=String(data.mode||'').includes('responder automáticamente');
        if(!manual){
          if(automatic&&!data.billingAck)throw new Error('Confirma primero que los posibles cargos de Meta corresponden a la cuenta de WhatsApp para empresa del cliente.');
          await window.vnx.whatsappRuntime({action:'set_mode',mode:automatic?'automatic':'approval',billingAcknowledged:Boolean(data.billingAck)});
        }
        if(String(data.task||'').toLowerCase().includes('pendientes')){
          r=await window.vnx.whatsappRuntime({action:'pending'});
          renderWhatsAppPending(out,r?.drafts||[]);
          return;
        }
      }
      if(scope.key==='prospecting'){
        const profile=['mi empresa: '+data.company,'vendemos: '+data.offer,data.web?'web: '+data.web:'',data.signature?'firma: '+data.signature:''].filter(Boolean).join('; ');
        await window.vnx.sendChat([{role:'user',content:profile}],scope);
        const search='busca '+(data.count||10)+' '+data.buyer+' en '+data.zone+(data.condition?'. Condición: '+data.condition:'');
        r=await window.vnx.sendChat([{role:'user',content:search}],scope);
      }else{
        const prompt=guidedPrompt(scope.key,data);
        r=scope.separateSources?await sendSeparatedBySources(prompt,scope,[{role:'user',content:prompt}]):await window.vnx.sendChat([{role:'user',content:prompt}],scope);
      }
      if(scope.key==='prospecting'&&renderProspectingResults(out,r,data,scope)){
        // La captación se muestra como oportunidades visuales con datos estructurados reales.
      }else if(scope.key==='email'&&r?.emailActions?.options?.length){
        const meta=r.emailActions;
        out.innerHTML='<div class="guided-result-head"><b>Email encontrado</b><button type="button" data-guided-continue-free class="mini">Abrir modo libre</button></div>'
          +'<div class="guided-result-copy vnx-rich-result">'+documentHtmlFromMarkdown(r?.reply||'Elige qué quieres hacer.')+'</div>'
          +'<div class="guided-email-actions">'+meta.options.map(a=>'<button type="button" class="mini guided-email-action" data-email-action="'+escM(a.key)+'">'+escM(a.label)+'</button>').join('')+'</div>'
          +'<small class="guided-email-safety">Nada se envía sin tu confirmación. Puedes crear un borrador en Gmail y revisarlo antes.</small>';
        out.querySelectorAll('.guided-email-action').forEach(actionBtn=>actionBtn.onclick=async()=>{
          const action=actionBtn.dataset.emailAction;
          let body='',cc='';
          if(['draft_reply','send_reply','send_reply_cc'].includes(action)){
            const edited=await openReplyEditor({meta,action});if(!edited)return;
            body=edited.body;cc=edited.cc||'';
          }
          if(['trash','send_reply','send_reply_cc'].includes(action)&&!confirm(action==='trash'?'¿Mover este correo a la papelera?':'¿Enviar esta respuesta ahora?'))return;
          const oldLabel=actionBtn.textContent;actionBtn.disabled=true;actionBtn.textContent='Procesando…';
          try{
            const done=await window.vnx.emailAction({account:meta.account,messageId:meta.messageId,threadId:meta.threadId,subject:meta.subject,from:meta.from,action,body,cc});
            const note=document.createElement('div');note.className='guided-email-done';note.textContent=done?.message||'Acción completada.';out.appendChild(note);await refreshChatConnections();
          }catch(e){alert('No he podido completar la acción: '+(e.message||e))}
          finally{actionBtn.disabled=false;actionBtn.textContent=oldLabel}
        });
        const cont=out.querySelector('[data-guided-continue-free]');if(cont)cont.onclick=()=>{setWorkspaceMode('free');masterMessages=[{role:'assistant',content:r?.reply||'Email localizado.',emailActions:r.emailActions}];renderMasterMessages();};
      }else if(scope.key==='core_ai'){
        renderAiDocumentResult(out,r?.reply||'Sin respuesta');
        const cont=out.querySelector('[data-guided-continue-free]');if(cont)cont.onclick=()=>{setWorkspaceMode('free');masterMessages=[{role:'assistant',content:r?.reply||'Sin respuesta'}];renderMasterMessages();};
      }else{
        out.innerHTML='<div class="guided-result-head"><b>Resultado</b><button type="button" data-guided-continue-free class="mini">Continuar en modo libre</button></div><div class="guided-result-copy vnx-rich-result">'+documentHtmlFromMarkdown(r?.reply||'Sin respuesta')+'</div>';
        const cont=out.querySelector('[data-guided-continue-free]');if(cont)cont.onclick=()=>{setWorkspaceMode('free');masterMessages=[{role:'assistant',content:r?.reply||'Sin respuesta'}];renderMasterMessages();};
      }
      if(scope.key==='orders'&&String(data.orderOutput||'').startsWith('Excel / PDF'))await appendReadyOrdersExport(out);
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
    if(!isGuided)setTimeout(()=>keepChatComposerUsable({focus:true}),30);
  }
  function workbenchLanguage(){return localStorage.getItem('vnx_translation_language')||'Español'}
  function likelyForeignMail(m={}){
    const s=(' '+String(m.subject||'')+' '+String(m.snippet||'')+' ').toLowerCase();
    const spanish=/\b(hola|gracias|pedido|factura|cliente|buenos|buenas|por favor|adjunto|saludos)\b/.test(s);
    const foreign=/\b(hello|hi|thanks|thank you|order|invoice|please|regards|bonjour|merci|commande|facture|bitte|danke|bestellung|rechnung|ciao|grazie|ordine|fattura|obrigado|pedido|fatura)\b/.test(s);
    return foreign&&!spanish;
  }
  function sourceKindLabel(source={}){
    const module=String(source.module||source.key||source.integration||'').toLowerCase();
    const provider=String(source.provider||'').toLowerCase();
    const label=String(source.label||source.name||source.shopName||source.shop||'');
    if(module==='shopify'||provider==='shopify'||/shopify/i.test(label))return {kind:'store',icon:'🛍️',title:'Tienda online',detail:'Shopify · ventas, productos y stock de la tienda'};
    if(module==='orders'||module==='erp'||provider==='erp'||/naturdesma|holded|odoo|dolibarr|factusol|erp|programa/i.test(label))return {kind:'company',icon:'🏢',title:'Programa de empresa',detail:'Pedidos, clientes, facturación o stock del programa conectado'};
    if(module==='email')return {kind:'email',icon:'✉️',title:'Correo',detail:'Cuenta de email conectada'};
    return {kind:'other',icon:'🔗',title:'Otra conexión',detail:'Fuente conectada a VentaNexIA'};
  }
  function decorateSourceOptions(select){
    if(!select)return;
    [...select.options].forEach(opt=>{
      if(!opt.value||/todas/i.test(opt.textContent||''))return;
      let src=null;
      try{const parsed=JSON.parse(opt.value);src=parsed&&typeof parsed==='object'?parsed:null}catch{}
      if(!src){
        const txt=String(opt.textContent||'');
        src=(runtimeConnections||[]).find(x=>txt.includes(x.label||x.name||x.shop||'')||String(x.label||x.name||x.shop||'').includes(txt));
      }
      const meta=sourceKindLabel(src||{label:opt.textContent});
      const clean=String(opt.textContent||'').replace(/^\s*[🛍️🏢✉️🔗]\s*(Tienda online|Programa de empresa|Correo|Otra conexión)?\s*[·—:-]?\s*/,'').trim();
      opt.textContent=meta.icon+' '+meta.title+' · '+clean;
      opt.dataset.sourceKind=meta.kind;
    });
  }

  function openConnectionsTab(module){
    document.querySelector('[data-tab="agents"]')?.click();
    if(!module)return;
    setTimeout(()=>{
      if(module==='orders'){document.querySelector('[data-tab="chat"]')?.click();selectAgentKey('orders');return}
      if(module==='shopify'){document.querySelector('[data-real-module="shopify"]')?.click();return}
      if(typeof window.vnxOpenServiceWizard==='function'&&['email','whatsapp','crm','agenda','social'].includes(module)){window.vnxOpenServiceWizard(module,null);return}
      document.querySelector('[data-real-module="'+module+'"]')?.click();
    },120);
  }
  function updateWorkbenchAgent(chosen){
    const name=$m('#vnxRailAgentName');
    if(name)name.textContent=chosen?.key==='core_ai'?'Carla · Secretaria ejecutiva':(chosen?.name||'Carla · Secretaria ejecutiva');
  }
  async function refreshWorkbenchAgenda(){
    const root=$m('#vnxAgendaList');if(!root||!window.vnx?.agendaToday)return;
    root.innerHTML='<div class="vnx-empty-mini">Comprobando agenda…</div>';
    try{
      const r=await window.vnx.agendaToday();
      const events=Array.isArray(r?.events)?r.events:[];
      if(!r?.connected){root.innerHTML='<div class="vnx-empty-mini">Agenda no conectada. Pulsa Gestionar para conectar Google o Microsoft Calendar.</div>';return}
      if(!events.length){root.innerHTML='<div class="vnx-empty-mini">No tienes reuniones en la agenda de hoy.</div>';return}
      root.innerHTML=events.slice(0,8).map(e=>{
        const d=e.allDay?null:new Date(e.start);
        const time=e.allDay?'Todo el día':(Number.isNaN(d?.getTime?.())?'':d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}));
        return '<div class="vnx-agenda-item"><span class="vnx-agenda-time">'+escM(time)+'</span><div><b>'+escM(e.title||'(sin título)')+'</b><small>'+escM(e.location||e.organizer||'Agenda')+'</small></div></div>';
      }).join('');
      const hc=$m('#homeAgendaCount');if(hc)hc.textContent=String(events.length);
    }catch(e){root.innerHTML='<div class="vnx-empty-mini">No he podido leer la agenda: '+escM(String(e?.message||e).slice(0,90))+'</div>';const hc=$m('#homeAgendaCount');if(hc)hc.textContent='—'}
  }
  function refreshWorkbenchApprovals(){
    const root=$m('#vnxApprovalsList'),count=$m('#vnxApprovalsCount'),badge=$m('#vnxPendingBadge');if(!root)return;
    const pending=[];
    masterMessages.forEach((m,i)=>{
      if(m?.emailActions)pending.push({title:'Correo preparado para revisar',detail:m.emailActions.subject||m.emailActions.from||'Email',index:i});
      if(m?.handoff)pending.push({title:'Tarea preparada para '+(m.handoff.agentName||'otro empleado'),detail:m.handoff.task||'',index:i});
    });
    for(const m of secretaryNewMails.filter(x=>Number(x.replyScore||0)>0))pending.push({title:'Correo que parece necesitar respuesta',detail:(m.subject||'(sin asunto)')+' · '+(m.from||''),emailId:m.id});
    const unique=pending.filter((x,i,a)=>a.findIndex(y=>y.title===x.title&&y.detail===x.detail)===i).slice(0,6);
    if(count)count.textContent=String(unique.length);
    if(badge){badge.textContent=String(unique.length);badge.style.display=unique.length?'inline-grid':'none'}
    root.innerHTML=unique.length?unique.map(x=>'<button type="button" class="vnx-approval-item" data-vnx-approval><span>●</span><div><b>'+escM(x.title)+'</b><small>'+escM(String(x.detail||'').slice(0,100))+'</small></div></button>').join(''):'<div class="vnx-empty-mini">No hay aprobaciones pendientes conocidas.</div>';
    root.querySelectorAll('[data-vnx-approval]').forEach(b=>b.onclick=()=>{setWorkspaceMode('free');$m('#messages')?.scrollIntoView({block:'nearest'})});
  }
  async function refreshWorkbenchConnections(){
    const buttons=$$m('[data-vnx-connect]');if(!buttons.length)return;
    let conns=[];try{conns=await window.vnx.listConnections()||[]}catch{}
    let shop=null;try{shop=await window.vnx.shopifyStatus()}catch{}
    const readyAgent=k=>(runtimeAgents||[]).find(a=>a.key===k);
    for(const b of buttons){
      const key=b.dataset.vnxConnect,small=b.querySelector('small');let ok=false;
      if(key==='shopify')ok=shop?.status==='connected';
      else if(key==='email')ok=conns.some(x=>x.module==='email');
      else if(key==='whatsapp')ok=conns.some(x=>x.module==='whatsapp')||Boolean(getRealSourcesForChat()?.whatsapp);
      else if(key==='agenda')ok=conns.some(x=>x.module==='agenda');
      else if(key==='crm')ok=conns.some(x=>x.module==='crm');
      else if(key==='orders')ok=Boolean(readyAgent('orders')?.included);
      b.classList.toggle('is-connected',ok);b.classList.toggle('needs-connection',!ok);
      if(small)small.textContent=ok?'Conectado':'Falta conectar';
    }
  }
  async function refreshHomeReplenishment(){
    const root=$m('#homeStockRows'),meta=$m('#homeStockMeta'),card=$m('#homeStockCard');
    if(!root||!window.vnx?.shopifyReplenishmentSummary)return;
    root.innerHTML='<div class="vnx-home-empty">Calculando previsión con ventas reales…</div>';
    try{
      const r=await window.vnx.shopifyReplenishmentSummary();
      const rows=(r?.rows||[]).slice().sort((a,b)=>(Number(b.urgent)-Number(a.urgent))||((a.daysRemaining??999999)-(b.daysRemaining??999999))).slice(0,5);
      if(meta)meta.textContent='Ventas por SKU/EAN · últimos '+(r?.windowDays||180)+' días · '+(r?.ordersSeen||0)+' pedidos revisados';
      if(!rows.length){root.innerHTML='<div class="vnx-home-empty">No hay referencias con SKU para analizar.</div>';return}
      root.innerHTML=rows.map(x=>{
        const state=x.urgent?'Urgente':x.daysRemaining!=null&&x.daysRemaining<14?'Revisar':'Correcto';
        const cls=x.urgent?'urgent':state==='Revisar'?'warn':'ok';
        const days=x.daysRemaining==null?'Sin ventas':x.daysRemaining+' días';
        return '<button type="button" class="vnx-stock-row '+cls+'" data-home-stock><span><b>'+escM(x.sku||x.ean||'Sin SKU/EAN')+'</b><small>'+escM(x.product||'Producto')+'</small></span><span>'+Number(x.stock||0)+' uds</span><span>'+escM(days)+'</span><span>'+state+'</span></button>';
      }).join('');
      root.querySelectorAll('[data-home-stock]').forEach(b=>b.onclick=()=>{selectAgentKey('web_ecommerce',{preserve:true});setWorkspaceMode('free');document.querySelector('[data-tab="chat"]')?.click();const input=$m('#chatInput');if(input){input.value='Analiza stock, riesgo de rotura y reposición de mi Shopify para los próximos 30 días';input.focus()}});
      if(card)card.classList.toggle('has-urgent',(r?.urgent||[]).length>0);
    }catch(e){
      if(meta)meta.textContent='Conecta Shopify para ver una previsión real.';
      root.innerHTML='<button type="button" class="vnx-home-empty action" data-home-connect-shopify>Conectar Shopify →</button>';
      root.querySelector('[data-home-connect-shopify]')?.addEventListener('click',()=>openConnectionsTab('shopify'));
    }
  }

  function bindHomeDashboard(){
    const bindAll=(selector,fn)=>Array.from(document.querySelectorAll(selector)).forEach(el=>{if(el.dataset.vnxHomeBound)return;el.dataset.vnxHomeBound='1';el.addEventListener('click',fn)});
    bindAll('[data-home-carla]',()=>{selectAgentKey('core_ai',{preserve:true});setWorkspaceMode('free');document.querySelector('[data-tab="chat"]')?.click();$m('#chatInput')?.focus()});
    bindAll('[data-home-email]',()=>runEmailWorkbench('summary'));
    bindAll('[data-home-orders]',()=>{selectAgentKey('orders',{preserve:true});setWorkspaceMode('free');document.querySelector('[data-tab="chat"]')?.click()});
    bindAll('[data-home-clients]',()=>{selectAgentKey('prospecting',{preserve:true});setWorkspaceMode('free');document.querySelector('[data-tab="chat"]')?.click()});
    bindAll('[data-home-document]',()=>{selectAgentKey('administration',{preserve:true});setWorkspaceMode('free');document.querySelector('[data-tab="chat"]')?.click();const input=$m('#chatInput');if(input){input.value='Quiero crear un documento';input.focus()}});
    bindAll('[data-home-stock-open]',()=>{selectAgentKey('web_ecommerce',{preserve:true});setWorkspaceMode('free');document.querySelector('[data-tab="chat"]')?.click();const input=$m('#chatInput');if(input){input.value='Analiza stock, riesgo de rotura y reposición de mi Shopify';input.focus()}});
    const main=$m('#homeQuickInput'),send=$m('#homeQuickSend');
    const submit=()=>{const text=String(main?.value||'').trim();if(!text)return;selectAgentKey('core_ai',{preserve:true});setWorkspaceMode('free');document.querySelector('[data-tab="chat"]')?.click();const input=$m('#chatInput');if(input){input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus()}};
    if(send)send.onclick=submit;
    if(main)main.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}});
  }

  async function runEmailWorkbench(kind='summary'){
    const agent=(runtimeAgents||[]).find(x=>x.key==='email');
    if(!agent?.included){masterMessages.push({role:'assistant',content:'Email no está incluido en tu plan actual.'});setWorkspaceMode('free');renderMasterMessages();return}
    if(!agent?.connected&&!agent?.ready){openConnectionsTab('email');return}
    selectAgentKey('email',{preserve:true});setWorkspaceMode('free');
    const lang=workbenchLanguage();
    const prompt=kind==='translate'
      ?'Revisa los correos recientes. Detecta cuáles están en un idioma distinto y tradúcelos al '+lang+'. Muestra primero remitente y asunto, después la traducción completa o suficiente para entender y responder. No envíes nada ni modifiques correos.'
      :'Revisa mis correos recientes y ordénalos para que pueda entenderlos de un vistazo. FORMATO OBLIGATORIO: # Resumen rápido; ## Pedidos; ## Facturas y recibos; ## Consultas de clientes; ## Cobros e impagos; ## Reclamaciones y problemas; ## Informativos / no requieren respuesta; ## Qué tengo que hacer hoy. En Resumen rápido indica cantidades por categoría y máximo 5 puntos. Dentro de cada categoría muestra solo correos que realmente correspondan y usa una línea por correo con: Cuenta | De | Asunto | Qué significa | Acción recomendada. Si una categoría no tiene correos, escribe "Sin correos". No mezcles categorías, no inventes y no envíes nada.';
    masterMessages.push({role:'user',content:kind==='translate'?'🌐 Traducir correos recientes a '+lang:'✉️ Resumen de emails'});renderMasterMessages();
    try{
      const r=await window.vnx.sendChat([{role:'user',content:prompt}],selectedChatScope());
      masterMessages.push({role:'assistant',content:r.reply||'No he podido revisar los correos.',emailActions:r.emailActions||null,emailActionGroups:r.emailActionGroups||[],handoff:r.handoff||null});renderMasterMessages({focusIndex:masterMessages.length-1});
    }catch(e){masterMessages.push({role:'assistant',content:'No he podido revisar el correo: '+(e.message||e)});renderMasterMessages()}
  }
  async function autoTranslateFreshEmails(){ return; }
  function setWorkbenchExpanded(on){
    document.body.classList.toggle('vnx-focus-chat',Boolean(on));
    const btn=$m('#vnxExpandWorkbench');if(btn)btn.textContent=on?'✕ Salir de pantalla completa':'⛶ Expandir';
    localStorage.setItem('vnx_workbench_expanded',on?'on':'off');
  }
  let workQueueCache={at:0,rows:[]};
  function emailNeedsDecision(m={}){
    const s=(' '+String(m.subject||'')+' '+String(m.snippet||'')+' '+String(m.body||'')+' ').toLowerCase();
    return Number(m.attentionScore||0)>=6||/\b(descuent|precio especial|rebaja|devoluci[oó]n|reembolso|cancel|reclamaci[oó]n|queja|contrato|legal|abogad|impago|pago pendiente|condiciones de pago|vencimiento|compensaci[oó]n|penalizaci[oó]n|excepci[oó]n|entrega urgente|plazo excepcional)\b/.test(s);
  }
  function emailAsksForReply(m={}){
    const subject=String(m.subject||'').toLowerCase();
    const snippetBody=String(m.snippet||'')+' '+String(m.body||'');
    const body=(' '+snippetBody+' ').toLowerCase();
    const phrase=/\b(responde|resp[oó]ndenos|contesta|confirma(?:r|nos)?(?: por favor)?|necesitamos (?:tu|la) (?:respuesta|confirmaci[oó]n)|quedamos a la espera|esperamos tu respuesta|puedes confirmar|puedes decirnos|podeis confirmar|pod[eé]is confirmar|podr[ií]ais confirmar|nos pod[eé]is (?:decir|confirmar)|could you|please reply|let us know)\b/.test(body);
    const question=/[?¿]/.test(subject+' '+snippetBody)&&Number(m.replyScore||0)>-5;
    return phrase||question;
  }
  function emailIsInformative(m={}){
    if(m.noReply)return true;
    const from=String(m.from||'').toLowerCase();
    const subject=String(m.subject||'').toLowerCase();
    const body=(' '+String(m.snippet||'')+' '+String(m.body||'')+' ').toLowerCase();
    const noReplySender=/\b(no[-_. ]?reply|noreply|do[-_. ]?not[-_. ]?reply|donotreply|mailer-daemon|notification[s]?|notifications|avisos?)\b/.test(from);
    const automaticSubject=/\b(confirmaci[oó]n|confirmado|recibo|factura emitida|newsletter|bolet[ií]n|notificaci[oó]n|aviso|actualizaci[oó]n|estado del pedido|pedido recibido|pago recibido|suscripci[oó]n|resumen semanal|resumen mensual|informe autom[aá]tico|copia de seguridad|backup)\b/.test(subject);
    const automaticBody=/\b(este (?:es|ha sido) un mensaje autom[aá]tico|no respondas a este (?:mensaje|correo)|do not reply|please do not reply|mensaje generado autom[aá]ticamente)\b/.test(body);
    return noReplySender||automaticBody||(automaticSubject&&!emailAsksForReply(m));
  }
  function automaticEmailIds(){try{return new Set(JSON.parse(localStorage.getItem('vnx_auto_replied_ids')||'[]'))}catch{return new Set()}}
  function emailWorkBucket(m={}){
    const auto=automaticEmailIds();
    if(auto.has(m.id))return 'automatic';
    if(m.responded)return 'resolved';
    if(emailNeedsDecision(m))return 'decision';
    if(emailIsInformative(m))return 'informative';
    if(Number(m.replyScore||0)>0||emailAsksForReply(m))return 'review';
    return 'informative';
  }
  async function loadWorkQueueData(force=false){
    if(!force&&Date.now()-workQueueCache.at<45000)return workQueueCache.rows;
    const r=await window.vnx.emailInbox({limit:30});
    const rows=Array.isArray(r?.messages)?r.messages:[];
    workQueueCache={at:Date.now(),rows};return rows;
  }
  function workCounts(rows=[]){
    const out={automatic:0,review:0,decision:0,informative:0,resolved:0,pending:0};
    rows.forEach(m=>{
      const k=emailWorkBucket(m);
      if(k==='informative'){if(m.unread)out.informative++;return}
      out[k]=(out[k]||0)+1;
    });
    return out;
  }
  function accountIndexForMail(m){
    const list=(runtimeConnections||[]).filter(x=>(x.module||x.key)==='email');
    return list.findIndex(x=>String(x.label||x.account||'').trim().toLowerCase()===String(m.account||'').trim().toLowerCase());
  }
  async function aiReplyForWorkItem(m,decision=''){
    const idx=accountIndexForMail(m),scope={type:'agent',key:'email',name:'Email',included:true,connected:true,ready:true,accountIndex:idx>=0?idx:null};
    const prompt='Prepara SOLO el texto final de respuesta para este correo. No envíes nada. Mantén nombres, cifras, fechas y referencias. '+(decision?'Decisión del usuario: '+decision+'. ':'')+'De: '+(m.from||'')+'\nAsunto: '+(m.subject||'')+'\nCorreo:\n'+String(m.body||m.snippet||'').slice(0,9000);
    const r=await window.vnx.sendChat([{role:'user',content:prompt}],scope);
    return String(r?.reply||m.defaultBody||'').trim();
  }
  function groupWorkByAccount(rows=[]){
    const map=new Map();for(const m of rows){const k=m.account||'Cuenta de correo';if(!map.has(k))map.set(k,[]);map.get(k).push(m)}return [...map.entries()];
  }
  function workItemHtml(m,tab,index){
    const original=String(m.body||m.snippet||'').slice(0,1400);
    const sent=String(m.sentBody||'').trim();
    const suggested=(tab==='resolved'||tab==='automatic')?(sent||'Respuesta detectada. Pulsa “Cargar última respuesta” para verla sin ralentizar la bandeja.'):(tab==='informative'?'':(m.defaultBody||''));
    const decision=tab==='decision'?'<div class="vnx-work-decision"><input data-work-decision placeholder="Indica tu decisión. Ej.: ofrece 10 % y entrega en 7 días"><button class="btn outline" data-work-apply-decision>Preparar con mi decisión</button></div>':'';
    const status=tab==='automatic'?'Enviado automáticamente':tab==='resolved'?'Resuelto':tab==='informative'?(m.unread?'Informativo · pendiente de ver':'Informativo · visto'):tab==='decision'?'Necesita tu decisión':'Importante · revisar';
    const statusClass=tab==='automatic'?'automatic':tab==='resolved'?'resolved':tab==='informative'?'informative':tab==='decision'?'decision':'review';
    const buttons=(tab==='resolved'||tab==='automatic'||tab==='informative')
      ?((tab==='resolved'&&!sent)?'<button class="primary" data-work-load-sent>Cargar última respuesta</button>':'')+(tab==='informative'&&m.unread?'<button class="primary" data-work-seen>✓ Visto</button>':'')+'<button data-work-open>Ver conversación en Gmail</button>'
      :'<button class="primary" data-work-send>Enviar</button><button data-work-edit>Modificar</button><button data-work-ai>Mejorar con IA</button><button data-work-draft>Guardar borrador</button><button data-work-no-reply>No requiere respuesta</button>';
    const responseTitle=tab==='automatic'?'Respuesta enviada automáticamente':tab==='resolved'?'Última respuesta enviada':tab==='informative'?'Clasificación de Carla':'Respuesta preparada por Carla';
    const reason=tab==='decision'
      ?'Carla ha detectado que este correo puede implicar precio, condiciones, reclamación u otra decisión que debe tomar una persona.'
      :tab==='automatic'
        ?'Esta respuesta figura como enviada automáticamente por VentaNexIA.'
        :tab==='resolved'
          ?'Esta conversación ya aparece como atendida.'
          :tab==='informative'
            ?(m.unread?'Carla ha detectado que es informativo y no requiere respuesta. Márcalo como “Visto” cuando lo hayas revisado.':'Correo informativo ya marcado como visto; no cuenta como pendiente.')
            :'Carla lo considera importante y lo ha dejado para que lo revises antes de responder o cerrar.';
    return '<article class="vnx-work-item '+statusClass+'" data-work-index="'+index+'">'
      +'<div class="vnx-work-item-head"><div><span class="vnx-work-status '+statusClass+'">'+escM(status)+'</span><b>'+escM(m.subject||'(sin asunto)')+'</b><small>'+escM(m.from||'Remitente no disponible')+' · '+escM(m.date||'Fecha no disponible')+'</small></div><span class="vnx-work-chip">✉ '+escM(m.account||'Email')+'</span></div>'
      +'<div class="vnx-work-why">'+escM(reason)+'</div>'
      +'<div class="vnx-work-columns"><div class="vnx-work-pane"><h4>Correo recibido</h4><p>'+escM(original||'Sin contenido').replace(/\n/g,'<br>')+'</p></div><div class="vnx-work-pane"><h4>'+escM(responseTitle)+'</h4>'+((tab==='resolved'||tab==='automatic')?'<p data-work-sent>'+escM(suggested).replace(/\n/g,'<br>')+'</p>':tab==='informative'?'<p>Este correo se ha separado de tus pendientes porque no parece necesitar contestación.</p>':'<textarea data-work-reply>'+escM(suggested)+'</textarea>')+decision+'</div></div>'
      +'<div class="vnx-work-actions">'+buttons+'</div><div data-work-msg style="font-size:9px;color:#88b4ca;margin-top:7px"></div></article>';
  }
  async function renderWorkQueue(overlay,tab='review',force=false){
    const body=overlay.querySelector('[data-work-body]'),tabs=[...overlay.querySelectorAll('[data-work-tab]')];body.innerHTML='<div class="vnx-work-empty">Revisando tus cuentas de correo…</div>';
    try{
      const rows=await loadWorkQueueData(force),counts=workCounts(rows),auto=automaticEmailIds();
      tabs.forEach(b=>{const k=b.dataset.workTab;b.classList.toggle('active',k===tab);const n=b.querySelector('b');if(n)n.textContent=String(counts[k]||0)});
      let selected=rows.filter(m=>emailWorkBucket(m)===tab);
      if(tab==='automatic')selected=rows.filter(m=>auto.has(m.id));
      if(tab==='informative')selected=[...selected].sort((a,b)=>Number(Boolean(b.unread))-Number(Boolean(a.unread)));
      const groups=groupWorkByAccount(selected);
      body.innerHTML=groups.length?groups.map(([account,items])=>'<section><h3 class="vnx-work-account">'+escM(account)+'</h3>'+items.map((m,i)=>workItemHtml(m,tab,rows.indexOf(m))).join('')+'</section>').join(''):'<div class="vnx-work-empty">'+(tab==='automatic'?'No hay respuestas automáticas registradas. Solo aparecerán aquí envíos automáticos que VentaNexIA haya confirmado.':tab==='review'?'No hay correos importantes pendientes de revisión.':tab==='decision'?'No hay decisiones pendientes.':tab==='informative'?'No hay correos informativos en la bandeja cargada.':'No hay conversaciones resueltas en la bandeja cargada.')+'</div>';
      body.querySelectorAll('[data-work-index]').forEach(card=>{
        const m=rows[Number(card.dataset.workIndex)],msg=card.querySelector('[data-work-msg]'),ta=card.querySelector('[data-work-reply]');
        card.querySelector('[data-work-edit]')?.addEventListener('click',()=>{ta?.focus();msg.textContent='Puedes modificar la respuesta antes de enviarla.'});
        card.querySelector('[data-work-ai]')?.addEventListener('click',async()=>{msg.textContent='Preparando una respuesta mejor…';try{ta.value=await aiReplyForWorkItem(m);msg.textContent='Respuesta actualizada. Revísala antes de enviar.'}catch(e){msg.textContent=e.message||String(e)}});
        card.querySelector('[data-work-apply-decision]')?.addEventListener('click',async()=>{const input=card.querySelector('[data-work-decision]'),decision=String(input?.value||'').trim();if(!decision){msg.textContent='Indica primero qué decisión quieres tomar.';return}msg.textContent='Aplicando tu decisión…';try{ta.value=await aiReplyForWorkItem(m,decision);msg.textContent='Respuesta preparada con tu decisión. Puedes modificarla o enviarla.'}catch(e){msg.textContent=e.message||String(e)}});
        card.querySelector('[data-work-draft]')?.addEventListener('click',async()=>{if(!ta?.value.trim())return;msg.textContent='Guardando borrador…';try{await window.vnx.emailAction({account:m.account,messageId:m.id,threadId:m.threadId,subject:m.subject,from:m.from,action:'draft_reply',body:ta.value});msg.textContent='Borrador creado en Gmail.'}catch(e){msg.textContent=e.message||String(e)}});
        card.querySelector('[data-work-send]')?.addEventListener('click',async()=>{if(!ta?.value.trim())return;if(!confirm('¿Enviar esta respuesta ahora desde '+(m.account||'esta cuenta')+'?'))return;msg.textContent='Enviando…';try{await window.vnx.emailAction({account:m.account,messageId:m.id,threadId:m.threadId,subject:m.subject,from:m.from,action:'send_reply',body:ta.value});workQueueCache.at=0;msg.textContent='Respuesta enviada. La conversación pasará a Resueltos.';setTimeout(()=>renderWorkQueue(overlay,'resolved',true),500)}catch(e){msg.textContent=e.message||String(e)}});
        card.querySelector('[data-work-no-reply]')?.addEventListener('click',async()=>{msg.textContent='Actualizando…';try{await window.vnx.emailAction({account:m.account,messageId:m.id,threadId:m.threadId,subject:m.subject,from:m.from,action:'no_reply_needed'});workQueueCache.at=0;setTimeout(()=>renderWorkQueue(overlay,tab,true),300)}catch(e){msg.textContent=e.message||String(e)}});
        card.querySelector('[data-work-seen]')?.addEventListener('click',async e=>{
          const btn=e.currentTarget;btn.disabled=true;btn.textContent='Marcando…';msg.textContent='Marcando este informativo como visto…';
          try{
            await window.vnx.emailAction({account:m.account,messageId:m.id,threadId:m.threadId,subject:m.subject,from:m.from,action:'mark_read'});
            m.unread=false;workQueueCache.at=0;msg.textContent='Visto. Ya no cuenta como pendiente de abrir.';
            setTimeout(()=>renderWorkQueue(overlay,'informative',true),250);
          }catch(err){msg.textContent=err.message||String(err);btn.disabled=false;btn.textContent='✓ Visto'}
        });
        card.querySelector('[data-work-load-sent]')?.addEventListener('click',async e=>{
          const btn=e.currentTarget,sentEl=card.querySelector('[data-work-sent]');
          btn.disabled=true;btn.textContent='Cargando…';msg.textContent='Consultando solo esta conversación…';
          try{
            const out=await window.vnx.emailSentBody({account:m.account,threadId:m.threadId});
            const body=String(out?.body||'').trim();
            if(body){
              m.sentBody=body;
              if(sentEl)sentEl.innerHTML=escM(body).replace(/\n/g,'<br>');
              btn.remove();
              msg.textContent='Última respuesta cargada.';
            }else{
              msg.textContent='Gmail no ha devuelto texto para esta respuesta.';
              btn.disabled=false;btn.textContent='Reintentar';
            }
          }catch(e){msg.textContent=e.message||String(e);btn.disabled=false;btn.textContent='Reintentar'}
        });
        card.querySelector('[data-work-open]')?.addEventListener('click',()=>window.open('https://mail.google.com/mail/u/0/#inbox/'+encodeURIComponent(m.threadId||m.id),'_blank','noopener,noreferrer'));
      });
      await refreshWorkbenchCounters(true);
    }catch(e){body.innerHTML='<div class="vnx-work-empty">No he podido cargar Mi trabajo: '+escM(e.message||String(e))+'</div>'}
  }
  async function openWorkQueue(initialTab='review'){
    const overlay=document.createElement('div');overlay.className='vnx-work-overlay';
    overlay.innerHTML='<div class="vnx-work-modal"><div class="vnx-work-head"><div><h3>📥 Mi trabajo</h3><p>Carla separa lo que necesita acción de los correos que solo debes leer. Así los avisos y noreply no llenan tus pendientes.</p></div><button class="mini" data-work-close>✕</button></div><div class="vnx-work-summary"><span><i>⚡</i><b>Automáticos</b><small>Acciones que VentaNexIA ha realizado automáticamente cuando está permitido.</small></span><span><i>👀</i><b>Importantes / revisar</b><small>Correos que merecen atención y pueden necesitar respuesta o seguimiento.</small></span><span><i>✋</i><b>Necesito tu decisión</b><small>Precios, excepciones, reclamaciones o decisiones que no debe tomar sola.</small></span><span><i>ℹ️</i><b>Informativos</b><small>Noreply, avisos, confirmaciones y correos que no requieren respuesta.</small></span><span><i>✓</i><b>Resueltos</b><small>Conversaciones ya atendidas o cerradas.</small></span></div><div class="vnx-work-tabs"><button data-work-tab="automatic">Automáticos <b>0</b></button><button data-work-tab="review">Importantes / revisar <b>0</b></button><button data-work-tab="decision">Necesito tu decisión <b>0</b></button><button data-work-tab="informative">Informativos <b>0</b></button><button data-work-tab="resolved">Resueltos <b>0</b></button></div><div class="vnx-work-body" data-work-body></div></div>';
    document.body.appendChild(overlay);const close=()=>overlay.remove();overlay.querySelector('[data-work-close]').onclick=close;overlay.onclick=e=>{if(e.target===overlay)close()};
    overlay.querySelectorAll('[data-work-tab]').forEach(b=>b.onclick=()=>renderWorkQueue(overlay,b.dataset.workTab));
    await renderWorkQueue(overlay,initialTab,true);
  }

  async function refreshWorkbenchCounters(force=false){
    let counts={review:0,decision:0,informative:0,resolved:0,pending:0};
    try{counts=workCounts(await loadWorkQueueData(force))}catch{}
    const set=(id,n)=>{const e=$m(id);if(e)e.textContent=String(n||0)};
    const attention=(counts.review||0)+(counts.decision||0)+(counts.pending||0);
    set('#vnxCountPending',attention);
    set('#vnxCountReview',counts.review||0);
    set('#vnxCountApproval',counts.decision||0);
    set('#vnxCountSolved',counts.resolved||0);
    set('#homeAttentionCount',attention);
    set('#homeEmailCount',counts.review||0);
    set('#homeDecisionCount',counts.decision||0);
    const line=$m('#homeCarlaSummary');
    if(line){
      if(attention)line.textContent='Tienes '+attention+' asunto'+(attention===1?'':'s')+' que merece'+(attention===1?'':'n')+' tu atención. Puedo prepararte el trabajo.';
      else line.textContent='No veo asuntos urgentes pendientes. Puedes pedirme cualquier tarea.';
    }
  }
  function looksLikeWriteAction(text=''){return /\b(envia|manda|archiva|borra|elimina|publica|crea|modifica|actualiza|responde|contesta|entrega|registra)\b/i.test(String(text))}
  async function sendSeparatedBySources(text,scope,payload){
    if(looksLikeWriteAction(text))throw new Error('Para realizar una acción elige una conexión concreta. Así evitamos actuar en la cuenta equivocada.');
    const blocks=[],emailActionGroups=[];
    for(const src of (scope.sources||[])){
      const direct=sourceScope(src);if(!direct)continue;
      const specialist=String(scope.name||'VentaNexIA').replace(/^\S+\s/,'');
      const isEmail=String(src.module||src.key||'').includes('email')||String(direct.key||'')==='email';
      const instruction=isEmail
        ?'No copies el correo completo ni prepares texto de relleno. Resume SOLO lo útil para trabajar. Formato: **Resumen:** una frase; **Qué pide:** una frase; **¿Requiere respuesta?:** Sí/No; **Acción recomendada:** una frase. Si requiere respuesta, añade **Respuesta propuesta:** con un texto breve y listo para enviar. Si es informativo/noreply, dilo y no redactes respuesta.'
        :'Da primero un **Resumen rápido** de 2-5 puntos y después solo tareas, decisiones o datos útiles agrupados por tipo. No vuelques datos en bruto si puedes resumirlos.';
      const q='Actúa como '+specialist+'. Consulta SOLO esta conexión: '+src.label+'. '+text+'\n'+instruction+'\nNo mezcles datos de otras conexiones.';
      try{
        const r=await window.vnx.sendChat([{role:'user',content:q}],direct);
        blocks.push('## '+src.label+'\n\n'+(r.reply||'Sin información disponible.'));
        if(isEmail&&Array.isArray(r.emailActionGroups))emailActionGroups.push(...r.emailActionGroups.map(g=>({label:g.label||src.label,meta:g.meta})).filter(g=>g.meta?.messageId));
        else if(isEmail&&r.emailActions?.messageId)emailActionGroups.push({label:src.label,meta:r.emailActions});
      }catch(e){blocks.push('## '+src.label+'\n\nNo he podido consultar esta conexión: '+(e.message||e))}
    }
    return {reply:blocks.join('\n\n---\n\n')||'No hay conexiones compatibles para esta consulta.',emailActionGroups};
  }
  async function refreshOwnAgentsCard(){
    const root=$m('#ownAgentsSummary');if(!root)return;
    let agents=[],lic=null;try{agents=await window.vnx.externalAgentList()||[];lic=(await window.vnx.getState())?.license||null}catch{}
    const limit=lic?.master?'∞':Number(lic?.ownAgentLimit||lic?.featurePolicy?.own_agent_limit||0);
    root.innerHTML='<small><b>'+agents.length+'</b> agente'+(agents.length===1?'':'s')+' propio'+(agents.length===1?'':'s')+' conectado'+(agents.length===1?'':'s')+' · límite contratado: '+limit+'.</small>';
  }
  async function openOwnAgentManager(){
    // La ventana debe abrirse inmediatamente. La lectura de agentes existentes no puede bloquear el clic.
    const overlay=document.createElement('div');overlay.className='vnx-own-agent-overlay';
    overlay.innerHTML='<div class="vnx-own-agent-modal"><div class="panel-head"><div><h3>🤖 Mis agentes propios</h3><p>Conecta un agente externo de forma segura. Solo consultar o preparar trabajo; no recibe acceso automático a tus otras conexiones.</p></div><button class="mini" data-own-close>✕</button></div>'
      +'<div class="vnx-own-agent-grid"><label>Nombre<input id="ownAgentName" placeholder="Ej. Control de calidad"></label><label>Tipo<select id="ownAgentProtocol"><option value="api">API / agente HTTPS</option><option value="webhook">Webhook HTTPS</option><option value="mcp">MCP remoto</option></select></label><label class="wide">Dirección HTTPS<input id="ownAgentUrl" placeholder="https://..."></label><label class="wide">Clave / token (si lo necesita)<input id="ownAgentToken" type="password" autocomplete="off" placeholder="Se guarda cifrada"></label><label>Permiso<select id="ownAgentPermissions"><option value="read">Solo consultar</option><option value="prepare" selected>Consultar y preparar trabajo</option></select></label><label id="ownAgentToolWrap" style="display:none">Herramienta MCP<select id="ownAgentTool"><option value="">Primero pulsa Probar conexión</option></select></label></div>'
      +'<div class="row" style="margin-top:12px"><button class="btn outline" id="ownAgentTest" type="button">Probar conexión</button><button class="btn primary" id="ownAgentSave" type="button">Conectar agente</button><span id="ownAgentMsg" style="font-size:11px;color:#9fc1d3"></span></div>'
      +'<div class="vnx-own-agent-list" id="ownAgentList"><div class="vnx-empty-mini">Cargando agentes conectados…</div></div></div>';
    document.body.appendChild(overlay);

    const close=()=>overlay.remove();
    overlay.querySelector('[data-own-close]').onclick=close;
    overlay.onclick=e=>{if(e.target===overlay)close()};

    const protocol=overlay.querySelector('#ownAgentProtocol'),
      toolWrap=overlay.querySelector('#ownAgentToolWrap'),
      toolSel=overlay.querySelector('#ownAgentTool'),
      msg=overlay.querySelector('#ownAgentMsg'),
      listRoot=overlay.querySelector('#ownAgentList');

    protocol.onchange=()=>{toolWrap.style.display=protocol.value==='mcp'?'grid':'none'};
    const payload=()=>({name:overlay.querySelector('#ownAgentName').value.trim(),protocol:protocol.value,url:overlay.querySelector('#ownAgentUrl').value.trim(),token:overlay.querySelector('#ownAgentToken').value.trim(),permissions:overlay.querySelector('#ownAgentPermissions').value,tool:toolSel.value});

    const renderOwnAgentList=(agents=[])=>{
      if(!overlay.isConnected)return;
      listRoot.innerHTML=agents.length
        ?agents.map(a=>'<div class="vnx-own-agent-item"><div><b>'+escM(a.name)+'</b><small>'+escM(String(a.protocol||'api').toUpperCase())+' · '+escM(a.url||'')+'</small></div><button class="mini own-agent-remove" data-id="'+escM(a.id)+'">Quitar</button></div>').join('')
        :'<div class="vnx-empty-mini">Todavía no tienes agentes propios conectados.</div>';
      listRoot.querySelectorAll('.own-agent-remove').forEach(b=>b.onclick=async()=>{
        if(!confirm('¿Quitar este agente propio de VentaNexIA?'))return;
        b.disabled=true;
        try{
          await window.vnx.externalAgentRemove(b.dataset.id);
          await refreshRuntimeConnections();
          await refreshChatConnections();
          await refreshOwnAgentsCard();
          const agentsNow=await window.vnx.externalAgentList()||[];
          renderOwnAgentList(agentsNow);
        }catch(e){
          msg.textContent=e.message||String(e);
          b.disabled=false;
        }
      });
    };

    overlay.querySelector('#ownAgentTest').onclick=async()=>{
      msg.textContent='Probando…';
      try{
        const r=await window.vnx.externalAgentTest(payload());
        if(protocol.value==='mcp'){
          toolWrap.style.display='grid';
          toolSel.innerHTML='<option value="">Elige una herramienta…</option>'+(r.tools||[]).map(t=>'<option value="'+escM(t.name)+'">'+escM(t.name)+'</option>').join('');
        }
        msg.textContent='✓ Conexión correcta';
      }catch(e){msg.textContent='No se pudo conectar: '+(e.message||e)}
    };

    overlay.querySelector('#ownAgentSave').onclick=async()=>{
      msg.textContent='Guardando…';
      try{
        await window.vnx.externalAgentSave(payload());
        msg.textContent='✓ Agente conectado';
        await refreshRuntimeConnections();
        await refreshChatConnections();
        await refreshOwnAgentsCard();
        const agentsNow=await window.vnx.externalAgentList()||[];
        renderOwnAgentList(agentsNow);
      }catch(e){msg.textContent=e.message||String(e)}
    };

    // Carga en segundo plano: incluso si esta llamada falla o tarda, el formulario ya está abierto y utilizable.
    Promise.resolve()
      .then(()=>window.vnx.externalAgentList())
      .then(agents=>renderOwnAgentList(Array.isArray(agents)?agents:[]))
      .catch(e=>{
        if(!overlay.isConnected)return;
        listRoot.innerHTML='<div class="vnx-empty-mini">No he podido cargar los agentes existentes. Puedes conectar uno nuevo igualmente.</div>';
        msg.textContent='Aviso: '+(e.message||'no se pudo leer la lista de agentes');
      });
  }

  async function refreshConnectionCapacityNotice(){
    try{
      const x=await window.vnx.connectionCapacity();const root=$m('#ownAgentsSummary');
      if(root&&x.limit!=null)root.insertAdjacentHTML('beforeend','<br><small>Conexiones del plan: '+x.used+' de '+x.limit+' · extra: 49 €/mes por conexión.</small>');
    }catch{}
  }

  function setUiZoom(factor){
    const safe=Math.max(.75,Math.min(1.6,Math.round(Number(factor||1)*10)/10));
    localStorage.setItem('vnx_ui_zoom',String(safe));window.vnx?.setUiZoom?.(safe).catch(()=>{});return safe;
  }
  function changeUiZoom(delta){return setUiZoom(Number(localStorage.getItem('vnx_ui_zoom')||1.1)+delta)}
  function setupZoomShortcuts(){
    window.addEventListener('keydown',e=>{if(!(e.ctrlKey||e.metaKey))return;if(e.key==='+'||e.key==='='){e.preventDefault();changeUiZoom(.1)}else if(e.key==='-'){e.preventDefault();changeUiZoom(-.1)}else if(e.key==='0'){e.preventDefault();setUiZoom(1)}});
    window.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();changeUiZoom(e.deltaY<0?.1:-.1)},{passive:false});
  }
  function setupReadableView(){
    const detached=new URLSearchParams(location.search).get('detached')==='workbench';
    if(detached){
      document.body.classList.add('vnx-detached-workbench','vnx-carla-window','vnx-focus-chat');
      document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      $m('#chat')?.classList.add('active');
      localStorage.setItem('vnx_master_chat_agent','agent:core_ai');
      const savedAgent=localStorage.getItem('vnx_master_chat_agent')||'agent:core_ai';
      if(!savedAgent)localStorage.setItem('vnx_master_chat_agent','agent:core_ai');
      setTimeout(()=>{setWorkspaceMode(savedAgent==='agent:email'?'guided':'free');},0);
    }
    const stored=Number(localStorage.getItem('vnx_ui_zoom')||1.1);
    setUiZoom(detached?Math.max(1.1,stored):stored);
    setupZoomShortcuts();
    const pop=$m('#vnxPopoutWorkbench');
    if(pop){
      if(detached)pop.style.display='none';
      else pop.addEventListener('click',async()=>{
        pop.disabled=true;const old=pop.textContent;pop.textContent='Abriendo…';
        try{await window.vnx.openWorkbenchWindow()}catch(e){alert(e.message||e)}
        finally{pop.disabled=false;pop.textContent=old}
      });
    }
  }

  function setupWorkbench(){
    setupReadableView();
    const lang=$m('#vnxTranslationLanguage');
    const headActions=$m('.vnx-head-actions');
    if(headActions&&!$m('#vnxClearChatOnExit')){
      const privacy=document.createElement('label');
      privacy.className='vnx-chat-privacy-toggle';
      privacy.style.cssText='display:flex;align-items:center;gap:7px;font-size:11px;opacity:.9;white-space:nowrap';
      privacy.innerHTML='<input id="vnxClearChatOnExit" type="checkbox"> Borrar conversación de Carla al cerrar VentaNexIA';
      headActions.appendChild(privacy);
      const chk=privacy.querySelector('input');
      chk.checked=localStorage.getItem(CHAT_CLEAR_ON_EXIT_KEY)==='on';
      chk.onchange=()=>localStorage.setItem(CHAT_CLEAR_ON_EXIT_KEY,chk.checked?'on':'off');
    }
    $m('#vnxExpandWorkbench')?.addEventListener('click',()=>setWorkbenchExpanded(!document.body.classList.contains('vnx-focus-chat')));
    if(localStorage.getItem('vnx_workbench_expanded')==='on')setWorkbenchExpanded(true);
    // Estos botones viven en Conexiones y deben funcionar aunque el Centro de trabajo no llegue a inicializarse por completo.
    const bindOwnAgentButtons=()=>{
      const connect=$m('#connectOwnAgentBtn'),manage=$m('#manageOwnAgentsBtn');
      if(connect&&!connect.dataset.vnxBound){connect.dataset.vnxBound='1';connect.addEventListener('click',openOwnAgentManager)}
      if(manage&&!manage.dataset.vnxBound){manage.dataset.vnxBound='1';manage.addEventListener('click',openOwnAgentManager)}
    };
    bindOwnAgentButtons();
    $$m('[data-vnx-status]').forEach(b=>b.onclick=()=>{const k=b.dataset.vnxStatus;if(k==='approval')openWorkQueue('decision');else if(k==='solved')openWorkQueue('resolved');else openWorkQueue('review')});
    if(lang){lang.value=workbenchLanguage();lang.onchange=()=>localStorage.setItem('vnx_translation_language',lang.value)}
    $m('#vnxTranslateEmailsBtn')?.addEventListener('click',()=>runEmailWorkbench('translate'));
    $m('#vnxEmailSummaryBtn')?.addEventListener('click',()=>runEmailWorkbench('summary'));
    $m('#vnxMyWorkBtn')?.addEventListener('click',()=>openWorkQueue('review'));
    $m('#vnxAgendaTodayBtn')?.addEventListener('click',async()=>{await refreshWorkbenchAgenda();runExecutiveSecretary('pending')});
    $m('#vnxAgendaRefreshBtn')?.addEventListener('click',refreshWorkbenchAgenda);
    $m('#vnxOpenConnectionsBtn')?.addEventListener('click',()=>openConnectionsTab());
    $m('#vnxManageConnectionsBtn')?.addEventListener('click',()=>openConnectionsTab());
    $m('#vnxReviewApprovalsBtn')?.addEventListener('click',()=>{setWorkspaceMode('free');runExecutiveSecretary('pending')});
    $$m('[data-vnx-connect]').forEach(b=>b.onclick=()=>openConnectionsTab(b.dataset.vnxConnect));
    const h=new Date().getHours(),g=$m('#vnxDailyGreeting');
    if(g)g.textContent=(h<13?'Buenos días':h<20?'Buenas tardes':'Buenas noches');
    bindHomeDashboard();refreshWorkbenchAgenda();refreshWorkbenchApprovals();refreshWorkbenchConnections();refreshWorkbenchCounters();refreshHomeReplenishment();refreshOwnAgentsCard().then(refreshConnectionCapacityNotice);
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
    const form=$m('#chatForm');
    input.disabled=false;
    input.readOnly=false;
    input.removeAttribute('disabled');
    input.removeAttribute('readonly');
    input.setAttribute('aria-disabled','false');
    input.style.pointerEvents='auto';
    input.style.userSelect='text';
    input.style.webkitUserSelect='text';
    input.style.webkitAppRegion='no-drag';
    input.style.position='relative';
    input.style.zIndex='30';
    input.tabIndex=0;
    if(form){form.style.pointerEvents='auto';form.style.position='relative';form.style.zIndex='29'}
    return input;
  }
  function keepChatComposerUsable({focus=false}={}){
    const input=ensureChatInputEditable();
    if(!input)return;
    const free=$m('#freeModePanel');
    if(free&&free.style.display!=='none'){
      free.style.pointerEvents='auto';
      free.style.position='relative';
      free.style.zIndex='10';
      if(focus)setTimeout(()=>{ensureChatInputEditable()?.focus({preventScroll:true})},0);
    }
  }
  function updateAgentInputExample(chosen){
    const input=ensureChatInputEditable();if(!input)return;
    input.placeholder=chosen?(chosen.external?'Escribe aquí lo que quieres pedir a '+chosen.name:AGENT_INPUT_EXAMPLES[chosen.key]||'Escribe aquí lo que necesitas que haga este agente'):'Elige un agente arriba y te mostraré ejemplos de lo que puedes pedirle';
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
    const root=$m('#portalList');
    // Cargar SIEMPRE las páginas privadas, incluso en la ventana independiente de Carla,
    // donde no existe #portalList. El selector de fuentes depende de masterPortals.
    try{masterPortals=await window.vnx.listPortals()||[]}catch{masterPortals=[]}
    if(!root)return masterPortals;
    root.innerHTML=masterPortals.length?masterPortals.map(p=>`<div class="listrow"><div><b>${escM(p.name)}</b><span>${escM(p.url)} · ${p.mode==='read'?'🔒 Solo lectura':'Lectura y escritura'} · ${statusLabel(p)}</span>${p.lastCheckedAt?`<small>Última comprobación: ${new Date(p.lastCheckedAt).toLocaleString('es-ES')}</small>`:''}</div><div class="row"><button class="mini master-portal-connect" data-id="${escM(p.id)}">${p.lastStatus==='connected'?'Abrir':'Conectar'}</button><button class="mini master-portal-check" data-id="${escM(p.id)}">Revisar</button><button class="mini master-portal-remove" data-id="${escM(p.id)}">Quitar</button></div></div>`).join(''):'<div class="empty">Todavía no hay páginas privadas configurados.</div>';
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
    try{runtimeExternalAgents=await window.vnx.externalAgentList()||[]}catch{runtimeExternalAgents=[]}
    // Las páginas privadas no forman parte de listConnections(); cargarlas aquí garantiza
    // que Naturdesma y cualquier portal conectado aparezcan también en el desplegable
    // de Carla y en ventanas independientes, sin depender de que la pestaña Conexiones exista.
    try{masterPortals=await window.vnx.listPortals()||[]}catch{masterPortals=[]}
    return runtimeConnections;
  }
  function connectedDataSources(){
    const out=[];
    for(const p of masterPortals||[]){
      const url=String(p.url||p.lastUrl||'').toLowerCase();
      const shopifyAdmin=/^https:\/\/admin\.shopify\.com\//.test(url)||(/\.myshopify\.com\//.test(url)&&(/\/admin(?:\/|$)/.test(url)||/\/settings(?:\/|$)/.test(url)));
      if(!shopifyAdmin&&['read','write'].includes(p.mode))out.push({type:'portal',id:p.id,name:p.name,url:p.url});
    }
    const labels={email:'Email',whatsapp:'WhatsApp Business',social:'Redes sociales',prospecting:'Buscar clientes',crm:'Ventas y clientes',shopify:'Shopify',wordpress:'WordPress / WooCommerce',github_vercel:'GitHub / Vercel'};
    for(const x of runtimeConnections||[]){
      const moduleKey=x.module||x.key;
      if(!moduleKey)continue;
      if(moduleKey==='shopify')out.push({type:'shopify',key:'shopify',connectionKey:x.key||'integration:shopify',name:'Shopify · '+(x.label||'Tienda'),shop:x.shop||x.label||null});
      else if(['email','whatsapp','social','crm'].includes(moduleKey))out.push({type:'integration',key:moduleKey,connectionKey:x.key||('integration:'+moduleKey),accountIndex:Number.isInteger(x.accountIndex)?x.accountIndex:null,name:(labels[moduleKey]||moduleKey)+' · '+(x.label||'Conectado')});
      else if(x.type==='folder')out.push({type:'folder',key:x.key||moduleKey,connectionKey:x.key||moduleKey,name:'Archivos y programas · '+(x.label||'Carpeta'),folder:x.path||x.folder||x.label});
    }
    const seen=new Set();
    return out.filter(x=>{
      const k=x.type==='portal'?'p:'+x.id:x.type==='integration'?'i:'+(x.connectionKey||x.key):x.type==='shopify'?'s:'+(x.connectionKey||x.shop):'f:'+(x.connectionKey||x.folder);
      if(seen.has(k))return false;seen.add(k);return true;
    });
  }
  function agentDisplayName(x){
    if(String(x?.key||'')==='core_ai')return '👩‍💼 Carla · Secretaria ejecutiva';
    return (x.icon||'🤖')+' '+(x.name||x.key||'');
  }
  function connectionModule(x){return String(x?.module||x?.key||'').toLowerCase()}
  function sourcesForAgent(agent){
    if(!agent)return[];
    const key=String(agent.key||'');
    if(agent.external)return[];
    const all=(runtimeConnections||[]).map(x=>({...x,module:connectionModule(x)}));
    let wanted=[];
    if(key==='email')wanted=all.filter(x=>x.module==='email');
    else if(key==='web_ecommerce')wanted=all.filter(x=>['shopify','wordpress','web_ecommerce'].includes(x.module));
    else if(['crm','whatsapp','social'].includes(key))wanted=all.filter(x=>x.module===key);
    else if(key==='customer_service')wanted=all.filter(x=>['email','whatsapp'].includes(x.module));
    else if(key==='orders')wanted=all.filter(x=>['email','shopify'].includes(x.module));
    else if(key==='administration')wanted=all.filter(x=>['agenda','email'].includes(x.module));
    else if(key==='quotes')wanted=all.filter(x=>['email','crm','shopify'].includes(x.module));
    else if(key==='reports')wanted=all.filter(x=>['crm','shopify','email'].includes(x.module));
    else if(key==='automation')wanted=all.filter(x=>['email','whatsapp','social','crm','shopify','agenda'].includes(x.module));
    else if(key==='prospecting')wanted=all.filter(x=>x.module==='email');
    else if(key==='core_ai')wanted=all.filter(x=>['email','whatsapp','social','crm','shopify','agenda'].includes(x.module));
    const mapped=wanted.map((x,i)=>({
      id:x.key||('source:'+i),module:x.module,label:x.label||x.account||x.shop||x.module,
      accountIndex:Number.isInteger(x.accountIndex)?x.accountIndex:null,provider:x.provider||'',raw:x
    }));
    if(key==='core_ai'||key==='web_ecommerce'||key==='orders'){
      for(const p of masterPortals||[])if(p&&p.id&&['read','write'].includes(p.mode)&&p.lastStatus==='connected')mapped.push({id:p.id,module:'portal',type:'portal',label:p.name||p.url,url:p.url,raw:p});
    }
    return mapped;
  }
  function chatConnections(){
    const out=[];
    for(const agent of runtimeAgents||[]){
      if(agent.key==='web_ecommerce'&&agent.included){
        const sh=(runtimeConnections||[]).find(x=>(x.module||x.key)==='shopify');
        if(sh){out.push({...agent,connected:true,ready:true,source:{type:'shopify',key:'shopify',name:'Shopify · '+(sh.label||'Tienda'),shop:sh.shop||sh.label||null}});continue}
      }
      out.push(agent);
    }
    for(const x of runtimeExternalAgents||[])out.push({key:'external:'+x.id,external:true,externalId:x.id,icon:'🤖',name:x.name,entitlement:null,requires:null,included:true,connected:true,ready:true,protocol:x.protocol});
    return out;
  }
  function chatConnectionValue(x){
    if(!x?.key)return '';
    if(x.external)return 'external:'+x.externalId;
    if(x.key==='email'&&Number.isInteger(x.accountIndex))return 'agent:email:'+x.accountIndex;
    return 'agent:'+x.key;
  }
  function sourceScope(source){
    if(!source)return null;
    const x=source.raw||source,module=String(source.module||x.module||x.key||'');
    if(module==='email')return {type:'integration',key:'email',name:'Email · '+source.label,accountIndex:source.accountIndex,connectionKey:x.key||null};
    if(module==='shopify')return {type:'shopify',key:'shopify',name:'Shopify · '+source.label,shop:x.shop||x.label||null};
    if(['crm','whatsapp','social'].includes(module))return {type:'integration',key:module,name:source.label,connectionKey:x.key||null};
    if(module==='agenda')return {type:'agent',key:'administration',name:'Administración y agenda',included:true,connected:true,ready:true};
    return null;
  }
  function refreshAgentSourceSelector(agent){
    const wrap=$m('#chatSourceWrap'),sel=$m('#chatSourceSelect'),hint=$m('#chatSourceHint');if(!wrap||!sel)return;
    const sources=sourcesForAgent(agent);
    if(!sources.length){wrap.style.display='none';if(hint)hint.style.display='none';sel.innerHTML='<option value=""></option>';sel.dataset.agent='';return}
    wrap.style.display='grid';if(hint)hint.style.display='block';
    const prev=sel.dataset.agent===agent.key?sel.value:'';
    sel.innerHTML='<option value="">Elige una conexión…</option>'+(sources.length>1?'<option value="__all__">Todas, separadas</option>':'')+sources.map((x,i)=>'<option value="'+i+'">'+escM(x.label)+'</option>').join('');
    sel.dataset.agent=agent.key;
    if(prev&&[...sel.options].some(o=>o.value===prev))sel.value=prev;
    else sel.value='';
    if(hint)hint.textContent=sources.length>1?'Tienes '+sources.length+' conexiones para este empleado. Elige una o “Todas, separadas”.':'Elige esta conexión para mantener sus datos separados del resto.';
  }
  function agentStatusText(x){
    if(x?.external)return '🟢 Agente propio conectado';
    if(!x?.included)return '🔒 No incluido en tu plan';
    if(!x?.connected)return '🟠 Incluido · falta conectar';
    return '🟢 Listo para usar';
  }
  function renderConnectionAgentCards(items){
    const root=$m('#allAgentConnections');if(!root)return;
    const descriptions={
      core_ai:'Análisis, redacción y apoyo general con el motor IA.',
      email:'Lee Gmail, detecta correos pendientes, prepara respuestas y crea borradores para autorizar.',
      whatsapp:'Atiende WhatsApp Business, prepara respuestas y permite elegir entre autorización previa o automatización controlada.',
      prospecting:'Busca posibles clientes y prepara el siguiente paso comercial.',
      crm:'Clientes, ventas y seguimientos.',
      customer_service:'Atención al cliente usando Email, WhatsApp o voz cuando estén conectados.',
      quotes:'Presupuestos y ofertas comerciales con datos reales.',
      orders:'Recibe pedidos, comprueba cliente y stock, coordina Compras y prepara su entrada en el sistema.',
      social:'Publicaciones, campañas y visibilidad en Google.',
      web_ecommerce:'Pedidos, clientes, productos y contenido de tu web o tienda.',
      administration:'Documentos, tareas, agenda y organización del día a día.',
      reports:'Explica tus datos y resultados de forma sencilla.',
      automation:'Hace tareas repetitivas por ti siguiendo reglas claras.'
    };
    for(const a of items)if(a.external)descriptions[a.key]='Agente propio conectado por el cliente y aislado del resto de conexiones salvo autorización expresa.';
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
    if(!chosen){hint.textContent='Elige el especialista que mejor encaja con lo que quieres conseguir.';return}    if(!chosen.included){hint.textContent='🔒 '+agentDisplayName(chosen)+' no está incluido en este plan. Puedes verlo, pero no conectarlo ni utilizarlo hasta contratarlo.';return}
    if(!chosen.connected){hint.textContent='🟠 '+agentDisplayName(chosen)+' está incluido, pero necesita una conexión. Ve a “Conexiones” para activarlo.';return}
    hint.textContent='🟢 '+agentDisplayName(chosen)+' está listo para usar.';
  }
  async function refreshChatConnections(){
    const sel=$m('#chatConnectionSelect'),hint=$m('#chatConnectionHint');if(!sel)return;
    await refreshRuntimeConnections();
    await refreshAgentMetrics();
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
      if(nextValue!==activeAgentValue&&hasCurrentWork&&!handoffAgentChange){
        const ok=confirm('Vas a cambiar de agente. ¿Quieres cerrar el trabajo actual y eliminar esta conversación para empezar uno nuevo?');
        if(!ok){sel.value=activeAgentValue;return;}
        masterMessages=[];
        if(input)input.value='';
        clearPersistedChat();
        renderMasterMessages();
      }
      handoffAgentChange=false;
      activeAgentValue=nextValue;
      if(nextValue)localStorage.setItem('vnx_master_chat_agent',nextValue);
      const chosen=items.find(x=>chatConnectionValue(x)===nextValue);
      updateAgentHint(chosen,hint);
      updateAgentInputExample(chosen);
      renderGuidedAgentTabs(items,chosen);
      renderGuidedWorkspace(chosen);
      updateWorkbenchAgent(chosen);
      refreshWorkbenchConnections();
      refreshAgentSourceSelector(chosen);
      if(nextValue&&input&&$m('#freeModePanel')?.style.display!=='none')setTimeout(()=>keepChatComposerUsable({focus:true}),30);
    };
    const selectedAgent=items.find(x=>chatConnectionValue(x)===sel.value);
    keepChatComposerUsable();
    updateAgentHint(selectedAgent,hint);
    updateAgentInputExample(selectedAgent);
    renderGuidedAgentTabs(items,selectedAgent);
    renderGuidedWorkspace(selectedAgent);
    updateWorkbenchAgent(selectedAgent);
    refreshWorkbenchConnections();
    refreshAgentSourceSelector(selectedAgent);
    const sourceSelect=$m('#chatSourceSelect');if(sourceSelect)sourceSelect.onchange=()=>{const hint2=$m('#chatSourceHint');if(hint2&&sourceSelect.value)hint2.textContent=sourceSelect.value==='__all__'?'Mostraré cada conexión en un bloque separado. Para enviar o modificar algo, deberás elegir una sola conexión.':'Usaré únicamente esta conexión.';keepChatComposerUsable({focus:true})};
    renderHomeAgents(items);
    renderConnectionAgentCards(items);
    if($m('#masterSourceSelect'))renderMasterCenterSources();
  }
  window.vnxRefreshAgentUi=refreshChatConnections;
  function selectedChatScope(){
    const sel=$m('#chatConnectionSelect'),items=chatConnections();if(!sel||!sel.value)return null;
    const item=items.find(x=>chatConnectionValue(x)===sel.value);if(!item)return null;
    if(item.external)return {type:'external_agent',id:item.externalId,key:item.key,name:agentDisplayName(item),included:true,connected:true,ready:true};
    const sources=sourcesForAgent(item),sourceSel=$m('#chatSourceSelect'),choice=sourceSel&&sourceSel.dataset.agent===item.key?sourceSel.value:'';
    const base={type:'agent',key:item.key,name:agentDisplayName(item),included:item.included,connected:item.connected,ready:item.ready,source:item.source||null,accountIndex:Number.isInteger(item.accountIndex)?item.accountIndex:null};
    if(sources.length>0){
      if(!choice)return {...base,needsSourceChoice:true,sources};
      if(choice==='__all__')return {...base,separateSources:true,sources};
      const src=sources[Number(choice)];if(src){base.selectedSource=src;if(item.key==='email')base.accountIndex=src.accountIndex;if(item.key==='web_ecommerce'&&src.module==='shopify')base.source={type:'shopify',key:'shopify',name:'Shopify · '+src.label,shop:src.raw?.shop||src.label}}
    }
    return base;
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
  let masterBusinessData=null;
  function moneyLabel(x){
    if(!x)return '—';
    const n=Number(x.amount||0);
    return n.toLocaleString('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(x.currency||'EUR');
  }
  function dateLabel(v){
    if(!v)return '—';
    const d=typeof v==='number'?new Date(v*1000):new Date(v);
    return Number.isNaN(d.getTime())?String(v):d.toLocaleString('es-ES');
  }
  function billingBadge(status=''){
    const s=String(status||'').toLowerCase();
    if(['active','paid','trialing','accepted'].includes(s))return '<span class="vnx-billing-badge paid">● Al día</span>';
    if(['payment_due','past_due','open'].includes(s))return '<span class="vnx-billing-badge due">● Pago pendiente · 24 h</span>';
    if(['suspended','unpaid','paused','incomplete_expired','canceled','cancelled'].includes(s))return '<span class="vnx-billing-badge blocked">● Bloqueado / revisar pago</span>';
    return '<span class="vnx-billing-badge neutral">● '+escM(status||'Sin estado')+'</span>';
  }
  function renderMasterBusiness(kind){
    const root=$m('#masterBusinessResult');if(!root)return;
    const d=masterBusinessData||{};
    if(kind==='customers'){
      const rows=d.customers||[];
      root.innerHTML=rows.length?rows.map(x=>'<div class="listrow vnx-billing-row"><div><b>'+escM(x.name||x.email||x.id)+'</b><span>'+escM(x.email||'Sin email')+' '+billingBadge(x.billingStatus||'')+'</span><small>Alta: '+escM(dateLabel(x.created))+'</small></div><div class="row">'+(x.paymentUrl?'<button class="mini" data-master-open-url="'+escM(x.paymentUrl)+'">Abrir pago</button>':'')+'<small>'+escM(x.id||'')+'</small></div></div>').join(''):'<div class="empty">No hay clientes en Stripe.</div>';
      root.querySelectorAll('[data-master-open-url]').forEach(b=>b.onclick=()=>window.vnx.openExternal(b.dataset.masterOpenUrl));
      return;
    }
    if(kind==='contracts'){
      const rows=d.contracts||[];
      root.innerHTML=rows.length?rows.map(x=>'<div class="listrow vnx-billing-row"><div><b>'+escM(x.company||x.email||x.contract_id||'Contrato')+'</b><span>'+escM(x.plan_name||x.plan||'Plan')+' '+billingBadge(x.status||'accepted')+'</span><small>'+escM(x.email||'')+' · Aceptado: '+escM(dateLabel(x.accepted_at))+'</small></div><strong>'+escM(String(x.total_monthly??'—'))+' €/mes</strong></div>').join(''):'<div class="empty">No hay contratos aceptados registrados.</div>';
      return;
    }
    if(kind==='invoices'){
      const rows=d.invoices||[];
      root.innerHTML=rows.length?rows.map(x=>'<div class="listrow vnx-billing-row"><div><b>Factura '+escM(x.number||x.id)+'</b><span>'+billingBadge(x.paid?'paid':(x.status||'open'))+' · '+escM(dateLabel(x.created))+'</span><small>Importe: '+escM(moneyLabel(x.amount_due))+'</small></div>'+(x.invoice_pdf?'<button class="mini" data-master-open-url="'+escM(x.invoice_pdf)+'">PDF</button>':x.hosted_invoice_url?'<button class="mini" data-master-open-url="'+escM(x.hosted_invoice_url)+'">Pagar / abrir</button>':'')+'</div>').join(''):'<div class="empty">No hay facturas en Stripe.</div>';
      root.querySelectorAll('[data-master-open-url]').forEach(b=>b.onclick=()=>window.vnx.openExternal(b.dataset.masterOpenUrl));
      return;
    }
    const rows=d.subscriptions||[];
    root.innerHTML=rows.length?rows.map(x=>'<div class="listrow vnx-billing-row"><div><b>'+escM(x.id)+'</b><span>'+billingBadge(x.status||'')+'</span><small>'+escM(x.cancel_at_period_end?'Cancelación al final del periodo':'Estado sincronizado con Stripe')+'</small></div></div>').join(''):'<div class="empty">No hay suscripciones registradas.</div>';
  }
  async function refreshMasterBusiness(){
    const root=$m('#masterBusinessResult');if(!root||!window.vnx?.masterDashboard)return;
    root.innerHTML='<div class="empty">Cargando clientes, contratos, facturas y suscripciones…</div>';
    try{
      masterBusinessData=await window.vnx.masterDashboard();
      const set=(id,n)=>{const e=$m(id);if(e)e.textContent=String(n||0)};
      set('#masterCustomersCount',(masterBusinessData.customers||[]).length);
      set('#masterContractsCount',(masterBusinessData.contracts||[]).length);
      set('#masterInvoicesCount',(masterBusinessData.invoices||[]).length);
      set('#masterSubscriptionsCount',(masterBusinessData.subscriptions||[]).length);
      renderMasterBusiness('contracts');
    }catch(e){root.innerHTML='<div class="empty">No he podido cargar el panel maestro: '+escM(e.message||String(e))+'</div>'}
  }
  function setupMasterBusiness(){
    const refresh=$m('#refreshMasterBillingBtn');if(refresh)refresh.onclick=refreshMasterBusiness;
    $$m('[data-master-business]').forEach(b=>b.onclick=()=>renderMasterBusiness(b.dataset.masterBusiness));
    refreshMasterBusiness();
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


  function purchaseExportDataFromMessage(msg={}){
    if(msg?.purchaseData?.headers?.length&&Array.isArray(msg.purchaseData.rows))return msg.purchaseData;
    const rows=purchaseRowsFromReply(msg?.content||'');
    return {
      headers:['SKU','Producto','Stock actual','Ventas periodo','Media semanal','Stock mínimo propuesto','Cantidad a pedir','Motivo'],
      rows
    };
  }
  function purchaseRowsFromReply(text=''){
    const rows=[];
    for(const line of String(text||'').split(String.fromCharCode(10))){
      if(!/cantidad a pedir\s*:/i.test(line))continue;
      const get=label=>{const m=line.match(new RegExp(label+'\\s*:\\s*([^|]+)','i'));return m?m[1].trim():''};
      const qty=get('Cantidad a pedir');
      if(!qty||/^0(?:[,.]0+)?$/.test(qty))continue;
      rows.push([get('SKU'),get('Producto'),get('Stock actual'),get('Ventas periodo'),get('Media semanal'),get('Stock mínimo propuesto'),qty,get('Motivo')]);
    }
    return rows;
  }
  function isPurchaseProposal(text=''){
    return /reposición propuesta|reposicion propuesta|cantidad a pedir\s*:|listo para enviar a compras/i.test(String(text||''))&&purchaseRowsFromReply(text).length>0;
  }
  async function exportPurchaseExcel(msg,btn){
    const data=purchaseExportDataFromMessage(msg);
    if(!data.rows.length){alert('No encuentro líneas de reposición con cantidad a pedir en este resultado.');return}
    const old=btn.textContent;btn.disabled=true;btn.textContent='Preparando Excel…';
    try{
      const r=await window.vnx.exportData({format:'excel',title:'Reposición Shopify - VentaNexIA',headers:data.headers,rows:data.rows});
      if(r?.ok)btn.textContent='Excel guardado ✓';else btn.textContent=old;
    }catch(e){alert('No he podido guardar el Excel: '+(e.message||e));btn.textContent=old}
    finally{setTimeout(()=>{if(btn.isConnected){btn.disabled=false;if(btn.textContent==='Excel guardado ✓')btn.textContent=old}},1600)}
  }
  async function exportPurchaseCsv(msg,btn){
    const data=purchaseExportDataFromMessage(msg);
    if(!data.rows.length){alert('No encuentro líneas de reposición para exportar.');return}
    const old=btn.textContent;btn.disabled=true;btn.textContent='Preparando CSV…';
    try{
      const r=await window.vnx.exportData({format:'csv',title:'Reposición Shopify - importación',headers:data.headers,rows:data.rows});
      if(r?.ok)btn.textContent='CSV guardado ✓';else btn.textContent=old;
    }catch(e){alert('No he podido guardar el CSV: '+(e.message||e));btn.textContent=old}
    finally{setTimeout(()=>{if(btn.isConnected){btn.disabled=false;if(btn.textContent==='CSV guardado ✓')btn.textContent=old}},1600)}
  }
  async function exportPurchasePdf(msg,btn){
    const data=purchaseExportDataFromMessage(msg);
    if(!data.rows.length){alert('No encuentro líneas de reposición con cantidad a pedir en este resultado.');return}
    const old=btn.textContent;btn.disabled=true;btn.textContent='Preparando PDF…';
    try{
      const r=await window.vnx.exportData({format:'pdf',title:'Reposición Shopify - VentaNexIA',headers:data.headers,rows:data.rows});
      if(r?.ok)btn.textContent='PDF guardado ✓';else btn.textContent=old;
    }catch(e){alert('No he podido guardar el PDF: '+(e.message||e));btn.textContent=old}
    finally{setTimeout(()=>{if(btn.isConnected){btn.disabled=false;if(btn.textContent==='PDF guardado ✓')btn.textContent=old}},1600)}
  }
  function printPurchaseProposal(msg){
    const data=purchaseExportDataFromMessage(msg);
    if(!data.rows.length){alert('No encuentro líneas de reposición para imprimir.');return}
    const esc=s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
    const w=window.open('','_blank','noopener,noreferrer');if(!w)return;
    w.document.write('<!doctype html><meta charset="utf-8"><title>Reposición Shopify</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#111}h1{font-size:22px}p{color:#555}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #bbb;padding:6px;vertical-align:top}th{background:#eee;white-space:nowrap}@media print{button{display:none}}</style><h1>Reposición Shopify</h1><p>Preparado por VentaNexIA con datos calculados por SKU/EAN. Revisar las cantidades antes de importar o enviar a Compras.</p><table><thead><tr>'+data.headers.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+data.rows.map(row=>'<tr>'+data.headers.map((_,i)=>'<td>'+esc(row[i]??'')+'</td>').join('')+'</tr>').join('')+'</tbody></table><p><button onclick="window.print()">Imprimir</button></p>');w.document.close();setTimeout(()=>w.print(),250);
  }

  function renderMasterMessages({focusIndex=null,persist=true,forceBottom=false}={}){
    if(persist)persistMasterChatState();
    const root=$m('#messages');if(!root)return;
    const previousTop=root.scrollTop;
    const wasNearBottom=(root.scrollHeight-root.scrollTop-root.clientHeight)<80;
    const intro='<div class="msg ai">Estoy listo para ayudarte. Elige arriba el agente de VentaNexIA con el que quieres trabajar. El agente utilizará únicamente las conexiones que tengas autorizadas.</div>';
    root.innerHTML=intro+masterMessages.map((m,msgIndex)=>{
      if(m.handoffInternal)return '';
      const imgs=(m.images||[]).slice(0,6).map(img=>`<a href="${escM(img.src)}" target="_blank" rel="noreferrer"><img src="${escM(img.src)}" alt="${escM(img.alt||'Imagen')}" style="max-width:220px;max-height:180px;object-fit:contain;border-radius:10px;margin:8px 8px 0 0;background:#fff;border:1px solid #d8e2ea"></a>`).join('');
      const actions=m.emailActions?.options?.length?'<div class="row" style="flex-wrap:wrap;margin-top:10px;gap:8px">'+m.emailActions.options.map(a=>'<button class="mini email-action-btn" data-msg-id="'+escM(m.emailActions.messageId||'')+'" data-action="'+escM(a.key)+'">'+escM(a.label)+'</button>').join('')+'</div>':'';
      const groupedActions=Array.isArray(m.emailActionGroups)&&m.emailActionGroups.length?'<div class="vnx-email-action-groups">'+m.emailActionGroups.map((g,gi)=>'<div class="vnx-email-action-group"><b>'+escM(g.label||g.meta?.subject||'Email')+'</b><div class="row">'+(g.meta?.options||[]).filter(a=>['draft_reply','send_reply','archive','mark_read','no_reply_needed'].includes(a.key)).map(a=>'<button class="mini grouped-email-action-btn" data-master-msg="'+msgIndex+'" data-email-group="'+gi+'" data-action="'+escM(a.key)+'">'+escM(a.label)+'</button>').join('')+'</div></div>').join('')+'</div>':'';
      const secretaryActions=m.secretaryActions?'<div class="vnx-secretary-actions"><button data-secretary-workqueue="review">Preparar y revisar respuestas</button><button data-secretary-workqueue="review">Revisar y enviar</button><button data-secretary-workqueue="decision">Resolver decisiones</button></div>':'';
      const purchaseActions=(m.purchaseExport||isPurchaseProposal(m.content))?'<div class="vnx-secretary-actions vnx-purchase-actions"><b>Pedido para Compras</b><button data-purchase-excel="'+msgIndex+'">📊 Excel</button><button data-purchase-csv="'+msgIndex+'">⬇ CSV importable</button><button data-purchase-pdf="'+msgIndex+'">📄 PDF</button><button data-purchase-print="'+msgIndex+'">🖨 Imprimir</button></div>':'';
      const handoff=m.handoff?'<div class="vnx-handoff-card"><b>'+escM((m.handoff.icon||'🤖')+' '+(m.handoff.prompt||'¿Quieres que conecte con el empleado adecuado?'))+'</b><div class="row" style="gap:8px;margin-top:10px"><button class="mini handoff-accept-btn" data-agent="'+escM(m.handoff.agentKey||'')+'">Sí, que se encargue</button><button class="mini handoff-decline-btn">No, solo consultar</button></div></div>':'';
      const body=m.role==='user'?escM(m.content).replace(/\n/g,'<br>'):documentHtmlFromMarkdown(m.content);
      return `<div class="msg ${m.role==='user'?'user':'ai'}" data-master-index="${msgIndex}"><div class="${m.role==='user'?'':'vnx-rich-result'}">${body}</div>${imgs?`<div>${imgs}</div>`:''}${actions}${groupedActions}${secretaryActions}${purchaseActions}${handoff}</div>`;
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
    $$m('.grouped-email-action-btn').forEach(btn=>btn.onclick=async()=>{
      const mi=Number(btn.dataset.masterMsg),gi=Number(btn.dataset.emailGroup);
      const msg=masterMessages[mi],group=msg?.emailActionGroups?.[gi],meta=group?.meta,action=btn.dataset.action;
      if(!meta)return;
      let body='',cc='';
      if(['draft_reply','send_reply','send_reply_cc'].includes(action)){
        const edited=await openReplyEditor({meta,action});if(!edited)return;
        body=edited.body;cc=edited.cc||'';
      }
      if(action==='send_reply'&&!confirm('¿Enviar esta respuesta ahora desde '+(meta.account||'esta cuenta')+'?'))return;
      const old=btn.textContent;btn.disabled=true;btn.textContent='Procesando…';
      try{
        const out=await window.vnx.emailAction({account:meta.account,messageId:meta.messageId,threadId:meta.threadId,subject:meta.subject,from:meta.from,action,body,cc});
        btn.textContent='Hecho ✓';
        if(['archive','mark_read','no_reply_needed'].includes(action))setTimeout(()=>{btn.remove()},700);
        if(action==='send_reply')masterMessages.push({role:'assistant',content:out?.message||'Respuesta enviada.'});
      }catch(e){alert(e.message||e);btn.textContent=old}
      finally{setTimeout(()=>{if(btn.isConnected){btn.disabled=false;if(btn.textContent==='Hecho ✓')btn.textContent=old}},1000)}
    });
    $$m('[data-secretary-workqueue]').forEach(btn=>btn.onclick=()=>openWorkQueue(btn.dataset.secretaryWorkqueue||'review'));
    $$m('[data-purchase-excel]').forEach(btn=>btn.onclick=()=>exportPurchaseExcel(masterMessages[Number(btn.dataset.purchaseExcel)],btn));
    $$m('[data-purchase-csv]').forEach(btn=>btn.onclick=()=>exportPurchaseCsv(masterMessages[Number(btn.dataset.purchaseCsv)],btn));
    $$m('[data-purchase-pdf]').forEach(btn=>btn.onclick=()=>exportPurchasePdf(masterMessages[Number(btn.dataset.purchasePdf)],btn));
    $$m('[data-purchase-print]').forEach(btn=>btn.onclick=()=>printPurchaseProposal(masterMessages[Number(btn.dataset.purchasePrint)]));
    $$m('.handoff-decline-btn').forEach(btn=>btn.onclick=()=>{
      const card=btn.closest('.vnx-handoff-card');if(card)card.innerHTML='<small>Perfecto. Seguimos solo en modo consulta.</small>';
    });
    $$m('.handoff-accept-btn').forEach(btn=>btn.onclick=async()=>{
      const wrap=btn.closest('[data-master-index]');
      const msgIndex=Number(wrap?.dataset?.masterIndex);
      const msg=Number.isInteger(msgIndex)?masterMessages[msgIndex]:null;
      const h=msg?.handoff;if(!h)return;
      const agent=(runtimeAgents||[]).find(x=>x.key===h.agentKey);
      if(!agent?.included){
        masterMessages.push({role:'assistant',content:'Ese empleado no está incluido en tu plan actual.'});renderMasterMessages();return;
      }
      if(!agent?.connected&&agent?.requires){
        masterMessages.push({role:'assistant',content:'Ese empleado necesita conectar primero su herramienta o fuente de datos. Ve a Conexiones y actívala.'});renderMasterMessages();return;
      }
      const ok=selectAgentKey(h.agentKey,{preserve:true});
      if(!ok){
        masterMessages.push({role:'assistant',content:'No he podido abrir el empleado '+(h.agentName||'correspondiente')+'.'});renderMasterMessages();return;
      }
      const context=masterMessages.slice(Math.max(0,msgIndex-3),msgIndex+1).map(x=>(x.role==='user'?'Usuario: ':'Asistente: ')+String(x.content||'')).join('\n\n');
      const task='Tarea recibida del Asistente IA. Continúa desde este punto sin pedir al usuario que repita la información.\n\nTAREA:\n'+String(h.task||'')+'\n\nCONTEXTO PREVIO:\n'+context+'\n\nRealiza únicamente las acciones permitidas por este agente y pide confirmación cuando corresponda.';
      masterMessages.push({role:'assistant',content:'Te conecto con tu empleado de '+(h.agentName||'VentaNexIA')+' y le paso todo el contexto de esta consulta.'});
      masterMessages.push({role:'user',content:task,handoffInternal:true});
      renderMasterMessages();
      try{
        const scope=selectedChatScope();
        const payload=masterMessages.filter(x=>!x.handoffInternal||x===masterMessages[masterMessages.length-1]).map(({role,content})=>({role,content}));
        const r=await window.vnx.sendChat(payload,scope);
        masterMessages.push({role:'assistant',content:r.reply||'Sin respuesta',images:r.images||[],emailActions:r.emailActions||null,emailActionGroups:r.emailActionGroups||[],handoff:r.handoff||null});
      }catch(e){
        masterMessages.push({role:'assistant',content:'No he podido pasar la tarea al empleado: '+(e.message||e)});
      }
      renderMasterMessages();
    });
    requestAnimationFrame(()=>{
      if(Number.isInteger(focusIndex)){
        const target=root.querySelector('[data-master-index="'+focusIndex+'"]');
        if(target){
          const rr=root.getBoundingClientRect(),tr=target.getBoundingClientRect();
          root.scrollTop=Math.max(0,root.scrollTop+(tr.top-rr.top)-8);
        }
      }else if(forceBottom||wasNearBottom){
        root.scrollTop=root.scrollHeight;
      }else{
        root.scrollTop=Math.min(previousTop,Math.max(0,root.scrollHeight-root.clientHeight));
      }
    });
    refreshWorkbenchApprovals();refreshWorkbenchCounters();
  }
  function chatScopeKey(scope){
    if(!scope)return 'none';
    if(scope.selectedSource)return 'source:'+(scope.selectedSource.module||'unknown')+':'+(scope.selectedSource.id||scope.selectedSource.label||scope.selectedSource.accountIndex||'0');
    if(scope.type==='shopify')return 'shopify:'+(scope.shop||'connected');
    if(scope.type==='integration')return 'integration:'+scope.key+':'+(Number.isInteger(scope.accountIndex)?scope.accountIndex:'0');
    if(scope.type==='portal')return 'portal:'+scope.id;
    return (scope.type||'scope')+':'+(scope.key||scope.id||'default');
  }
  function redactSensitiveChatText(text,scope){
    if(scope?.key!=='orders')return text;
    return String(text||'')
      .replace(/(\b(?:clave|key|token|api)\s*[:=]?\s*)\S+/gi,'$1••••••••')
      .replace(/(\b(?:secreto|secret)\s*[:=]?\s*)\S+/gi,'$1••••••••');
  }
  let secretaryNewMails=[];
  let secretaryMailTimer=null;
  let secretaryCalendarTimer=null;
  function secretaryDateKey(){
    const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  function secretaryAlertsEnabled(){return localStorage.getItem('vnx_secretary_alerts')!=='off'}
  function secretaryCoreScope(){
    const a=(chatConnections()||[]).find(x=>x.key==='core_ai');
    return a?{type:'agent',key:'core_ai',name:agentDisplayName(a),included:a.included,connected:a.connected,ready:a.ready,source:a.source||null}:null;
  }
  function secretaryPrompt(kind='day'){
    const today=new Date().toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const common='Usa SOLO datos reales de las fuentes conectadas. No inventes agenda, reuniones, correos, pedidos, clientes ni cifras. Si falta una conexión dilo claramente. Si existen varias conexiones del mismo tipo o varias cuentas, NO mezcles sus datos. Presenta la información agrupada por significado, no por el orden en que llega: Email separa Pedidos, Facturas/recibos, Consultas de clientes, Cobros/impagos, Reclamaciones/problemas e Informativos; Pedidos separa Listos, En revisión, Bloqueados y Datos faltantes; Ventas y clientes separa Seguimientos, Oportunidades y Clientes que requieren acción; Agenda separa Hoy y Próximas citas. No muestres categorías vacías salvo que ayude a dejar claro que no hay nada. Desde este panel no ejecutes acciones externas: cuando una tarea requiera actuar, ofrece conectarme con el empleado especializado y conserva el contexto.';
    if(kind==='close')return 'Actúa como mi Secretaria Ejecutiva. Haz el cierre de hoy '+today+'. FORMATO OBLIGATORIO: títulos Markdown y listas; cada dato o tarea en una línea distinta; sin párrafos largos. Usa: # Cierre del día; ## 1. Resuelto hoy; ## 2. Queda pendiente; ## 3. Preparado para mañana; ## 4. Necesito tu decisión; ## 5. Primera acción de mañana. Si enumeras elementos, cada uno debe empezar por "- ". '+common;
    if(kind==='pending')return 'Actúa como mi Secretaria Ejecutiva. Dime qué tengo pendiente hoy '+today+'. FORMATO OBLIGATORIO: cada pendiente en una línea propia, con guion; nunca juntes varios pendientes en una frase. Usa: # Pendientes de hoy; ## 🔴 Urgente; ## 🟡 Importante; ## 🟢 Puede esperar; ## Puedo adelantar por ti; ## Necesito tu autorización; ## Por dónde empezar. '+common;
    if(kind==='work')return 'Actúa como mi Secretaria Ejecutiva. Revisa todo lo disponible hoy '+today+' y dime qué trabajo puedes adelantar por mí ahora mismo. FORMATO OBLIGATORIO: una tarea por línea, con guion; sin párrafos largos. Usa: # Trabajo que puedo adelantar; ## Puedo preparar ahora; ## Dejaré listo para autorizar; ## Necesita tu decisión; ## Siguiente acción. '+common;
    if(kind==='alerts'){
      const mails=secretaryNewMails.slice(-8).map((m,i)=>(i+1)+'. '+(m.subject||'(sin asunto)')+' — '+(m.from||'remitente desconocido')+' — '+(Number(m.replyScore||0)>0?'parece requerir respuesta':'conviene revisar')).join('\n');
      return 'Actúa como mi Secretaria Ejecutiva. Han llegado estos correos nuevos que el sistema ha marcado como relevantes:\n'+mails+'\nFORMATO OBLIGATORIO: una línea por correo y una línea por acción; no juntes correos en un párrafo. Usa: # Correos nuevos; ## Revisar primero; ## Puedo resumir o preparar; ## Necesitan autorización; ## Siguiente acción. '+common;
    }
    return 'Actúa como mi Secretaria Ejecutiva. Prepárame el día de hoy, '+today+'. Debe servir tanto en pantalla como al exportarlo a PDF. REGLAS OBLIGATORIAS: nada de texto suelto, números aislados, palabras aisladas o referencias partidas; nunca dividas un identificador como VNX-PED-00021; una sola idea completa por línea; sin párrafos largos; sin repetir datos; no copies botones ni textos de la interfaz. Usa EXACTAMENTE estas secciones: # Resumen ejecutivo; ## 1. Prioridades de hoy; ## 2. Emails que requieren respuesta; ## 3. Gestiones a realizar; ## 4. Decisiones que debes tomar; ## 5. Alertas y bloqueos; ## 6. Informativos; ## 7. Fuentes consultadas. En Resumen ejecutivo: 4-6 puntos con cifras y estado general. En Prioridades: máximo 3, formato "- Prioridad: ... | Motivo: ... | Acción: ...". En Emails que requieren respuesta: UN correo por línea, formato "- Cuenta: ... | De: ... | Asunto: ... | Qué pide: ... | Acción: ..."; si no hay ninguno escribe "- Sin emails pendientes de respuesta". En Gestiones: una gestión por línea, formato "- Área: ... | Gestión: ... | Motivo: ...". En Decisiones: una pregunta completa por línea, formato "- Decisión: ... | Por qué importa: ...". En Alertas: una incidencia por línea, formato "- Área: ... | Alerta: ... | Consecuencia: ...". En Informativos: solo avisos que no requieren respuesta, formato "- Fuente: ... | Información: ...". En Fuentes consultadas: una fuente por línea, sin datos técnicos. Distingue siempre emails de acción frente a noreply/informativos. No conviertas un dato de stock, un nombre de cuenta o una referencia en una línea independiente: debe ir dentro de su apunte completo. Si hay una reunión o cita próxima en Agenda, añade dentro de Gestiones una línea completa "Área: Reunión | Gestión: Preparar dossier de [cliente/asunto] | Motivo: reunión prevista [fecha/hora]" y pregunta en Decisiones si quiero que prepares el dossier PDF. Si detectas riesgo de rotura de stock o productos a cero y existen datos de ventas/pedidos, añade una gestión "Analizar reposición" y ofrece preparar el Excel de compras; no calcules mínimos sin historial verificable. '+common;
  }
  async function runExecutiveSecretary(kind='day',{automatic=false}={}){
    const scope=secretaryCoreScope();if(!scope||scope.included===false)return;
    if(!automatic){
      selectAgentKey('core_ai',{preserve:true});
      setWorkspaceMode('free');
      masterMessages.push({role:'user',content:kind==='close'?'🌙 Hazme el cierre del día':kind==='pending'?'¿Qué tengo pendiente?':kind==='work'?'¿Qué puedes adelantar por mí?':kind==='alerts'?'🔔 Revisa los avisos nuevos':'☀️ Prepárame el día'});
      renderMasterMessages();
    }else{
      selectAgentKey('core_ai',{preserve:true});
      setWorkspaceMode('free');
      masterMessages.push({role:'assistant',content:'☀️ Buenos días. Estoy revisando tus conexiones para prepararte el día…'});
      renderMasterMessages();
    }
    try{
      const r=await window.vnx.sendChat([{role:'user',content:secretaryPrompt(kind)}],scope);
      masterMessages.push({role:'assistant',content:r.reply||'No he podido preparar el resumen.',images:r.images||[],handoff:r.handoff||null,secretaryActions:true});
      if(kind==='alerts')secretaryNewMails=[];
    }catch(e){
      masterMessages.push({role:'assistant',content:'No he podido completar la revisión: '+(e.message||e)});
    }
    updateSecretaryBar();
    renderMasterMessages({focusIndex:masterMessages.length-1});
  }
  function injectSecretaryStyles(){
    if(document.getElementById('vnxSecretaryStyles'))return;
    const s=document.createElement('style');s.id='vnxSecretaryStyles';s.textContent=
      '.vnx-secretary-bar{margin:0 0 14px;padding:12px 14px;border:1px solid rgba(104,168,255,.35);border-radius:14px;background:linear-gradient(135deg,rgba(19,55,83,.92),rgba(19,38,64,.92));display:flex;align-items:center;gap:10px;flex-wrap:wrap}.vnx-secretary-title{display:flex;align-items:center;gap:9px;margin-right:auto;min-width:220px}.vnx-secretary-title b{display:block}.vnx-secretary-title small{display:block;opacity:.78;margin-top:2px}.vnx-secretary-bar button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:inherit;border-radius:9px;padding:8px 10px;cursor:pointer}.vnx-secretary-bar button:hover{background:rgba(255,255,255,.14)}.vnx-secretary-alerts.has-alerts{font-weight:800;box-shadow:0 0 0 2px rgba(255,190,60,.22)}';
    document.head.appendChild(s);
  }
  function updateSecretaryBar(){
    const n=$m('[data-secretary-alerts]'),toggle=$m('[data-secretary-toggle]');
    if(n){n.textContent=secretaryNewMails.length?'🔔 '+secretaryNewMails.length+' por revisar':'🔔 Sin avisos';n.classList.toggle('has-alerts',secretaryNewMails.length>0)}
    if(toggle)toggle.textContent=secretaryAlertsEnabled()?'Avisos: ON':'Avisos: OFF';
  }
  function setupExecutiveSecretary(){
    const bind=(selector,fn)=>$$m(selector).forEach(btn=>{btn.onclick=fn});
    bind('[data-secretary-day]',()=>runExecutiveSecretary('day'));
    bind('[data-secretary-pending]',()=>runExecutiveSecretary('pending'));
    bind('[data-secretary-work]',()=>runExecutiveSecretary('work'));
    bind('[data-secretary-close]',()=>runExecutiveSecretary('close'));
    bind('[data-secretary-alerts]',()=>secretaryNewMails.length?runExecutiveSecretary('alerts'):runExecutiveSecretary('pending'));
    bind('[data-secretary-toggle]',()=>{
      localStorage.setItem('vnx_secretary_alerts',secretaryAlertsEnabled()?'off':'on');
      updateSecretaryBar();
    });
    updateSecretaryBar();
  }
  async function pollSecretaryEmail({initial=false}={}){
    if(!secretaryAlertsEnabled()||document.visibilityState==='hidden'&& !window.vnx?.secretaryNotify)return;
    const emailAgent=(runtimeAgents||[]).find(x=>x.key==='email');
    if(!emailAgent?.ready)return;
    try{
      const inbox=await window.vnx.emailInbox({limit:12}),rows=Array.isArray(inbox?.messages)?inbox.messages:[];
      const stored=JSON.parse(localStorage.getItem('vnx_secretary_seen_mail')||'[]');
      const seen=new Set(stored);
      if(!stored.length||initial){
        localStorage.setItem('vnx_secretary_seen_mail',JSON.stringify(rows.map(x=>x.id).filter(Boolean).slice(0,50)));
        return;
      }
      const fresh=rows.filter(x=>x.id&&!seen.has(x.id));
      const relevant=fresh.filter(x=>!emailIsInformative(x)&&(Number(x.replyScore||0)>0||Number(x.attentionScore||0)>=3));
      const next=[...rows.map(x=>x.id).filter(Boolean),...stored].filter((x,i,a)=>a.indexOf(x)===i).slice(0,80);
      localStorage.setItem('vnx_secretary_seen_mail',JSON.stringify(next));
      if(!relevant.length)return;
      secretaryNewMails.push(...relevant.filter(x=>!secretaryNewMails.some(y=>y.id===x.id)));
      secretaryNewMails=secretaryNewMails.slice(-12);
      updateSecretaryBar();
      refreshWorkbenchApprovals();
      autoTranslateFreshEmails(fresh);
      const first=relevant[0],kind=Number(first.replyScore||0)>0?'parece necesitar respuesta':'conviene revisarlo';
      const body=relevant.length===1?'Ha llegado «'+(first.subject||'(sin asunto)')+'». '+kind+'.':'Han llegado '+relevant.length+' correos que conviene revisar. Puedo resumirlos y prepararte las respuestas.';
      try{await window.vnx.secretaryNotify({title:'VentaNexIA · Secretaria Ejecutiva',body})}catch{}
    }catch{}
  }
  function startSecretaryEmailWatch(){
    if(secretaryMailTimer)clearInterval(secretaryMailTimer);
    pollSecretaryEmail({initial:true});
    secretaryMailTimer=setInterval(()=>pollSecretaryEmail(),5*60*1000);
  }
  function meetingMinutes(event){
    const t=Date.parse(event?.start||'');return Number.isFinite(t)?Math.round((t-Date.now())/60000):null;
  }
  async function prepareUpcomingMeeting(event){
    const scope=secretaryCoreScope();if(!scope||scope.included===false)return;
    const mins=meetingMinutes(event),people=(event.attendees||[]).map(x=>x.name||x.email).filter(Boolean).slice(0,12);
    const prompt=[
      'Actúa como mi Secretaria Ejecutiva y prepárame una reunión real que está en mi agenda.',
      'Reunión: '+(event.title||'(sin título)')+'.',
      'Empieza: '+(event.start||'')+'.'+(mins!=null?' Faltan aproximadamente '+mins+' minutos.':''),
      event.location?'Lugar: '+event.location+'.':'',
      people.length?'Asistentes: '+people.join(', ')+'.':'',
      'Haz una revisión general y cruza las fuentes conectadas: correo, pedidos, ventas y clientes, tienda y demás datos reales que puedan estar relacionados con el título, organizador o asistentes de esta reunión.',
      'Dame: 1) qué debería saber antes de entrar, 2) asuntos pendientes con estas personas/empresa, 3) correos o pedidos relacionados, 4) preguntas que conviene hacer, 5) siguiente acción después de la reunión.',
      'No inventes relaciones ni datos. Si no encuentras contexto adicional, dilo claramente.'
    ].filter(Boolean).join('\n');
    try{
      const r=await window.vnx.sendChat([{role:'user',content:prompt}],scope);
      masterMessages.push({role:'assistant',content:'## 📅 Reunión próxima: '+(event.title||'(sin título)')+'\n\n'+(r.reply||'No he encontrado información adicional para preparar esta reunión.'),images:r.images||[],handoff:r.handoff||null});
      renderMasterMessages();
    }catch{}
  }
  async function pollSecretaryCalendar({initial=false}={}){
    if(!secretaryAlertsEnabled()||!window.vnx?.agendaUpcoming)return;
    try{
      const r=await window.vnx.agendaUpcoming(120);
      if(!r?.connected)return;
      const events=(r.events||[]).filter(e=>!e.allDay);
      for(const event of events){
        const mins=meetingMinutes(event);
        if(mins==null||mins<10||mins>35)continue;
        const key='vnx_secretary_meeting_'+secretaryDateKey()+'_'+String(event.id||event.start||event.title).slice(0,120);
        if(localStorage.getItem(key)==='done')continue;
        localStorage.setItem(key,'done');
        try{await window.vnx.secretaryNotify({title:'VentaNexIA · Reunión en '+mins+' min',body:(event.title||'Tienes una reunión')+'. Estoy preparando lo importante para que entres con todo revisado.'})}catch{}
        await prepareUpcomingMeeting(event);
      }
    }catch{}
  }
  function startSecretaryCalendarWatch(){
    if(secretaryCalendarTimer)clearInterval(secretaryCalendarTimer);
    pollSecretaryCalendar({initial:true});
    secretaryCalendarTimer=setInterval(()=>pollSecretaryCalendar(),5*60*1000);
  }
  async function maybeRunMorningBrief(){
    if(localStorage.getItem('vnx_secretary_auto_brief')==='off')return;
    const key='vnx_secretary_brief_'+secretaryDateKey();
    if(localStorage.getItem(key)==='done')return;
    const scope=secretaryCoreScope();if(!scope||scope.included===false)return;
    localStorage.setItem(key,'done');
    await runExecutiveSecretary('day',{automatic:true});
  }

  function isShopifyStockRequest(text='',scope=null){
    const q=String(text||'').toLowerCase();
    const stockIntent=(/\b(stock|inventario|sin stock|reposici[oó]n|reponer|compras?|rotura|previsi[oó]n|se me acaba|quedar(?:me|nos)? sin)\b/.test(q)||/agot/.test(q));
    if(!stockIntent)return false;
    if(scope?.type==='shopify')return true;
    if(scope?.selectedSource?.module==='shopify'||scope?.selectedSource?.type==='shopify')return true;
    return false;
  }
  function shopifyStockTable(summary={}){
    const rows=Array.isArray(summary.rows)?summary.rows:[];
    const sorted=[...rows].sort((a,b)=>
      Number(Boolean(b.urgent))-Number(Boolean(a.urgent)) ||
      Number(b.qty||0)-Number(a.qty||0) ||
      Number(a.daysRemaining??999999)-Number(b.daysRemaining??999999) ||
      String(a.product||'').localeCompare(String(b.product||''))
    );
    const fmt=n=>Number(n||0).toLocaleString('es-ES',{maximumFractionDigits:3});
    const ref=r=>r.sku||r.ean||'—';
    const coverage=r=>r.daysRemaining==null?'Sin ventas registradas':String(r.daysRemaining);
    const status=r=>{
      if(r.urgent&&Number(r.stock||0)<=0)return 'Stock 0, rotura inmediata';
      if(r.urgent)return '⚠️ Menos de 5 días de cobertura';
      if(r.noSalesData)return Number(r.stock||0)<=0?'Stock 0, sin ventas registradas':'Sin ventas registradas';
      if(Number(r.qty||0)>0)return 'Reposición recomendada';
      return 'Stock suficiente';
    };
    const lines=[
      '# Stock y reposición · Shopify',
      '',
      '**Cálculo real del programa:** ventas de los últimos '+(summary.windowDays||180)+' días por SKU/EAN. Los pedidos cancelados están excluidos.',
      '',
      '| SKU / EAN | Producto | Stock actual | Ventas 6 meses | Media diaria | Días de cobertura | Cantidad a pedir | Estado |',
      '|---|---|---:|---:|---:|---:|---:|---|'
    ];
    const maxRows=1000;
    for(const r of sorted.slice(0,maxRows)){
      const product=String(r.product||'').replace(/\|/g,'/');
      lines.push('| '+ref(r)+' | '+product+' | '+fmt(r.stock)+' | '+fmt(r.soldWindow)+' | '+fmt(r.avgDaily)+' | '+coverage(r)+' | '+fmt(r.qty)+' | '+status(r)+' |');
    }
    lines.push('');
    lines.push('**Resumen:** '+rows.length+' referencias analizadas · '+sorted.filter(r=>r.urgent).length+' con riesgo urgente · '+sorted.filter(r=>Number(r.qty||0)>0).length+' con reposición propuesta.');
    if(summary.truncated)lines.push('⚠️ La consulta alcanzó el límite de seguridad de pedidos; no presento el periodo como exhaustivo.');
    if(summary.catalogTruncated)lines.push('⚠️ El catálogo alcanzó el límite de seguridad; pueden faltar referencias.');
    if(rows.length>maxRows)lines.push('Se muestran las primeras '+maxRows+' referencias, priorizando urgentes y reposición. Total calculado: '+rows.length+'.');
    lines.push('');
    lines.push('**Regla urgente:** menos de 5 días de cobertura, aunque todavía quede stock.');
    lines.push('**Objetivo de reposición:** cubrir 30 días al ritmo real de venta. Los cálculos los hace VentaNexIA, no la IA.');
    lines.push('');
    lines.push('Listo para enviar a Compras cuando lo autorices.');
    return lines.join('\n');
  }
  function enrichBusinessRequest(text,scope){
    const raw=String(text||'').trim(),q=raw.toLowerCase();
    const stockIntent=(/\b(stock|inventario|sin stock|reposici[oó]n|reponer|compras?|rotura|previsi[oó]n|se me acaba|quedar(?:me|nos)? sin)\b/.test(q)||/agot/.test(q))&&(/\b(revis|analiz|nivel|objetiv|m[ií]nim|pedido|comprar|reposici[oó]n|stock|rotura|previsi[oó]n|d[ií]as)\b/.test(q)||/agot/.test(q));
    const meetingIntent=/\b(reuni[oó]n|visita|cita)\b/.test(q)&&/\b(prepar|informe|dossier|cliente|agenda|datos|revis)\b/.test(q);
    if(stockIntent){
      return raw+'\n\nINSTRUCCIÓN INTERNA VENTANEXIA — ANÁLISIS DE STOCK, REPOSICIÓN Y RIESGO DE ROTURA: Si hay una fuente con path que empiece por "Shopify" y contenga "reposición y previsión de rotura", esos números YA están calculados por el programa a partir de ventas reales de los últimos 6 meses (180 días) por cada SKU o EAN por separado. No recalcules nada ni inventes cifras: explica y prioriza exactamente los valores recibidos. Si la consulta alcanzó el límite de seguridad, indícalo. FORMATO OBLIGATORIO: # Resumen rápido; ## Riesgo de rotura en menos de 5 días — una línea por producto con urgent=true, aunque todavía tenga stock; ## Reposición propuesta para cubrir 30 días — una línea por producto con qty>0 e incluye SKU/EAN, producto, stock actual, ventas 6 meses, media diaria, días de cobertura y cantidad a pedir; ## Productos sin ventas registradas — no propongas cantidad para ellos salvo que el stock ya esté agotado; ## Acción para Compras. Si Compras o un ERP está conectado, no hagas el pedido sin permiso: deja "Listo para enviar a Compras" y pide autorización. El resultado debe poder exportarse directamente a Excel y PDF.';
    }
    if(meetingIntent){
      return raw+'\n\nINSTRUCCIÓN INTERNA VENTANEXIA — PREPARACIÓN DE REUNIÓN: Localiza la reunión relevante en la Agenda conectada y usa título, asistentes, organizador, descripción y fecha. Cruza únicamente datos reales disponibles de Email, Ventas y clientes/CRM, Pedidos, tienda/Shopify y demás fuentes autorizadas que correspondan al cliente o a sus asistentes. No confundas clientes con nombres parecidos. FORMATO OBLIGATORIO PARA PDF: # Dossier de reunión; ## Resumen ejecutivo; ## Datos de la reunión; ## Cliente y relación comercial; ## Compras e historial; ## Facturación disponible; ## Pedidos y situación actual; ## Emails y asuntos pendientes; ## Incidencias o riesgos; ## Oportunidades detectadas; ## Temas que conviene tratar; ## Recomendaciones para la reunión; ## Preguntas que conviene hacer; ## Fuentes consultadas. En cada apartado resume, no vuelques correos ni datos en bruto. Incluye cifras solo si están verificadas. Si una fuente no está conectada, indica "Dato no disponible". Las recomendaciones deben derivarse de los datos observados y diferenciarse claramente de los hechos. El resultado debe estar listo para exportar a PDF.';
    }
    return raw;
  }
  function setupMasterChat(){
    const form=$m('#chatForm');if(!form)return;
    restoringChatState=true;loadMasterChatState();restoringChatState=false;
    const chatInput=ensureChatInputEditable();
    loadChatDraft();
    if(chatInput){
      ['pointerdown','mousedown','click'].forEach(ev=>chatInput.addEventListener(ev,()=>keepChatComposerUsable({focus:true}),true));
      chatInput.addEventListener('focus',()=>keepChatComposerUsable(),true);
      chatInput.addEventListener('input',persistChatDraft);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')keepChatComposerUsable()});
      window.addEventListener('focus',()=>keepChatComposerUsable());
    }
    const clearConversation=()=>{
      masterMessages=[];
      const input=ensureChatInputEditable();if(input)input.value='';
      clearPersistedChat();
      renderMasterMessages();
      if(input)input.focus();
    };
    const clearBtn=$m('#chatClearBtn');if(clearBtn)clearBtn.onclick=clearConversation;
    const newBtn=$m('#chatNewConversation');if(newBtn)newBtn.onclick=clearConversation;
    window.addEventListener('storage',ev=>{
      if(ev.key===CHAT_STATE_KEY&&ev.newValue){
        try{
          const raw=JSON.parse(ev.newValue);
          if(raw&&Array.isArray(raw.messages)){
            const oldCount=masterMessages.length;
            restoringChatState=true;
            masterMessages=raw.messages.slice(-50);
            restoringChatState=false;
            const newest=masterMessages[masterMessages.length-1];
            const focusNew=masterMessages.length>oldCount&&newest?.role==='assistant'?masterMessages.length-1:null;
            renderMasterMessages({persist:false,focusIndex:focusNew});
          }
        }catch{}
      }
      if(ev.key===CHAT_DRAFT_KEY){
        const input=ensureChatInputEditable();
        if(input&&document.activeElement!==input)input.value=ev.newValue||'';
      }
    });
    if(window.vnx?.onBeforeQuit)window.vnx.onBeforeQuit(()=>{
      if(localStorage.getItem(CHAT_CLEAR_ON_EXIT_KEY)==='on')clearPersistedChat();
    });
    renderMasterMessages();
    form.onsubmit=async e=>{
      e.preventDefault();const input=ensureChatInputEditable(),text=input?.value.trim();if(!text)return;
      const connections=chatConnections(),scope=selectedChatScope();
      if(!scope){
        masterMessages.push({role:'assistant',content:'Elige arriba el agente de VentaNexIA con el que quieres trabajar.'});renderMasterMessages();return;
      }
      if(scope.needsSourceChoice){masterMessages.push({role:'assistant',content:'Tienes varias conexiones para este empleado. Elige arriba cuál quieres consultar o selecciona “Todas, separadas”.'});renderMasterMessages();return;}
      if(scope.included===false){
        masterMessages.push({role:'assistant',content:'Este agente aparece en tu equipo, pero no está incluido en tu plan actual. Para usarlo debes contratarlo o cambiar de plan.'});renderMasterMessages();return;
      }
      if(scope.connected===false){
        masterMessages.push({role:'assistant',content:'Este agente está incluido, pero todavía necesita conectar su herramienta o fuente de datos. Ve a “Conexiones”, actívala y vuelve aquí.'});renderMasterMessages();return;
      }
      const visibleText=redactSensitiveChatText(text,scope),activeScopeKey=chatScopeKey(scope);
      masterMessages.push({role:'user',content:visibleText,scopeKey:activeScopeKey});input.value='';try{localStorage.removeItem(CHAT_DRAFT_KEY)}catch{}renderMasterMessages();
      const btn=e.submitter||form.querySelector('button');btn.disabled=true;btn.textContent='Mirándolo…';
      try{
        if(isShopifyStockRequest(text,scope)&&window.vnx?.shopifyReplenishmentSummary){
          const summary=await window.vnx.shopifyReplenishmentSummary();
          const reply=shopifyStockTable(summary);
          const purchaseRows=(summary.rows||[]).filter(r=>Number(r.qty||0)>0).map(r=>[
            String(r.sku||''),
            String(r.ean||''),
            String(r.product||''),
            Number(r.stock||0),
            Number(r.soldWindow||0),
            Number(r.avgDaily||0),
            r.daysRemaining==null?'':Number(r.daysRemaining),
            Number(r.qty||0),
            r.urgent?'URGENTE <5 DIAS':'REPOSICION'
          ]);
          const purchaseData={
            headers:['sku','ean','producto','stock_actual','ventas_180_dias','media_diaria','dias_cobertura','cantidad_a_pedir','estado'],
            rows:purchaseRows
          };
          masterMessages.push({role:'assistant',content:reply,purchaseExport:true,purchaseData,scopeKey:activeScopeKey});
          renderMasterMessages({focusIndex:masterMessages.length-1});
          btn.disabled=false;btn.textContent='Enviar';
          return;
        }
        const enrichedText=enrichBusinessRequest(text,scope);
        const scopedMessages=masterMessages.filter(m=>m.scopeKey===activeScopeKey||m===masterMessages[masterMessages.length-1]);
        const payload=scopedMessages.map(({role,content},i)=>({role,content:i===scopedMessages.length-1&&role==='user'?enrichedText:content}));
        const r=scope.separateSources?await sendSeparatedBySources(enrichedText,scope,payload):await window.vnx.sendChat(payload,scope);
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
        masterMessages.push({role:'assistant',content:reply,images:r.images||[],emailActions:r.emailActions||null,emailActionGroups:r.emailActionGroups||[],handoff:r.handoff||null,secretaryActions:scope?.key==='core_ai',purchaseExport:isPurchaseProposal(reply),scopeKey:activeScopeKey});renderMasterMessages({focusIndex:masterMessages.length-1});
      }catch(err){masterMessages.push({role:'assistant',content:`No he podido conectar: ${err.message||err}`,scopeKey:activeScopeKey});renderMasterMessages()}
      finally{btn.disabled=false;btn.textContent='Enviar'}
    };
  }

  async function start(){
    // Enlazar primero los controles críticos de Conexiones: un fallo posterior no debe dejar botones muertos.
    const connectOwn=$m('#connectOwnAgentBtn'),manageOwn=$m('#manageOwnAgentsBtn');
    if(connectOwn&&!connectOwn.dataset.vnxBound){connectOwn.dataset.vnxBound='1';connectOwn.addEventListener('click',openOwnAgentManager)}
    if(manageOwn&&!manageOwn.dataset.vnxBound){manageOwn.dataset.vnxBound='1';manageOwn.addEventListener('click',openOwnAgentManager)}
    await migrateLegacyPortals();
    setupMasterPortalUi();
    setupMasterChat();
    setupGuidedUi();
    setupWorkbench();
    setupMasterCenter();
    setupMasterBusiness();
    await renderMasterPortals();
    await refreshChatConnections();
    setupExecutiveSecretary();
    startSecretaryEmailWatch();
    startSecretaryCalendarWatch();
    await maybeRunMorningBrief();
    setInterval(()=>{if($m('#portalList')&&document.visibilityState==='visible')renderMasterPortals()},12000);
  }
  setTimeout(start,350);
})();