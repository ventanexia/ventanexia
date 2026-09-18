function norm(v=''){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}

function normalizeChatScope(scope){
  if(!scope)return null;
  if(typeof scope==='object'){
    const type=String(scope.type||'').trim();
    const key=String(scope.key||'').trim();
    if(type==='agent'&&key)return {...scope,type,key};
    if(type==='integration'&&key)return {...scope,type,key};
    if(type==='portal'&&scope.id)return {...scope,type,id:String(scope.id)};
    if(type==='folder'&&scope.folder)return {...scope,type,folder:String(scope.folder)};
    if(type==='shopify')return {...scope,type};
    return scope;
  }
  const raw=String(scope||'').trim();
  if(!raw)return null;
  if(raw.startsWith('agent:'))return {type:'agent',key:raw.slice(6)};
  if(raw.startsWith('integration:'))return {type:'integration',key:raw.slice(12)};
  if(raw.startsWith('portal:'))return {type:'portal',id:raw.slice(7)};
  if(raw.startsWith('folder:'))return {type:'folder',folder:raw.slice(7)};
  if(raw.startsWith('shopify:'))return {type:'shopify',shop:raw.slice(8)};
  return {type:'unknown',raw};
}

function parseGmailContext(localContext=[]){
  const files=(localContext||[]).filter(f=>/^GMAIL\b/i.test(String(f?.path||'')));
  if(!files.length)return null;
  let total=0;const mails=[];
  for(const file of files){
    const text=String(file.content||'');
    const account=String((text.match(/CUENTA:\s*(.*)/i)||[])[1]||String(file.path||'').replace(/^GMAIL\s*/i,'')).trim();
    total+=Number((text.match(/TOTAL_COINCIDENCIAS:\s*(\d+)/i)||[])[1]||0);
    const blocks=[...text.matchAll(/Correo\s+\d+[\s\S]*?(?=\n\s*\nCorreo\s+\d+|$)/gi)].map(m=>m[0].trim());
    for(const block of blocks){
      const get=(label)=>String((block.match(new RegExp('(?:^|\\n)(?:'+label+')\\s*:\\s*(.*)','i'))||[])[1]||'').trim();
      mails.push({account,from:get('De|From'),subject:get('Asunto|Subject')||'(sin asunto)',date:get('Fecha|Date'),status:get('Estado|Status'),snippet:get('Vista previa|Snippet|Resumen')});
    }
  }
  return {path:files.map(f=>f.path).join(' + '),total,mails,accounts:files.length};
}

function scoreMailAttention(m){
  const t=norm([m.subject,m.snippet,m.status,m.from].join(' '));
  let s=0;
  if(/no leido|unread/.test(t))s+=2;
  if(/importante|important/.test(t))s+=4;
  if(/urgente|incidencia|problema|error|fallo|pago|factura|pedido|reclam|venc|cancel|devoluc|bloque|seguridad|confirm|respuesta|consulta|pregunta|plazo|presupuesto|proveedor|cliente|oferta|contrato/.test(t))s+=3;
  if(/linkedin|instagram|facebook|canva|tendencias profesionales|podrias conocer|aparecido en .* busquedas|explora a |ponte al dia|juegos en linkedin/.test(t))s-=4;
  if(/report domain:|dmarc|report-id/.test(t))s-=2;
  return s;
}

function needsReplyScore(m){
  const t=norm([m.from,m.subject,m.snippet,m.status].join(' '));
  let s=0;
  if(/consulta|pregunta|solicitud|request|interes|interested|presupuesto|quote|proposal|propuesta|cooperation|colabor|pedido|order|disponibilidad|precio|condiciones|confirmar|respuesta|reply|contact/.test(t))s+=4;
  if(/proveedor|supplier|cliente|customer|dear sir|dear madam|hello|hola|buenos dias|buenas tardes/.test(t))s+=2;
  if(/no leido|unread/.test(t))s+=1;
  if(/no-?reply|noreply|do not reply|notification|notificacion|linkedin|instagram|facebook|canva|report domain:|dmarc|pago de una factura fallo|fallo el pago/.test(t))s-=6;
  return s;
}

function attentionReason(m){
  const t=norm([m.subject,m.snippet,m.status].join(' '));
  const reasons=[];
  if(/importante|important/.test(t))reasons.push('marcado como importante');
  if(/no leido|unread/.test(t))reasons.push('no leído');
  if(/fallo.*pago|pago.*fallo|pago|factura|venc/.test(t))reasons.push('afecta a pagos o facturación');
  else if(/pedido|entrega|envio|expedicion/.test(t))reasons.push('afecta a un pedido o entrega');
  else if(/proveedor|oferta|presupuesto|consulta|pregunta|respuesta/.test(t))reasons.push('puede requerir respuesta comercial');
  else if(/seguridad|oauth|autoriz|bloque/.test(t))reasons.push('relacionado con seguridad o accesos');
  return reasons.length?reasons.join(', '):'parece relevante por su contenido';
}

