const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let state={permissions:{folders:[]},activity:[],paired:false};
let messages=[];
let browsingFolder=null;

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function bindTabs(){ $$('.nav').forEach(b=>b.onclick=()=>{$$('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.tab').forEach(x=>x.classList.remove('active'));$('#'+b.dataset.tab).classList.add('active')}) }
function renderState(){
  $('#pairState').textContent=state.paired?'Vinculado':'Sin vincular';
  $('#folderCount').textContent=state.permissions?.folders?.length||0;
  const list=state.permissions?.folders||[];
  $('#permissionList').innerHTML=list.length?list.map(f=>`<div class="listrow"><div><b>${esc(f)}</b><span>Lectura y escritura de prueba autorizadas</span></div><button class="mini revoke" data-folder="${esc(f)}">Revocar</button></div>`).join(''):'<div class="empty">No hay carpetas autorizadas.</div>';
  $('#folderSelect').innerHTML=list.length?list.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join(''):'<option value="">Autoriza una carpeta primero</option>';
  $$('.revoke').forEach(b=>b.onclick=async()=>{await window.vnx.revokeFolder(b.dataset.folder);await refresh()});
  $('#activityList').innerHTML=(state.activity||[]).length?state.activity.map(a=>`<div class="listrow"><div><b>${esc(a.type)}</b><span>${esc(a.detail)}</span></div><small>${new Date(a.at).toLocaleString('es-ES')}</small></div>`).join(''):'<div class="empty">Todavía no hay actividad.</div>';
}
async function refresh(){state=await window.vnx.getState();renderState()}
async function init(){
  bindTabs();
  const sys=await window.vnx.systemStatus();
  $('#encState').textContent=sys.encrypted?'Cifrado':'Protección limitada';
  $('#appVersion').textContent=sys.version;
  await refresh();
}

$('#pairBtn').onclick=async()=>{const r=await window.vnx.pairDemo();await refresh();alert(`Equipo vinculado en modo prueba. ID: ${r.deviceId}`)};
$('#chooseFolder').onclick=async()=>{await window.vnx.chooseFolder();await refresh()};

async function showFolder(folder){
  $('#fileMsg').textContent='';
  try{
    const data=await window.vnx.listFolder(folder);
    browsingFolder=data.folder;
    const atRoot=data.folder===data.root;
    const back=atRoot?'':`<div class="listrow file-nav" data-path="${esc(data.root)}"><div><b>↑ Volver</b><span>${esc(data.root)}</span></div></div>`;
    const rows=data.items.map(x=>`<div class="listrow ${x.type==='folder'?'file-nav':''}" ${x.type==='folder'?`data-path="${esc(x.path)}"`:''}><div><b>${x.type==='folder'?'📁':'📄'} ${esc(x.name)}</b><span>${x.type==='folder'?'Carpeta':'Archivo'}</span></div></div>`).join('');
    $('#fileList').innerHTML=back+rows||'<div class="empty">Carpeta vacía.</div>';
    $('#fileMsg').textContent=`Viendo: ${data.folder}`;
    $$('.file-nav').forEach(row=>row.onclick=()=>showFolder(row.dataset.path));
    await refresh();
  }catch(e){$('#fileMsg').textContent=e.message}
}
$('#listFiles').onclick=async()=>{const f=$('#folderSelect').value;if(!f)return;await showFolder(f)};
$('#folderSelect').onchange=()=>{browsingFolder=null;$('#fileList').innerHTML='';$('#fileMsg').textContent=''};
$('#createTest').onclick=async()=>{const f=$('#folderSelect').value;if(!f)return;if(!confirm('VentaNexIA va a crear un archivo .txt de prueba dentro de esta carpeta. ¿Lo autorizas?'))return;try{const file=await window.vnx.createTestFile(f);$('#fileMsg').textContent=`Creado: ${file}`;await refresh()}catch(e){$('#fileMsg').textContent=e.message}};

