'use strict';
const crypto=require('node:crypto');

const TASK_STATES=new Set(['pending','in_progress','blocked','done','cancelled']);
const PRIORITIES=new Set(['low','normal','high','critical']);
const ACTORS=new Set(['human','ai','system']);

function iso(v){const d=v?new Date(v):new Date();return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString()}
function id(prefix='x'){return prefix+'_'+crypto.randomBytes(7).toString('hex')}
function clampText(v,n=500){return String(v??'').trim().slice(0,n)}
function clampNum(v,min=0,max=1e9,def=0){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):def}

function ensureDirection(state){
  state.secret=state.secret||{};
  const d=state.secret.directionControl&&typeof state.secret.directionControl==='object'?state.secret.directionControl:{};
  d.employees=Array.isArray(d.employees)?d.employees:[];
  d.tasks=Array.isArray(d.tasks)?d.tasks:[];
  d.events=Array.isArray(d.events)?d.events:[];
  d.settings=d.settings&&typeof d.settings==='object'?d.settings:{};
  d.access=d.access&&typeof d.access==='object'?d.access:{};
  if(d.settings.defaultSlaMinutes==null)d.settings.defaultSlaMinutes=480;
  if(d.settings.aiTakeoverGraceMinutes==null)d.settings.aiTakeoverGraceMinutes=60;
  if(d.settings.aiTakeoverEnabled==null)d.settings.aiTakeoverEnabled=false;
  state.secret.directionControl=d;
  return d;
}

function sanitizeEmployee(raw={}){
  return {
    id:clampText(raw.id,80)||id('emp'),
    name:clampText(raw.name,120),
    role:clampText(raw.role,120),
    email:clampText(raw.email,180).toLowerCase(),
    active:raw.active!==false,
    businessId:clampText(raw.businessId,120),
    createdAt:iso(raw.createdAt),
    updatedAt:new Date().toISOString()
  };
}

function sanitizeTask(raw={},settings={}){
  const createdAt=iso(raw.createdAt||raw.assignedAt),assignedAt=iso(raw.assignedAt||raw.createdAt);
  let dueAt=raw.dueAt?iso(raw.dueAt):null;
  if(!dueAt){
    const sla=clampNum(raw.slaMinutes,1,60*24*365,clampNum(settings.defaultSlaMinutes,1,60*24*365,480));
    dueAt=new Date(new Date(assignedAt).getTime()+sla*60000).toISOString();
  }
  const status=TASK_STATES.has(raw.status)?raw.status:'pending';
  return {
    id:clampText(raw.id,80)||id('task'),
    businessId:clampText(raw.businessId,120),
    title:clampText(raw.title,220),
    description:clampText(raw.description,3000),
    assigneeId:clampText(raw.assigneeId,80),
    assigneeName:clampText(raw.assigneeName,120),
    module:clampText(raw.module,80),
    sourceRef:clampText(raw.sourceRef,220),
    priority:PRIORITIES.has(raw.priority)?raw.priority:'normal',
    status,
    createdAt,
    assignedAt,
    dueAt,
    lastActivityAt:raw.lastActivityAt?iso(raw.lastActivityAt):assignedAt,
    completedAt:raw.completedAt?iso(raw.completedAt):null,
    completedBy:['human','ai'].includes(raw.completedBy)?raw.completedBy:null,
    aiTakeoverEligible:raw.aiTakeoverEligible!==false,
    aiTakeoverEnabled:Boolean(raw.aiTakeoverEnabled),
    aiTakeoverAt:raw.aiTakeoverAt?iso(raw.aiTakeoverAt):null,
    expectedMinutes:clampNum(raw.expectedMinutes,0,60*24*30,0),
    outcome:clampText(raw.outcome,3000),
    evidence:clampText(raw.evidence,3000),
    externalRef:clampText(raw.externalRef,220),
    updatedAt:new Date().toISOString()
  };
}

function taskEvent(task,raw={}){
  return {
    id:id('evt'),
    taskId:task.id,
    employeeId:clampText(raw.employeeId||task.assigneeId,80),
    actor:ACTORS.has(raw.actor)?raw.actor:'human',
    type:clampText(raw.type||'activity',80),
    detail:clampText(raw.detail,1400),
    at:iso(raw.at),
    businessId:clampText(raw.businessId||task.businessId,120),
    module:clampText(raw.module||task.module,80)
  };
}

