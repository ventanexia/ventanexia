export const VNX_PRICING={
  start:{name:"VNX Inicio",monthly:129,listMonthly:129,agents:12,integrations:4,devices:1,workUnits:1500,orderLimit:150,storageGb:5},
  core:{name:"VNX Negocio",monthly:299,listMonthly:299,agents:12,integrations:10,devices:3,workUnits:5000,orderLimit:700,storageGb:20},
  scale:{name:"VNX Empresa",monthly:599,listMonthly:599,agents:12,integrations:18,devices:5,workUnits:12000,orderLimit:2500,storageGb:50}
};
export const EXTRA_DEVICE_MONTHLY_EUR=49;
export function deviceLimitForPlan(planKey){return VNX_PRICING[planKey]?.devices||1}
export function recommendPlan(blueprint={}){
  const volume=Number(blueprint?.monthlyTasks||blueprint?.estimatedTasks||0)||0;
  const integrations=Array.isArray(blueprint?.integrations)?blueprint.integrations.length:Number(blueprint?.integrations||0)||0;
  const key=volume>5000||integrations>10?"scale":volume>1500||integrations>4?"core":"start";
  const p=VNX_PRICING[key];
  return {key,name:p.name,monthly:p.monthly,listMonthly:p.listMonthly,agents:"Todos los asistentes estándar",integrations:p.integrations,devices:p.devices,workUnits:p.workUnits,orderLimit:p.orderLimit,storageGb:p.storageGb,extraDeviceMonthly:EXTRA_DEVICE_MONTHLY_EUR,reason:"Recomendamos por volumen de trabajo, usuarios y capacidad; las conexiones quedan como límite técnico de fondo."};
}
