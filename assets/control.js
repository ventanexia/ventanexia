const $=s=>document.querySelector(s);
const login=$("#login"), app=$("#app"), logout=$("#logout");
async function json(url,options){const r=await fetch(url,options);let j={};try{j=await r.json()}catch{};if(!r.ok)throw Object.assign(new Error(j.error||"Error"),{status:r.status,data:j});return j}
$("#loginForm").onsubmit=async e=>{e.preventDefault();$("#loginMsg").textContent="Comprobando…";try{await json("/api/admin-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:$("#password").value})});$("#password").value="";await load()}catch(err){$("#loginMsg").textContent=err.message}};
logout.onclick=async()=>{await fetch("/api/admin-logout",{method:"POST"});location.reload()};
$("#refresh").onclick=()=>load();
$("#tenantForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);$("#install").textContent="Preparando…";try{const j=await json("/api/admin-tenants",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(f))});$("#install").textContent=`Cliente preparado.\nPublic key: ${j.install.publicKey}\n\nInstalación:\n${j.install.script}`;e.currentTarget.reset();await load()}catch(err){$("#install").textContent=err.message}};
async function decide(id,decision){const note=decision==="reject"?prompt("Motivo del rechazo (opcional):"):"";try{await json("/api/admin-approval",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,decision,note})});await load()}catch(e){alert(e.message)}}
function renderApprovals(rows){const box=$("#approvals");if(!rows.length){box.innerHTML='<p>No hay acciones pendientes.</p>';return}box.innerHTML='<div class="list">'+rows.map(a=>`<div class="item"><div><b>${esc(a.title)}</b><small>${esc(a.agent_key)} · ${esc(a.action_type)} · riesgo ${esc(a.risk)}</small><small>${esc(a.rationale||"")}</small></div><div class="actions"><button onclick="decide('${a.id}','approve')">Autorizar</button><button class="reject" onclick="decide('${a.id}','reject')">Rechazar</button></div></div>`).join("")+'</div>'}
function renderTenants(rows){$("#tenants").innerHTML=rows.map(t=>`<div class="tenant"><div><b>${esc(t.name)}</b><div>${esc(t.domain||"Sin dominio")} · ${esc(t.status)} · ${esc(t.autonomy_level)}</div></div><code>${esc(t.public_key)}</code></div>`).join("")||"<p>Aún no hay clientes.</p>"}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
async function load(){try{const j=await json("/api/admin-state");login.hidden=true;app.hidden=false;logout.hidden=false;
 const ints=j.integrations||{};$("#status").innerHTML=Object.entries(ints).map(([k,v])=>`<span class="pill ${v?"on":""}">${esc(k)} ${v?"✓":"—"}</span>`).join("");
 $("#integrations").innerHTML=Object.entries(ints).map(([k,v])=>`<div class="integration"><span>${esc(k)}</span><b>${v?"CONECTADO":"PENDIENTE"}</b></div>`).join("");
 $("#tenantCount").textContent=j.tenants.length;$("#approvalCount").textContent=j.approvals.length;$("#jobCount").textContent=j.jobs.filter(x=>!["done","failed","cancelled"].includes(x.status)).length;
 renderApprovals(j.approvals);renderTenants(j.tenants);
 }catch(e){if(e.status===401){login.hidden=false;app.hidden=true;logout.hidden=true}else{$("#loginMsg").textContent=e.message}}}
load();window.decide=decide;