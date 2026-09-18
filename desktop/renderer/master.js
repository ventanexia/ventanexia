(()=>{
  const $m=s=>document.querySelector(s),$$m=s=>[...document.querySelectorAll(s)];
  const escM=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let masterPortals=[];
  let masterMessages=[];

  function statusLabel(p){
    if(p.lastStatus==='connected')return '🟢 Conectado';
    if(p.lastStatus==='login_required')return '🟠 Sesión caducada · volver a conectar';
    if(p.lastStatus==='error')return '🔴 Error de conexión';
    return '⚪ Sin conectar';
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
    root.innerHTML=masterPortals.length?masterPortals.map(p=>`<div class="listrow"><div><b>${escM(p.name)}</b><span>${escM(p.url)} · ${p.mode==='read'?'🔒 Solo lectura':'Lectura y escritura'} · ${statusLabel(p)}</span>${p.lastCheckedAt?`<small>Última comprobación: ${new Date(p.lastCheckedAt).toLocaleString('es-ES')}</small>`:''}</div><div class="row"><button class="mini master-portal-connect" data-id="${escM(p.id)}">${p.lastStatus==='connected'?'Abrir sesión':'Conectar'}</button><button class="mini master-portal-check" data-id="${escM(p.id)}">Comprobar</button><button class="mini master-portal-remove" data-id="${escM(p.id)}">Quitar</button></div></div>`).join(''):'<div class="empty">Todavía no hay portales configurados.</div>';
    $$m('.master-portal-connect').forEach(b=>b.onclick=async()=>{
      b.disabled=true;b.textContent='Abriendo…';
      try{await window.vnx.connectPortal(b.dataset.id);$m('#portalMsg').textContent='Se ha abierto una ventana segura de VentaNexIA. Inicia sesión ahí una sola vez; la sesión quedará guardada localmente en este ordenador.';}
      catch(e){$m('#portalMsg').textContent=e.message||'No se pudo abrir el portal'}
      finally{b.disabled=false;setTimeout(renderMasterPortals,1200)}
    });
    $$m('.master-portal-check').forEach(b=>b.onclick=async()=>{
      b.disabled=true;b.textContent='Comprobando…';
      try{const r=await window.vnx.checkPortal(b.dataset.id);$m('#portalMsg').textContent=r.status==='connected'?'Portal conectado correctamente. VentaNexIA ya puede consultarlo en modo lectura desde “Habla con tu equipo”.':'La sesión necesita volver a iniciarse.';}
      catch(e){$m('#portalMsg').textContent=e.message||'No se pudo comprobar el portal'}
      finally{b.disabled=false;b.textContent='Comprobar';await renderMasterPortals();refreshChatConnections()}
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
      if(msg)msg.textContent=mode==='read'?'Conexión guardada en SOLO LECTURA. VentaNexIA no realizará modificaciones automáticas.':'Conexión guardada.';
      await renderMasterPortals();refreshChatConnections();
      if(connectAfter){await window.vnx.connectPortal(p.id);if(msg)msg.textContent='Ventana segura abierta. Inicia sesión y, cuando vuelvas, pulsa “Comprobar”.';}
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
  function chatConnections(){
    const out=[];
    for(const p of masterPortals||[]){if(['read','write'].includes(p.mode))out.push({type:'portal',id:p.id,name:p.name,url:p.url});}
    const labels={email:'Email',whatsapp:'WhatsApp Business',social:'Redes sociales',prospecting:'Captación',crm:'CRM',shopify:'Shopify',wordpress:'WordPress / WooCommerce',github_vercel:'GitHub / Vercel'};
    const real=getRealSourcesForChat();
    for(const [key,v] of Object.entries(real)){
      if(key==='shopify'&&v&&v.status==='connected')out.push({type:'shopify',key:key,name:'Shopify · '+(v.shopName||v.shop||'Tienda'),shop:v.shop||null});
      else if(v&&v.url)out.push({type:'url',key:key,name:labels[key]||key,url:v.url});
      else if(v&&v.folder)out.push({type:'folder',key:key,name:labels[key]||key,folder:v.folder});
    }
    const seen=new Set();
    return out.filter(x=>{const k=x.type==='portal'?'p:'+x.id:x.type==='url'?'u:'+x.url:x.type==='shopify'?'s:'+x.shop:'f:'+x.folder;if(seen.has(k))return false;seen.add(k);return true;});
  }
  function refreshChatConnections(){
    const sel=$m('#chatConnectionSelect'),hint=$m('#chatConnectionHint');if(!sel)return;
    const items=chatConnections(),previous=sel.value;
    sel.innerHTML='<option value="">Selecciona una conexión…</option>'+items.map((x,i)=>'<option value="'+i+'">'+escM(x.name)+(x.url?' · '+escM((()=>{try{return new URL(x.url).hostname}catch{return x.url}})()):'')+'</option>').join('');
    if(previous!==''&&Number(previous)<items.length)sel.value=previous;
    if(items.length===1){sel.value='0';if(hint)hint.textContent='Conexión seleccionada: '+items[0].name;}
    else if(items.length>1){if(hint)hint.textContent='Tienes varias conexiones. Elige con cuál quieres trabajar antes de enviar la consulta.';}
    else if(hint)hint.textContent='Todavía no hay conexiones reales disponibles.';
  }
  function selectedChatScope(){
    const sel=$m('#chatConnectionSelect'),items=chatConnections();if(!sel||sel.value==='')return null;
    const item=items[Number(sel.value)];if(!item)return null;
    if(item.type==='portal')return {type:'portal',id:item.id,name:item.name};
    if(item.type==='url')return {type:'url',key:item.key,name:item.name,url:item.url};
    if(item.type==='folder')return {type:'folder',key:item.key,name:item.name,folder:item.folder};
    if(item.type==='shopify')return {type:'shopify',key:item.key,name:item.name,shop:item.shop};
    return null;
  }

  function renderMasterMessages(){
    const root=$m('#messages');if(!root)return;
    const intro='<div class="msg ai">Soy el asistente de VentaNexIA Master. Consulto tus carpetas autorizadas y los portales privados que hayas conectado. En los portales configurados como solo lectura nunca ejecuto modificaciones.</div>';
    root.innerHTML=intro+masterMessages.map(m=>{
      const imgs=(m.images||[]).slice(0,6).map(img=>`<a href="${escM(img.src)}" target="_blank" rel="noreferrer"><img src="${escM(img.src)}" alt="${escM(img.alt||'Imagen')}" style="max-width:220px;max-height:180px;object-fit:contain;border-radius:10px;margin:8px 8px 0 0;background:#fff;border:1px solid #d8e2ea"></a>`).join('');
      return `<div class="msg ${m.role==='user'?'user':'ai'}"><div>${escM(m.content).replace(/\n/g,'<br>')}</div>${imgs?`<div>${imgs}</div>`:''}</div>`;
    }).join('');
    root.scrollTop=root.scrollHeight;
  }
  function setupMasterChat(){
    const form=$m('#chatForm');if(!form)return;
    renderMasterMessages();
    form.onsubmit=async e=>{
      e.preventDefault();const input=$m('#chatInput'),text=input?.value.trim();if(!text)return;
      const connections=chatConnections(),scope=selectedChatScope();
      if(connections.length>1&&!scope){masterMessages.push({role:'assistant',content:'Tienes varias conexiones activas. Elige primero con cuál quieres trabajar: '+connections.map(x=>x.name).join(', ')+'.'});renderMasterMessages();return;}
      masterMessages.push({role:'user',content:text});input.value='';renderMasterMessages();
      const btn=e.submitter||form.querySelector('button');btn.disabled=true;btn.textContent='Consultando…';
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
        if(expired.length)reply+=`\n\n⚠️ La sesión de ${expired.map(x=>x.name).join(', ')} necesita volver a conectarse.`;
        masterMessages.push({role:'assistant',content:reply,images:r.images||[]});renderMasterMessages();
      }catch(err){masterMessages.push({role:'assistant',content:`Error de conexión: ${err.message||err}`});renderMasterMessages()}
      finally{btn.disabled=false;btn.textContent='Enviar'}
    };
  }

  async function start(){
    await migrateLegacyPortals();
    setupMasterPortalUi();
    setupMasterChat();
    await renderMasterPortals();
    refreshChatConnections();
    setInterval(()=>{if($m('#portalList')&&document.visibilityState==='visible')renderMasterPortals()},12000);
  }
  setTimeout(start,350);
})();
