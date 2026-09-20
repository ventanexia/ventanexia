export const VNX_PRICING={
  start:{name:"VNX Inicio",monthly:99,listMonthly:99,agents:12,integrations:3,devices:1,workUnits:1500},
  core:{name:"VNX Negocio",monthly:249,listMonthly:249,agents:12,integrations:8,devices:3,workUnits:5000},
  scale:{name:"VNX Empresa",monthly:499,listMonthly:499,agents:12,integrations:15,devices:5,workUnits:12000}
};
export const EXTRA_DEVICE_MONTHLY_EUR=49;
export function deviceLimitForPlan(planKey){return VNX_PRICING[planKey]?.devices||1}
export function recommendPlan(blueprint={}){
  const volume=Number(blueprint?.monthlyTasks||blueprint?.estimatedTasks||0)||0;
  const integrations=Array.isArray(blueprint?.integrations)?blueprint.integrations.length:Number(blueprint?.integrations||0)||0;
  const key=volume>5000||integrations>8?"scale":volume>1500||integrations>3?"core":"start";
  const p=VNX_PRICING[key];
  return {key,name:p.name,monthly:p.monthly,listMonthly:p.listMonthly,agents:"Todos los asistentes estándar",integrations:p.integrations,devices:p.devices,workUnits:p.workUnits,extraDeviceMonthly:EXTRA_DEVICE_MONTHLY_EUR,reason:"Recomendamos por volumen, usuarios, conexiones y dispositivos; todos los planes incluyen el equipo estándar."};
}
