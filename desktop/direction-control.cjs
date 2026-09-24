'use strict';
const crypto=require('node:crypto');

const TASK_STATES=new Set(['pending','in_progress','blocked','done','cancelled']);
const PRIORITIES=new Set(['low','normal','high','critical']);
const ACTORS=new Set(['human','ai','system']);
const EMPLOYEE_OBSERVATION_TYPES=new Set([
  'quality_ok','quality_issue','correction','rework','customer_praise','customer_complaint',
  'helped_team','handoff_ok','collaboration','training','coaching','learning',
  'instruction_issue','tool_issue','dependency'
]);

function iso(v){const d=v?new Date(v):new Date();return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString()}
function id(prefix='x'){return prefix+'_'+crypto.randomBytes(7).toString('hex')}
function clampText(v,n=500){return String(v??'').trim().slice(0,n)}
function clampNum(v,min=0,max=1e9,def=0){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):def}

const DEFAULT_MANAGEMENT_POLICY={profitability:50,customerService:50,peopleDevelopment:50,growth:50,stability:50};
const PROFILE_SOURCES=new Set(['self_reported','agreed','manager_observed']);
const AUTONOMY_LEVELS=new Set(['guided','balanced','autonomous']);
const COLLAB_LEVELS=new Set(['individual','balanced','team']);
const MOTIVATORS=new Set(['learning','autonomy','customer_contact','problem_solving','stability','recognition','growth','variety','precision','teamwork']);

function sanitizeTextList(v,maxItems=10,maxLen=160){
  const arr=Array.isArray(v)?v:String(v||'').split(/\r?\n|,/);
  return [...new Set(arr.map(x=>clampText(x,maxLen)).filter(Boolean))].slice(0,maxItems);
}
function sanitizeWorkProfile(raw={}){
  return {
    source:PROFILE_SOURCES.has(raw.source)?raw.source:'agreed',
    declaredStrengths:sanitizeTextList(raw.declaredStrengths,12,180),
    preferredTasks:sanitizeTextList(raw.preferredTasks,12,180),
    trainingNeeds:sanitizeTextList(raw.trainingNeeds,12,180),
    roleInterests:sanitizeTextList(raw.roleInterests,8,180),
    motivators:(Array.isArray(raw.motivators)?raw.motivators:[]).filter(x=>MOTIVATORS.has(x)).slice(0,10),
    preferredAutonomy:AUTONOMY_LEVELS.has(raw.preferredAutonomy)?raw.preferredAutonomy:'balanced',
    collaborationPreference:COLLAB_LEVELS.has(raw.collaborationPreference)?raw.collaborationPreference:'balanced',
    workContext:clampText(raw.workContext,1400),
    updatedAt:raw.updatedAt?iso(raw.updatedAt):null
  };
}
function sanitizeManagementPolicy(raw={}){
  const p={};
  for(const k of Object.keys(DEFAULT_MANAGEMENT_POLICY))p[k]=Math.round(clampNum(raw[k],0,100,DEFAULT_MANAGEMENT_POLICY[k]));
  p.updatedAt=raw.updatedAt?iso(raw.updatedAt):new Date().toISOString();
  return p;
}

