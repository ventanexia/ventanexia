function getTrialDeviceId(){
  const key="vnx_trial_device";
  let id=localStorage.getItem(key);
  if(!id){
    id=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(key,id);
  }
  return id;
}
let lastRequestId=null,lastTrialToken=null;
const $=s=>document.querySelector(s);
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
const chip=(x,cls="")=>`<span class="${cls}">${escapeHtml(x)}</span>`;
const list=(arr)=>arr?.length?arr.map(x=>`<li>${escapeHtml(x)}</li>`).join(""):"<li>Lo revisaremos contigo</li>";

const agentNames={
  guardian:"Ayudante que controla permisos y límites",
  scout:"Ayudante que busca posibles clientes",
  enrich:"Ayudante que completa datos de clientes",
  outreach:"Ayudante que prepara primeros contactos",
  inbox:"Ayudante que responde y ordena mensajes",
  qualify:"Ayudante que detecta quién tiene interés real",
  scheduler:"Ayudante que organiza reuniones",
  crm:"Ayudante que mantiene ordenados los clientes",
  proposal:"Ayudante que prepara propuestas",
  content:"Ayudante que prepara publicaciones",
  analyst:"Ayudante que revisa resultados",
  provision:"Ayudante que prepara las conexiones necesarias"
};
function simpleAgent(x){return agentNames[String(x||"").trim().toLowerCase()]||String(x||"")}
function simpleText(x){
  return String(x||"")
    .replace(/blueprint/gi,"propuesta")
    .replace(/onboarding/gi,"puesta en marcha")
    .replace(/pipeline/gi,"ventas en marcha")
    .replace(/crm/gi,"organización de clientes")
    .replace(/inbox/gi,"mensajes y correos")
    .replace(/cualificaci[oó]n/gi,"detectar quién tiene interés real")
    .replace(/captaci[oó]n y prospecci[oó]n/gi,"buscar posibles clientes")
    .replace(/next best action/gi,"siguiente paso recomendado")
    .replace(/trazabilidad/gi,"tener todo bien registrado")
    .replace(/automatizaci[oó]n comercial/gi,"tareas de ventas hechas automáticamente")
    .replace(/automatizaci[oó]n de proceso/gi,"tareas que el sistema puede hacer por ti")
    .replace(/integraciones?/gi,"conexiones")
    .replace(/credenciales/gi,"accesos a tus programas")
    .replace(/instalaci[oó]n en producci[oó]n/gi,"activarlo para trabajar de verdad")
    .replace(/condiciones econ[oó]micas\/contractuales/gi,"precios y condiciones del servicio")
    .replace(/diagn[oó]stico/gi,"revisión de tu caso");
}
function simpleBand(x){
  const m={PRIORITY:"Encaja muy bien",QUALIFIED:"Buen encaje",NURTURE:"Podría encajar",DISCOVERY:"Hay que revisarlo"};
  return m[String(x||"").toUpperCase()]||"Propuesta preparada";
}
function prefillFromPortada(){
  try{
    const raw=sessionStorage.getItem("vnx_builder_prefill");
    if(!raw)return;
    const d=JSON.parse(raw);const form=$("#builderForm");if(!form)return;
    const values={company:d.company,name:d.name,email:d.email,role:d.role,volume:d.volume,request:d.request};
    Object.entries(values).forEach(([name,value])=>{const el=form.querySelector(`[name="${name}"]`);if(el&&value&&!el.value)el.value=value});
    sessionStorage.removeItem("vnx_builder_prefill");
    const m=$("#builderMsg");if(m)m.textContent="Ya hemos traído los datos que escribiste. Revisa que estén bien, marca la casilla y pulsa “Ver mi propuesta”.";
  }catch{}
}
prefillFromPortada();

$("#builderForm").onsubmit=async e=>{
 e.preventDefault();const f=new FormData(e.currentTarget),m=$("#builderMsg");
 m.textContent="Estamos preparando una propuesta para ti…";
 const payload={company:f.get("company"),name:f.get("name"),email:f.get("email"),role:f.get("role"),volume:f.get("volume"),tools:f.get("tools"),request:f.get("request"),website:f.get("website"),consent:f.get("consent")==="on",source_url:location.href};
 try{
  const r=await fetch("/api/solution-builder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const j=await r.json(); if(!r.ok)throw new Error(j.error||"No hemos podido preparar la propuesta");
  lastRequestId=j.requestId||null;lastTrialToken=j.trialToken||null; const b=j.blueprint||{};$("#outputEmpty").hidden=true;$("#outputReady").hidden=false;
  $("#bpSummary").textContent=simpleText(b.summary||"Ya tenemos una propuesta para ti");$("#fitBand").textContent=simpleBand(j.fitBand);
  $("#bpGoals").innerHTML=(b.goals||[]).map(x=>chip(simpleText(x))).join("");$("#bpModules").innerHTML=(b.modules||[]).map(x=>chip(simpleText(x))).join("");
  $("#bpAgents").innerHTML=(b.agents||[]).map(x=>chip(simpleAgent(x))).join("");$("#bpAutomations").innerHTML=list((b.automations||[]).map(simpleText));
  $("#bpIntegrations").innerHTML=list((b.integrations_required||[]).map(simpleText));$("#bpApprovals").innerHTML=list((b.approvals_required||[]).map(simpleText));
  $("#bpNext").textContent=simpleText(b.next_step||"Revisar contigo los últimos detalles");
  if(j.planRecommendation){
    const p=j.planRecommendation;
    const price=p.monthly?`${p.monthly.toLocaleString("es-ES")} €/mes + IVA`:`Desde ${p.monthlyFrom?.toLocaleString("es-ES")} €/mes`;
    $("#planRecommendation").innerHTML=`<b>${escapeHtml(p.name)}</b><span>${escapeHtml(price)}</span><small>${escapeHtml(simpleText(p.reason||"Este plan encaja con lo que has pedido."))}</small>`;
  }m.textContent="Propuesta preparada. Todavía no hemos conectado ni cambiado nada en tus programas.";
  if(lastRequestId&&lastTrialToken)$("#startTrial").hidden=false; $("#outputReady").scrollIntoView({behavior:"smooth",block:"nearest"});
 }catch(err){m.textContent=err.message||"No hemos podido preparar la propuesta. Inténtalo de nuevo."}
};
const trialBtn=$("#startTrial");
if(trialBtn) trialBtn.onclick=async()=>{
 if(!lastRequestId)return;
 const m=$("#trialMsg");m.textContent="Preparando tu prueba personalizada…";trialBtn.disabled=true;
 try{
  const r=await fetch("/api/start-trial",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({solutionId:lastRequestId,trialToken:lastTrialToken,deviceId:getTrialDeviceId()})});
  const j=await r.json();if(!r.ok)throw new Error(j.error||"No se pudo iniciar la prueba");
  const end=new Date(j.trialEndsAt).toLocaleString("es-ES");
  m.innerHTML=`Prueba activada hasta <b>${escapeHtml(end)}</b>. Si decides no contratarlo, se cerrará automáticamente al terminar ese plazo.`;
  trialBtn.textContent="Prueba activada ✓";
 }catch(e){m.textContent=e.message;trialBtn.disabled=false}
};
