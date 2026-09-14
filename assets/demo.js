const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const titles={overview:"Resumen comercial",leads:"Lead y cualificación",pipeline:"Política de pipeline",agents:"Agentes IA",audit:"Auditoría"};
qa(".demo-nav").forEach(b=>b.onclick=()=>{qa(".demo-nav").forEach(x=>x.classList.remove("active"));b.classList.add("active");qa(".demo-panel").forEach(p=>p.classList.remove("active"));q(`[data-panel="${b.dataset.tab}"]`).classList.add("active");q("#demoTitle").textContent=titles[b.dataset.tab]});
const samples=[
 {company:"Norte Industrial",role:"Director Comercial",need:"Seguimiento y CRM",score:76,band:"QUALIFIED"},
 {company:"Clínica Horizonte",role:"Gerencia",need:"Respuesta a leads y agenda",score:88,band:"PRIORITY"},
 {company:"Servicios Delta",role:"Responsable de Ventas",need:"Prospección y seguimiento",score:69,band:"NURTURE"},
 {company:"Software Atlas",role:"CEO",need:"Pipeline y automatización",score:92,band:"PRIORITY"}];
let i=0;
q("#simulateLead").onclick=()=>{i=(i+1)%samples.length;const s=samples[i];q("#leadCompany").textContent=s.company;q("#leadRole").textContent=s.role;q("#leadNeed").textContent=s.need;q("#leadBand").textContent=s.band;q("#scoreText").textContent=`Score interno de demostración: ${s.score}/100. Este dato no se muestra al prospecto.`;q("#scoreFill").style.width=s.score+"%";q("#mLeads").textContent=Number(q("#mLeads").textContent)+1;if(s.score>=70)q("#mOpps").textContent=Number(q("#mOpps").textContent)+1;q("#nba").innerHTML=`<b>${s.band==="PRIORITY"?"Proponer reunión prioritaria":"Completar diagnóstico"} con ${s.company}</b><p>Motivo demo: ${s.need.toLowerCase()} · score ${s.score}/100.</p><button class="micro-btn" id="prepareAction">Preparar respuesta</button>`;wireAction();qa(".demo-nav")[1].click()};
function wireAction(){const b=q("#prepareAction");if(!b)return;b.onclick=()=>{b.textContent="Borrador preparado ✓";b.disabled=true;q("#mActions").textContent=Math.max(0,Number(q("#mActions").textContent)-1)}}
wireAction();