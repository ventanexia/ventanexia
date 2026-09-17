import crypto from "node:crypto";
import {pdb,hash} from "../../lib/portal-auth.js";

function clean(v,n=2000){return String(v||"").trim().slice(0,n)}
function normPhone(v){return clean(v,40).replace(/[^0-9]/g,"")}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))}
function ascii(v){return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\x20-\x7E]/g,"?")}
function pdfEscape(v){return ascii(v).replace(/([\\()])/g,"\\$1")}
const PUBLIC_ORIGIN="https://www.ventanexia.es";

function makePdf(title,lines=[]){
  const text=[title,"",...lines].slice(0,42);
  let y=790;const ops=["BT","/F1 18 Tf",`50 ${y} Td`,`(${pdfEscape(text[0]||title)}) Tj`,`/F1 10 Tf`];
  for(let i=1;i<text.length;i++){y-=18;ops.push(`0 -18 Td`,`(${pdfEscape(text[i])}) Tj`)}ops.push("ET");
  const stream=ops.join("\n");
  const objects=[
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let out="%PDF-1.4\n",offsets=[0];
  objects.forEach((o,i)=>{offsets[i+1]=Buffer.byteLength(out);out+=`${i+1} 0 obj\n${o}\nendobj\n`});
  const xref=Buffer.byteLength(out);out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=objects.length;i++)out+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`;
  out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out,"binary");
}

async function createPortalAccessUrl(email){
  try{
    if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return `${PUBLIC_ORIGIN}/portal.html`;
    const tenants=await pdb(`vnx_tenants?settings->>owner_email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
    const tenant=tenants?.[0];
    if(!tenant?.id)return `${PUBLIC_ORIGIN}/portal.html`;
    const raw=crypto.randomBytes(32).toString("base64url");
    const expires=new Date(Date.now()+20*60*1000).toISOString();
    await pdb("vnx_portal_login_tokens",{method:"POST",body:JSON.stringify([{
      tenant_id:tenant.id,email_hash:hash(email),token_hash:hash(raw),expires_at:expires
    }])});
    return `${PUBLIC_ORIGIN}/api/portal-login?token=${encodeURIComponent(raw)}`;
  }catch{
    return `${PUBLIC_ORIGIN}/portal.html`;
  }
}

function emailHtml(p,accessUrl){
  const company=esc(p.company||"Empresa de prueba"),plan=esc(p.plan||"Inicio"),task=esc(p.task||"Primera puesta en marcha"),portal=esc(accessUrl||`${PUBLIC_ORIGIN}/portal.html`);
  return `<!doctype html><html><body style="margin:0;background:#eef4f8;font-family:Arial,sans-serif;color:#102335"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef4f8;padding:28px 12px"><tr><td align="center"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#061d32;padding:24px 30px;color:#fff"><div style="font-size:26px;font-weight:800">VentaNexIA</div><div style="font-size:13px;color:#9edfff;margin-top:4px">Tu equipo digital ya está preparado</div></td></tr><tr><td style="padding:30px"><div style="display:inline-block;background:#e8fbf3;color:#12704f;font-weight:700;padding:7px 10px;border-radius:999px;font-size:12px">✓ PRUEBA REAL ENVIADA</div><h1 style="font-size:28px;line-height:1.2;margin:18px 0 10px">Bienvenido a VentaNexIA</h1><p style="font-size:16px;line-height:1.6;color:#40576b">Este es el email que recibiría un cliente después de activar su servicio. Para esta prueba estamos usando los datos que has introducido en la demo.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border:1px solid #d8e6ef;border-radius:12px"><tr><td style="padding:16px;border-bottom:1px solid #e5eef3"><b>Empresa</b></td><td style="padding:16px;border-bottom:1px solid #e5eef3;text-align:right">${company}</td></tr><tr><td style="padding:16px;border-bottom:1px solid #e5eef3"><b>Plan</b></td><td style="padding:16px;border-bottom:1px solid #e5eef3;text-align:right">${plan}</td></tr><tr><td style="padding:16px"><b>Primera tarea</b></td><td style="padding:16px;text-align:right">${task}</td></tr></table><p style="font-size:16px;line-height:1.6">Ya puedes entrar, terminar tus conexiones y empezar a trabajar. En producción, los permisos y conexiones se validan antes de ejecutar acciones externas.</p><p style="margin:26px 0"><a href="${portal}" style="background:#5e35d8;color:white;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px;display:inline-block">Entrar en Mi VentaNexIA →</a></p><p style="font-size:13px;color:#71879a;line-height:1.5">Si tu cuenta ya está activa, este botón utiliza un acceso seguro de un solo uso válido durante 20 minutos. Si todavía no existe una cuenta asociada, te llevará a la pantalla segura de acceso.</p><p style="font-size:13px;color:#71879a;line-height:1.5">Adjuntamos una factura y un contrato de demostración para que puedas comprobar el formato completo del correo. No tienen validez fiscal ni contractual.</p></td></tr><tr><td style="background:#f6f9fb;padding:18px 30px;color:#7890a2;font-size:12px">VentaNexIA · ventas@ventanexia.es · www.ventanexia.es</td></tr></table></td></tr></table></body></html>`;
}

