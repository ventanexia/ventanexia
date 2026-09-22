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
      mails.push({account,id:get('ID|Message ID'),threadId:get('Hilo|Thread ID'),from:get('De|From'),subject:get('Asunto|Subject')||'(sin asunto)',date:get('Fecha|Date'),status:get('Estado|Status'),snippet:get('Vista previa|Snippet|Resumen')});
    }
  }
  return {path:files.map(f=>f.path).join(' + '),total,mails,accounts:files.length};
}

// Mensaje que solo cierra la conversación («ok, gracias»): no pide respuesta ni merece aviso.
function isCourtesyOnly(m){
  const word='(ok|vale|perfecto|recibido|gracias|muchas gracias|de acuerdo|genial|entendido)';
  const snippet=norm(m?.snippet||'').trim();
  return !/[?¿]/.test(String(m?.subject||'')+' '+String(m?.snippet||'')) &&
    new RegExp('^'+word+'([ ,.!y]+'+word+')*[ .,!]*$').test(snippet);
}

function scoreMailAttention(m){
  const t=norm([m.subject,m.snippet,m.status,m.from].join(' '));
  let s=0;
  if(/no leido|unread/.test(t))s+=2;
  if(/importante|important/.test(t))s+=4;
  if(/urgente|incidencia|problema|error|fallo|pago|factura|pedido|reclam|venc|cancel|devoluc|bloque|seguridad|confirm|respuesta|consulta|pregunta|plazo|presupuesto|proveedor|cliente|oferta|contrato/.test(t))s+=3;
  if(/linkedin|instagram|facebook|canva|tendencias profesionales|podrias conocer|aparecido en .* busquedas|explora a |ponte al dia|juegos en linkedin/.test(t))s-=4;
  if(/report domain:|dmarc|report-id/.test(t))s-=2;
  if(/no-?reply|noreply|do not reply|newsletter|boletin|marketing|promocion|descuento|rebajas|ofertas? (exclusiva|especial)|solo hoy|black friday|darse de baja|unsubscribe|ver en (el )?navegador|-\s?\d{1,2}\s?%/.test(t))s-=6;
  if(/confirmacion de (envio|pedido)|numero de seguimiento|tracking|tu pedido (ha sido|esta) (enviado|en camino|entregado)|ship-?confirm|order-update/.test(t))s-=3;
  if(isCourtesyOnly(m))s-=4;
  return s;
}

