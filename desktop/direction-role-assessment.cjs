'use strict';
const crypto=require('node:crypto');

const QUESTION_TYPES=new Set(['practical_case','structured_interview','role_knowledge']);
const DIMENSIONS=new Set(['reasoning','problem_solving','prioritization','learning','communication','perspective_taking','collaboration','autonomy','role_knowledge','decision_quality']);

function id(prefix){return prefix+'_'+crypto.randomBytes(7).toString('hex')}
function txt(v,max=500){return String(v??'').trim().replace(/\s+/g,' ').slice(0,max)}
function long(v,max=6000){return String(v??'').trim().slice(0,max)}
function list(v,maxItems=20,maxLen=220){
  const a=Array.isArray(v)?v:String(v||'').split(/\r?\n|,/);
  return [...new Set(a.map(x=>txt(x,maxLen)).filter(Boolean))].slice(0,maxItems);
}
function ensure(d){
  d.roleProfiles=Array.isArray(d.roleProfiles)?d.roleProfiles:[];
  d.roleQuestions=Array.isArray(d.roleQuestions)?d.roleQuestions:[];
  d.roleAssessments=Array.isArray(d.roleAssessments)?d.roleAssessments:[];
  d.miniIpipAssessments=Array.isArray(d.miniIpipAssessments)?d.miniIpipAssessments:[];
  return d;
}
function sanitizeRoleProfile(raw={}){
  return {
    id:txt(raw.id,80)||id('role'),
    businessId:txt(raw.businessId,120),
    name:txt(raw.name,160),
    description:long(raw.description,2200),
    requirements:list(raw.requirements,30,240),
    priorities:list(raw.priorities,20,220),
    createdAt:raw.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
}
function saveRoleProfile(d,raw={}){
  ensure(d);
  const p=sanitizeRoleProfile(raw);
  if(!p.name)throw new Error('Indica el nombre del puesto.');
  if(!p.requirements.length)throw new Error('Define al menos un requisito observable del puesto.');
  const i=d.roleProfiles.findIndex(x=>x.id===p.id||(!raw.id&&x.businessId===p.businessId&&x.name.toLowerCase()===p.name.toLowerCase()));
  if(i>=0){p.id=d.roleProfiles[i].id;p.createdAt=d.roleProfiles[i].createdAt;d.roleProfiles[i]={...d.roleProfiles[i],...p}}
  else d.roleProfiles.unshift(p);
  d.roleProfiles=d.roleProfiles.slice(0,250);
  return i>=0?d.roleProfiles[i]:p;
}
function sanitizeQuestion(raw={},roleId=''){
  return {
    id:txt(raw.id,80)||id('q'),
    roleId:txt(raw.roleId||roleId,80),
    type:QUESTION_TYPES.has(raw.type)?raw.type:'practical_case',
    prompt:long(raw.prompt,1600),
    evaluates:list(raw.evaluates,6,80).map(x=>x.toLowerCase().replace(/[^a-z_]+/g,'_')).filter(x=>DIMENSIONS.has(x)),
    evidenceFocus:list(raw.evidenceFocus,8,220),
    createdAt:raw.createdAt||new Date().toISOString()
  };
}
function replaceRoleQuestions(d,roleId,questions=[]){
  ensure(d);
  const role=d.roleProfiles.find(x=>x.id===roleId);if(!role)throw new Error('Puesto no encontrado.');
  const clean=(Array.isArray(questions)?questions:[]).slice(0,12).map(q=>sanitizeQuestion(q,roleId)).filter(q=>q.prompt);
  if(clean.length<3)throw new Error('El test necesita al menos 3 preguntas estructuradas.');
  d.roleQuestions=d.roleQuestions.filter(x=>x.roleId!==roleId);
  d.roleQuestions.unshift(...clean);
  d.roleQuestions=d.roleQuestions.slice(0,1000);
  return clean;
}
function listWorkspace(d,{businessId=''}={}){
  ensure(d);
  const roles=d.roleProfiles.filter(x=>!businessId||x.businessId===businessId);
  const roleIds=new Set(roles.map(x=>x.id));
  return {
    roles,
    questions:d.roleQuestions.filter(x=>roleIds.has(x.roleId)),
    assessments:d.roleAssessments.filter(x=>roleIds.has(x.roleId)).slice(0,100),
    personalityAssessments:d.miniIpipAssessments.filter(x=>!businessId||x.businessId===businessId).slice(0,100)
  };
}
function createAssessment(d,{businessId='',employeeId='',roleId='',answers=[]}={}){
  ensure(d);
  const employee=(d.employees||[]).find(x=>x.id===employeeId);if(!employee)throw new Error('Empleado no encontrado.');
  const role=d.roleProfiles.find(x=>x.id===roleId&&(!businessId||!x.businessId||x.businessId===businessId));if(!role)throw new Error('Puesto no encontrado.');
  const questions=d.roleQuestions.filter(x=>x.roleId===roleId);
  if(questions.length<3)throw new Error('Genera primero el test estructurado del puesto.');
  const byId=new Map((Array.isArray(answers)?answers:[]).map(x=>[String(x.questionId||''),long(x.answer,5000)]));
  const rows=questions.map(q=>({
    questionId:q.id,type:q.type,prompt:q.prompt,evaluates:q.evaluates,evidenceFocus:q.evidenceFocus,
    answer:byId.get(q.id)||''
  }));
  if(rows.filter(x=>x.answer).length<Math.min(3,rows.length))throw new Error('Responde al menos 3 preguntas antes de analizar.');
  const a={
    id:id('assessment'),businessId:txt(businessId||role.businessId,120),employeeId:employee.id,employeeName:employee.name,
    employeeCode:employee.employeeCode||'',roleId:role.id,roleName:role.name,roleSnapshot:{name:role.name,description:role.description,requirements:role.requirements,priorities:role.priorities},
    answers:rows,submittedAt:new Date().toISOString(),analysis:null
  };
  d.roleAssessments.unshift(a);d.roleAssessments=d.roleAssessments.slice(0,500);
  return a;
}
function saveAnalysis(d,assessmentId,analysis={}){
  ensure(d);
  const a=d.roleAssessments.find(x=>x.id===assessmentId);if(!a)throw new Error('Evaluación no encontrada.');
  a.analysis={...analysis,generatedAt:new Date().toISOString(),sourceRule:'Análisis limitado a CV profesional, confirmaciones de Dirección, respuestas del test, autoinforme Mini-IPIP cuando exista y evidencia operativa registrada. El Mini-IPIP es contexto complementario de bajo peso: no decide, no es una prueba de CI ni un diagnóstico psicológico.'};
  return a;
}
function getAssessmentBundle(d,assessmentId){
  ensure(d);
  const assessment=d.roleAssessments.find(x=>x.id===assessmentId);if(!assessment)throw new Error('Evaluación no encontrada.');
  const employee=(d.employees||[]).find(x=>x.id===assessment.employeeId)||null;
  return {assessment,employee};
}
function fallbackQuestions(role){
  const req=(role.requirements||[]).slice(0,4);
  const first=req[0]||'resolver las responsabilidades principales del puesto';
  const second=req[1]||'priorizar correctamente';
  return [
    {type:'practical_case',prompt:'Te asignan una situación crítica relacionada con '+first+'. Explica qué harías primero, qué información comprobarías y cómo decidirías el siguiente paso.',evaluates:['reasoning','problem_solving','decision_quality'],evidenceFocus:['secuencia de actuación','comprobación de datos','criterio de decisión']},
    {type:'practical_case',prompt:'Tienes varias tareas urgentes del puesto y no puedes terminarlas todas a la vez. Ordénalas y explica qué criterio utilizarías para priorizar.',evaluates:['prioritization','reasoning'],evidenceFocus:['impacto','urgencia','dependencias','riesgo']},
    {type:'structured_interview',prompt:'Cuéntame un error profesional o una decisión que hoy harías de otra manera. ¿Qué aprendiste y qué cambiaste después?',evaluates:['learning','reasoning'],evidenceFocus:['aprendizaje concreto','cambio de conducta','responsabilidad profesional']},
    {type:'practical_case',prompt:'Necesitas la colaboración de otra persona o departamento para resolver un problema y esa persona está saturada. ¿Cómo lo gestionarías?',evaluates:['communication','perspective_taking','collaboration'],evidenceFocus:['claridad','respeto','coordinación','alternativas']},
    {type:'role_knowledge',prompt:'¿Qué información y comprobaciones consideras imprescindibles antes de ejecutar una decisión importante en este puesto?',evaluates:['role_knowledge','decision_quality'],evidenceFocus:['conocimiento del puesto','controles','riesgos']},
    {type:'structured_interview',prompt:'Describe una situación en la que tuviste que resolver un problema con información incompleta. ¿Cómo evitaste asumir datos que no conocías?',evaluates:['problem_solving','autonomy','reasoning'],evidenceFocus:['preguntas de aclaración','gestión de incertidumbre','autonomía responsable']},
    {type:'practical_case',prompt:'Imagina que un compañero defiende una solución distinta a la tuya sobre '+second+'. ¿Cómo contrastarías ambas opciones antes de decidir?',evaluates:['perspective_taking','collaboration','decision_quality'],evidenceFocus:['escucha','contraste de evidencia','decisión compartida']}
  ];
}

const MINI_IPIP_ITEMS=Object.freeze([
  {id:1,factor:'E',reverse:false,text:'Soy el alma de la fiesta'},
  {id:2,factor:'A',reverse:false,text:'Soy sensible hacia las emociones de otros'},
  {id:3,factor:'C',reverse:false,text:'Realizo mis tareas inmediatamente'},
  {id:4,factor:'N',reverse:false,text:'Tengo frecuentes cambios de ánimo'},
  {id:5,factor:'O',reverse:false,text:'Tengo mucha imaginación'},
  {id:6,factor:'E',reverse:true,text:'No hablo mucho'},
  {id:7,factor:'A',reverse:true,text:'No me interesan los problemas de otras personas'},
  {id:8,factor:'C',reverse:true,text:'A menudo olvido poner las cosas en su lugar'},
  {id:9,factor:'N',reverse:true,text:'Estoy relajado la mayor parte del tiempo'},
  {id:10,factor:'O',reverse:true,text:'No estoy interesado en las ideas abstractas'},
  {id:11,factor:'E',reverse:false,text:'En las fiestas hablo con muchas personas'},
  {id:12,factor:'A',reverse:false,text:'Siento las emociones de los otros'},
  {id:13,factor:'C',reverse:false,text:'Me gusta el orden'},
  {id:14,factor:'N',reverse:false,text:'Me molesto fácilmente'},
  {id:15,factor:'O',reverse:true,text:'Tengo dificultad para entender ideas abstractas'},
  {id:16,factor:'E',reverse:true,text:'Prefiero pasar desapercibido'},
  {id:17,factor:'A',reverse:true,text:'En realidad no estoy interesado en los demás'},
  {id:18,factor:'C',reverse:true,text:'Soy desordenado'},
  {id:19,factor:'N',reverse:true,text:'Rara vez me siento triste'},
  {id:20,factor:'O',reverse:true,text:'No tengo buena imaginación'}
]);
const MINI_IPIP_FACTOR_LABELS=Object.freeze({E:'Extraversión',A:'Amabilidad / orientación interpersonal',C:'Responsabilidad / organización',N:'Neuroticismo (autoinforme)',O:'Apertura / imaginación'});
function miniIpipDefinition(){
  return {
    name:'Mini-IPIP español · 20 ítems',version:'Martínez-Molina & Arias (2018), adaptación española del Mini-IPIP de Donnellan et al. (2006)',
    responseScale:[{value:1,label:'Nada de acuerdo'},{value:2,label:'Algo de acuerdo'},{value:3,label:'Medio acuerdo'},{value:4,label:'Mucho acuerdo'},{value:5,label:'Total acuerdo'}],
    items:MINI_IPIP_ITEMS.map(x=>({...x})),
    notice:'Autoinforme voluntario de personalidad Big Five. No es diagnóstico clínico, no mide CI y no debe usarse por sí solo para contratar, despedir, promocionar, ordenar o reasignar personas.',
    scoringNote:'Las puntuaciones son medias 1–5 con ítems inversos corregidos. No se aplican percentiles ni puntos de corte normativos automáticos.'
  };
}
function miniIpipScore(responses=[]){
  const map=new Map();
  if(Array.isArray(responses))for(const x of responses)map.set(Number(x?.itemId||x?.id),Number(x?.value));
  else if(responses&&typeof responses==='object')for(const [k,v] of Object.entries(responses))map.set(Number(k),Number(v));
  const missing=MINI_IPIP_ITEMS.filter(x=>!Number.isFinite(map.get(x.id))||map.get(x.id)<1||map.get(x.id)>5).map(x=>x.id);
  if(missing.length)throw new Error('Completa los 20 ítems Mini-IPIP antes de guardar. Faltan: '+missing.join(', '));
  const raw={E:[],A:[],C:[],N:[],O:[]};
  const scored=MINI_IPIP_ITEMS.map(item=>{
    const response=map.get(item.id),score=item.reverse?6-response:response;
    raw[item.factor].push(score);return {itemId:item.id,response,score,factor:item.factor,reverse:item.reverse};
  });
  const mean=a=>Math.round((a.reduce((s,n)=>s+n,0)/a.length)*100)/100;
  const factors={};for(const key of Object.keys(raw))factors[key]={label:MINI_IPIP_FACTOR_LABELS[key],mean:mean(raw[key]),scale:'1-5'};
  factors.emotionalStability={label:'Estabilidad emocional (inversa de neuroticismo)',mean:Math.round((6-factors.N.mean)*100)/100,scale:'1-5'};
  return {factors,scored,complete:true,normReference:false};
}
function saveMiniIpip(d,{businessId='',employeeId='',roleId='',responses=[],consent=false}={}){
  ensure(d);if(consent!==true)throw new Error('El Mini-IPIP requiere consentimiento explícito de la persona que responde.');
  const employee=(d.employees||[]).find(x=>x.id===employeeId);if(!employee)throw new Error('Empleado no encontrado.');
  const role=roleId?(d.roleProfiles||[]).find(x=>x.id===roleId):null;
  const score=miniIpipScore(responses),record={
    id:id('miniipip'),businessId:txt(businessId||employee.businessId,120),employeeId:employee.id,employeeName:employee.name,employeeCode:employee.employeeCode||'',
    roleId:role?.id||'',roleName:role?.name||'',submittedAt:new Date().toISOString(),consent:true,score,
    weightPolicy:'supplemental_low',decisionRule:'No usar como filtro automático. Interpretar solo como autoinforme complementario junto a prueba de puesto, entrevista estructurada y evidencia operativa.'
  };
  d.miniIpipAssessments.unshift(record);d.miniIpipAssessments=d.miniIpipAssessments.slice(0,500);return record;
}
function latestMiniIpip(d,employeeId){ensure(d);return d.miniIpipAssessments.find(x=>x.employeeId===employeeId)||null}

module.exports={QUESTION_TYPES,DIMENSIONS,MINI_IPIP_ITEMS,ensure,sanitizeRoleProfile,saveRoleProfile,sanitizeQuestion,replaceRoleQuestions,listWorkspace,createAssessment,saveAnalysis,getAssessmentBundle,fallbackQuestions,miniIpipDefinition,miniIpipScore,saveMiniIpip,latestMiniIpip};
