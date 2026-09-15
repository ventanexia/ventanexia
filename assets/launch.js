document.addEventListener("DOMContentLoaded",()=>{
  const btn=document.getElementById("navToggle")||document.getElementById("mobileMenuBtn");
  const nav=document.getElementById("mainNav");
  if(btn&&nav){
    btn.addEventListener("click",()=>{
      const open=nav.classList.toggle("open");
      btn.setAttribute("aria-expanded",open?"true":"false");
    });
    nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{nav.classList.remove("open");btn.setAttribute("aria-expanded","false")}));
    if(!nav.querySelector('a[href="/ejemplos-whatsapp.html"]')){
      const demoLink=nav.querySelector('a[href="/demo.html"]');
      const a=document.createElement("a");a.href="/ejemplos-whatsapp.html";a.textContent="Ejemplos WhatsApp";
      if(demoLink)demoLink.insertAdjacentElement("afterend",a);else nav.appendChild(a);
    }
  }

  document.querySelectorAll('a[href="/#soluciones"]').forEach(a=>a.setAttribute("href","/#empleados"));

  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener("click",e=>{
    const id=a.getAttribute("href");
    const el=id&&id!=="#"?document.querySelector(id):null;
    if(el){e.preventDefault();el.scrollIntoView({behavior:"smooth",block:"start"})}
  }));

  if((location.pathname==="/"||location.pathname==="/index.html")&&!document.getElementById("whatsapp-en-accion")){
    const anchor=document.getElementById("demo")||document.querySelector("footer");
    if(anchor){
      const style=document.createElement("style");
      style.textContent=`
      .wa-proof{padding:72px 0;background:#f3f7fc;border-top:1px solid #dce6f2;border-bottom:1px solid #dce6f2}
      .wa-proof .wa-head{text-align:center;max-width:830px;margin:0 auto 32px}.wa-proof .wa-head h2{font-size:42px;line-height:1.08;margin:8px 0 14px}.wa-proof .wa-head p{font-size:18px;color:#607286;line-height:1.55}
      .wa-proof-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:28px;align-items:stretch}.wa-phone{background:#fff;border:1px solid #d8e3ef;border-radius:24px;overflow:hidden;box-shadow:0 18px 45px rgba(11,39,64,.10)}
      .wa-phone-head{background:#075e54;color:#fff;padding:17px 20px;display:flex;gap:12px;align-items:center}.wa-avatar{width:42px;height:42px;border-radius:50%;background:#fff;color:#075e54;display:grid;place-items:center;font-weight:900}.wa-phone-head small{display:block;opacity:.85;margin-top:3px}
      .wa-chat{background:#efeae2;padding:22px;min-height:390px}.wa-msg{max-width:86%;padding:11px 13px;border-radius:12px;margin:10px 0;line-height:1.45;box-shadow:0 1px 1px rgba(0,0,0,.07)}.wa-client{background:#fff}.wa-vnx{background:#dcf8c6;margin-left:auto}.wa-proof-side{background:#071a2c;color:#fff;border-radius:24px;padding:30px}.wa-proof-side h3{font-size:28px;margin:0 0 18px}.wa-proof-side ul{margin:0;padding-left:21px;line-height:1.7}.wa-proof-side li{margin:7px 0}.wa-proof-side p{color:#c9d7e6;line-height:1.55}.wa-proof-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.wa-proof-actions a{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-weight:800;border-radius:12px;padding:13px 18px}.wa-primary{background:#1498ff;color:#fff}.wa-secondary{background:#fff;color:#071a2c}.wa-proof-note{margin-top:16px;font-size:13px;color:#9eb3c7}
      @media(max-width:850px){.wa-proof-grid{grid-template-columns:1fr}.wa-proof .wa-head h2{font-size:32px}.wa-chat{min-height:0}}
      `;
      document.head.appendChild(style);
      const section=document.createElement("section");
      section.id="whatsapp-en-accion";section.className="wa-proof";
      section.innerHTML=`<div class="wrap">
        <div class="wa-head"><div class="eyebrow blue">RESPUESTAS AUTOMÁTICAS QUE RESUELVEN</div><h2>Mira cómo respondería VentaNexIA a tus clientes por WhatsApp.</h2><p>No son mensajes genéricos. La idea es entender qué quiere la persona, darle una solución útil, ayudar a vender y pedir permiso solo cuando entra en juego un precio, descuento o compromiso importante.</p></div>
        <div class="wa-proof-grid">
          <div class="wa-phone"><div class="wa-phone-head"><div class="wa-avatar">V</div><div><b>VentaNexIA</b><small>Ejemplo de atención por WhatsApp</small></div></div><div class="wa-chat">
            <div class="wa-msg wa-client">Quiero 20 sillas para una sala de reuniones. ¿Qué me recomiendas?</div>
            <div class="wa-msg wa-vnx">Para una sala de reuniones buscaría una silla cómoda para 1–2 horas, fácil de limpiar y que pueda apilarse si necesitas liberar espacio. Te prepararía 3 opciones: económica, equilibrada y premium. Si me dices si prefieres con o sin brazos, te dejo la selección lista para comparar.</div>
            <div class="wa-msg wa-client">¿Y qué precio me haces por 20?</div>
            <div class="wa-msg wa-vnx">Te prepararé el mejor precio disponible según el modelo y las condiciones de tu empresa. No voy a inventarte una cifra: dejo la propuesta preparada y el precio final queda pendiente de aprobación antes de enviártelo.</div>
          </div></div>
          <div class="wa-proof-side"><h3>Lo importante: que el cliente reciba una solución.</h3><ul><li>Responde dudas de producto.</li><li>Compara opciones y recomienda.</li><li>Recoge pedidos sin hacer repetir datos.</li><li>Resuelve incidencias con pasos concretos.</li><li>Prepara publicaciones, emails y mensajes.</li><li>Detecta cuándo tiene que pedirte permiso.</li></ul><p>Y si piden contenido visual, puede preparar el concepto completo y, conectando un servicio de imágenes, generar también la creatividad final.</p><div class="wa-proof-actions"><a class="wa-primary" href="/ejemplos-whatsapp.html">Ver ejemplos completos →</a><a class="wa-secondary" href="/whatsapp-prueba.html">Probar conversación →</a></div><div class="wa-proof-note">Los ejemplos enseñan el comportamiento esperado. Las acciones reales dependen de los servicios que el cliente autorice conectar.</div></div>
        </div></div>`;
      anchor.parentNode.insertBefore(section,anchor);
    }
  }
});
