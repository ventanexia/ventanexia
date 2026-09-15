document.addEventListener("DOMContentLoaded",()=>{
  const btn=document.getElementById("navToggle")||document.getElementById("mobileMenuBtn");
  const nav=document.getElementById("mainNav");
  if(btn&&nav){
    btn.addEventListener("click",()=>{const open=nav.classList.toggle("open");btn.setAttribute("aria-expanded",open?"true":"false")});
    nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{nav.classList.remove("open");btn.setAttribute("aria-expanded","false")}));
    if(!nav.querySelector('a[href="/ejemplos-whatsapp.html"]')){
      const demoLink=nav.querySelector('a[href="/demo.html"]');
      const a=document.createElement("a");a.href="/ejemplos-whatsapp.html";a.textContent="Ejemplos WhatsApp";
      if(demoLink)demoLink.insertAdjacentElement("afterend",a);else nav.appendChild(a);
    }
  }

  document.querySelectorAll('a[href="/#soluciones"]').forEach(a=>a.setAttribute("href","/#empleados"));
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener("click",e=>{const id=a.getAttribute("href");const el=id&&id!=="#"?document.querySelector(id):null;if(el){e.preventDefault();el.scrollIntoView({behavior:"smooth",block:"start"})}}));

  function compactHistory(history){return history.slice(-10).map(m=>`${m.role}: ${m.content}`).join("\n").toLowerCase()}
  function smartFallback(history,text){
    const t=String(text||"").toLowerCase();
    const ctx=compactHistory(history);
    const full=`${ctx}\n${t}`;

    if(/ens[eé]ñame|verlo|visual|mu[eé]strame|hazlo visual|quiero verlo/.test(t)){
      if(/sof[aá]|mueble|sal[oó]n|instagram|mockup/.test(full)) return `Claro. Te lo enseño como quedaría:\n\n┌────────────────────────────┐\n│      DISEÑO QUE CAMBIA     │\n│         TU SALÓN           │\n│                            │\n│   [ sofá moderno gris ]    │\n│   [ mesa baja + lámpara ]  │\n│                            │\n│ Cómodo. Actual. Tu estilo. │\n│                            │\n│    DESCUBRE LA COLECCIÓN   │\n└────────────────────────────┘\n\nCOPY PARA INSTAGRAM\nRenueva tu salón con un sofá que combina diseño, comodidad y funcionalidad. Una pieza pensada para disfrutarla cada día y hacer que tu casa se sienta más tuya.\n\nCTA: “Escríbenos y te ayudamos a elegir medida y acabado.”\n\n¿Te encaja este estilo o lo quieres más premium, más cálido o más minimalista?`;
      return `Te preparo una primera versión visible ahora mismo. Dime solo qué quieres ver —por ejemplo una publicación, una oferta, un email o una respuesta a un cliente— y te la muestro ya hecha, no te explico cómo la haría.`;
    }

    if(/^(s[ií]|vale|ok|perfecto|hazlo|adelante|me gusta)$/i.test(String(text||"").trim())){
      if(/instagram|publicaci|sof[aá]|mueble/.test(ctx)) return `Perfecto. Entonces cierro una primera versión lista para usar:\n\nTITULAR\nDiseño que transforma tu hogar\n\nCOPY\nUn buen sofá no solo llena un espacio: cambia cómo lo vives. Descubre una colección pensada para combinar comodidad, líneas actuales y acabados que encajan contigo.\n\nCTA\nEscríbenos y te ayudamos a elegir la opción que mejor encaja con tu salón.\n\nVERSIÓN CORTA\n“Tu salón. Tu estilo. Tu momento.”\n\nSi quieres, ahora hago dos variantes más sin cambiar la idea principal.`;
      return `Perfecto. Sigo con la propuesta anterior y la dejo cerrada en una versión utilizable. Si quieres cambiar tono, precio, estilo o formato, dímelo y la rehago sobre esta misma base.`;
    }

    if(/^(no|no me gusta|c[aá]mbialo|otra cosa|as[ií] no)$/i.test(String(text||"").trim())){
      if(/sof[aá]|mueble|instagram|publicaci/.test(ctx)) return `Entendido. Lo cambio. Vamos a una versión más premium y menos genérica:\n\nTITULAR\nHaz de tu salón un lugar al que quieras volver\n\nENFOQUE VISUAL\nFondo oscuro elegante, sofá protagonista, iluminación lateral cálida y muy poco texto en pantalla.\n\nCOPY\nDiseño limpio, materiales que se sienten bien y comodidad para el día a día. Menos ruido, más estilo.\n\nCTA\nDescubre la colección.\n\n¿Esta línea te encaja mejor?`;
      return `Entendido. No sigo por esa línea. Te preparo una alternativa diferente manteniendo lo que ya me has dicho, para que puedas compararlas sin empezar de cero.`;
    }

    if(/mockup|creativ|imagen|instagram|publicaci/.test(t)) return `Aquí tienes una propuesta lista para usar:\n\nCONCEPTO VISUAL\nSalón moderno y luminoso, sofá de líneas limpias como protagonista, mesa auxiliar minimalista y fondo cálido.\n\nTEXTO EN IMAGEN\n“Diseño que transforma tu hogar”\n\nSUBTEXTO\nMuebles modernos, cómodos y pensados para vivirlos cada día.\n\nLLAMADA A LA ACCIÓN\n“Descubre la colección”\n\nCOPY\nRenueva tu espacio con piezas que combinan diseño, comodidad y funcionalidad. Escríbenos y te ayudamos a elegir la opción que mejor encaja con tu casa.\n\n¿Te encaja así o quieres que cambie algo?`;
    if(/precio|descuento|cuánto|cuanto/.test(t)) return `Te preparo la respuesta comercial sin inventar una cifra:\n\n“Para 20 unidades puedo revisarte la mejor condición disponible. Te confirmo precio unitario, total, transporte y plazo en una sola propuesta. Si hay un descuento especial, te lo dejo preparado para aprobación antes de enviarlo.”\n\n¿Quieres que lo haga más directo o más comercial?`;
    if(/pedido|comprar|unidades|sillas|producto/.test(t)) return `Para avanzar, tomo lo que ya has dicho y no te hago repetirlo. Si hablamos de 20 sillas para una sala de reuniones, te propondría tres opciones: económica y apilable, equilibrada con mejor ergonomía y premium para uso intensivo.\n\nSiguiente paso: dime solo si las quieres con o sin brazos y te cierro la selección. ¿Te encaja?`;
    if(/no ha llegado|incidencia|problema|entrega|retraso/.test(t)) return `Vamos a resolverlo. Necesito únicamente el número de pedido o el email de compra. Con eso la respuesta al cliente debe acabar en una de estas salidas: fecha prevista, alternativa disponible o gestión urgente con transporte.\n\nNo te haría repetir ningún otro dato.`;
    if(/seguimiento|no responde|volver a escribir|cliente parado/.test(t)) return `Te dejo el seguimiento listo:\n\n“Hola, [Nombre]. Te escribo para saber si has podido revisar la propuesta. Si quieres, te resumo las dos opciones principales y te ayudo a elegir la que mejor encaja contigo.”\n\nDespués dejaría programado el siguiente recordatorio. ¿Lo quieres más cercano o más comercial?`;
    if(/reuni[oó]n|cita|agenda/.test(t)) return `Te propongo este mensaje:\n\n“Perfecto. El jueves puedo ofrecerte varias opciones. Te propongo 10:00, 12:30 o 16:30. Dime cuál te encaja mejor y te envío la confirmación.”\n\nSi esos horarios no son reales porque todavía no tenemos agenda conectada, se sustituyen por los huecos disponibles.`;
    if(/factura|cobro|pago/.test(t)) return `La respuesta debería ir directa a resolverlo:\n\n“Claro. Pásame el número de pedido o el email de compra y localizo la operación. Si los datos fiscales están completos, te dejo la factura preparada; si falta algo, te pediré solo ese dato.”`;
    if(/mueble|sofá|sofa|mesa|decoraci/.test(t)) return `Si vendes muebles, empezaría dándote algo útil ya. Por ejemplo:\n\nPUBLICACIÓN\n“Haz de tu salón un lugar al que quieras volver.”\nUn sofá cómodo, actual y pensado para tu día a día. Elige medida, acabado y estilo y nosotros te ayudamos a encontrar el que mejor encaja con tu espacio.\n\nCTA: “Descubre la colección”.\n\n¿Te encaja este tono o lo quieres más premium?`;
    return `Te propongo una primera versión para que puedas decirme sí o no, y la ajusto contigo. Dime la tarea concreta —respuesta a cliente, publicación, seguimiento, propuesta o incidencia— y te devuelvo directamente una primera solución terminada.`;
  }

  if(location.pathname==="/"||location.pathname==="/index.html"){
    const panel=document.getElementById("vnxAiPanel"),messages=document.getElementById("vnxAiMessages"),oldInput=document.getElementById("vnxAiInput"),oldSend=document.getElementById("vnxAiSend");
    const hello="Hola. Dime qué quieres resolver y te daré una primera propuesta concreta. Tú me dices si te encaja o qué cambiar, y la rehago contigo.";
    if(messages){const first=messages.querySelector(".vnx-msg.bot");if(first)first.textContent=hello}
    const small=panel?.querySelector(".vnx-ai-head small");if(small)small.textContent="Propone, aprende de tus respuestas y rectifica";
    if(oldInput&&oldSend&&messages){
      const input=oldInput.cloneNode(true),send=oldSend.cloneNode(true);oldInput.replaceWith(input);oldSend.replaceWith(send);
      const history=[{role:"assistant",content:hello}];
      const add=(text,type)=>{const d=document.createElement("div");d.className=`vnx-msg ${type}`;d.textContent=text;messages.appendChild(d);messages.scrollTop=messages.scrollHeight;return d};
      async function submit(){const text=input.value.trim();if(!text)return;add(text,"user");history.push({role:"user",content:text});input.value="";send.disabled=true;const wait=add("Pensando…","bot");try{const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages:history.slice(-16)})});const j=await r.json().catch(()=>({}));wait.remove();const reply=r.ok&&j.reply?j.reply:smartFallback(history,text);add(reply,"bot");history.push({role:"assistant",content:reply})}catch{wait.remove();const reply=smartFallback(history,text);add(reply,"bot");history.push({role:"assistant",content:reply})}finally{send.disabled=false;input.focus()}}
      send.addEventListener("click",submit);input.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit()}});
    }
  }

  if((location.pathname==="/"||location.pathname==="/index.html")&&!document.getElementById("whatsapp-en-accion")){
    const anchor=document.getElementById("demo")||document.querySelector("footer");
    if(anchor){
      const style=document.createElement("style");
      style.textContent=`.wa-proof{padding:72px 0;background:#f3f7fc;border-top:1px solid #dce6f2;border-bottom:1px solid #dce6f2}.wa-proof .wa-head{text-align:center;max-width:850px;margin:0 auto 32px}.wa-proof .wa-head h2{font-size:42px;line-height:1.08;margin:8px 0 14px}.wa-proof .wa-head p{font-size:18px;color:#607286;line-height:1.55}.wa-proof-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:28px}.wa-phone{background:#fff;border:1px solid #d8e3ef;border-radius:24px;overflow:hidden;box-shadow:0 18px 45px rgba(11,39,64,.10)}.wa-phone-head{background:#075e54;color:#fff;padding:17px 20px;display:flex;gap:12px;align-items:center}.wa-avatar{width:42px;height:42px;border-radius:50%;background:#fff;color:#075e54;display:grid;place-items:center;font-weight:900}.wa-phone-head small{display:block;opacity:.85;margin-top:3px}.wa-chat{background:#efeae2;padding:22px;min-height:420px}.wa-msg{max-width:86%;padding:11px 13px;border-radius:12px;margin:10px 0;line-height:1.45;box-shadow:0 1px 1px rgba(0,0,0,.07)}.wa-client{background:#fff}.wa-vnx{background:#dcf8c6;margin-left:auto}.wa-proof-side{background:#071a2c;color:#fff;border-radius:24px;padding:30px}.wa-proof-side h3{font-size:30px;margin:0 0 18px}.wa-proof-side ul{padding-left:21px;line-height:1.7}.wa-proof-side p{color:#c9d7e6;line-height:1.55}.wa-proof-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.wa-proof-actions a{display:inline-flex;text-decoration:none;font-weight:800;border-radius:12px;padding:13px 18px}.wa-primary{background:#1498ff;color:#fff}.wa-secondary{background:#fff;color:#071a2c}.wa-proof-note{margin-top:16px;font-size:13px;color:#9eb3c7}@media(max-width:850px){.wa-proof-grid{grid-template-columns:1fr}.wa-proof .wa-head h2{font-size:32px}}`;
      document.head.appendChild(style);
      const section=document.createElement("section");section.id="whatsapp-en-accion";section.className="wa-proof";
      section.innerHTML=`<div class="wrap"><div class="wa-head"><div class="eyebrow blue">NO TE DICE LO QUE PODRÍA HACER. LO HACE.</div><h2>Mira cómo respondería VentaNexIA a tus clientes.</h2><p>Respuestas completas, útiles y orientadas a resolver. Recuerda lo anterior, recomienda, redacta, organiza y sabe cuándo necesita tu aprobación.</p></div><div class="wa-proof-grid"><div class="wa-phone"><div class="wa-phone-head"><div class="wa-avatar">V</div><div><b>VentaNexIA</b><small>Ejemplo de atención por WhatsApp</small></div></div><div class="wa-chat"><div class="wa-msg wa-client">Necesito 20 sillas para una sala de reuniones.</div><div class="wa-msg wa-vnx">Te propondría tres niveles: económica y apilable; equilibrada con mejor ergonomía; y premium para uso intensivo. Para 20 unidades prepararía la comparación con precio unitario, total, transporte y plazo real.</div><div class="wa-msg wa-client">¿Y si el cliente dice que es caro?</div><div class="wa-msg wa-vnx">Respondería comparando valor, no solo precio: duración, garantía, comodidad y coste total. Si hace falta un descuento especial, preparo la propuesta y espero tu aprobación antes de enviarla.</div></div></div><div class="wa-proof-side"><h3>El objetivo es que tu cliente reciba una solución.</h3><ul><li>Recomienda productos y compara opciones.</li><li>Prepara ofertas y pedidos.</li><li>Resuelve incidencias con pasos concretos.</li><li>Redacta seguimientos y reuniones.</li><li>Crea publicaciones, emails y mensajes.</li><li>Pide permiso solo en decisiones sensibles.</li></ul><div class="wa-proof-actions"><a class="wa-primary" href="/ejemplos-whatsapp.html">Ver ejemplos completos →</a><a class="wa-secondary" href="/whatsapp-prueba.html">Probar conversación →</a></div><div class="wa-proof-note">Las acciones reales usan únicamente los sistemas que cada cliente autorice conectar.</div></div></div></div>`;
      anchor.parentNode.insertBefore(section,anchor);
    }
  }
});
