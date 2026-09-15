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

  function usefulFallback(text){
    const t=String(text||"").toLowerCase();
    if(/mockup|creativ|imagen|instagram|publicaci/.test(t)) return `Aquí tienes una propuesta lista para usar:\n\nCONCEPTO VISUAL\nSalón moderno y luminoso, sofá de líneas limpias como protagonista, mesa auxiliar minimalista y fondo cálido.\n\nTEXTO EN IMAGEN\n“Diseño que transforma tu hogar”\n\nSUBTEXTO\nMuebles modernos, cómodos y pensados para vivirlos cada día.\n\nLLAMADA A LA ACCIÓN\n“Descubre la colección”\n\nCOPY\nRenueva tu espacio con piezas que combinan diseño, comodidad y funcionalidad. Escríbenos y te ayudamos a elegir la opción que mejor encaja con tu casa.\n\nSi quieres, puedo convertir esta idea en 3 versiones: sofá, comedor y dormitorio.`;
    if(/precio|descuento|cuánto|cuanto/.test(t)) return `Para darte una respuesta comercial útil no inventaría una cifra. Haría esto:\n\n1. Confirmar modelo y cantidad.\n2. Consultar el precio real y las condiciones autorizadas de tu empresa.\n3. Preparar la oferta con precio unitario, total, transporte y plazo.\n4. Si incluye un descuento especial, dejarla pendiente de tu aprobación antes de enviarla.\n\nAsí el cliente recibe una oferta concreta y válida, no una respuesta vacía.`;
    if(/pedido|comprar|unidades|sillas|producto/.test(t)) return `Perfecto. Para avanzar con el pedido usaría lo que ya me has dicho y pediría solo el dato que falte.\n\nSi fueran 20 sillas para una sala de reuniones, te propondría tres opciones: una económica y apilable, una equilibrada con mejor ergonomía y una premium para uso intensivo. En cuanto elijas modelo, dejaría el pedido resumido con cantidad, precio aprobado, transporte y entrega.`;
    if(/no ha llegado|incidencia|problema|entrega|retraso/.test(t)) return `Lo resolvería sin marear al cliente. Pediría solo el número de pedido o el email de compra, consultaría el estado real y respondería con una salida concreta: fecha prevista, alternativa disponible o escalado urgente a transporte. Si hay una compensación económica, la dejaría pendiente de aprobación.`;
    if(/seguimiento|no responde|volver a escribir|cliente parado/.test(t)) return `Te dejo un seguimiento listo para enviar:\n\n“Hola, [Nombre]. Te escribo para saber si has podido revisar la propuesta que te enviamos. Si quieres, te resumo las opciones y te ayudo a elegir la que mejor encaja contigo.”\n\nAdemás dejaría programado el siguiente recordatorio para que el cliente no quede olvidado.`;
    if(/reuni[oó]n|cita|agenda/.test(t)) return `Perfecto. Propondría directamente 2 o 3 horarios disponibles, dejaría el mensaje de confirmación preparado y añadiría un recordatorio antes de la reunión. Si me dices el día, te preparo ahora mismo el texto exacto.`;
    if(/factura|cobro|pago/.test(t)) return `Pediría solo el dato imprescindible para localizar la operación, comprobaría la información y dejaría preparada la respuesta con la factura o el estado del cobro. Si faltara algún dato fiscal, pediría únicamente ese dato, no toda la información otra vez.`;
    if(/mueble|sofá|sofa|mesa|decoraci/.test(t)) return `Si vendes muebles, empezaría por ayudarte a vender mejor, no por hacerte un interrogatorio. Puedo prepararte ahora mismo una campaña, una respuesta comercial, un seguimiento, una propuesta de producto o publicaciones para redes. Por ejemplo: “Hazme 3 publicaciones para Instagram para vender sofás modernos” y te las dejo completas.`;
    return `Voy directo a ayudarte. Dime el resultado que quieres conseguir y te devuelvo trabajo hecho en esta misma conversación: una respuesta a un cliente, una publicación, un seguimiento, una propuesta, una comparación, una solución a una incidencia o un plan de acción.`;
  }

  if(location.pathname==="/"||location.pathname==="/index.html"){
    const panel=document.getElementById("vnxAiPanel"),messages=document.getElementById("vnxAiMessages"),oldInput=document.getElementById("vnxAiInput"),oldSend=document.getElementById("vnxAiSend");
    const hello="Hola. Dime qué quieres resolver y te enseñaré directamente cómo lo haría VentaNexIA. Puedes pedirme una respuesta a un cliente, una publicación, un seguimiento, una propuesta o ayuda con una incidencia.";
    if(messages){const first=messages.querySelector(".vnx-msg.bot");if(first)first.textContent=hello}
    const small=panel?.querySelector(".vnx-ai-head small");if(small)small.textContent="Responde, crea y resuelve tareas contigo";
    if(oldInput&&oldSend&&messages){
      const input=oldInput.cloneNode(true),send=oldSend.cloneNode(true);oldInput.replaceWith(input);oldSend.replaceWith(send);
      const history=[{role:"assistant",content:hello}];
      const add=(text,type)=>{const d=document.createElement("div");d.className=`vnx-msg ${type}`;d.textContent=text;messages.appendChild(d);messages.scrollTop=messages.scrollHeight;return d};
      async function submit(){const text=input.value.trim();if(!text)return;add(text,"user");history.push({role:"user",content:text});input.value="";send.disabled=true;const wait=add("Pensando…","bot");try{const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages:history.slice(-16)})});const j=await r.json().catch(()=>({}));wait.remove();const reply=r.ok&&j.reply?j.reply:usefulFallback(text);add(reply,"bot");history.push({role:"assistant",content:reply})}catch{wait.remove();const reply=usefulFallback(text);add(reply,"bot");history.push({role:"assistant",content:reply})}finally{send.disabled=false;input.focus()}}
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
