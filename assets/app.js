document.addEventListener("DOMContentLoaded",()=>{
  const navToggle=document.getElementById("navToggle");
  const mainNav=document.getElementById("mainNav");
  function closeNav(){mainNav?.classList.remove("open");navToggle?.setAttribute("aria-expanded","false");}
  navToggle?.addEventListener("click",()=>{const open=!mainNav?.classList.contains("open");mainNav?.classList.toggle("open",open);navToggle?.setAttribute("aria-expanded",open?"true":"false")});
  mainNav?.querySelectorAll("a").forEach(a=>a.addEventListener("click",closeNav));

  const eur=new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0});
  const qs=new URLSearchParams(location.search);
  const source=document.getElementById("formSource");
  const utmSource=document.getElementById("formUtmSource");
  const utmMedium=document.getElementById("formUtmMedium");
  const utmCampaign=document.getElementById("formUtmCampaign");
  if(source) source.value=location.href.slice(0,1000);
  if(utmSource) utmSource.value=(qs.get("utm_source")||"").slice(0,150);
  if(utmMedium) utmMedium.value=(qs.get("utm_medium")||"").slice(0,150);
  if(utmCampaign) utmCampaign.value=(qs.get("utm_campaign")||"").slice(0,150);

  const calc={
    leads:document.getElementById("calcLeads"),ticket:document.getElementById("calcTicket"),
    conv:document.getElementById("calcConv"),loss:document.getElementById("calcLoss")
  };
  const outs={
    leads:document.getElementById("calcLeadsOut"),ticket:document.getElementById("calcTicketOut"),
    conv:document.getElementById("calcConvOut"),loss:document.getElementById("calcLossOut"),risk:document.getElementById("calcRisk")
  };
  function calcValues(){
    if(!calc.leads) return {pipeline:0,risk:0};
    const leads=Number(calc.leads.value),ticket=Number(calc.ticket.value),conv=Number(calc.conv.value)/100,loss=Number(calc.loss.value)/100;
    const pipeline=leads*ticket*conv; const risk=pipeline*loss;
    outs.leads.textContent=String(leads);outs.ticket.textContent=eur.format(ticket);outs.conv.textContent=`${calc.conv.value}%`;outs.loss.textContent=`${calc.loss.value}%`;outs.risk.textContent=eur.format(risk);
    const fp=document.getElementById("formPipeline"),fr=document.getElementById("formRisk");
    if(fp) fp.value=Math.round(pipeline); if(fr) fr.value=Math.round(risk);
    return {pipeline,risk};
  }
  Object.values(calc).forEach(el=>el?.addEventListener("input",calcValues));calcValues();
  document.getElementById("calcToDemo")?.addEventListener("click",()=>{
    const form=document.getElementById("leadForm");
    if(form){
      const v=calcValues();
      const volume=form.querySelector('[name="volumen"]'); const ticket=form.querySelector('[name="ticket"]');
      if(volume&&!volume.value) volume.value=calc.leads.value;
      if(ticket&&!ticket.value) ticket.value=calc.ticket.value;
      document.getElementById("demo")?.scrollIntoView({behavior:"smooth"});
      setTimeout(()=>form.querySelector('input[name="empresa"]')?.focus(),450);
    }
  });

  const form=document.getElementById("leadForm");
  const msg=document.getElementById("formMsg");
  const booking=document.getElementById("bookingBox");
  form?.addEventListener("submit",async e=>{
    e.preventDefault();
    const submit=form.querySelector('button[type="submit"]');
    submit.disabled=true; msg.className="form-msg"; msg.textContent="Preparando tu solicitud…"; booking.hidden=true; booking.innerHTML="";
    syncChatContext?.();
    const data=Object.fromEntries(new FormData(form).entries());
    data.consentimiento=!!form.querySelector('[name="consentimiento"]').checked;
    try{
      const r=await fetch("/api/lead",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
      const j=await r.json();
      if(r.ok){
        msg.className="form-msg success";
        const highIntent=j.qualification?.band==="PRIORITY"||j.qualification?.band==="QUALIFIED";
        msg.textContent=highIntent?"Hemos recibido tu solicitud. Tu caso encaja bien y te mostraremos el siguiente paso.":"Hemos recibido tu solicitud. Te explicaremos cómo podría ayudarte VentaNexIA con tu caso.";
        if(j.bookingUrl&&highIntent){
          booking.hidden=false;
          booking.innerHTML='<b>Si quieres, elige un horario para que te lo expliquemos.</b><br><a class="btn primary" target="_blank" rel="noopener" href="'+encodeURI(j.bookingUrl)+'">Elegir horario →</a>';
        }
        const keep={empresa:data.empresa,nombre:data.nombre,email:data.email,telefono:data.telefono};
        form.reset();
        ["empresa","nombre","email","telefono"].forEach(k=>{const el=form.querySelector(`[name="${k}"]`);if(el)el.value=keep[k]||""});
        calcValues();
      } else if(j.code==="NOT_CONFIGURED"){
        msg.className="form-msg success";
        msg.innerHTML='Hemos preparado tu solicitud, pero el envío automático todavía no está activado. Puedes escribirnos a <a href="mailto:demo@ventanexia.es">demo@ventanexia.es</a> y te ayudaremos.';
      } else throw new Error(j.error||"Error");
    }catch(err){
      msg.className="form-msg error";
      msg.innerHTML='No hemos podido enviar la solicitud ahora mismo. Puedes escribirnos a <a href="mailto:demo@ventanexia.es">demo@ventanexia.es</a> y te ayudaremos.';
    }finally{submit.disabled=false}
  });

  const launch=document.getElementById("vnxAiLaunch");
  const panel=document.getElementById("vnxAiPanel");
  const close=document.getElementById("vnxAiClose");
  const send=document.getElementById("vnxAiSend");
  const input=document.getElementById("vnxAiInput");
  const messagesEl=document.getElementById("vnxAiMessages");
  const demoLink=document.getElementById("vnxAiDemo");
  const history=[{role:"assistant",content:"Hola. Soy el ayudante de VentaNexIA. Puedo ayudarte a ver qué tareas de tu empresa podrías dejar de hacer a mano. ¿A qué se dedica tu empresa?"}];
  function syncChatContext(){
    const field=document.getElementById("formChatContext");
    if(!field)return;
    field.value=history.slice(-8).map(m=>`${m.role}: ${m.content}`).join("\n").slice(0,5000);
  }

  function toggle(open){panel?.classList.toggle("open",open);panel?.setAttribute("aria-hidden",open?"false":"true");if(open)setTimeout(()=>input?.focus(),50)}
  function addMsg(text,type){const d=document.createElement("div");d.className=`vnx-msg ${type}`;d.textContent=text;messagesEl.appendChild(d);messagesEl.scrollTop=messagesEl.scrollHeight;return d}
  async function sendChat(){
    const text=input.value.trim();if(!text)return;
    addMsg(text,"user");history.push({role:"user",content:text});syncChatContext();input.value="";send.disabled=true;const wait=addMsg("Pensando…","bot");
    try{
      const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages:history.slice(-12)})});
      const j=await r.json();wait.remove();
      if(r.ok&&j.reply){addMsg(j.reply,"bot");history.push({role:"assistant",content:j.reply});syncChatContext()}
      else if(j.code==="NOT_CONFIGURED")addMsg("Este ayudante todavía no está activado. Puedes contarnos tu caso en el formulario y te explicaremos cómo podría ayudarte VentaNexIA.","error");
      else throw new Error(j.error||"error");
    }catch(e){wait.remove();addMsg("Ahora mismo no puedo responder. Puedes contarnos tu caso en el formulario y seguiremos contigo desde ahí.","error")}
    finally{send.disabled=false;input.focus()}
  }
  launch?.addEventListener("click",()=>toggle(true));close?.addEventListener("click",()=>toggle(false));demoLink?.addEventListener("click",()=>{syncChatContext();toggle(false)});send?.addEventListener("click",sendChat);input?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat()}});

  const tutorialSteps=[
    {icon:"✉",label:"PASO 1 · LLEGA UNA CONSULTA",title:"Una persona pide información",text:"Puede escribir desde tu web, un formulario o un correo. La consulta entra en un único lugar para que nadie tenga que buscarla.",example:"“Hola, necesito información para mi empresa.”"},
    {icon:"⌕",label:"PASO 2 · ENTIENDE LA PETICIÓN",title:"VentaNexIA ordena lo importante",text:"Identifica quién escribe, qué necesita y si parece urgente. Si falta información, prepara una pregunta sencilla.",example:"Necesidad: mejorar el seguimiento · Prioridad: revisar hoy"},
    {icon:"▤",label:"PASO 3 · GUARDA LOS DATOS",title:"La ficha queda preparada",text:"Nombre, empresa, petición y mensajes aparecen juntos. Tu equipo ya no tiene que copiar la misma información en varios sitios.",example:"Cliente y consulta reunidos en una sola ficha"},
    {icon:"✎",label:"PASO 4 · PREPARA LA RESPUESTA",title:"Tu equipo empieza con el trabajo adelantado",text:"El ayudante propone una respuesta usando solo la información que has aprobado. Tú puedes revisarla antes de enviarla.",example:"Respuesta preparada · Pendiente de tu aprobación"},
    {icon:"⏰",label:"PASO 5 · RECUERDA EL SEGUIMIENTO",title:"Ningún posible cliente queda olvidado",text:"Si la persona no responde o falta una tarea, VentaNexIA avisa al responsable en el momento adecuado.",example:"Recordatorio: volver a contactar el jueves a las 10:00"},
    {icon:"✓",label:"PASO 6 · TU EQUIPO DECIDE",title:"Las personas mantienen el control",text:"Tu equipo ve qué necesita atención, aprueba lo importante, habla con el cliente y cierra el acuerdo. El sistema se ocupa del orden.",example:"Hoy: 3 respuestas para revisar · 2 llamadas pendientes"}
  ];
  const tutorial={
    icon:document.getElementById("tutorialIcon"),label:document.getElementById("tutorialLabel"),
    title:document.getElementById("tutorialTitle"),text:document.getElementById("tutorialText"),
    example:document.getElementById("tutorialExample"),counter:document.getElementById("tutorialCounter"),
    progress:document.getElementById("tutorialProgress"),play:document.getElementById("tutorialPlay")
  };
  let tutorialIndex=0,tutorialTimer=null;
  function renderTutorial(){
    const step=tutorialSteps[tutorialIndex];
    if(!tutorial.title)return;
    tutorial.icon.textContent=step.icon;tutorial.label.textContent=step.label;tutorial.title.textContent=step.title;
    tutorial.text.textContent=step.text;tutorial.example.textContent=step.example;
    tutorial.counter.textContent=`${tutorialIndex+1} de ${tutorialSteps.length}`;
    tutorial.progress.style.width=`${((tutorialIndex+1)/tutorialSteps.length)*100}%`;
  }
  function stopTutorial(){if(tutorialTimer)clearInterval(tutorialTimer);tutorialTimer=null;if(tutorial.play)tutorial.play.textContent="▶ Reproducir"}
  function startTutorial(){
    if(tutorialTimer){stopTutorial();return}
    if(tutorial.play)tutorial.play.textContent="❚❚ Pausar";
    tutorialTimer=setInterval(()=>{tutorialIndex=(tutorialIndex+1)%tutorialSteps.length;renderTutorial()},7000);
  }
  document.getElementById("tutorialPrev")?.addEventListener("click",()=>{tutorialIndex=(tutorialIndex-1+tutorialSteps.length)%tutorialSteps.length;renderTutorial()});
  document.getElementById("tutorialNext")?.addEventListener("click",()=>{tutorialIndex=(tutorialIndex+1)%tutorialSteps.length;renderTutorial()});
  tutorial.play?.addEventListener("click",startTutorial);
  document.getElementById("tutorialSpeak")?.addEventListener("click",()=>{
    if(!("speechSynthesis" in window))return;
    speechSynthesis.cancel();
    const step=tutorialSteps[tutorialIndex];
    const voice=new SpeechSynthesisUtterance(`${step.title}. ${step.text}`);voice.lang="es-ES";voice.rate=.95;speechSynthesis.speak(voice);
  });
  renderTutorial();
});