function ensureDirection(state){
  state.secret=state.secret||{};
  const d=state.secret.directionControl&&typeof state.secret.directionControl==='object'?state.secret.directionControl:{};
  d.employees=Array.isArray(d.employees)?d.employees:[];
  d.tasks=Array.isArray(d.tasks)?d.tasks:[];
  d.events=Array.isArray(d.events)?d.events:[];
  d.settings=d.settings&&typeof d.settings==='object'?d.settings:{};
  d.access=d.access&&typeof d.access==='object'?d.access:{};
  d.managementPolicy=sanitizeManagementPolicy(d.managementPolicy||DEFAULT_MANAGEMENT_POLICY);
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
    workProfile:sanitizeWorkProfile(raw.workProfile||{}),
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
    workType:clampText(raw.workType||raw.module||'other',80),
    requesterType:clampText(raw.requesterType||'internal',40),
    requesterName:clampText(raw.requesterName,160),
    sourceRef:clampText(raw.sourceRef,220),
    priority:PRIORITIES.has(raw.priority)?raw.priority:'normal',
    status,
    createdAt,
    assignedAt,
    receivedAt:raw.receivedAt?iso(raw.receivedAt):assignedAt,
    firstActionAt:raw.firstActionAt?iso(raw.firstActionAt):null,
    firstResponseAt:raw.firstResponseAt?iso(raw.firstResponseAt):null,
    blockedSince:raw.blockedSince?iso(raw.blockedSince):null,
    blockedMinutes:clampNum(raw.blockedMinutes,0,60*24*3650,0),
    completedAt:raw.completedAt?iso(raw.completedAt):null,
    lastActivityAt:raw.lastActivityAt?iso(raw.lastActivityAt):assignedAt,
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


function timingForTask(t,now=new Date().toISOString()){
  const received=t.receivedAt||t.assignedAt||t.createdAt;
  const first=t.firstActionAt||null,response=t.firstResponseAt||null,completed=t.completedAt||null;
  const end=completed||now;
  return {
    reactionMinutes:first?minutesBetween(received,first):null,
    responseMinutes:response?minutesBetween(received,response):null,
    resolutionMinutes:completed?minutesBetween(received,completed):null,
    ageMinutes:isOpen(t)?minutesBetween(received,now):minutesBetween(received,end),
    blockedMinutes:Math.max(0,Number(t.blockedMinutes||0)+(t.blockedSince?minutesBetween(t.blockedSince,now):0)),
    activeElapsedMinutes:Math.max(0,minutesBetween(received,end)-Math.max(0,Number(t.blockedMinutes||0)+(t.blockedSince?minutesBetween(t.blockedSince,completed||now):0)))
  };
}
function avgKnown(xs){const a=xs.filter(x=>Number.isFinite(x));return a.length?Math.round(a.reduce((s,x)=>s+x,0)/a.length):null}
function medianKnown(xs){const a=xs.filter(x=>Number.isFinite(x)).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:Math.round((a[m-1]+a[m])/2)}
function timingSummary(tasks,now=new Date().toISOString()){
  const rows=tasks.map(t=>({task:t,...timingForTask(t,now)}));
  const groups=new Map();
  for(const r of rows){
    const key=r.task.workType||r.task.module||'other';
    const g=groups.get(key)||{key,label:MODULE_LABELS[key]||key,count:0,reaction:[],response:[],resolution:[],blocked:[],age:[]};
    g.count++;g.reaction.push(r.reactionMinutes);g.response.push(r.responseMinutes);g.resolution.push(r.resolutionMinutes);g.blocked.push(r.blockedMinutes);g.age.push(r.ageMinutes);groups.set(key,g);
  }
  return {
    averageReactionMinutes:avgKnown(rows.map(x=>x.reactionMinutes)),
    averageResponseMinutes:avgKnown(rows.map(x=>x.responseMinutes)),
    averageResolutionMinutes:avgKnown(rows.map(x=>x.resolutionMinutes)),
    medianResponseMinutes:medianKnown(rows.map(x=>x.responseMinutes)),
    totalBlockedMinutes:rows.reduce((s,x)=>s+(x.blockedMinutes||0),0),
    byType:[...groups.values()].map(g=>({
      key:g.key,label:g.label,count:g.count,
      averageReactionMinutes:avgKnown(g.reaction),
      averageResponseMinutes:avgKnown(g.response),
      averageResolutionMinutes:avgKnown(g.resolution),
      medianResponseMinutes:medianKnown(g.response),
      totalBlockedMinutes:g.blocked.reduce((s,x)=>s+(x||0),0)
    })).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'es')),
    items:rows.map(r=>({
      taskId:r.task.id,title:r.task.title,assigneeId:r.task.assigneeId,assigneeName:r.task.assigneeName,
      workType:r.task.workType||r.task.module||'other',requesterType:r.task.requesterType||'internal',requesterName:r.task.requesterName||'',
      receivedAt:r.task.receivedAt||r.task.assignedAt,firstActionAt:r.task.firstActionAt,firstResponseAt:r.task.firstResponseAt,completedAt:r.task.completedAt,
      reactionMinutes:r.reactionMinutes,responseMinutes:r.responseMinutes,resolutionMinutes:r.resolutionMinutes,blockedMinutes:r.blockedMinutes,ageMinutes:r.ageMinutes
    }))
  };
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
  email:'Correo',colleague_request:'Solicitud de compañero',customer_request:'Solicitud de cliente',
  crm:'Ventas y clientes',orders:'Pedidos',web_ecommerce:'Stock y compras',
  administration:'Documentos / administración',agenda:'Agenda',reports:'Informes',meeting:'Reuniones',other:'Otra'
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


