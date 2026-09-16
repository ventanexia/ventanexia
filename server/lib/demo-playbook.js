function norm(value = "") {
  return String(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const A = (title, body) => `${title}\n\n${body}`;

const rules = [
  {
    test: t => /erp/.test(t) && /(transportista|mensajeria|logistica)/.test(t) && /(diferente|distinto|contradic|no coincide)/.test(t),
    answer: A("No elegiría uno al azar.", "Primero comprobaría qué dato aporta cada fuente y cuándo se actualizó. Por ejemplo, el ERP puede indicar la fecha prevista interna y el transportista el último evento físico del envío. Si existe una regla de prioridad configurada, la aplicaría; si no, contrastaría pedido, expedición y tracking.\n\nSi la discrepancia siguiera sin poder resolverse con certeza, no daría una fecha inventada al cliente. Prepararía y enviaría el caso a Logística con las dos evidencias y todo el contexto:\n\nPara Logística\nCliente: [identificado]\nPedido: [si está disponible]\nDato ERP: [valor y hora]\nDato transportista: [valor y hora]\nConsulta: confirmar estado/fecha correcta\nAcción requerida: validar la fuente vigente y responder al cliente.\n\nEn tu plan contratado: este contraste se haría con los sistemas conectados y la regla de prioridad que defina tu empresa. El objetivo es responder con un dato comprobado, no con el que “parezca” más probable."),
  },
  {
    test: t => /(inventas|inventar|alucina|fiar|fiable|confianza|respuestas reales|respuestas genericas)/.test(t),
    answer: A("No deberías confiar porque la IA suene convincente; deberías confiar porque puede comprobar.", "Cuando una respuesta depende de un dato de tu empresa —precio, stock, pedido, factura, fecha de entrega— VentaNexIA consulta la fuente autorizada correspondiente antes de confirmarlo. Si el dato no aparece, busca otra fuente permitida o lo escala; no lo presenta como hecho.\n\nAdemás, tú defines qué acciones puede ejecutar sola y cuáles requieren aprobación. Por ejemplo, puede responder una FAQ automáticamente, pero un descuento excepcional puede quedar pendiente de Dirección Comercial.\n\nEn tu plan contratado: trabajaría sobre tus fuentes, reglas y permisos. La confianza no se basa en “que la IA sepa mucho”, sino en que sepa dónde verificar cada dato y cuándo debe detenerse y pedir validación."),
  },
  {
    test: t => /(equivoca|error|falla|respuesta incorrecta|se confunde)/.test(t),
    answer: A("El sistema debe estar preparado tanto para evitar errores como para recuperarse de ellos.", "Antes de confirmar datos sensibles puede volver a consultar la fuente vigente y aplicar reglas de negocio. Si detecta baja certeza, datos contradictorios o una excepción, no continúa como si estuviera seguro: frena la acción y escala.\n\nLas acciones sensibles pueden exigir aprobación humana y el contexto de la conversación se conserva para que el responsable no tenga que empezar de cero.\n\nEn tu plan contratado: definiríamos qué datos se validan siempre, qué acciones requieren aprobación y a quién se escala cada tipo de incidencia."),
  },
  {
    test: t => /(revisar|antes de.*env|antes de.*public|pedirme permiso|aprobacion|visto bueno)/.test(t),
    answer: A("Sí. El nivel de autonomía lo decides tú.", "Puedes configurar que ciertas tareas se ejecuten automáticamente y otras queden en borrador o pendientes de aprobación. Por ejemplo: responder horarios o consultar pedidos sin intervención, pero pedir tu visto bueno antes de publicar en redes, aplicar descuentos, enviar una propuesta especial o comprometer una condición comercial.\n\nEn tu plan contratado: las reglas pueden variar por agente, canal, importe, cliente o tipo de acción. Así automatizas lo repetitivo sin perder control sobre lo sensible."),
  },
  {
    test: t => /(dos clientes|varios clientes|muchos clientes|a la vez|simultane)/.test(t),
    answer: A("Puede manejar varias conversaciones en paralelo sin mezclar sus contextos.", "Cada conversación mantiene su propio cliente, historial, intención y datos disponibles. El agente debe consultar y actualizar únicamente el expediente correcto. Si un cliente cambia de canal o identidad, se aplican las reglas de identificación antes de asociar información sensible.\n\nEn tu plan contratado: la capacidad simultánea depende del plan y de los límites de las integraciones, pero el diseño es multiconversación y con separación de contexto por cliente."),
  },
  {
    test: t => /(aprendes|aprender mi empresa|conoces mi empresa|entrenar|te enseno|te enseño)/.test(t),
    answer: A("Sí, pero no mediante un aprendizaje autónomo e incontrolado.", "VentaNexIA se configura con la información que tu empresa autoriza: catálogo, tarifas, PDFs, procedimientos, FAQs, tono, responsables, reglas y sistemas conectados. Cuando cambias una política o un precio, se actualiza la fuente o configuración correspondiente.\n\nEn tu plan contratado: el agente trabaja con ese conocimiento empresarial actualizado y con reglas explícitas. Eso evita que una conversación aislada cambie por sí sola cómo opera toda la empresa."),
  },
  {
    test: t => /(recuerdas|recordar.*cliente|conversaciones anteriores|historial)/.test(t),
    answer: A("Puede conservar contexto e historial cuando la configuración y la política de datos lo permitan.", "La idea es que un cliente no tenga que repetir nombre, empresa, pedido o problema si esos datos ya constan y siguen siendo relevantes. También puede registrar notas o seguimientos en el CRM conectado.\n\nEn tu plan contratado: definimos qué información se conserva, durante cuánto tiempo y en qué sistema. No se trata de una memoria ilimitada sin control, sino de contexto empresarial gestionado."),
  },
  {
    test: t => /(cambia.*precio|precio cambia|tarifa nueva|precio actual)/.test(t),
    answer: A("Para un precio actual no debería confiar en una respuesta antigua.", "Antes de confirmarlo consultaría la tarifa vigente de la fuente configurada, aplicaría las condiciones del cliente y verificaría si existe una promoción o excepción autorizada. Si encuentra dos precios incompatibles o una condición fuera de regla, lo escalaría a Ventas/Dirección Comercial.\n\nEn tu plan contratado: el precio que se comunica sale de la fuente que tú declares como oficial y de las reglas comerciales que definas."),
  },
  {
    test: t => /(datos confidenciales|informacion confidencial|privacidad|datos sensibles)/.test(t),
    answer: A("Solo debería acceder a los datos necesarios y autorizados para la tarea.", "La empresa decide qué sistemas se conectan, qué puede leer o modificar cada agente y qué acciones necesitan aprobación. Un agente comercial, por ejemplo, no tiene por qué disponer de permisos administrativos que no necesite.\n\nEn tu plan contratado: los accesos se definen por integración y función, se pueden reducir o revocar y la información de cada empresa se mantiene separada dentro de la arquitectura del servicio."),
  },
  {
    test: t => /(quien decide.*sistemas|a que sistemas|quitarte permisos|retirar permisos|revocar acceso)/.test(t),
    answer: A("La empresa controla los accesos.", "VentaNexIA no debería obtener permisos por su cuenta. El administrador decide qué integraciones se conectan y qué puede hacer cada agente. Si retiras un permiso o desconectas una integración, esa capacidad deja de estar disponible y el flujo debe adaptarse o escalarse.\n\nEn tu plan contratado: configuramos una matriz clara de lectura, escritura, envío, publicación y aprobación por agente."),
  },
  {
    test: t => /(chatbot normal|chat bot|diferencia.*chatbot)/.test(t),
    answer: A("La diferencia principal es que VentaNexIA está pensado para trabajar, no solo para conversar.", "Un chatbot puede responder preguntas. Un agente de VentaNexIA, con las integraciones y permisos adecuados, puede identificar al cliente, consultar su pedido, actualizar el CRM, preparar o enviar un email, reservar una reunión, crear una tarea, publicar contenido o escalar una incidencia con contexto.\n\nEn tu plan contratado: cada agente tiene conocimiento, reglas, herramientas, responsables y límites definidos para desempeñar una función empresarial concreta."),
  },
  {
    test: t => /(chatgpt|diferencia.*venta.*ia|diferencia.*usar.*ia)/.test(t),
    answer: A("ChatGPT es una herramienta general de IA; VentaNexIA es una capa operativa configurada para tu empresa.", "VentaNexIA añade identidad empresarial, fuentes de conocimiento, procesos, permisos, responsables, integraciones y automatizaciones. El objetivo no es abrir un chat y explicarle cada vez qué hacer, sino que el agente conozca su función y ejecute el flujo permitido.\n\nEn tu plan contratado: podrías tener agentes distintos para ventas, administración o atención, cada uno con acceso solo a lo que necesita."),
  },
  {
    test: t => /(madrugada|fin de semana|24\/7|24 horas|fuera de horario)/.test(t),
    answer: A("Sí, las tareas automatizadas pueden funcionar fuera del horario humano si así lo configuras.", "Puede responder, clasificar, recoger datos, consultar sistemas disponibles y dejar acciones preparadas. Si la solución requiere una persona —por ejemplo una excepción comercial— deja el caso escalado al responsable con todo el contexto.\n\nEn tu plan contratado: decides qué procesos permanecen activos 24/7 y cuáles esperan horario laboral o aprobación."),
  },
  {
    test: t => /(agente de ventas.*administracion|varios agentes|agentes distintos|departamentos)/.test(t),
    answer: A("Sí. Esa separación es precisamente una buena práctica.", "Puedes tener un agente comercial con catálogo, CRM y tarifas, otro de administración con facturas y cobros, y otro de atención con pedidos e incidencias. Cada uno puede tener tono, conocimiento, permisos y escalados diferentes.\n\nEn tu plan contratado: se asignan funciones y accesos por rol para evitar dar a un agente más información o capacidad de la necesaria."),
  },
  {
    test: t => /(descuento|rebaja)/.test(t),
    answer: A("Puede aplicar descuentos solo dentro de las reglas que autorices.", "Si la política permite una determinada condición, puede calcularla y responder. Si el cliente pide una excepción fuera del límite, no debería comprometerla: prepara la propuesta y solicita aprobación al responsable comercial.\n\nEn tu plan contratado: tú defines límites, excepciones y quién aprueba. Nunca debería inventar un porcentaje permitido."),
  },
  {
    test: t => /(cliente enfadado|cliente molesto|insulta|enfadad|furioso)/.test(t),
    answer: A("No discutiría con el cliente ni intentaría 'ganar' la conversación.", "Primero identificaría el problema, consultaría los datos reales, respondería con tono profesional y propondría el siguiente paso permitido. Si detecta reclamación sensible, riesgo, amenaza, compensación económica o una excepción que no puede resolver, escala al responsable adecuado conservando el contexto.\n\nEn tu plan contratado: puedes definir cuándo seguir resolviendo automáticamente y cuándo intervenir con una persona."),
  },
  {
    test: t => /(presupuesto|presupuestos|oferta comercial)/.test(t),
    answer: A("Sí, puede preparar presupuestos con los datos autorizados de tu empresa.", "Recuperaría cliente, productos, cantidades, tarifa, impuestos y condiciones desde las fuentes configuradas; aplicaría la plantilla y reglas comerciales; y después lo enviaría automáticamente o lo dejaría para aprobación según tus permisos.\n\nEn tu plan contratado: las excepciones de precio o condiciones especiales se derivan a Ventas/Dirección Comercial antes de comprometerlas."),
  },
  {
    test: t => /(resena|reseña|review).*(negativ|mala)|negativ.*(resena|reseña|review)/.test(t),
    answer: A("Sí, pero no todas las reseñas deben tratarse igual.", "Puede analizar el motivo, consultar el contexto disponible y redactar una respuesta coherente con el tono de marca. Una crítica simple podría responderse automáticamente si lo autorizas; una acusación grave, reclamación sensible o compensación debe escalarse o pedir aprobación.\n\nEn tu plan contratado: con la integración correspondiente puede preparar y, si está permitido, publicar la respuesta."),
  },
  {
    test: t => /(clientes nuevos|prospect|prospeccion|captar clientes|buscar clientes)/.test(t),
    answer: A("Sí, puede ayudar a localizar y priorizar oportunidades usando fuentes y herramientas autorizadas.", "Partiría de tu producto, cliente ideal, zona y criterios comerciales; buscaría empresas o contactos disponibles en fuentes permitidas; cualificaría los resultados y prepararía el siguiente contacto. No debería inventar teléfonos o emails que no estén publicados o disponibles en la fuente.\n\nEn tu plan contratado: ese flujo puede continuar hacia CRM, seguimiento y tareas comerciales según las integraciones disponibles."),
  },
  {
    test: t => /(a quien.*llamar hoy|quien.*llamar hoy|priorizar clientes|seguimientos de hoy)/.test(t),
    answer: A("Con el CRM conectado puede construir una lista priorizada de trabajo para hoy.", "Revisaría oportunidades abiertas, fechas de seguimiento, última interacción, importe/potencial, tareas vencidas y reglas comerciales. Después puede ordenar la lista y preparar mensajes, llamadas o recordatorios.\n\nEn tu plan contratado: la prioridad no la decide al azar; se basa en los criterios que configure tu equipo comercial."),
  },
  {
    test: t => /(falla.*integracion|integracion.*falla|se cae.*integracion|conexion.*cae)/.test(t),
    answer: A("No debería fingir que la acción se ha realizado.", "Si una integración falla, conserva el contexto y la tarea pendiente, registra el error y sigue la política configurada: reintentar, usar una fuente alternativa o escalar al responsable técnico/operativo. El cliente no debería tener que volver a explicar todo desde cero.\n\nEn tu plan contratado: definimos el comportamiento de contingencia para cada sistema crítico."),
  },
  {
    test: t => /(pedido|envio|entrega|cuando llegara|donde esta)/.test(t),
    answer: A("Sí. Con los sistemas conectados puede consultar el pedido y responder con datos reales.", "Si la consulta llega por WhatsApp, primero usaría el número del remitente para identificar al cliente y buscar sus pedidos. Si lo encuentra, consulta ERP/ecommerce/transportista y responde con estado, fecha o tracking disponible. Si no aparece, pide solo el siguiente identificador mínimo, por ejemplo el nombre completo.\n\nSi aun así no se localiza, no deja al cliente bloqueado: escala el caso con todo lo ya comprobado.\n\nPara Logística\nCliente: [identificado]\nConsulta: estado/plazo de entrega\nPedido: [si está disponible]\nDatos comprobados: teléfono de WhatsApp + datos facilitados\nAcción requerida: localizar pedido y confirmar estado/fecha.\n\nEn tu plan contratado: este flujo puede ejecutarse automáticamente según tus integraciones y permisos."),
  },
  {
    test: t => /(email|correo).*(responsable|encargado)|responsable.*(email|correo)/.test(t),
    answer: A("Sí. El escalado puede terminar en un email, ticket, tarea de CRM o notificación interna.", "Primero clasifica la consulta para identificar al responsable correcto. Después resume quién es el cliente, qué solicita, qué fuentes se han consultado, qué se ha encontrado y qué acción necesita del responsable. Así la persona recibe un caso preparado y el cliente no repite la historia.\n\nEn tu plan contratado: si la cuenta de correo o sistema de tickets está conectado y autorizado, ese escalado puede enviarse automáticamente."),
  },
  {
    test: t => /(publicar|instagram|facebook|linkedin|redes sociales)/.test(t),
    answer: A("Sí, con la cuenta conectada y el permiso de publicación configurado.", "Puede preparar copy, creatividad, variantes y calendario usando productos, promociones y tono de marca. Tú decides si publica automáticamente o si deja cada pieza pendiente de aprobación. Si falta un precio, imagen o dato de producto, consulta la fuente conectada; si no puede verificarlo, lo solicita a Marketing/Producto en vez de inventarlo.\n\nEn tu plan contratado: el flujo puede ir desde la creación hasta la programación/publicación respetando tus reglas."),
  },
  {
    test: t => /(whatsapp masiv|mensajes masiv|spam)/.test(t),
    answer: A("No debería plantearse como una herramienta para enviar spam.", "Los envíos deben respetar permisos, consentimiento, políticas del canal y la herramienta conectada. Puede automatizar comunicaciones y seguimientos dentro de esos límites, segmentando y registrando el resultado.\n\nEn tu plan contratado: configuramos los flujos comerciales compatibles con el canal y las reglas de tu empresa."),
  },
  {
    test: t => /(borrar.*datos|eliminar.*datos|derecho.*supresion|rgpd)/.test(t),
    answer: A("No debería borrar datos por su cuenta sin seguir el procedimiento de privacidad configurado.", "Identificaría la solicitud, recogería la información necesaria para verificarla y la enviaría al responsable/proceso correspondiente. Si existe un flujo autorizado para ejecutar la solicitud, lo seguiría; si requiere intervención humana, la escala con contexto.\n\nEn tu plan contratado: las solicitudes de privacidad se tratan mediante reglas específicas y trazables, no improvisando."),
  },
  {
    test: t => /(stock cambia|stock real|disponibilidad cambia)/.test(t),
    answer: A("Antes de prometer disponibilidad volvería a consultar la fuente de stock vigente.", "Si el stock ha cambiado durante la conversación, usaría el valor actualizado. Si hay reservas, múltiples almacenes o datos inconsistentes, aplicaría las reglas configuradas y, si hace falta, escalaría a Operaciones/Logística.\n\nEn tu plan contratado: la respuesta de stock se basa en la fuente oficial que defina tu empresa, no en un dato recordado de antes."),
  },
  {
    test: t => /(otro telefono|telefono distinto|cambia de numero)/.test(t),
    answer: A("No debería asumir que es el mismo cliente solo porque lo diga.", "Intentaría identificarlo con datos alternativos permitidos —por ejemplo email, nombre y un dato de pedido— antes de mostrar información sensible.\n\nEn tu plan contratado: las reglas de identificación y autenticación se adaptan al riesgo de cada dato o acción."),
  },
  {
    test: t => /(catalogo|novedades|producto|ficha tecnica)/.test(t),
    answer: A("Con el catálogo conectado, respondería usando referencias reales de tu empresa.", "Puede buscar por necesidad, referencia, características o compatibilidad y devolver imágenes, PDFs, precio autorizado y stock si esas fuentes están disponibles. Si el catálogo no contiene la respuesta, escala a Producto/Ventas con la consulta ya resumida.\n\nEn tu plan contratado: el catálogo se convierte en una fuente operativa del agente, no en una respuesta genérica."),
  },
  {
    test: t => /(factura|cobro|pago|abono)/.test(t),
    answer: A("Con facturación/ERP conectado, puede localizar el documento o estado real.", "Usaría los datos disponibles del cliente para buscar la factura o cobro y, según permisos, enviaría el documento o explicaría el estado. Si hay una discrepancia, devolución o caso sensible, lo escala a Administración/Finanzas con toda la información ya recopilada.\n\nEn tu plan contratado: la consulta queda resuelta o derivada sin obligar al cliente a empezar de nuevo."),
  },
  {
    test: t => /(reunion|cita|agenda|calendario)/.test(t),
    answer: A("Con el calendario conectado puede gestionar la cita de principio a fin.", "Consulta disponibilidad, ofrece huecos reales, reserva o reprograma según permisos y envía confirmación. Si la reunión requiere una persona concreta, usa su agenda o deriva a esa persona.\n\nEn tu plan contratado: también puede registrar el contexto de la reunión y preparar recordatorios o seguimiento."),
  },
  {
    test: t => /(email|correo|bandeja)/.test(t),
    answer: A("Con la cuenta corporativa autorizada puede trabajar sobre el correo como un empleado.", "Clasifica mensajes, identifica intención, consulta CRM/ERP/documentación si hace falta, redacta o responde según las reglas y registra seguimientos. Casos sensibles o excepciones pueden quedar pendientes de aprobación o escalarse al responsable.\n\nEn tu plan contratado: tú decides qué buzones, carpetas y acciones puede usar cada agente."),
  },
];

export function demoPlaybookAnswer(message = "") {
  const t = norm(message);
  for (const rule of rules) {
    try { if (rule.test(t)) return rule.answer; } catch {}
  }
  return A("Lo resolvería siguiendo un flujo de trabajo, no improvisando una respuesta.", "Primero identificaría qué información o acción necesita el cliente. Después consultaría la fuente autorizada correspondiente y aplicaría las reglas de tu empresa. Si puedo resolverlo con datos verificados, respondo y ejecuto el siguiente paso permitido. Si falta un dato, pido solo el mínimo imprescindible. Y si la decisión necesita a una persona, escalo el caso al responsable adecuado con todo el contexto ya preparado.\n\nEn tu plan contratado: este flujo se adapta a tus sistemas, responsables, permisos y procesos. La idea es que ninguna consulta empresarial termine en un simple “no sé”.");
}
