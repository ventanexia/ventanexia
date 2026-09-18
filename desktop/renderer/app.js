const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let state={permissions:{folders:[]},activity:[],paired:false,license:{}};
let messages=[];
let browsingFolder=null;
setTimeout(()=>{const splash=document.querySelector('#futureSplash');if(splash)splash.classList.add('hide')},2300);

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function versionGreater(a,b){
  const A=String(a||'').split('.').map(Number),B=String(b||'').split('.').map(Number);
  for(let i=0;i<Math.max(A.length,B.length);i++){const x=A[i]||0,y=B[i]||0;if(x>y)return true;if(x<y)return false}return false
}
async function checkForUpdates(currentVersion){
  const panel=$('#updatePanel');if(!panel)return;
  try{
    const r=await window.vnx.checkUpdate();
    const u=r?.update;if(!u||!versionGreater(u.version,currentVersion))return;
    $('#updateTitle').textContent='Nueva versión '+u.version+' disponible';
    $('#updateNotes').innerHTML=esc(u.notes||'Hemos mejorado VentaNexIA.').replace(/\n/g,'<br>')+(u.planNotes?'<br><br><b>Mejoras disponibles en tu plan:</b><br>'+esc(u.planNotes).replace(/\n/g,'<br>'):'');
    $('#updateOpenBtn').onclick=()=>window.vnx.openExternal(u.downloadUrl);
    panel.style.display='block';
  }catch{}
}
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
  const mirror=$('#homeLicenseStateMirror');if(mirror)mirror.textContent=activated?'Activa':'Sin activar';
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
  const modal=$('#serviceConnectionModal'),title=$('#serviceConnectionTitle'),text=$('#serviceConnectionText'),provider=$('#serviceProvider'),account=$('#serviceAccount'),notice=$('#serviceConnectionNotice'),prepare=$('#servicePrepareBtn'),disconnect=$('#serviceDisconnectBtn'),cancel=$('#serviceCancelBtn');
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
    prepare.disabled=true;prepare.textContent='Abriendo la página para conectar…';
    notice.innerHTML='<b>Sigue los pasos que verás en el navegador.</b> Cuando termines, VentaNexIA lo sabrá automáticamente.';
    try{
      const started=await window.vnx.startOAuth({module:activeKey,provider:provider.value,account:account?.value?.trim()||''});
      oauthState=started.state;
      stopPoll();
      pollTimer=setInterval(async()=>{
        try{
          const st=await window.vnx.pollOAuth({state:oauthState});
          if(st?.status==='connected'){
            stopPoll();
            const all=getRealModuleSources();
            all[activeKey]={provider:st.provider,label:st.label,account:account?.value?.trim()||'',mode:st.mode||'write',status:'connected',connectedAt:new Date().toISOString()};
            localStorage.setItem('vnx_real_module_sources',JSON.stringify(all));
            if(activeButton)activeButton.textContent='🟢 '+labels[activeKey]+' · '+(st.label||'Conectado');
            notice.innerHTML='<b>🟢 Conectado correctamente.</b> '+esc(st.label||labels[activeKey])+' ya está disponible para VentaNexIA.';
            prepare.disabled=false;prepare.textContent='Conectar ahora';
          }else if(['denied','expired','error'].includes(st?.status)){
            stopPoll();prepare.disabled=false;prepare.textContent='Conectar ahora';
            notice.innerHTML='<b>No se pudo terminar la conexión.</b> '+esc(st?.error||'Vuelve a intentarlo.');
          }
        }catch(err){
          if(String(err?.message||'').includes('ya recogida'))stopPoll();
        }
      },2000);
    }catch(e){
      prepare.disabled=false;prepare.textContent='Conectar ahora';
      const raw=e?.message||String(e);
      const missing=/conector todavía no configurado|connector_not_configured/i.test(raw);
      const msg=missing?'Esta conexión todavía necesita una activación única por parte de VentaNexIA. Tu cuenta está bien; falta activar el acceso oficial con este proveedor.':raw.replace(/^Error invoking remote method[^:]*:\s*/i,'');
      notice.innerHTML='<b>No se pudo conectar todavía.</b> '+esc(msg);
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
    text.textContent='Elige la cuenta que quieres conectar. Se abrirá su página oficial para que inicies sesión y aceptes el acceso.';
    provider.innerHTML=(providers[key]||[]).map(([v,n])=>'<option value="'+esc(v)+'">'+esc(n)+'</option>').join('');
    if(account){
      const saved=getRealModuleSources()[key];
      account.value=saved?.account||'';
      account.placeholder=key==='email'?'Ej.: ventas@empresa.com':key==='social'?'Ej.: mobiliario.sanitario':'Ej.: nombre de la cuenta';
    }
    notice.innerHTML='<b>No necesitas copiar códigos raros ni contraseñas.</b> Escribe la cuenta que quieres conectar y pulsa “Conectar ahora”.';
    try{
      const st=await window.vnx.integrationStatus(key);
      if(st?.connected)notice.innerHTML='<b>🟢 Ya está conectado:</b> '+esc(st.label||labels[key])+' · '+(st.mode==='write'?'lectura y escritura':'solo lectura')+'.';
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
    connect.disabled=true;connect.textContent='Abriendo Shopify…';msg.innerHTML='<b>Sigue los pasos dentro de Shopify.</b> VentaNexIA detectará la conexión cuando termines.';
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
            stopPoll();connect.disabled=false;connect.textContent='Autorizar con Shopify';msg.innerHTML='<b>No se pudo terminar la conexión.</b> '+esc(st?.error||'Vuelve a intentarlo.');
          }
        }catch(err){}
      },2000);
    }catch(e){
      connect.disabled=false;connect.textContent='Autorizar con Shopify';
      const msgText=e?.data?.code==='CONNECTOR_NOT_CONFIGURED'?'La conexión con Shopify todavía no está preparada del todo. Tenemos que terminar de activarla en VentaNexIA.':(e.message||String(e));
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

function enforcePurchasedFeatures(){
  const l=state.license||{},policy=l.featurePolicy||{};
  if(String(l.plan||'').toLowerCase()==='master')return;
  const purchased=[...(policy.purchased_included||[]),...(policy.purchased_extras||[])];
  if(!purchased.length)return;
  const map={email:'email',whatsapp:'whatsapp',social:'redes',prospecting:'buscador'};
  $('[data-real-module]').forEach(btn=>{
    const key=map[btn.dataset.realModule];if(!key)return;
    if(!purchased.includes(key)){
      btn.dataset.lockedFeature='1';
      btn.textContent='Ver planes para activar';
      btn.onclick=()=>window.vnx.openExternal('https://www.ventanexia.es/planes.html');
    }
  });
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
    if(current?.status==='authorization_required'){
      const all=getRealModuleSources();delete all[key];localStorage.setItem('vnx_real_module_sources',JSON.stringify(all));
    }
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
  enforcePurchasedFeatures();
  checkForUpdates(sys.version);
}

$('#chooseFolder').onclick=async()=>{await window.vnx.chooseFolder();await refresh()};

$('#activateLicenseBtn').onclick=async()=>{
  const customerId=$('#customerIdInput').value.trim();
  const activationCode=$('#activationCodeInput').value.trim();
  const msg=$('#licenseMsg'),btn=$('#activateLicenseBtn');
  if(!customerId||!activationCode){msg.textContent='Escribe tu ID de cliente y tu contraseña.';return;}
  btn.disabled=true;btn.textContent='Entrando…';msg.textContent='Comprobando licencia y plazas disponibles…';
  try{
    const license=await window.vnx.activateLicense({customerId,activationCode});
    state.license=license;$('#activationCodeInput').value='';renderState();
    msg.textContent=`Dispositivo activado correctamente. ${license.activeCount} de ${license.limit} plazas utilizadas.`;
  }catch(e){
    const d=e?.data||{};
    msg.textContent=d.code==='DEVICE_LIMIT_REACHED'?`${d.message} Dispositivo adicional: ${d.extraDeviceMonthlyEur||49} €/mes.`:(e.message||'No se pudo activar el dispositivo');
  }finally{btn.disabled=false;btn.textContent='Entrar en este ordenador'}
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
  $('#discoveryStatus').textContent=`Búsqueda terminada. He revisado ${data.visited||0} carpetas y he encontrado ${results.length} posibles ubicaciones. Tú decides cuál autorizar.`;
  $('#discoveryList').innerHTML=results.length?results.map((r,i)=>`<div class="listrow discovery-row"><div><b>${esc(r.level)} · ${esc(r.path)}</b><span>${esc((r.reasons||[]).join(' · ')||`${r.businessFiles||0} archivos de datos compatibles`)}</span></div><button class="mini discovery-auth" data-index="${i}">Autorizar</button></div>`).join(''):'<div class="empty">No he encontrado una carpeta clara. Prueba “Elegir dónde buscar” y selecciona la carpeta del programa o una unidad concreta.</div>';
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
  status.textContent='Buscando tus datos… Puede tardar unos segundos.';
  $('#discoveryList').innerHTML='';
  try{
    const data=mode==='common'?await window.vnx.scanCommonData():await window.vnx.chooseAndScanData();
    if(!data){status.textContent='Búsqueda cancelada.';return;}
    renderDiscovery(data);
  }catch(e){status.textContent=`No pude terminar la búsqueda: ${e.message}`}
}
$('#scanCommon').onclick=()=>runDiscovery('common');
$('#scanChoose').onclick=()=>runDiscovery('choose');

const extraEmailBtn=$('#buyExtraEmail');if(extraEmailBtn)extraEmailBtn.onclick=async()=>{await window.vnx.openExternal('https://www.ventanexia.es/planes.html?addon=email_account');};

const autoSupportBtn=$('#autoSupportBtn'),healthCheckBtn=$('#healthCheckBtn'),autoRepairBtn=$('#autoRepairBtn'),autoSupportMsg=$('#autoSupportMsg');
async function refreshAutoSupport(){
  if(!autoSupportBtn)return;
  try{
    const st=await window.vnx.getAutoSupport();
    autoSupportBtn.textContent=st.enabled?'Desactivar asistencia automática':'Activar asistencia automática';
    autoSupportBtn.dataset.enabled=st.enabled?'1':'0';
  }catch{}
}
if(autoSupportBtn)autoSupportBtn.onclick=async()=>{
  const enabled=autoSupportBtn.dataset.enabled!=='1';
  const r=await window.vnx.setAutoSupport(enabled);
  autoSupportBtn.textContent=r.enabled?'Desactivar asistencia automática':'Activar asistencia automática';
  autoSupportBtn.dataset.enabled=r.enabled?'1':'0';
  autoSupportMsg.textContent=r.enabled?'Asistencia automática activada. VentaNexIA se iniciará con Windows y podrá revisar su propio funcionamiento.':'Asistencia automática desactivada.';
};
if(healthCheckBtn)healthCheckBtn.onclick=async()=>{
  healthCheckBtn.disabled=true;healthCheckBtn.textContent='Revisando…';
  try{
    const r=await window.vnx.supportHealth();
    autoSupportMsg.innerHTML=(r.checks||[]).map(x=>(x.ok?'✓ ':'⚠ ')+esc(x.name)).join('<br>');
  }catch(e){autoSupportMsg.textContent='No he podido hacer la revisión: '+(e.message||e)}
  finally{healthCheckBtn.disabled=false;healthCheckBtn.textContent='Revisar ahora'}
};
if(autoRepairBtn)autoRepairBtn.onclick=async()=>{
  autoRepairBtn.disabled=true;autoRepairBtn.textContent='Reparando…';
  try{
    const r=await window.vnx.supportAutoRepair();
    autoSupportMsg.innerHTML='<b>Revisión terminada.</b><br>'+esc((r.actions||[]).join(' '));
  }catch(e){autoSupportMsg.textContent='No he podido reparar: '+(e.message||e)}
  finally{autoRepairBtn.disabled=false;autoRepairBtn.textContent='Intentar reparar'}
};
refreshAutoSupport();

$('#supportBtn').onclick=async()=>{if(!confirm('Se abrirá Asistencia rápida de Windows. Ninguna persona podrá controlar tu equipo hasta que tú aceptes la sesión dentro de Windows. ¿Continuar?'))return;await window.vnx.openQuickAssist();$('#supportMsg').textContent='Se ha abierto la ayuda de Windows. Acepta solo si reconoces al técnico.';await refresh()};
$('#supportStop').onclick=async()=>{await window.vnx.stopSupport();$('#supportMsg').textContent='La ayuda ha terminado. Si la ventana de Windows sigue abierta, ciérrala también.';await refresh()};
$('#refreshActivity').onclick=refresh;

function renderMessages(){const root=$('#messages');root.innerHTML='<div class="msg ai">Soy el asistente de VentaNexIA. Puedo consultar la información que hayas autorizado y darte respuestas concretas basadas en tus datos.</div>'+messages.map(m=>`<div class="msg ${m.role==='user'?'user':'ai'}">${esc(m.content)}</div>`).join('');root.scrollTop=root.scrollHeight}
$('#chatForm').onsubmit=async e=>{e.preventDefault();const input=$('#chatInput'),text=input.value.trim();if(!text)return;messages.push({role:'user',content:text});input.value='';renderMessages();const btn=e.submitter;btn.disabled=true;btn.textContent='Pensando…';try{const r=await window.vnx.sendChat(messages);messages.push({role:'assistant',content:r.reply||'Sin respuesta'});renderMessages();await refresh()}catch(err){messages.push({role:'assistant',content:`No he podido conectar: ${err.message}`});renderMessages()}finally{btn.disabled=false;btn.textContent='Enviar'}};

init();
