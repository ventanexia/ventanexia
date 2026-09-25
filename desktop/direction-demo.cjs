'use strict';
const direction=require('./direction-control.cjs');
const roleTests=require('./direction-role-assessment.cjs');

function isoAgo({days=0,hours=0,minutes=0}={}){
  return new Date(Date.now()-days*86400000-hours*3600000-minutes*60000).toISOString();
}
function isoFromNow({days=0,hours=0,minutes=0}={}){
  return new Date(Date.now()+days*86400000+hours*3600000+minutes*60000).toISOString();
}
function seedEmployee(d,raw,cv,work){
  const e=direction.addOrUpdateEmployee(d,raw);
  direction.updateEmployeeCv(d,e.id,{...cv,source:'DEMO · datos ficticios'});
  direction.updateEmployeeContext(d,e.id,work||{});
  return e;
}
function seedTask(d,employee,{title,description,module='other',workType='other',priority='normal',assignedDays=0,assignedHours=4,dueDays=0,dueHours=1,status='pending',doneBy=null,outcome='',eventDetail='' }){
  const assignedAt=isoAgo({days:assignedDays,hours:assignedHours});
  const dueAt=isoAgo({days:dueDays,hours:dueHours});
  const t=direction.addTask(d,{
    businessId:employee.businessId,assigneeId:employee.id,assigneeName:employee.name,title,description,module,workType,priority,
    assignedAt,receivedAt:assignedAt,dueAt,aiTakeoverEligible:true,aiTakeoverEnabled:true
  });
  if(status==='in_progress'){
    direction.recordEvent(d,t.id,{actor:'human',type:'activity',detail:eventDetail||'Actividad registrada en la demostración.',at:isoAgo({hours:1}),status:'in_progress'});
  }else if(status==='blocked'){
    direction.recordEvent(d,t.id,{actor:'human',type:'blocked',detail:eventDetail||'Dependencia externa pendiente.',at:isoAgo({hours:2}),status:'blocked'});
  }else if(status==='done'){
    direction.recordEvent(d,t.id,{actor:doneBy==='ai'?'ai':'human',type:'activity',detail:eventDetail||'Trabajo realizado.',at:isoAgo({days:Math.max(0,assignedDays-1),hours:2}),status:'in_progress'});
    const done=direction.resolveTask(d,t.id,{actor:doneBy==='ai'?'ai':'human',detail:outcome||'Trabajo completado.',outcome:outcome||'Trabajo completado.',evidence:'DEMO · evidencia ficticia'});
    done.completedAt=isoAgo({days:Math.max(0,dueDays),minutes:30});
    done.lastActivityAt=done.completedAt;done.updatedAt=done.completedAt;
  }
  return t;
}
function demoAnalysis(roleName='Comercial B2B'){
  return {
    headline:'Ejemplo de hipótesis profesional · DEMO',
    roleFitHypothesis:'Las respuestas de demostración aportan señales útiles para '+roleName+', especialmente en resolución, priorización y comunicación. Antes de una decisión real habría que contrastarlas con muestra de trabajo y evidencia operativa.',
    confidence:'medium',
    dimensions:[
      {key:'reasoning',label:'Razonamiento aplicado',status:'consistent',confidence:'medium',evidence:['DEMO · explica qué comprobaría antes de decidir y justifica el orden de actuación.'],interpretation:'La respuesta ficticia sigue una secuencia comprensible y evita asumir datos no confirmados.'},
      {key:'problem_solving',label:'Resolución de problemas',status:'consistent',confidence:'medium',evidence:['DEMO · propone alternativas antes de conceder descuento o prometer una solución.'],interpretation:'La muestra ficticia combina análisis del problema con opciones de salida.'},
      {key:'prioritization',label:'Priorización',status:'to_verify',confidence:'low',evidence:['DEMO · ordena tareas por impacto, urgencia y dependencia.'],interpretation:'La lógica es razonable, pero debe comprobarse bajo carga real.'},
      {key:'communication',label:'Comunicación',status:'consistent',confidence:'medium',evidence:['DEMO · explica al cliente qué sabe, qué no sabe y cuándo volverá a informar.'],interpretation:'La respuesta ficticia comunica límites y siguiente paso.'},
      {key:'perspective_taking',label:'Comprensión de la perspectiva ajena',status:'to_verify',confidence:'low',evidence:['DEMO · reconoce el impacto del retraso en el cliente.'],interpretation:'Hay una señal positiva de escucha, pero un test no basta para concluir un rasgo personal.'},
      {key:'role_knowledge',label:'Conocimiento del puesto',status:'mixed',confidence:'medium',evidence:['DEMO · revisa margen, histórico, incidencias y próximos hitos.'],interpretation:'Muestra conocimiento funcional; faltaría validarlo con una tarea real.'}
    ],
    strengths:['Estructura problemas antes de actuar','Comunicación orientada a siguiente paso','Busca alternativas antes de ceder margen'],
    developmentAreas:['Validar priorización bajo presión real','Comprobar consistencia en seguimiento de compromisos'],
    rolesToExplore:['Gestión comercial B2B','Gestión de cuentas','Coordinación comercial con clientes'],
    checksBeforeDecision:['Realizar una muestra de trabajo comparable','Contrastar con evidencia real durante un periodo definido','Revisar los mismos criterios para todas las personas evaluadas'],
    limitations:['Resultado ficticio de demostración','No es una prueba de CI','No es diagnóstico psicológico','No debe utilizarse para una decisión laboral real']
  };
}
function createDirectionDemo({businessId='demo-business'}={}){
  const temp={secret:{}},d=direction.ensureDirection(temp);delete d.access;roleTests.ensure(d);
  d.demo={enabled:true,synthetic:true,label:'DEMO · datos 100 % ficticios',createdAt:new Date().toISOString()};
  d.settings={defaultSlaMinutes:480,aiTakeoverGraceMinutes:60,aiTakeoverEnabled:true};

  const laura=seedEmployee(d,{id:'demo-laura',employeeCode:'DEMO-COM-001',name:'Laura Gómez',role:'Comercial B2B',email:'laura.demo@empresa-ejemplo.local',businessId},
    {experience:['4 años en gestión de cartera B2B','Negociación y seguimiento de grandes cuentas'],education:['Grado Superior en Gestión Comercial'],skills:['CRM','Excel','Preparación de ofertas','Negociación'],languages:['Español','Inglés B2'],certifications:['Curso de negociación B2B'],confirmedByManagement:['Uso de CRM confirmado en tareas de demostración','Preparación de ofertas confirmada en caso práctico']},
    {declaredStrengths:['Comunicación con clientes','Seguimiento comercial'],roleInterests:['Gestión de grandes cuentas','Desarrollo de negocio'],preferredAutonomy:'autonomous',collaborationPreference:'team',workContext:'DEMO · contexto profesional ficticio.'});

  const carlos=seedEmployee(d,{id:'demo-carlos',employeeCode:'DEMO-ADM-002',name:'Carlos Martín',role:'Administración',email:'carlos.demo@empresa-ejemplo.local',businessId},
    {experience:['5 años en administración comercial','Facturación, pedidos y control documental'],education:['Técnico Superior en Administración y Finanzas'],skills:['Excel','ERP','Facturación','Control documental'],languages:['Español'],certifications:['Excel avanzado'],confirmedByManagement:['Exactitud documental confirmada en ejercicios de demostración']},
    {declaredStrengths:['Orden documental','Seguimiento de incidencias'],roleInterests:['Administración comercial','Reporting'],preferredAutonomy:'balanced',collaborationPreference:'balanced',workContext:'DEMO · contexto profesional ficticio.'});

  const marta=seedEmployee(d,{id:'demo-marta',employeeCode:'DEMO-ATC-003',name:'Marta Ruiz',role:'Atención al cliente',email:'marta.demo@empresa-ejemplo.local',businessId},
    {experience:['3 años en atención al cliente B2B y B2C','Gestión de incidencias y devoluciones'],education:['Formación profesional en Comercio'],skills:['Atención al cliente','Gestión de incidencias','CRM'],languages:['Español','Catalán'],certifications:['Comunicación con clientes'],confirmedByManagement:['Buena documentación de incidencias en muestra de trabajo ficticia']},
    {declaredStrengths:['Escucha','Explicación de soluciones'],roleInterests:['Customer Success','Coordinación de servicio'],preferredAutonomy:'autonomous',collaborationPreference:'team',workContext:'DEMO · contexto profesional ficticio.'});

  seedTask(d,laura,{title:'Preparar renovación de cuenta ACME Demo',description:'Revisar margen, consumo y propuesta de renovación.',module:'crm',workType:'customer_request',priority:'high',assignedDays:2,dueDays:1,status:'done',outcome:'DEMO · propuesta preparada y revisada.',eventDetail:'DEMO · revisó histórico y preparó dos alternativas.'});
  seedTask(d,laura,{title:'Responder incidencia de entrega',description:'Coordinar respuesta con Logística y cliente.',module:'email',workType:'customer_request',priority:'critical',assignedHours:6,dueHours:2,status:'in_progress',eventDetail:'DEMO · informó al cliente y pidió confirmación de nueva fecha.'});
  seedTask(d,carlos,{title:'Conciliar facturas pendientes',description:'Revisar diferencias entre ERP y facturas recibidas.',module:'administration',workType:'administration',priority:'normal',assignedDays:1,dueHours:3,status:'done',outcome:'DEMO · diferencias identificadas y documentadas.'});
  seedTask(d,carlos,{title:'Actualizar maestro de clientes',description:'Completar campos obligatorios y detectar duplicados.',module:'administration',workType:'administration',priority:'normal',assignedDays:1,dueHours:4,status:'pending'});
  seedTask(d,marta,{title:'Resolver reclamación de cliente',description:'Registrar causa, respuesta y seguimiento.',module:'email',workType:'customer_request',priority:'high',assignedDays:1,dueHours:6,status:'done',outcome:'DEMO · incidencia cerrada con confirmación del cliente.'});
  seedTask(d,marta,{title:'Seguimiento devolución pendiente',description:'Coordinar almacén y comunicar plazo al cliente.',module:'orders',workType:'customer_request',priority:'high',assignedHours:8,dueHours:3,status:'blocked',eventDetail:'DEMO · pendiente de confirmación del almacén.'});

  const role=roleTests.saveRoleProfile(d,{id:'demo-role-commercial',businessId,name:'Responsable Comercial B2B',description:'Gestiona cartera, negocia acuerdos, protege margen y coordina incidencias con otras áreas.',requirements:['Negociación B2B','Priorización','Comunicación clara','Resolución de problemas','Seguimiento de compromisos'],priorities:['Proteger margen','Retener clientes','Cumplir compromisos','Coordinar áreas internas']});
  const qs=roleTests.replaceRoleQuestions(d,role.id,roleTests.fallbackQuestions(role));
  const answers=qs.map((q,i)=>({questionId:q.id,answer:[
    'Primero confirmaría los datos y el impacto. Después plantearía alternativas que mantengan el objetivo sin prometer algo que no controlo.',
    'Priorizaría por impacto en cliente, vencimiento y dependencia de terceros. Resolvería primero lo que bloquea otras tareas.',
    'Perdí una operación por responder tarde. Desde entonces registro el siguiente paso y una fecha de seguimiento concreta.',
    'Explicaría por qué lo necesito, qué plazo tengo y qué parte puedo resolver yo para reducir la carga del otro equipo.',
    'Revisaría histórico, margen, incidencias, objetivos, interlocutores y compromisos anteriores antes de decidir.',
    'Separaría hechos de supuestos, preguntaría lo que falta y elegiría una opción reversible si la incertidumbre sigue siendo alta.',
    'Compararía impacto, riesgos y datos disponibles de las dos propuestas antes de decidir, y documentaría el criterio.'
  ][i]||'DEMO · respuesta estructurada con hechos, alternativas y siguiente paso.'}));
  const assessment=roleTests.createAssessment(d,{businessId,employeeId:laura.id,roleId:role.id,answers});
  roleTests.saveAnalysis(d,assessment.id,demoAnalysis(role.name));

  const responses=Array.from({length:20},(_,i)=>({itemId:i+1,value:[4,4,5,2,4,2,2,2,4,2,4,4,5,2,2,2,2,2,4,2][i]}));
  roleTests.saveMiniIpip(d,{businessId,employeeId:laura.id,roleId:role.id,responses,consent:true});
  const mini=roleTests.latestMiniIpip(d,laura.id);if(mini){mini.demo=true;mini.consent='DEMO · respuesta ficticia, no consentimiento de una persona real';}

  return d;
}
function analyzeDemoAssessment(assessment){
  const answered=(assessment.answers||[]).filter(x=>String(x.answer||'').trim());
  const dimensions=new Map();
  for(const [idx,row] of answered.entries()){
    for(const key of row.evaluates||[]){
      if(!dimensions.has(key))dimensions.set(key,{key,label:{
        reasoning:'Razonamiento aplicado',problem_solving:'Resolución de problemas',prioritization:'Priorización',learning:'Aprendizaje',
        communication:'Comunicación',perspective_taking:'Comprensión de la perspectiva ajena',collaboration:'Colaboración',autonomy:'Autonomía',
        role_knowledge:'Conocimiento del puesto',decision_quality:'Calidad de decisión'
      }[key]||key,status:'to_verify',confidence:'low',evidence:[],interpretation:'La respuesta aporta material para contrastar esta capacidad, pero el modo demo no emite una conclusión laboral real.'});
      const d=dimensions.get(key),snippet=String(row.answer||'').trim().replace(/\s+/g,' ').slice(0,160);
      if(snippet)d.evidence.push('Pregunta '+(idx+1)+' · '+snippet);
    }
  }
  return {
    headline:'Análisis de demostración · no válido para decisiones reales',
    roleFitHypothesis:'VentaNexIA ha organizado las respuestas por capacidades del puesto. En una evaluación real, estas señales se contrastarían con CV, entrevista estructurada, muestra de trabajo y evidencia operativa.',
    confidence:'low',
    dimensions:[...dimensions.values()],
    strengths:answered.length>=3?['Ha completado suficiente material para iniciar el contraste profesional.']:[],
    developmentAreas:['Validar las respuestas mediante una muestra de trabajo real y comparable.'],
    rolesToExplore:[assessment.roleName||'Puesto evaluado'],
    checksBeforeDecision:['Repetir la evaluación con datos reales y consentimiento','Aplicar los mismos criterios a todas las personas','Contrastar con desempeño posterior'],
    limitations:['Modo demo con datos sintéticos','No es una prueba de CI','No es diagnóstico psicológico','No produce una decisión automática']
  };
}
module.exports={createDirectionDemo,analyzeDemoAssessment};
