export const VNX_PRICING={
  start:{monthly:350,agents:3,integrations:2},
  core:{monthly:900,agents:6,integrations:5},
  scale:{monthly:1750,agents:12,integrations:10},
  enterprise:{monthlyFrom:1750,agents:Infinity,integrations:Infinity}
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
  const names={start:"VNX Inicio",core:"VNX Crecimiento",scale:"VNX Empresa",enterprise:"VNX Empresa"};
  return {
    key,name:names[key],
    monthly:p.monthly||null,monthlyFrom:p.monthlyFrom||null,
    includedAgents:Number.isFinite(p.agents)?p.agents:null,
    includedIntegrations:Number.isFinite(p.integrations)?p.integrations:null,
    detectedAgents:agents,detectedIntegrations:integrations,
    reason:`Recomendado por ${agents} agentes, ${integrations} integraciones y complejidad ${blueprint.complexity||"por validar"}.`
  };
}