async function sendEmail(p,to){
  const key=process.env.RESEND_API_KEY;if(!key)throw new Error("RESEND_NOT_CONFIGURED");
  const accessUrl=await createPortalAccessUrl(to);
  const contractPdf=makePdf("Contrato DEMO VentaNexIA",[`Empresa: ${p.company||"Empresa de prueba"}`,`Plan: ${p.plan||"Inicio"}`,"Estado: DEMOSTRACION - SIN VALIDEZ CONTRACTUAL","","Objeto: reproducir el documento que recibiria un cliente real."]);
  const invoicePdf=makePdf("Factura DEMO VentaNexIA",[`Cliente: ${p.company||"Empresa de prueba"}`,`Plan: ${p.plan||"Inicio"}`,"Base imponible: 350.00 EUR","IVA: DEMO","Total: DEMO","","DOCUMENTO DE PRUEBA - SIN VALIDEZ FISCAL"]);
  const body={from:process.env.DEMO_FROM_EMAIL||"VentaNexIA <ventas@ventanexia.es>",to:[to],subject:`[PRUEBA] Bienvenido a VentaNexIA · ${p.company||"Tu empresa"}`,html:emailHtml(p,accessUrl),text:`PRUEBA VentaNexIA\nEmpresa: ${p.company||"Empresa de prueba"}\nPlan: ${p.plan||"Inicio"}\nPrimera tarea: ${p.task||"Primera puesta en marcha"}\n\nAcceso: ${accessUrl}\nAdjuntos: contrato y factura DEMO.`,attachments:[{filename:"Contrato-VentaNexIA-DEMO.pdf",content:contractPdf.toString("base64")},{filename:"Factura-VentaNexIA-DEMO.pdf",content:invoicePdf.toString("base64")} ]};
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j?.message||`RESEND_${r.status}`);return {id:j?.id||null};
}

async function sendWhatsapp(p,to){
  const token=process.env.WHATSAPP_ACCESS_TOKEN,phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID;if(!token||!phoneId)throw new Error("WHATSAPP_NOT_CONFIGURED");
  const text=`✅ *VentaNexIA · PRUEBA REAL*\n\nHola. Esta es una prueba del mensaje que recibiría un cliente.\n\nEmpresa: ${clean(p.company,120)||"Empresa de prueba"}\nPlan: ${clean(p.plan,80)||"Inicio"}\nPrimera tarea: ${clean(p.task,500)||"Primera puesta en marcha"}\n\nTu servicio está activo y puedes continuar en: ${PUBLIC_ORIGIN}/portal.html\n\n_Mensaje de demostración._`;
  const url=`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`;
  const r=await fetch(url,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",recipient_type:"individual",to,type:"text",text:{preview_url:false,body:text}})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j?.error?.message||`WHATSAPP_${r.status}`);return {id:j?.messages?.[0]?.id||null};
}

export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Método no permitido"});
  const kind=clean(req.body?.kind,20),email=clean(req.body?.email,320).toLowerCase(),phone=normPhone(req.body?.phone),payload={company:clean(req.body?.company,200),plan:clean(req.body?.plan,100),task:clean(req.body?.task,1000)};
  try{
    if(kind==="email"){
      const allowed=clean(process.env.DEMO_TEST_EMAIL,320).toLowerCase();if(!allowed)return res.status(503).json({error:"Falta configurar DEMO_TEST_EMAIL en Vercel"});if(email!==allowed)return res.status(403).json({error:"Por seguridad, la demo solo puede enviar al email de prueba autorizado"});
      const result=await sendEmail(payload,email);return res.status(200).json({ok:true,kind,to:email,...result});
    }
    if(kind==="whatsapp"){
      const allowed=normPhone(process.env.DEMO_TEST_WHATSAPP);if(!allowed)return res.status(503).json({error:"Falta configurar DEMO_TEST_WHATSAPP en Vercel"});if(phone!==allowed)return res.status(403).json({error:"Por seguridad, la demo solo puede enviar al WhatsApp de prueba autorizado"});
      const result=await sendWhatsapp(payload,phone);return res.status(200).json({ok:true,kind,to:phone,...result});
    }
    return res.status(400).json({error:"Tipo de prueba no válido"});
  }catch(e){return res.status(502).json({error:clean(e?.message||e,500)});}
}