function minutesBetween(a,b){const x=new Date(a).getTime(),y=new Date(b).getTime();return Number.isFinite(x)&&Number.isFinite(y)?Math.max(0,Math.round((y-x)/60000)):0}
function isOpen(t){return !['done','cancelled'].includes(t.status)}
function isOverdue(t,now){return isOpen(t)&&t.dueAt&&new Date(t.dueAt).getTime()<new Date(now).getTime()}
function takeoverDue(t,settings,now){
  if(!isOverdue(t,now)||!t.aiTakeoverEligible||!t.aiTakeoverEnabled||settings.aiTakeoverEnabled===false)return false;
  const grace=clampNum(settings.aiTakeoverGraceMinutes,0,60*24*30,60);
  return new Date(now).getTime()>=new Date(t.dueAt).getTime()+grace*60000;
}

function summarize(d,{businessId='',now=new Date().toISOString()}={}){
  const tasks=d.tasks.filter(t=>!businessId||t.businessId===businessId);
  const employees=d.employees.filter(e=>e.active!==false&&(!businessId||e.businessId===businessId));
  const byEmployee=employees.map(emp=>{
    const mine=tasks.filter(t=>t.assigneeId===emp.id);
    const open=mine.filter(isOpen),done=mine.filter(t=>t.status==='done'),overdue=open.filter(t=>isOverdue(t,now));
    const ai=done.filter(t=>t.completedBy==='ai'),human=done.filter(t=>t.completedBy==='human');
    const lastAt=mine.map(t=>t.lastActivityAt||t.assignedAt).filter(Boolean).sort().at(-1)||null;
    const noActivity=open.length&&lastAt?minutesBetween(lastAt,now):0;
    const oldestUnattended=open.length?Math.max(...open.map(t=>minutesBetween(t.lastActivityAt||t.assignedAt,now))):0;
    const overdueMinutes=overdue.reduce((n,t)=>n+minutesBetween(t.dueAt,now),0);
    return {
      employeeId:emp.id,name:emp.name,role:emp.role,email:emp.email,
      assigned:mine.length,done:done.length,doneHuman:human.length,doneAI:ai.length,
      pending:open.filter(t=>t.status==='pending').length,inProgress:open.filter(t=>t.status==='in_progress').length,
      blocked:open.filter(t=>t.status==='blocked').length,overdue:overdue.length,
      completionRate:mine.length?Math.round(done.length/mine.length*100):0,
      aiRecoveryRate:mine.length?Math.round(ai.length/mine.length*100):0,
      lastRecordedActivityAt:lastAt,
      minutesSinceLastRecordedActivity:noActivity,
      oldestOpenWithoutActivityMinutes:oldestUnattended,
      overdueMinutesTotal:overdueMinutes
    };
  });
  const open=tasks.filter(isOpen),overdue=open.filter(t=>isOverdue(t,now)),done=tasks.filter(t=>t.status==='done');
  return {
    generatedAt:now,
    totals:{
      employees:employees.length,tasks:tasks.length,open:open.length,done:done.length,
      overdue:overdue.length,blocked:open.filter(t=>t.status==='blocked').length,
      doneByAI:done.filter(t=>t.completedBy==='ai').length,
      doneByHuman:done.filter(t=>t.completedBy==='human').length,
      aiTakeoverDue:open.filter(t=>takeoverDue(t,d.settings,now)).length
    },
    employees:byEmployee.sort((a,b)=>b.overdue-a.overdue||b.assigned-a.assigned),
    overdueTasks:overdue.sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt)),
    aiTakeoverQueue:open.filter(t=>takeoverDue(t,d.settings,now)).sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt)),
    tasks:tasks.slice().sort((a,b)=>new Date(b.updatedAt||b.assignedAt)-new Date(a.updatedAt||a.assignedAt))
  };
}


const MODULE_LABELS={
  email:'Correo',crm:'Ventas y clientes',orders:'Pedidos',web_ecommerce:'Stock y compras',
  administration:'Documentos / administración',agenda:'Agenda',reports:'Informes',other:'Otra'
};
function validDate(v){const d=v?new Date(v):null;return d&&!Number.isNaN(d.getTime())?d:null}
function taskActiveInPeriod(t,from,to,now){
  const start=validDate(t.assignedAt||t.createdAt)||new Date(0);
  const end=validDate(t.completedAt)||validDate(t.updatedAt)||(isOpen(t)?validDate(now):start);
  return (!to||start<=to)&&(!from||end>=from);
}
function completedLate(t){
  const done=validDate(t.completedAt),due=validDate(t.dueAt);
  return Boolean(t.status==='done'&&done&&due&&done>due);
}
function delayMinutes(t,now){
  const due=validDate(t.dueAt);if(!due)return 0;
  if(t.status==='done'){const done=validDate(t.completedAt);return done&&done>due?minutesBetween(due,done):0}
  return isOverdue(t,now)?minutesBetween(due,now):0;
}

