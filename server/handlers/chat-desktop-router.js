import baseChat from "./chat.js";

function norm(value=""){
  return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function localContext(req){
  return Array.isArray(req.body?.localContext)?req.body.localContext:[];
}

function portalFiles(req){
  return localContext(req).filter(f=>String(f?.path||"").startsWith("PORTAL "));
}

function euroValues(text=""){
  const matches=String(text).match(/(?:\d{1,3}(?:[.\s]\d{3})*|\d+),\d{2}\s*€/g)||[];
  return [...new Set(matches.map(x=>x.replace(/\s+/g," ").trim()))];
}

function section(text,label,nextLabels=[]){
  const raw=String(text||"");
  const n=norm(raw);
  const start=n.indexOf(norm(label));
  if(start<0)return "";
  let end=Math.min(raw.length,start+5000);
  for(const next of nextLabels){
    const idx=n.indexOf(norm(next),start+label.length);
    if(idx>start&&idx<end)end=idx;
  }
  return raw.slice(start,end);
}

function emailFiles(req){
  return localContext(req).filter(f=>{
    const p=norm(f?.path||"");
    return p.startsWith("gmail ")||p.startsWith("conexion email ")||p.includes(" email ");
  });
}

function parseEmailBlocks(text=""){
  const raw=String(text||"").trim();
  if(!raw)return [];
  const blocks=raw.split(/\n\s*\n(?=Correo\s+\d+|Email\s+\d+)/i).map(x=>x.trim()).filter(Boolean);
  return blocks.map((block,index)=>{
    const get=(label)=>{
      const m=block.match(new RegExp("(?:^|\\n)"+label+"\\s*:\\s*(.*)","i"));
      return String(m?.[1]||"").trim();
    };
    return {
      index:index+1,
      from:get("De|From"),
      subject:get("Asunto|Subject")||"(sin asunto)",
      date:get("Fecha|Date"),
      status:get("Estado|Status"),
      snippet:get("Vista previa|Snippet|Resumen")
    };
  }).filter(x=>x.from||x.subject!=="(sin asunto)"||x.snippet);
}

function emailFallback(req){
  const q=norm((req.body?.messages||[]).slice().reverse().find(m=>m?.role==="user")?.content||"");
  if(!/correo|email|gmail/.test(q))return null;
  const files=emailFiles(req);
  if(!files.length)return null;
  const emails=files.flatMap(f=>parseEmailBlocks(f.content)).slice(0,10);
  if(!emails.length)return null;

  if(/ultim|recient/.test(q)){
    const wanted=(q.match(/\b(\d{1,2})\b/)||[])[1];
    const n=Math.max(1,Math.min(10,Number(wanted||5)));
    const chosen=emails.slice(0,n);
    const attentionScore=(m)=>{
      const t=norm([m.subject,m.snippet,m.status].join(" "));
      let s=0;
      if(/no leido|unread/.test(t))s+=2;
      if(/importante|important/.test(t))s+=3;
      if(/urgente|urgent|incidencia|problema|error|pago|factura|pedido|reclam|venc|cancel|devoluc|bloque|seguridad/.test(t))s+=2;
      return s;
    };
    const ranked=[...chosen].sort((a,b)=>attentionScore(b)-attentionScore(a));
    const top=ranked[0];
    const lines=chosen.map((m,i)=>`${i+1}. ${m.subject} — ${m.from||"remitente no disponible"}${m.date?` — ${m.date}`:""}${m.status?` — ${m.status}`:""}\n   ${m.snippet||"Sin vista previa disponible."}`);
    const reason=top?(`El que revisaría primero es «${top.subject}» de ${top.from||"ese remitente"}, porque ${/importante|important/i.test(top.status||"")?"Gmail lo marca como importante":/no le[ií]do|unread/i.test(top.status||"")?"está sin leer y es el que más señales de atención presenta":"por el contenido del asunto y la vista previa parece requerir más atención"}.`):"";
    return `He consultado el correo seleccionado. Estos son los últimos ${chosen.length} correos:\n\n${lines.join("\n\n")}\n\n${reason}`;
  }
  return null;
}

function portalFallback(req){
  const q=norm((req.body?.messages||[]).slice().reverse().find(m=>m?.role==="user")?.content||"");
  const portals=portalFiles(req);
  if(!portals.length)return null;
  const combined=portals.map(f=>String(f?.content||"")).join("\n\n");

  if(/facturad|facturacion|ventas/.test(q)&&/mes|mensual/.test(q)){
    const block=section(combined,"facturado mensual",["grafico facturacion mensual","ultimos 100 pedidos web","pedidos web"]);
    const values=euroValues(block);
    if(values.length===1)return `El facturado mensual que aparece ahora mismo en el portal es ${values[0]}.`;
    if(values.length>1)return `En el bloque «Facturado mensual» del portal aparecen estos importes: ${values.slice(0,5).join(", ")}. No voy a escoger uno sin poder distinguir con fiabilidad cuál es el total principal.`;
  }

  if(/ultim|recient/.test(q)&&/pedido/.test(q)){
    const block=section(combined,"ultimos 100 pedidos web",["facturas","productos","clientes"]);
    if(block){
      const clean=block.replace(/\n{3,}/g,"\n\n").trim().slice(0,5000);
      return `He consultado el portal de Naturdesma en solo lectura. Estos son los datos visibles en la sección de últimos pedidos web:\n\n${clean}`;
    }
  }

  if(/pedido/.test(q)&&/pendient/.test(q)){
    const block=section(combined,"ultimos 100 pedidos web",["facturas","productos","clientes"]);
    if(block){
      const lines=block.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      const hits=lines.filter(x=>norm(x).includes("pendiente")).slice(0,20);
      if(hits.length)return `He encontrado estos registros marcados como pendientes en el portal:\n${hits.map(x=>`• ${x}`).join("\n")}`;
    }
  }

  if(/producto|precio|tarifa|cliente|factura/.test(q)){
    const terms=q.split(/[^a-z0-9]+/).filter(x=>x.length>=4);
    const ranked=portals.map(f=>{
      const hay=norm(`${f.path}\n${f.content}`);
      return {f,score:terms.reduce((n,t)=>n+(hay.includes(t)?1:0),0)};
    }).sort((a,b)=>b.score-a.score);
    const best=ranked[0];
    if(best?.score>0){
      const text=String(best.f.content||"").replace(/\n{3,}/g,"\n\n").trim();
      return `He consultado el portal autorizado. La información más relacionada que aparece es:\n\n${text.slice(0,4500)}`;
    }
  }

  return null;
}

export default async function handler(req,res){
  if(req.method!=="POST")return baseChat(req,res);
  if(req.body?.desktop){
    const emailDirect=emailFallback(req);
    if(emailDirect)return res.status(200).json({reply:emailDirect,source:"desktop-email-direct"});
    const direct=portalFallback(req);
    if(direct)return res.status(200).json({reply:direct,source:"desktop-portal-direct"});
  }
  return baseChat(req,res);
}
