const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let state={permissions:{folders:[]},activity:[],paired:false,license:{}};
let messages=[];
let browsingFolder=null;

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function openTab(name){
  $$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
  $$('.tab').forEach(x=>x.classList.toggle('active',x.id===name));
}
function bindTabs(){
  $$('.nav').forEach(b=>b.onclick=()=>openTab(b.dataset.tab));
  $$('[data-tab-jump]').forEach(b=>b.onclick=()=>openTab(b.dataset.tabJump));
}
function renderLicense(){
  const l=state.license||{};
  const activated=Boolean(l.activated);
  $('#homeLicenseState').textContent=activated?'Activa':'Sin activar';
  $('#licenseCustomer').textContent=l.customerId||'Sin activar';
  $('#licenseDevice').textContent=l.deviceId?String(l.deviceId).slice(0,12):'—';
  $('#licenseDevices').textContent=l.limit?`${l.activeCount||0} / ${l.limit}`:'0 / 0';
  $('#licensePlan').textContent=l.plan||'—';
  if(l.customerId&&!$('#customerIdInput').value)$('#customerIdInput').value=l.customerId;
  if(activated){
    $('#licenseMsg').textContent=`Licencia activa. Quedan ${Math.max(0,l.available||0)} plaza(s) de dispositivo disponibles. Dispositivo adicional: ${Number(l.extraDeviceMonthlyEur||49).toFixed(0)} €/mes.`;
  }
}
function renderState(){
  $('#pairState').textContent='Datos reales';
  $('#folderCount').textContent=state.permissions?.folders?.length||0;
  renderLicense();
  const list=state.permissions?.folders||[];
  $('#permissionList').innerHTML=list.length?list.map(f=>`<div class="listrow"><div><b>${esc(f)}</b><span>Carpeta autorizada</span></div><button class="mini revoke" data-folder="${esc(f)}">Revocar</button></div>`).join(''):'<div class="empty">No hay carpetas autorizadas.</div>';
  $('#folderSelect').innerHTML=list.length?list.map(f=>`<option value="${esc(f)}">${esc(f)}</option>`).join(''):'<option value="">Autoriza una carpeta primero</option>';
  $$('.revoke').forEach(b=>b.onclick=async()=>{await window.vnx.revokeFolder(b.dataset.folder);await refresh()});
  $('#activityList').innerHTML=(state.activity||[]).length?state.activity.map(a=>`<div class="listrow"><div><b>${esc(a.type)}</b><span>${esc(a.detail)}</span></div><small>${new Date(a.at).toLocaleString('es-ES')}</small></div>`).join(''):'<div class="empty">Todavía no hay actividad.</div>';
}
async function refresh(){state=await window.vnx.getState();renderState()}

