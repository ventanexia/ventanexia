const EDITION='master';

const AGENT_CATALOG=[
  {key:'core_ai',icon:'🧠',name:'Asistente IA',entitlement:null,requires:null},
  {key:'prospecting',icon:'🎯',name:'Captación y búsqueda de clientes',entitlement:'buscador',requires:'prospecting'},
  {key:'whatsapp',icon:'💬',name:'WhatsApp Business',entitlement:'whatsapp',requires:'whatsapp'},
  {key:'email',icon:'📧',name:'Email',entitlement:'email',requires:'email'},
  {key:'agenda',icon:'📅',name:'Agenda y seguimiento',entitlement:'agenda',requires:null},
  {key:'customer_service',icon:'🎧',name:'Atención al cliente',entitlement:'atencion',requires:null},
  {key:'quotes',icon:'🧾',name:'Presupuestos',entitlement:'presupuestos',requires:null},
  {key:'social',icon:'📣',name:'Redes sociales',entitlement:'redes',requires:'social'},
  {key:'reports',icon:'📊',name:'Informes',entitlement:'informes',requires:null},
  {key:'seo',icon:'🔍',name:'SEO y visibilidad',entitlement:'seo',requires:null},
  {key:'administration',icon:'🗂️',name:'Administración',entitlement:'administracion',requires:null},
  {key:'automation',icon:'⚙️',name:'Automatizaciones',entitlement:'automatizacion',requires:null},
  {key:'voice',icon:'☎️',name:'Secretaria con voz',entitlement:'voz',requires:null},
  {key:'crm',icon:'👥',name:'CRM y clientes',entitlement:'crm',requires:'crm'},
  {key:'web_ecommerce',icon:'🌐',name:'Web & Ecommerce',entitlement:'web_ecommerce',requires:'web'}
];

function cleanPlan(plan=''){return String(plan||'').trim().toLowerCase()}
function purchasedFeatures(license={}){
  const p=license?.featurePolicy||{};
  return new Set([...(p.purchased_included||[]),...(p.purchased_extras||[])].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean));
}
function isMaster(license={}){return EDITION==='master'||cleanPlan(license?.plan)==='master'||cleanPlan(license?.edition)==='master'}
function standardPremiumPlan(license={}){
  return ['scale','empresa','premium'].includes(cleanPlan(license?.plan));
}
function isAgentIncluded(license={},agentKey){
  const a=AGENT_CATALOG.find(x=>x.key===agentKey);if(!a)return false;
  if(isMaster(license)||!a.entitlement)return true;
  const purchased=purchasedFeatures(license);
  if(purchased.has(a.entitlement))return true;
  if(standardPremiumPlan(license)&&!['crm','web_ecommerce'].includes(a.entitlement))return true;
  return false;
}
function assertAgentIncluded(license={},agentKey){
  if(isAgentIncluded(license,agentKey))return true;
  const a=AGENT_CATALOG.find(x=>x.key===agentKey);
  const err=new Error('Este agente no está incluido en tu plan actual. Puedes verlo, pero para usarlo debes contratarlo o cambiar de plan.');
  err.code='AGENT_NOT_INCLUDED';err.agentKey=agentKey;err.entitlement=a?.entitlement||null;throw err;
}
function moduleEntitlement(module=''){
  const m=String(module||'').trim().toLowerCase();
  if(m==='email')return 'email';
  if(m==='whatsapp')return 'whatsapp';
  if(m==='social')return 'redes';
  if(m==='prospecting')return 'buscador';
  if(m==='crm')return 'crm';
  if(m==='shopify'||m==='wordpress'||m==='github_vercel'||m==='web_ecommerce')return 'web_ecommerce';
  return m||null;
}
function isModuleIncluded(license={},module=''){
  if(isMaster(license))return true;
  const ent=moduleEntitlement(module);if(!ent)return false;
  const purchased=purchasedFeatures(license);
  if(purchased.has(ent))return true;
  if(standardPremiumPlan(license)&&!['crm','web_ecommerce'].includes(ent))return true;
  return false;
}
function assertModuleIncluded(license={},module=''){
  if(isModuleIncluded(license,module))return true;
  const err=new Error('Esta conexión pertenece a un agente que no está incluido en tu plan actual.');
  err.code='FEATURE_NOT_INCLUDED';err.module=module;err.entitlement=moduleEntitlement(module);throw err;
}
module.exports={EDITION,AGENT_CATALOG,isMaster,isAgentIncluded,assertAgentIncluded,isModuleIncluded,assertModuleIncluded,moduleEntitlement,purchasedFeatures};
