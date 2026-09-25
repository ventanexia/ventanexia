'use strict';
const fs=require('node:fs'),path=require('node:path');
const dir=require('./direction-control.cjs');
const roleTests=require('./direction-role-assessment.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const errors=[],ok=(v,msg)=>{if(!v)errors.push(msg)};

const state={secret:{}};
const d=dir.ensureDirection(state);
d.settings={defaultSlaMinutes:60,aiTakeoverGraceMinutes:30,aiTakeoverEnabled:true};
const emp=dir.addOrUpdateEmployee(d,{name:'Ana Prueba',role:'Administración',email:'ana@example.com',businessId:'biz1'});
ok(/^VNX-EMP-[A-F0-9]{8}$/.test(emp.employeeCode),'Cada empleado debe recibir un código personal estable');
const std1=dir.createDirectionStandardVersion(d,{
  businessId:'biz1',directorName:'Dirección Prueba',confirmed:true,effectiveFrom:'2026-09-01T00:00:00.000Z',
  nonNegotiables:['No faltar al respeto','No inventar información'],
  criteria:[{key:'respect',label:'Respeto y educación',expectation:'Trato correcto para toda la plantilla',importance:'required'},{key:'accuracy',label:'Precisión y veracidad',expectation:'No inventar datos',importance:'required'}]
});
ok(std1.version===1&&std1.hash,'La primera política común debe quedar versionada y con huella');
let refused=false;try{dir.createDirectionStandardVersion(d,{businessId:'biz1',directorName:'Dirección Prueba',confirmed:false})}catch{refused=true}
ok(refused,'No debe poder crearse una directriz sin confirmación expresa de aplicación igualitaria');
const std2=dir.createDirectionStandardVersion(d,{
  businessId:'biz1',directorName:'Dirección Prueba',confirmed:true,effectiveFrom:'2026-10-01T00:00:00.000Z',
  criteria:[{key:'respect',label:'Respeto y educación',expectation:'Nueva redacción futura',importance:'required'}]
});
ok(std2.version===2,'Cambiar una directriz debe crear una nueva versión');
ok(dir.applicableDirectionStandard(d,{businessId:'biz1',at:'2026-09-24T10:00:00.000Z'}).id===std1.id,'Una directriz futura no puede aplicarse retrospectivamente');
const duePast='2026-09-24T08:00:00.000Z',assigned='2026-09-24T06:00:00.000Z',now='2026-09-24T10:00:00.000Z';
const t1=dir.addTask(d,{businessId:'biz1',title:'Responder clientes pendientes',assigneeId:emp.id,assigneeName:emp.name,module:'email',assignedAt:assigned,dueAt:duePast,aiTakeoverEligible:true,aiTakeoverEnabled:true});
const t2=dir.addTask(d,{businessId:'biz1',title:'Revisar facturas',assigneeId:emp.id,assigneeName:emp.name,module:'administration',assignedAt:'2026-09-24T07:30:00.000Z',dueAt:'2026-09-24T12:00:00.000Z'});
dir.recordEvent(d,t2.id,{actor:'human',type:'activity',detail:'Revisión iniciada',at:'2026-09-24T09:30:00.000Z',status:'in_progress'});
let s=dir.summarize(d,{businessId:'biz1',now});
ok(s.totals.tasks===2,'Debe contar las dos tareas');
ok(s.totals.overdue===1,'Debe detectar una tarea fuera de plazo');
ok(s.totals.aiTakeoverDue===1,'Debe detectar la tarea vencida autorizada para recuperación IA');
ok(s.employees[0].overdue===1,'Debe atribuir el retraso al responsable');
ok(s.employees[0].minutesSinceLastRecordedActivity===30,'La inactividad registrada debe partir del último evento real');
dir.resolveTask(d,t1.id,{actor:'ai',detail:'VentaNexIA preparó las respuestas vencidas',outcome:'4 respuestas preparadas',evidence:'Borradores generados'});
s=dir.summarize(d,{businessId:'biz1',now});
ok(s.totals.doneByAI===1,'Debe contar trabajo recuperado por IA');
ok(s.totals.overdue===0,'Una tarea resuelta por IA ya no debe seguir vencida');
ok(s.employees[0].doneAI===1,'Debe atribuir la recuperación por IA al responsable original');
ok(d.events.some(e=>e.type==='resolved_by_ai'&&e.taskId===t1.id),'Debe conservar evidencia del takeover IA');
const report=dir.operationalReport(d,{businessId:'biz1',now});
ok(report.totals.employees===1,'El informe debe incluir al empleado');
ok(report.totals.assigned===2,'El informe debe analizar todas las tareas del periodo');
ok(report.totals.doneAI===1,'El informe debe contar las recuperaciones por IA');
ok(report.employees[0].doneAI===1,'El informe individual debe reflejar trabajo recuperado por IA');
ok(report.employees[0].findings.some(x=>/VentaNexIA|recuperada/i.test(x)),'El informe debe explicar la recuperación por IA');
ok(report.employees[0].areas.some(x=>x.module==='email'&&x.deviations>=1),'El informe debe localizar desviaciones por área');
ok(report.employees[0].roleFit&&report.employees[0].roleFit.interpretation,'El informe debe generar una lectura cualitativa de encaje');
ok(Array.isArray(report.employees[0].roleFit.contextQuestions),'El informe debe proponer comprobaciones contextuales antes de concluir');
ok(['insuficiente','baja','media','alta'].includes(report.employees[0].roleFit.confidence),'La lectura de encaje debe declarar su confianza');
ok(/hechos operativos registrados/i.test(report.note),'El informe debe explicar sus límites de interpretación');
ok(report.directionStandard?.version===1,'El informe debe registrar la versión de directrices vigente en la fecha del análisis');

const cvText=[
  'PERFIL','Profesional de ventas B2B y atención al cliente',
  'EXPERIENCIA PROFESIONAL','5 años gestionando grandes cuentas y negociación con distribuidores',
  'FORMACIÓN','Grado Superior Administración y Finanzas',
  'COMPETENCIAS','Excel avanzado','CRM','Negociación B2B',
  'IDIOMAS','Inglés B2',
  'FECHA DE NACIMIENTO: 01/01/1990',
  'ESTADO CIVIL: casada'
].join('\n');
const cvEmp=dir.importEmployeeCv(d,emp.id,{fileName:'cv-ana.pdf',text:cvText});
ok(cvEmp.cvProfile.fileName==='cv-ana.pdf','Debe guardar el nombre del CV importado');
ok(!/01\/01\/1990|casada/i.test(cvEmp.cvProfile.professionalText||''),'El perfil profesional no debe conservar edad/fecha de nacimiento/estado civil');
dir.updateEmployeeCv(d,emp.id,{roleTarget:'Gestión comercial',roleRequirements:['Negociación B2B','Excel avanzado','Atención al cliente'],confirmedByManagement:['Excel avanzado']});
const reportCv=dir.operationalReport(d,{businessId:'biz1',now});
ok(reportCv.employees[0].roleComparison?.requirements?.length===3,'El informe debe comparar persona y puesto');
ok(reportCv.employees[0].roleComparison.requirements.some(x=>x.requirement==='Excel avanzado'&&['confirmado','declarado','observado'].includes(x.status)),'Debe distinguir evidencia declarada/confirmada/observada');
const teamCmp=dir.compareTeamToRole(d,{businessId:'biz1',roleTarget:'Gestión comercial',requirements:['Negociación B2B','Excel avanzado']});
ok(teamCmp.noAutomaticRanking===true,'La comparación de plantilla no puede producir ranking automático');

const policy=dir.setManagementPolicy(d,{approach:'results_first',profitability:100,peopleDevelopment:25,requireEmployeeConversation:true,employeeVoiceRequired:true,requireSupportTrial:false,requireRoleAlternativeReview:true,improvementWindowDays:14});
ok(policy.approach==='results_first','Dirección debe poder declarar un enfoque de resultados primero');
ok(policy.requireEmployeeConversation===true&&policy.employeeVoiceRequired===true,'El criterio debe poder exigir conversación y voz de la persona');
ok(policy.improvementWindowDays===14,'El criterio debe guardar un periodo de mejora');
const reportPolicy=dir.operationalReport(d,{businessId:'biz1',now});
ok(reportPolicy.employees[0].humanContext.management.approachLabel==='Resultados empresariales primero','El informe debe reflejar el enfoque declarado por Dirección');
ok(reportPolicy.employees[0].humanContext.management.reviewSteps.some(x=>x.key==='employee_voice'&&x.required),'La ruta debe incluir la voz de la persona cuando Dirección la exige');
ok(reportPolicy.employees[0].humanContext.management.reviewSteps.some(x=>x.key==='human_decision'&&x.required),'La decisión final debe seguir siendo humana');

const preload=read('preload.cjs'),main=read('main.cjs'),html=read('renderer/index.html'),ui=read('renderer/direction-control.js'),health=read('runtime-health.cjs');
for(const name of ['directionAccessStatus','directionSetPin','directionUnlock','directionLock','directionSummary','directionEmployees','directionUpdateEmployeeContext','directionImportCv','directionUpdateCv','directionCompareTeamRole','directionAddEmployeeObservation','directionManagementPolicy','directionStandards','directionCreateStandard','directionSaveEmployee','directionCreateTask','directionUpdateTask','directionAddEvent','directionResolveTask','directionSettings','directionAiQueue','directionReport'])ok(preload.includes(name+':'),'Preload no expone '+name);
for(const ch of ['direction:access-status','direction:set-pin','direction:unlock','direction:lock','direction:summary','direction:employees','direction:update-employee-context','direction:import-cv','direction:update-cv','direction:compare-team-role','direction:add-employee-observation','direction:management-policy','direction:standards','direction:create-standard','direction:save-employee','direction:create-task','direction:update-task','direction:add-event','direction:resolve-task','direction:settings','direction:ai-queue','direction:report'])ok(main.includes("ipcMain.handle('"+ch+"'"),'Falta handler '+ch);
for(const id of ['direction','vnxDirGate','vnxDirPinForm','vnxDirPin','vnxDirPinSubmit','vnxDirProtected','vnxDirLock','vnxDirKpis','vnxDirEmployees','vnxDirTaskRows','vnxDirSettingsForm','vnxDirCvForm','vnxDirCvEmployee','vnxDirCvCompare','vnxDirHumanForm','vnxDirObservationForm','vnxDirManagementForm','vnxDirApproach','vnxDirRequireConversation','vnxDirEmployeeVoice','vnxDirRequireSupport','vnxDirRequireRoleReview','vnxDirImprovementDays','vnxDirStandardForm','vnxDirStandardDirector','vnxDirStandardEffective','vnxDirStandardConfirmed','vnxDirStandardHistory','vnxDirReportForm','vnxDirReportEmployee','vnxDirReportPeriod','vnxDirReportRows','vnxDirReportExcel','vnxDirReportPdf'])ok(html.includes('id="'+id+'"'),'Falta UI #'+id);
ok(html.includes('data-tab="direction"')&&html.includes('Agente privado protegido por PIN'),'Falta acceso privado de Dirección en menú');
ok(ui.includes('directionResolveTask')&&ui.includes('Abrir en Carla')&&html.includes('sin actividad operativa registrada'),'La UI no cubre resolución/evidencia/semántica de inactividad');
ok(ui.includes('directionReport')&&ui.includes('generateEmployeeReport')&&ui.includes('exportEmployeeReport'),'La UI no genera/exporta informes de empleados');
ok(ui.includes('directionImportCv')&&ui.includes('directionUpdateCv')&&ui.includes('directionCompareTeamRole'),'La UI no integra CV y comparación persona-puesto');
ok(html.includes('CV + puesto + evidencia real')&&html.includes('Declarado en CV')&&html.includes('Confirmado por Dirección'),'Falta separar fuentes profesionales en el expediente');
ok(ui.includes('Lectura de encaje')&&ui.includes('Fortalezas observadas')&&ui.includes('Posibles funciones a explorar'),'La UI no explica el encaje cualitativo por empleado');
ok(ui.includes('Qué debería comprobar Dirección antes de concluir'),'Faltan preguntas de contexto antes de inferir capacidad');
ok(html.includes('Entender el desempeño sin reducir a nadie a una nota')&&html.includes('No genera una nota global ni un ranking'),'El informe debe explicar su finalidad y límites');
ok(html.includes('Fórmula intermedia')&&html.includes('Resultados empresariales primero')&&html.includes('Desarrollo y recuperación primero'),'Dirección debe preguntar cómo equilibrar resultados y personas');
ok(ui.includes('approachLabel')&&ui.includes('Ruta de decisión equilibrada'),'El informe debe mostrar el contrato de Dirección y su ruta de revisión');
ok(html.includes('Las mismas reglas para toda la plantilla')&&html.includes('Protección bilateral'),'Falta el marco común igualitario de Dirección');
ok(ui.includes('directionCreateStandard')&&ui.includes('Historial inmutable'),'La UI debe versionar las directrices y conservar historial');
ok(dir.listDirectionStandards(d,{businessId:'biz1'}).length===2,'Las versiones anteriores de directrices deben conservarse');
ok(ui.includes("let directionToken=''")&&!/localStorage\s*\.\s*setItem\s*\(|sessionStorage\s*\.\s*setItem\s*\(/.test(ui),'El token privado de Dirección no debe persistirse en el navegador');
ok(ui.includes('directionAccessStatus')&&ui.includes('directionUnlock')&&ui.includes('directionLock'),'La UI no aplica bloqueo/desbloqueo privado');
ok(main.includes('DIRECTION_PIN_ITERATIONS=210000')&&main.includes('pbkdf2Sync('),'El PIN de Dirección debe almacenarse mediante hash robusto');
ok(main.includes('directionSessions=new Map()')&&main.includes('DIRECTION_SESSION_MS=30*60*1000'),'Dirección debe usar sesiones temporales');
ok(main.includes("e.code='DIRECTION_LOCKED'")&&main.includes('directionRequireSession(payload);'),'Los handlers privados deben rechazar acceso sin sesión');
ok(main.includes('a.failedAttempts>=5')&&main.includes('5*60*1000'),'Falta bloqueo temporal tras intentos fallidos');
ok(!/pinHash\s*:\s*pin\b/.test(main),'El PIN de Dirección no puede guardarse en claro');
ok(health.includes('Agente privado de Dirección')&&health.includes('directionControl')&&health.includes('protección privada de Dirección'),'Autoreparación no cubre Dirección privada');


const role=roleTests.saveRoleProfile(d,{businessId:'biz1',name:'Comercial B2B',description:'Gestiona cartera y negocia acuerdos',requirements:['Negociación B2B','Priorización','Comunicación clara'],priorities:['Proteger margen','Retener clientes']});
ok(role.name==='Comercial B2B'&&role.requirements.length===3,'El perfil de puesto debe guardar requisitos observables');
const roleQs=roleTests.replaceRoleQuestions(d,role.id,[
  {type:'practical_case',prompt:'Un cliente pide un descuento que destruye margen. ¿Qué haces?',evaluates:['reasoning','problem_solving','decision_quality'],evidenceFocus:['margen','alternativas']},
  {type:'structured_interview',prompt:'Cuéntame una venta perdida y qué aprendiste.',evaluates:['learning','reasoning'],evidenceFocus:['aprendizaje']},
  {type:'role_knowledge',prompt:'¿Qué datos revisas antes de una reunión con una gran cuenta?',evaluates:['role_knowledge','prioritization'],evidenceFocus:['preparación']}
]);
ok(roleQs.length===3&&roleQs.every(x=>x.roleId===role.id),'El test estructurado debe quedar ligado al puesto');
const assessment=roleTests.createAssessment(d,{businessId:'biz1',employeeId:emp.id,roleId:role.id,answers:roleQs.map(q=>({questionId:q.id,answer:'Respuesta de prueba con pasos, comprobaciones y justificación.'}))});
ok(assessment.answers.length===3&&assessment.employeeId===emp.id,'Debe registrar respuestas con empleado, puesto y fecha');
const assessed=roleTests.saveAnalysis(d,assessment.id,{headline:'Hipótesis profesional',roleFitHypothesis:'Evidencia compatible con funciones comerciales; falta validar en trabajo real.',confidence:'medium',dimensions:[{key:'problem_solving',label:'Resolución de problemas',status:'consistent',confidence:'medium',evidence:['Caso práctico'],interpretation:'Propone comprobar datos y alternativas.'}],strengths:['Resolución aplicada'],developmentAreas:['Validar bajo carga real'],rolesToExplore:['Gestión comercial'],checksBeforeDecision:['Contrastar con evidencia operativa'],limitations:['No es una prueba de CI']});
ok(assessed.analysis&&assessed.analysis.generatedAt,'El análisis del test debe conservar fecha');
ok(/No es una prueba de CI/i.test(assessed.analysis.sourceRule),'El sistema debe limitar expresamente inferencias de inteligencia general');
const ws=roleTests.listWorkspace(d,{businessId:'biz1'});
ok(ws.roles.some(x=>x.id===role.id)&&ws.assessments.some(x=>x.id===assessment.id),'El espacio de Dirección debe recuperar perfiles y tests guardados');

for(const ch of ['direction:role-workspace','direction:save-role-profile','direction:generate-role-test','direction:analyze-role-test'])ok(main.includes("ipcMain.handle('"+ch+"'"),'Falta handler '+ch);
for(const name of ['directionRoleWorkspace','directionSaveRoleProfile','directionGenerateRoleTest','directionAnalyzeRoleTest'])ok(preload.includes(name+':'),'Preload no expone '+name);
for(const id of ['vnxDirRoleForm','vnxDirRoleName','vnxDirRoleEmployee','vnxDirRoleDescription','vnxDirRoleRequirements','vnxDirRolePriorities','vnxDirRoleGenerate','vnxDirRoleAnalyze','vnxDirRoleQuestions','vnxDirRoleAnalysis'])ok(html.includes('id="'+id+'"'),'Falta UI de test #'+id);
ok(ui.includes('directionGenerateRoleTest')&&ui.includes('directionAnalyzeRoleTest'),'La UI no conecta generación y análisis del test');
ok(main.includes('No estimes CI ni inteligencia general')&&main.includes('No declares "apto/no apto"'),'El análisis IA debe impedir CI inventado y veredictos automáticos');
ok(main.includes('perspective_taking')&&main.includes('razonamiento aplicado al trabajo'),'El análisis integral debe cubrir perspectiva ajena y razonamiento aplicado');
ok(!/noAutomaticRanking\s*:\s*false/.test(main+ui),'El test no puede habilitar ranking automático');

let miniRefused=false;try{roleTests.saveMiniIpip(d,{businessId:'biz1',employeeId:emp.id,roleId:role.id,responses:Array.from({length:20},(_,i)=>({itemId:i+1,value:3})),consent:false})}catch{miniRefused=true}
ok(miniRefused,'Mini-IPIP debe exigir consentimiento explícito');
const miniResponses=Array.from({length:20},(_,i)=>({itemId:i+1,value:3}));
for(const x of miniResponses){if([1,11].includes(x.itemId))x.value=5;if([6,16].includes(x.itemId))x.value=1}
const mini=roleTests.saveMiniIpip(d,{businessId:'biz1',employeeId:emp.id,roleId:role.id,responses:miniResponses,consent:true});
ok(mini.score?.factors?.E?.mean===5,'Mini-IPIP debe corregir correctamente los ítems inversos');
ok(mini.weightPolicy==='supplemental_low'&&/No usar como filtro automático/i.test(mini.decisionRule),'Mini-IPIP debe quedar marcado como señal complementaria de bajo peso');
ok(roleTests.latestMiniIpip(d,emp.id)?.id===mini.id,'Debe recuperar el último Mini-IPIP del empleado');
ok(roleTests.miniIpipDefinition().items.length===20,'La batería Mini-IPIP española debe contener exactamente 20 ítems');
for(const ch of ['direction:mini-ipip-definition','direction:save-mini-ipip'])ok(main.includes("ipcMain.handle('"+ch+"'"),'Falta handler '+ch);
for(const name of ['directionMiniIpipDefinition','directionSaveMiniIpip'])ok(preload.includes(name+':'),'Preload no expone '+name);
for(const id of ['vnxDirMiniIpip','vnxDirMiniIpipItems','vnxDirMiniIpipConsent','vnxDirMiniIpipSave','vnxDirMiniIpipResult'])ok(html.includes('id="'+id+'"'),'Falta UI Mini-IPIP #'+id);
ok(ui.includes('directionSaveMiniIpip')&&ui.includes('Completa los 20 ítems'),'La UI no guarda Mini-IPIP completo');
ok(main.includes('autoinforme complementario de BAJO PESO')&&main.includes('no puede superar, contradecir ni sustituir'),'El análisis debe limitar el peso del Mini-IPIP');

if(errors.length){console.error('\nDIRECTION_146_VERIFY_FAIL\n- '+errors.join('\n- '));process.exit(1)}
console.log('DIRECTION_PRIVATE_VERIFY_OK · PIN, directrices, CV, test estructurado, Mini-IPIP voluntario de bajo peso, análisis multidimensional, encaje, evidencia y autoreparación verificados.');