function isDeviationTask(t,now){
  return Boolean(isOverdue(t,now)||completedLate(t)||t.completedBy==='ai'||t.status==='blocked'||(t.status==='done'&&!String(t.evidence||'').trim()&&!String(t.outcome||'').trim()));
}
function peerModuleStats(tasks,employees,now){
  const employeeIds=new Set(employees.map(x=>x.id)),map=new Map();
  for(const t of tasks){
    if(!employeeIds.has(t.assigneeId))continue;
    const key=t.module||'other',x=map.get(key)||{module:key,total:0,deviations:0,blocked:0,ai:0,employees:new Set()};
    x.total++;x.employees.add(t.assigneeId);
    if(isDeviationTask(t,now))x.deviations++;
    if(t.status==='blocked')x.blocked++;
    if(t.completedBy==='ai')x.ai++;
    map.set(key,x);
  }
  return new Map([...map].map(([k,x])=>[k,{...x,employees:x.employees.size,deviationRate:x.total?x.deviations/x.total:0}]));
}
function causeHypotheses(emp,mine,roleFit,peers,now){
  const profile=sanitizeWorkProfile(emp.workProfile||{}),out=[];
  const stats=roleFit?.stats||[],strong=stats.filter(x=>x.total>=3&&x.completionRate>=.7&&x.onTimeRate>=.75);
  const weak=stats.filter(x=>x.total>=3&&((x.onTimeRate<.55&&x.done>=2)||(x.ai/x.total>=.35)||(x.blocked/x.total>=.35)));
  const open=mine.filter(isOpen),blocked=mine.filter(t=>t.status==='blocked');
  const overdueModules=new Set(mine.filter(t=>isOverdue(t,now)).map(t=>t.module||'other'));

  if(strong.length&&weak.length)out.push({
    key:'role_mismatch',label:'Posible desajuste parcial de funciones',confidence:mine.length>=10?'media':'baja',
    evidence:['Rendimiento claramente diferente según el tipo de tarea','Hay áreas con buen desempeño y otras con fricción repetida'],
    meaning:'Puede encajar mejor en unas funciones que en otras; no implica falta de capacidad general.'
  });
  if(profile.trainingNeeds.length&&weak.length)out.push({
    key:'training_gap',label:'Formación o acompañamiento a revisar',confidence:'media',
    evidence:['Existen necesidades de formación registradas','Coinciden con un periodo en el que aparecen fricciones operativas'],
    meaning:'La dificultad puede ser corregible mediante formación, práctica guiada o mejores instrucciones.'
  });
  if(blocked.length>=2||mine.length>=5&&blocked.length/mine.length>=.25)out.push({
    key:'dependencies',label:'Dependencias o bloqueos externos',confidence:'media',
    evidence:[blocked.length+' tareas bloqueadas en el periodo'],
    meaning:'Parte del resultado puede depender de terceros, autorizaciones, información o herramientas fuera del control de la persona.'
  });
  if(open.length>=5&&overdueModules.size>=2)out.push({
    key:'workload',label:'Carga o priorización a revisar',confidence:'baja',
    evidence:[open.length+' tareas abiertas','Los retrasos afectan a más de un área'],
    meaning:'El patrón puede deberse a exceso de carga, prioridades incompatibles o plazos poco realistas.'
  });
  for(const w of weak){
    const peer=peers.get(w.module);
    if(peer&&peer.employees>=2&&peer.total>=6&&peer.deviationRate>=.35){
      out.push({
        key:'process_'+w.module,label:'Posible problema de proceso en '+w.label,confidence:'media',
        evidence:['La misma área acumula desviaciones entre varias personas','Tasa de desviación del proceso: '+Math.round(peer.deviationRate*100)+'%'],
        meaning:'Antes de atribuir el problema a una persona conviene revisar procedimiento, herramientas, instrucciones y dependencias del área.'
      });
    }
  }
  if(weak.length&&mine.length>=10&&!out.some(x=>x.key.startsWith('process_'))&&!out.some(x=>x.key==='training_gap')){
    out.push({
      key:'persistent_fit',label:'Desajuste funcional persistente a comprobar',confidence:'baja',
      evidence:['La fricción se repite en tareas comparables y existe volumen suficiente para revisarla'],
      meaning:'Puede existir un desajuste entre las exigencias de una parte del puesto y las fortalezas observadas, pero requiere revisión humana antes de concluir.'
    });
  }
  if(!out.length)out.push({
    key:'insufficient',label:'Sin causa dominante demostrada',confidence:'baja',
    evidence:['Los datos no permiten separar con claridad persona, puesto, carga o proceso'],
    meaning:'Conviene recopilar más evidencias comparables y hablar con la persona antes de modificar funciones.'
  });
  const seen=new Set();return out.filter(x=>!seen.has(x.key)&&seen.add(x.key)).slice(0,6);
}
function managementLens(policy,emp,roleFit,hypotheses){
  const p=sanitizeManagementPolicy(policy||DEFAULT_MANAGEMENT_POLICY);
  const labels={profitability:'rentabilidad',customerService:'servicio al cliente',peopleDevelopment:'desarrollo de personas',growth:'crecimiento',stability:'estabilidad y riesgo'};
  const priorities=Object.entries(p).filter(([k])=>k!=='updatedAt').sort((a,b)=>b[1]-a[1]).slice(0,2).map(([key,value])=>({key,label:labels[key],value}));
  const rec=[];
  const has=k=>hypotheses.some(x=>x.key===k||x.key.startsWith(k+'_'));
  if(has('process'))rec.push('Revisar el proceso antes de atribuir el problema a una persona; si varias personas fallan en la misma fase, corregir el sistema puede producir más efecto que cambiar al trabajador.');
  if(has('dependencies'))rec.push('Eliminar o reducir bloqueos externos y volver a medir el desempeño con las mismas tareas.');
  if(has('workload'))rec.push('Reequilibrar prioridades o volumen durante un periodo de prueba y comprobar si desaparecen los retrasos.');
  if(has('training_gap'))rec.push('Aplicar formación concreta y volver a evaluar tras un número suficiente de tareas comparables.');
  if(has('role_mismatch')||has('persistent_fit'))rec.push('Probar una reasignación parcial hacia las áreas donde existe mejor evidencia de encaje antes de concluir que la persona no sirve para la empresa.');

  if(p.profitability>=70)rec.push('Criterio de Dirección: priorizar reducción de retrabajo, tareas recuperadas por IA y costes operativos; comparar formación, automatización y reasignación antes de aumentar estructura.');
  if(p.customerService>=70)rec.push('Criterio de Dirección: proteger las funciones donde la persona aporta mejor respuesta al cliente y evitar que tareas de peor encaje deterioren el servicio.');
  if(p.peopleDevelopment>=70)rec.push('Criterio de Dirección: priorizar aprendizaje, acompañamiento y rediseño del puesto antes de tomar decisiones irreversibles.');
  if(p.growth>=70)rec.push('Criterio de Dirección: concentrar a la persona en las funciones con mejor evidencia de rendimiento que puedan escalar con el crecimiento.');
  if(p.stability>=70)rec.push('Criterio de Dirección: reducir dependencia de una sola persona, documentar procesos y crear respaldos para tareas críticas.');

  if((roleFit?.possibleMatches||[]).length)rec.push('Funciones a explorar según evidencias actuales: '+roleFit.possibleMatches.join(', ')+'.');
  if(!rec.length)rec.push('Mantener el seguimiento y revisar nuevamente cuando exista más evidencia comparable.');
  return {
    policy:p,priorities,recommendations:[...new Set(rec)].slice(0,7),
    principle:'Los hechos del informe no cambian con el criterio del jefe; solo cambia qué objetivos prioriza la recomendación. La decisión final corresponde a Dirección.'
  };
}

