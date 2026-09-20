(()=>{
  const $m=s=>document.querySelector(s),$$m=s=>[...document.querySelectorAll(s)];
  const escM=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let masterPortals=[];
  let masterMessages=[];
  let handoffAgentChange=false;
  let runtimeConnections=[];
  let runtimeAgents=[];
  let agentMetrics={};
  const AGENT_INPUT_EXAMPLES={
    core_ai:'Ej.: ¿qué tengo pendiente hoy? · resume pedidos, correos y ventas · dime qué clientes necesitan atención',
    email:'Ej.: revisa mis correos de hoy, dime cuáles necesitan respuesta, prepara la contestación y crea un borrador en Gmail',
    whatsapp:'Ej.: prepara una respuesta para este cliente y déjamela lista para autorizar antes de enviarla',
    prospecting:'Ej.: busca 10 clínicas en Barcelona que puedan comprar portasueros · después: prepara los emails · envía los emails · seguimiento',
    crm:'Ej.: qué oportunidades debo seguir hoy, prepara un plan comercial o revisa los clientes conectados',
    customer_service:'Ej.: qué consultas necesitan respuesta, prepara una respuesta o crea un guion para atender una llamada',
    quotes:'Ej.: prepara una propuesta para una clínica con 5 portasueros y 2 mesas Mayo',
    orders:'Ej.: revisa los pedidos recibidos por email o portal y prepara su alta en el programa de gestión',
    social:'Ej.: crea una campaña para Instagram y LinkedIn y mejora la visibilidad en Google de la página del producto',
    web_ecommerce:'Ej.: cuántos pedidos han entrado hoy, cuánto hemos facturado esta semana o revisa productos y stock',
    administration:'Ej.: organiza mis tareas de esta semana, prepara seguimientos y ordena estos documentos',
    reports:'Ej.: compara este mes con el anterior y prepara un informe de ventas con conclusiones',
    automation:'Ej.: crea un flujo para avisarme de nuevos pedidos y dime qué tareas repetitivas podemos hacer automáticamente'
  };
  const GUIDED_AGENT_FORMS={
    core_ai:{
      subtitle:'Tu centro de mando: pregunta aquí por cualquier dato de tus agentes y conexiones sin tener que entrar uno por uno.',
      primary:'✨ Pedir ayuda a VentaNexIA',
      fields:[
        {key:'goal',label:'¿QUÉ NECESITAS?',type:'textarea',wide:true,placeholder:'Ej. analiza este problema, prepara una propuesta o resume esta información',required:true},
        {key:'context',label:'CONTEXTO',type:'textarea',wide:true,placeholder:'Añade los datos importantes que deba tener en cuenta'},
        {key:'result',label:'¿CÓMO QUIERES EL RESULTADO?',type:'text',wide:true,placeholder:'Ej. breve y ejecutivo, paso a paso, tabla, propuesta comercial'}
      ],
      capabilities:['Consultar desde un solo sitio Email, Pedidos, Ventas y clientes, Shopify, WhatsApp, Redes y demás conexiones permitidas','Cruzar datos de varios agentes en una misma respuesta','Decirte qué tienes pendiente y qué necesita atención','Indicar de qué fuente sale cada dato y qué conexión no está disponible','Las acciones reales siguen pasando por el agente especialista y su autorización'],
      steps:['Pedir','Revisar','Ajustar']
    },
    email:{
      subtitle:'Lee, organiza y prepara respuestas de tu correo conectado.',
      primary:'✉️ Revisar correo',
      fields:[
        {key:'task',label:'¿QUÉ QUIERES HACER?',type:'select',options:['Ver los últimos correos','Ver los correos de hoy','Ver cuáles necesitan respuesta','Preparar una respuesta','Pedir datos que faltan','Crear borrador en Gmail','Archivar o marcar un correo','Otra gestión']},
        {key:'target',label:'¿DE QUÉ CORREO?',type:'text',wide:true,placeholder:'Opcional. Ej. correo de Marta, asunto pedido 301, primer correo'},
        {key:'instruction',label:'¿QUÉ QUIERES QUE RESPONDA O PIDA?',type:'textarea',wide:true,placeholder:'Ej. agradecer el mensaje y pedir dirección de entrega y CIF'},
        {key:'result',label:'CÓMO QUIERES DEJARLO',type:'select',options:['Preparado para revisar','Crear borrador en Gmail','Mostrarme primero la respuesta']}
      ],
      capabilities:['Leer los correos de Gmail conectado','Mostrar los correos de hoy y los más recientes','Detectar cuáles necesitan respuesta','Preparar respuestas y solicitudes de datos','Crear borradores directamente en Gmail','Enviar solo cuando confirmes la acción','Archivar, marcar leído o destacar correos'],
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
        'Entregar los pedidos como archivo para importar (CSV, XML, JSON), por webhook/API o como borrador de Shopify, conservando el número interno',
        'Modo automático solo cuando todo coincide y la lectura está verificada',
        'Aún no: conectores directos con cada ERP, PDFs escaneados y teclear pedidos en páginas privadas'
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
  function guidedConfig(key){return GUIDED_AGENT_FORMS[key]||GUIDED_AGENT_FORMS.core_ai}
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
    const names={core_ai:'Actúa como centro de mando de VentaNexIA. Responde usando todas las fuentes conectadas que recibas, cruza la información cuando sea útil, indica el origen de los datos y no ejecutes acciones desde este panel.',crm:'Prepara el mejor plan de ventas y clientes con estos datos',customer_service:'Prepara la mejor respuesta de atención al cliente con estos datos',quotes:'Prepara un presupuesto y propuesta profesional con estos datos',orders:'Gestiona Pedidos con el motor real. Puedes revisar pedidos, ver pendientes, pedir los datos que faltan, introducir los pedidos listos o configurar destino, clientes, catálogo y modo. No afirmes que se comprueba stock, se consulta a Compras, se teclean pedidos en páginas privadas ni se usan conectores ERP directos: esas funciones aún no están implementadas.',social:'Prepara una campaña de marketing y visibilidad con estos datos',web_ecommerce:'Realiza esta consulta o prepara esta tarea de Web y tienda',administration:'Organiza esta tarea de administración y agenda',reports:'Prepara un informe y análisis con estos datos',automation:'Diseña una tarea automática segura y clara con estos datos'};
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
      core_ai:'ideas, textos y tareas',
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
    const sel=$m('#chatConnectionSelect');if(!sel)return false;
    const value='agent:'+key;
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
      let selected=0,filter='all',search='';
      const accountOptions=['Todas las cuentas',...accountNames];
      host.innerHTML='<div class="email-dashboard">'
        +'<div class="email-toolbar"><div><span class="email-work-icon">✉</span><div><h3>Correo y bandeja de entrada</h3><p>Gestiona tus correos con la ayuda de VentaNexIA.</p></div></div><div class="email-toolbar-controls"><label class="email-account-select"><span>Cuenta</span><select data-email-account>'+accountOptions.map((n,i)=>'<option value="'+(i===0?'':escM(n))+'">'+escM(n)+'</option>').join('')+'</select></label><label class="email-search">⌕<input data-email-search placeholder="Buscar correos, remitentes o asuntos…"></label></div></div>'
        +'<div class="email-metric-grid" data-email-metrics></div>'
        +'<div class="email-workspace"><section class="email-list-panel"><div class="email-list-tabs"><button class="active" data-email-filter="all">✉ Recibidos</button><button data-email-filter="responded">✓ Respondidos</button><button data-email-filter="pending">◷ Pendientes</button><button data-email-filter="no_reply">✓ Sin respuesta</button></div><div class="email-list" data-email-list></div></section><section class="email-detail-panel" data-email-detail></section></div>'
        +'</div>';
      const list=host.querySelector('[data-email-list]'),detail=host.querySelector('[data-email-detail]');
      const visibleIndexes=()=>messages.map((m,i)=>({m,i})).filter(({m})=>{
        const statusOk=filter==='all'||m.status===filter;
        const q=search.toLowerCase();
        const searchOk=!q||[m.from,m.subject,m.snippet].join(' ').toLowerCase().includes(q);
        return statusOk&&searchOk;
      }).map(x=>x.i);
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
        renderList();renderDetail();
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
    if(title)title.textContent=(chosen.icon||'🤖')+' '+chosen.name;
    if(sub)sub.textContent=cfg.subtitle||'';
    if(chosen.key==='email'){renderEmailDashboard(chosen);renderGuidedOtherCards(chatConnections(),chosen);return;}
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
      if(seen.has(key))continue;
      seen.add(key);found.push({key,label,token:match[0]});
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
        r=await window.vnx.sendChat([{role:'user',content:prompt}],scope);
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