function needsReplyScore(m){
  const t=norm([m.from,m.subject,m.snippet,m.status].join(' '));
  let s=0;

  // Peticiones humanas/comerciales: señales fuertes de que esperan respuesta.
  if(/consulta|pregunta|solicitud|request|interes|interested|presupuesto|quote|proposal|propuesta|cooperation|colabor|pedido|order|disponibilidad|precio|condiciones|confirmar|respuesta|reply|contact|necesito|necesitamos|mandes|enviar|envies|catalogo|documentacion|ficha tecnica|tarifa/.test(t))s+=5;
  if(/proveedor|supplier|cliente|customer|dear sir|dear madam|hello|hola|buenos dias|buenas tardes/.test(t))s+=2;
  if(/no leido|unread/.test(t))s+=1;

  // Mensajes automáticos o de seguridad: pueden requerir atención, pero no respuesta por email.
  if(/codigo de verificacion|verification code|login code|log in code|sign-in|sign in|new sign-in|nuevo inicio de sesion|one-time|otp|2fa|autenticacion de dos factores|vence en \d+ minutos|expires in \d+ minutes|no compartas|do not share/.test(t))s-=10;
  if(/no-?reply|noreply|do not reply|notification|notificacion|mailer@shopify\.com|system@vercel\.com|notifications@vercel\.com|linkedin|instagram|facebook|canva|newsletter|boletin|promocion|marketing|report domain:|dmarc/.test(t))s-=8;

  // Avisos de envío y cierres de cortesía no esperan respuesta; una reclamación sí.
  if(/confirmacion de (envio|pedido)|numero de seguimiento|tracking|tu pedido (ha sido|esta) (enviado|en camino|entregado)|ship-?confirm/.test(t))s-=8;
  if(isCourtesyOnly(m))s-=8;
  if(/reclamacion|queja|danad|golpe|roto|defectuos|exigimos|no ha llegado|no hemos recibido|devolver/.test(t))s+=4;

  // Avisos de pago/error pueden ser importantes, pero normalmente no se responden al remitente automático.
  if(/pago de una factura fallo|fallo el pago|payment failed|card declined/.test(t))s-=6;

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
  const asksSummary=/resumen|resumir|revisa mis correos|revisar correos|preparame el dia|prepárame el dia|prepárame el día|organiza.*correo|que tengo.*correo|qué tengo.*correo/.test(q);
  if(asksSummary){
    const classify=m=>{
      const t=norm([m.subject,m.snippet,m.from].join(' '));
      if(/reclamacion|queja|devoluc|roto|defectuos|no ha llegado|problema|incidencia/.test(t))return 'Reclamaciones / problemas';
      if(/impago|vencimiento|pago pendiente|cobro|payment failed|card declined/.test(t))return 'Cobros / impagos';
      if(/factura|invoice|recibo/.test(t))return 'Facturas / recibos';
      if(/pedido|order|compra|entrega|envio|expedicion|presupuesto/.test(t))return 'Pedidos';
      if(needsReplyScore(m)>0)return 'Consultas';
      return 'Informativos';
    };
    const groups=new Map();
    for(const m of mails){
      const k=classify(m);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(m);
    }
    const order=['Pedidos','Facturas / recibos','Consultas','Cobros / impagos','Reclamaciones / problemas','Informativos'];
    const totalReply=mails.filter(m=>needsReplyScore(m)>0).length;
    const lines=['# Resumen rápido','- '+mails.length+' correos revisados','- '+totalReply+' parecen requerir respuesta',''];
    for(const k of order){
      const arr=groups.get(k)||[];if(!arr.length)continue;
      lines.push('## '+k);
      for(const m of arr.slice(0,6)){
        const needs=needsReplyScore(m)>0;
        lines.push('- '+m.subject+' — '+(m.from||'remitente no disponible')+(gmail.accounts>1?' · '+m.account:'')+' — '+(needs?'Requiere respuesta':'No requiere respuesta'));
      }
      lines.push('');
    }
    const firstReply=mails.find(m=>needsReplyScore(m)>0);
    if(firstReply){
      lines.push('## Acción recomendada');
      lines.push('- Empezaría por «'+firstReply.subject+'» de '+(firstReply.from||'ese remitente')+'.');
      lines.push('- Puedes preparar o enviar la respuesta desde los botones de debajo.');
    }
    return lines.join('\n');
  }
  const asksReplyQueue=/responder primero|contestar primero|pendientes? de responder|pendientes? de contestar|requieren respuesta|requiere respuesta|necesitan respuesta|necesita respuesta|que correos responder|que emails responder|que correos contestar|que emails contestar|cuales responder|cuales contestar|que tengo que responder|que debo responder|que necesito responder/.test(q);
  if(asksReplyQueue){
    const replyable=mails.map((m,i)=>({m,i,score:needsReplyScore(m)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,8);
    if(!replyable.length)return 'He revisado los correos recientes y no veo ninguno que claramente requiera una respuesta ahora mismo.';
    const lines=replyable.map((x,i)=>(i+1)+'. '+x.m.subject+' — '+(x.m.from||'remitente no disponible')+'\n   Acción: preparar respuesta');
    const n=replyable.length;
    return 'He revisado los correos. '+(n===1?'Solo encuentro 1 que requiera respuesta:':'Encuentro '+n+' que requieren respuesta:')+'\n\n'+lines.join('\n\n')+'\n\nLos avisos automáticos, códigos de acceso y newsletters se han excluido de esta cola.';
  }
  const asksAttention=/atencion|prioridad|prioritarios|revisar primero|urgente|importante/.test(q);
  if(asksAttention){
    const ranked=mails.map((m,i)=>({m,i,score:scoreMailAttention(m)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,5);
    if(!ranked.length)return 'He revisado tu correo y no veo mensajes recientes que destaquen claramente como prioritarios.';
    const lines=ranked.map((x,i)=>(i+1)+'. '+x.m.subject+' — '+(x.m.from||'remitente no disponible')+'\n   Motivo: '+attentionReason(x.m));
    return 'He revisado tu correo. Estos son los mensajes que requieren más atención:\n\n'+lines.join('\n\n')+'\n\nOjo: prioridad no significa necesariamente que haya que responder por email.';
  }
  if((/ultim|recient/.test(q))&&/correo|correos|email|emails/.test(q)){
    const n=Math.max(1,Math.min(10,Number((q.match(/\b(\d{1,2})\b/)||[])[1]||5)));
    const chosen=mails.slice(0,n);
    if(!chosen.length)return 'He consultado tu correo, pero no he encontrado mensajes que mostrar.';
    const lines=chosen.map((m,i)=>(i+1)+'. '+m.subject+' — '+(m.from||'remitente no disponible')+(gmail.accounts>1?' · '+m.account:'')+(m.date?' — '+m.date:'')+(needsReplyScore(m)>0?' — Requiere respuesta':' — Informativo'));
    const top=[...chosen].sort((a,b)=>scoreMailAttention(b)-scoreMailAttention(a))[0];
    return 'He consultado tu correo. Estos son los últimos '+chosen.length+' correos:\n\n'+lines.join('\n\n')+(top?'\n\nEl que revisaría primero es «'+top.subject+'» de '+(top.from||'ese remitente')+'.':'');
  }
  if(/pedido|pedidos/.test(q)){
    const related=mails.filter(m=>/pedido|order|compra|presupuesto|entrega|envio|expedicion/i.test([m.subject,m.snippet].join(' ')));
    const pool=related.length?related:mails;
    if(!pool.length)return 'He consultado tu correo, pero no he encontrado mensajes relacionados con pedidos.';
    const ranked=[...pool].sort((a,b)=>scoreMailAttention(b)-scoreMailAttention(a)).slice(0,5);
    const lines=ranked.map((m,i)=>(i+1)+'. '+m.subject+' — '+(m.from||'remitente no disponible')+(gmail.accounts>1?' · '+m.account:'')+(needsReplyScore(m)>0?' — Requiere respuesta':' — Sin respuesta necesaria'));
    return 'He revisado tu correo y he buscado mensajes relacionados con pedidos:\n\n'+lines.join('\n\n');
  }
  return null;
}

module.exports={normalizeChatScope,parseGmailContext,scoreMailAttention,needsReplyScore,emailAgentDirectReply};