const DIMENSION_STATUS=new Set(['favorable','mixta','atencion','sin_datos']);
function dim(key,label,status,confidence,summary,evidence=[],missing=[]){
  return {key,label,status:DIMENSION_STATUS.has(status)?status:'sin_datos',confidence,summary,evidence:evidence.slice(0,6),missing:missing.slice(0,5)};
}
function trendDeviation(tasks,now){
  const sorted=tasks.slice().sort((a,b)=>new Date(a.assignedAt||a.createdAt)-new Date(b.assignedAt||b.createdAt));
  if(sorted.length<8)return null;
  const mid=Math.floor(sorted.length/2),first=sorted.slice(0,mid),second=sorted.slice(mid);
  const rate=xs=>xs.length?xs.filter(t=>isDeviationTask(t,now)).length/xs.length:0;
  const a=rate(first),b=rate(second),delta=b-a;
  return {firstRate:a,secondRate:b,delta,direction:delta<=-.15?'improving':delta>=.15?'worsening':'stable'};
}
function employeeEvaluation(emp,mine,roleFit,humanContext,events,now){
  const profile=sanitizeWorkProfile(emp.workProfile||{}),done=mine.filter(t=>t.status==='done'),open=mine.filter(isOpen);
  const overdue=open.filter(t=>isOverdue(t,now)),late=done.filter(completedLate),ai=done.filter(t=>t.completedBy==='ai');
  const withEvidence=done.filter(t=>String(t.evidence||t.outcome||'').trim());
  const blocked=mine.filter(t=>t.status==='blocked'),humanDone=done.filter(t=>t.completedBy==='human');
  const qualityEvents=events.filter(e=>['quality_issue','correction','rework','customer_complaint'].includes(e.type));
  const positiveQualityEvents=events.filter(e=>['quality_ok','customer_praise','approved_first_time'].includes(e.type));
  const collaborationEvents=events.filter(e=>['helped_team','handoff_ok','collaboration'].includes(e.type));
  const learningEvents=events.filter(e=>['training','coaching','learning'].includes(e.type));
  const trend=trendDeviation(mine,now),dims=[];

  if(!mine.length)dims.push(dim('delivery','Cumplimiento','sin_datos','insuficiente','No hay tareas registradas suficientes para valorar cumplimiento.',[],['Registrar tareas y plazos comparables.']));
  else{
    const onTime=done.filter(t=>!completedLate(t)).length,rate=done.length?onTime/done.length:0;
    const status=done.length<3?'sin_datos':rate>=.8&&overdue.length===0?'favorable':rate>=.55?'mixta':'atencion';
    dims.push(dim('delivery','Cumplimiento',status,done.length>=10?'alta':done.length>=4?'media':'baja',
      done.length?Math.round(rate*100)+'% de las tareas terminadas se completaron dentro del plazo; '+overdue.length+' siguen vencidas.':'Todavía no hay tareas completadas.',
      [done.length+' tareas completadas',late.length+' terminadas tarde',overdue.length+' actualmente vencidas'],
      done.length<4?['Hace falta más volumen de tareas comparables.']:[]));
  }

  if(done.length<3&&qualityEvents.length===0&&positiveQualityEvents.length===0)dims.push(dim('quality','Calidad del resultado','sin_datos','insuficiente','No hay suficiente evidencia de calidad. Terminar una tarea no demuestra por sí solo que esté bien hecha.',[],['Registrar correcciones, retrabajo, aprobación a la primera o incidencias de cliente.']));
  else{
    const evidenceRate=done.length?withEvidence.length/done.length:0;
    const status=qualityEvents.length===0&&evidenceRate>=.75?'favorable':qualityEvents.length<=Math.max(1,done.length*.15)?'mixta':'atencion';
    dims.push(dim('quality','Calidad del resultado',status,qualityEvents.length+positiveQualityEvents.length>=3?'media':'baja',
      qualityEvents.length?qualityEvents.length+' incidencias de calidad/retrabajo registradas.':'No aparecen incidencias de calidad registradas; debe distinguirse entre ausencia de incidencias y ausencia de registro.',
      [withEvidence.length+'/'+done.length+' tareas con resultado o evidencia',qualityEvents.length+' eventos de corrección/retrabajo',positiveQualityEvents.length+' validaciones positivas'],
      qualityEvents.length+positiveQualityEvents.length<3?['Registrar revisiones de calidad de forma explícita.']:[]));
  }

  if(mine.length<5)dims.push(dim('reliability','Fiabilidad','sin_datos','baja','Todavía no hay suficiente historial para valorar consistencia.',[],['Acumular al menos varias tareas repetidas en el tiempo.']));
  else{
    const failures=overdue.length+late.length+ai.length,ratio=failures/mine.length;
    const status=ratio<=.15?'favorable':ratio<=.4?'mixta':'atencion';
    dims.push(dim('reliability','Fiabilidad',status,mine.length>=12?'media':'baja',
      status==='favorable'?'El trabajo registrado muestra una pauta bastante consistente.':status==='mixta'?'La consistencia cambia según tarea o periodo.':'Hay una repetición relevante de retrasos o recuperaciones que conviene explicar.',
      [mine.length+' tareas observadas',late.length+' entregas tardías',ai.length+' tareas recuperadas por IA',blocked.length+' bloqueos'],
      []));
  }

  const strengths=roleFit?.strengths||[],frictions=roleFit?.frictions||[];
  dims.push(dim('functional_strengths','Fortalezas por función',
    strengths.length?'favorable':frictions.length?'mixta':'sin_datos',roleFit?.confidence||'baja',
    strengths.length?roleFit.interpretation:'No hay todavía un patrón funcional positivo suficientemente claro.',
    strengths.length?strengths:['Áreas analizadas: '+((roleFit?.stats||[]).map(x=>x.label).join(', ')||'sin datos')],
    strengths.length?[]:['Acumular más tareas comparables por área.']));

  if(!trend)dims.push(dim('learning','Aprendizaje y mejora','sin_datos','insuficiente','No hay suficiente serie temporal para saber si mejora después de experiencia, formación o feedback.',learningEvents.length?[learningEvents.length+' eventos de formación/acompañamiento registrados']:[],['Se necesitan al menos 8 tareas ordenadas en el tiempo y registrar la formación/feedback.']));
  else{
    const status=trend.direction==='improving'?'favorable':trend.direction==='stable'?'mixta':'atencion';
    dims.push(dim('learning','Aprendizaje y mejora',status,'media',
      trend.direction==='improving'?'Las desviaciones disminuyen en la parte más reciente del historial.':trend.direction==='worsening'?'Las desviaciones aumentan en la parte más reciente; revisar qué cambió.':'No se observa todavía una mejora o deterioro claro.',
      ['Desviaciones primera mitad: '+Math.round(trend.firstRate*100)+'%','Desviaciones segunda mitad: '+Math.round(trend.secondRate*100)+'%',learningEvents.length+' eventos de formación/feedback'],
      learningEvents.length?[]:['Registrar cuándo hubo formación o feedback para no atribuir causalidad sin evidencia.']));
  }

  if(done.length<4)dims.push(dim('autonomy','Autonomía y resolución','sin_datos','baja','No hay suficientes tareas finalizadas para valorar autonomía operativa.',[],['Registrar cuándo una tarea requirió ayuda, escalado o recuperación.']));
  else{
    const humanRate=done.length?humanDone.length/done.length:0,status=humanRate>=.85&&ai.length<=1?'favorable':humanRate>=.6?'mixta':'atencion';
    dims.push(dim('autonomy','Autonomía y resolución',status,'baja',
      'Esta dimensión usa únicamente señales operativas; no equivale a iniciativa personal ni capacidad intelectual.',
      [humanDone.length+'/'+done.length+' tareas cerradas por la persona',ai.length+' recuperadas por IA','Preferencia declarada de autonomía: '+profile.preferredAutonomy],
      ['Distinguir ayuda razonable, escalado correcto y dependencia evitable.']));
  }

  if(collaborationEvents.length<2)dims.push(dim('collaboration','Colaboración y efecto en el equipo','sin_datos','insuficiente','VentaNexIA no debe deducir colaboración a partir de productividad individual.',profile.collaborationPreference?['Preferencia declarada: '+profile.collaborationPreference]:[],['Registrar entregas a compañeros, ayudas, bloqueos cruzados y coordinación de forma explícita.']));
  else dims.push(dim('collaboration','Colaboración y efecto en el equipo','favorable','baja','Hay eventos de colaboración registrados, aunque deben interpretarse con contexto.',[collaborationEvents.length+' eventos explícitos de colaboración'],[]));

  const hypotheses=humanContext?.hypotheses||[];
  dims.push(dim('job_context','Contexto del puesto',
    hypotheses.some(h=>['workload','dependencies'].includes(h.key)||h.key.startsWith('process_'))?'atencion':'mixta',
    hypotheses.length?'media':'baja',
    hypotheses.length?'Existen explicaciones alternativas que Dirección debe revisar antes de atribuir el resultado a la persona.':'No se ha identificado una causa contextual dominante.',
    hypotheses.map(h=>h.label+': '+h.meaning),
    hypotheses.length?[]:['Comprobar carga, proceso, formación, instrucciones, herramientas y dependencias.']));

  const matches=roleFit?.possibleMatches||[];
  dims.push(dim('role_fit','Encaje actual y alternativo',
    frictions.length&&strengths.length?'mixta':strengths.length?'favorable':frictions.length?'atencion':'sin_datos',
    roleFit?.confidence||'baja',
    roleFit?.interpretation||'No hay evidencia suficiente para valorar el encaje.',
    [...strengths,...frictions,...(matches.length?['Funciones a explorar: '+matches.join(', ')]:[])],
    roleFit?.contextQuestions||[]));

  const operationalImpact=late.length+overdue.length+ai.length;
  dims.push(dim('business_impact','Impacto empresarial',
    mine.length<3?'sin_datos':operationalImpact===0?'favorable':operationalImpact<=Math.max(2,mine.length*.25)?'mixta':'atencion',
    'baja',
    'Se muestra impacto operativo verificable. El impacto económico solo debe afirmarse cuando existan costes, márgenes, ventas o pérdidas conectadas a la tarea.',
    [late.length+' entregas tardías',overdue.length+' tareas vencidas',ai.length+' tareas recuperadas por IA'],
    ['Para cuantificar euros, vincular tareas con ventas, costes, margen, pedidos o incidencias económicas reales.']));

  return {
    dimensions:dims,
    overallScore:null,
    rankingAllowed:false,
    decisionRule:'No convertir estas dimensiones en una nota global. La evaluación sirve para entender el patrón, buscar causas y comparar alternativas, no para ordenar personas.',
    reviewQuestions:[
      '¿El resultado cambia cuando recibe formación o instrucciones más claras?',
      '¿El mismo problema aparece en otras personas que hacen el mismo proceso?',
      '¿La carga y los plazos eran razonables?',
      '¿Sus mejores resultados pertenecen a funciones distintas de las que ocupan la mayor parte de su puesto?',
      '¿Qué evidencia falta antes de modificar responsabilidades?'
    ]
  };
}

