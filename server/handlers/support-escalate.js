function clean(v,n=8000){return String(v||"").trim().slice(0,n)}
async function sendMail({to,subject,text}){
  const key=process.env.RESEND_API_KEY;if(!key)throw new Error("EMAIL_NOT_CONFIGURED");
  const from=process.env.SUPPORT_FROM_EMAIL||process.env.BILLING_FROM_EMAIL||"soporte@ventanexia.es";
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject,text})});
  if(!r.ok)throw new Error("EMAIL_SEND_FAILED");
  return true;
}
export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  try{
    const customerId=clean(req.body?.customerId,100),deviceId=clean(req.body?.deviceId,150),version=clean(req.body?.version,60);
    const summary=clean(req.body?.summary,12000),checks=Array.isArray(req.body?.checks)?req.body.checks.slice(0,80):[];
    if(!customerId)return res.status(400).json({error:"Falta el cliente"});
    const target=process.env.SUPPORT_TEAM_EMAIL||"ventas@ventanexia.es";
    const safeChecks=checks.map(x=>({
      name:clean(x?.name,180),ok:Boolean(x?.ok),detail:clean(x?.detail,500)
    }));
    const text=[
      "INCIDENCIA AUTOMÁTICA VENTANEXIA",
      "",
      "Cliente: "+customerId,
      "Equipo: "+(deviceId||"sin identificar"),
      "Versión: "+(version||"desconocida"),
      "Fecha: "+new Date().toISOString(),
      "",
      "Resumen:",
      summary||"VentaNexIA no pudo reparar automáticamente el problema.",
      "",
      "Comprobaciones:",
      ...safeChecks.map(x=>(x.ok?"OK":"FALLO")+" · "+x.name+(x.detail?" · "+x.detail:"")),
      "",
      "No se incluyen contraseñas, tokens ni contenido de archivos del cliente.",
      "Si requiere intervención humana, contactar con el cliente para solicitar acceso remoto mediante el procedimiento autorizado."
    ].join("\n");
    await sendMail({to:target,subject:"VentaNexIA · asistencia necesaria · "+customerId,text});
    return res.status(200).json({ok:true,message:"Hemos avisado al equipo de soporte. Te contactaremos si hace falta acceso remoto."});
  }catch(e){
    return res.status(503).json({error:"No se pudo avisar al equipo de soporte"});
  }
}
