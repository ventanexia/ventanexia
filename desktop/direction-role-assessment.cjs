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
    assessments:d.roleAssessments.filter(x=>roleIds.has(x.roleId)).slice(0,100)
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
  a.analysis={...analysis,generatedAt:new Date().toISOString(),sourceRule:'Análisis limitado a CV profesional, confirmaciones de Dirección, respuestas del test y evidencia operativa registrada. No es una prueba de CI ni un diagnóstico psicológico.'};
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

module.exports={QUESTION_TYPES,DIMENSIONS,ensure,sanitizeRoleProfile,saveRoleProfile,sanitizeQuestion,replaceRoleQuestions,listWorkspace,createAssessment,saveAnalysis,getAssessmentBundle,fallbackQuestions};
