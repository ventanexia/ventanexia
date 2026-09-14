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
    submit.disabled=true; msg.className="form-msg"; msg.textContent="Analizando y registrando tu solicitud…"; booking.hidden=true; booking.innerHTML="";
    syncChatContext?.();
    const data=Object.fromEntries(new FormData(form).entries());
    data.consentimiento=!!form.querySelector('[name="consentimiento"]').checked;
    try{
      const r=await fetch("/api/lead",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
      const j=await r.json();
      if(r.ok){
        msg.className="form-msg success";
        const highIntent=j.qualification?.band==="PRIORITY"||j.qualification?.band==="QUALIFIED";
        msg.textContent=highIntent?"Solicitud analizada. Tu caso encaja para continuar con diagnóstico.":"Solicitud recibida. Revisaremos el encaje y te contactaremos con el siguiente paso.";
        if(j.bookingUrl&&highIntent){
          booking.hidden=false;
          booking.innerHTML='<b>Siguiente paso recomendado: reserva tu diagnóstico.</b><br><a class="btn primary" target="_blank" rel="noopener" href="'+encodeURI(j.bookingUrl)+'">Elegir horario →</a>';
        }
        const keep={empresa:data.empresa,nombre:data.nombre,email:data.email,telefono:data.telefono};
        form.reset();
        ["empresa","nombre","email","telefono"].forEach(k=>{const el=form.querySelector(`[name="${k}"]`);if(el)el.value=keep[k]||""});
        calcValues();
      } else if(j.code==="NOT_CONFIGURED"){
        msg.innerHTML='La automatización CRM está preparada pero pendiente de activación. Puedes escribir ahora a <a href="mailto:demo@ventanexia.es">demo@ventanexia.es</a>.';
      } else throw new Error(j.error||"Error");
    }catch(err){
      msg.className="form-msg error";
      msg.innerHTML='No se pudo enviar automáticamente. Escríbenos a <a href="mailto:demo@ventanexia.es">demo@ventanexia.es</a>.';
    }finally{submit.disabled=false}
  });

  const launch=document.getElementById("vnxAiLaunch");
  const panel=document.getElementById("vnxAiPanel");
  const close=document.getElementById("vnxAiClose");
  const send=document.getElementById("vnxAiSend");
  const input=document.getElementById("vnxAiInput");
  const messagesEl=document.getElementById("vnxAiMessages");
  const demoLink=document.getElementById("vnxAiDemo");
  const history=[{role:"assistant",content:"Hola. Soy VentaNexIA AI. Puedo ayudarte a detectar qué parte de tu proceso comercial merece automatizarse primero. ¿A qué se dedica tu empresa?"}];
  function syncChatContext(){
    const field=document.getElementById("formChatContext");
    if(!field)return;
    field.value=history.slice(-8).map(m=>`${m.role}: ${m.content}`).join("\n").slice(0,5000);
  }

  function toggle(open){panel?.classList.toggle("open",open);panel?.setAttribute("aria-hidden",open?"false":"true");if(open)setTimeout(()=>input?.focus(),50)}
  function addMsg(text,type){const d=document.createElement("div");d.className=`vnx-msg ${type}`;d.textContent=text;messagesEl.appendChild(d);messagesEl.scrollTop=messagesEl.scrollHeight;return d}
  async function sendChat(){
    const text=input.value.trim();if(!text)return;
    addMsg(text,"user");history.push({role:"user",content:text});syncChatContext();input.value="";send.disabled=true;const wait=addMsg("Analizando…","bot");
    try{
      const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages:history.slice(-12)})});
      const j=await r.json();wait.remove();
      if(r.ok&&j.reply){addMsg(j.reply,"bot");history.push({role:"assistant",content:j.reply});syncChatContext()}
      else if(j.code==="NOT_CONFIGURED")addMsg("El asistente real está preparado pero todavía pendiente de activar su credencial segura. Puedes solicitar el diagnóstico directamente desde el formulario.","error");
      else throw new Error(j.error||"error");
    }catch(e){wait.remove();addMsg("Ahora mismo no puedo responder. Puedes solicitar un diagnóstico y el equipo continuará contigo.","error")}
    finally{send.disabled=false;input.focus()}
  }
  launch?.addEventListener("click",()=>toggle(true));close?.addEventListener("click",()=>toggle(false));demoLink?.addEventListener("click",()=>{syncChatContext();toggle(false)});send?.addEventListener("click",sendChat);input?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat()}});
});
