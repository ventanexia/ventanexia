(()=>{
  const $m=s=>document.querySelector(s),$$m=s=>[...document.querySelectorAll(s)];
  const escM=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let masterPortals=[];
  let masterMessages=[];
  let runtimeConnections=[];
  let runtimeAgents=[];

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
  async function refreshRuntimeConnections(){
    try{runtimeConnections=await window.vnx.listConnections()||[]}catch{runtimeConnections=[]}
    try{runtimeAgents=await window.vnx.agentCatalog()||[]}catch{runtimeAgents=[]}
    return runtimeConnections;
  }
  function connectedDataSources(){
    const out=[];
    for(const p of masterPortals||[]){
      const url=String(p.url||p.lastUrl||'').toLowerCase();
      const shopifyAdmin=/^https:\/\/admin\.shopify\.com\//.test(url)||(/\.myshopify\.com\//.test(url)&&(/\/admin(?:\/|$)/.test(url)||/\/settings(?:\/|$)/.test(url)));
      if(!shopifyAdmin&&['read','write'].includes(p.mode))out.push({type:'portal',id:p.id,name:p.name,url:p.url});
    }
    const labels={email:'Email',whatsapp:'WhatsApp Business',social:'Redes sociales',prospecting:'Captación',crm:'CRM',shopify:'Shopify',wordpress:'WordPress / WooCommerce',github_vercel:'GitHub / Vercel'};
    for(const x of runtimeConnections||[]){
      const moduleKey=x.module||x.key;
      if(!moduleKey)continue;
      if(moduleKey==='shopify')out.push({type:'shopify',key:'shopify',connectionKey:x.key||'integration:shopify',name:'Shopify · '+(x.label||'Tienda'),shop:x.shop||x.label||null});
      else if(['email','whatsapp','social','crm'].includes(moduleKey))out.push({type:'integration',key:moduleKey,connectionKey:x.key||('integration:'+moduleKey),accountIndex:Number.isInteger(x.accountIndex)?x.accountIndex:null,name:(labels[moduleKey]||moduleKey)+' · '+(x.label||'Conectado')});
      else if(x.type==='folder')out.push({type:'folder',key:x.key||moduleKey,connectionKey:x.key||moduleKey,name:'Datos locales · '+(x.label||'Carpeta'),folder:x.path||x.folder||x.label});
    }
    const seen=new Set();
    return out.filter(x=>{
      const k=x.type==='portal'?'p:'+x.id:x.type==='integration'?'i:'+(x.connectionKey||x.key):x.type==='shopify'?'s:'+(x.connectionKey||x.shop):'f:'+(x.connectionKey||x.folder);
      if(seen.has(k))return false;seen.add(k);return true;
    });
  }
  function agentDisplayName(x){
    const base=(x.icon||'🤖')+' Agente '+(x.name||x.key||'');
    if(x.key==='email'&&x.accountLabel)return base+' · '+x.accountLabel;
    if(x.key==='email'&&x.source?.name)return base+' · '+String(x.source.name).replace(/^Email · /,'');
    return base;
  }
  function chatConnections(){
    const out=[];
    for(const agent of runtimeAgents||[]){
      if(agent.key==='email'&&agent.included){
        const emails=(runtimeConnections||[]).filter(x=>(x.module||x.key)==='email');
        if(emails.length){
          for(const x of emails){
            out.push({...agent,accountIndex:Number.isInteger(x.accountIndex)?x.accountIndex:null,accountLabel:x.label||'Cuenta de correo',source:{type:'integration',key:'email',name:'Email · '+(x.label||'Cuenta de correo'),accountIndex:Number.isInteger(x.accountIndex)?x.accountIndex:null}});
          }
          continue;
        }
      }
      out.push(agent);
    }
    return out;
  }
  function chatConnectionValue(x){
    if(!x?.key)return '';
    if(x.key==='email'&&Number.isInteger(x.accountIndex))return 'agent:email:'+x.accountIndex;
    return 'agent:'+x.key;
  }
  function agentStatusText(x){
    if(!x?.included)return '🔒 No incluido en tu plan';
    if(!x?.connected)return '🟠 Incluido · falta conectar';
    return '🟢 Listo para usar';
  }
  function renderHomeAgents(items){
    const root=$m('#homeAgentsList'),summary=$m('#homeAgentsSummary');if(!root)return;
    const ready=items.filter(x=>x.ready),pending=items.filter(x=>x.included&&!x.connected),locked=items.filter(x=>!x.included);
    if(summary)summary.textContent=ready.length+' listo'+(ready.length===1?'':'s')+' para usar · '+pending.length+' pendiente'+(pending.length===1?'':'s')+' de conectar'+(locked.length?' · '+locked.length+' no incluido'+(locked.length===1?'':'s')+' en el plan':'');
    root.innerHTML=items.map(x=>{
      const status=agentStatusText(x);
      const detail=!x.included
        ?'<small>Disponible contratando este agente o cambiando de plan.</small>'
        :!x.connected
          ?'<small>Conéctalo en “Conexiones” para poder usarlo con datos reales.</small>'
          :'<small>Preparado para trabajar.</small>';
      return '<article class="modulecard"><b>'+escM(agentDisplayName(x))+'</b><span><strong>'+status+'</strong><br>'+detail+'</span></article>';
    }).join('');
  }
  function updateAgentHint(chosen,hint){
    if(!hint)return;
    if(!chosen){hint.textContent='Elige el agente de VentaNexIA con el que quieres trabajar.';return}
    if(!chosen.included){hint.textContent='🔒 '+agentDisplayName(chosen)+' no está incluido en este plan. Puedes verlo, pero no conectarlo ni utilizarlo hasta contratarlo.';return}
    if(!chosen.connected){hint.textContent='🟠 '+agentDisplayName(chosen)+' está incluido, pero necesita una conexión. Ve a “Conexiones” para activarlo.';return}
    hint.textContent='🟢 '+agentDisplayName(chosen)+' está listo para usar.';
  }
  async function refreshChatConnections(){
    const sel=$m('#chatConnectionSelect'),hint=$m('#chatConnectionHint');if(!sel)return;
    await refreshRuntimeConnections();
    const items=chatConnections(),previous=sel.value,saved=localStorage.getItem('vnx_master_chat_agent')||'';
    sel.innerHTML='<option value="">Elige un agente…</option>'+items.map(x=>'<option value="'+escM(chatConnectionValue(x))+'">'+escM(agentDisplayName(x)+' — '+agentStatusText(x))+'</option>').join('');
    const values=[...sel.options].map(o=>o.value);
    if(previous&&values.includes(previous))sel.value=previous;
    else if(saved&&values.includes(saved))sel.value=saved;
    else if(items.some(x=>x.key==='email'&&x.ready))sel.value=chatConnectionValue(items.find(x=>x.key==='email'&&x.ready));
    else if(items.some(x=>x.ready))sel.value=chatConnectionValue(items.find(x=>x.ready));
    else sel.value='';
    if(sel.value)localStorage.setItem('vnx_master_chat_agent',sel.value);
    let activeAgentValue=sel.value;
    sel.onchange=()=>{
      const nextValue=sel.value;
      const input=$m('#chatInput');
      const hasCurrentWork=masterMessages.length>0||Boolean(input?.value?.trim());
      if(nextValue!==activeAgentValue&&hasCurrentWork){
        const ok=confirm('Vas a cambiar de agente. ¿Quieres cerrar el trabajo actual y eliminar esta conversación para empezar uno nuevo?');
        if(!ok){sel.value=activeAgentValue;return;}
        masterMessages=[];
        if(input)input.value='';
        renderMasterMessages();
      }
      activeAgentValue=nextValue;
      if(nextValue)localStorage.setItem('vnx_master_chat_agent',nextValue);
      const chosen=items.find(x=>chatConnectionValue(x)===nextValue);
      updateAgentHint(chosen,hint);
      if(nextValue&&input)setTimeout(()=>input.focus(),30);
    };
    updateAgentHint(items.find(x=>chatConnectionValue(x)===sel.value),hint);
    renderHomeAgents(items);
    if($m('#masterSourceSelect'))renderMasterCenterSources();
  }
  window.vnxRefreshAgentUi=refreshChatConnections;
  function selectedChatScope(){
    const sel=$m('#chatConnectionSelect'),items=chatConnections();if(!sel||!sel.value)return null;
    const item=items.find(x=>chatConnectionValue(x)===sel.value);if(!item)return null;
    return {type:'agent',key:item.key,name:agentDisplayName(item),included:item.included,connected:item.connected,ready:item.ready,source:item.source||null,accountIndex:Number.isInteger(item.accountIndex)?item.accountIndex:null};
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
    if(item.type==='integration')return {type:'integration',key:item.key,name:item.name,accountIndex:item.accountIndex,connectionKey:item.connectionKey};
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

  function openReplyEditor({meta,action}){
    return new Promise(resolve=>{
      const okLabel=action==='draft_reply'?'Crear borrador':action==='send_reply_cc'?'Enviar con copia':'Enviar respuesta';
      const subj=/^re:/i.test(meta.subject||'')?(meta.subject||''):'Re: '+(meta.subject||'');
      const overlay=document.createElement('div');
      overlay.id='vnxReplyOverlay';
      overlay.style.cssText='position:fixed;inset:0;background:rgba(2,11,19,.82);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
      overlay.innerHTML='<div style="width:min(720px,96vw);max-height:92vh;overflow:auto;background:#061c31;border:1px solid #2eb7ef;border-radius:16px;padding:20px;color:#fff">'
        +'<h3 style="margin:0 0 6px">'+escM(okLabel)+'</h3>'
        +'<div style="opacity:.8;font-size:13px;margin-bottom:12px">Para: '+escM(meta.from||'')+'<br>Asunto: '+escM(subj)+'</div>'
        +(action==='send_reply_cc'?'<label style="display:block;font-size:12px;margin-bottom:10px">Copia (CC)<input id="vnxReplyCc" type="email" style="width:100%;margin-top:4px;padding:10px;border-radius:8px;border:1px solid #286b93;background:#031522;color:#fff"></label>':'')
        +'<label style="display:block;font-size:12px">Texto de la respuesta<textarea id="vnxReplyBody" rows="10" style="width:100%;margin-top:4px;padding:10px;border-radius:8px;border:1px solid #286b93;background:#031522;color:#fff;font:inherit"></textarea></label>'
        +(meta.attachment?'<div style="margin-top:10px;font-size:13px">📎 Se adjuntará: <b>'+escM(meta.attachment.name)+'</b></div>':'')
        +'<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button type="button" id="vnxReplyCancel" class="mini">Cancelar</button><button type="button" id="vnxReplyOk" class="mini" style="background:#1d7dff;border-color:#1d7dff">'+escM(okLabel)+'</button></div></div>';
      document.body.appendChild(overlay);
      const ta=overlay.querySelector('#vnxReplyBody');ta.value=meta.defaultBody||'';ta.focus();
      const close=v=>{overlay.remove();resolve(v)};
      overlay.querySelector('#vnxReplyCancel').onclick=()=>close(null);
      overlay.onclick=e=>{if(e.target===overlay)close(null)};
      overlay.querySelector('#vnxReplyOk').onclick=()=>{
        const body=ta.value.trim();if(!body){ta.focus();return}
        let cc='';const ccEl=overlay.querySelector('#vnxReplyCc');
        if(ccEl){cc=ccEl.value.trim();if(!cc){ccEl.focus();return}}
        close({body,cc});
      };
    });
  }

  function renderMasterMessages(){
    const root=$m('#messages');if(!root)return;
    const intro='<div class="msg ai">Estoy listo para ayudarte. Elige arriba el agente de VentaNexIA con el que quieres trabajar. El agente utilizará únicamente las conexiones que tengas autorizadas.</div>';
    root.innerHTML=intro+masterMessages.map(m=>{
      const imgs=(m.images||[]).slice(0,6).map(img=>`<a href="${escM(img.src)}" target="_blank" rel="noreferrer"><img src="${escM(img.src)}" alt="${escM(img.alt||'Imagen')}" style="max-width:220px;max-height:180px;object-fit:contain;border-radius:10px;margin:8px 8px 0 0;background:#fff;border:1px solid #d8e2ea"></a>`).join('');
      const actions=m.emailActions?.options?.length?'<div class="row" style="flex-wrap:wrap;margin-top:10px;gap:8px">'+m.emailActions.options.map(a=>'<button class="mini email-action-btn" data-msg-id="'+escM(m.emailActions.messageId||'')+'" data-action="'+escM(a.key)+'">'+escM(a.label)+'</button>').join('')+'</div>':'';
      return `<div class="msg ${m.role==='user'?'user':'ai'}"><div>${escM(m.content).replace(/\n/g,'<br>')}</div>${imgs?`<div>${imgs}</div>`:''}${actions}</div>`;
    }).join('');
    $m('#messages')&&$$m('.email-action-btn').forEach(btn=>btn.onclick=async()=>{
      const msg=masterMessages.find(x=>x.emailActions?.messageId===btn.dataset.msgId);if(!msg)return;
      const meta=msg.emailActions,action=btn.dataset.action;
      const destructive=action==='trash'||action==='send_reply'||action==='send_reply_cc';
      let body='',cc='';
      if(['draft_reply','send_reply','send_reply_cc'].includes(action)){
        const edited=await openReplyEditor({meta,action});
        if(!edited)return;
        body=edited.body;cc=edited.cc||'';
      }
      if(destructive&&!confirm(action==='trash'?'¿Mover este correo a la papelera?':'¿Enviar esta respuesta ahora?'))return;
      const label=meta.options.find(x=>x.key===action)?.label||action;
      btn.disabled=true;btn.textContent='Procesando…';
      try{
        const out=await window.vnx.emailAction({account:meta.account,messageId:meta.messageId,threadId:meta.threadId,subject:meta.subject,from:meta.from,action,body,cc});
        masterMessages.push({role:'assistant',content:(out?.message||'Acción completada.')+'\n\nAcción: '+label});
        msg.emailActions=null;
        renderMasterMessages();
      }catch(e){
        masterMessages.push({role:'assistant',content:'No he podido completar la acción: '+(e.message||e)});
        renderMasterMessages();
      }
    });
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
      if(!scope){
        masterMessages.push({role:'assistant',content:'Elige arriba el agente de VentaNexIA con el que quieres trabajar.'});renderMasterMessages();return;
      }
      if(scope.included===false){
        masterMessages.push({role:'assistant',content:'Este agente aparece en tu equipo, pero no está incluido en tu plan actual. Para usarlo debes contratarlo o cambiar de plan.'});renderMasterMessages();return;
      }
      if(scope.connected===false){
        masterMessages.push({role:'assistant',content:'Este agente está incluido, pero todavía necesita conectar su herramienta o fuente de datos. Ve a “Conexiones”, actívala y vuelve aquí.'});renderMasterMessages();return;
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
        masterMessages.push({role:'assistant',content:reply,images:r.images||[],emailActions:r.emailActions||null});renderMasterMessages();
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
    await refreshChatConnections();
    setInterval(()=>{if($m('#portalList')&&document.visibilityState==='visible')renderMasterPortals()},12000);
  }
  setTimeout(start,350);
})();
