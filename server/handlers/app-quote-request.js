import crypto from "crypto";

const clean=(v,max=4000)=>String(v||"").trim().slice(0,max);
const yes=v=>v===true||v==="true"||v===1||v==="1"||v==="on";
const round250=n=>Math.max(250,Math.round(Number(n||0)/250)*250);
const money=n=>new Intl.NumberFormat("es-ES",{maximumFractionDigits:0}).format(Math.round(n))+" €";

const INTERNAL_HOURLY_COST=32;
const CLIENT_HOURLY_RATE=95;
const INTERNAL_RISK=0.12;
const CLIENT_CONTINGENCY=0.10;
const MIN_PROJECT_PRICE=3500;

function estimate(body={}){
  const platforms=Array.isArray(body.platforms)?body.platforms.map(x=>clean(x,30)):[];
  const features=Array.isArray(body.features)?body.features.map(x=>clean(x,40)):[];
  const text=[body.description,body.integrations,body.notes].map(x=>clean(x,6000).toLowerCase()).join(" ");
  let hours=42;
  const work=[{label:"Análisis, arquitectura y definición funcional",hours:18},{label:"Diseño UX/UI base",hours:16},{label:"Preparación, despliegue y documentación",hours:8}];
  const add=(label,h)=>{hours+=h;work.push({label,hours:h})};

  if(platforms.includes("web")) add("Aplicación web / panel web",28);
  if(platforms.includes("ios")) add("Aplicación iPhone/iPad",38);
  if(platforms.includes("android")) add("Aplicación Android",38);
  if(platforms.includes("pwa")) add("PWA / experiencia instalable",18);

  const fmap={
    auth:["Usuarios, registro y recuperación de acceso",18],
    roles:["Roles y permisos",16],
    admin:["Panel de administración",28],
    payments:["Pagos y suscripciones",24],
    ecommerce:["Catálogo, carrito y pedidos",36],
    ai:["Funciones de IA",28],
    chat:["Chat / mensajería",28],
    realtime:["Datos en tiempo real",26],
    maps:["Mapas / geolocalización",20],
    booking:["Agenda / reservas",22],
    notifications:["Notificaciones push / avisos",16],
    email:["Emails transaccionales",12],
    sms:["SMS / WhatsApp transaccional",16],
    files:["Archivos, imágenes o documentos",18],
    reports:["Informes / analítica",20],
    integrations:["Integraciones con sistemas externos",28],
    multilingual:["Multiidioma",14],
    offline:["Uso offline / sincronización",28]
  };
  for(const f of features){if(fmap[f]) add(...fmap[f])}

  if(/marketplace|multi.?vendor|vendedores|proveedores/.test(text)) add("Lógica marketplace / multi-proveedor",40);
  if(/erp|sap|dynamics|odoo|salesforce|hubspot|crm/.test(text)&&!features.includes("integrations")) add("Integración empresarial adicional",28);
  if(/video|stream|videollamada|webrtc/.test(text)) add("Vídeo / streaming / comunicación avanzada",36);
  if(/firma|certific|dni|identidad|kyc/.test(text)) add("Identificación, firma o validación avanzada",28);
  if(/gps|ruta|tracking|seguimiento en tiempo real/.test(text)&&!features.includes("maps")) add("GPS, rutas o seguimiento",28);
  if(/importar|migrar|migraci[oó]n|datos existentes/.test(text)) add("Migración / importación de datos",20);

  const users=Number(body.users||0);
  if(users>10000) add("Arquitectura para alto volumen",26);
  else if(users>1000) add("Optimización para crecimiento",14);

  // QA + project management scale with implementation size.
  const buildHours=hours;
  const qa=Math.max(18,Math.round(buildHours*0.18));
  const pm=Math.max(14,Math.round(buildHours*0.12));
  add("Pruebas, QA y correcciones",qa);
  add("Gestión de proyecto y revisiones",pm);

  const setup=[];
  const recurring=[];
  const addSetup=(label,cost)=>setup.push({label,cost});
  const addRecurring=(label,cost,period="mes")=>recurring.push({label,cost,period});

  addSetup("Dominio / configuración inicial",25);
  addRecurring("Hosting, base de datos y almacenamiento base",60);
  if(platforms.includes("ios")) addRecurring("Cuenta Apple Developer (estimación; confirmar tarifa vigente)",120,"año");
  if(platforms.includes("android")) addSetup("Alta Google Play Console (estimación; confirmar tarifa vigente)",30);
  if(features.includes("ai")) addRecurring("Reserva inicial de consumo de IA/API",120);
  if(features.includes("maps")) addRecurring("Reserva de mapas/geolocalización",60);
  if(features.includes("email")) addRecurring("Email transaccional",25);
  if(features.includes("sms")) addRecurring("Reserva SMS/WhatsApp transaccional",60);
  if(features.includes("files")) addRecurring("Almacenamiento adicional",30);
  if(features.includes("integrations")) addRecurring("Reserva para APIs/licencias externas",75);

  const setupCost=setup.reduce((s,x)=>s+x.cost,0);
  const monthlyCost=recurring.filter(x=>x.period==="mes").reduce((s,x)=>s+x.cost,0);
  const annualCost=recurring.filter(x=>x.period==="año").reduce((s,x)=>s+x.cost,0);
  const internalLabor=hours*INTERNAL_HOURLY_COST;
  const internalBase=internalLabor+setupCost;
  const internalRisk=Math.round(internalBase*INTERNAL_RISK);
  const internalProjectCost=internalBase+internalRisk;

  const clientLabor=hours*CLIENT_HOURLY_RATE;
  const clientSetup=setupCost*1.25;
  const clientBase=clientLabor+clientSetup;
  const contingency=Math.round(clientBase*CLIENT_CONTINGENCY);
  const clientPrice=round250(Math.max(MIN_PROJECT_PRICE,clientBase+contingency));
  const grossMargin=clientPrice-internalProjectCost;
  const grossMarginPct=clientPrice?Math.round((grossMargin/clientPrice)*100):0;
  const weeks=Math.max(3,Math.ceil(hours/28*1.15));

  return {hours,weeks,work,setup,recurring,setupCost,monthlyCost,annualCost,internalLabor,internalRisk,internalProjectCost,clientLabor,clientSetup,contingency,clientPrice,grossMargin,grossMarginPct};
}