function humanContextAnalysis(emp,mine,roleFit,peers,policy,now){
  const profile=sanitizeWorkProfile(emp.workProfile||{});
  const hypotheses=causeHypotheses(emp,mine,roleFit,peers,now);
  const management=managementLens(policy,emp,roleFit,hypotheses);
  return {
    profile,
    hypotheses,
    management,
    boundaries:[
      'No se infieren emociones, salud, ideología, religión, orientación sexual ni otros rasgos sensibles.',
      'No se generan rankings de personas ni sanciones o despidos automáticos.',
      'Las preferencias laborales declaradas se mantienen separadas de los hechos observados.'
    ]
  };
}

function operationalReport(d,{businessId='',employeeId='',from='',to='',now=new Date().toISOString()}={}){
  const fromDate=validDate(from),toDate=validDate(to);
  if(toDate)toDate.setHours(23,59,59,999);
  const employees=d.employees.filter(e=>e.active!==false&&(!businessId||e.businessId===businessId)&&(!employeeId||e.id===employeeId));
  const employeeIds=new Set(employees.map(e=>e.id));
  const tasks=d.tasks.filter(t=>(!businessId||t.businessId===businessId)&&employeeIds.has(t.assigneeId)&&taskActiveInPeriod(t,fromDate,toDate,now));
  const peers=peerModuleStats(tasks,employees,now),managementPolicy=sanitizeManagementPolicy(d.managementPolicy||DEFAULT_MANAGEMENT_POLICY);

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
    const humanContext=humanContextAnalysis(emp,mine,roleFit,peers,managementPolicy,now);
    const employeeEvents=d.events.filter(e=>e.employeeId===emp.id&&(!businessId||e.businessId===businessId)&&taskActiveInPeriod({assignedAt:e.at,updatedAt:e.at,status:'done'},fromDate,toDate,now));
    const evaluation=employeeEvaluation(emp,mine,roleFit,humanContext,employeeEvents,now);
    const timing=timingSummary(mine,now);
    return {
      employeeId:emp.id,name:emp.name,role:emp.role,email:emp.email,assigned:mine.length,done:done.length,
      doneHuman:done.filter(t=>t.completedBy==='human').length,doneAI:ai.length,open:open.length,
      overdueOpen:overdueOpen.length,lateDone:lateDone.length,blocked:blocked.length,noEvidence:noEvidence.length,
      deviations:deviations.length,onTimeRate:done.length?Math.round(onTimeDone.length/done.length*100):null,
      aiRecoveryRate:mine.length?Math.round(ai.length/mine.length*100):0,
      averageDelayMinutes:delays.length?Math.round(delays.reduce((a,b)=>a+b,0)/delays.length):0,
      totalDelayMinutes:delays.reduce((a,b)=>a+b,0),findings,areas,examples,roleFit,humanContext,evaluation,timing
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
    scope:{businessId,employeeId:employeeId||null},totals,findings,areas,employees:rows,managementPolicy,timing:timingSummary(tasks,now),
    note:'Este informe describe hechos operativos registrados (tareas, plazos, bloqueos, evidencias y recuperaciones por IA). No equivale por sí solo a una valoración laboral de la persona ni autoriza decisiones automáticas.'
  };
}

