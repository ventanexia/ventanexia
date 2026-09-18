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
  return entitlementIncluded(license,a.entitlement);
}

export function moduleEntitlement(module=""){
  const m=String(module||"").trim().toLowerCase();
  if(m==="email")return "email";
  if(m==="whatsapp")return "whatsapp";
  if(m==="social")return "redes";
  if(m==="prospecting")return "buscador";
  if(m==="crm")return "crm";
  if(["shopify","wordpress","github_vercel","web_ecommerce"].includes(m))return "web_ecommerce";
  return m||null;
}

export function isModuleIncluded(license,module=""){
  if(isMasterPlan(license?.planKey))return true;
  const ent=moduleEntitlement(module);
  if(!ent)return false;
  return entitlementIncluded(license,ent);
}

// "agent:email" -> {type:"agent",key:"email"}; "integration:email" -> {type:"integration",key:"email"}
export function parseScope(scope=""){
  const raw=String(scope||"").trim().toLowerCase();
  const i=raw.indexOf(":");
  if(i<0)return {type:raw,key:""};
  return {type:raw.slice(0,i),key:raw.slice(i+1)};
}