const ROLE_FAMILIES={
  email:['Atención al cliente','Administración comercial'],
  crm:['Comercial / gestión de clientes','Key Account / ventas'],
  prospecting:['Desarrollo de negocio','Prospección comercial'],
  content:['Contenido / comunicación','Marketing'],
  social:['Redes sociales / community management','Marketing digital'],
  campaigns:['Marketing / campañas','Growth'],
  orders:['Operaciones / gestión de pedidos','Administración comercial'],
  web_ecommerce:['Compras / stock / ecommerce','Operaciones'],
  administration:['Administración / back office','Gestión documental'],
  agenda:['Coordinación / asistencia de dirección','Administración'],
  reports:['Control / reporting','Administración analítica'],
  other:['Funciones transversales']
};
function qualitativeFit(mine,areas,now){
  if(!mine.length)return {
    strengths:[],frictions:[],possibleMatches:[],interpretation:'No hay suficiente actividad registrada para valorar el encaje del puesto.',
    confidence:'insuficiente',contextQuestions:['¿Las tareas reales de esta persona están registradas en VentaNexIA?']
  };
  const byModule=new Map();
  for(const t of mine){
    const key=t.module||'other',x=byModule.get(key)||{module:key,total:0,done:0,onTime:0,human:0,ai:0,blocked:0,withEvidence:0,delay:0};
    x.total++;
    if(t.status==='done'){x.done++;if(!completedLate(t))x.onTime++;if(t.completedBy==='human')x.human++;if(t.completedBy==='ai')x.ai++;if(String(t.evidence||t.outcome||'').trim())x.withEvidence++}
    if(t.status==='blocked')x.blocked++;
    x.delay+=delayMinutes(t,now);
    byModule.set(key,x);
  }
  const stats=[...byModule.values()].map(x=>({
    ...x,
    completionRate:x.total?x.done/x.total:0,
    onTimeRate:x.done?x.onTime/x.done:0,
    humanRate:x.done?x.human/x.done:0,
    evidenceRate:x.done?x.withEvidence/x.done:0,
    avgDelay:x.total?x.delay/x.total:0,
    label:MODULE_LABELS[x.module]||x.module
  }));
  const enough=stats.filter(x=>x.total>=3);
  const strong=enough.filter(x=>x.completionRate>=.7&&x.onTimeRate>=.75&&x.ai<=Math.max(1,Math.floor(x.total*.2))).sort((a,b)=>b.onTimeRate-a.onTimeRate||b.total-a.total);
  const weak=enough.filter(x=>(x.onTimeRate<.55&&x.done>=2)||(x.ai/x.total>=.35)||(x.blocked/x.total>=.35)).sort((a,b)=>(b.ai+b.blocked+b.avgDelay/60)-(a.ai+a.blocked+a.avgDelay/60));
  const strengths=strong.slice(0,3).map(x=>'Buen desempeño observado en '+x.label+': tareas resueltas mayoritariamente a tiempo y con intervención humana.');
  const frictions=weak.slice(0,3).map(x=>{
    const reasons=[];
    if(x.onTimeRate<.55)reasons.push('cumplimiento de plazo bajo');
    if(x.ai/x.total>=.35)reasons.push('dependencia frecuente de recuperación por IA');
    if(x.blocked/x.total>=.35)reasons.push('bloqueos recurrentes');
    return 'Fricción recurrente en '+x.label+': '+reasons.join(', ')+'.';
  });
  const matches=[];
  for(const x of strong.slice(0,3))for(const role of (ROLE_FAMILIES[x.module]||[]))if(!matches.includes(role))matches.push(role);
  const contextQuestions=[];
  if(weak.length){
    contextQuestions.push('¿Las dificultades se deben a falta de formación, instrucciones poco claras o herramientas insuficientes?');
    contextQuestions.push('¿La carga de trabajo y los plazos asignados son realistas para esta función?');
    contextQuestions.push('¿Hay dependencias de terceros o bloqueos ajenos a la persona?');
  }
  if(strong.length&&weak.length)contextQuestions.push('¿El puesto actual mezcla tareas de perfiles distintos y convendría concentrar a la persona en las áreas donde muestra mejor encaje?');
  if(!strong.length&&mine.length<8)contextQuestions.push('¿Hay suficiente volumen de tareas comparables para extraer una conclusión fiable?');

  let interpretation='';
  if(strong.length&&weak.length)interpretation='Se observa un patrón desigual por tipo de trabajo: la persona responde mejor en '+strong.slice(0,2).map(x=>x.label).join(' y ')+', mientras acumula más fricción en '+weak.slice(0,2).map(x=>x.label).join(' y ')+'. Esto puede indicar un desajuste parcial entre el puesto actual y sus fortalezas, pero también puede deberse a formación, carga, proceso o dependencias.';
  else if(strong.length)interpretation='Las evidencias disponibles muestran mejor encaje operativo en '+strong.slice(0,3).map(x=>x.label).join(', ')+'. No se observan suficientes señales para afirmar un desajuste relevante en otras áreas.';
  else if(weak.length)interpretation='Se observan dificultades repetidas en '+weak.slice(0,3).map(x=>x.label).join(', ')+'. Antes de atribuirlas a capacidad personal, Dirección debería revisar formación, carga, instrucciones, herramientas y dependencias.';
  else interpretation='No hay un patrón suficientemente claro para inferir fortalezas o desajustes de función. Conviene seguir acumulando evidencias de tareas comparables.';

  const confidence=mine.length>=15?'alta':mine.length>=8?'media':'baja';
  return {strengths,frictions,possibleMatches:matches.slice(0,4),interpretation,confidence,contextQuestions,stats};
}

