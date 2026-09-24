'use strict';
const fs=require('node:fs'),path=require('node:path');
const dir=require('./direction-control.cjs');
const read=p=>fs.readFileSync(path.join(__dirname,p),'utf8');
const errors=[],ok=(v,msg)=>{if(!v)errors.push(msg)};

const state={secret:{}};
const d=dir.ensureDirection(state);
d.settings={defaultSlaMinutes:60,aiTakeoverGraceMinutes:30,aiTakeoverEnabled:true};
const emp=dir.addOrUpdateEmployee(d,{name:'Ana Prueba',role:'Administración',email:'ana@example.com',businessId:'biz1'});
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

const preload=read('preload.cjs'),main=read('main.cjs'),html=read('renderer/index.html'),ui=read('renderer/direction-control.js'),health=read('runtime-health.cjs');
for(const name of ['directionAccessStatus','directionSetPin','directionUnlock','directionLock','directionSummary','directionEmployees','directionSaveEmployee','directionCreateTask','directionUpdateTask','directionAddEvent','directionResolveTask','directionSettings','directionAiQueue'])ok(preload.includes(name+':'),'Preload no expone '+name);
for(const ch of ['direction:access-status','direction:set-pin','direction:unlock','direction:lock','direction:summary','direction:employees','direction:save-employee','direction:create-task','direction:update-task','direction:add-event','direction:resolve-task','direction:settings','direction:ai-queue'])ok(main.includes("ipcMain.handle('"+ch+"'"),'Falta handler '+ch);
for(const id of ['direction','vnxDirGate','vnxDirPinForm','vnxDirPin','vnxDirPinSubmit','vnxDirProtected','vnxDirLock','vnxDirKpis','vnxDirEmployees','vnxDirTaskRows','vnxDirSettingsForm'])ok(html.includes('id="'+id+'"'),'Falta UI #'+id);
ok(html.includes('data-tab="direction"')&&html.includes('Agente privado protegido por PIN'),'Falta acceso privado de Dirección en menú');
ok(ui.includes('directionResolveTask')&&ui.includes('Abrir en Carla')&&html.includes('sin actividad operativa registrada'),'La UI no cubre resolución/evidencia/semántica de inactividad');
ok(ui.includes("let directionToken=''")&&!/localStorage\.|sessionStorage\./.test(ui),'El token privado de Dirección no debe persistirse en el navegador');
ok(ui.includes('directionAccessStatus')&&ui.includes('directionUnlock')&&ui.includes('directionLock'),'La UI no aplica bloqueo/desbloqueo privado');
ok(main.includes('DIRECTION_PIN_ITERATIONS=210000')&&main.includes('pbkdf2Sync('),'El PIN de Dirección debe almacenarse mediante hash robusto');
ok(main.includes('directionSessions=new Map()')&&main.includes('DIRECTION_SESSION_MS=30*60*1000'),'Dirección debe usar sesiones temporales');
ok(main.includes("e.code='DIRECTION_LOCKED'")&&main.includes('directionRequireSession(payload);'),'Los handlers privados deben rechazar acceso sin sesión');
ok(main.includes('a.failedAttempts>=5')&&main.includes('5*60*1000'),'Falta bloqueo temporal tras intentos fallidos');
ok(!/pinHash\s*:\s*pin\b/.test(main),'El PIN de Dirección no puede guardarse en claro');
ok(health.includes('Agente privado de Dirección')&&health.includes('directionControl')&&health.includes('protección privada de Dirección'),'Autoreparación no cubre Dirección privada');

if(errors.length){console.error('\nDIRECTION_146_VERIFY_FAIL\n- '+errors.join('\n- '));process.exit(1)}
console.log('DIRECTION_PRIVATE_VERIFY_OK · PIN hash, sesión temporal, bloqueo, responsables, SLA, vencimiento, recuperación IA, evidencia y autoreparación verificados.');