function addOrUpdateEmployee(d,raw={}){
  const probe=sanitizeEmployee(raw),i=d.employees.findIndex(x=>x.id===probe.id||probe.email&&x.email===probe.email);
  const existing=i>=0?d.employees[i]:null;
  const merged=existing?{...existing,...raw,workProfile:raw.workProfile===undefined?existing.workProfile:{...(existing.workProfile||{}),...(raw.workProfile||{})}}:raw;
  const emp=sanitizeEmployee(merged);
  if(!emp.name)throw new Error('Indica el nombre del empleado');
  if(i>=0)d.employees[i]={...existing,...emp,id:existing.id,createdAt:existing.createdAt||emp.createdAt};
  else d.employees.unshift(emp);
  d.employees=d.employees.slice(0,500);
  return i>=0?d.employees[i]:emp;
}
function updateEmployeeContext(d,employeeId,raw={}){
  const e=d.employees.find(x=>x.id===employeeId);if(!e)throw new Error('Empleado no encontrado');
  e.workProfile=sanitizeWorkProfile({...e.workProfile,...raw,updatedAt:new Date().toISOString()});
  e.updatedAt=new Date().toISOString();return e;
}
function setManagementPolicy(d,raw={}){
  d.managementPolicy=sanitizeManagementPolicy({...d.managementPolicy,...raw,updatedAt:new Date().toISOString()});
  return d.managementPolicy;
}

