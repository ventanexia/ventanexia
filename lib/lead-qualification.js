import {createJevDecision,jevConfigured} from "./jev-client.js";

function clean(v,max=2000){return String(v||"").trim().slice(0,max)}
function bandFor(score){return score>=85?"PRIORITY":score>=70?"QUALIFIED":score>=50?"NURTURE":"LOW_FIT"}
function nextFor(band){
  return band==="PRIORITY"?"Reunión de diagnóstico prioritaria":
    band==="QUALIFIED"?"Completar diagnóstico y proponer reunión":
    band==="NURTURE"?"Seguimiento educativo y revisión posterior":
    "Validar encaje antes de invertir tiempo comercial";
}
function deterministic(input={}){
  const {empresa,necesidad,ticket,volumen,rol,plazo}=input;
  const detail={fit:0,intent:0,value:0,authority:0,timing:0};
  const company=clean(empresa,250);
  const need=clean(necesidad,3000).toLowerCase();
  const role=clean(rol,200).toLowerCase();
  const timing=clean(plazo,100).toLowerCase();
  const ticketValue=Number(ticket||0),volumeValue=Number(volumen||0);
  if(company)detail.fit+=15;
  if(/b2b|empresa|empresas|profesional|distribu|industrial|instalad|cl[ií]nic|software|servicio|comercial|venta|ventas/.test(need))detail.fit+=15;
  if(need.length>=30)detail.intent+=10;
  if(/seguimiento|crm|lead|venta|ventas|comercial|automat|oportunidad|agenda|prospe|respuesta|conversion|captaci[oó]n/.test(need))detail.intent+=15;
  detail.value+=ticketValue>=5000?12:ticketValue>=1500?8:ticketValue>0?4:0;
  detail.value+=volumeValue>=100?8:volumeValue>=30?5:volumeValue>0?2:0;
  detail.authority=/dueñ|ceo|director|gerente|responsable|socio|administrador|fundador/.test(role)?15:role?7:0;
  detail.timing=/ya|ahora|este mes|30|urgente|inmediato/.test(timing)?10:timing?5:0;
  const score=Math.min(100,Object.values(detail).reduce((a,b)=>a+b,0)),band=bandFor(score);
  return {score,band,detail,nextBestAction:nextFor(band),decisionSource:"rules"};
}
function scaled(answer,max){
  const score=Number(answer?.score),confidence=Number(answer?.confidence);
  if(!Number.isFinite(score)||!Number.isFinite(confidence))return null;
  return {value:Math.max(0,Math.min(max,Math.round((score/4)*max))),confidence};
}
export async function qualifyLead(input={}){
  const base=deterministic(input);
  if(!jevConfigured())return base;
  try{
    const result=await createJevDecision({
      state:{
        company:clean(input.empresa,250),
        need:clean(input.necesidad,3000),
        role:clean(input.rol,200),
        timing:clean(input.plazo,100),
        average_ticket_eur:Number(input.ticket||0)||0,
        monthly_volume:Number(input.volumen||0)||0
      },
      questions:{
        fit:{type:"score",instructions:"How well does this lead fit a B2B commercial software/automation customer profile based only on the supplied company and need?",criteria:["No identifiable fit","Weak fit","Some fit","Good fit","Very strong fit"]},
        intent:{type:"score",instructions:"How strong is the lead's concrete buying intent or business pain based only on the supplied need?",criteria:["No intent","Exploratory","Some need","Clear active need","Urgent high intent"]},
        authority:{type:"score",instructions:"How much purchasing or decision authority does the stated role appear to have?",criteria:["No authority indicated","Low influence","Some influence","Decision influencer","Decision maker"]},
        timing:{type:"score",instructions:"How near-term is the stated buying or implementation timing?",criteria:["No timing","Long term","Medium term","Near term","Immediate or urgent"]}
      }
    });
    const fit=scaled(result.answers?.fit,30),intent=scaled(result.answers?.intent,25),authority=scaled(result.answers?.authority,15),timing=scaled(result.answers?.timing,10);
    const dims=[fit,intent,authority,timing];
    if(dims.some(x=>!x)||dims.reduce((a,x)=>a+x.confidence,0)/dims.length<0.45)return {...base,decisionSource:"rules_low_jev_confidence"};
    const detail={fit:fit.value,intent:intent.value,value:base.detail.value,authority:authority.value,timing:timing.value};
    const score=Math.min(100,Object.values(detail).reduce((a,b)=>a+b,0)),band=bandFor(score);
    return {score,band,detail,nextBestAction:nextFor(band),decisionSource:"jev",decisionConfidence:Number((dims.reduce((a,x)=>a+x.confidence,0)/dims.length).toFixed(3)),decisionModel:result.model||"jev-latest"};
  }catch{
    return {...base,decisionSource:"rules_jev_unavailable"};
  }
}
