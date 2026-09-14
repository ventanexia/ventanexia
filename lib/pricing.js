export const VNX_PRICING={
  start:{monthly:490,setup:790,agents:3,integrations:2},
  core:{monthly:990,setup:1490,agents:6,integrations:5},
  scale:{monthly:1990,setup:2990,agents:12,integrations:10},
  enterprise:{monthlyFrom:3990,setup:"custom",agents:Infinity,integrations:Infinity}
};
export function recommendPlan(blueprint={}){
  const agents=Array.isArray(blueprint.agents)?new Set(blueprint.agents.map(x=>String(x).toLowerCase())).size:0;
  const integrations=Array.isArray(blueprint.integrations_required)?blueprint.integrations_required.length:0;
  const complexity=String(blueprint.complexity||"").toLowerCase();
  let key="start";
  if(agents>3||integrations>2||complexity==="media") key="core";
  if(agents>6||integrations>5||complexity==="alta") key="scale";
  if(agents>12||integrations>10) key="enterprise";
  const p=VNX_PRICING[key];
  return {
    key,name:`VNX ${key[0].toUpperCase()+key.slice(1)}`,
    monthly:p.monthly||null,monthlyFrom:p.monthlyFrom||null,setup:p.setup,
    includedAgents:Number.isFinite(p.agents)?p.agents:null,
    includedIntegrations:Number.isFinite(p.integrations)?p.integrations:null,
    detectedAgents:agents,detectedIntegrations:integrations,
    reason:`Recomendado por ${agents} agentes, ${integrations} integraciones y complejidad ${blueprint.complexity||"por validar"}.`
  };
}
