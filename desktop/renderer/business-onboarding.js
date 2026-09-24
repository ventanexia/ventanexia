'use strict';
(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').trim();
  let state={profiles:[],activeProfileId:null,active:null,needsOnboarding:true};
  let menu=null,overlay=null,draft=[],step=1,connections=[];

  function activeProfile(){return state.active||state.profiles.find(x=>x.id===state.activeProfileId)||null}
  function activeName(){const p=activeProfile();return p?.tradeName||p?.legalName||'Empresa activa'}
  function updateHeader(){
    const name=$('#vnxAhCompanyName'),hidden=$('#homeCompanyName'),settings=$('#settingsActiveBusiness');
    if(name)name.textContent=activeName();
    if(hidden)hidden.textContent=activeName();
    if(settings)settings.textContent=state.profiles?.length?activeName():'Sin configurar';
  }
  async function refresh(){
    if(!window.vnx?.businessList)return state;
    const previousId=state.activeProfileId;
    state=await window.vnx.businessList();
    updateHeader();
    window.dispatchEvent(new CustomEvent('vnx-business-changed',{detail:{state,changed:Boolean(previousId&&previousId!==state.activeProfileId)}}));
    return state;
  }
  function closeMenu(){if(menu){menu.remove();menu=null}}
  function placeMenu(btn){
    if(!menu||!btn)return;
    const r=btn.getBoundingClientRect();
    menu.style.top=(r.bottom+7)+'px';
    menu.style.right=Math.max(10,window.innerWidth-r.right)+'px';
  }
  async function toggleCompanyMenu(){
    const btn=$('#vnxAhCompanyBtn');if(!btn)return;
    if(menu){closeMenu();return}
    await refresh().catch(()=>{});
    menu=document.createElement('div');menu.className='vnx-business-menu';
    const profiles=state.profiles||[],active=activeProfile();
    menu.innerHTML='<div class="vnx-business-menu-head"><div><b>Empresa activa</b><small>Carla y todos los agentes usarán este perfil para entender el negocio.</small></div><button type="button" data-business-close>×</button></div>'
      +'<div class="vnx-business-menu-list">'+(profiles.length?profiles.map(p=>'<button type="button" class="'+(p.id===active?.id?'active':'')+'" data-business-select="'+esc(p.id)+'"><span class="dot"></span><p><b>'+esc(p.tradeName||p.legalName)+'</b><small>'+esc(p.description||p.sectors||'Perfil de negocio')+'</small></p><i>✓</i></button>').join(''):'<div class="vnx-business-menu-empty">Todavía no has configurado ninguna empresa.</div>')+'</div>'
      +'<div class="vnx-business-menu-actions"><button type="button" data-business-add>＋ Añadir empresa</button><button type="button" data-business-manage>⚙ Gestionar perfiles</button></div>';
    document.body.appendChild(menu);placeMenu(btn);
    menu.querySelector('[data-business-close]').onclick=closeMenu;
    menu.querySelectorAll('[data-business-select]').forEach(b=>b.onclick=async()=>{
      try{state=await window.vnx.businessSetActive(b.dataset.businessSelect);updateHeader();closeMenu();window.dispatchEvent(new CustomEvent('vnx-business-changed',{detail:{state,changed:true}}))}
      catch(e){alert(e.message||e)}
    });
    menu.querySelector('[data-business-add]').onclick=()=>{closeMenu();openWizard({mode:'add'})};
    menu.querySelector('[data-business-manage]').onclick=()=>{closeMenu();openWizard({mode:'manage'})};
    const outside=e=>{if(menu&&!menu.contains(e.target)&&e.target!==btn&&!btn.contains(e.target)){closeMenu();document.removeEventListener('mousedown',outside,true)}};
    setTimeout(()=>document.addEventListener('mousedown',outside,true),0);
  }

  async function loadConnections(){
    const rows=[];
    try{
      for(const x of await window.vnx.listConnections()||[]){
        const module=String(x.module||x.key||'').trim(),label=String(x.label||x.account||x.shopName||x.shop||module||'Conexión').trim();
        const id=String(x.id||x.key||x.shop||x.account||label).trim();
        if(id)rows.push({ref:'connection:'+id,label,type:module||'conexión'});
      }
    }catch{}
    try{
      for(const p of await window.vnx.listPortals()||[]){
        if(!p?.id)continue;
        rows.push({ref:'portal:'+p.id,label:String(p.name||p.url||'Portal privado'),type:'portal'});
      }
    }catch{}
    const seen=new Set();return rows.filter(x=>{if(seen.has(x.ref))return false;seen.add(x.ref);return true});
  }
  function emptyProfile(){
    return {id:'',legalName:'',tradeName:'',description:'',sectors:'',productsServices:'',brands:'',businessModel:'B2B y B2C',targetCustomers:'',salesArea:'',salesChannels:'',website:'',phone:'',address:'',goals:'',notes:'',connectionRefs:[]};
  }
  function profileCopy(p){return {...emptyProfile(),...(p||{}),connectionRefs:[...(p?.connectionRefs||[])]}}
  function setDraftCount(n){
    n=Math.max(1,Math.min(20,Number(n)||1));
    while(draft.length<n)draft.push(emptyProfile());
    if(draft.length>n)draft=draft.slice(0,n);
  }
  function modalShell(){
    overlay=document.createElement('div');overlay.className='vnx-business-overlay';
    overlay.innerHTML='<div class="vnx-business-modal"><div class="vnx-business-modal-head"><div><span>CONFIGURACIÓN DEL NEGOCIO</span><h2>Adapta VentaNexIA a tu empresa</h2><p>Cuanto mejor conozca Carla tu negocio, más precisas serán la captación, los correos, el marketing, los informes y las recomendaciones.</p></div><button type="button" data-business-modal-close>×</button></div><div class="vnx-business-progress" id="vnxBusinessProgress"></div><div class="vnx-business-body" id="vnxBusinessBody"></div><div class="vnx-business-footer"><button type="button" class="btn outline" id="vnxBusinessBack">← Atrás</button><span id="vnxBusinessStatus"></span><button type="button" class="btn primary" id="vnxBusinessNext">Continuar →</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-business-modal-close]').onclick=()=>closeWizard();
    overlay.onclick=e=>{if(e.target===overlay&&state.profiles.length)closeWizard()};
    $('#vnxBusinessBack').onclick=()=>{if(step>1){captureStep();step--;renderStep()}};
    $('#vnxBusinessNext').onclick=nextStep;
  }
  function closeWizard(){if(overlay){overlay.remove();overlay=null}}
  function progress(){
    const labels=['Empresas','Negocio','Clientes y mercado','Objetivos y conexiones','Revisar'];
    return labels.map((x,i)=>'<span class="'+(i+1===step?'active':i+1<step?'done':'')+'"><i>'+(i+1<step?'✓':i+1)+'</i>'+x+'</span>').join('');
  }
  function field(label,key,value='',opts={}){
    const type=opts.type||'input',ph=opts.placeholder||'',help=opts.help||'';
    if(type==='textarea')return '<label class="'+(opts.wide?'wide':'')+'"><span>'+esc(label)+'</span><textarea data-biz-field="'+esc(key)+'" rows="'+(opts.rows||3)+'" placeholder="'+esc(ph)+'">'+esc(value)+'</textarea>'+(help?'<small>'+esc(help)+'</small>':'')+'</label>';
    if(type==='select')return '<label class="'+(opts.wide?'wide':'')+'"><span>'+esc(label)+'</span><select data-biz-field="'+esc(key)+'">'+(opts.options||[]).map(o=>'<option'+(String(o)===String(value)?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select>'+(help?'<small>'+esc(help)+'</small>':'')+'</label>';
    return '<label class="'+(opts.wide?'wide':'')+'"><span>'+esc(label)+'</span><input data-biz-field="'+esc(key)+'" value="'+esc(value)+'" placeholder="'+esc(ph)+'" '+(opts.inputType?'type="'+esc(opts.inputType)+'"':'')+'>'+(help?'<small>'+esc(help)+'</small>':'')+'</label>';
  }
  function cardHeader(p,i){return '<div class="vnx-business-card-title"><span>'+(i+1)+'</span><div><b>'+esc(p.tradeName||p.legalName||('Empresa '+(i+1)))+'</b><small>Perfil independiente · no se mezclarán sus datos con otra empresa.</small></div></div>'}
  function renderStep(){
    if(!overlay)return;
    $('#vnxBusinessProgress').innerHTML=progress();
    const body=$('#vnxBusinessBody'),back=$('#vnxBusinessBack'),next=$('#vnxBusinessNext'),status=$('#vnxBusinessStatus');
    back.style.visibility=step===1?'hidden':'visible';status.textContent='';
    next.textContent=step===5?'Guardar configuración':'Continuar →';
    if(step===1){
      body.innerHTML='<div class="vnx-business-intro"><div class="vnx-business-intro-icon">🏢</div><h3>¿Cuántas empresas vas a gestionar?</h3><p>Cada empresa tendrá su propio perfil, clientes objetivo, productos, marcas, objetivos y conexiones. VentaNexIA utilizará únicamente la empresa activa.</p><label class="vnx-business-count"><span>Número de empresas</span><input id="vnxBusinessCount" type="number" min="1" max="20" value="'+draft.length+'"></label><div class="vnx-business-info">Puedes añadir o eliminar empresas más adelante desde <b>Empresa activa → Gestionar perfiles</b>.</div></div>';
      $('#vnxBusinessCount').oninput=e=>setDraftCount(e.target.value);
    }else if(step===2){
      body.innerHTML='<div class="vnx-business-step-copy"><h3>Cuéntale a VentaNexIA qué hace cada empresa</h3><p>No uses categorías cerradas. Describe el negocio con tus propias palabras.</p></div><div class="vnx-business-cards">'+draft.map((p,i)=>'<section class="vnx-business-card" data-biz-index="'+i+'>'+cardHeader(p,i)+'<div class="vnx-business-form">'+field('Nombre o razón social','legalName',p.legalName,{placeholder:'Ej.: Empresa Ejemplo S.L.'})+field('Nombre comercial','tradeName',p.tradeName,{placeholder:'Ej.: Mi Marca'})+field('¿A qué se dedica?','description',p.description,{type:'textarea',wide:true,rows:3,placeholder:'Describe en lenguaje normal qué hace la empresa y qué problema resuelve.'})+field('Productos o servicios principales','productsServices',p.productsServices,{type:'textarea',wide:true,placeholder:'Ej.: mobiliario clínico, camillas, carros hospitalarios…'})+field('Marcas propias o distribuidas','brands',p.brands,{wide:true,placeholder:'Escribe varias separadas por comas. Déjalo vacío si no aplica.'})+field('Web','website',p.website,{placeholder:'https://...'})+field('Teléfono','phone',p.phone,{placeholder:'Opcional'})+'</div></section>').join('')+'</div>';
    }else if(step===3){
      body.innerHTML='<div class="vnx-business-step-copy"><h3>¿A quién vende y en qué mercado?</h3><p>Esta parte es especialmente importante para que la IA busque clientes adecuados y no aplique sectores genéricos.</p></div><div class="vnx-business-cards">'+draft.map((p,i)=>'<section class="vnx-business-card" data-biz-index="'+i+'>'+cardHeader(p,i)+'<div class="vnx-business-form">'+field('Sectores en los que trabaja','sectors',p.sectors,{wide:true,placeholder:'Ej.: sanidad privada, distribución farmacéutica, construcción…',help:'Son los mercados donde opera la empresa, no una lista cerrada.'})+field('Modelo comercial','businessModel',p.businessModel,{type:'select',options:['B2B','B2C','B2B y B2C','Administración pública / licitaciones','Otro']})+field('Tipos de cliente objetivo','targetCustomers',p.targetCustomers,{type:'textarea',wide:true,rows:3,placeholder:'Ej.: hospitales, clínicas, geriátricos, farmacias, herbolarios…',help:'Escribe varios separados por comas. Puedes pedir a la IA que sugiera opciones y después confirmarlas.'})+'<div class="vnx-business-ai-row wide"><button type="button" data-biz-suggest="'+i+'">✦ Sugerir clientes objetivo con IA</button><small>La IA solo propondrá candidatos; tú decides cuáles son correctos.</small></div>'+field('Zona donde vende','salesArea',p.salesArea,{placeholder:'Ej.: España, Cataluña, Europa…'})+field('Canales de venta','salesChannels',p.salesChannels,{placeholder:'Ej.: comerciales, ecommerce, distribuidores, marketplaces…'})+'</div></section>').join('')+'</div>';
      $$('[data-biz-suggest]').forEach(b=>b.onclick=()=>suggestTargets(Number(b.dataset.bizSuggest),b));
    }else if(step===4){
      body.innerHTML='<div class="vnx-business-step-copy"><h3>¿Qué quieres conseguir y qué datos pertenecen a cada empresa?</h3><p>Las conexiones son opcionales ahora; puedes conectarlas después. Asociarlas evita mezclar negocios.</p></div><div class="vnx-business-cards">'+draft.map((p,i)=>'<section class="vnx-business-card" data-biz-index="'+i+'>'+cardHeader(p,i)+'<div class="vnx-business-form">'+field('Objetivos principales','goals',p.goals,{type:'textarea',wide:true,placeholder:'Ej.: captar clientes, controlar stock, gestionar pedidos, mejorar seguimiento comercial…'})+field('Dirección / zona base','address',p.address,{wide:true,placeholder:'Opcional'})+field('Información adicional útil para la IA','notes',p.notes,{type:'textarea',wide:true,placeholder:'Ej.: trabajamos solo con profesionales, no hacemos venta minorista, condiciones especiales…'})+'<div class="vnx-business-connections wide"><span>Conexiones asociadas a esta empresa</span><div>'+(connections.length?connections.map(c=>'<label><input type="checkbox" data-biz-connection="'+i+'" value="'+esc(c.ref)+'" '+((p.connectionRefs||[]).includes(c.ref)?'checked':'')+'><i></i><p><b>'+esc(c.label)+'</b><small>'+esc(c.type)+'</small></p></label>').join(''):'<small class="empty">Aún no hay conexiones. Podrás asociarlas después.</small>')+'</div></div></div></section>').join('')+'</div>';
    }else{
      const complete=draft.filter(p=>clean(p.tradeName||p.legalName)).length;
      body.innerHTML='<div class="vnx-business-review"><h3>Revisa la configuración</h3><p>VentaNexIA guardará estos perfiles de forma local y los utilizará como contexto de negocio. No sustituye a los datos reales de tus conexiones.</p><div class="vnx-business-review-grid">'+draft.map((p,i)=>'<article><span>Empresa '+(i+1)+'</span><h4>'+esc(p.tradeName||p.legalName||'Sin nombre')+'</h4><p>'+esc(p.description||'Sin descripción')+'</p><dl><dt>Vende</dt><dd>'+esc(p.productsServices||'—')+'</dd><dt>Clientes objetivo</dt><dd>'+esc(p.targetCustomers||'—')+'</dd><dt>Mercado</dt><dd>'+esc(p.sectors||'—')+'</dd><dt>Modelo</dt><dd>'+esc(p.businessModel||'—')+'</dd><dt>Conexiones</dt><dd>'+Number((p.connectionRefs||[]).length)+'</dd></dl></article>').join('')+'</div><div class="vnx-business-review-note"><b>'+complete+' de '+draft.length+' empresas con nombre.</b> Después podrás cambiar la empresa activa desde la barra superior.</div></div>';
    }
  }
  function captureStep(){
    if(!overlay)return;
    $$('.vnx-business-card[data-biz-index]').forEach(card=>{
      const i=Number(card.dataset.bizIndex),p=draft[i];if(!p)return;
      $$('[data-biz-field]',card).forEach(el=>p[el.dataset.bizField]=clean(el.value));
      p.connectionRefs=$$('[data-biz-connection="'+i+'"]:checked',card).map(x=>x.value);
    });
  }
  function validateStep(){
    captureStep();
    if(step===2){
      const missing=draft.findIndex(p=>!clean(p.tradeName||p.legalName));
      if(missing>=0){alert('Indica al menos el nombre de la empresa '+(missing+1)+'.');return false}
    }
    return true;
  }
  async function suggestTargets(index,btn){
    captureStep();const p=draft[index];if(!p)return;
    const old=btn.textContent;btn.disabled=true;btn.textContent='Pensando…';
    try{
      const r=await window.vnx.businessSuggestTargets(p);
      if(r?.suggestions?.length){p.targetCustomers=r.suggestions.join(', ');const card=$('.vnx-business-card[data-biz-index="'+index+'"]');const ta=card?.querySelector('[data-biz-field="targetCustomers"]');if(ta)ta.value=p.targetCustomers}
      else alert('No he encontrado sugerencias suficientes. Escríbelas manualmente.');
    }catch(e){alert(e.message||e)}
    finally{btn.disabled=false;btn.textContent=old}
  }
  async function nextStep(){
    if(!validateStep())return;
    if(step<5){step++;renderStep();return}
    const btn=$('#vnxBusinessNext'),status=$('#vnxBusinessStatus');btn.disabled=true;status.textContent='Guardando…';
    try{
      const activeId=state.activeProfileId&&draft.some(x=>x.id===state.activeProfileId)?state.activeProfileId:(draft[0]?.id||null);
      state=await window.vnx.businessSaveAll({profiles:draft,activeProfileId:activeId});
      updateHeader();closeWizard();window.dispatchEvent(new CustomEvent('vnx-business-changed',{detail:{state,changed:false}}));
    }catch(e){status.textContent='';alert(e.message||e)}
    finally{if(btn)btn.disabled=false}
  }
  async function openWizard({mode='manage'}={}){
    closeMenu();if(overlay)return;
    await refresh().catch(()=>{});
    connections=await loadConnections();
    draft=(state.profiles||[]).map(profileCopy);
    if(mode==='add')draft.push(emptyProfile());
    if(!draft.length)draft=[emptyProfile()];
    step=state.profiles.length&&mode!=='first'?2:1;
    modalShell();renderStep();
  }

  async function init(){
    if(!window.vnx?.businessList)return;
    try{await refresh()}catch{}
    const btn=$('#vnxAhCompanyBtn');
    if(btn){
      btn.title='Empresa activa';
      btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();toggleCompanyMenu()},true);
    }
    const manage=$('#manageBusinessProfilesBtn');if(manage)manage.onclick=()=>openWizard({mode:'manage'});
    window.addEventListener('vnx-open-business-onboarding',()=>openWizard({mode:'manage'}));
    if(state.needsOnboarding)setTimeout(()=>openWizard({mode:'first'}),450);
  }

  window.vnxBusiness={refresh,activeProfile,activeName,toggleCompanyMenu,open:openWizard,get state(){return state}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
