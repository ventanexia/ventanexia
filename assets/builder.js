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
const chip=(x,cls="")=>`<span class="${cls}">${escapeHtml(x)}</span>`;
const list=(arr)=>arr?.length?arr.map(x=>`<li>${escapeHtml(x)}</li>`).join(""):"<li>Por validar en diagnóstico</li>";
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
$("#builderForm").onsubmit=async e=>{
 e.preventDefault();const f=new FormData(e.currentTarget),m=$("#builderMsg");
 m.textContent="VNX Architect está diseñando el sistema…";
 const payload={company:f.get("company"),name:f.get("name"),email:f.get("email"),role:f.get("role"),volume:f.get("volume"),tools:f.get("tools"),request:f.get("request"),website:f.get("website"),consent:f.get("consent")==="on",source_url:location.href};
 try{
  const r=await fetch("/api/solution-builder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const j=await r.json(); if(!r.ok)throw new Error(j.error||"No se pudo generar el blueprint");
  lastRequestId=j.requestId||null;lastTrialToken=j.trialToken||null; const b=j.blueprint||{};$("#outputEmpty").hidden=true;$("#outputReady").hidden=false;
  $("#bpSummary").textContent=b.summary||"Blueprint preparado";$("#fitBand").textContent=j.fitBand||"DISCOVERY";
  $("#bpGoals").innerHTML=(b.goals||[]).map(x=>chip(x)).join("");$("#bpModules").innerHTML=(b.modules||[]).map(x=>chip(x)).join("");
  $("#bpAgents").innerHTML=(b.agents||[]).map(x=>chip(x)).join("");$("#bpAutomations").innerHTML=list(b.automations);
  $("#bpIntegrations").innerHTML=list(b.integrations_required);$("#bpApprovals").innerHTML=list(b.approvals_required);
  $("#bpNext").textContent=b.next_step||"Preparar diagnóstico";
  if(j.planRecommendation){
    const p=j.planRecommendation;
    const price=p.monthly?`${p.monthly.toLocaleString("es-ES")} €/mes + IVA`:`Desde ${p.monthlyFrom?.toLocaleString("es-ES")} €/mes`;
    const setup=typeof p.setup==="number"?` · Implantación ${p.setup.toLocaleString("es-ES")} € + IVA`:" · Implantación a medida";
    $("#planRecommendation").innerHTML=`<b>${escapeHtml(p.name)}</b><span>${escapeHtml(price+setup)}</span><small>${escapeHtml(p.reason||"")}</small>`;
  }m.textContent="Blueprint inicial generado. No se ha instalado ni modificado ningún sistema.";
  if(lastRequestId&&lastTrialToken)$("#startTrial").hidden=false; $("#outputReady").scrollIntoView({behavior:"smooth",block:"nearest"});
 }catch(err){m.textContent=err.message||"No se pudo generar. Inténtalo de nuevo."}
};
const trialBtn=$("#startTrial");
if(trialBtn) trialBtn.onclick=async()=>{
 if(!lastRequestId)return;
 const m=$("#trialMsg");m.textContent="Preparando tu demo personalizada…";trialBtn.disabled=true;
 try{
  const r=await fetch("/api/start-trial",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({solutionId:lastRequestId,trialToken:lastTrialToken,deviceId:getTrialDeviceId()})});
  const j=await r.json();if(!r.ok)throw new Error(j.error||"No se pudo iniciar la demo");
  const end=new Date(j.trialEndsAt).toLocaleString("es-ES");
  m.innerHTML=`Demo activada hasta <b>${escapeHtml(end)}</b>. El acceso se suspenderá automáticamente si no se contrata antes de esa fecha.`;
  trialBtn.textContent="Demo activada ✓";
 }catch(e){m.textContent=e.message;trialBtn.disabled=false}
};
