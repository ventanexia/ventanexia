export const VNX_PRICING={
  start:{monthly:350,agents:3,integrations:2,devices:1},
  core:{monthly:900,agents:6,integrations:5,devices:3},
  scale:{monthly:1750,agents:12,integrations:10,devices:5}
};
export const EXTRA_DEVICE_MONTHLY_EUR=49;
export function deviceLimitForPlan(planKey){
  return VNX_PRICING[planKey]?.devices||1;
}
export function recommendPlan(blueprint={}){
  const agents=Array.isArray(blueprint.agents)?new Set(blueprint.agents.map(x=>String(x).toLowerCase())).size:0;
  const integrations=Array.isArray(blueprint.integrations_required)?blueprint.integrations_required.length:0;
  const complexity=String(blueprint.complexity||"").toLowerCase();
  let key="start";
  if(agents>3||integrations>2||complexity==="media") key="core";
  if(agents>6||integrations>5||complexity==="alta") key="scale";
  const p=VNX_PRICING[key];
  const names={start:"VNX Inicio",core:"VNX Crecimiento",scale:"VNX Premium"};
  const exceedsScale=agents>12||integrations>10;
  return {
    key,name:names[key],monthly:p.monthly,
    includedAgents:p.agents,includedIntegrations:p.integrations,includedDevices:p.devices,
    extraDeviceMonthly:EXTRA_DEVICE_MONTHLY_EUR,
    detectedAgents:agents,detectedIntegrations:integrations,
    exceedsScale,
    reason:exceedsScale
      ?"Tu caso necesita más capacidad de la incluida de serie. Empezamos por VNX Premium y revisamos contigo la ampliación necesaria antes de contratar nada extra."
      :"Este plan encaja con la cantidad de tareas y programas que quieres que VentaNexIA lleve por ti."
  };
}
