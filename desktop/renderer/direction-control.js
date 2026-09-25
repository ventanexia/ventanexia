'use strict';
(()=>{
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  let snapshot=null,employees=[],settings=null,managementPolicy=null,directionStandards=null,roleWorkspace={roles:[],questions:[],assessments:[],personalityAssessments:[]},miniIpipDefinition=null,currentEmployeeFile=null,currentRoleId='',currentFilter='all',latestReport=null;
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
    snapshot=null;employees=[];settings=null;managementPolicy=null;directionStandards=null;roleWorkspace={roles:[],questions:[],assessments:[],personalityAssessments:[]};miniIpipDefinition=null;currentEmployeeFile=null;latestReport=null;
    const er=$('#vnxDirEmployeeRows'),tr=$('#vnxDirTaskRows'),list=$('#vnxDirEmployees'),sel=$('#vnxDirTaskEmployee'),rsel=$('#vnxDirReportEmployee'),hsel=$('#vnxDirHumanEmployee'),csel=$('#vnxDirCvEmployee');
    if(er)er.innerHTML='';if(tr)tr.innerHTML='';if(list)list.innerHTML='';
    if(sel)sel.innerHTML='<option value="">Selecciona una persona</option>';
    if(rsel)rsel.innerHTML='<option value="">Toda la plantilla</option>';
    if(hsel)hsel.innerHTML='<option value="">Selecciona una persona</option>';if(csel)csel.innerHTML='<option value="">Selecciona una persona</option>';
    const rs=$('#vnxDirReportSummary'),rd=$('#vnxDirReportDetail'),rw=$('#vnxDirReportTableWrap');
    if(rs)rs.innerHTML='<div class="vnx-dir-empty">Desbloquea Dirección para generar informes.</div>';
    if(rd)rd.innerHTML='';if(rw)rw.hidden=true;
    for(const id of ['vnxDirReportExcel','vnxDirReportPdf']){const b=$('#'+id);if(b)b.disabled=true}
    $$('#vnxDirKpis article strong').forEach(x=>x.textContent='0');
  }
  function setGateMessage(msg='',error=false){
    const box=$('#vnxDirPinMsg');if(!box)return;
    box.textContent=msg||'Solo la persona que conozca el PIN podrá acceder.';
    box.classList.toggle('error',Boolean(error));
  }
  function renderGate(){
    const gate=$('#vnxDirGate'),protectedView=$('#vnxDirProtected'),pinWrap=$('#vnxDirPinWrap'),confirm=$('#vnxDirPinConfirmWrap'),submit=$('#vnxDirPinSubmit'),text=$('#vnxDirGateText'),demo=Boolean(accessState?.demoAvailable);
    if(gate)gate.hidden=false;if(protectedView)protectedView.hidden=true;
    const configured=Boolean(accessState?.configured);
    if(pinWrap)pinWrap.hidden=demo;
    if(confirm)confirm.hidden=demo||configured;
    if(submit)submit.textContent=demo?'Entrar en demo de Dirección':(configured?'Desbloquear Dirección':'Crear PIN privado');
    if(text)text.textContent=demo
      ?'Modo demo seguro: abre un entorno aislado con empleados, CV, tareas y tests 100 % ficticios. No lee ni modifica el archivo real de Dirección.'
      :(configured
        ?'Este agente está protegido. Introduce el PIN de Dirección para acceder a responsables, cumplimiento, retrasos y trabajo recuperado por IA.'
        :'Primera configuración: crea un PIN de 4 dígitos. Se guardará protegido y no podrá verse desde la interfaz.');
    if(demo){setGateMessage('Puedes probar todo el Agente Dirección. Los cambios desaparecen al cerrar la sesión demo.');return}
    const lockedUntil=Number(accessState?.lockedUntil||0);
    if(lockedUntil>Date.now()){
      const mins=Math.max(1,Math.ceil((lockedUntil-Date.now())/60000));
      setGateMessage('Acceso bloqueado temporalmente por intentos fallidos. Espera aproximadamente '+mins+' min.',true);
    }else setGateMessage(configured?'Solo Dirección puede acceder a este espacio.':'Crea un PIN que conozca únicamente Dirección.');
  }
  function renderProtected(){
    const gate=$('#vnxDirGate'),protectedView=$('#vnxDirProtected'),badge=$('#vnxDirDemoBadge');
    if(gate)gate.hidden=true;if(protectedView)protectedView.hidden=false;
    if(badge)badge.hidden=!Boolean(accessState?.demoAvailable);
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
      [snapshot,employees,settings,managementPolicy,directionStandards,roleWorkspace,miniIpipDefinition]=await Promise.all([
        window.vnx.directionSummary(directionToken,opts),
        window.vnx.directionEmployees(directionToken,opts),
        window.vnx.directionSettings(directionToken),
        window.vnx.directionManagementPolicy(directionToken),
        window.vnx.directionStandards(directionToken,opts),
        window.vnx.directionRoleWorkspace(directionToken,opts),
        window.vnx.directionMiniIpipDefinition(directionToken)
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
    const list=$('#vnxDirEmployees'),sel=$('#vnxDirTaskEmployee'),rsel=$('#vnxDirReportEmployee'),hsel=$('#vnxDirHumanEmployee'),osel=$('#vnxDirObservationEmployee'),csel=$('#vnxDirCvEmployee'),roleSel=$('#vnxDirRoleEmployee');
    if(list)list.innerHTML=employees.length?employees.map(e=>'<button type="button" class="vnx-dir-person" data-dir-employee="'+esc(e.id)+'"><span>'+esc((e.name||'?').slice(0,1).toUpperCase())+'</span><p><b>'+esc(e.name)+'</b><small>'+esc(e.role||e.email||'Responsable')+'</small><small class="vnx-dir-employee-code">'+esc(e.employeeCode||'')+'</small></p></button>').join(''):'<div class="vnx-dir-empty">Añade responsables para empezar a medir cumplimiento operativo.</div>';
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
    if(hsel){
      const keep=hsel.value;
      hsel.innerHTML='<option value="">Selecciona una persona</option>'+employees.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+(e.role?' · '+esc(e.role):'')+'</option>').join('');
      if(employees.some(e=>e.id===keep))hsel.value=keep;
    }
    if(osel){
      const keep=osel.value;
      osel.innerHTML='<option value="">Selecciona una persona</option>'+employees.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+(e.role?' · '+esc(e.role):'')+'</option>').join('');
      if(employees.some(e=>e.id===keep))osel.value=keep;
    }
    if(csel){
      const keep=csel.value;
      csel.innerHTML='<option value="">Selecciona una persona</option>'+employees.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+(e.employeeCode?' · '+esc(e.employeeCode):'')+'</option>').join('');
      if(employees.some(e=>e.id===keep))csel.value=keep;
    }
    if(roleSel){
      const keep=roleSel.value;
      roleSel.innerHTML='<option value="">Selecciona una persona</option>'+employees.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.name)+(e.role?' · '+esc(e.role):'')+'</option>').join('');
      if(employees.some(e=>e.id===keep))roleSel.value=keep;
    }
    $('[data-dir-employee]').forEach(b=>b.onclick=()=>openEmployeeFile(b.dataset.dirEmployee));
  }
  function renderEmployeeRows(){
    const body=$('#vnxDirEmployeeRows');if(!body)return;
    const rows=snapshot?.employees||[];
    body.innerHTML=rows.length?rows.map(e=>{
      const inactive=e.pending||e.inProgress||e.blocked?fmtMinutes(e.minutesSinceLastRecordedActivity):'—';
      return '<tr class="'+(e.overdue?'vnx-dir-risk':'')+'"><td><b>'+esc(e.name)+'</b><small>'+esc(e.role||'')+'</small></td><td>'+e.assigned+'</td><td>'+e.done+'</td><td>'+e.pending+'</td><td>'+(e.overdue?'<b class="vnx-dir-red">'+e.overdue+'</b>':'0')+'</td><td>'+(e.doneAI?'<b class="vnx-dir-ai">'+e.doneAI+'</b>':'0')+'</td><td>'+inactive+'</td><td>'+fmtMinutes(e.overdueMinutesTotal)+'</td></tr>';
    }).join(''):'<tr><td colspan="8">Todavía no hay actividad asignada.</td></tr>';
  }

  function miniScoresHtml(record){
    const f=record?.score?.factors;if(!f)return '<span>Sin Mini‑IPIP guardado</span>';
    const rows=[['Extraversión',f.E?.mean],['Amabilidad / orientación interpersonal',f.A?.mean],['Responsabilidad / organización',f.C?.mean],['Apertura / imaginación',f.O?.mean],['Estabilidad emocional',f.emotionalStability?.mean]];
    return '<div class="vnx-dir-file-tags">'+rows.map(([k,v])=>'<span>'+esc(k)+': <b>'+esc(v??'—')+'</b>/5</span>').join('')+'</div>';
  }
  function renderEmployeeFile(file){
    const box=$('#vnxDirEmployeeFile');if(!box)return;
    currentEmployeeFile=file||null;
    if(!file?.employee){box.innerHTML='<div class="vnx-dir-empty">Pulsa sobre una persona en “Responsables” para abrir su expediente privado.</div>';return}
    const e=file.employee,s=file.summary||{},cv=e.cvProfile||{},wp=e.workProfile||{},tests=file.structuredTests||[],personality=file.personalityTests||[];
    const list=(title,arr)=>'<div class="vnx-dir-file-card"><h4>'+esc(title)+'</h4>'+((arr||[]).length?(arr||[]).slice(0,12).map(x=>'<span>• '+esc(typeof x==='string'?x:(x?.detail||x?.label||JSON.stringify(x)))+'</span>').join(''):'<span>Sin datos registrados</span>')+'</div>';
    const structured=tests.length?tests.map(t=>'<article><strong>'+esc(t.roleName||'Test de puesto')+'</strong><small>'+fmtDate(t.submittedAt)+' · '+esc(t.analysis?.confidence||'sin análisis')+'</small><p>'+esc(t.analysis?.roleFitHypothesis||t.analysis?.headline||'Respuestas guardadas; análisis pendiente.')+'</p></article>').join(''):'<article><p>Sin test estructurado guardado.</p></article>';
    const mini=personality[0]||null;
    box.innerHTML='<div class="vnx-dir-file-grid">'+
      '<div class="vnx-dir-file-hero"><div><h3>'+esc(e.name)+'</h3><p>'+esc(e.role||'Sin puesto asignado')+(e.email?' · '+esc(e.email):'')+'</p></div><div class="vnx-dir-file-code">'+esc(e.employeeCode||'')+'</div></div>'+
      '<div class="vnx-dir-file-kpis">'+
        '<article><span>Asignadas</span><strong>'+esc(s.assigned??0)+'</strong></article>'+
        '<article><span>Completadas</span><strong>'+esc(s.done??0)+'</strong></article>'+
        '<article><span>Pendientes</span><strong>'+esc(s.pending??0)+'</strong></article>'+
        '<article><span>Vencidas</span><strong>'+esc(s.overdue??0)+'</strong></article>'+
        '<article><span>Recuperadas IA</span><strong>'+esc(s.doneAI??0)+'</strong></article>'+
      '</div>'+
      list('Experiencia declarada en CV',cv.experience)+
      list('Formación / estudios',cv.education)+
      list('Competencias y herramientas',cv.skills)+
      list('Confirmado por Dirección',cv.confirmedByManagement)+
      list('Fortalezas laborales declaradas',wp.declaredStrengths)+
      list('Funciones que le interesa explorar',wp.roleInterests)+
      '<div class="vnx-dir-file-card"><h4>Test estructurados del puesto</h4><div class="vnx-dir-test-history">'+structured+'</div></div>'+
      '<div class="vnx-dir-file-card"><h4>Mini‑IPIP · último autoinforme</h4>'+miniScoresHtml(mini)+(mini?'<span>'+fmtDate(mini.submittedAt)+' · uso complementario de bajo peso</span>':'')+'</div>'+
      '<div class="vnx-dir-file-card"><h4>Evidencias registradas</h4><span>'+esc((file.events||[]).length)+' eventos · '+esc((file.tasks||[]).length)+' tareas en el expediente</span>'+(file.events||[]).slice(0,8).map(x=>'<span>• '+fmtDate(x.at)+' · '+esc(x.detail||x.type)+'</span>').join('')+'</div>'+
      '<div class="vnx-dir-file-card"><h4>Contexto laboral</h4><span><b>Autonomía:</b> '+esc(wp.preferredAutonomy||'—')+'</span><span><b>Colaboración:</b> '+esc(wp.collaborationPreference||'—')+'</span><span>'+esc(wp.workContext||'Sin contexto adicional')+'</span></div>'+
      '<div class="vnx-dir-file-note">Este expediente se lee desde <b>direccion.vnxdir</b>, cifrado localmente y accesible únicamente durante una sesión de Dirección desbloqueada con PIN. Los resultados de las pruebas son evidencia complementaria; no sustituyen la revisión humana de Dirección.</div>'+
    '</div>';
  }
  async function openEmployeeFile(employeeId){
    if(!directionToken||!employeeId)return;
    const box=$('#vnxDirEmployeeFile');if(box)box.innerHTML='<div class="vnx-dir-empty">Abriendo expediente cifrado…</div>';
    try{
      const file=await window.vnx.directionEmployeeFile(directionToken,employeeId,{businessId:businessId()});
      renderEmployeeFile(file);
      $('#vnxDirEmployeeFilePanel')?.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(err){if(box)box.innerHTML='<div class="vnx-dir-empty">No se pudo abrir el expediente: '+esc(err.message||err)+'</div>'}
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
  function dimStatusLabel(v){
    return v==='favorable'?'Evidencia favorable':v==='mixta'?'Evidencia mixta':v==='atencion'?'Requiere atención':'Sin datos suficientes';
  }
  function dimClass(v){return v==='favorable'?'good':v==='atencion'?'warn':v==='mixta'?'mixed':'empty'}
  function renderDimensions(e){
    const ev=e.evaluation||{},dims=ev.dimensions||[];
    if(!dims.length)return '';
    return '<section class="vnx-dir-evaluation"><div class="vnx-dir-evaluation-head"><div><b>Evaluación multidimensional</b><span>Sin nota global · sin ranking de empleados</span></div><small>'+esc(ev.decisionRule||'')+'</small></div>'+
      '<div class="vnx-dir-dimension-grid">'+dims.map(d=>'<article class="vnx-dir-dimension '+dimClass(d.status)+'"><div><strong>'+esc(d.label)+'</strong><span>'+esc(dimStatusLabel(d.status))+'</span></div><p>'+esc(d.summary||'')+'</p><small>Confianza: '+esc(d.confidence||'baja')+'</small>'+
      ((d.evidence||[]).length?'<details><summary>Evidencia</summary>'+(d.evidence||[]).map(x=>'<em>• '+esc(x)+'</em>').join('')+'</details>':'')+
      ((d.missing||[]).length?'<details><summary>Qué falta comprobar</summary>'+(d.missing||[]).map(x=>'<em>• '+esc(x)+'</em>').join('')+'</details>':'')+
      '</article>').join('')+'</div>'+
      ((ev.reviewQuestions||[]).length?'<details class="vnx-dir-eval-questions"><summary>Preguntas que Dirección debe responder antes de decidir</summary>'+(ev.reviewQuestions||[]).map(x=>'<span>• '+esc(x)+'</span>').join('')+'</details>':'')+
      '</section>';
  }

  function renderReport(){
    const r=latestReport,summary=$('#vnxDirReportSummary'),rows=$('#vnxDirReportRows'),wrap=$('#vnxDirReportTableWrap'),detail=$('#vnxDirReportDetail'),timingBox=$('#vnxDirTimingByType');
    if(!r){if(wrap)wrap.hidden=true;return}
    if(summary)summary.innerHTML='<div class="vnx-dir-report-kpis">'+
      '<article><span>Tareas analizadas</span><strong>'+r.totals.assigned+'</strong></article>'+
      '<article><span>Fuera de plazo</span><strong>'+r.totals.overdueOpen+'</strong></article>'+
      '<article><span>Terminadas tarde</span><strong>'+r.totals.lateDone+'</strong></article>'+
      '<article><span>Recuperadas IA</span><strong>'+r.totals.doneAI+'</strong></article>'+
      '<article><span>Bloqueadas</span><strong>'+r.totals.blocked+'</strong></article>'+
      '</div><div class="vnx-dir-report-findings"><b>Hallazgos del periodo</b>'+r.findings.map(x=>'<span>• '+esc(x)+'</span>').join('')+'</div>'+
      (r.directionStandard?'<div class="vnx-dir-standard-used">Evaluado con Política General de Dirección v'+esc(r.directionStandard.version)+' · vigente desde '+fmtDate(r.directionStandard.effectiveFrom)+' · huella '+esc(String(r.directionStandard.hash||'').slice(0,12))+'</div>':'<div class="vnx-dir-standard-used warn">No existe una Política General de Dirección vigente para este informe.</div>');
    if(rows)rows.innerHTML=(r.employees||[]).map(e=>'<tr>'+
      '<td><b>'+esc(e.name)+'</b><small>'+esc(e.employeeCode||'')+' · '+esc(e.role||'')+'</small></td>'+
      '<td>'+e.assigned+'</td><td>'+fmtMinutes(e.timing?.averageReactionMinutes)+'</td><td>'+fmtMinutes(e.timing?.averageResponseMinutes)+'</td>'+
      '<td>'+fmtMinutes(e.timing?.averageResolutionMinutes)+'</td><td>'+fmtMinutes(e.timing?.totalBlockedMinutes)+'</td>'+
      '<td>'+pct(e.onTimeRate)+'</td><td>'+e.overdueOpen+'</td><td>'+e.doneAI+'</td><td>'+esc(reportArea(e))+'</td></tr>').join('')||'<tr><td colspan="10">Sin datos en este periodo.</td></tr>';
    if(timingBox){
      const types=r.timing?.byType||[];
      timingBox.innerHTML=types.length?'<div class="vnx-dir-timing-head"><b>Tiempos por tipo de trabajo</b><span>Reacción ≠ respuesta ≠ resolución ≠ bloqueo</span></div><div class="vnx-dir-timing-grid">'+types.map(x=>'<article><b>'+esc(x.label)+'</b><small>'+x.count+' registros</small><span>1ª reacción <strong>'+fmtMinutes(x.averageReactionMinutes)+'</strong></span><span>1ª respuesta <strong>'+fmtMinutes(x.averageResponseMinutes)+'</strong></span><span>Resolución <strong>'+fmtMinutes(x.averageResolutionMinutes)+'</strong></span><span>Bloqueado <strong>'+fmtMinutes(x.totalBlockedMinutes)+'</strong></span></article>').join('')+'</div>':'';
    }
    if(wrap)wrap.hidden=false;
    if(detail){
      detail.innerHTML=(r.employees||[]).map(e=>{
        const fit=e.roleFit||{},strengths=fit.strengths||[],frictions=fit.frictions||[],matches=fit.possibleMatches||[],questions=fit.contextQuestions||[];
        return '<article class="vnx-dir-report-person"><div class="vnx-dir-report-person-head"><div><h3>'+esc(e.name)+'</h3><p>'+esc(e.role||'')+'</p></div><span class="vnx-dir-fit-confidence">Confianza '+esc(fit.confidence||'insuficiente')+'</span></div>'+
        renderDimensions(e)+
        '<div class="vnx-dir-fit-box"><b>Lectura de encaje</b><p>'+esc(fit.interpretation||'Sin evidencia suficiente para valorar el encaje del puesto.')+'</p></div>'+
        (e.roleComparison?.requirements?.length?'<div class="vnx-dir-role-evidence"><b>Persona ↔ puesto: '+esc(e.roleComparison.roleTarget||'puesto objetivo')+'</b>'+e.roleComparison.requirements.map(x=>'<span class="'+esc(x.status)+'"><strong>'+esc(x.requirement)+'</strong> · '+esc(x.source)+'</span>').join('')+'<small>'+esc(e.roleComparison.conclusion||'')+'</small></div>':'')+
        (strengths.length?'<div class="vnx-dir-fit-cols"><div><b>Fortalezas observadas</b>'+strengths.map(x=>'<span class="good">✓ '+esc(x)+'</span>').join('')+'</div>':'')+
        (frictions.length?'<div><b>Fricciones recurrentes</b>'+frictions.map(x=>'<span class="warn">⚠ '+esc(x)+'</span>').join('')+'</div>':'')+
        ((strengths.length||frictions.length)?'</div>':'')+
        (matches.length?'<div class="vnx-dir-fit-matches"><b>Posibles funciones a explorar</b><p>'+matches.map(esc).join(' · ')+'</p></div>':'')+
        (questions.length?'<details class="vnx-dir-fit-context"><summary>Qué debería comprobar Dirección antes de concluir</summary>'+questions.map(x=>'<span>• '+esc(x)+'</span>').join('')+'</details>':'')+
        (e.humanContext?'<div class="vnx-dir-human-diagnosis"><b>Por qué puede estar ocurriendo</b>'+(e.humanContext.hypotheses||[]).map(h=>'<div><strong>'+esc(h.label)+'</strong><span>Confianza '+esc(h.confidence)+' · '+esc(h.meaning)+'</span><small>'+esc((h.evidence||[]).join(' · '))+'</small></div>').join('')+'</div>':'')+
        (e.humanContext?.management?'<div class="vnx-dir-management-view"><b>Lectura según el criterio de Dirección</b><p>'+esc(e.humanContext.management.approachLabel||'')+' · '+esc((e.humanContext.management.priorities||[]).map(x=>x.label+' '+x.value).join(' · '))+'</p>'+(e.humanContext.management.recommendations||[]).map(x=>'<span>• '+esc(x)+'</span>').join('')+((e.humanContext.management.reviewSteps||[]).length?'<details><summary>Ruta de decisión equilibrada</summary>'+(e.humanContext.management.reviewSteps||[]).map(x=>'<span>'+(x.required?'✓ ':'○ ')+esc(x.label)+' — '+esc(x.text)+'</span>').join('')+'</details>':'')+'<small>'+esc(e.humanContext.management.principle||'')+'</small></div>':'')+
        '<div class="vnx-dir-report-findings"><b>Hechos registrados</b>'+e.findings.map(x=>'<span>• '+esc(x)+'</span>').join('')+'</div>'+
        (e.examples?.length?'<details><summary>Ver ejemplos y evidencia</summary>'+e.examples.map(x=>'<div class="vnx-dir-report-example"><b>'+esc(x.title)+'</b><span>'+esc(x.moduleLabel)+' · '+esc(x.reasons.join(', '))+(x.delayMinutes?' · retraso '+fmtMinutes(x.delayMinutes):'')+'</span><small>Plazo: '+fmtDate(x.dueAt)+(x.completedAt?' · Finalizada: '+fmtDate(x.completedAt):'')+'</small></div>').join('')+'</details>':'')+
        '</article>';
      }).join('');
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
      e.name,e.employeeCode||'',e.role||'',e.assigned,e.done,pct(e.onTimeRate),e.overdueOpen,e.lateDone,e.doneAI,e.blocked,e.noEvidence,
      fmtMinutes(e.averageDelayMinutes),reportArea(e),
      e.roleFit?.interpretation||'',(e.roleFit?.possibleMatches||[]).join(' · '),e.roleFit?.confidence||'',
      (e.humanContext?.hypotheses||[]).map(x=>x.label+' ['+x.confidence+']').join(' · '),
      (e.humanContext?.management?.recommendations||[]).join(' · '),
      ...(e.evaluation?.dimensions||[]).map(d=>dimStatusLabel(d.status)+' — '+d.summary),
      e.findings.join(' · ')
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
        {label:'Código personal',value:e.employeeCode||''},{label:'Tareas',value:e.assigned},{label:'A tiempo',value:pct(e.onTimeRate)},{label:'Fuera de plazo',value:e.overdueOpen},
        {label:'1ª reacción',value:fmtMinutes(e.timing?.averageReactionMinutes)},{label:'1ª respuesta',value:fmtMinutes(e.timing?.averageResponseMinutes)},
        {label:'Resolución',value:fmtMinutes(e.timing?.averageResolutionMinutes)},{label:'Tiempo bloqueado',value:fmtMinutes(e.timing?.totalBlockedMinutes)},
        {label:'Terminadas tarde',value:e.lateDone},{label:'Recuperadas IA',value:e.doneAI},{label:'Bloqueadas',value:e.blocked},
        {label:'Retraso medio',value:fmtMinutes(e.averageDelayMinutes)},{label:'Área principal',value:reportArea(e)}
      ]});
      const ev=e.evaluation||{};
      blocks.push({type:'subheading',text:'Evaluación multidimensional · sin nota global'});
      blocks.push({type:'fact',label:'Regla de evaluación',text:ev.decisionRule||'No convertir dimensiones en una nota global.'});
      for(const d of ev.dimensions||[])blocks.push({type:'record',fields:[
        {label:'Dimensión',value:d.label},{label:'Estado',value:dimStatusLabel(d.status)},{label:'Confianza',value:d.confidence||'baja'},
        {label:'Lectura',value:d.summary||''},{label:'Evidencia',value:(d.evidence||[]).join(' · ')},{label:'Falta comprobar',value:(d.missing||[]).join(' · ')}
      ]});
      for(const q of ev.reviewQuestions||[])blocks.push({type:'question',text:q});
      const fit=e.roleFit||{};
      blocks.push({type:'subheading',text:'Lectura de encaje profesional'});
      blocks.push({type:'fact',label:'Interpretación',text:fit.interpretation||'Sin evidencia suficiente'});
      blocks.push({type:'fact',label:'Confianza',text:fit.confidence||'insuficiente'});
      for(const x of fit.strengths||[])blocks.push({type:'bullet',text:'Fortaleza observada: '+x});
      for(const x of fit.frictions||[])blocks.push({type:'bullet',text:'Fricción recurrente: '+x});
      if((fit.possibleMatches||[]).length)blocks.push({type:'fact',label:'Funciones a explorar',text:fit.possibleMatches.join(' · ')});
      for(const x of fit.contextQuestions||[])blocks.push({type:'question',text:x});
      const hc=e.humanContext||{};
      blocks.push({type:'subheading',text:'Hipótesis de causa'});
      for(const h of hc.hypotheses||[])blocks.push({type:'record',fields:[
        {label:'Hipótesis',value:h.label},{label:'Confianza',value:h.confidence},{label:'Qué significa',value:h.meaning},{label:'Evidencia',value:(h.evidence||[]).join(' · ')}
      ]});
      if(hc.management){
        blocks.push({type:'subheading',text:'Lectura según el criterio de Dirección'});
        blocks.push({type:'fact',label:'Enfoque declarado',text:hc.management.approachLabel||''});
        blocks.push({type:'fact',label:'Prioridades',text:(hc.management.priorities||[]).map(x=>x.label+' '+x.value).join(' · ')});
        for(const x of hc.management.recommendations||[])blocks.push({type:'bullet',text:x});
        for(const x of hc.management.reviewSteps||[])blocks.push({type:'record',fields:[{label:'Paso',value:x.label},{label:'Requerido por el criterio',value:x.required?'Sí':'No'},{label:'Qué revisar',value:x.text}]});
        blocks.push({type:'fact',label:'Regla',text:hc.management.principle||''});
      }
      blocks.push({type:'subheading',text:'Hechos registrados'});
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
    return window.vnx.exportData({format:'excel',title:'Informe Dirección · '+selected,headers:['Empleado','Código personal','Rol','Tareas','Completadas','A tiempo','Fuera de plazo','Terminadas tarde','Recuperadas IA','Bloqueadas','Sin evidencia','Retraso medio','Principal área','Lectura de encaje','Funciones a explorar','Confianza','Hipótesis de causa','Recomendaciones según Dirección','Cumplimiento','Calidad del resultado','Fiabilidad','Fortalezas por función','Aprendizaje y mejora','Autonomía y resolución','Colaboración y equipo','Contexto del puesto','Encaje actual y alternativo','Impacto empresarial','Hallazgos'],rows:reportRows()});
  }

  function listText(v){return Array.isArray(v)?v.join('\n'):''}
  function selectedCvEmployee(){return employees.find(e=>e.id===$('#vnxDirCvEmployee')?.value)||null}
  function renderCvProfile(){
    const e=selectedCvEmployee(),p=e?.cvProfile||{},set=(id,v)=>{const el=$('#'+id);if(el)el.value=v??''};
    const file=$('#vnxDirCvFile');if(file)file.textContent=e?((e.employeeCode||'')+(p.fileName?' · CV: '+p.fileName:' · Sin CV importado')):'Sin CV importado';
    set('vnxDirCvExperience',listText(p.experience));set('vnxDirCvEducation',listText(p.education));set('vnxDirCvSkills',listText(p.skills));
    set('vnxDirCvLanguages',listText(p.languages));set('vnxDirCvCertifications',listText(p.certifications));set('vnxDirCvConfirmed',listText(p.confirmedByManagement));
    set('vnxDirCvRoleTarget',p.roleTarget||e?.role||'');set('vnxDirCvRequirements',listText(p.roleRequirements));
    const box=$('#vnxDirCvComparison');if(box&&!e)box.innerHTML='<div class="vnx-dir-empty">Selecciona una persona para consultar su expediente.</div>';
  }
  function cvSplit(id){return String($('#'+id)?.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}
  async function saveCvProfile({silent=false}={}){
    if(!directionToken)return null;
    const employeeId=$('#vnxDirCvEmployee')?.value||'';if(!employeeId){if(!silent)alert('Selecciona un empleado.');return null}
    const updated=await window.vnx.directionUpdateCv(directionToken,employeeId,{
      experience:cvSplit('vnxDirCvExperience'),education:cvSplit('vnxDirCvEducation'),skills:cvSplit('vnxDirCvSkills'),
      languages:cvSplit('vnxDirCvLanguages'),certifications:cvSplit('vnxDirCvCertifications'),confirmedByManagement:cvSplit('vnxDirCvConfirmed'),
      roleTarget:String($('#vnxDirCvRoleTarget')?.value||'').trim(),roleRequirements:cvSplit('vnxDirCvRequirements')
    });
    const i=employees.findIndex(x=>x.id===employeeId);if(i>=0)employees[i]=updated;
    if(!silent){renderCvProfile();alert('Expediente profesional guardado.')}
    return updated;
  }
  function evidenceStatusLabel(v){return v==='observado'?'Observado trabajando':v==='confirmado'?'Confirmado por Dirección':v==='declarado'?'Declarado en CV/perfil':'Por comprobar'}
  function renderTeamRoleComparison(result){
    const box=$('#vnxDirCvComparison');if(!box)return;
    if(!result?.requirements?.length){box.innerHTML='<div class="vnx-dir-empty">Define los requisitos reales del puesto, uno por línea.</div>';return}
    box.innerHTML='<div class="vnx-dir-role-compare-head"><div><b>'+esc(result.roleTarget||'Puesto objetivo')+'</b><span>'+result.requirements.length+' requisitos analizados</span></div><small>'+esc(result.decisionRule||'')+'</small></div>'+
      '<div class="vnx-dir-role-compare-list">'+result.strongestByRequirement.map(x=>'<article><b>'+esc(x.requirement)+'</b>'+(x.unproven?'<span class="empty">Sin evidencia suficiente en la plantilla</span>':x.strongest.map(p=>'<span class="'+esc(p.status)+'"><strong>'+esc(p.name)+'</strong> · '+esc(p.employeeCode||'')+' · '+esc(evidenceStatusLabel(p.status))+'</span>').join(''))+'</article>').join('')+'</div>'+
      '<details class="vnx-dir-role-team-details"><summary>Ver evidencia por persona</summary>'+(result.employees||[]).map(e=>'<div><b>'+esc(e.name)+' · '+esc(e.employeeCode||'')+'</b>'+e.requirements.map(x=>'<span><strong>'+esc(x.requirement)+'</strong> · '+esc(evidenceStatusLabel(x.status))+'</span>').join('')+'</div>').join('')+'</details>';
  }

  function selectedHumanEmployee(){return employees.find(e=>e.id===$('#vnxDirHumanEmployee')?.value)||null}
  function renderHumanProfile(){
    const e=selectedHumanEmployee(),p=e?.workProfile||{};
    const set=(id,v)=>{const el=$('#'+id);if(el)el.value=v??''};
    set('vnxDirHumanSource',p.source||'agreed');
    set('vnxDirHumanStrengths',listText(p.declaredStrengths));
    set('vnxDirHumanPreferred',listText(p.preferredTasks));
    set('vnxDirHumanTraining',listText(p.trainingNeeds));
    set('vnxDirHumanRoles',listText(p.roleInterests));
    set('vnxDirHumanAutonomy',p.preferredAutonomy||'balanced');
    set('vnxDirHumanCollab',p.collaborationPreference||'balanced');
    set('vnxDirHumanContext',p.workContext||'');
    $$('.vnx-dir-motivators input[type="checkbox"]').forEach(x=>x.checked=(p.motivators||[]).includes(x.value));
  }
  function updatePolicyLabels(){
    const pairs=[['vnxDirProfit','vnxDirProfitValue'],['vnxDirService','vnxDirServiceValue'],['vnxDirPeople','vnxDirPeopleValue'],['vnxDirGrowth','vnxDirGrowthValue'],['vnxDirStability','vnxDirStabilityValue']];
    for(const [inputId,valueId] of pairs){const i=$('#'+inputId),v=$('#'+valueId);if(i&&v)v.textContent=i.value}
  }
  function standardDateInput(v){
    const d=v?new Date(v):new Date(),pad=x=>String(x).padStart(2,'0');
    return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
  }
  function renderDirectionStandards(){
    const current=directionStandards?.current||null,box=$('#vnxDirStandardCurrent'),history=$('#vnxDirStandardHistory');
    if(box)box.innerHTML=current
      ?'<b>Versión '+esc(current.version)+'</b><span>Vigente desde '+fmtDate(current.effectiveFrom)+'</span><small>Confirmada por '+esc(current.directorName)+' · '+esc(String(current.hash||'').slice(0,12))+'</small>'
      :'<b>Sin política confirmada</b><span>Las evaluaciones no deberían utilizar criterios no definidos.</span>';
    if(current){
      const director=$('#vnxDirStandardDirector'),effective=$('#vnxDirStandardEffective'),non=$('#vnxDirStandardNonNegotiables');
      if(director&&!director.value)director.value=current.directorName||'';
      if(effective&&!effective.value)effective.value=standardDateInput(new Date());
      if(non&&!non.value)non.value=(current.nonNegotiables||[]).join('\n');
      for(const row of $('.vnx-dir-standard-row')){
        const item=(current.criteria||[]).find(x=>x.key===row.dataset.standardKey);if(!item)continue;
        const ta=row.querySelector('textarea'),sel=row.querySelector('select');if(ta)ta.value=item.expectation||'';if(sel)sel.value=item.importance||'important';
      }
    }else{
      const effective=$('#vnxDirStandardEffective');if(effective&&!effective.value)effective.value=standardDateInput(new Date());
    }
    if(history){
      const versions=directionStandards?.versions||[];
      history.innerHTML=versions.length?'<h3>Historial inmutable</h3>'+versions.map(v=>'<article><b>v'+esc(v.version)+' · '+esc(v.directorName)+'</b><span>Aplicable desde '+fmtDate(v.effectiveFrom)+' · confirmada '+fmtDate(v.confirmedAt)+'</span><small>Huella: '+esc(v.hash||'')+'</small></article>').join(''):'';
    }
  }
  function collectDirectionStandard(){
    return {
      directorName:String($('#vnxDirStandardDirector')?.value||'').trim(),
      effectiveFrom:$('#vnxDirStandardEffective')?.value?new Date($('#vnxDirStandardEffective').value).toISOString():new Date().toISOString(),
      nonNegotiables:String($('#vnxDirStandardNonNegotiables')?.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean),
      criteria:$('.vnx-dir-standard-row').map(row=>({
        key:row.dataset.standardKey||'',
        label:String(row.querySelector('b')?.textContent||'').trim(),
        expectation:String(row.querySelector('textarea')?.value||'').trim(),
        importance:row.querySelector('select')?.value||'important'
      }))
    };
  }

  function renderManagementPolicy(){
    const p=managementPolicy||{profitability:50,customerService:50,peopleDevelopment:50,growth:50,stability:50,approach:'balanced',requireEmployeeConversation:true,requireSupportTrial:true,requireRoleAlternativeReview:true,employeeVoiceRequired:true,improvementWindowDays:30};
    const set=(id,v)=>{const el=$('#'+id);if(el)el.value=String(v??50)},check=(id,v)=>{const el=$('#'+id);if(el)el.checked=v!==false};
    set('vnxDirProfit',p.profitability);set('vnxDirService',p.customerService);set('vnxDirPeople',p.peopleDevelopment);set('vnxDirGrowth',p.growth);set('vnxDirStability',p.stability);
    const approach=$('#vnxDirApproach');if(approach)approach.value=p.approach||'balanced';
    check('vnxDirRequireConversation',p.requireEmployeeConversation);check('vnxDirEmployeeVoice',p.employeeVoiceRequired);
    check('vnxDirRequireSupport',p.requireSupportTrial);check('vnxDirRequireRoleReview',p.requireRoleAlternativeReview);
    set('vnxDirImprovementDays',p.improvementWindowDays||30);
    updatePolicyLabels();
  }
  function applyPolicyPreset(key){
    const values=key==='profit'
      ?{profitability:100,customerService:65,peopleDevelopment:25,growth:70,stability:70,approach:'results_first',requireEmployeeConversation:true,employeeVoiceRequired:true,requireSupportTrial:false,requireRoleAlternativeReview:true,improvementWindowDays:14}
      :key==='people'
        ?{profitability:55,customerService:75,peopleDevelopment:100,growth:65,stability:75,approach:'people_first',requireEmployeeConversation:true,employeeVoiceRequired:true,requireSupportTrial:true,requireRoleAlternativeReview:true,improvementWindowDays:45}
        :{profitability:50,customerService:50,peopleDevelopment:50,growth:50,stability:50,approach:'balanced',requireEmployeeConversation:true,employeeVoiceRequired:true,requireSupportTrial:true,requireRoleAlternativeReview:true,improvementWindowDays:30};
    const map={profitability:'vnxDirProfit',customerService:'vnxDirService',peopleDevelopment:'vnxDirPeople',growth:'vnxDirGrowth',stability:'vnxDirStability'};
    for(const [k,id] of Object.entries(map)){const el=$('#'+id);if(el)el.value=String(values[k])}
    const approach=$('#vnxDirApproach');if(approach)approach.value=values.approach;
    const checks={vnxDirRequireConversation:values.requireEmployeeConversation,vnxDirEmployeeVoice:values.employeeVoiceRequired,vnxDirRequireSupport:values.requireSupportTrial,vnxDirRequireRoleReview:values.requireRoleAlternativeReview};
    for(const [id,v] of Object.entries(checks)){const el=$('#'+id);if(el)el.checked=v}
    const days=$('#vnxDirImprovementDays');if(days)days.value=String(values.improvementWindowDays);
    updatePolicyLabels();
  }

  function renderSettings(){
    if(!settings)return;
    const a=$('#vnxDirDefaultSla'),b=$('#vnxDirAiGrace'),c=$('#vnxDirAiGlobal');
    if(a)a.value=String(settings.defaultSlaMinutes||480);
    if(b)b.value=String(settings.aiTakeoverGraceMinutes??60);
    if(c)c.checked=Boolean(settings.aiTakeoverEnabled);
  }
  function roleSplit(id){return String($('#'+id)?.value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}
  function activeRole(){
    const roles=roleWorkspace?.roles||[],typed=String($('#vnxDirRoleName')?.value||'').trim();
    return roles.find(x=>x.id===currentRoleId)||roles.find(x=>typed&&x.name===typed)||roles[0]||null;
  }
  function fillRoleForm(role){
    if(!role)return;currentRoleId=role.id;
    if($('#vnxDirRoleName'))$('#vnxDirRoleName').value=role.name||'';
    if($('#vnxDirRoleDescription'))$('#vnxDirRoleDescription').value=role.description||'';
    if($('#vnxDirRoleRequirements'))$('#vnxDirRoleRequirements').value=(role.requirements||[]).join('\n');
    if($('#vnxDirRolePriorities'))$('#vnxDirRolePriorities').value=(role.priorities||[]).join('\n');
  }
  function roleTypeLabel(v){return v==='structured_interview'?'Entrevista estructurada':v==='role_knowledge'?'Conocimiento del puesto':'Caso práctico'}
  function renderRoleQuestions(){
    const box=$('#vnxDirRoleQuestions');if(!box)return;
    const role=activeRole();if(role&&!currentRoleId)currentRoleId=role.id;
    const qs=(roleWorkspace?.questions||[]).filter(x=>role&&x.roleId===role.id);
    if(!qs.length){box.innerHTML='<div class="vnx-dir-empty">Guarda un puesto y pulsa «Generar test».</div>';return}
    box.innerHTML=qs.map((q,i)=>'<article class="vnx-dir-role-question" data-role-q="'+esc(q.id)+'"><small>'+(i+1)+' · '+esc(roleTypeLabel(q.type))+'</small><b>'+esc(q.prompt)+'</b><textarea data-role-answer="'+esc(q.id)+'" placeholder="Respuesta de la persona evaluada"></textarea><span>Observa: '+esc((q.evidenceFocus||[]).join(' · '))+'</span></article>').join('');
  }
  function roleStatusLabel(v){return v==='consistent'?'Evidencia consistente':v==='mixed'?'Evidencia mixta':v==='to_verify'?'Por comprobar':'Evidencia insuficiente'}
  function renderRoleAnalysis(a){
    const box=$('#vnxDirRoleAnalysis');if(!box)return;
    const x=a?.analysis;if(!x){box.innerHTML='<div class="vnx-dir-empty">Completa las respuestas y pulsa «Analizar respuestas».</div>';return}
    const dims=Array.isArray(x.dimensions)?x.dimensions:[];
    const listBlock=(title,arr)=>'<article><b>'+esc(title)+'</b>'+((arr||[]).length?(arr||[]).map(v=>'<span>• '+esc(v)+'</span>').join(''):'<span>—</span>')+'</article>';
    box.innerHTML='<div class="vnx-dir-role-analysis-head"><b>'+esc(x.headline||'Hipótesis profesional')+'</b><span>'+esc(x.roleFitHypothesis||'')+'</span><span>Confianza: '+esc(x.confidence||'low')+' · No es una prueba de CI, un diagnóstico psicológico ni una decisión automática.</span></div>'+
      '<div class="vnx-dir-role-dims">'+dims.map(d=>'<article class="vnx-dir-role-dim"><strong>'+esc(d.label||d.key)+'</strong><em>'+esc(roleStatusLabel(d.status))+' · confianza '+esc(d.confidence||'low')+'</em><p>'+esc(d.interpretation||'')+'</p></article>').join('')+'</div>'+
      '<div class="vnx-dir-role-analysis-lists">'+listBlock('Fortalezas con evidencia',x.strengths)+listBlock('Áreas a desarrollar o comprobar',x.developmentAreas)+listBlock('Funciones a explorar',x.rolesToExplore)+listBlock('Comprobaciones antes de decidir',x.checksBeforeDecision)+'</div>'+
      (Array.isArray(x.limitations)&&x.limitations.length?'<div class="vnx-dir-note"><b>Límites:</b> '+x.limitations.map(esc).join(' · ')+'</div>':'');
  }
  function governanceFromForm(){
    return {
      purpose:$('#vnxDirGovPurpose')?.value||'role_review',
      legalBasis:$('#vnxDirGovLegalBasis')?.value||'',
      reviewerRole:$('#vnxDirGovReviewerRole')?.value||'',
      reviewerName:String($('#vnxDirGovReviewerName')?.value||'').trim(),
      legalBasisNote:String($('#vnxDirGovLegalBasisNote')?.value||'').trim(),
      representativeReview:$('#vnxDirGovRepresentativeReview')?.value||'pending',
      dpiaStatus:$('#vnxDirGovDpiaStatus')?.value||'not_assessed',
      personInformed:Boolean($('#vnxDirGovPersonInformed')?.checked),
      humanDecision:Boolean($('#vnxDirGovHumanDecision')?.checked),
      sameCriteria:Boolean($('#vnxDirGovSameCriteria')?.checked),
      sensitiveDataExcluded:Boolean($('#vnxDirGovSensitiveExcluded')?.checked),
      notes:String($('#vnxDirGovNotes')?.value||'').trim()
    };
  }
  function renderGovernance(){
    const details=$('#vnxDirGovernance'),form=$('#vnxDirGovernanceForm'),stateBox=$('#vnxDirGovernanceState');
    if(!details)return;
    const demo=Boolean(accessState?.demoAvailable);
    details.hidden=demo;
    if(demo)return;
    const g=roleWorkspace?.governance||{};
    const set=(id,v)=>{const el=$('#'+id);if(el&&document.activeElement!==el)el.value=v??''};
    set('vnxDirGovPurpose',g.purpose||'role_review');set('vnxDirGovLegalBasis',g.legalBasis||'');set('vnxDirGovReviewerRole',g.reviewerRole||'');
    set('vnxDirGovReviewerName',g.reviewerName||'');set('vnxDirGovLegalBasisNote',g.legalBasisNote||'');
    set('vnxDirGovRepresentativeReview',g.representativeReview||'pending');set('vnxDirGovDpiaStatus',g.dpiaStatus||'not_assessed');set('vnxDirGovNotes',g.notes||'');
    const checks={vnxDirGovPersonInformed:g.personInformed,vnxDirGovHumanDecision:g.humanDecision,vnxDirGovSameCriteria:g.sameCriteria,vnxDirGovSensitiveExcluded:g.sensitiveDataExcluded};
    for(const [id,v] of Object.entries(checks)){const el=$('#'+id);if(el)el.checked=Boolean(v)}
    const complete=Boolean(g.confirmedAt&&g.legalBasis&&g.personInformed&&g.humanDecision&&g.sameCriteria&&g.sensitiveDataExcluded&&g.reviewerRole&&g.representativeReview!=='pending'&&!['not_assessed','pending'].includes(g.dpiaStatus));
    if(stateBox){
      stateBox.classList.toggle('ok',complete);
      stateBox.textContent=complete?'Garantías documentadas · '+fmtDate(g.confirmedAt)+' · la decisión sigue siendo humana y revisable.':'Pendiente de completar. VentaNexIA bloqueará el análisis de una persona real hasta documentar estas garantías.';
    }
    if(form)form.dataset.ready=complete?'1':'0';
  }
  async function saveGovernance({silent=false}={}){
    if(accessState?.demoAvailable)return roleWorkspace?.governance||null;
    const governance=governanceFromForm();
    const saved=await window.vnx.directionSaveAssessmentGovernance(directionToken,governance,{businessId:businessId()});
    roleWorkspace=roleWorkspace||{};roleWorkspace.governance=saved;renderGovernance();
    if(!silent)alert('Garantías de evaluación guardadas.');
    return saved;
  }
  function renderRoleWorkspace(){
    const role=activeRole();
    if(role)fillRoleForm(role);
    renderRoleQuestions();
    renderGovernance();
    const employeeId=$('#vnxDirRoleEmployee')?.value||'';
    const latest=(roleWorkspace?.assessments||[]).find(a=>(!role||a.roleId===role.id)&&(!employeeId||a.employeeId===employeeId)&&a.analysis);
    renderRoleAnalysis(latest||null);
  }
  function renderMiniIpipResult(record){
    const box=$('#vnxDirMiniIpipResult');if(!box)return;
    if(!record?.score?.factors){box.innerHTML='<div class="vnx-dir-empty">Sin Mini‑IPIP guardado para esta persona y puesto.</div>';return}
    const f=record.score.factors,rows=[
      ['Extraversión',f.E?.mean],['Amabilidad / orientación interpersonal',f.A?.mean],['Responsabilidad / organización',f.C?.mean],
      ['Apertura / imaginación',f.O?.mean],['Estabilidad emocional',f.emotionalStability?.mean]
    ];
    box.innerHTML='<div class="vnx-dir-miniipip-scores">'+rows.map(([label,value])=>'<article><b>'+esc(label)+'</b><strong>'+esc(value??'—')+'</strong><small>Media 1–5 · autoinforme, sin percentil</small></article>').join('')+'</div><div class="vnx-dir-note"><b>Peso en el análisis:</b> complementario y bajo. Nunca sustituye prueba práctica, entrevista estructurada ni evidencia real del trabajo.</div>';
  }
  function renderMiniIpip(){
    const box=$('#vnxDirMiniIpipItems');if(!box||!miniIpipDefinition?.items)return;
    const labels=(miniIpipDefinition.responseScale||[]).reduce((m,x)=>(m[x.value]=x.label,m),{});
    box.innerHTML=miniIpipDefinition.items.map(item=>'<article class="vnx-dir-miniipip-item"><b>'+item.id+'. '+esc(item.text)+'</b><div class="vnx-dir-miniipip-scale">'+[1,2,3,4,5].map(v=>'<label title="'+esc(labels[v]||String(v))+'"><input type="radio" name="vnxMiniIpip'+item.id+'" value="'+v+'"><span>'+v+'</span></label>').join('')+'</div></article>').join('');
    const role=activeRole(),employeeId=$('#vnxDirRoleEmployee')?.value||'';
    const latest=(roleWorkspace?.personalityAssessments||[]).find(x=>(!employeeId||x.employeeId===employeeId)&&(!role||!x.roleId||x.roleId===role.id));
    renderMiniIpipResult(latest||null);
  }
  async function saveRoleProfile(){
    if(!directionToken)return null;
    const role=await window.vnx.directionSaveRoleProfile(directionToken,{
      id:currentRoleId||undefined,name:String($('#vnxDirRoleName')?.value||'').trim(),description:String($('#vnxDirRoleDescription')?.value||'').trim(),
      requirements:roleSplit('vnxDirRoleRequirements'),priorities:roleSplit('vnxDirRolePriorities')
    },{businessId:businessId()});
    currentRoleId=role.id;roleWorkspace=await window.vnx.directionRoleWorkspace(directionToken,{businessId:businessId()});fillRoleForm(role);renderRoleQuestions();return role;
  }

  function render(){renderKpis();renderEmployees();renderEmployeeRows();renderTasks();renderSettings();renderHumanProfile();renderCvProfile();renderManagementPolicy();renderDirectionStandards();renderRoleWorkspace();renderMiniIpip();renderEmployeeFile(currentEmployeeFile)}

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
    $('[data-dir-progress]').forEach(b=>b.onclick=()=>promptEvent(b.dataset.dirProgress,'activity'));
    $('[data-dir-human]').forEach(b=>b.onclick=()=>promptEvent(b.dataset.dirHuman,'done'));
    $('[data-dir-ai]').forEach(b=>b.onclick=()=>markAi(b.dataset.dirAi));
    $('[data-dir-event]').forEach(b=>b.onclick=()=>addEvidence(b.dataset.dirEvent));
    $('[data-dir-carla]').forEach(b=>b.onclick=()=>openInCarla(b.dataset.dirCarla));
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
      const pin=String($('#vnxDirPin')?.value||''),confirm=String($('#vnxDirPinConfirm')?.value||''),btn=$('#vnxDirPinSubmit'),demo=Boolean(accessState?.demoAvailable);
      if(!demo&&!/^\d{4}$/.test(pin)){setGateMessage('El PIN debe tener exactamente 4 números.',true);return}
      if(!demo&&!accessState?.configured&&pin!==confirm){setGateMessage('Los dos PIN no coinciden.',true);return}
      if(btn){btn.disabled=true;btn.textContent=demo?'Preparando demo…':(accessState?.configured?'Comprobando…':'Creando PIN…')}
      try{
        let unlocked;
        if(demo){
          unlocked=await window.vnx.directionDemoUnlock({businessId:businessId()||'demo-business'});
        }else{
          if(!accessState?.configured){
            await window.vnx.directionSetPin(pin);
            accessState={...(accessState||{}),configured:true,lockedUntil:null};
          }
          unlocked=await window.vnx.directionUnlock(pin);
        }
        directionToken=String(unlocked?.token||'');
        if(!directionToken)throw new Error('No se ha podido abrir la sesión de Dirección.');
        if($('#vnxDirPin'))$('#vnxDirPin').value='';if($('#vnxDirPinConfirm'))$('#vnxDirPinConfirm').value='';
        setGateMessage(demo?'Demo cargada con datos ficticios.':'Acceso concedido.');
        await load();
      }catch(err){
        directionToken='';
        await refreshAccessStatus().catch(()=>{});
        setGateMessage(String(err?.message||err),true);
      }finally{
        if(btn){btn.disabled=false;btn.textContent=accessState?.demoAvailable?'Entrar en demo de Dirección':(accessState?.configured?'Desbloquear Dirección':'Crear PIN privado')}
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
      const due=$('#vnxDirTaskDue'),received=$('#vnxDirTaskReceived');if(due&&!due.value)due.value=defaultDue();if(received&&!received.value){const n=new Date(),pad=x=>String(x).padStart(2,'0');received.value=n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate())+'T'+pad(n.getHours())+':'+pad(n.getMinutes())}
      tf.onsubmit=async e=>{
        e.preventDefault();if(!directionToken)return;
        const employee=employees.find(x=>x.id===$('#vnxDirTaskEmployee').value);if(!employee)return;
        try{
          await window.vnx.directionCreateTask(directionToken,{
            businessId:businessId(),assigneeId:employee.id,assigneeName:employee.name,
            title:$('#vnxDirTaskTitle').value,description:$('#vnxDirTaskDesc').value,module:$('#vnxDirTaskModule').value,
            workType:$('#vnxDirTaskWorkType')?.value||$('#vnxDirTaskModule').value,requesterName:$('#vnxDirTaskRequester')?.value||'',
            requesterType:($('#vnxDirTaskWorkType')?.value==='customer_request'?'customer':$('#vnxDirTaskWorkType')?.value==='colleague_request'?'colleague':'internal'),
            receivedAt:$('#vnxDirTaskReceived')?.value?new Date($('#vnxDirTaskReceived').value).toISOString():new Date().toISOString(),
            priority:$('#vnxDirTaskPriority').value,dueAt:new Date($('#vnxDirTaskDue').value).toISOString(),
            aiTakeoverEligible:true,aiTakeoverEnabled:$('#vnxDirTaskAi').checked
          });
          tf.reset();$('#vnxDirTaskDue').value=defaultDue();if($('#vnxDirTaskReceived')){$('#vnxDirTaskReceived').value=''};await load();
        }catch(err){alert(err.message||err)}
      };
    }
    const filter=$('#vnxDirFilter');if(filter)filter.onchange=()=>{currentFilter=filter.value;renderTasks()};
    const cvSelect=$('#vnxDirCvEmployee');if(cvSelect)cvSelect.onchange=renderCvProfile;
    const cvForm=$('#vnxDirCvForm');if(cvForm)cvForm.onsubmit=async e=>{e.preventDefault();try{await saveCvProfile()}catch(err){alert(err.message||err)}};
    const cvImport=$('#vnxDirCvImport');if(cvImport)cvImport.onclick=async()=>{
      if(!directionToken)return;const employeeId=$('#vnxDirCvEmployee')?.value||'';if(!employeeId){alert('Selecciona un empleado.');return}
      cvImport.disabled=true;const old=cvImport.textContent;cvImport.textContent='Leyendo CV…';
      try{
        const doc=await window.vnx.analyzeDocument();if(!doc?.ok)return;
        const updated=await window.vnx.directionImportCv(directionToken,employeeId,{fileName:doc.fileName,text:doc.text});
        const i=employees.findIndex(x=>x.id===employeeId);if(i>=0)employees[i]=updated;
        renderCvProfile();alert('CV importado. Se han conservado solo datos profesionales útiles para el expediente.');
      }catch(err){alert('No se pudo importar el CV: '+(err.message||err))}
      finally{cvImport.disabled=false;cvImport.textContent=old}
    };
    const cvCompare=$('#vnxDirCvCompare');if(cvCompare)cvCompare.onclick=async()=>{
      if(!directionToken)return;const employeeId=$('#vnxDirCvEmployee')?.value||'';if(!employeeId){alert('Selecciona un empleado para definir el puesto de referencia.');return}
      try{
        await saveCvProfile({silent:true});
        const roleTarget=String($('#vnxDirCvRoleTarget')?.value||'').trim(),requirements=cvSplit('vnxDirCvRequirements');
        const result=await window.vnx.directionCompareTeamRole(directionToken,{businessId:businessId(),roleTarget,requirements});
        renderTeamRoleComparison(result);
      }catch(err){alert('No se pudo comparar la plantilla con el puesto: '+(err.message||err))}
    };
    const roleForm=$('#vnxDirRoleForm');if(roleForm)roleForm.onsubmit=async e=>{e.preventDefault();try{await saveRoleProfile();alert('Perfil del puesto guardado.')}catch(err){alert(err.message||err)}};
    const roleGenerate=$('#vnxDirRoleGenerate');if(roleGenerate)roleGenerate.onclick=async()=>{
      if(!directionToken)return;roleGenerate.disabled=true;const old=roleGenerate.textContent;roleGenerate.textContent='Generando…';
      try{const role=await saveRoleProfile();await window.vnx.directionGenerateRoleTest(directionToken,role.id,{businessId:businessId()});roleWorkspace=await window.vnx.directionRoleWorkspace(directionToken,{businessId:businessId()});renderRoleQuestions()}
      catch(err){alert('No se pudo generar el test: '+(err.message||err))}
      finally{roleGenerate.disabled=false;roleGenerate.textContent=old}
    };
    const roleAnalyze=$('#vnxDirRoleAnalyze');if(roleAnalyze)roleAnalyze.onclick=async()=>{
      if(!directionToken)return;const role=activeRole(),employeeId=$('#vnxDirRoleEmployee')?.value||'';
      if(!role){alert('Guarda primero el perfil del puesto.');return}if(!employeeId){alert('Selecciona la persona que ha respondido el test.');return}
      const answers=$('[data-role-answer]').map(x=>({questionId:x.dataset.roleAnswer,answer:x.value||''}));
      roleAnalyze.disabled=true;const old=roleAnalyze.textContent;roleAnalyze.textContent='Analizando…';
      try{const result=await window.vnx.directionAnalyzeRoleTest(directionToken,{businessId:businessId(),roleId:role.id,employeeId,answers});roleWorkspace=await window.vnx.directionRoleWorkspace(directionToken,{businessId:businessId()});renderRoleAnalysis(result)}
      catch(err){alert('No se pudo analizar el test: '+(err.message||err))}
      finally{roleAnalyze.disabled=false;roleAnalyze.textContent=old}
    };
    const roleEmp=$('#vnxDirRoleEmployee');if(roleEmp)roleEmp.onchange=()=>{renderRoleWorkspace();renderMiniIpip()};
    const miniSave=$('#vnxDirMiniIpipSave');if(miniSave)miniSave.onclick=async()=>{
      if(!directionToken)return;
      const employeeId=$('#vnxDirRoleEmployee')?.value||'',role=activeRole(),consent=Boolean($('#vnxDirMiniIpipConsent')?.checked);
      if(!employeeId){alert('Selecciona primero a la persona que responde el Mini‑IPIP.');return}
      if(!consent){alert('El Mini‑IPIP solo se guarda con consentimiento explícito de la persona.');return}
      const responses=(miniIpipDefinition?.items||[]).map(item=>({itemId:item.id,value:Number(document.querySelector('input[name="vnxMiniIpip'+item.id+'"]:checked')?.value||0)}));
      if(responses.some(x=>x.value<1||x.value>5)){alert('Completa los 20 ítems antes de guardar.');return}
      miniSave.disabled=true;const old=miniSave.textContent;miniSave.textContent='Guardando…';
      try{
        const record=await window.vnx.directionSaveMiniIpip(directionToken,{businessId:businessId(),employeeId,roleId:role?.id||'',responses,consent:true});
        roleWorkspace=await window.vnx.directionRoleWorkspace(directionToken,{businessId:businessId()});renderMiniIpipResult(record);alert('Mini‑IPIP guardado como autoinforme complementario de bajo peso.');
      }catch(err){alert('No se pudo guardar el Mini‑IPIP: '+(err.message||err))}
      finally{miniSave.disabled=false;miniSave.textContent=old}
    };
    const humanSelect=$('#vnxDirHumanEmployee');if(humanSelect)humanSelect.onchange=renderHumanProfile;
    const humanForm=$('#vnxDirHumanForm');if(humanForm)humanForm.onsubmit=async e=>{
      e.preventDefault();if(!directionToken)return;
      const employeeId=$('#vnxDirHumanEmployee')?.value||'';if(!employeeId){alert('Selecciona un empleado.');return}
      const split=id=>String($('#'+id)?.value||'').split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean);
      const motivators=$$('.vnx-dir-motivators input[type="checkbox"]:checked').map(x=>x.value);
      try{
        await window.vnx.directionUpdateEmployeeContext(directionToken,employeeId,{
          source:$('#vnxDirHumanSource')?.value||'agreed',
          declaredStrengths:split('vnxDirHumanStrengths'),
          preferredTasks:split('vnxDirHumanPreferred'),
          trainingNeeds:split('vnxDirHumanTraining'),
          roleInterests:split('vnxDirHumanRoles'),
          preferredAutonomy:$('#vnxDirHumanAutonomy')?.value||'balanced',
          collaborationPreference:$('#vnxDirHumanCollab')?.value||'balanced',
          motivators,
          workContext:$('#vnxDirHumanContext')?.value||''
        });
        await load();alert('Contexto laboral guardado.');
      }catch(err){alert(err.message||err)}
    };
    $$('#vnxDirManagementForm input[type="range"]').forEach(x=>x.addEventListener('input',updatePolicyLabels));
    $$('[data-dir-policy-preset]').forEach(b=>b.onclick=()=>applyPolicyPreset(b.dataset.dirPolicyPreset));
    const standardForm=$('#vnxDirStandardForm');if(standardForm)standardForm.onsubmit=async e=>{
      e.preventDefault();if(!directionToken)return;
      if(!$('#vnxDirStandardConfirmed')?.checked){alert('Debes confirmar que la nueva versión se aplicará por igual a toda la plantilla.');return}
      const nextVersion=(directionStandards?.versions?.[0]?.version||0)+1;
      if(!confirm('Vas a crear la versión '+nextVersion+' de las directrices. La versión anterior no se modificará. ¿Confirmas?'))return;
      try{
        await window.vnx.directionCreateStandard(directionToken,collectDirectionStandard(),true,{businessId:businessId()});
        $('#vnxDirStandardConfirmed').checked=false;
        await load();
        alert('Nueva versión de las directrices confirmada y registrada.');
      }catch(err){alert(err.message||err)}
    };
    const observationForm=$('#vnxDirObservationForm');if(observationForm)observationForm.onsubmit=async e=>{
      e.preventDefault();if(!directionToken)return;
      const employeeId=$('#vnxDirObservationEmployee')?.value||'';if(!employeeId){alert('Selecciona un empleado.');return}
      const detail=String($('#vnxDirObservationDetail')?.value||'').trim();if(!detail){alert('Describe el hecho que quieres registrar.');return}
      try{
        await window.vnx.directionAddEmployeeObservation(directionToken,employeeId,{
          type:$('#vnxDirObservationType')?.value||'quality_ok',
          module:$('#vnxDirObservationModule')?.value||'other',
          detail
        });
        $('#vnxDirObservationDetail').value='';
        if(latestReport)await generateEmployeeReport();
        alert('Evidencia laboral registrada.');
      }catch(err){alert(err.message||err)}
    };
    const managementForm=$('#vnxDirManagementForm');if(managementForm)managementForm.onsubmit=async e=>{
      e.preventDefault();if(!directionToken)return;
      try{
        managementPolicy=await window.vnx.directionManagementPolicy(directionToken,{
          profitability:Number($('#vnxDirProfit')?.value||50),
          customerService:Number($('#vnxDirService')?.value||50),
          peopleDevelopment:Number($('#vnxDirPeople')?.value||50),
          growth:Number($('#vnxDirGrowth')?.value||50),
          stability:Number($('#vnxDirStability')?.value||50),
          approach:$('#vnxDirApproach')?.value||'balanced',
          requireEmployeeConversation:Boolean($('#vnxDirRequireConversation')?.checked),
          employeeVoiceRequired:Boolean($('#vnxDirEmployeeVoice')?.checked),
          requireSupportTrial:Boolean($('#vnxDirRequireSupport')?.checked),
          requireRoleAlternativeReview:Boolean($('#vnxDirRequireRoleReview')?.checked),
          improvementWindowDays:Number($('#vnxDirImprovementDays')?.value||30)
        });
        renderManagementPolicy();
        if(latestReport)await generateEmployeeReport();
        alert('Criterio de Dirección guardado.');
      }catch(err){alert(err.message||err)}
    };
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
