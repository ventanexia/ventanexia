const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let state={permissions:{folders:[]},activity:[],paired:false,license:{}};
let messages=[];
let browsingFolder=null;
setTimeout(()=>{const splash=document.querySelector('#futureSplash');if(splash)splash.classList.add('hide')},2300);

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function cleanIpcError(e){return String(e?.message||e||'').replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/i,'').trim()}
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
function ensureEditableControls(root=document){
  const scope=root||document;
  scope.querySelectorAll('input,textarea,select').forEach(el=>{
    if(el.dataset?.vnxLocked==='1')return;
    if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement){
      el.readOnly=false;
      el.style.userSelect='text';
      el.style.webkitUserSelect='text';
    }
    el.disabled=false;
    el.style.pointerEvents='auto';
    el.style.webkitAppRegion='no-drag';
  });
}
document.addEventListener('pointerdown',e=>{
  const el=e.target?.closest?.('input,textarea');
  if(!el||el.disabled||el.readOnly)return;
  setTimeout(()=>{try{el.focus({preventScroll:true})}catch{el.focus()}},0);
},true);

function openTab(name){
  $$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
  $$('.tab').forEach(x=>x.classList.toggle('active',x.id===name));
  const active=document.getElementById(name);
  ensureEditableControls(active||document);
  if(name==='chat'){
    const input=$('#chatInput');
    if(input)setTimeout(()=>input.focus(),40);
  }
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
  const isMasterPlan=Boolean(l.master||l.unlimited)||String(l.edition||'').toLowerCase()==='master'||String(l.plan||'').toLowerCase()==='master';
  const emailPolicy=$('#emailAccountPolicyText'),extraEmail=$('#buyExtraEmail');
  if(emailPolicy)emailPolicy.textContent=isMasterPlan?'Versión Maestro: conecta todas las cuentas de email que necesites, sin límite de cuentas de VentaNexIA.': 'Lee y organiza correos, prepara respuestas y hace seguimiento de conversaciones. La primera cuenta está incluida con el agente Email.';
  if(extraEmail)extraEmail.textContent=isMasterPlan?'+ Añadir otra cuenta · Maestro ilimitado':'+ Añadir otra cuenta · 39 €/mes';
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
async function refresh(){state=await window.vnx.getState();renderState();if(typeof renderConnectionSummaries==='function')await renderConnectionSummaries()}
setTimeout(()=>ensureEditableControls(document),500);

function getPortals(){
  try{return JSON.parse(localStorage.getItem('vnx_portals')||'[]')}catch{return []}
}
function setPortals(items){localStorage.setItem('vnx_portals',JSON.stringify(items||[]))}
function renderPortals(){
  const root=$('#portalList');if(!root)return;
  const items=getPortals();
  root.innerHTML=items.length?items.map((p,i)=>`<div class="listrow"><div><b>${esc(p.name)}</b><span>${esc(p.url)} · ${p.mode==='read'?'Solo lectura':'Lectura y escritura'}</span></div><div class="row"><button class="mini portal-open" data-i="${i}">Abrir</button><button class="mini portal-remove" data-i="${i}">Quitar</button></div></div>`).join(''):'<div class="empty">Todavía no hay páginas privadas configurados.</div>';
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

async function refreshChatConnections(){
  if(typeof window.vnxRefreshAgentUi==='function')return window.vnxRefreshAgentUi();
  return null;
}
function setupServiceConnectionWizard(){
  const modal=$('#serviceConnectionModal'),title=$('#serviceConnectionTitle'),text=$('#serviceConnectionText'),provider=$('#serviceProvider'),account=$('#serviceAccount'),notice=$('#serviceConnectionNotice'),prepare=$('#servicePrepareBtn'),disconnect=$('#serviceDisconnectBtn'),cancel=$('#serviceCancelBtn');
  if(!modal)return ()=>{};
  const providers={
    email:[['gmail','Gmail / Google Workspace'],['microsoft_365','Outlook / Hotmail / Live / Microsoft'],['yahoo_mail','Yahoo Mail'],['icloud_mail','iCloud Mail'],['generic_imap','Correo de empresa / otro proveedor']],
    whatsapp:[['whatsapp_personal','WhatsApp normal'],['whatsapp_business','WhatsApp para empresa']],
    social:[['instagram','Instagram'],['facebook','Facebook'],['linkedin','LinkedIn'],['x_twitter','X / Twitter']],
    crm:[['hubspot','HubSpot']]
  };
  const labels={email:'Email',whatsapp:'WhatsApp',social:'Redes sociales',crm:'Ventas y clientes'};
  let activeKey=null,activeButton=null,oauthState=null,pollTimer=null,currentAddAnother=false;
  const genericBox=$('#genericEmailFields'),genericUser=$('#genericEmailUser'),genericPass=$('#genericEmailPassword'),imapHost=$('#genericImapHost'),imapPort=$('#genericImapPort'),smtpHost=$('#genericSmtpHost'),smtpPort=$('#genericSmtpPort');
  function updateEmailProviderFields(){
    const p=provider.value;
    const manual=activeKey==='email'&&['yahoo_mail','icloud_mail','generic_imap'].includes(p);
    if(genericBox)genericBox.style.display=manual?'block':'none';
    if(!manual)return;
    const email=(account?.value||'').trim();
    if(genericUser&&!genericUser.value)genericUser.value=email;
    if(p==='yahoo_mail'){imapHost.value='imap.mail.yahoo.com';imapPort.value='993';smtpHost.value='smtp.mail.yahoo.com';smtpPort.value='465';}
    else if(p==='icloud_mail'){imapHost.value='imap.mail.me.com';imapPort.value='993';smtpHost.value='smtp.mail.me.com';smtpPort.value='587';}
  }
  if(provider)provider.onchange=()=>{updateEmailProviderFields();if(activeKey==='whatsapp'){prepare.textContent=provider.value==='whatsapp_personal'?'Guardar':'Conectar ahora';notice.innerHTML=provider.value==='whatsapp_personal'?'<b>WhatsApp normal.</b> VentaNexIA preparará respuestas, pero tú las enviarás desde WhatsApp.':'<b>WhatsApp para empresa.</b> Puedes conectarlo para recibir mensajes y elegir respuestas con autorización o automáticas.';}};
  if(account)account.addEventListener('input',()=>{if(genericUser&&genericBox?.style.display!=='none'&&!genericUser.value)genericUser.value=account.value.trim()});
  function stopPoll(){if(pollTimer){clearInterval(pollTimer);pollTimer=null}}
  cancel.onclick=()=>{stopPoll();modal.style.display='none';activeKey=null;activeButton=null;oauthState=null;currentAddAnother=false;renderConnectionSummaries()};
  prepare.onclick=async()=>{
    if(!activeKey)return;
    prepare.disabled=true;prepare.textContent='Abriendo la página para conectar…';
    notice.innerHTML='<b>Sigue los pasos que verás en el navegador.</b> Cuando termines, VentaNexIA lo sabrá automáticamente.';
    try{
      if(activeKey==='email'&&['yahoo_mail','icloud_mail','generic_imap'].includes(provider.value)){
        const result=await window.vnx.connectGenericEmail({
          provider:provider.value,
          email:account?.value?.trim()||'',
          username:genericUser?.value?.trim()||account?.value?.trim()||'',
          password:genericPass?.value||'',
          imapHost:imapHost?.value?.trim()||'',
          imapPort:Number(imapPort?.value||993),
          smtpHost:smtpHost?.value?.trim()||'',
          smtpPort:Number(smtpPort?.value||465)
        });
        const all=getRealModuleSources();
        all.email={provider:provider.value,label:result.label||account.value.trim(),account:account.value.trim(),mode:'write',status:'connected',connectedAt:new Date().toISOString()};
        localStorage.setItem('vnx_real_module_sources',JSON.stringify(all));
        if(activeButton)activeButton.textContent='🟢 Email · '+(result.label||account.value.trim());
        notice.innerHTML='<b>🟢 Correo conectado correctamente.</b> Entrada y salida han sido comprobadas.';
        await refreshChatConnections();await renderConnectionSummaries();
        prepare.disabled=false;prepare.textContent='Conectar ahora';
        return;
      }
      const requestedAccount=account?.value?.trim()||'';
      if(activeKey==='whatsapp'&&provider.value==='whatsapp_personal'){
        const all=getRealModuleSources();
        all.whatsapp={provider:'whatsapp_personal',label:'WhatsApp normal',account:requestedAccount,mode:'manual',status:'manual_ready',connectedAt:new Date().toISOString()};
        localStorage.setItem('vnx_real_module_sources',JSON.stringify(all));
        if(activeButton)activeButton.textContent='🟢 WhatsApp normal · modo manual';
        notice.innerHTML='<b>🟢 Listo para usar.</b> VentaNexIA preparará las respuestas y tú decidirás cuándo enviarlas desde WhatsApp. No se leerán mensajes automáticamente.';
        prepare.disabled=false;prepare.textContent='Guardar';
        await refreshChatConnections();await renderConnectionSummaries();
        return;
      }
      if(activeKey==='email'&&currentAddAnother&&!requestedAccount){prepare.disabled=false;prepare.textContent='Conectar ahora';notice.innerHTML='<b>Escribe la nueva cuenta de email que quieres añadir.</b>';return;}
      const started=await window.vnx.startOAuth({module:activeKey,provider:provider.value,account:requestedAccount});
      oauthState=started.state;
      if(started.authUrl){
        notice.innerHTML='<b>Se ha abierto tu navegador para autorizar la cuenta.</b> Si no lo ves, <button class="mini" id="oauthOpenFallback" type="button">Abrir autorización</button>';
        const fallback=notice.querySelector('#oauthOpenFallback');if(fallback)fallback.onclick=()=>window.vnx.openExternal(started.authUrl);
      }
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
            await refreshChatConnections();
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
      const detail=String(e?.data?.detail||'').trim();
      const missing=/conector todavía no configurado|connector_not_configured/i.test(raw);
      const msg=missing?'Esta conexión todavía necesita una activación única por parte de VentaNexIA. Tu cuenta está bien; falta activar el acceso oficial con este proveedor.':(detail||raw.replace(/^Error invoking remote method[^:]*:\s*/i,''));
      notice.innerHTML='<b>No se pudo conectar todavía.</b> '+esc(msg);
    }
  };
  disconnect.onclick=async()=>{
    if(!activeKey)return;
    if(!confirm('¿Desconectar '+labels[activeKey]+' de VentaNexIA en este ordenador?'))return;
    stopPoll();if(!(activeKey==='whatsapp'&&getRealModuleSources()?.whatsapp?.provider==='whatsapp_personal'))await window.vnx.disconnectIntegration(activeKey);
    const all=getRealModuleSources();delete all[activeKey];localStorage.setItem('vnx_real_module_sources',JSON.stringify(all));
    if(activeButton)activeButton.textContent=activeKey==='email'?'Conectar correo':activeKey==='whatsapp'?'Gestionar WhatsApp':activeKey==='social'?'Conectar redes sociales':'Conectar ventas y clientes';
    if(account&&activeKey==='email')account.value='';
    notice.innerHTML='<b>Desconectado.</b> El cambio se ha aplicado en todo VentaNexIA.';
    await refreshChatConnections();
  };
  return async(key,button,options={})=>{
    activeKey=key;activeButton=button;oauthState=null;stopPoll();
    currentAddAnother=Boolean(options?.addAnother&&key==='email');
    const addAnother=currentAddAnother;
    title.textContent='Autorizar '+labels[key];
    text.textContent='Elige la cuenta que quieres conectar. Se abrirá su página oficial para que inicies sesión y aceptes el acceso.';
    provider.innerHTML=(providers[key]||[]).map(([v,n])=>'<option value="'+esc(v)+'">'+esc(n)+'</option>').join('');
    if(genericBox)genericBox.style.display='none';
    if(genericPass)genericPass.value='';
    if(account){
      const saved=getRealModuleSources()[key];
      account.value=addAnother?'':(saved?.account||'');
      account.placeholder=key==='email'?'Ej.: ventas@empresa.com':key==='social'?'Ej.: mobiliario.sanitario':'Ej.: nombre de la cuenta';
      if(addAnother)setTimeout(()=>account.focus(),50);
    }
    const masterUnlimited=key==='email'&&(Boolean(state.license?.master||state.license?.unlimited)||String(state.license?.edition||'').toLowerCase()==='master'||String(state.license?.plan||'').toLowerCase()==='master');
    notice.innerHTML=key==='email'
      ?(masterUnlimited
        ?'<b>♛ Maestro: cuentas de email ilimitadas.</b> Puedes añadir tantas cuentas como necesites. Una nueva conexión no sustituye las anteriores.'
        :'<b>Elige tu proveedor.</b> Gmail y Outlook/Hotmail usan autorización oficial. Para Yahoo, iCloud o un correo corporativo puedes usar la conexión segura IMAP/SMTP.')
      :key==='whatsapp'
        ?'<b>Elige qué WhatsApp utilizas.</b><br><small><b>WhatsApp normal:</b> VentaNexIA prepara la respuesta y tú la envías.<br><b>WhatsApp para empresa:</b> permite conexión y automatización cuando esté configurado.</small>'
        :'<b>No necesitas copiar códigos raros ni contraseñas.</b> Escribe la cuenta que quieres conectar y pulsa “Conectar ahora”.';
    if(key==='whatsapp')prepare.textContent=provider.value==='whatsapp_personal'?'Guardar':'Conectar ahora';
    updateEmailProviderFields();
    try{
      const st=await window.vnx.integrationStatus(key);
      if(st?.connected){
        const accounts=Array.isArray(st.accounts)?st.accounts:[];
        if(addAnother&&key==='email'){
          notice.innerHTML='<b>♛ Añadir otra cuenta.</b> Escribe arriba el nuevo email. Ya tienes '+accounts.length+' cuenta'+(accounts.length===1?'':'s')+' conectada'+(accounts.length===1?'':'s')+':<br><small>'+accounts.map(x=>esc(x.label)).join(' · ')+'</small>';
        }else{
          notice.innerHTML='<b>🟢 Ya está conectado:</b> '+esc(st.label||labels[key])+' · '+(st.mode==='write'?'lectura y escritura':'solo lectura')+'.'+(key==='email'&&accounts.length>1?'<br><small>'+accounts.map(x=>esc(x.label)).join(' · ')+'</small>':'');
        }
      }
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
      const masterOwned=Boolean(state.license?.master||state.license?.unlimited)||String(state.license?.edition||'').toLowerCase()==='master'||String(state.license?.plan||'').toLowerCase()==='master';
      if(masterOwned){
        msg.innerHTML='<b>Conectando directamente con Shopify…</b> Esta prueba usa la app de tu organización.';
        const st=await window.vnx.connectOwnedShopify({shop:s});
        setRealModuleSource('shopify',{integration:'shopify',status:'connected',shop:st.shop,shopName:st.shopName||st.shop,mode:'write',connectedAt:new Date().toISOString()});
        msg.innerHTML='<b>🟢 Shopify conectado.</b> '+esc(st.shopName||st.shop);
        if(activeButton)activeButton.textContent='🟢 Shopify · '+esc(st.shopName||st.shop);
        connect.disabled=false;connect.textContent='Autorizar con Shopify';
        await refreshChatConnections();
        return;
      }
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

async function enforcePurchasedFeatures(){
  let agents=[];
  try{agents=await window.vnx.agentCatalog()||[]}catch{agents=[]}
  const byKey=new Map(agents.map(a=>[a.key,a]));
  const map={email:'email',whatsapp:'whatsapp',social:'social',prospecting:'prospecting',crm:'crm',shopify:'web_tienda online',wordpress:'web_tienda online',github_vercel:'web_tienda online'};
  $$('[data-real-module]').forEach(btn=>{
    const agentKey=map[btn.dataset.realModule];if(!agentKey)return;
    const agent=byKey.get(agentKey);
    if(agent&&agent.included===false){
      btn.dataset.lockedFeature='1';
      btn.textContent='🔒 No incluido en tu plan';
      btn.onclick=()=>window.vnx.openExternal('https://www.ventanexia.es/planes.html');
    }else{
      delete btn.dataset.lockedFeature;
    }
  });
}
function connectionProviderLabel(provider=''){
  return {
    gmail:'Gmail / Google Workspace',
    microsoft_365:'Outlook / Microsoft 365',
    yahoo_mail:'Yahoo Mail',
    icloud_mail:'iCloud Mail',
    generic_imap:'Correo de empresa',
    whatsapp_business:'WhatsApp Business',
    instagram:'Instagram',
    facebook:'Facebook',
    linkedin:'LinkedIn',
    x_twitter:'X / Twitter',
    hubspot:'HubSpot · ventas y clientes'
  }[provider]||String(provider||'').replace(/_/g,' ');
}
function connectionSummaryHtml(items=[],emptyText='No hay ninguna cuenta conectada.'){
  if(!items.length)return '<div class="connection-empty"><i></i><span>'+esc(emptyText)+'</span></div>';
  return '<div class="connection-count">🟢 '+items.length+' '+(items.length===1?'conexión activa':'conexiones activas')+'</div>'
    +'<div class="connection-account-list">'
    +items.map(x=>'<div class="connection-account-row"><span class="connection-dot"></span><div><b>'+esc(x.label||'Conectado')+'</b><small>'+esc(connectionProviderLabel(x.provider||x.module))+'</small></div></div>').join('')
    +'</div>';
}
async function renderConnectionSummaries(){
  let connections=[];try{connections=await window.vnx.listConnections()||[]}catch{}
  const byModule=module=>connections.filter(x=>(x.module||'')===module);
  const email=byModule('email'),wa=byModule('whatsapp'),social=byModule('social'),crm=byModule('crm');
  const set=(key,html)=>{const el=$('[data-connection-summary="'+key+'"]');if(el)el.innerHTML=html};

  set('email',connectionSummaryHtml(email,'No hay ninguna cuenta de correo conectada.'));
  set('social',connectionSummaryHtml(social,'No hay ninguna red social conectada.'));
  set('crm',connectionSummaryHtml(crm,'No hay ningún sistema de ventas y clientes conectado.'));

  const savedWhatsApp=getRealModuleSources()?.whatsapp;
  if(savedWhatsApp?.provider==='whatsapp_personal'&&savedWhatsApp?.status==='manual_ready'){
    const label=savedWhatsApp.account?('WhatsApp normal · '+savedWhatsApp.account):'WhatsApp normal';
    set('whatsapp','<div class="connection-count">🟢 Listo en modo manual</div><div class="connection-account-list"><div class="connection-account-row"><span class="connection-dot"></span><div><b>'+esc(label)+'</b><small>VentaNexIA prepara la respuesta · tú decides cuándo enviarla</small></div></div></div>');
  }else if(wa.length){
    let extra='';
    try{
      const st=await window.vnx.whatsappRuntime({action:'status'});
      const ch=st?.channel||{};
      extra='<div class="connection-detail-grid">'
        +(ch.displayPhone?'<span><b>Número</b>'+esc(ch.displayPhone)+'</span>':'')
        +(ch.verifiedName?'<span><b>Empresa</b>'+esc(ch.verifiedName)+'</span>':'')
        +'<span><b>Modo</b>'+(ch.replyMode==='automatic'?'Automático':'Con autorización')+'</span>'
        +'<span><b>Conexión automática</b>'+(ch.webhookReady?'Activo':'Pendiente')+'</span>'
        +'</div>';
    }catch{}
    set('whatsapp',connectionSummaryHtml(wa,'No hay WhatsApp conectado.')+extra);
  }else set('whatsapp',connectionSummaryHtml([],'No hay ningún WhatsApp Business conectado.'));

  const folders=state?.permissions?.folders||[];
  set('local',folders.length
    ?'<div class="connection-count">🟢 '+folders.length+' '+(folders.length===1?'carpeta autorizada':'carpetas autorizadas')+'</div><div class="connection-account-list">'+folders.map(f=>'<div class="connection-account-row"><span class="connection-dot"></span><div><b>'+esc(String(f).split(/[\\/]/).pop()||f)+'</b><small>'+esc(f)+'</small></div></div>').join('')+'</div>'
    :'<div class="connection-empty"><i></i><span>No hay carpetas autorizadas.</span></div>');

  let portals=[];try{portals=await window.vnx.listPortals()||[]}catch{}
  set('portal',portals.length
    ?'<div class="connection-count">🟢 '+portals.length+' '+(portals.length===1?'portal conectado':'páginas privadas conectados')+'</div><div class="connection-account-list">'+portals.map(p=>'<div class="connection-account-row"><span class="connection-dot"></span><div><b>'+esc(p.name||'Portal')+'</b><small>'+esc(p.url||'')+' · '+(p.lastStatus==='connected'?'Conectado':'Revisar conexión')+'</small></div></div>').join('')+'</div>'
    :'<div class="connection-empty"><i></i><span>No hay páginas privadas conectados.</span></div>');

  try{
    const shop=await window.vnx.shopifyStatus();
    const target=$('[data-connection-summary="shopify"]');
    if(target){
      target.innerHTML=shop?.status==='connected'
        ?'<div class="connection-count">🟢 Shopify conectado</div><div class="connection-account-list"><div class="connection-account-row"><span class="connection-dot"></span><div><b>'+esc(shop.shopName||shop.label||shop.shop||'Tienda Shopify')+'</b><small>'+esc(shop.shop||'')+'</small></div></div></div>'
        :'<div class="connection-empty"><i></i><span>Shopify no está conectado.</span></div>';
    }
  }catch{}
}
window.vnxRefreshConnectionSummaries=renderConnectionSummaries;

function setupRealModuleMode(){
  const labels={email:'Email',whatsapp:'WhatsApp Business',social:'Redes sociales',prospecting:'Buscar clientes',crm:'Ventas y clientes',shopify:'Tienda Shopify',wordpress:'Tienda WordPress',github_vercel:'Web personalizada'};
  const saved=getRealModuleSources();
  const openServiceWizard=setupServiceConnectionWizard();
  window.vnxOpenServiceWizard=openServiceWizard;
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

async function refreshProvisioningTasks(){
  const root=$('#provisioningTaskList');if(!root)return;
  root.innerHTML='<div class="empty">Comprobando activaciones pendientes…</div>';
  try{
    const r=await window.vnx.provisioningList(),tasks=r?.tasks||[];
    if(!tasks.length){root.innerHTML='<div class="empty">No hay activaciones pendientes.</div>';return}
    root.innerHTML=tasks.map(t=>{
      const due=t.due_at?new Date(t.due_at):null;
      const overdue=due&&due.getTime()<Date.now();
      return '<div class="listrow"><div><b>'+esc(t.title)+'</b><span>'+esc(t.tenant?.name||t.tenant?.customer_code||'Cliente')+' · '+esc(t.provider||'Proveedor')+' · '+(t.status==='in_progress'?'En gestión':'Pendiente')+(overdue?' · ⚠ vencida':'')+'</span><small>'+esc(t.instructions||'Comprobar y activar antes de marcar como lista.')+'</small></div><div class="row"><button class="mini provision-start" data-id="'+esc(t.id)+'">Estoy con ello</button><button class="mini provision-complete" data-id="'+esc(t.id)+'">✓ Ya está activo</button></div></div>';
    }).join('');
    $$('.provision-start').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await window.vnx.provisioningStart(b.dataset.id);await refreshProvisioningTasks()}catch(e){alert(e.message||'No se pudo actualizar')}});
    $$('.provision-complete').forEach(b=>b.onclick=async()=>{if(!confirm('Confirma solo si la ampliación está realmente disponible para el cliente.'))return;b.disabled=true;try{await window.vnx.provisioningComplete(b.dataset.id);await refreshProvisioningTasks();alert('Activación completada. El cliente recibirá confirmación por email.')}catch(e){alert(e.message||'No se pudo completar')}});
  }catch(e){root.innerHTML='<div class="empty">No se pudo cargar la cola de activaciones.</div>'}
}
const refreshProvisioningBtn=$('#refreshProvisioningBtn');if(refreshProvisioningBtn)refreshProvisioningBtn.onclick=refreshProvisioningTasks;

function reportUiProblem(area,error){
  const raw=String(error?.message||error||'Error desconocido');
  console.error('VentaNexIA UI · '+area,raw);
  const status=$('#encState');
  if(status&&status.textContent==='Comprobando…')status.textContent='Revisar interfaz';
}
async function safeUi(area,fn){
  try{return await fn()}catch(e){reportUiProblem(area,e);return null}
}
async function init(){
  bindTabs();
  await safeUi('páginas privadas',async()=>setupPortalUi());
  await safeUi('conexiones',async()=>setupRealModuleMode());
  const sys=await safeUi('estado del sistema',()=>window.vnx.systemStatus());
  if(sys){
    $('#encState').textContent=sys.encrypted?'Cifrado':'Protección limitada';
    $('#appVersion').textContent=sys.version;
  }
  await safeUi('estado local',()=>refresh());
  await safeUi('fuentes del chat',()=>refreshChatConnections());
  await safeUi('resumen de conexiones',()=>renderConnectionSummaries());
  await safeUi('permisos del plan',async()=>enforcePurchasedFeatures());
  if(sys) safeUi('actualizaciones',()=>checkForUpdates(sys.version));
  if((Boolean(state.license?.master||state.license?.unlimited)||String(state.license?.edition||'').toLowerCase()==='master'||String(state.license?.plan||'').toLowerCase()==='master'))safeUi('activaciones pendientes',()=>refreshProvisioningTasks());
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

async function refreshUsageOverview(){
  const root=$('#usageCards');if(!root)return;
  const labels={
    video_credits:['🎬','Vídeo','créditos'],
    image_credits:['🖼️','Imágenes','créditos'],
    voice_minutes:['☎️','Voz','minutos'],
    whatsapp_messages:['💬','WhatsApp','mensajes'],
    lead_credits:['🎯','Buscar clientes','créditos'],
    ai_heavy_tasks:['🧠','Tareas intensivas de IA','tareas'],
    email_ai_actions:['📧','Email con IA','acciones'],
    automation_runs:['⚙️','Tareas automáticas','ejecuciones'],
    seo_pages:['🔎','visibilidad en Google','páginas'],
    report_generations:['📊','Informes','informes'],
    storage_mb:['💾','Almacenamiento','MB']
  };
  root.innerHTML='<article class="modulecard"><b>Comprobando tu plan…</b><span>Un momento.</span></article>';
  try{
    const r=await window.vnx.usageOverview(),items=r?.items||{};
    const cards=[];
    for(const [key,meta] of Object.entries(labels)){
      const q=items[key];
      if(!q?.ok)continue;
      let used=Number(q.usedThisMonth||0),limit=Number(q.monthlyLimit||0),remaining=Number(q.remaining||0),unit=meta[2];
      if(key==='storage_mb'){used=(used/1024).toFixed(1);limit=(limit/1024).toFixed(0);remaining=(remaining/1024).toFixed(1);unit='GB'}
      cards.push('<article class="modulecard"><b>'+meta[0]+' '+meta[1]+'</b><span><strong style="font-size:22px;color:#fff">'+remaining+'</strong> '+unit+' disponibles<br><small>'+used+' usados de '+limit+'</small></span></article>');
    }
    root.innerHTML=cards.length?cards.join(''):'<article class="modulecard"><b>Sin consumos que mostrar</b><span>Cuando actives funciones con uso medido aparecerán aquí.</span></article>';
  }catch{root.innerHTML='<article class="modulecard"><b>No se pudo comprobar ahora</b><span>VentaNexIA lo volverá a intentar más tarde.</span></article>'}
}
$$('[data-usage-pack]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;const old=btn.textContent;btn.textContent='Abriendo pago…';try{await window.vnx.buyUsagePack(btn.dataset.usagePack)}catch(e){alert(e.message||'No se pudo abrir el pago')}finally{btn.disabled=false;btn.textContent=old}});
refreshUsageOverview();

const openVideoBrief=$('#openVideoBrief'),videoBriefBox=$('#socialVideoBriefBox'),videoIdea=$('#socialVideoIdea'),videoExampleBtn=$('#videoExampleBtn'),videoTemplateBtn=$('#videoTemplateBtn'),videoPrepareBtn=$('#videoPrepareBtn'),videoBriefMsg=$('#videoBriefMsg');
if(openVideoBrief&&videoBriefBox)openVideoBrief.onclick=()=>{
  videoBriefBox.style.display=videoBriefBox.style.display==='none'?'block':'none';
  if(videoBriefBox.style.display==='block'&&videoIdea)setTimeout(()=>videoIdea.focus(),50);
};
if(videoExampleBtn&&videoIdea)videoExampleBtn.onclick=()=>{
  videoIdea.value='Quiero un vídeo vertical 9:16 de 15 segundos para Instagram Reels. Objetivo: presentar una camilla eléctrica profesional. Escena 1: clínica moderna, limpia y luminosa, plano general. Escena 2: una profesional sanitaria ajusta la altura de la camilla con el mando. Escena 3: primer plano de la estructura y tapizado. Estilo: realista, elegante, premium y profesional; movimientos de cámara suaves. Colores: blancos, grises y azul oscuro. Texto en pantalla: “Más comodidad para el profesional y el paciente”. Final: logo de la empresa y llamada a la acción “Descubre nuestra gama”. No quiero aspecto de vídeo de stock, textos pequeños ni elementos médicos alarmantes.';
  videoBriefMsg.textContent='Este es solo un ejemplo. Cámbialo para que describa exactamente tu producto, servicio y estilo.';
  videoIdea.focus();
};
if(videoTemplateBtn&&videoIdea)videoTemplateBtn.onclick=()=>{
  const current=videoIdea.value.trim();
  videoIdea.value=(current?current+'\n\n':'')+'OBJETIVO DEL VÍDEO:\n\nQUÉ PRODUCTO O SERVICIO DEBE APARECER:\n\nQUÉ QUIERO QUE OCURRA EN CADA ESCENA:\n1. \n2. \n3. \n\nESTILO VISUAL:\n\nCOLORES / AMBIENTE:\n\nTEXTO QUE DEBE APARECER EN PANTALLA:\n\nDURACIÓN: 15 / 30 / 60 segundos\nFORMATO: vertical 9:16 / cuadrado 1:1 / horizontal 16:9\n\nLLAMADA A LA ACCIÓN FINAL:\n\nQUÉ NO QUIERO QUE APAREZCA:';
  videoBriefMsg.textContent='Rellena lo que sepas. No hace falta que uses palabras técnicas.';
  videoIdea.focus();
};
if(videoPrepareBtn&&videoIdea)videoPrepareBtn.onclick=()=>{
  const idea=videoIdea.value.trim();
  if(!idea){videoBriefMsg.textContent='Escribe primero una idea, aunque sea corta. VentaNexIA te ayudará a completarla.';videoIdea.focus();return}
  openTab('chat');
  const input=$('#chatInput');
  if(input){
    input.value='Quiero preparar un vídeo para redes sociales, pero NO lo generes todavía y NO consumas créditos de vídeo. Ayúdame a convertir esta idea en un briefing muy claro y pregúntame solo lo imprescindible que falte. Después propón escenas, estilo, textos en pantalla, duración y formato para que yo lo apruebe antes de generar.\n\nMI IDEA:\n'+idea;
    input.focus();
  }
};

async function refreshVideoQuota(){
  const box=$('#videoQuotaText');if(!box)return;
  try{
    const q=await window.vnx.videoQuota();
    if(!q?.ok){box.textContent='Activa tu licencia para ver tus vídeos disponibles';return}
    if(q.unlimited||q.master){box.textContent='Edición Maestro · vídeos sin límite';box.title='La edición Maestro no consume créditos de vídeo.';return}
    box.textContent=q.remaining+' de '+q.monthlyLimit+' créditos disponibles · hoy '+q.dailyRemaining+' de '+q.dailyLimit+' vídeos';
    box.title='Este mes has usado '+q.usedThisMonth+' créditos.';
  }catch{box.textContent='No se pudo comprobar ahora'}
}
const buyVideoPack=$('#buyVideoPack');if(buyVideoPack)buyVideoPack.onclick=async()=>{buyVideoPack.disabled=true;const old=buyVideoPack.textContent;buyVideoPack.textContent='Abriendo pago…';try{await window.vnx.buyUsagePack('video_pack')}catch(e){alert(e.message||'No se pudo abrir el pago')}finally{buyVideoPack.disabled=false;buyVideoPack.textContent=old}};
refreshVideoQuota();

const buyStoragePack=$('#buyStoragePack');if(buyStoragePack)buyStoragePack.onclick=async()=>{await window.vnx.openExternal('https://www.ventanexia.es/planes.html?addon=storage_pack');};

const extraEmailBtn=$('#buyExtraEmail');if(extraEmailBtn)extraEmailBtn.onclick=async()=>{
  if((Boolean(state.license?.master||state.license?.unlimited)||String(state.license?.edition||'').toLowerCase()==='master'||String(state.license?.plan||'').toLowerCase()==='master')){
    const connectBtn=document.querySelector('[data-real-module="email"]');
    if(typeof window.vnxOpenServiceWizard==='function'){await window.vnxOpenServiceWizard('email',connectBtn,{addAnother:true});return;}
    if(connectBtn)connectBtn.click();return;
  }
  await window.vnx.openExternal('https://www.ventanexia.es/planes.html?addon=email_account');
};

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

// El chat lo gestiona exclusivamente renderer/master.js para evitar que las conexiones sobrescriban el selector de agentes.

init();
