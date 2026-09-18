(()=>{
  const $m=s=>document.querySelector(s),$$m=s=>[...document.querySelectorAll(s)];
  const escM=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let masterPortals=[];
  let masterMessages=[];

  function statusLabel(p){
    if(p.lastStatus==='connected')return '🟢 Conectado';
    if(p.lastStatus==='login_required')return '🟠 La conexión se ha cerrado · vuelve a entrar';
    if(p.lastStatus==='error')return '🔴 No se pudo conectar';
    return '⚪ No conectado';
  }
  function isProductCountQuestion(text=''){
    const q=String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return /(?:cuantos?|numero|total).*productos|productos.*(?:tenemos|hay|total)/.test(q);
  }
  async function migrateLegacyPortals(){
    try{
      const legacy=JSON.parse(localStorage.getItem('vnx_portals')||'[]');
      for(const p of legacy||[]){if(p?.name&&p?.url)await window.vnx.savePortal({name:p.name,url:p.url,mode:p.mode||'read'});}
      if((legacy||[]).length)localStorage.removeItem('vnx_portals');
    }catch{}
  }
  async function renderMasterPortals(){
    const root=$m('#portalList');if(!root)return;
    try{masterPortals=await window.vnx.listPortals()}catch{masterPortals=[]}
    root.innerHTML=masterPortals.length?masterPortals.map(p=>`<div class="listrow"><div><b>${escM(p.name)}</b><span>${escM(p.url)} · ${p.mode==='read'?'🔒 Solo lectura':'Lectura y escritura'} · ${statusLabel(p)}</span>${p.lastCheckedAt?`<small>Última comprobación: ${new Date(p.lastCheckedAt).toLocaleString('es-ES')}</small>`:''}</div><div class="row"><button class="mini master-portal-connect" data-id="${escM(p.id)}">${p.lastStatus==='connected'?'Abrir':'Conectar'}</button><button class="mini master-portal-check" data-id="${escM(p.id)}">Revisar</button><button class="mini master-portal-remove" data-id="${escM(p.id)}">Quitar</button></div></div>`).join(''):'<div class="empty">Todavía no hay portales configurados.</div>';
    $$m('.master-portal-connect').forEach(b=>b.onclick=async()=>{
      b.disabled=true;b.textContent='Abriendo…';
      try{await window.vnx.connectPortal(b.dataset.id);$m('#portalMsg').textContent='Se ha abierto una ventana segura de VentaNexIA. Inicia sesión ahí una sola vez; la sesión quedará guardada localmente en este ordenador.';}
      catch(e){$m('#portalMsg').textContent=e.message||'No se pudo abrir el portal'}
      finally{b.disabled=false;setTimeout(renderMasterPortals,1200)}
    });
    $$m('.master-portal-check').forEach(b=>b.onclick=async()=>{
      b.disabled=true;b.textContent='Comprobando…';
      try{const r=await window.vnx.checkPortal(b.dataset.id);$m('#portalMsg').textContent=r.status==='connected'?'Ya está conectado. VentaNexIA puede consultar esta información desde “Habla con tu equipo”.':'La conexión se ha cerrado. Vuelve a entrar.';}
      catch(e){$m('#portalMsg').textContent=e.message||'No se pudo comprobar el portal'}
      finally{b.disabled=false;b.textContent='Revisar';await renderMasterPortals();refreshChatConnections()}
    });
    $$m('.master-portal-remove').forEach(b=>b.onclick=async()=>{
      if(!confirm('¿Quitar esta conexión y borrar su sesión guardada de este ordenador?'))return;
      await window.vnx.removePortal(b.dataset.id);await renderMasterPortals();refreshChatConnections();
    });
  }
  async function savePortalFromFields(connectAfter=false){
    const name=$m('#portalName')?.value.trim(),url=$m('#portalUrl')?.value.trim(),mode=$m('#portalMode')?.value||'read',msg=$m('#portalMsg');
    if(!name||!/^https:\/\//i.test(url||'')){if(msg)msg.textContent='Indica un nombre y una URL válida que empiece por https://';return;}
    try{
      const p=await window.vnx.savePortal({name,url,mode});
      if(msg)msg.textContent=mode==='read'?'Conexión guardada. VentaNexIA solo podrá mirar, no cambiar nada.':'Conexión guardada.';
      await renderMasterPortals();refreshChatConnections();
      if(connectAfter){await window.vnx.connectPortal(p.id);if(msg)msg.textContent='Se ha abierto la página. Inicia sesión y, cuando vuelvas, pulsa “Revisar”.';}
    }catch(e){if(msg)msg.textContent=e.message||'No se pudo guardar la conexión'}
  }
  function setupMasterPortalUi(){
    const toggle=$m('#showPortalSetup'),box=$m('#portalSetup');if(!toggle||!box)return;
    toggle.onclick=()=>{box.style.display=box.style.display==='none'?'block':'none';renderMasterPortals()};
    const save=$m('#savePortal'),open=$m('#openPortal');
    if(save)save.onclick=()=>savePortalFromFields(false);
    if(open){open.textContent='Conectar / iniciar sesión';open.onclick=()=>savePortalFromFields(true);}
  }

  function getRealSourcesForChat(){
    try{return JSON.parse(localStorage.getItem('vnx_real_module_sources')||'{}')}catch{return {}}
  }
  function connectedDataSources(){
    const out=[];
    for(const p of masterPortals||[]){if(['read','write'].includes(p.mode))out.push({type:'portal',id:p.id,name:p.name,url:p.url});}
    const labels={email:'Email',whatsapp:'WhatsApp Business',social:'Redes sociales',prospecting:'Captación',crm:'CRM',shopify:'Shopify',wordpress:'WordPress / WooCommerce',github_vercel:'GitHub / Vercel'};
    const real=getRealSourcesForChat();
    for(const [key,v] of Object.entries(real)){
      if(key==='shopify'&&v&&v.status==='connected')out.push({type:'shopify',key,name:'Shopify · '+(v.shopName||v.shop||'Tienda'),shop:v.shop||null});
      else if(['email','whatsapp','social','crm'].includes(key)&&v&&v.status==='connected')out.push({type:'integration',key,name:(labels[key]||key)+' · '+(v.label||v.account||'Conectado')});
      else if(v&&v.url)out.push({type:'url',key,name:labels[key]||key,url:v.url});
      else if(v&&v.folder)out.push({type:'folder',key,name:labels[key]||key,folder:v.folder});
    }
    const seen=new Set();
    return out.filter(x=>{const k=x.type==='portal'?'p:'+x.id:x.type==='url'?'u:'+x.url:x.type==='shopify'?'s:'+x.shop:x.type==='integration'?'i:'+x.key:'f:'+x.folder;if(seen.has(k))return false;seen.add(k);return true;});
  }
  function chatConnections(){
    const real=getRealSourcesForChat(),sources=connectedDataSources();
    const email=sources.find(x=>x.type==='integration'&&x.key==='email');
    const whatsapp=sources.find(x=>x.type==='integration'&&x.key==='whatsapp');
    const social=sources.find(x=>x.type==='integration'&&x.key==='social');
    const crm=sources.find(x=>x.type==='integration'&&x.key==='crm');
    const shop=sources.find(x=>x.type==='shopify')||sources.find(x=>x.type==='portal');
    return [
      {type:'agent',key:'core_ai',name:'🧠 Asistente IA',connected:true},
      {type:'agent',key:'email',name:'📧 Email'+(email?' · '+email.name.replace(/^Email · /,''):' · sin conectar'),connected:Boolean(email),source:email||null},
      {type:'agent',key:'whatsapp',name:'💬 WhatsApp Business'+(whatsapp?' · conectado':' · sin conectar'),connected:Boolean(whatsapp),source:whatsapp||null},
      {type:'agent',key:'social',name:'📣 Redes sociales'+(social?' · conectado':' · sin conectar'),connected:Boolean(social),source:social||null},
      {type:'agent',key:'prospecting',name:'🎯 Captación y búsqueda de clientes',connected:Boolean(real.prospecting),source:real.prospecting||null},
      {type:'agent',key:'crm',name:'👥 CRM y clientes'+(crm?' · conectado':' · sin conectar'),connected:Boolean(crm),source:crm||null},
      {type:'agent',key:'web_ecommerce',name:'🌐 Web & Ecommerce'+(shop?' · '+shop.name:' · sin conectar'),connected:Boolean(shop),source:shop||null},
      {type:'agent',key:'support',name:'🛟 Soporte y asistencia',connected:true}
    ];
  }
  function chatConnectionValue(x){return x.type==='agent'?'agent:'+x.key:''}
  function refreshChatConnections(){
    const sel=$m('#chatConnectionSelect'),hint=$m('#chatConnectionHint');if(!sel)return;
    const items=chatConnections(),previous=sel.value,saved=localStorage.getItem('vnx_master_chat_agent')||'';
    sel.innerHTML='<option value="">Elige un agente…</option>'+items.map(x=>'<option value="'+escM(chatConnectionValue(x))+'">'+escM(x.name)+'</option>').join('');
    const values=[...sel.options].map(o=>o.value);
    if(previous&&values.includes(previous))sel.value=previous;
    else if(saved&&values.includes(saved))sel.value=saved;
    else sel.value='agent:email';
    if(sel.value)localStorage.setItem('vnx_master_chat_agent',sel.value);
    sel.onchange=()=>{if(sel.value)localStorage.setItem('vnx_master_chat_agent',sel.value)};
    const chosen=items.find(x=>chatConnectionValue(x)===sel.value);
    if(chosen&&hint){
      hint.textContent=chosen.connected
        ?'Trabajando con: '+chosen.name
        :'Este agente necesita que conectes primero su cuenta o herramienta en “Conexiones”.';
    }else if(hint)hint.textContent='Elige el agente de VentaNexIA que quieres usar para esta consulta.';
    if($m('#masterSourceSelect'))renderMasterCenterSources();
  }
  function selectedChatScope(){
    const sel=$m('#chatConnectionSelect'),items=chatConnections();if(!sel||!sel.value)return null;
    const item=items.find(x=>chatConnectionValue(x)===sel.value);if(!item)return null;
    return {type:'agent',key:item.key,name:item.name,connected:item.connected,source:item.source||null};
  }

  function masterCenterItems(){
    return connectedDataSources();
  }
  function renderMasterCenterSources(){
    const sel=$m('#masterSourceSelect'),hint=$m('#masterSourceHint');if(!sel)return;
    const items=masterCenterItems(),previous=sel.value;
    sel.innerHTML='<option value="">Elige una cuenta o programa…</option>'+items.map((x,i)=>'<option value="'+i+'">'+escM(x.name)+'</option>').join('');
    if(previous!==''&&Number(previous)<items.length)sel.value=previous;
    if(hint){
      hint.textContent=items.length?'Elige una sola fuente. Así nunca mezclamos datos de empresas distintas.':'Todavía no hay ninguna cuenta o programa conectado.';
    }
  }
  function masterCenterScope(){
    const sel=$m('#masterSourceSelect'),items=masterCenterItems();if(!sel||sel.value==='')return null;
    const item=items[Number(sel.value)];if(!item)return null;
    if(item.type==='portal')return {type:'portal',id:item.id,name:item.name};
    if(item.type==='url')return {type:'url',key:item.key,name:item.name,url:item.url};
    if(item.type==='folder')return {type:'folder',key:item.key,name:item.name,folder:item.folder};
    if(item.type==='shopify')return {type:'shopify',key:item.key,name:item.name,shop:item.shop};
    if(item.type==='integration')return {type:'integration',key:item.key,name:item.name};
    return null;
  }
  function setupMasterCenter(){
    const root=$m('#masterDataResult'),title=$m('#masterResultTitle'),clear=$m('#masterResultClear');if(!root)return;
    const prompts={
      clientes:'Muéstrame los clientes que puedes ver en esta conexión. Incluye nombre, empresa, email y teléfono cuando estén disponibles. No inventes datos.',
      facturas:'Muéstrame las facturas que puedes ver en esta conexión. Incluye número, fecha, cliente, importe y estado cuando estén disponibles. No inventes datos.',
      pedidos:'Muéstrame los pedidos que puedes ver en esta conexión. Incluye número, fecha, cliente, importe y estado cuando estén disponibles. No inventes datos.',
      datos:'Resume y muestra la información empresarial disponible en esta conexión: clientes, pedidos, facturas, productos, ventas y otros datos que realmente puedas consultar. No inventes nada.'
    };
    const titles={clientes:'Clientes',facturas:'Facturas',pedidos:'Pedidos',datos:'Todos los datos'};
    $$m('[data-master-query]').forEach(btn=>btn.onclick=async()=>{
      const key=btn.dataset.masterQuery,scope=masterCenterScope();
      if(!scope){
        root.innerHTML='<div class="empty">Primero elige arriba la cuenta o programa que quieres consultar.</div>';return;
      }
      const old=btn.innerHTML;btn.disabled=true;btn.innerHTML='<b>Mirándolo…</b>';
      title.textContent=titles[key]+' · '+scope.name;
      root.innerHTML='<div class="empty">Consultando datos reales de '+escM(scope.name)+'…</div>';
      try{
        const r=await window.vnx.sendChat([{role:'user',content:prompts[key]}],scope);
        const reply=escM(r.reply||'No hay datos disponibles.').replace(/\n/g,'<br>');
        const imgs=(r.images||[]).slice(0,8).map(img=>'<img src="'+escM(img.src)+'" alt="'+escM(img.alt||'Imagen')+'" style="max-width:180px;max-height:140px;object-fit:contain;border-radius:9px;margin:8px 8px 0 0;border:1px solid #1b507a;background:#fff">').join('');
        root.innerHTML='<div class="msg ai" style="max-width:100%">'+reply+(imgs?'<div>'+imgs+'</div>':'')+'</div>';
      }catch(e){
        root.innerHTML='<div class="empty">No he podido mostrar estos datos: '+escM(e.message||String(e))+'</div>';
      }finally{btn.disabled=false;btn.innerHTML=old}
    });
    if(clear)clear.onclick=()=>{title.textContent='Información de tu empresa';root.innerHTML='<div class="empty">Elige una cuenta arriba y después pulsa Clientes, Facturas, Pedidos o Todos los datos.</div>'};
    renderMasterCenterSources();
  }

  function renderMasterMessages(){
    const root=$m('#messages');if(!root)return;
    const intro='<div class="msg ai">Estoy listo para ayudarte. Para usar datos reales, elige arriba la cuenta, tienda, portal o carpeta con la que quieres trabajar.</div>';
    root.innerHTML=intro+masterMessages.map(m=>{
      const imgs=(m.images||[]).slice(0,6).map(img=>`<a href="${escM(img.src)}" target="_blank" rel="noreferrer"><img src="${escM(img.src)}" alt="${escM(img.alt||'Imagen')}" style="max-width:220px;max-height:180px;object-fit:contain;border-radius:10px;margin:8px 8px 0 0;background:#fff;border:1px solid #d8e2ea"></a>`).join('');
      return `<div class="msg ${m.role==='user'?'user':'ai'}"><div>${escM(m.content).replace(/\n/g,'<br>')}</div>${imgs?`<div>${imgs}</div>`:''}</div>`;
    }).join('');
    root.scrollTop=root.scrollHeight;
  }
  function setupMasterChat(){
    const form=$m('#chatForm');if(!form)return;
    const clearConversation=()=>{
      masterMessages=[];
      const input=$m('#chatInput');if(input)input.value='';
      renderMasterMessages();
      if(input)input.focus();
    };
    const clearBtn=$m('#chatClearBtn');if(clearBtn)clearBtn.onclick=clearConversation;
    const newBtn=$m('#chatNewConversation');if(newBtn)newBtn.onclick=clearConversation;
    renderMasterMessages();
    form.onsubmit=async e=>{
      e.preventDefault();const input=$m('#chatInput'),text=input?.value.trim();if(!text)return;
      const connections=chatConnections(),scope=selectedChatScope();
      if(!connections.length){masterMessages.push({role:'assistant',content:'Todavía no tienes ninguna cuenta o programa conectado. Ve a “Conexiones”, conecta la herramienta donde están tus datos y después vuelve aquí.'});renderMasterMessages();return;}
      if(!scope){masterMessages.push({role:'assistant',content:'Elige arriba el agente de VentaNexIA con el que quieres trabajar.'});renderMasterMessages();return;}
      if(scope.connected===false&&!['prospecting'].includes(scope.key)){
        masterMessages.push({role:'assistant',content:'El agente '+scope.name.replace(/ · sin conectar$/,'')+' todavía no tiene conectada la cuenta o herramienta que necesita. Ve a “Conexiones”, conéctala y vuelve aquí.'});renderMasterMessages();return;
      }
      masterMessages.push({role:'user',content:text});input.value='';renderMasterMessages();
      const btn=e.submitter||form.querySelector('button');btn.disabled=true;btn.textContent='Mirándolo…';
      try{
        const payload=masterMessages.map(({role,content})=>({role,content}));
        const r=await window.vnx.sendChat(payload,scope);
        let reply=r.reply||'Sin respuesta';
        if(isProductCountQuestion(text)&&window.vnx.verifiedProductCount){
          try{
            const verified=await window.vnx.verifiedProductCount(text,scope&&scope.type==='portal'?{portalId:scope.id}:null);
            if(verified.status==='verified')reply=`${verified.name} tiene ${verified.count} productos según el portal conectado. Total verificado${verified.pagesScanned>1?` recorriendo ${verified.pagesScanned} páginas`:''}.`;
            else if(verified.status==='uncertain')reply=`He encontrado ${verified.visible||verified.rowsSeen||0} productos visibles, pero no puedo confirmar todavía que sea el total completo del catálogo. No voy a presentar ese número como total hasta verificar toda la paginación.`;
          }catch{}
        }
        const expired=(r.portalStatus||[]).filter(x=>x.status==='login_required');
        if(expired.length)reply+=`\n\n⚠️ La conexión con ${expired.map(x=>x.name).join(', ')} se ha cerrado. Vuelve a conectarla.`;
        masterMessages.push({role:'assistant',content:reply,images:r.images||[]});renderMasterMessages();
      }catch(err){masterMessages.push({role:'assistant',content:`No he podido conectar: ${err.message||err}`});renderMasterMessages()}
      finally{btn.disabled=false;btn.textContent='Enviar'}
    };
  }

  async function start(){
    await migrateLegacyPortals();
    setupMasterPortalUi();
    setupMasterChat();
    setupMasterCenter();
    await renderMasterPortals();
    refreshChatConnections();
    setInterval(()=>{if($m('#portalList')&&document.visibilityState==='visible')renderMasterPortals()},12000);
  }
  setTimeout(start,350);
})();
