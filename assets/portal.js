
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let portalState=null, timer=null;
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function labelState(s){return ({trial:"Demo",active:"Activo",suspended:"Suspendido",cancelled:"Cancelado"})[s]||s||"—"}
function empty(text){return `<div><span>${esc(text)}</span></div>`}
function bindTabs(){
 $$(".pnav").forEach(b=>b.onclick=()=>{$$(".pnav").forEach(x=>x.classList.remove("active"));b.classList.add("active");$$(".ptab").forEach(x=>x.classList.remove("active"));$(`[data-panel="${b.dataset.tab}"]`).classList.add("active")});
}
async function load(){
 try{
  const r=await fetch("/api/portal-state",{credentials:"same-origin"}),j=await r.json();
  if(r.status===401||!j.authenticated){$("#portalLogin").hidden=false;$("#portalApp").hidden=true;return}
  portalState=j;$("#portalLogin").hidden=true;$("#portalApp").hidden=false;render(j);
 }catch{$("#portalLogin").hidden=false;$("#portalApp").hidden=true}
}
function setOnboarding(profile){
 const p=profile||{},cp=p.company_profile||{},bv=p.brand_voice||{},rules=p.commercial_rules||{};
 if($("#obBusiness"))$("#obBusiness").value=cp.business_summary||"";
 if($("#obTargets"))$("#obTargets").value=cp.target_customers||"";
 if($("#obWebsite"))$("#obWebsite").value=cp.website||"";
 if($("#obVoice"))$("#obVoice").value=bv.tone||"";
 if($("#obForbidden"))$("#obForbidden").value=bv.forbidden_claims||"";
 if($("#obKnowledge"))$("#obKnowledge").value=(p.knowledge_sources||[]).map(x=>x.url||"").filter(Boolean).join("\n");
 const selected=new Set(p.desired_channels||[]);$$('.channel-checks input[type="checkbox"]').forEach(x=>x.checked=selected.has(x.value));
 if($("#obRules"))$("#obRules").value=rules.notes||"";
 if($("#obDiscount"))$("#obDiscount").checked=rules.discounts_require_approval!==false;
 if($("#obContracts"))$("#obContracts").checked=rules.contracts_require_approval!==false;
 if($("#obBulk"))$("#obBulk").checked=rules.bulk_outbound_requires_approval!==false;
}
async function reactivate(){
 const btn=$("#reactivateBilling")||$("#reactivateTop");if(btn)btn.disabled=true;
 try{const r=await fetch("/api/portal-reactivate",{method:"POST"}),j=await r.json();if(r.ok&&j.url){location.href=j.url;return}throw new Error(j.error||"No se pudo reactivar")}catch(e){alert(e.message)}finally{if(btn)btn.disabled=false}
}
function render(j){
 $("#tenantName").textContent=j.tenant?.name||"Mi empresa";
 const ent=j.entitlement||{};$("#licensePill").textContent=`${labelState(ent.state)} · ${(ent.plan||"core").toUpperCase()}`;
 $("#paAgents").textContent=`${j.summary.activeAgents}/${j.summary.totalAgents}`;
 $("#paIntegrations").textContent=`${j.summary.connectedIntegrations}/${j.summary.totalIntegrations}`;
 $("#paApprovals").textContent=j.summary.pendingApprovals;$("#paState").textContent=labelState(ent.state);
 $("#currentPlan").textContent=`VNX ${(ent.plan||"core")[0].toUpperCase()+(ent.plan||"core").slice(1)}`;
 $("#billingState").textContent=ent.state==="active"?"Suscripción activa.":ent.state==="trial"?"Demo de 3 días activa.":"Acceso suspendido o pendiente de pago.";
 const readOnly=Boolean(ent.readOnly);$("#suspendBanner").hidden=!readOnly;$("#reactivateBilling").hidden=!ent.canReactivate;$("#reactivateTop").hidden=!ent.canReactivate;
 const totalUsage=Object.values(j.usageMonthly?.byCapability||{}).reduce((a,b)=>a+Number(b||0),0);$("#usageSummary").textContent=`Acciones registradas este mes: ${totalUsage.toLocaleString("es-ES")}`;
 setOnboarding(j.onboarding);
 $("#requestForm").querySelectorAll("textarea,select,button").forEach(x=>x.disabled=readOnly);
 $("#onboardingForm").querySelectorAll("textarea,input,button").forEach(x=>x.disabled=readOnly);
 if(ent.state==="trial"&&ent.trialEndsAt){$("#trialBanner").hidden=false;startCountdown(ent.trialEndsAt)}else $("#trialBanner").hidden=true;
 $("#approvalList").innerHTML=(j.approvals||[]).length?(j.approvals||[]).map(x=>`<div><b>${esc(x.title)}</b><span>${esc(x.rationale||"")}</span><small>Riesgo: ${esc(x.risk||"normal")}</small></div>`).join(""):empty("No hay aprobaciones pendientes.");
 const actions=[...(j.changeRequests||[]).filter(x=>!["completed","rejected"].includes(x.status)).slice(0,3),...(j.socialPosts||[]).filter(x=>["approval_required","scheduled"].includes(x.status)).slice(0,3)];
 $("#nextActions").innerHTML=actions.length?actions.map(x=>`<div><b>${esc(x.request_text||x.topic||"Acción programada")}</b><span>${esc(x.status||"")}</span></div>`).join(""):empty("VNX no necesita nada de ti ahora.");
 $("#agentGrid").innerHTML=(j.agents||[]).map(a=>`<article><b><i class="status-dot ${a.enabled?"":"off"}"></i>${esc(a.name)}</b><span>${esc(a.mode)}</span><small>${a.enabled?"Activo":"Pausado"}</small></article>`).join("")||empty("Todavía no hay agentes.");
 $("#connectionGrid").innerHTML=(j.connections||[]).map(c=>`<article><b>${esc(c.provider)}</b><span>${esc(c.purpose)} · ${esc(c.status)}</span></article>`).join("")||empty("Todavía no hay integraciones.");
 $("#socialList").innerHTML=(j.socialPosts||[]).map(p=>`<div class="social-post-row"><b>${esc(p.channel)}</b><span>${esc(p.topic||p.copy?.slice(0,90)||"Contenido")}</span><small>${p.scheduled_for?new Date(p.scheduled_for).toLocaleString("es-ES"):esc(p.status)}</small></div>`).join("")||empty("Aún no hay contenido social en calendario.");
 $("#requestList").innerHTML=(j.changeRequests||[]).map(r=>`<div><b>${esc(r.request_text)}</b><span>${esc(r.status)} · prioridad ${esc(r.priority)}</span>${r.plan_impact?.upgradeSuggested?`<small>Puede requerir cambiar a ${esc(r.plan_impact.recommendedPlan)}</small>`:""}</div>`).join("")||empty("Todavía no has pedido cambios.");
}
function startCountdown(end){
 if(timer)clearInterval(timer);
 const paint=()=>{const ms=Math.max(0,new Date(end).getTime()-Date.now()),d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000);$("#trialClock").textContent=ms?`${d}d ${h}h ${m}m`:"Demo finalizada";if(!ms)clearInterval(timer)};
 paint();timer=setInterval(paint,30000);
}
$("#loginForm").onsubmit=async e=>{e.preventDefault();const m=$("#loginMsg");m.textContent="Enviando acceso seguro…";await fetch("/api/portal-request-link",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("#loginEmail").value})});m.textContent="Si el email corresponde a una cuenta, recibirás un enlace de acceso válido durante 20 minutos."};
$("#logoutBtn").onclick=async()=>{await fetch("/api/portal-logout",{method:"POST"});location.reload()};
$("#requestForm").onsubmit=async e=>{e.preventDefault();const m=$("#requestMsg"),btn=e.submitter;btn.disabled=true;m.textContent="VNX Builder está analizando tu petición…";try{const r=await fetch("/api/portal-change-request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request:$("#newRequest").value,priority:$("#requestPriority").value})});const j=await r.json();if(!r.ok)throw new Error(j.error||"No se pudo analizar");m.textContent=j.planImpact?.upgradeSuggested?`Blueprint preparado. Esta ampliación puede requerir el plan ${j.planImpact.recommendedPlan.toUpperCase()}.`:"Blueprint preparado y enviado a VNX Provision.";$("#newRequest").value="";await load()}catch(e){m.textContent=e.message}finally{btn.disabled=false}};
$("#manageBilling").onclick=async()=>{const r=await fetch("/api/portal-billing",{method:"POST"}),j=await r.json();if(r.ok&&j.url)location.href=j.url;else alert(j.error||"Facturación no disponible")};
$("#reactivateBilling").onclick=reactivate;$("#reactivateTop").onclick=reactivate;
$("#onboardingForm").onsubmit=async e=>{e.preventDefault();const m=$("#onboardingMsg"),btn=e.submitter;btn.disabled=true;m.textContent="Guardando configuración segura…";try{const channels=$$('.channel-checks input[type="checkbox"]:checked').map(x=>x.value),knowledgeSources=$("#obKnowledge").value.split(/\n+/).map(x=>x.trim()).filter(Boolean);const payload={businessSummary:$("#obBusiness").value,targetCustomers:$("#obTargets").value,website:$("#obWebsite").value,brandVoice:$("#obVoice").value,forbiddenClaims:$("#obForbidden").value,knowledgeSources,channels,rulesNotes:$("#obRules").value,discountsRequireApproval:$("#obDiscount").checked,contractsRequireApproval:$("#obContracts").checked,bulkOutboundRequiresApproval:$("#obBulk").checked};const r=await fetch("/api/onboarding-save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),j=await r.json();if(!r.ok)throw new Error(j.error||"No se pudo guardar");m.textContent="Configuración guardada. Las conexiones se autorizarán por separado y nunca pediremos tus contraseñas.";await load()}catch(e){m.textContent=e.message}finally{btn.disabled=false}};
bindTabs();load();
