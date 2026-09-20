export const VNX_PRICING={
  start:{name:"VNX Inicio",monthly:350,listMonthly:350,agents:12,integrations:3,devices:1,workUnits:1500},
  core:{name:"VNX Negocio",monthly:900,listMonthly:900,agents:12,integrations:8,devices:3,workUnits:5000},
  scale:{name:"VNX Premium",monthly:1750,listMonthly:1750,agents:12,integrations:15,devices:5,workUnits:12000}
};
export const EXTRA_DEVICE_MONTHLY_EUR=49;
export function deviceLimitForPlan(planKey){return VNX_PRICING[planKey]?.devices||1}
export function recommendPlan(blueprint={}){
  const volume=Number(blueprint?.monthlyTasks||blueprint?.estimatedTasks||0)||0;
  const integrations=Array.isArray(blueprint?.integrations)?blueprint.integrations.length:Number(blueprint?.integrations||0)||0;
  const key=volume>5000||integrations>8?"scale":volume>1500||integrations>3?"core":"start";
  const p=VNX_PRICING[key];
  return {key,name:p.name,monthly:p.monthly,listMonthly:p.listMonthly,agents:"Todos los asistentes estándar",integrations:p.integrations,devices:p.devices,workUnits:p.workUnits,extraDeviceMonthly:EXTRA_DEVICE_MONTHLY_EUR,reason:"Recomendamos por capacidad de trabajo y conexiones, no por número de asistentes IA."};
}
