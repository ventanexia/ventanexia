import crypto from "node:crypto";
import {signContract} from "../../lib/contract-token.js";

const PLANS={
  inicio:{name:"VNX Inicio",price:350,slots:3},
  crecimiento:{name:"VNX Crecimiento",price:900,slots:6},
  empresa:{name:"VNX Premium",price:1750,slots:999}
};
const EXTRA_PRICES={buscador:144,whatsapp:114,email:90,agenda:90,atencion:114,presupuestos:132,redes:108,informes:102,seo:114,administracion:132,automatizacion:144,voz:210,conexion:42,coordinacion:108};
const STANDARD=new Set(["buscador","whatsapp","email","agenda","atencion","presupuestos","redes","informes","seo","administracion","automatizacion","voz"]);
function clean(v,max=1000){return String(v||"").trim().slice(0,max)}
function uniq(arr){return [...new Set(Array.isArray(arr)?arr:[])]}
async function sendEvidenceEmail(payload){
  const key=process.env.RESEND_API_KEY;
  const from=process.env.CONTRACT_FROM_EMAIL||"presupuestos@ventanexia.es";
  const internal=process.env.CONTRACT_REVIEW_EMAIL||"ventas@ventanexia.es";
  if(!key) return false;
  const subject=`Contrato aceptado · ${payload.contractId} · ${payload.company}`;
  const lines=[
    `Contrato: ${payload.contractId}`,
    `Fecha UTC: ${payload.acceptedAt}`,
    `Firmante: ${payload.signer}`,
    `Empresa: ${payload.company}`,
    `NIF/CIF: ${payload.taxid}`,
    `Email: ${payload.email}`,
    `Plan: ${payload.planName}`,
    `Incluidos: ${payload.included.join(", ")||"—"}`,
    `Extras: ${payload.extras.join(", ")||"—"}`,
    `Total: ${payload.total} €/mes + IVA`,
    `Duración mínima: ${payload.minMonths} meses`,
    `Versión contractual: ${payload.version}`
  ].join("\n");
  const to=[internal,payload.email].filter(Boolean);
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to,subject,text:lines})});
  return r.ok;
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const b=req.body||{};
  const plan=clean(b.plan,40);
  const p=PLANS[plan];
  if(!p) return res.status(400).json({error:"Plan no válido"});
  const signer=clean(b.signer,200),company=clean(b.company,250),taxid=clean(b.taxid,80),email=clean(b.email,320).toLowerCase();
  if(!signer||!company||!taxid||!email||b.accepted!==true) return res.status(400).json({error:"Faltan datos de aceptación"});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Email no válido"});
  let included=uniq(b.included).filter(x=>STANDARD.has(x));
  let extras=uniq(b.extras).filter(x=>Object.hasOwn(EXTRA_PRICES,x));
  if(plan==="empresa"){included=[...STANDARD];extras=extras.filter(x=>x==="conexion");}
  else included=included.slice(0,p.slots);
  if(plan==="crecimiento") extras=extras.filter(x=>x!=="coordinacion");
  extras=extras.filter(x=>!included.includes(x));
  const total=p.price+extras.reduce((s,k)=>s+EXTRA_PRICES[k],0);
  const minMonths=Math.max(1,Math.min(24,Number(process.env.MINIMUM_TERM_MONTHS||3)||3));
  const payload={
    contractId:`VNX-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
    version:"2026-09-17-v1",
    acceptedAt:new Date().toISOString(),signer,company,taxid,email,plan,planName:p.name,included,extras,total,minMonths
  };
  let token;
  try{token=signContract(payload)}catch(e){return res.status(503).json({error:"Firma contractual no configurada"})}
  try{await sendEvidenceEmail(payload)}catch{}
  return res.status(200).json({ok:true,token,contract:payload});
}