function emailAgentDirectReply(question,localContext=[]){
  const gmail=parseGmailContext(localContext);if(!gmail)return null;
  const q=norm(question),mails=gmail.mails;
  if((/cuantos|cuantas|numero|total/.test(q))&&/correo|correos|email|emails/.test(q)&&/responder|contestar|respuesta|reply/.test(q)){
    const replyable=mails.map((m,i)=>({m,i,score:needsReplyScore(m)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i);
    if(!replyable.length)return 'He revisado los correos recientes y no veo ninguno que claramente requiera una respuesta ahora mismo.';
    const lines=replyable.slice(0,8).map((x,i)=>(i+1)+'. '+x.m.subject+' — '+(x.m.from||'remitente no disponible')+(gmail.accounts>1?' · '+x.m.account:''));
    return 'He revisado los correos recientes. Hay '+replyable.length+' que parecen requerir respuesta.\n\n'+lines.join('\n')+'\n\nHe separado las notificaciones automáticas y los avisos que requieren atención pero no necesariamente una respuesta.';
  }
  if((/cuantos|cuantas|numero|total/.test(q))&&/correo|correos|email|emails/.test(q)){
    return 'He consultado tu correo. Hay '+(gmail.total||mails.length)+' correo(s)'+(/hoy|today/.test(q)?' hoy':'')+' en la bandeja de entrada.';
  }
  if(/atencion|prioridad|prioritarios|requieren|requiere|necesitan|necesita|revisar primero|contestar primero|responder primero|pendientes de responder/.test(q)){
    const ranked=mails.map((m,i)=>({m,i,score:scoreMailAttention(m)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,5);
    if(!ranked.length)return 'He revisado tu correo y no veo mensajes recientes que destaquen claramente como prioritarios.';
    const lines=ranked.map((x,i)=>(i+1)+'. '+x.m.subject+' — '+(x.m.from||'remitente no disponible')+'\n   Motivo: '+attentionReason(x.m)+(x.m.snippet?'\n   '+x.m.snippet:''));
    return 'He revisado tu correo. Estos son los mensajes que requieren más atención:\n\n'+lines.join('\n\n')+'\n\nEmpezaría por el nº 1. Si quieres, puedo preparar después las respuestas de los que realmente necesiten contestación.';
  }
  if((/ultim|recient/.test(q))&&/correo|correos|email|emails/.test(q)){
    const n=Math.max(1,Math.min(10,Number((q.match(/\b(\d{1,2})\b/)||[])[1]||5)));
    const chosen=mails.slice(0,n);
    if(!chosen.length)return 'He consultado tu correo, pero no he encontrado mensajes que mostrar.';
    const lines=chosen.map((m,i)=>(i+1)+'. '+m.subject+' — '+(m.from||'remitente no disponible')+(gmail.accounts>1?' · '+m.account:'')+(m.date?' — '+m.date:'')+(m.status?' — '+m.status:'')+'\n   '+(m.snippet||'Sin vista previa disponible.'));
    const top=[...chosen].sort((a,b)=>scoreMailAttention(b)-scoreMailAttention(a))[0];
    return 'He consultado tu correo. Estos son los últimos '+chosen.length+' correos:\n\n'+lines.join('\n\n')+(top?'\n\nEl que revisaría primero es «'+top.subject+'» de '+(top.from||'ese remitente')+'.':'');
  }
  if(/pedido|pedidos/.test(q)){
    const related=mails.filter(m=>/pedido|order|compra|presupuesto|entrega|envio|expedicion/i.test([m.subject,m.snippet].join(' ')));
    const pool=related.length?related:mails;
    if(!pool.length)return 'He consultado tu correo, pero no he encontrado mensajes relacionados con pedidos.';
    const ranked=[...pool].sort((a,b)=>scoreMailAttention(b)-scoreMailAttention(a)).slice(0,5);
    const lines=ranked.map((m,i)=>(i+1)+'. '+m.subject+' — '+(m.from||'remitente no disponible')+(gmail.accounts>1?' · '+m.account:'')+(m.status?' — '+m.status:'')+'\n   '+(m.snippet||'Sin vista previa disponible.'));
    return 'He revisado tu correo y he buscado mensajes relacionados con pedidos:\n\n'+lines.join('\n\n');
  }
  return null;
}

module.exports={normalizeChatScope,parseGmailContext,scoreMailAttention,needsReplyScore,emailAgentDirectReply};