function operationalReport(d,{businessId='',employeeId='',from='',to='',now=new Date().toISOString()}={}){
  const fromDate=validDate(from),toDate=validDate(to);
  if(toDate)toDate.setHours(23,59,59,999);
  const employees=d.employees.filter(e=>e.active!==false&&(!businessId||e.businessId===businessId)&&(!employeeId||e.id===employeeId));
  const employeeIds=new Set(employees.map(e=>e.id));
  const tasks=d.tasks.filter(t=>(!businessId||t.businessId===businessId)&&employeeIds.has(t.assigneeId)&&taskActiveInPeriod(t,fromDate,toDate,now));

  const rows=employees.map(emp=>{
    const mine=tasks.filter(t=>t.assigneeId===emp.id);
    const done=mine.filter(t=>t.status==='done'),open=mine.filter(isOpen);
    const overdueOpen=open.filter(t=>isOverdue(t,now)),lateDone=done.filter(completedLate);
    const ai=done.filter(t=>t.completedBy==='ai'),blocked=mine.filter(t=>t.status==='blocked');
    const noEvidence=done.filter(t=>!String(t.evidence||'').trim()&&!String(t.outcome||'').trim());
    const deviations=mine.filter(t=>isOverdue(t,now)||completedLate(t)||t.completedBy==='ai'||t.status==='blocked'||(t.status==='done'&&!String(t.evidence||'').trim()&&!String(t.outcome||'').trim()));
    const onTimeDone=done.filter(t=>!completedLate(t));
    const delays=mine.map(t=>delayMinutes(t,now)).filter(n=>n>0);
    const moduleMap=new Map();
    for(const t of mine){
      const key=t.module||'other',m=moduleMap.get(key)||{module:key,label:MODULE_LABELS[key]||key,assigned:0,deviations:0,overdueOpen:0,lateDone:0,aiRecovered:0,blocked:0,noEvidence:0};
      m.assigned++;
      const over=isOverdue(t,now),late=completedLate(t),air=t.completedBy==='ai',block=t.status==='blocked',noEv=t.status==='done'&&!String(t.evidence||'').trim()&&!String(t.outcome||'').trim();
      if(over||late||air||block||noEv)m.deviations++;
      if(over)m.overdueOpen++;if(late)m.lateDone++;if(air)m.aiRecovered++;if(block)m.blocked++;if(noEv)m.noEvidence++;
      moduleMap.set(key,m);
    }
    const areas=[...moduleMap.values()].sort((a,b)=>b.deviations-a.deviations||b.assigned-a.assigned||a.label.localeCompare(b.label,'es'));
    const topArea=areas.find(x=>x.deviations>0)||null,findings=[];
    if(overdueOpen.length)findings.push(overdueOpen.length+' tarea'+(overdueOpen.length===1?'':'s')+' actualmente fuera de plazo');
    if(lateDone.length)findings.push(lateDone.length+' tarea'+(lateDone.length===1?'':'s')+' completada'+(lateDone.length===1?'':'s')+' después del plazo');
    if(ai.length)findings.push(ai.length+' tarea'+(ai.length===1?'':'s')+' recuperada'+(ai.length===1?'':'s')+' por VentaNexIA');
    if(blocked.length)findings.push(blocked.length+' tarea'+(blocked.length===1?'':'s')+' bloqueada'+(blocked.length===1?'':'s'));
    if(noEvidence.length)findings.push(noEvidence.length+' tarea'+(noEvidence.length===1?'':'s')+' completada'+(noEvidence.length===1?'':'s')+' sin resultado/evidencia registrada');
    if(topArea)findings.push('Mayor concentración de desviaciones: '+topArea.label+' ('+topArea.deviations+')');
    if(!mine.length)findings.push('Sin tareas registradas en el periodo');
    else if(!findings.length)findings.push('Sin desviaciones operativas registradas en el periodo');

    const examples=deviations.sort((a,b)=>delayMinutes(b,now)-delayMinutes(a,now)||new Date(b.updatedAt||b.assignedAt)-new Date(a.updatedAt||a.assignedAt)).slice(0,8).map(t=>{
      const reasons=[];
      if(isOverdue(t,now))reasons.push('fuera de plazo');
      if(completedLate(t))reasons.push('terminada tarde');
      if(t.completedBy==='ai')reasons.push('recuperada por IA');
      if(t.status==='blocked')reasons.push('bloqueada');
      if(t.status==='done'&&!String(t.evidence||'').trim()&&!String(t.outcome||'').trim())reasons.push('sin evidencia');
      return {taskId:t.id,title:t.title,module:t.module||'other',moduleLabel:MODULE_LABELS[t.module]||t.module||'Otra',status:t.status,dueAt:t.dueAt,completedAt:t.completedAt,lastActivityAt:t.lastActivityAt,completedBy:t.completedBy||'',delayMinutes:delayMinutes(t,now),reasons,outcome:t.outcome||'',evidence:t.evidence||''};
    });
    const roleFit=qualitativeFit(mine,areas,now);
    return {
      employeeId:emp.id,name:emp.name,role:emp.role,email:emp.email,assigned:mine.length,done:done.length,
      doneHuman:done.filter(t=>t.completedBy==='human').length,doneAI:ai.length,open:open.length,
      overdueOpen:overdueOpen.length,lateDone:lateDone.length,blocked:blocked.length,noEvidence:noEvidence.length,
      deviations:deviations.length,onTimeRate:done.length?Math.round(onTimeDone.length/done.length*100):null,
      aiRecoveryRate:mine.length?Math.round(ai.length/mine.length*100):0,
      averageDelayMinutes:delays.length?Math.round(delays.reduce((a,b)=>a+b,0)/delays.length):0,
      totalDelayMinutes:delays.reduce((a,b)=>a+b,0),findings,areas,examples,roleFit
    };
  }).sort((a,b)=>a.name.localeCompare(b.name,'es'));

  const totals=rows.reduce((a,r)=>({
    employees:a.employees+1,assigned:a.assigned+r.assigned,done:a.done+r.done,open:a.open+r.open,
    overdueOpen:a.overdueOpen+r.overdueOpen,lateDone:a.lateDone+r.lateDone,doneAI:a.doneAI+r.doneAI,
    blocked:a.blocked+r.blocked,noEvidence:a.noEvidence+r.noEvidence,deviations:a.deviations+r.deviations,
    totalDelayMinutes:a.totalDelayMinutes+r.totalDelayMinutes
  }),{employees:0,assigned:0,done:0,open:0,overdueOpen:0,lateDone:0,doneAI:0,blocked:0,noEvidence:0,deviations:0,totalDelayMinutes:0});

  const areaTotals=new Map();
  for(const r of rows)for(const x of r.areas){
    const a=areaTotals.get(x.module)||{module:x.module,label:x.label,assigned:0,deviations:0,overdueOpen:0,lateDone:0,aiRecovered:0,blocked:0,noEvidence:0};
    for(const k of ['assigned','deviations','overdueOpen','lateDone','aiRecovered','blocked','noEvidence'])a[k]+=x[k]||0;
    areaTotals.set(x.module,a);
  }
  const areas=[...areaTotals.values()].sort((a,b)=>b.deviations-a.deviations||b.assigned-a.assigned||a.label.localeCompare(b.label,'es'));
  const findings=[];
  if(totals.overdueOpen)findings.push(totals.overdueOpen+' tareas siguen fuera de plazo');
  if(totals.lateDone)findings.push(totals.lateDone+' tareas se completaron tarde');
  if(totals.doneAI)findings.push(totals.doneAI+' tareas fueron recuperadas por VentaNexIA');
  if(totals.blocked)findings.push(totals.blocked+' tareas están bloqueadas');
  if(totals.noEvidence)findings.push(totals.noEvidence+' tareas completadas carecen de resultado/evidencia');
  if(areas[0]?.deviations)findings.push('Área con más desviaciones registradas: '+areas[0].label+' ('+areas[0].deviations+')');
  if(!totals.assigned)findings.push('No hay tareas registradas para el periodo seleccionado');
  else if(!findings.length)findings.push('No se detectan desviaciones operativas registradas en el periodo');

  return {
    generatedAt:now,period:{from:fromDate?fromDate.toISOString():null,to:toDate?toDate.toISOString():null},
    scope:{businessId,employeeId:employeeId||null},totals,findings,areas,employees:rows,
    note:'Este informe describe hechos operativos registrados (tareas, plazos, bloqueos, evidencias y recuperaciones por IA). No equivale por sí solo a una valoración laboral de la persona.'
  };
}

