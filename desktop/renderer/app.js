const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let state={permissions:{folders:[]},activity:[],paired:false};
let messages=[];
let browserRoot='';
let browserFolder='';
let browserItems=[];

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
async function init(){bindTabs();const sys=await window.vnx.systemStatus();$('#encState').textContent=sys.encrypted?'Cifrado':'Protección limitada';await refresh()}

$('#pairBtn').onclick=async()=>{const r=await window.vnx.pairDemo();await refresh();alert(`Equipo vinculado en modo prueba. ID: ${r.deviceId}`)};
$('#chooseFolder').onclick=async()=>{await window.vnx.chooseFolder();await refresh()};

function renderFolderBrowser(){
  const rows=[];
  if(browserFolder&&browserRoot&&browserFolder!==browserRoot){
    rows.push(`<div class="listrow foldernav" data-action="up"><div><b>⬆ Volver</b><span>${esc(browserRoot)}</span></div></div>`);
  }
  browserItems.forEach((x,i)=>rows.push(`<div class="listrow ${x.type==='folder'?'foldernav':''}" data-index="${i}"><div><b>${x.type==='folder'?'📁':'📄'} ${esc(x.name)}</b><span>${x.type==='folder'?'Abrir carpeta':'Archivo'}</span></div></div>`));
  $('#fileList').innerHTML=rows.join('')||'<div class="empty">Carpeta vacía.</div>';
  $('#fileMsg').textContent=browserFolder?`Viendo: ${browserFolder}`:'';
  $$('#fileList .foldernav').forEach(row=>row.onclick=async()=>{
    if(row.dataset.action==='up'){
      const parent=browserFolder.substring(0,Math.max(browserFolder.lastIndexOf('\\'),browserFolder.lastIndexOf('/')));
      await openFolder(parent||browserRoot);
      return;
    }
    const item=browserItems[Number(row.dataset.index)];
    if(item?.type==='folder')await openFolder(item.path);
  });
}

async function openFolder(folder){
  try{
    const result=await window.vnx.listFolder(folder);
    browserRoot=result.root;
    browserFolder=result.folder;
    browserItems=result.items||[];
    renderFolderBrowser();
    await refresh();
  }catch(e){$('#fileMsg').textContent=e.message}
}

$('#listFiles').onclick=async()=>{const f=$('#folderSelect').value;if(!f)return;browserRoot=f;browserFolder=f;await openFolder(f)};
$('#folderSelect').onchange=()=>{browserRoot='';browserFolder='';browserItems=[];$('#fileList').innerHTML='';$('#fileMsg').textContent=''};
$('#createTest').onclick=async()=>{const f=$('#folderSelect').value;if(!f)return;if(!confirm('VentaNexIA va a crear un archivo .txt de prueba dentro de esta carpeta. ¿Lo autorizas?'))return;try{const file=await window.vnx.createTestFile(f);$('#fileMsg').textContent=`Creado: ${file}`;await refresh()}catch(e){$('#fileMsg').textContent=e.message}};
$('#supportBtn').onclick=async()=>{if(!confirm('Se abrirá Asistencia rápida de Windows. Ninguna persona podrá controlar tu equipo hasta que tú aceptes la sesión dentro de Windows. ¿Continuar?'))return;await window.vnx.openQuickAssist();$('#supportMsg').textContent='Asistencia rápida abierta. Acepta solo si reconoces al técnico y el código de sesión.';await refresh()};
$('#supportStop').onclick=async()=>{await window.vnx.stopSupport();$('#supportMsg').textContent='Fin de asistencia registrado. Cierra también Asistencia rápida si siguiera abierta.';await refresh()};
$('#refreshActivity').onclick=refresh;

function renderMessages(){const root=$('#messages');root.innerHTML='<div class="msg ai">Soy el asistente de VentaNexIA. En esta versión puedo ayudarte, analizar tareas y trabajar con las funciones locales que tú autorices.</div>'+messages.map(m=>`<div class="msg ${m.role==='user'?'user':'ai'}">${esc(m.content)}</div>`).join('');root.scrollTop=root.scrollHeight}
$('#chatForm').onsubmit=async e=>{e.preventDefault();const input=$('#chatInput'),text=input.value.trim();if(!text)return;messages.push({role:'user',content:text});input.value='';renderMessages();const btn=e.submitter;btn.disabled=true;btn.textContent='Pensando…';try{const r=await window.vnx.sendChat(messages);messages.push({role:'assistant',content:r.reply||'Sin respuesta'});renderMessages();await refresh()}catch(err){messages.push({role:'assistant',content:`Error de conexión: ${err.message}`});renderMessages()}finally{btn.disabled=false;btn.textContent='Enviar'}};

init();