function renderDiscovery(data){
  if(!data)return;
  const results=data.results||[];
  $('#discoveryStatus').textContent=`Búsqueda terminada. Se revisaron ${data.visited||0} carpetas por metadatos y se encontraron ${results.length} ubicaciones candidatas. Ninguna ha sido autorizada automáticamente.`;
  $('#discoveryList').innerHTML=results.length?results.map((r,i)=>`<div class="listrow discovery-row"><div><b>${esc(r.level)} · ${esc(r.path)}</b><span>${esc((r.reasons||[]).join(' · ')||`${r.businessFiles||0} archivos de datos compatibles`)}</span></div><button class="mini discovery-auth" data-index="${i}">Autorizar</button></div>`).join(''):'<div class="empty">No he encontrado una carpeta suficientemente clara. Prueba “Elegir dónde buscar” y selecciona la carpeta del programa o una unidad concreta.</div>';
  $$('.discovery-auth').forEach(btn=>btn.onclick=async()=>{
    const r=results[Number(btn.dataset.index)];
    if(!r)return;
    if(!confirm(`¿Autorizar esta carpeta para que VentaNexIA pueda consultar su contenido?\n\n${r.path}`))return;
    try{await window.vnx.authorizeDiscoveredFolder(r.path);btn.textContent='Autorizada';btn.disabled=true;await refresh()}catch(e){alert(e.message)}
  });
}
async function runDiscovery(mode){
  const status=$('#discoveryStatus');
  if(mode==='common'){
    const ok=confirm('VentaNexIA buscará posibles datos empresariales en ubicaciones habituales de este ordenador.\n\nSolo analizará localmente nombres, tipos, fechas y tamaños. No abrirá el contenido de los documentos ni enviará estos metadatos a Internet.\n\n¿Continuar?');
    if(!ok)return;
  }
  status.textContent='Buscando ubicaciones probables… Puede tardar unos segundos.';
  $('#discoveryList').innerHTML='';
  try{
    const data=mode==='common'?await window.vnx.scanCommonData():await window.vnx.chooseAndScanData();
    if(!data){status.textContent='Búsqueda cancelada.';return;}
    renderDiscovery(data);
  }catch(e){status.textContent=`No se pudo completar la búsqueda: ${e.message}`}
}
$('#scanCommon').onclick=()=>runDiscovery('common');
$('#scanChoose').onclick=()=>runDiscovery('choose');

$('#supportBtn').onclick=async()=>{if(!confirm('Se abrirá Asistencia rápida de Windows. Ninguna persona podrá controlar tu equipo hasta que tú aceptes la sesión dentro de Windows. ¿Continuar?'))return;await window.vnx.openQuickAssist();$('#supportMsg').textContent='Asistencia rápida abierta. Acepta solo si reconoces al técnico y el código de sesión.';await refresh()};
$('#supportStop').onclick=async()=>{await window.vnx.stopSupport();$('#supportMsg').textContent='Fin de asistencia registrado. Cierra también Asistencia rápida si siguiera abierta.';await refresh()};
$('#refreshActivity').onclick=refresh;

function renderMessages(){const root=$('#messages');root.innerHTML='<div class="msg ai">Soy el asistente de VentaNexIA. Puedo consultar la información que hayas autorizado y darte respuestas concretas basadas en tus datos.</div>'+messages.map(m=>`<div class="msg ${m.role==='user'?'user':'ai'}">${esc(m.content)}</div>`).join('');root.scrollTop=root.scrollHeight}
$('#chatForm').onsubmit=async e=>{e.preventDefault();const input=$('#chatInput'),text=input.value.trim();if(!text)return;messages.push({role:'user',content:text});input.value='';renderMessages();const btn=e.submitter;btn.disabled=true;btn.textContent='Pensando…';try{const r=await window.vnx.sendChat(messages);messages.push({role:'assistant',content:r.reply||'Sin respuesta'});renderMessages();await refresh()}catch(err){messages.push({role:'assistant',content:`Error de conexión: ${err.message}`});renderMessages()}finally{btn.disabled=false;btn.textContent='Enviar'}};

init();