function addOrUpdateEmployee(d,raw={}){
  const emp=sanitizeEmployee(raw);
  if(!emp.name)throw new Error('Indica el nombre del empleado');
  const i=d.employees.findIndex(x=>x.id===emp.id||emp.email&&x.email===emp.email);
  if(i>=0)d.employees[i]={...d.employees[i],...emp,id:d.employees[i].id,createdAt:d.employees[i].createdAt||emp.createdAt};
  else d.employees.unshift(emp);
  d.employees=d.employees.slice(0,500);
  return i>=0?d.employees[i]:emp;
}

function addTask(d,raw={}){
  const t=sanitizeTask(raw,d.settings);
  if(!t.title)throw new Error('Indica qué trabajo debía realizarse');
  if(!t.assigneeId&&!t.assigneeName)throw new Error('Asigna la tarea a una persona');
  const emp=d.employees.find(x=>x.id===t.assigneeId);
  if(emp&&!t.assigneeName)t.assigneeName=emp.name;
  d.tasks.unshift(t);d.tasks=d.tasks.slice(0,5000);
  d.events.unshift(taskEvent(t,{actor:'system',type:'assigned',detail:'Tarea asignada a '+(t.assigneeName||t.assigneeId)}));
  d.events=d.events.slice(0,20000);
  return t;
}

