// Política de agentes por plan. Es el equivalente en servidor de agent-policy.cjs
// de la app de escritorio, para que los límites NO dependan solo del cliente.
// Mantener sincronizado con desktop/agent-policy.cjs.

export const AGENT_CATALOG=[
  {key:"core_ai",entitlement:null},
  {key:"prospecting",entitlement:"buscador"},
  {key:"whatsapp",entitlement:"whatsapp"},
  {key:"email",entitlement:"email"},
  {key:"agenda",entitlement:"agenda"},
  {key:"customer_service",entitlement:"atencion"},
  {key:"quotes",entitlement:"presupuestos"},
  {key:"orders",entitlement:"pedidos"},
  {key:"social",entitlement:"redes"},
  {key:"reports",entitlement:"informes"},
  {key:"seo",entitlement:"seo"},
  {key:"administration",entitlement:"administracion"},
  {key:"automation",entitlement:"automatizacion"},
  {key:"voice",entitlement:"voz"},
  {key:"crm",entitlement:"crm"},
  {key:"web_ecommerce",entitlement:"web_ecommerce"}
];

// Agentes que NO entran en el catálogo estándar de VNX Premium (productos aparte).
const OUTSIDE_STANDARD=new Set(["crm","web_ecommerce"]);

function cleanPlan(plan=""){return String(plan||"").trim().toLowerCase()}

export function purchasedFeatures(policy={}){
  const p=policy&&typeof policy==="object"?policy:{};
  return new Set([...(p.purchased_included||[]),...(p.purchased_extras||[])]
    .map(x=>String(x||"").trim().toLowerCase()).filter(Boolean));
}

export function isMasterPlan(planKey=""){return cleanPlan(planKey)==="master"}

// scale = VNX Premium (clave interna histórica: "empresa")
function isStandardPremium(planKey=""){
  return ["scale","empresa","premium"].includes(cleanPlan(planKey));
}

function entitlementIncluded(license,entitlement){
  if(isMasterPlan(license?.planKey))return true;
  if(!entitlement)return true;
  if(purchasedFeatures(license?.featurePolicy).has(entitlement))return true;
  if(isStandardPremium(license?.planKey)&&!OUTSIDE_STANDARD.has(entitlement))return true;
  return false;
}

export function isAgentIncluded(license,agentKey){
  const a=AGENT_CATALOG.find(x=>x.key===agentKey);
  if(!a)return false;
  // Pedidos está incluido en los tres planes de pago (igual que en desktop/agent-policy.cjs).
  if(agentKey==="orders"&&["start","inicio","core","crecimiento","scale","empresa","premium"].includes(cleanPlan(license?.planKey)))return true;
  return entitlementIncluded(license,a.entitlement);
}

export function moduleEntitlement(module=""){
  const m=String(module||"").trim().toLowerCase();
  if(m==="email")return "email";
  if(m==="whatsapp")return "whatsapp";
  if(m==="social")return "redes";
  if(m==="prospecting")return "buscador";
  if(m==="crm")return "crm";
  if(m==="shopify")return "pedidos";
  if(["wordpress","github_vercel","web_ecommerce"].includes(m))return "web_ecommerce";
  return m||null;
}

export function isModuleIncluded(license,module=""){
  if(isMasterPlan(license?.planKey))return true;
  const ent=moduleEntitlement(module);
  if(!ent)return false;
  if(ent==='pedidos'&&['start','inicio','core','crecimiento','scale','empresa','premium'].includes(cleanPlan(license?.planKey)))return true;
  return entitlementIncluded(license,ent);
}

export function orderChannelLimit(license={}){
  if(isMasterPlan(license?.planKey))return Number.MAX_SAFE_INTEGER;
  const explicit=Number(license?.featurePolicy?.order_channel_limit||0);
  if(explicit>0)return explicit;
  const p=cleanPlan(license?.planKey);
  if(["start","inicio"].includes(p))return 1;
  if(["core","crecimiento"].includes(p))return 2;
  if(["scale","empresa","premium"].includes(p))return 4;
  return 0;
}
export function orderWebLevel(license={}){
  if(isMasterPlan(license?.planKey))return "auto";
  const explicit=String(license?.featurePolicy?.order_web_level||"").toLowerCase();
  if(["basic","pro","auto"].includes(explicit))return explicit;
  const p=cleanPlan(license?.planKey);
  if(["scale","empresa","premium"].includes(p))return "auto";
  if(["core","crecimiento"].includes(p))return "pro";
  if(["start","inicio"].includes(p))return "basic";
  return "basic";
}

export function connectionLimit(license={}){
  if(isMasterPlan(license?.planKey))return Number.MAX_SAFE_INTEGER;
  const explicit=Number(license?.featurePolicy?.connection_limit||0);
  if(explicit>0)return explicit;
  const p=cleanPlan(license?.planKey);
  if(["start","inicio"].includes(p))return 3;
  if(["core","crecimiento"].includes(p))return 8;
  if(["scale","empresa","premium"].includes(p))return 15;
  return 0;
}
export function ownAgentLimit(license={}){
  if(isMasterPlan(license?.planKey))return Number.MAX_SAFE_INTEGER;
  return Math.max(0,Number(license?.featurePolicy?.own_agent_limit||0)||0);
}
export function employeeSlotLimit(license={}){
  if(isMasterPlan(license?.planKey))return Number.MAX_SAFE_INTEGER;
  const explicit=Number(license?.featurePolicy?.employee_slot_limit||0);
  if(explicit>0)return explicit;
  const p=cleanPlan(license?.planKey);
  if(["start","inicio"].includes(p))return 1;
  if(["core","crecimiento"].includes(p))return 2;
  if(["scale","empresa","premium"].includes(p))return 8;
  return 0;
}

// "agent:email" -> {type:"agent",key:"email"}; "integration:email" -> {type:"integration",key:"email"}
export function parseScope(scope=""){
  const raw=String(scope||"").trim().toLowerCase();
  const i=raw.indexOf(":");
  if(i<0)return {type:raw,key:""};
  return {type:raw.slice(0,i),key:raw.slice(i+1)};
}
