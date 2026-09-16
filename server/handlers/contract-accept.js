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
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function contractHtml(p){
  const inc=p.included.length?p.included.join(", "):"—";
  const ext=p.extras.length?p.extras.join(", "):"—";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Contrato ${esc(p.contractId)}</title><style>body{font-family:Arial,sans-serif;color:#111;line-height:1.55;max-width:900px;margin:40px auto;padding:0 24px}h1{margin-bottom:4px}.box{border:1px solid #bbb;padding:14px;margin:18px 0}.small{font-size:12px;color:#555}</style></head><body><h1>Contrato de prestación de servicios VentaNexIA</h1><p class="small">Versión ${esc(p.version)} · ID ${esc(p.contractId)}</p><div class="box"><b>Pedido asociado</b><br>Empresa: ${esc(p.company)} · NIF/CIF: ${esc(p.taxid)}<br>Firmante: ${esc(p.signer)} · Email: ${esc(p.email)}<br>Plan: ${esc(p.planName)}<br>Incluidos: ${esc(inc)}<br>Extras: ${esc(ext)}<br>Precio: ${esc(p.total)} €/mes + IVA<br>Duración mínima: 12 meses desde la aceptación<br>Preaviso de cancelación: 30 días</div><p>El cliente declara haber leído y aceptado íntegramente las condiciones contractuales mostradas antes del pago, incluida la delimitación de responsabilidades entre VentaNexIA, el cliente y los proveedores terceros; las limitaciones propias de sistemas de inteligencia artificial; la ausencia de garantía de disponibilidad absoluta; el régimen de soporte; y las condiciones de duración, renovación y cancelación.</p><p>Fecha de aceptación: ${esc(p.acceptedAt)}</p><p>La aceptación electrónica queda vinculada criptográficamente a este pedido mediante el identificador contractual indicado.</p></body></html>`;
}
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
    `Duración mínima: 12 meses desde la aceptación`,
    `Preaviso de cancelación: 30 días`,
    `Versión contractual: ${payload.version}`
  ].join("\n");
  const html=contractHtml(payload);
  const to=[internal,payload.email].filter(Boolean);
  const r=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      from,to,subject,text:lines,
      attachments:[{filename:`Contrato-${payload.contractId}.html`,content:Buffer.from(html,"utf8").toString("base64")}]
    })
  });
  return r.ok;
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const b=req.body||{};
  const plan=clean(b.plan,40);
  const p=PLANS[plan];
  if(!p) return res.status(400).json({error:"Plan no válido"});
  const signer=clean(b.signer,200),company=clean(b.company,250),taxid=clean(b.taxid,80),email=clean(b.email,320).toLowerCase();
  if(!signer||!company||!taxid||!email||b.accepted!==true||b.authority!==true) return res.status(400).json({error:"Faltan datos de aceptación"});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Email no válido"});
  let included=uniq(b.included).filter(x=>STANDARD.has(x));
  let extras=uniq(b.extras).filter(x=>Object.hasOwn(EXTRA_PRICES,x));
  if(plan==="empresa"){included=[...STANDARD];extras=extras.filter(x=>x==="conexion");}
  else included=included.slice(0,p.slots);
  if(plan==="crecimiento") extras=extras.filter(x=>x!=="coordinacion");
  extras=extras.filter(x=>!included.includes(x));
  const total=p.price+extras.reduce((s,k)=>s+EXTRA_PRICES[k],0);
  const payload={
    contractId:`VNX-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
    version:"2026-09-17-v2",
    acceptedAt:new Date().toISOString(),signer,company,taxid,email,plan,planName:p.name,included,extras,total,
    minMonths:12,noticeDays:30,authorityConfirmed:true
  };
  let token;
  try{token=signContract(payload)}catch(e){return res.status(503).json({error:"Firma contractual no configurada"})}
  let evidenceEmailSent=false;
  try{evidenceEmailSent=await sendEvidenceEmail(payload)}catch{}
  return res.status(200).json({ok:true,token,contract:payload,evidenceEmailSent,contractDocument:contractHtml(payload)});
}