function updateTask(d,taskId,patch={}){
  const i=d.tasks.findIndex(x=>x.id===taskId);if(i<0)throw new Error('Tarea no encontrada');
  const old=d.tasks[i],next=sanitizeTask({...old,...patch,id:old.id,createdAt:old.createdAt},d.settings);
  if(next.status==='done'&&!next.completedAt)next.completedAt=new Date().toISOString();
  d.tasks[i]=next;return next;
}

function recordEvent(d,taskId,raw={}){
  const t=d.tasks.find(x=>x.id===taskId);if(!t)throw new Error('Tarea no encontrada');
  const e=taskEvent(t,raw);d.events.unshift(e);d.events=d.events.slice(0,20000);
  t.lastActivityAt=e.at;t.updatedAt=new Date().toISOString();
  if(raw.status&&TASK_STATES.has(raw.status))t.status=raw.status;
  return e;
}

function resolveTask(d,taskId,{actor='human',detail='',outcome='',evidence=''}={}){
  const t=d.tasks.find(x=>x.id===taskId);if(!t)throw new Error('Tarea no encontrada');
  const who=actor==='ai'?'ai':'human',now=new Date().toISOString();
  t.status='done';t.completedAt=now;t.completedBy=who;t.lastActivityAt=now;t.updatedAt=now;
  t.outcome=clampText(outcome||detail,3000);t.evidence=clampText(evidence,3000);
  if(who==='ai')t.aiTakeoverAt=now;
  const e=taskEvent(t,{actor:who,type:who==='ai'?'resolved_by_ai':'resolved_by_human',detail:detail||t.outcome,at:now});
  d.events.unshift(e);d.events=d.events.slice(0,20000);
  return t;
}

module.exports={ensureDirection,sanitizeEmployee,sanitizeTask,summarize,operationalReport,addOrUpdateEmployee,addTask,updateTask,recordEvent,resolveTask,isOverdue,takeoverDue};
