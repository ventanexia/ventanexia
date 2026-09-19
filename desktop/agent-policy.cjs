const {EDITION}=require('./edition.generated.cjs');

const AGENT_CATALOG=[
  {key:'core_ai',icon:'🧠',name:'Asistente IA',entitlement:null,requires:null},
  {key:'email',icon:'✉️',name:'Email y bandeja',entitlement:'email',requires:'email'},
  {key:'whatsapp',icon:'💬',name:'WhatsApp',entitlement:'whatsapp',requires:null},
  {key:'prospecting',icon:'🎯',name:'Buscar clientes',entitlement:'buscador',requires:null},
  {key:'crm',icon:'🤝',name:'Ventas y clientes',entitlement:'crm',requires:null},
  {key:'customer_service',icon:'🎧',name:'Atención al cliente',entitlement:'atencion',requires:null},
  {key:'quotes',icon:'🧾',name:'Presupuestos y ofertas',entitlement:'presupuestos',requires:null},
  {key:'orders',icon:'📦',name:'Pedidos',entitlement:'pedidos',requires:null},
  {key:'social',icon:'📣',name:'Redes y publicidad',entitlement:'redes',requires:null},
  {key:'web_ecommerce',icon:'🌐',name:'Web y tienda',entitlement:'web_ecommerce',requires:'web'},
  {key:'administration',icon:'🗂️',name:'Administración y agenda',entitlement:'administracion',requires:null},
  {key:'reports',icon:'📊',name:'Informes y resultados',entitlement:'informes',requires:null},
  {key:'automation',icon:'⚙️',name:'Tareas automáticas',entitlement:'automatizacion',requires:null}
];

function cleanPlan(plan=''){return String(plan||'').trim().toLowerCase()}
function purchasedFeatures(license={}){
  const p=license?.featurePolicy||{};
  return new Set([...(p.purchased_included||[]),...(p.purchased_extras||[])].map(x=>String(x||'').trim().toLowerCase()).filter(Boolean));
}
function isMaster(license={},edition=EDITION){return cleanPlan(edition)==='master'||cleanPlan(license?.plan)==='master'||cleanPlan(license?.edition)==='master'}
function standardPremiumPlan(license={}){
  return ['scale','empresa','premium'].includes(cleanPlan(license?.plan));
}
function isAgentIncluded(license={},agentKey,edition=EDITION){
  const a=AGENT_CATALOG.find(x=>x.key===agentKey);if(!a)return false;
  if(isMaster(license,edition)||!a.entitlement)return true;
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
function isModuleIncluded(license={},module='',edition=EDITION){
  if(isMaster(license,edition))return true;
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