function getPortals(){
  try{return JSON.parse(localStorage.getItem('vnx_portals')||'[]')}catch{return []}
}
function setPortals(items){localStorage.setItem('vnx_portals',JSON.stringify(items||[]))}
function renderPortals(){
  const root=$('#portalList');if(!root)return;
  const items=getPortals();
  root.innerHTML=items.length?items.map((p,i)=>`<div class="listrow"><div><b>${esc(p.name)}</b><span>${esc(p.url)} · ${p.mode==='read'?'Solo lectura':'Lectura y escritura'}</span></div><div class="row"><button class="mini portal-open" data-i="${i}">Abrir</button><button class="mini portal-remove" data-i="${i}">Quitar</button></div></div>`).join(''):'<div class="empty">Todavía no hay portales configurados.</div>';
  $$('.portal-open').forEach(b=>b.onclick=()=>{const p=items[Number(b.dataset.i)];if(p?.url)window.open(p.url,'_blank')});
  $$('.portal-remove').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.i);const next=getPortals();next.splice(i,1);setPortals(next);renderPortals()});
}
function setupPortalUi(){
  const toggle=$('#showPortalSetup'),box=$('#portalSetup');if(!toggle||!box)return;
  toggle.onclick=()=>{box.style.display=box.style.display==='none'?'block':'none';renderPortals()};
  $('#openPortal').onclick=()=>{const url=$('#portalUrl').value.trim();if(!/^https:\/\//i.test(url)){ $('#portalMsg').textContent='Introduce una URL segura que empiece por https://';return;}window.open(url,'_blank')};
  $('#savePortal').onclick=()=>{
    const name=$('#portalName').value.trim(),url=$('#portalUrl').value.trim(),mode=$('#portalMode').value;
    if(!name||!/^https:\/\//i.test(url)){ $('#portalMsg').textContent='Indica un nombre y una URL válida https://';return;}
    const items=getPortals();
    if(!items.some(x=>x.url===url))items.push({name,url,mode,createdAt:new Date().toISOString()});
    else{const i=items.findIndex(x=>x.url===url);items[i]={...items[i],name,mode};}
    setPortals(items);renderPortals();
    $('#portalMsg').textContent=mode==='read'?'Conexión guardada en modo SOLO LECTURA. No se autoriza ninguna modificación.':'Conexión guardada con lectura y escritura. Las acciones sensibles deberán pedir confirmación.';
  };
  renderPortals();
}

function getRealModuleSources(){
  try{return JSON.parse(localStorage.getItem('vnx_real_module_sources')||'{}')}catch{return {}}
}
function setRealModuleSource(key,value){const all=getRealModuleSources();all[key]=value;localStorage.setItem('vnx_real_module_sources',JSON.stringify(all));}
function setupServiceConnectionWizard(){
  const modal=$('#serviceConnectionModal'),title=$('#serviceConnectionTitle'),text=$('#serviceConnectionText'),provider=$('#serviceProvider'),notice=$('#serviceConnectionNotice'),prepare=$('#servicePrepareBtn'),disconnect=$('#serviceDisconnectBtn'),cancel=$('#serviceCancelBtn');
  if(!modal)return ()=>{};
  const providers={
    email:[['gmail','Gmail'],['microsoft_365','Microsoft 365']],
    whatsapp:[['whatsapp_business','WhatsApp Business']],
    social:[['instagram','Instagram'],['facebook','Facebook'],['linkedin','LinkedIn'],['x_twitter','X / Twitter']],
    crm:[['hubspot','HubSpot']]
  };
  const labels={email:'Email',whatsapp:'WhatsApp Business',social:'Redes sociales',crm:'CRM'};
  let activeKey=null,activeButton=null,oauthState=null,pollTimer=null;
  function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
  cancel.onclick=()=>{stopPoll();modal.style.display='none';activeKey=null;activeButton=null;oauthState=null};
  prepare.onclick=async()=>{
    if(!activeKey)return;
    prepare.disabled=true;prepare.textContent='Abriendo autorización…';
    notice.innerHTML='<b>Autoriza el acceso en tu navegador.</b> Cuando termines, VentaNexIA detectará la conexión automáticamente.';
    try{
      const started=await window.vnx.startOAuth({module:activeKey,provider:provider.value});
      oauthState=started.state;
      stopPoll();
      pollTimer=setInterval(async()=>{
        try{
          const st=await window.vnx.pollOAuth({state:oauthState});
          if(st?.status==='connected'){
            stopPoll();
            const all=getRealModuleSources();
            all[activeKey]={provider:st.provider,label:st.label,mode:st.mode||'write',status:'connected',connectedAt:new Date().toISOString()};
            localStorage.setItem('vnx_real_module_sources',JSON.stringify(all));
            if(activeButton)activeButton.textContent='🟢 '+labels[activeKey]+' · '+(st.label||'Conectado');
            notice.innerHTML='<b>🟢 Conectado correctamente.</b> '+esc(st.label||labels[activeKey])+' ya está disponible para VentaNexIA.';
            prepare.disabled=false;prepare.textContent='Autorizar y conectar';
          }else if(['denied','expired','error'].includes(st?.status)){
            stopPoll();prepare.disabled=false;prepare.textContent='Autorizar y conectar';
            notice.innerHTML='<b>No se completó la autorización.</b> '+esc(st?.error||'Vuelve a intentarlo.');
          }
        }catch(err){
          if(String(err?.message||'').includes('ya recogida'))stopPoll();
        }
      },2000);
    }catch(e){
      prepare.disabled=false;prepare.textContent='Autorizar y conectar';
      const msg=e?.data?.code==='CONNECTOR_NOT_CONFIGURED'?'Este conector todavía necesita que VentaNexIA registre su aplicación oficial con el proveedor.':(e.message||String(e));
      notice.innerHTML='<b>No se pudo iniciar.</b> '+esc(msg);
    }
  };
  disconnect.onclick=async()=>{
    if(!activeKey)return;
    if(!confirm('¿Desconectar '+labels[activeKey]+' de VentaNexIA en este ordenador?'))return;
    stopPoll();await window.vnx.disconnectIntegration(activeKey);
    const all=getRealModuleSources();delete all[activeKey];localStorage.setItem('vnx_real_module_sources',JSON.stringify(all));
    if(activeButton)activeButton.textContent=activeKey==='email'?'Conectar correo':activeKey==='whatsapp'?'Conectar WhatsApp Business':activeKey==='social'?'Conectar redes sociales':'Conectar CRM';
    notice.innerHTML='<b>Desconectado.</b>';
  };
  return async(key,button)=>{
    activeKey=key;activeButton=button;oauthState=null;stopPoll();
    title.textContent='Autorizar '+labels[key];
    text.textContent='Elige el proveedor. Se abrirá su página oficial para que inicies sesión y concedas los permisos.';
    provider.innerHTML=(providers[key]||[]).map(([v,n])=>'<option value="'+esc(v)+'">'+esc(n)+'</option>').join('');
    notice.innerHTML='<b>No necesitas tokens, IDs ni contraseñas.</b> La autorización se hace directamente con el proveedor.';
    try{
      const st=await window.vnx.integrationStatus(key);
      if(st?.connected)notice.innerHTML='<b>🟢 Ya conectado:</b> '+esc(st.label||labels[key])+' · '+(st.mode==='write'?'lectura y escritura':'solo lectura')+'.';
    }catch{}
    modal.style.display='flex';
  };
}

function setupShopifyConnectionUi(){
  const modal=$('#shopifyConnectionModal'),shop=$('#shopifyShop'),msg=$('#shopifyConnectionMsg'),connect=$('#shopifyConnectBtn'),disconnect=$('#shopifyDisconnectBtn'),cancel=$('#shopifyCancelBtn');
  if(!modal)return ()=>{};
  let activeButton=null,oauthState=null,pollTimer=null;
  function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
  async function refreshShopifyStatus(){
    try{
      const st=await window.vnx.shopifyStatus();
      if(st?.connected){
        shop.value=st.shop||'';
        msg.innerHTML='<b>🟢 Conectado:</b> '+esc(st.shopName||st.shop)+' · '+(st.scopes||[]).length+' permisos concedidos.';
        if(activeButton)activeButton.textContent='🟢 Shopify · '+(st.shopName||st.shop);
      }else msg.innerHTML='<b>Sin conectar.</b> Indica tu dominio .myshopify.com y autoriza el acceso directamente en Shopify.';
    }catch(e){msg.textContent=e.message||'No se pudo comprobar Shopify'}
  }
  cancel.onclick=()=>{stopPoll();modal.style.display='none';activeButton=null;oauthState=null};
  connect.onclick=async()=>{
    const s=shop.value.trim();
    if(!s){msg.innerHTML='<b>Falta la tienda.</b> Indica tu dominio interno, por ejemplo tienda.myshopify.com.';return;}
    connect.disabled=true;connect.textContent='Abriendo Shopify…';msg.innerHTML='<b>Autoriza en Shopify.</b> VentaNexIA detectará la conexión cuando termines.';
    try{
      const started=await window.vnx.startOAuth({module:'shopify',provider:'shopify',shop:s});
      oauthState=started.state;stopPoll();
      pollTimer=setInterval(async()=>{
        try{
          const st=await window.vnx.pollOAuth({state:oauthState});
          if(st?.status==='connected'){
            stopPoll();
            setRealModuleSource('shopify',{integration:'shopify',status:'connected',shop:st.shop,shopName:st.shopName||st.label,mode:'write',connectedAt:new Date().toISOString()});
            msg.innerHTML='<b>🟢 Shopify conectado.</b> '+esc(st.shopName||st.label||st.shop);
            if(activeButton)activeButton.textContent='🟢 Shopify · '+esc(st.shopName||st.label||st.shop);
            connect.disabled=false;connect.textContent='Autorizar con Shopify';
          }else if(['denied','expired','error'].includes(st?.status)){
            stopPoll();connect.disabled=false;connect.textContent='Autorizar con Shopify';msg.innerHTML='<b>No se completó la autorización.</b> '+esc(st?.error||'Vuelve a intentarlo.');
          }
        }catch(err){}
      },2000);
    }catch(e){
      connect.disabled=false;connect.textContent='Autorizar con Shopify';
      const msgText=e?.data?.code==='CONNECTOR_NOT_CONFIGURED'?'El conector Shopify todavía necesita registrar la aplicación oficial de VentaNexIA.':(e.message||String(e));
      msg.innerHTML='<b>No se pudo iniciar.</b> '+esc(msgText);
    }
  };
  disconnect.onclick=async()=>{
    if(!confirm('¿Desconectar Shopify de VentaNexIA en este ordenador?'))return;
    stopPoll();await window.vnx.disconnectShopify();
    const all=getRealModuleSources();delete all.shopify;localStorage.setItem('vnx_real_module_sources',JSON.stringify(all));
    shop.value='';msg.innerHTML='<b>Shopify desconectado.</b>';if(activeButton)activeButton.textContent='Añadir tienda Shopify';
  };
  return async button=>{activeButton=button;modal.style.display='flex';await refreshShopifyStatus()};
}

function setupRealModuleMode(){
  const labels={email:'Email',whatsapp:'WhatsApp Business',social:'Redes sociales',prospecting:'Captación',crm:'CRM',shopify:'Shopify',wordpress:'WordPress / WooCommerce',github_vercel:'GitHub / Vercel'};
  const saved=getRealModuleSources();
  const openServiceWizard=setupServiceConnectionWizard();
  const openShopify=setupShopifyConnectionUi();
  $$('[data-real-module]').forEach(btn=>{
    const key=btn.dataset.realModule,label=labels[key]||key,current=saved[key];
    if(current?.folder)btn.textContent='🟢 '+label+' · datos reales autorizados';
    if(current?.url)btn.textContent=label+' · URL registrada';
    if(key==='shopify'&&current?.status==='connected')btn.textContent='🟢 Shopify · '+(current.shopName||current.shop||'Conectado');
    if(current?.status==='authorization_required')btn.textContent='Pendiente de autorización oficial';
    btn.onclick=async()=>{
      if(['email','whatsapp','social','crm'].includes(key)){openServiceWizard(key,btn);return;}
      if(key==='shopify'){await openShopify(btn);return;}
      if(['wordpress','github_vercel'].includes(key)){
        const previous=current?.url||'';
        const entered=prompt(key==='shopify'?'Introduce la URL real de tu tienda Shopify (https://... o https://...myshopify.com)':'Introduce la URL real del sitio o proyecto (https://...)',previous);
        if(entered===null)return;
        const url=String(entered||'').trim();
        if(!/^https:\/\//i.test(url)){alert('La URL debe empezar por https://');return;}
        setRealModuleSource(key,{url,authorizedAt:new Date().toISOString(),mode:'real',connection:'url_registered'});
        btn.textContent=label+' · URL registrada';
        alert(label+': URL real registrada. Para leer datos privados o realizar cambios necesitaremos la API/OAuth oficial de esa cuenta.');
        return;
      }
      const folder=await window.vnx.chooseFolder();
      if(!folder)return;
      setRealModuleSource(key,{folder,authorizedAt:new Date().toISOString(),mode:'real'});
      btn.textContent='🟢 '+label+' · datos reales autorizados';
      await refresh();
      alert(label+': fuente real autorizada.');
    };
  });
}

async function init(){
  bindTabs();
  setupPortalUi();
  setupRealModuleMode();
  const sys=await window.vnx.systemStatus();
  $('#encState').textContent=sys.encrypted?'Cifrado':'Protección limitada';
  $('#appVersion').textContent=sys.version;
  await refresh();
}

$('#chooseFolder').onclick=async()=>{await window.vnx.chooseFolder();await refresh()};

$('#activateLicenseBtn').onclick=async()=>{
  const customerId=$('#customerIdInput').value.trim();
  const activationCode=$('#activationCodeInput').value.trim();
  const msg=$('#licenseMsg'),btn=$('#activateLicenseBtn');
  if(!customerId||!activationCode){msg.textContent='Introduce el ID de cliente y el código de activación.';return;}
  btn.disabled=true;btn.textContent='Activando…';msg.textContent='Comprobando licencia y plazas disponibles…';
  try{
    const license=await window.vnx.activateLicense({customerId,activationCode});
    state.license=license;$('#activationCodeInput').value='';renderState();
    msg.textContent=`Dispositivo activado correctamente. ${license.activeCount} de ${license.limit} plazas utilizadas.`;
  }catch(e){
    const d=e?.data||{};
    msg.textContent=d.code==='DEVICE_LIMIT_REACHED'?`${d.message} Dispositivo adicional: ${d.extraDeviceMonthlyEur||49} €/mes.`:(e.message||'No se pudo activar el dispositivo');
  }finally{btn.disabled=false;btn.textContent='Activar este dispositivo'}
};
$('#refreshLicenseBtn').onclick=async()=>{
  const btn=$('#refreshLicenseBtn'),msg=$('#licenseMsg');btn.disabled=true;btn.textContent='Comprobando…';
  try{state.license=await window.vnx.refreshLicense();renderState();msg.textContent=state.license.activated?'Licencia comprobada correctamente.':'Este dispositivo todavía no está activado.'}
  catch(e){msg.textContent=e.message||'No se pudo comprobar la licencia'}
  finally{btn.disabled=false;btn.textContent='Comprobar licencia'}
};

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
$('#createTest').onclick=async()=>{const f=$('#folderSelect').value;if(!f)return;if(!confirm('VentaNexIA va a crear un archivo .txt de comprobación dentro de esta carpeta. ¿Lo autorizas?'))return;try{const file=await window.vnx.createTestFile(f);$('#fileMsg').textContent=`Creado: ${file}`;await refresh()}catch(e){$('#fileMsg').textContent=e.message}};

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
