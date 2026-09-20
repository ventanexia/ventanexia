// Centro Maestro · «Control del negocio»: ingresos, próximas cuotas, impagos, pruebas, contratos y uso por cliente de un vistazo.
// Usa el mismo dato del servidor que el resto del Centro Maestro (window.vnx.masterDashboard).
(()=>{
  if(window.__vnxMasterControl)return;window.__vnxMasterControl=true;
  const $=(s,r=document)=>r.querySelector(s);
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const eur=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:2,useGrouping:'always'}).format(Number(n||0));
  const day=v=>{const t=typeof v==='number'?v*1000:Date.parse(v||'');return Number.isFinite(t)&&t>0?new Date(t).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}):'—'};
  const TASKS={order_extractions:'Pedidos leídos con IA',email_ai_actions:'Correos con IA',lead_search:'Clientes buscados',lead_credits:'Créditos de captación',ai_heavy_tasks:'Tareas IA avanzadas',automation_runs:'Automatizaciones',seo_pages:'Páginas SEO',report_generations:'Informes generados',storage_mb:'Almacenamiento usado',video_credits:'Vídeos',voice_minutes:'Minutos de voz',whatsapp_messages:'Mensajes de WhatsApp',image_credits:'Imágenes'};
  const task=c=>TASKS[c]||String(c).replace(/_/g,' ');
  const style=document.createElement('style');
  style.textContent=`
  #vnxMasterControl{margin:0 0 20px}
  #vnxMasterControl .mc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:12px 0}
  #vnxMasterControl .mc-k{background:rgba(255,255,255,.05);border:1px solid rgba(255,196,80,.28);border-radius:14px;padding:13px 15px}
  #vnxMasterControl .mc-k b{display:block;font-size:1.55rem;line-height:1.15}#vnxMasterControl .mc-k span{opacity:.75;font-size:.86rem}
  #vnxMasterControl .mc-k.bad{border-color:rgba(255,110,110,.6)}#vnxMasterControl .mc-k.good{border-color:rgba(90,220,150,.5)}
  #vnxMasterControl .mc-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-top:8px}
  #vnxMasterControl table{width:100%;border-collapse:collapse}#vnxMasterControl th,#vnxMasterControl td{padding:7px 6px;border-bottom:1px solid rgba(255,255,255,.1);text-align:left;font-size:.9rem;vertical-align:top}
  #vnxMasterControl td.n,#vnxMasterControl th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  #vnxMasterControl h4{margin:14px 0 4px}#vnxMasterControl .mc-warn{background:rgba(255,190,60,.12);border:1px solid rgba(255,190,60,.4);border-radius:10px;padding:8px 12px;margin:8px 0;font-size:.88rem}
  #vnxMasterControl .mc-empty{opacity:.65;padding:6px 0;font-size:.9rem}#vnxMasterControl details{margin-top:14px}#vnxMasterControl details p{opacity:.85;line-height:1.5;margin:6px 0}`;
  document.head.appendChild(style);
  const table=(head,rows,empty)=>rows.length?'<table><thead><tr>'+head.map(h=>'<th'+(h.n?' class="n"':'')+'>'+esc(h.t)+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table>':'<div class="mc-empty">'+esc(empty)+'</div>';
  const k=(v,l,cls)=>'<div class="mc-k'+(cls?' '+cls:'')+'"><b>'+esc(v)+'</b><span>'+esc(l)+'</span></div>';
  function render(d){
    const q=d.kpis;if(!q)return '<div class="mc-warn">El servidor todavía no envía los indicadores del Centro Maestro.</div>';
    const m=q.money,c=q.clients;
    const warn=(d.warnings||[]).length?'<div class="mc-warn">Algunas fuentes no han respondido: '+esc(d.warnings.map(w=>w.source+' ('+w.error+')').join(' · '))+'. Lo demás se muestra con las fuentes disponibles.</div>':'';
    const cards=
      k(eur(m.mrr),'ingresos mensuales recurrentes (MRR)')+k(eur(m.arr),'al año (ARR)')+k(eur(m.cobradoMes),'cobrado este mes','good')
      +k(eur(m.proximos7),'a cobrar en los próximos 7 días')+k(eur(m.proximos30),'a cobrar en los próximos 30 días')
      +k(eur(m.pendienteDeCobro),'facturas pendientes de cobro',m.pendienteDeCobro>0?'bad':'')
      +k(c.activos+' / '+c.enPrueba+' / '+c.suspendidos,'clientes activos / en prueba / suspendidos')
      +k(c.nuevos30,'clientes nuevos (30 días)')+k(q.contracts.firmados30+' de '+q.contracts.total,'contratos firmados (30 días / total)')
      +k(c.bajas30,'bajas (30 días)',c.bajas30>0?'bad':'')+k(eur(m.cobrado30),'cobrado en 30 días')+k(eur(m.cobradoTotal),'cobrado en total');
    const ren=table([{t:'Fecha'},{t:'Cliente'},{t:'Importe',n:1}],q.renewals.slice(0,12).map(r=>'<tr><td>'+day(r.date)+'</td><td>'+esc(r.name)+(r.status==='past_due'?' <b>· cobro fallido</b>':'')+'</td><td class="n">'+eur(r.amount)+'</td></tr>'),'No hay cuotas previstas en los próximos 60 días.');
    const pend=table([{t:'Factura'},{t:'Cliente'},{t:'Vence'},{t:'Importe',n:1}],q.pendingInvoices.map(p=>'<tr><td>'+esc(p.number||p.invoice)+'</td><td>'+esc(p.name)+'</td><td>'+(p.due?day(p.due):'—')+(p.overdue?' <b>· vencida</b>':'')+'</td><td class="n">'+eur(p.amount)+'</td></tr>'),'Sin facturas pendientes de cobro.');
    const tri=table([{t:'Cliente'},{t:'Termina la prueba'}],q.trialsEnding.map(t=>'<tr><td>'+esc(t.name)+'</td><td>'+day(t.ends)+'</td></tr>'),'Ninguna prueba caduca en los próximos 7 días.');
    const con=table([{t:'Fecha'},{t:'Empresa'},{t:'Plan'},{t:'Cuota',n:1}],(d.contracts||[]).slice(0,10).map(x=>'<tr><td>'+day(x.accepted_at)+'</td><td>'+esc(x.company||x.signer)+'</td><td>'+esc(x.plan_name||x.plan)+'</td><td class="n">'+eur(x.total_monthly)+'</td></tr>'),'Todavía no hay contratos firmados.');
    const pl=table([{t:'Plan'},{t:'Clientes',n:1},{t:'MRR',n:1}],q.byPlan.map(p=>'<tr><td>'+esc(p.plan.replace(/^vnx_|_monthly$/g,''))+'</td><td class="n">'+p.clientes+'</td><td class="n">'+eur(p.mrr)+'</td></tr>'),'Sin suscripciones activas.');
    const use=table([{t:'Cliente'},{t:'Lo que más hace este mes'},{t:'Total',n:1}],q.usageByTenant.slice(0,15).map(u=>'<tr><td>'+esc(u.name)+'</td><td>'+u.top.map(x=>esc(task(x.capability))+' ('+x.quantity+')').join(' · ')+'</td><td class="n">'+u.total+'</td></tr>'),'Sin uso registrado este mes. Solo se cuentan las acciones que pasan por un contador del servidor; la actividad puramente local del ordenador del cliente no se envía aquí.');
    const can=q.cancelling.length?'<h4>Se cancelan al final del periodo</h4>'+table([{t:'Cliente'},{t:'Fecha'},{t:'Cuota mensual',n:1}],q.cancelling.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+day(x.date)+'</td><td class="n">'+eur(x.amount)+'</td></tr>'),''):'';
    const sus=q.suspended.length?'<h4>Suspendidos</h4>'+table([{t:'Cliente'},{t:'Motivo'}],q.suspended.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.reason||'—')+'</td></tr>'),''):'';
    return warn+'<div class="mc-grid">'+cards+'</div><div class="mc-cols"><div><h4>Próximas cuotas</h4>'+ren+'<h4>Pendiente de cobro</h4>'+pend+can+sus+'</div><div><h4>Contratos firmados (últimos 10)</h4>'+con+'<h4>Pruebas que caducan (7 días)</h4>'+tri+'<h4>Ingresos por plan</h4>'+pl+'</div></div>'
      +'<h4>Qué hace el software en cada cliente</h4>'+use
      +'<details><summary><b>Dónde se guardan los datos</b></summary>'
      +'<p><b>En el ordenador de cada cliente:</b> su configuración y las claves de sus programas, cifradas con el sistema de Windows, además de datos y actividad que solo existan localmente.</p>'
      +'<p><b>En Supabase:</b> empresas, licencias y dispositivos, contratos firmados, eventos y contadores técnicos de uso. El panel no recibe el contenido de las tareas locales solo por mostrar estadísticas.</p>'
      +'<p><b>En Stripe:</b> suscripciones, cuotas y facturas.</p>'
      +'<p><b>De paso por el servidor y el proveedor de IA:</b> el texto de cada consulta y los fragmentos que el cliente autoriza para responderla.</p>'
      +'<p><b>Límite de este panel:</b> lo que el cliente hace solo en su ordenador no llega a este panel. '+esc(q.limits&&q.limits.note||'')+'</p></details>';
  }
  function build(){
    const tab=$('#master-center');if(!tab||$('#vnxMasterControl'))return;
    const page=$('.master-page',tab)||tab;const head=$('.master-page-head',page);
    const box=document.createElement('div');box.id='vnxMasterControl';box.className='master-result';
    box.innerHTML='<div class="panel-head"><div><h3>Control del negocio</h3><small id="mcStamp">Cargando…</small></div><button id="mcRefresh" class="mini">Actualizar</button></div><div id="mcBody"><div class="empty">Cargando indicadores…</div></div>';
    if(head&&head.nextSibling)page.insertBefore(box,head.nextSibling);else page.insertBefore(box,page.firstChild);
    $('#mcRefresh',box).onclick=load;
    document.querySelectorAll('.nav[data-tab="master-center"]').forEach(n=>n.addEventListener('click',()=>setTimeout(load,150)));
    load();
  }
  async function load(){
    const body=$('#mcBody'),stamp=$('#mcStamp');if(!body||!window.vnx||!window.vnx.masterDashboard)return;
    try{const d=await window.vnx.masterDashboard();body.innerHTML=render(d);if(stamp)stamp.textContent='Actualizado '+new Date(d.generatedAt||Date.now()).toLocaleString('es-ES')}
    catch(e){body.innerHTML='<div class="mc-warn">No he podido cargar el control del negocio: '+esc(e.message||e)+'</div>';if(stamp)stamp.textContent=''}
  }
  build();new MutationObserver(build).observe(document.documentElement,{childList:true,subtree:false});
})();