function addEmployeeObservation(d,employeeId,raw={}){
  const emp=d.employees.find(x=>x.id===employeeId);if(!emp)throw new Error('Empleado no encontrado');
  const type=clampText(raw.type,80);if(!EMPLOYEE_OBSERVATION_TYPES.has(type))throw new Error('Tipo de evidencia laboral no válido');
  const detail=clampText(raw.detail,1400);if(!detail)throw new Error('Describe la evidencia laboral');
  const e={
    id:id('evt'),taskId:'',employeeId:emp.id,actor:'human',type,detail,
    at:iso(raw.at),businessId:clampText(raw.businessId||emp.businessId,120),
    module:clampText(raw.module||'other',80)
  };
  d.events.unshift(e);d.events=d.events.slice(0,20000);
  return e;
}

function upsertTrackedWork(d,raw={}){
  const externalRef=clampText(raw.externalRef||raw.sourceRef,220);
  const businessId=clampText(raw.businessId,120);
  let t=externalRef?d.tasks.find(x=>x.externalRef===externalRef&&(!businessId||x.businessId===businessId)):null;
  if(!t){
    t=sanitizeTask(raw,d.settings);
    if(!t.title)throw new Error('Falta la descripción del trabajo');
    d.tasks.unshift(t);d.tasks=d.tasks.slice(0,5000);
    d.events.unshift(taskEvent(t,{actor:'system',type:'received',detail:'Trabajo recibido desde '+(t.workType||t.module||'fuente')}));d.events=d.events.slice(0,20000);
    return t;
  }
  const keep={id:t.id,createdAt:t.createdAt,assignedAt:t.assignedAt,receivedAt:t.receivedAt};
  Object.assign(t,sanitizeTask({...t,...raw,...keep},d.settings),keep);
  return t;
}
function recordTrackedTiming(d,taskId,kind,at=new Date().toISOString(),detail=''){
  const t=d.tasks.find(x=>x.id===taskId);if(!t)throw new Error('Trabajo no encontrado');
  const when=iso(at);
  if(kind==='first_action'){if(!t.firstActionAt)t.firstActionAt=when;return recordEvent(d,t.id,{actor:'human',type:'started',detail:detail||'Primera acción registrada',at:when,status:t.status==='pending'?'in_progress':t.status})}
  if(kind==='response'){if(!t.firstActionAt)t.firstActionAt=when;if(!t.firstResponseAt)t.firstResponseAt=when;return recordEvent(d,t.id,{actor:'human',type:'first_response',detail:detail||'Primera respuesta registrada',at:when,status:t.status==='pending'?'in_progress':t.status})}
  if(kind==='blocked')return recordEvent(d,t.id,{actor:'human',type:'blocked',detail:detail||'Trabajo bloqueado',at:when,status:'blocked'});
  if(kind==='unblocked')return recordEvent(d,t.id,{actor:'human',type:'unblocked',detail:detail||'Bloqueo resuelto',at:when,status:'in_progress'});
  if(kind==='completed')return resolveTask(d,t.id,{actor:'human',detail:detail||'Trabajo completado',outcome:detail});
  throw new Error('Tipo de marca temporal no válido');
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
  if(!t.firstActionAt&&['activity','started','response','first_response','evidence'].includes(e.type))t.firstActionAt=e.at;
  if(['response','first_response'].includes(e.type)&&!t.firstResponseAt)t.firstResponseAt=e.at;
  if(e.type==='blocked'&&!t.blockedSince)t.blockedSince=e.at;
  if(['unblocked','resumed'].includes(e.type)&&t.blockedSince){t.blockedMinutes=Math.max(0,Number(t.blockedMinutes||0)+minutesBetween(t.blockedSince,e.at));t.blockedSince=null}
  if(raw.status&&TASK_STATES.has(raw.status))t.status=raw.status;
  return e;
}

