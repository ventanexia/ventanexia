function clean(v,max=2000){return String(v||"").trim().slice(0,max)}

function scoreLead({empresa,necesidad,ticket,volumen,rol,plazo}){
  const detail={fit:0,intent:0,value:0,authority:0,timing:0};
  const company=clean(empresa,250);
  const need=clean(necesidad,3000).toLowerCase();
  const role=clean(rol,200).toLowerCase();
  const timing=clean(plazo,100).toLowerCase();
  const ticketValue=Number(ticket||0);
  const volumeValue=Number(volumen||0);

  // ICP fit — 30
  if(company) detail.fit+=15;
  if(/b2b|empresa|empresas|profesional|distribu|industrial|instalad|cl[ií]nic|software|servicio|comercial|venta|ventas/.test(need)) detail.fit+=15;

  // Intent / pain — 25
  if(need.length>=30) detail.intent+=10;
  if(/seguimiento|crm|lead|venta|ventas|comercial|automat|oportunidad|agenda|prospe|respuesta|conversion|captaci[oó]n/.test(need)) detail.intent+=15;

  // Economic value — 20
  detail.value += ticketValue>=5000?12:ticketValue>=1500?8:ticketValue>0?4:0;
  detail.value += volumeValue>=100?8:volumeValue>=30?5:volumeValue>0?2:0;

  // Authority — 15
  detail.authority=/dueñ|ceo|director|gerente|responsable|socio|administrador|fundador/.test(role)?15:role?7:0;

  // Timing — 10
  detail.timing=/ya|ahora|este mes|30|urgente|inmediato/.test(timing)?10:timing?5:0;

  const score=Math.min(100,Object.values(detail).reduce((a,b)=>a+b,0));
  const band=score>=85?"PRIORITY":score>=70?"QUALIFIED":score>=50?"NURTURE":"LOW_FIT";
  const nextBestAction=band==="PRIORITY"
    ?"Reunión de diagnóstico prioritaria"
    :band==="QUALIFIED"
      ?"Completar diagnóstico y proponer reunión"
      :band==="NURTURE"
        ?"Seguimiento educativo y revisión posterior"
        :"Validar encaje antes de invertir tiempo comercial";
  return {score,band,detail,nextBestAction};
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  return res.status(200).json(scoreLead(req.body||{}));
}
