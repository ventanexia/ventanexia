'use strict';
(()=>{
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  let snapshot=null,employees=[],settings=null,currentFilter='all',latestReport=null;
  // El token de Dirección vive solo en memoria del renderer. Nunca localStorage/sessionStorage.
  let directionToken='',accessState=null;

  function esc(v=''){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function businessId(){try{return String(window.vnxBusiness?.activeProfile?.()?.id||'')}catch{return ''}}
  function fmtDate(v){if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
  function fmtMinutes(n=0){n=Math.max(0,Math.round(Number(n)||0));if(n<60)return n+' min';const h=Math.floor(n/60),m=n%60;return h+' h'+(m?' '+m+' min':'')}
  function statusLabel(t){
    if(t.status==='done')return t.completedBy==='ai'?'✦ Resuelta por IA':'● Completada';
    if(t.status==='blocked')return '⛔ Bloqueada';
    if(t.status==='in_progress')return 'En curso';
    if(t.status==='cancelled')return 'Cancelada';
    const overdue=t.dueAt&&new Date(t.dueAt)<new Date();return overdue?'⚠ Fuera de plazo':'Pendiente';
  }
  function taskIsOverdue(t){return !['done','cancelled'].includes(t.status)&&t.dueAt&&new Date(t.dueAt)<new Date()}
  function taskFilter(t){
    if(currentFilter==='open')return !['done','cancelled'].includes(t.status);
    if(currentFilter==='overdue')return taskIsOverdue(t);
    if(currentFilter==='ai')return t.status==='done'&&t.completedBy==='ai';
    if(currentFilter==='done')return t.status==='done';
    return true;
  }
  function defaultDue(){
    const d=new Date(Date.now()+8*60*60000),pad=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
  }

  function clearSensitiveUi(){
    snapshot=null;employees=[];settings=null;latestReport=null;
    const er=$('#vnxDirEmployeeRows'),tr=$('#vnxDirTaskRows'),list=$('#vnxDirEmployees'),sel=$('#vnxDirTaskEmployee'),rsel=$('#vnxDirReportEmployee');
    if(er)er.innerHTML='';if(tr)tr.innerHTML='';if(list)list.innerHTML='';
    if(sel)sel.innerHTML='<option value="">Selecciona una persona</option>';
    if(rsel)rsel.innerHTML='<option value="">Toda la plantilla</option>';
    const rs=$('#vnxDirReportSummary'),rd=$('#vnxDirReportDetail'),rw=$('#vnxDirReportTableWrap');
    if(rs)rs.innerHTML='<div class="vnx-dir-empty">Desbloquea Dirección para generar informes.</div>';
    if(rd)rd.innerHTML='';if(rw)rw.hidden=true;
    for(const id of ['vnxDirReportExcel','vnxDirReportPdf']){const b=$('#'+id);if(b)b.disabled=true}
    $('#vnxDirKpis article strong').forEach(x=>x.textContent='0');
  }
  function setGateMessage(msg='',error=false){
    const box=$('#vnxDirPinMsg');if(!box)return;
    box.textContent=msg||'Solo la persona que conozca el PIN podrá acceder.';
    box.classList.toggle('error',Boolean(error));
  }
  function renderGate(){
    const gate=$('#vnxDirGate'),protectedView=$('#vnxDirProtected'),confirm=$('#vnxDirPinConfirmWrap'),submit=$('#vnxDirPinSubmit'),text=$('#vnxDirGateText');
    if(gate)gate.hidden=false;if(protectedView)protectedView.hidden=true;
    const configured=Boolean(accessState?.configured);
    if(confirm)confirm.hidden=configured;
    if(submit)submit.textContent=configured?'Desbloquear Dirección':'Crear PIN privado';
    if(text)text.textContent=configured
      ?'Este agente está protegido. Introduce el PIN de Dirección para acceder a responsables, cumplimiento, retrasos y trabajo recuperado por IA.'
      :'Primera configuración: crea un PIN de 4 dígitos. Se guardará protegido y no podrá verse desde la interfaz.';
    const lockedUntil=Number(accessState?.lockedUntil||0);
    if(lockedUntil>Date.now()){
      const mins=Math.max(1,Math.ceil((lockedUntil-Date.now())/60000));
      setGateMessage('Acceso bloqueado temporalmente por intentos fallidos. Espera aproximadamente '+mins+' min.',true);
    }else setGateMessage(configured?'Solo Dirección puede acceder a este espacio.':'Crea un PIN que conozca únicamente Dirección.');
  }
  function renderProtected(){
    const gate=$('#vnxDirGate'),protectedView=$('#vnxDirProtected');
    if(gate)gate.hidden=true;if(protectedView)protectedView.hidden=false;
  }
  async function refreshAccessStatus(){
    accessState=await window.vnx.directionAccessStatus();
    renderGate();
    return accessState;
  }
  function isSessionError(e){
    return /Dirección está bloqueada|DIRECTION_LOCKED|acceso.*caducado/i.test(String(e?.message||e||''));
  }

  async function load(){
    if(!directionToken){await refreshAccessStatus();return}
    try{
      const opts={businessId:businessId()};
      [snapshot,employees,settings]=await Promise.all([
        window.vnx.directionSummary(directionToken,opts),
        window.vnx.directionEmployees(directionToken,opts),
        window.vnx.directionSettings(directionToken)
      ]);
      renderProtected();render();
    }catch(e){
      if(isSessionError(e)){
        directionToken='';clearSensitiveUi();await refreshAccessStatus().catch(()=>{});setGateMessage('La sesión de Dirección ha caducado. Introduce de nuevo el PIN.',true);return;
      }
      const rows=$('#vnxDirTaskRows');if(rows)rows.innerHTML='<tr><td colspan="8">No se ha podido cargar Dirección: '+esc(e.message||e)+'</td></tr>';
    }
  }

  function renderKpis(){
    const cards=$$('#vnxDirKpis article'),v=[
      snapshot?.totals?.employees||0,snapshot?.totals?.open||0,snapshot?.totals?.overdue||0,
      snapshot?.totals?.doneByAI||0,snapshot?.totals?.aiTakeoverDue||0
    ];
    cards.forEach((c,i)=>{const s=c.querySelector('strong');if(s)s.textContent=String(v[i]||0)});
  }
  function renderEmployees(){
    const list=$('#vnxDirEmployees'),sel=$('#vnxDirTaskEmployee'),rsel=$('#vnxDirReportEmployee');
    if(list)list.innerHTML=employees.length?employees.map(e=>'<button type="button" class="vnx-dir-person" data-dir-employee="'+esc(e.id)+'"><span>'+esc((e.name||'?').slice(0,1).toUpperCase())+'</span><p><b>'+esc(e.name)+'</b><small>'+esc(e.role||e.email||'Responsable')+'</small></p></button>').join(''):'<div class="vnx-dir-empty">Añade responsables para empezar a medir cumplimiento operativo.</div>';
    if(sel){
      const keep=sel.value;
      sel.innerHTML='<option value="">Selecciona una persona</option>'+employees.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+(e.role?' · '+esc(e.role):'')+'</option>').join('');
      if(employees.some(e=>e.id===keep))sel.value=keep;
    }
    if(rsel){
      const keep=rsel.value;
      rsel.innerHTML='<option value="">Toda la plantilla</option>'+employees.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+(e.role?' · '+esc(e.role):'')+'</option>').join('');
      if(employees.some(e=>e.id===keep))rsel.value=keep;
    }
  }
  function renderEmployeeRows(){
    const body=$('#vnxDirEmployeeRows');if(!body)return;
    const rows=snapshot?.employees||[];
    body.innerHTML=rows.length?rows.map(e=>{
      const inactive=e.pending||e.inProgress||e.blocked?fmtMinutes(e.minutesSinceLastRecordedActivity):'—';
      return '<tr class="'+(e.overdue?'vnx-dir-risk':'')+'"><td><b>'+esc(e.name)+'</b><small>'+esc(e.role||'')+'</small></td><td>'+e.assigned+'</td><td>'+e.done+'</td><td>'+e.pending+'</td><td>'+(e.overdue?'<b class="vnx-dir-red">'+e.overdue+'</b>':'0')+'</td><td>'+(e.doneAI?'<b class="vnx-dir-ai">'+e.doneAI+'</b>':'0')+'</td><td>'+inactive+'</td><td>'+fmtMinutes(e.overdueMinutesTotal)+'</td></tr>';
    }).join(''):'<tr><td colspan="8">Todavía no hay actividad asignada.</td></tr>';
  }
  function actionButtons(t){
    if(t.status==='done'||t.status==='cancelled')return '<button class="btn mini outline" data-dir-event="'+esc(t.id)+'">Añadir evidencia</button>';
    let html='<button class="btn mini outline" data-dir-progress="'+esc(t.id)+'">Actividad</button><button class="btn mini primary" data-dir-human="'+esc(t.id)+'">Marcar hecha</button>';
    if(t.aiTakeoverEligible)html+='<button class="btn mini outline" data-dir-carla="'+esc(t.id)+'">Abrir en Carla</button><button class="btn mini outline" data-dir-ai="'+esc(t.id)+'">IA la resolvió</button>';
    return html;
  }
  function renderTasks(){
    const body=$('#vnxDirTaskRows');if(!body)return;
    const tasks=(snapshot?.tasks||[]).filter(taskFilter);
    body.innerHTML=tasks.length?tasks.map(t=>{
      const cls=taskIsOverdue(t)?'vnx-dir-risk':'';
      return '<tr class="'+cls+'"><td><b>'+esc(t.title)+'</b><small>'+esc(t.description||'')+'</small></td><td>'+esc(t.assigneeName||'—')+'</td><td>'+esc(t.module||'—')+'</td><td>'+fmtDate(t.dueAt)+'</td><td>'+statusLabel(t)+'</td><td>'+fmtDate(t.lastActivityAt)+'</td><td>'+esc(t.outcome||t.evidence||'—')+'</td><td><div class="vnx-dir-row-actions">'+actionButtons(t)+'</div></td></tr>';
    }).join(''):'<tr><td colspan="8">No hay tareas en este filtro.</td></tr>';
    bindTaskActions();
  }
  function reportRange(){
    const period=$('#vnxDirReportPeriod')?.value||'30';
    if(period==='all')return {from:'',to:''};
    const days=Math.max(1,Number(period)||30),to=new Date(),from=new Date(to.getTime()-(days-1)*86400000);
    return {from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10)};
  }
  function pct(v){return v==null?'—':String(v)+'%'}
  function reportArea(r){return r?.areas?.find(x=>x.deviations>0)?.label||'—'}
  function renderReport(){
    const r=latestReport,summary=$('#vnxDirReportSummary'),rows=$('#vnxDirReportRows'),wrap=$('#vnxDirReportTableWrap'),detail=$('#vnxDirReportDetail');
    if(!r){if(wrap)wrap.hidden=true;return}
    if(summary)summary.innerHTML='<div class="vnx-dir-report-kpis">'+
      '<article><span>Tareas analizadas</span><strong>'+r.totals.assigned+'</strong></article>'+
      '<article><span>Fuera de plazo</span><strong>'+r.totals.overdueOpen+'</strong></article>'+
      '<article><span>Terminadas tarde</span><strong>'+r.totals.lateDone+'</strong></article>'+
      '<article><span>Recuperadas IA</span><strong>'+r.totals.doneAI+'</strong></article>'+
      '<article><span>Bloqueadas</span><strong>'+r.totals.blocked+'</strong></article>'+
      '</div><div class="vnx-dir-report-findings"><b>Hallazgos del periodo</b>'+r.findings.map(x=>'<span>• '+esc(x)+'</span>').join('')+'</div>';
    if(rows)rows.innerHTML=(r.employees||[]).map(e=>'<tr>'+
      '<td><b>'+esc(e.name)+'</b><small>'+esc(e.role||'')+'</small></td>'+
      '<td>'+e.assigned+'</td><td>'+pct(e.onTimeRate)+'</td><td>'+e.overdueOpen+'</td><td>'+e.lateDone+'</td><td>'+e.doneAI+'</td>'+
      '<td>'+e.blocked+'</td><td>'+e.noEvidence+'</td><td>'+fmtMinutes(e.averageDelayMinutes)+'</td><td>'+esc(reportArea(e))+'</td></tr>').join('')||'<tr><td colspan="10">Sin datos en este periodo.</td></tr>';
    if(wrap)wrap.hidden=false;
    if(detail){
      detail.innerHTML=(r.employees||[]).map(e=>'<article class="vnx-dir-report-person"><div><h3>'+esc(e.name)+'</h3><p>'+esc(e.role||'')+'</p></div>'+
        '<div class="vnx-dir-report-findings">'+e.findings.map(x=>'<span>• '+esc(x)+'</span>').join('')+'</div>'+
        (e.examples?.length?'<details><summary>Ver ejemplos y evidencia</summary>'+e.examples.map(x=>'<div class="vnx-dir-report-example"><b>'+esc(x.title)+'</b><span>'+esc(x.moduleLabel)+' · '+esc(x.reasons.join(', '))+(x.delayMinutes?' · retraso '+fmtMinutes(x.delayMinutes):'')+'</span><small>Plazo: '+fmtDate(x.dueAt)+(x.completedAt?' · Finalizada: '+fmtDate(x.completedAt):'')+'</small></div>').join('')+'</details>':'')+
        '</article>').join('');
    }
    for(const id of ['vnxDirReportExcel','vnxDirReportPdf']){const b=$('#'+id);if(b)b.disabled=false}
  }
  async function generateEmployeeReport(){
    if(!directionToken)return;
    const btn=$('#vnxDirReportForm button[type="submit"]'),old=btn?.textContent;
    if(btn){btn.disabled=true;btn.textContent='Analizando…'}
    try{
      const range=reportRange();
      latestReport=await window.vnx.directionReport(directionToken,{businessId:businessId(),employeeId:$('#vnxDirReportEmployee')?.value||'',...range});
      renderReport();
    }catch(e){
      if(isSessionError(e)){directionToken='';clearSensitiveUi();await refreshAccessStatus().catch(()=>{});setGateMessage('La sesión de Dirección ha caducado.',true);return}
      alert('No se pudo generar el informe: '+(e.message||e));
    }finally{if(btn){btn.disabled=false;btn.textContent=old||'Generar informe'}}
  }
  function reportRows(){
    return (latestReport?.employees||[]).map(e=>[
      e.name,e.role||'',e.assigned,e.done,pct(e.onTimeRate),e.overdueOpen,e.lateDone,e.doneAI,e.blocked,e.noEvidence,
      fmtMinutes(e.averageDelayMinutes),reportArea(e),e.findings.join(' · ')
    ]);
  }
  function reportBlocks(){
    const r=latestReport;if(!r)return [];
    const blocks=[
      {type:'heading',text:'Resumen de plantilla'},
      {type:'record',fields:[
        {label:'Tareas analizadas',value:r.totals.assigned},{label:'Completadas',value:r.totals.done},
        {label:'Fuera de plazo',value:r.totals.overdueOpen},{label:'Terminadas tarde',value:r.totals.lateDone},
        {label:'Recuperadas por IA',value:r.totals.doneAI},{label:'Bloqueadas',value:r.totals.blocked}
      ]},
      {type:'subheading',text:'Hallazgos generales'},
      ...r.findings.map(x=>({type:'bullet',text:x}))
    ];
    for(const e of r.employees||[]){
      blocks.push({type:'heading',text:e.name+(e.role?' · '+e.role:'')});
      blocks.push({type:'record',fields:[
        {label:'Tareas',value:e.assigned},{label:'A tiempo',value:pct(e.onTimeRate)},{label:'Fuera de plazo',value:e.overdueOpen},
        {label:'Terminadas tarde',value:e.lateDone},{label:'Recuperadas IA',value:e.doneAI},{label:'Bloqueadas',value:e.blocked},
        {label:'Retraso medio',value:fmtMinutes(e.averageDelayMinutes)},{label:'Área principal',value:reportArea(e)}
      ]});
      for(const x of e.findings)blocks.push({type:'bullet',text:x});
      if(e.examples?.length){
        blocks.push({type:'subheading',text:'Ejemplos registrados'});
        for(const x of e.examples)blocks.push({type:'record',fields:[
          {label:'Tarea',value:x.title},{label:'Área',value:x.moduleLabel},{label:'Incidencia',value:x.reasons.join(', ')},
          {label:'Plazo',value:fmtDate(x.dueAt)},{label:'Finalización',value:fmtDate(x.completedAt)},{label:'Retraso',value:fmtMinutes(x.delayMinutes)}
        ]});
      }
    }
    blocks.push({type:'subheading',text:'Criterio de lectura'},{type:'fact',label:'Importante',text:r.note});
    return blocks;
  }
  async function exportEmployeeReport(format){
    if(!latestReport)return;
    const selected=latestReport.scope?.employeeId?(latestReport.employees?.[0]?.name||'Empleado'):'Plantilla';
    if(format==='pdf')return window.vnx.exportData({format:'pdf',title:'Informe Dirección · '+selected,blocks:reportBlocks()});
    return window.vnx.exportData({format:'excel',title:'Informe Dirección · '+selected,headers:['Empleado','Rol','Tareas','Completadas','A tiempo','Fuera de plazo','Terminadas tarde','Recuperadas IA','Bloqueadas','Sin evidencia','Retraso medio','Principal área','Hallazgos'],rows:reportRows()});
  }

  function renderSettings(){
    if(!settings)return;
    const a=$('#vnxDirDefaultSla'),b=$('#vnxDirAiGrace'),c=$('#vnxDirAiGlobal');
    if(a)a.value=String(settings.defaultSlaMinutes||480);
    if(b)b.value=String(settings.aiTakeoverGraceMinutes??60);
    if(c)c.checked=Boolean(settings.aiTakeoverEnabled);
  }
  function render(){renderKpis();renderEmployees();renderEmployeeRows();renderTasks();renderSettings()}

  async function promptEvent(taskId,kind){
    const task=snapshot?.tasks?.find(x=>x.id===taskId);if(!task||!directionToken)return;
    const detail=window.prompt(kind==='done'?'Resultado o evidencia de que la tarea se hizo:':'Describe brevemente la actividad realizada:','')||'';
    if(!detail.trim())return;
    if(kind==='done')await window.vnx.directionResolveTask(directionToken,taskId,{actor:'human',detail,outcome:detail});
    else await window.vnx.directionAddEvent(directionToken,taskId,{actor:'human',type:'activity',detail,status:'in_progress'});
    await load();
  }
  async function markAi(taskId){
    const task=snapshot?.tasks?.find(x=>x.id===taskId);if(!task||!directionToken)return;
    const detail=window.prompt('Indica qué hizo VentaNexIA y qué evidencia quedó preparada:','VentaNexIA completó la tarea tras vencer el plazo asignado.')||'';
    if(!detail.trim())return;
    await window.vnx.directionResolveTask(directionToken,taskId,{actor:'ai',detail,outcome:detail,evidence:detail});
    await load();
  }
  async function addEvidence(taskId){
    if(!directionToken)return;
    const detail=window.prompt('Añade una evidencia o anotación a esta tarea:','')||'';if(!detail.trim())return;
    await window.vnx.directionAddEvent(directionToken,taskId,{actor:'human',type:'evidence',detail});
    await load();
  }
  function openInCarla(taskId){
    const t=snapshot?.tasks?.find(x=>x.id===taskId);if(!t||!directionToken)return;
    document.querySelector('[data-tab="chat"]')?.click();
    setTimeout(()=>{
      const input=$('#chatInput');if(!input)return;
      input.value='La tarea «'+t.title+'» asignada a '+(t.assigneeName||'un responsable')+' ha vencido sin constancia de finalización. Ayúdame a resolverla con las fuentes autorizadas. Contexto: '+(t.description||'sin detalle adicional')+'. No ejecutes acciones sensibles sin mi aprobación.';
      input.focus();
    },80);
  }
  function bindTaskActions(){
    $$('[data-dir-progress]').forEach(b=>b.onclick=()=>promptEvent(b.dataset.dirProgress,'activity'));
    $$('[data-dir-human]').forEach(b=>b.onclick=()=>promptEvent(b.dataset.dirHuman,'done'));
    $$('[data-dir-ai]').forEach(b=>b.onclick=()=>markAi(b.dataset.dirAi));
    $$('[data-dir-event]').forEach(b=>b.onclick=()=>addEvidence(b.dataset.dirEvent));
    $$('[data-dir-carla]').forEach(b=>b.onclick=()=>openInCarla(b.dataset.dirCarla));
  }

  async function lockDirection(){
    const token=directionToken;directionToken='';clearSensitiveUi();
    try{if(token)await window.vnx.directionLock(token)}catch{}
    await refreshAccessStatus().catch(()=>{});
  }

  function bind(){
    const pinForm=$('#vnxDirPinForm');
    if(pinForm)pinForm.onsubmit=async e=>{
      e.preventDefault();
      const pin=String($('#vnxDirPin')?.value||''),confirm=String($('#vnxDirPinConfirm')?.value||''),btn=$('#vnxDirPinSubmit');
      if(!/^\d{4}$/.test(pin)){setGateMessage('El PIN debe tener exactamente 4 números.',true);return}
      if(!accessState?.configured&&pin!==confirm){setGateMessage('Los dos PIN no coinciden.',true);return}
      if(btn){btn.disabled=true;btn.textContent=accessState?.configured?'Comprobando…':'Creando PIN…'}
      try{
        if(!accessState?.configured){
          await window.vnx.directionSetPin(pin);
          accessState={...(accessState||{}),configured:true,lockedUntil:null};
        }
        const unlocked=await window.vnx.directionUnlock(pin);
        directionToken=String(unlocked?.token||'');
        if(!directionToken)throw new Error('No se ha podido abrir la sesión privada de Dirección.');
        $('#vnxDirPin').value='';if($('#vnxDirPinConfirm'))$('#vnxDirPinConfirm').value='';
        setGateMessage('Acceso concedido.');
        await load();
      }catch(err){
        directionToken='';
        await refreshAccessStatus().catch(()=>{});
        setGateMessage(String(err?.message||err),true);
      }finally{
        if(btn){btn.disabled=false;btn.textContent=accessState?.configured?'Desbloquear Dirección':'Crear PIN privado'}
      }
    };

    const lock=$('#vnxDirLock');if(lock)lock.onclick=lockDirection;
    const refresh=$('#vnxDirRefresh');if(refresh)refresh.onclick=load;
    const add=$('#vnxDirAddEmployeeBtn'),form=$('#vnxDirEmployeeForm'),cancel=$('#vnxDirEmpCancel');
    if(add)add.onclick=()=>{if(!directionToken)return;form.hidden=false;$('#vnxDirEmpName')?.focus()};
    if(cancel)cancel.onclick=()=>{form.hidden=true;form.reset()};
    if(form)form.onsubmit=async e=>{
      e.preventDefault();if(!directionToken)return;
      try{
        await window.vnx.directionSaveEmployee(directionToken,{businessId:businessId(),name:$('#vnxDirEmpName').value,role:$('#vnxDirEmpRole').value,email:$('#vnxDirEmpEmail').value});
        form.reset();form.hidden=true;await load();
      }catch(err){alert(err.message||err)}
    };
    const tf=$('#vnxDirTaskForm');if(tf){
      const due=$('#vnxDirTaskDue');if(due&&!due.value)due.value=defaultDue();
      tf.onsubmit=async e=>{
        e.preventDefault();if(!directionToken)return;
        const employee=employees.find(x=>x.id===$('#vnxDirTaskEmployee').value);if(!employee)return;
        try{
          await window.vnx.directionCreateTask(directionToken,{
            businessId:businessId(),assigneeId:employee.id,assigneeName:employee.name,
            title:$('#vnxDirTaskTitle').value,description:$('#vnxDirTaskDesc').value,module:$('#vnxDirTaskModule').value,
            priority:$('#vnxDirTaskPriority').value,dueAt:new Date($('#vnxDirTaskDue').value).toISOString(),
            aiTakeoverEligible:true,aiTakeoverEnabled:$('#vnxDirTaskAi').checked
          });
          tf.reset();$('#vnxDirTaskDue').value=defaultDue();await load();
        }catch(err){alert(err.message||err)}
      };
    }
    const filter=$('#vnxDirFilter');if(filter)filter.onchange=()=>{currentFilter=filter.value;renderTasks()};
    const rf=$('#vnxDirReportForm');if(rf)rf.onsubmit=async e=>{e.preventDefault();await generateEmployeeReport()};
    const rExcel=$('#vnxDirReportExcel');if(rExcel)rExcel.onclick=()=>exportEmployeeReport('excel').catch(e=>alert('No se pudo exportar: '+(e.message||e)));
    const rPdf=$('#vnxDirReportPdf');if(rPdf)rPdf.onclick=()=>exportEmployeeReport('pdf').catch(e=>alert('No se pudo exportar: '+(e.message||e)));
    const sf=$('#vnxDirSettingsForm');if(sf)sf.onsubmit=async e=>{
      e.preventDefault();if(!directionToken)return;
      try{
        settings=await window.vnx.directionSettings(directionToken,{
          defaultSlaMinutes:Number($('#vnxDirDefaultSla').value)||480,
          aiTakeoverGraceMinutes:Number($('#vnxDirAiGrace').value)||0,
          aiTakeoverEnabled:$('#vnxDirAiGlobal').checked
        });await load();
      }catch(err){alert(err.message||err)}
    };
    const exportBtn=$('#vnxDirExport');if(exportBtn)exportBtn.onclick=async()=>{
      if(!directionToken)return;
      const rows=(snapshot?.tasks||[]).map(t=>[t.title,t.assigneeName||'',t.module||'',fmtDate(t.assignedAt),fmtDate(t.dueAt),statusLabel(t),fmtDate(t.lastActivityAt),t.completedBy||'',t.outcome||'',t.evidence||'']);
      if(!rows.length){alert('Todavía no hay tareas para exportar.');return}
      exportBtn.disabled=true;const old=exportBtn.textContent;exportBtn.textContent='Preparando Excel…';
      try{await window.vnx.exportData({format:'excel',title:'Control Operativo de Dirección',headers:['Tarea','Responsable','Área','Asignada','Plazo','Estado','Última actividad','Resuelta por','Resultado','Evidencia'],rows});exportBtn.textContent='Excel guardado ✓'}
      catch(e){alert('No se pudo exportar: '+(e.message||e));exportBtn.textContent=old}
      finally{setTimeout(()=>{if(exportBtn.isConnected){exportBtn.disabled=false;exportBtn.textContent=old}},1500)}
    };
    document.querySelector('[data-tab="direction"]')?.addEventListener('click',()=>setTimeout(()=>directionToken?load():refreshAccessStatus(),40));
  }

  document.addEventListener('DOMContentLoaded',()=>{bind();refreshAccessStatus().catch(()=>{})});
  window.vnxDirection={refresh:load,lock:lockDirection};
})();