function resolveTask(d,taskId,{actor='human',detail='',outcome='',evidence=''}={}){
  const t=d.tasks.find(x=>x.id===taskId);if(!t)throw new Error('Tarea no encontrada');
  const who=actor==='ai'?'ai':'human',now=new Date().toISOString();
  if(!t.firstActionAt)t.firstActionAt=now;
  if(t.blockedSince){t.blockedMinutes=Math.max(0,Number(t.blockedMinutes||0)+minutesBetween(t.blockedSince,now));t.blockedSince=null}
  t.status='done';t.completedAt=now;t.completedBy=who;t.lastActivityAt=now;t.updatedAt=now;
  t.outcome=clampText(outcome||detail,3000);t.evidence=clampText(evidence,3000);
  if(who==='ai')t.aiTakeoverAt=now;
  const e=taskEvent(t,{actor:who,type:who==='ai'?'resolved_by_ai':'resolved_by_human',detail:detail||t.outcome,at:now});
  d.events.unshift(e);d.events=d.events.slice(0,20000);
  return t;
}

module.exports={ensureDirection,sanitizeEmployee,sanitizeTask,sanitizeWorkProfile,sanitizeManagementPolicy,summarize,operationalReport,employeeEvaluation,timingForTask,timingSummary,upsertTrackedWork,recordTrackedTiming,addOrUpdateEmployee,updateEmployeeContext,setManagementPolicy,addEmployeeObservation,addTask,updateTask,recordEvent,resolveTask,isOverdue,takeoverDue};