function clientBreakdown(q){
  const design=Math.round(q.clientLabor*0.18);
  const development=Math.round(q.clientLabor*0.55);
  const qa=Math.round(q.clientLabor*0.15);
  const management=q.clientLabor-design-development-qa;
  return [
    ["Análisis, arquitectura y diseño",round250(design)],
    ["Desarrollo e integraciones",round250(development)],
    ["Pruebas, ajustes y puesta en producción",round250(qa)],
    ["Gestión del proyecto y documentación",round250(management)],
    ["Servicios/altas iniciales estimadas",round250(q.clientSetup)],
    ["Reserva de alcance e imprevistos",round250(q.contingency)]
  ];
}

async function sendReviewEmail({body,quote,id}){
  const apiKey=clean(process.env.RESEND_API_KEY,500);
  if(!apiKey) return {sent:false,reason:"RESEND_NOT_CONFIGURED"};
  const to=clean(process.env.APP_QUOTE_REVIEW_EMAIL||"ventas@ventanexia.es",320);
  const from=clean(process.env.APP_QUOTE_FROM||"VentaNexIA <presupuestos@ventanexia.es>",320);
  const breakdown=clientBreakdown(quote);
  const setup=quote.setup.length?quote.setup.map(x=>`- ${x.label}: ${money(x.cost)}`).join("\n"):"- Sin altas especiales detectadas";
  const recurring=quote.recurring.length?quote.recurring.map(x=>`- ${x.label}: ${money(x.cost)}/${x.period}`).join("\n"):"- Sin costes recurrentes especiales detectados";
  const tasks=quote.work.map(x=>`- ${x.label}: ${x.hours} h`).join("\n");
  const clientLines=breakdown.map(([label,value])=>`- ${label}: ${money(value)}`).join("\n");
  const text=`NUEVA SOLICITUD VNX APPS A MEDIDA\n\nReferencia: ${id}\nCliente: ${clean(body.name,200)}\nEmpresa: ${clean(body.company,200)}\nEmail: ${clean(body.email,320)}\nTeléfono: ${clean(body.phone,100)||"No indicado"}\nPlataformas: ${(body.platforms||[]).join(", ")||"No indicadas"}\nFunciones: ${(body.features||[]).join(", ")||"No indicadas"}\nUsuarios estimados: ${clean(body.users,50)||"No indicado"}\nFecha objetivo: ${clean(body.deadline,100)||"No indicada"}\n\nQUÉ QUIERE HACER\n${clean(body.description,6000)}\n\nINTEGRACIONES / SISTEMAS EXISTENTES\n${clean(body.integrations,4000)||"No indicados"}\n\nESTIMACIÓN DE TRABAJO\n${tasks}\n\nHoras equivalentes de proyecto: ${quote.hours} h\nPlazo estimado: ${quote.weeks} semanas\n\nCOSTE INTERNO ESTIMADO VENTANEXIA\n- Mano de obra interna (${quote.hours} h x ${INTERNAL_HOURLY_COST} €/h): ${money(quote.internalLabor)}\n- Altas/licencias iniciales: ${money(quote.setupCost)}\n- Reserva interna de riesgo: ${money(quote.internalRisk)}\n= COSTE INTERNO TOTAL ESTIMADO: ${money(quote.internalProjectCost)}\n\nGASTOS EXTERNOS DETECTADOS\nIniciales:\n${setup}\n\nRecurrentes estimados:\n${recurring}\nTotal mensual estimado: ${money(quote.monthlyCost)}/mes\nTotal anual estimado: ${money(quote.annualCost)}/año\n\nPROPUESTA DE PRECIO AL CLIENTE\n${clientLines}\n= PRECIO TOTAL PROPUESTO: ${money(quote.clientPrice)} + IVA\n\nMARGEN BRUTO ESTIMADO\n${money(quote.grossMargin)} (${quote.grossMarginPct}%) antes de impuestos y costes generales.\n\nIMPORTANTE\nEste presupuesto NO se ha enviado al cliente. Debe revisarse y aprobarse internamente. Las tarifas de terceros son estimaciones y deben confirmarse antes de emitir una propuesta final.\n`;
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],reply_to:clean(body.email,320),subject:`VNX Apps · Revisar presupuesto ${id} · ${clean(body.company,120)||clean(body.name,120)}`,text})});
  if(!r.ok){let err="";try{err=await r.text()}catch{};return {sent:false,reason:"SEND_FAILED",detail:err.slice(0,300)}}
  return {sent:true};
}

export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  const body=req.body||{};
  const name=clean(body.name,200),company=clean(body.company,200),email=clean(body.email,320),description=clean(body.description,6000);
  if(clean(body.website,200)) return res.status(200).json({ok:true});
  if(!name||!company||!email||!description||!yes(body.consent)) return res.status(400).json({error:"Faltan campos obligatorios"});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Email no válido"});
  const id=`APP-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const quote=estimate(body);
  const emailResult=await sendReviewEmail({body,quote,id});
  console.log(JSON.stringify({event:"app_quote_request",id,company,email,emailSent:emailResult.sent,hours:quote.hours,weeks:quote.weeks,internalCost:quote.internalProjectCost,clientPrice:quote.clientPrice,marginPct:quote.grossMarginPct,ts:new Date().toISOString()}));
  return res.status(200).json({ok:true,id,reviewRequired:true,emailSent:emailResult.sent,message:"Solicitud recibida. Prepararemos una valoración y la revisaremos internamente antes de enviarte una propuesta."});
}
